import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildObjectsFromCsv,
  createAgeBandMapper,
  createIncomeBandMapper,
  parseNumber,
  readInputText,
  rootDir,
} from "./normalize-common.mjs";

const executionSpecPath = path.join(
  rootDir,
  "src/lib/benchmarks/data/execution-spec-v1.json"
);
const manifestPath = path.join(
  rootDir,
  "src/lib/benchmarks/data/manifests/gss-2024-evergreen.json"
);
const defaultOutputPath = path.join(rootDir, ".benchmarks/input/gss-2024.json");

const executionSpec = JSON.parse(fs.readFileSync(executionSpecPath, "utf8"));
const gssManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const mapAgeBand = createAgeBandMapper(executionSpec);
const mapIncomeBand = createIncomeBandMapper(executionSpec);

// CONINC is family income in constant 1986 dollars per the GSS codebook.
// Default multiplier uses CPI-U annual averages: 313.689 (2024) / 109.60 (1986).
// Override with --income-multiplier if the export uses a different base year.
const DEFAULT_CONINC_CPI_MULTIPLIER = 2.862;

const WEIGHT_VARIABLE_CANDIDATES = ["WTSSPS", "wtssps", "WTSS", "wtss", "WTSSALL"];
const ID_VARIABLE_CANDIDATES = ["ID_", "ID", "id", "id_"];
const CONINC_VARIABLE_CANDIDATES = ["CONINC", "coninc"];
const INCOME_CURRENT_DOLLAR_CANDIDATES = [
  "INCOME_2024",
  "income_2024",
  "income_current_dollars",
];

const AGE_VARIABLE_CANDIDATES = ["AGE", "age"];
const SEX_VARIABLE_CANDIDATES = ["SEX", "sex"];
const RACECEN1_VARIABLE_CANDIDATES = ["RACECEN1", "racecen1"];
const RACE_VARIABLE_CANDIDATES = ["RACE", "race"];
const HISPANIC_VARIABLE_CANDIDATES = ["HISPANIC", "hispanic"];
const DWELOWN_VARIABLE_CANDIDATES = ["DWELOWN", "dwelown"];
const DEGREE_VARIABLE_CANDIDATES = ["DEGREE", "degree"];
const CHILDS_VARIABLE_CANDIDATES = ["CHILDS", "childs"];
const REGION_VARIABLE_CANDIDATES = ["REGION", "region"];

const TRUST_VARIABLE_CANDIDATES = ["TRUST", "trust"];
const HELPFUL_VARIABLE_CANDIDATES = ["HELPFUL", "helpful"];
const FAIR_VARIABLE_CANDIDATES = ["FAIR", "fair"];
const EQWLTH_VARIABLE_CANDIDATES = ["EQWLTH", "eqwlth"];

const SEX_CODE_LABELS = {
  1: "Male",
  2: "Female",
};

const DWELOWN_CODE_LABELS = {
  1: "homeowner",
  2: "renter",
  3: "other",
};

const DEGREE_CODE_LABELS = {
  0: "no_high_school",
  1: "high_school",
  2: "associate",
  3: "bachelor",
  4: "graduate",
};

// Census divisions used in GSS REGION.
const REGION_CODE_LABELS = {
  1: "New England",
  2: "Middle Atlantic",
  3: "East North Central",
  4: "West North Central",
  5: "South Atlantic",
  6: "East South Central",
  7: "West South Central",
  8: "Mountain",
  9: "Pacific",
};

function usage() {
  return [
    "Usage: node scripts/normalize-gss-2024.mjs --input <gss2024.csv|zip>",
    "                                            [--out <path>]",
    "                                            [--income-multiplier <ratio>]",
    "",
    "Normalizes a GSS 2024 CSV export into the benchmark row format expected by",
    `${path.relative(rootDir, manifestPath)}.`,
    "",
    "The CSV must use numeric GSS codes (as produced by the GSS Data Explorer or",
    "an SDA CSV export). CONINC is expected in constant 1986 dollars and will be",
    `converted to current dollars using a default multiplier of ${DEFAULT_CONINC_CPI_MULTIPLIER}.`,
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    input: null,
    out: defaultOutputPath,
    incomeMultiplier: DEFAULT_CONINC_CPI_MULTIPLIER,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--out" && argv[index + 1]) {
      args.out = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--income-multiplier" && argv[index + 1]) {
      const raw = Number(argv[index + 1]);
      if (!Number.isFinite(raw) || raw <= 0) {
        throw new Error(
          `--income-multiplier must be a positive number, got "${argv[index + 1]}".`
        );
      }
      args.incomeMultiplier = raw;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  if (!args.input) {
    throw new Error("Missing required --input argument.");
  }

  return args;
}

function pickField(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return null;
}

function pickFieldWithKey(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== "") {
      return { key, value: row[key] };
    }
  }
  return null;
}

