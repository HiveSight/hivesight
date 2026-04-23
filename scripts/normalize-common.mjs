import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, "..");

export function readInputText(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  if (inputPath.toLowerCase().endsWith(".zip")) {
    try {
      return execFileSync("unzip", ["-p", inputPath], {
        cwd: rootDir,
        maxBuffer: 1024 * 1024 * 256,
        encoding: "utf8",
      });
    } catch (error) {
      throw new Error(
        `Failed to extract CSV from zip input ${inputPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return fs.readFileSync(inputPath, "utf8");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      const next = text[index + 1];
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      field = "";

      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function buildObjectsFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const [header, ...records] = rows;

  if (!header || header.length === 0) {
    throw new Error("Input CSV did not contain a header row.");
  }

  return records.map((record, rowIndex) => {
    const row = {};
    header.forEach((column, columnIndex) => {
      row[column] = record[columnIndex] ?? "";
    });
    row.__rowIndex = rowIndex + 2;
    return row;
  });
}

export function parseNumber(value) {
  if (value === "" || value == null) {
    return null;
  }

  const normalized = String(value).replace(/[$,]/g, "").trim();
  if (normalized === "") {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createAgeBandMapper(executionSpec) {
  const bins = executionSpec.analysisPlan.confirmatorySliceDefinitions.age_band.bins;

  return function mapAgeBand(age) {
    if (!Number.isFinite(age)) {
      return null;
    }

    const match = bins.find((bin) => {
      if (bin.maxInclusive == null) {
        return age >= bin.minInclusive;
      }
      return age >= bin.minInclusive && age <= bin.maxInclusive;
    });

    return match?.label ?? null;
  };
}

export function createIncomeBandMapper(executionSpec) {
  const bins =
    executionSpec.analysisPlan.confirmatorySliceDefinitions.income_band.bins;

  return function mapIncomeBand(currentDollarIncome) {
    if (!Number.isFinite(currentDollarIncome) || currentDollarIncome < 0) {
      return null;
    }

    const match = bins.find((bin) => {
      if (bin.maxInclusive == null) {
        return currentDollarIncome >= bin.minInclusive;
      }
      return (
        currentDollarIncome >= bin.minInclusive &&
        currentDollarIncome <= bin.maxInclusive
      );
    });

    return match?.label ?? null;
  };
}
