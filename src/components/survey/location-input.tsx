"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import type { LocationFilter } from "@/types";
import { MapPin } from "lucide-react";

// US states for quick matching
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

interface LocationInputProps {
  value: LocationFilter | null;
  onSelect: (location: LocationFilter) => void;
  placeholder?: string;
}

type LocationType = "zip" | "state" | "district" | "national";

interface LocationOption {
  type: LocationType;
  id: string;
  label: string;
}

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  zip: "ZIP code",
  state: "State",
  district: "Congressional district",
  national: "National",
};

export function LocationInput({
  value,
  onSelect,
  placeholder = "ZIP code, state, or district (e.g., 10001, NY, NY-17)",
}: LocationInputProps) {
  const [input, setInput] = useState(value?.label ?? "");
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const parseInput = useCallback((text: string): LocationOption[] => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const results: LocationOption[] = [];

    // "US" or "national" -> national
    if (
      trimmed.toLowerCase() === "us" ||
      trimmed.toLowerCase() === "national" ||
      trimmed.toLowerCase() === "united states"
    ) {
      results.push({
        type: "national",
        id: "US",
        label: "United States (national)",
      });
    }

    // 5 digits -> ZIP code
    if (/^\d{5}$/.test(trimmed)) {
      results.push({
        type: "zip",
        id: trimmed,
        label: `ZIP ${trimmed}`,
      });
    }

    // 2 uppercase letters -> state abbreviation
    const upper = trimmed.toUpperCase();
    if (upper.length === 2 && US_STATES[upper]) {
      results.push({
        type: "state",
        id: upper,
        label: `${US_STATES[upper]} (${upper})`,
      });
    }

    // "XX-NN" pattern -> congressional district
    const districtMatch = trimmed.match(/^([A-Z]{2})-(\d{1,2})$/i);
    if (districtMatch) {
      const state = districtMatch[1].toUpperCase();
      const num = parseInt(districtMatch[2], 10);
      if (US_STATES[state]) {
        results.push({
          type: "district",
          id: `${state}-${num}`,
          label: `${state}-${num} (${US_STATES[state]} District ${num})`,
        });
      }
    }

    // Partial match against state names
    if (trimmed.length >= 2 && !/^\d+$/.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      for (const [abbrev, name] of Object.entries(US_STATES)) {
        if (
          name.toLowerCase().includes(lower) ||
          abbrev.toLowerCase().includes(lower)
        ) {
          const existing = results.find(
            (r) => r.type === "state" && r.id === abbrev
          );
          if (!existing) {
            results.push({
              type: "state",
              id: abbrev,
              label: `${name} (${abbrev})`,
            });
          }
        }
      }
    }

    return results.slice(0, 8);
  }, []);

  useEffect(() => {
    const parsed = parseInput(input);
    setOptions(parsed);
    setHighlightIndex(0);
    setIsOpen(parsed.length > 0 && input.length > 0);
  }, [input, parseInput]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectOption = (option: LocationOption) => {
    setInput(option.label);
    setIsOpen(false);
    onSelect({
      type: option.type,
      value: option.id,
      label: option.label,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[highlightIndex]) {
        selectOption(options[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          // Clear selection when user edits
          if (value) {
            onSelect(null as unknown as LocationFilter);
          }
        }}
        onFocus={() => {
          if (options.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full"
      />

      {isOpen && options.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1.5 w-full bg-card border border-amber-900/[0.06] rounded-xl shadow-warm-lg max-h-60 overflow-auto animate-slide-down dark:border-amber-100/[0.06]"
        >
          {options.map((option, i) => (
            <button
              key={`${option.type}-${option.id}`}
              onClick={() => selectOption(option)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl ${
                i === highlightIndex ? "bg-amber-50 dark:bg-amber-950/20" : "hover:bg-amber-50/50 dark:hover:bg-amber-950/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="font-medium">{option.label}</span>
                <span className="ml-auto text-xs text-muted-foreground/70">
                  {LOCATION_TYPE_LABELS[option.type]}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