function pickNumber(row, candidates) {
  return parseNumber(pickField(row, candidates));
}

function mapTernaryPositive(value) {
  const code = parseNumber(value);
  if (code === 1) return 1;
  if (code === 2) return 0;
  // 3 = "Depends" is excluded from the binary positive share per the PAP.
  // 0/8/9 = NAP/DK/NA are also treated as null.
  return null;
}

function mapSevenPointRedistribution(value) {
  const code = parseNumber(value);
  if (code == null || code < 1 || code > 7) {
    return null;
  }
  // EQWLTH: 1 = "govt should reduce differences", 7 = "govt should not concern itself".
  // PAP specifies higher => more support for redistribution, so invert.
  return (7 - code) / 6;
}

function mapRaceEthnicity(hispanicRaw, raceRaw, raceSource) {
  const hispanic = parseNumber(hispanicRaw);
  const race = parseNumber(raceRaw);

  if (hispanic == null) {
    return null;
  }

  if (hispanic >= 2 && hispanic <= 11) {
    return "Hispanic";
  }

  if (hispanic !== 1) {
    return null;
  }

  if (raceSource === "RACE") {
    if (race === 1) return "White, Non-Hispanic";
    if (race === 2) return "Black, Non-Hispanic";
    if (race === 3) return "Other, Non-Hispanic";
    return null;
  }

  if (race === 1) return "White, Non-Hispanic";
  if (race === 2) return "Black, Non-Hispanic";
  if (race === 3) return "AIAN, Non-Hispanic";
  if (race != null && race >= 4 && race <= 10) return "Asian, Non-Hispanic";
  if (race === 11) return "NHPI, Non-Hispanic";
  if (race != null && race >= 12 && race <= 16) return "Other, Non-Hispanic";
  return null;
}

function mapSex(value) {
  const code = parseNumber(value);
  return code != null ? SEX_CODE_LABELS[code] ?? null : null;
}

function mapTenureType(value) {
  const code = parseNumber(value);
  return code != null ? DWELOWN_CODE_LABELS[code] ?? null : null;
}

function mapEducation(value) {
  const code = parseNumber(value);
  return code != null ? DEGREE_CODE_LABELS[code] ?? null : null;
}

function mapChildrenFlag(value) {
  const code = parseNumber(value);
  if (code == null || code < 0 || code > 8) {
    return null;
  }
  return code > 0 ? "has_children" : "no_children";
}

function mapRegion(value) {
  const code = parseNumber(value);
  return code != null ? REGION_CODE_LABELS[code] ?? null : null;
}

function resolveIncomeCurrentDollars(row, incomeMultiplier) {
  const explicitCurrent = pickNumber(row, INCOME_CURRENT_DOLLAR_CANDIDATES);
  if (explicitCurrent != null && explicitCurrent >= 0) {
    return {
      currentDollars: explicitCurrent,
      source: "explicit_current_dollars",
    };
  }

  const coninc = pickNumber(row, CONINC_VARIABLE_CANDIDATES);
  if (coninc == null || coninc < 0) {
    return { currentDollars: null, source: null };
  }

  return {
    currentDollars: coninc * incomeMultiplier,
    source: "CONINC_converted",
  };
}

