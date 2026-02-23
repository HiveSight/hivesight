"use client";

import * as React from "react";

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
}

export function Progress({ value, max = 100, className = "" }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={`relative h-3 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/20 ${className}`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