function normalizeRow(row, incomeMultiplier) {
  const ageRaw = pickField(row, AGE_VARIABLE_CANDIDATES);
  const age = parseNumber(ageRaw);
  const isValidAge = age != null && age >= 18 && age <= 97;
  const ageBand = isValidAge ? mapAgeBand(age) : null;

  const { currentDollars: incomeCurrentDollars, source: incomeSource } =
    resolveIncomeCurrentDollars(row, incomeMultiplier);
  const incomeBand =
    incomeCurrentDollars != null ? mapIncomeBand(incomeCurrentDollars) : null;

  const hispanicRaw = pickField(row, HISPANIC_VARIABLE_CANDIDATES);
  const raceField =
    pickFieldWithKey(row, RACECEN1_VARIABLE_CANDIDATES) ??
    pickFieldWithKey(row, RACE_VARIABLE_CANDIDATES);
  const raceRaw = raceField?.value ?? null;
  const raceSource =
    raceField?.key.toUpperCase() === "RACE" ? "RACE" : raceField ? "RACECEN1" : null;
  const sexRaw = pickField(row, SEX_VARIABLE_CANDIDATES);
  const tenureRaw = pickField(row, DWELOWN_VARIABLE_CANDIDATES);
  const degreeRaw = pickField(row, DEGREE_VARIABLE_CANDIDATES);
  const childsRaw = pickField(row, CHILDS_VARIABLE_CANDIDATES);
  const regionRaw = pickField(row, REGION_VARIABLE_CANDIDATES);

  const trustRaw = pickField(row, TRUST_VARIABLE_CANDIDATES);
  const helpfulRaw = pickField(row, HELPFUL_VARIABLE_CANDIDATES);
  const fairRaw = pickField(row, FAIR_VARIABLE_CANDIDATES);
  const eqwlthRaw = pickField(row, EQWLTH_VARIABLE_CANDIDATES);

  return {
    respondentId: pickField(row, ID_VARIABLE_CANDIDATES),
    weight: pickNumber(row, WEIGHT_VARIABLE_CANDIDATES),
    slices: {
      overall: "overall",
      age_band: ageBand,
      income_band: incomeBand,
      sex: mapSex(sexRaw),
      race_ethnicity: mapRaceEthnicity(hispanicRaw, raceRaw, raceSource),
      tenure_type: mapTenureType(tenureRaw),
      education_proxy: mapEducation(degreeRaw),
      children_flag: mapChildrenFlag(childsRaw),
      region: mapRegion(regionRaw),
    },
    benchmarkFields: {
      trust_general: mapTernaryPositive(trustRaw),
      helpfulness_general: mapTernaryPositive(helpfulRaw),
      fairness_general: mapTernaryPositive(fairRaw),
      redistribution_support: mapSevenPointRedistribution(eqwlthRaw),
    },
    rawFields: {
      TRUST: parseNumber(trustRaw),
      HELPFUL: parseNumber(helpfulRaw),
      FAIR: parseNumber(fairRaw),
      EQWLTH: parseNumber(eqwlthRaw),
      AGE: isValidAge ? age : null,
      CONINC_constant_1986_dollars: pickNumber(row, CONINC_VARIABLE_CANDIDATES),
      income_current_dollars: incomeCurrentDollars,
      income_source: incomeSource,
      race_source: raceSource,
    },
  };
}

export function normalizeGssCsvText(
  csvText,
  inputPath = "inline.csv",
  { incomeMultiplier = DEFAULT_CONINC_CPI_MULTIPLIER } = {}
) {
  const sourceRows = buildObjectsFromCsv(csvText);
  const rows = sourceRows.map((row) => normalizeRow(row, incomeMultiplier));

  return {
    version: 1,
    datasetId: gssManifest.datasetId,
    datasetLabel: gssManifest.datasetLabel,
    generatedAt: new Date().toISOString(),
    source: {
      inputPath,
      rowCount: rows.length,
    },
    normalization: {
      confirmatorySliceFamilies: executionSpec.analysisPlan.confirmatorySliceFamilies,
      confirmatorySliceDefinitions:
        executionSpec.analysisPlan.confirmatorySliceDefinitions,
      incomeMultiplier,
      incomeMultiplierNote:
        "CONINC is constant 1986 dollars per the GSS codebook. The multiplier converts to current (2024) dollars using CPI-U annual averages so confirmatory income bins apply in 2024 dollars.",
      ternaryHandlingNote:
        "TRUST / HELPFUL / FAIR are mapped to binary positive share: 1 if the respondent chose the positive option, 0 if they chose the negative option, null if they answered 'Depends' (code 3) or a missing-value code (0/8/9). This matches the PAP §12 primary normalization and standard GSS trend reporting.",
      benchmarkFields: {
        trust_general:
          "Binary positive share of TRUST: 1 if TRUST == 1 (most people can be trusted), 0 if TRUST == 2 (can't be too careful), null for 'Depends' (3) or missing (0/8/9).",
        helpfulness_general:
          "Binary positive share of HELPFUL: 1 if HELPFUL == 1 (most people try to be helpful), 0 if HELPFUL == 2 (looking out for themselves), null for 'Depends' (3) or missing (0/8/9).",
        fairness_general:
          "Binary positive share of FAIR: 1 if FAIR == 1 (most people try to be fair), 0 if FAIR == 2 (take advantage), null for 'Depends' (3) or missing (0/8/9).",
        redistribution_support:
          "EQWLTH inverted and linearly normalized to [0, 1]: (7 - EQWLTH) / 6. 1 corresponds to strongest support for redistribution (EQWLTH == 1), 0 to weakest (EQWLTH == 7). Missing for 0/8/9.",
      },
    },
    rows,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const csvText = readInputText(args.input);
  const normalized = normalizeGssCsvText(csvText, args.input, {
    incomeMultiplier: args.incomeMultiplier,
  });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(normalized, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        datasetId: normalized.datasetId,
        rows: normalized.rows.length,
        incomeMultiplier: args.incomeMultiplier,
        out: args.out,
      },
      null,
      2
    )
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
