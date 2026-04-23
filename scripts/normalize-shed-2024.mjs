import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildObjectsFromCsv,
  createAgeBandMapper,
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
  "src/lib/benchmarks/data/manifests/shed-2024-household-finance.json"
);
const defaultOutputPath = path.join(rootDir, ".benchmarks/input/shed-2024.json");

const executionSpec = JSON.parse(fs.readFileSync(executionSpecPath, "utf8"));
const shedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const mapAgeBand = createAgeBandMapper(executionSpec);

const YES = "Yes";
const NO = "No";

const INCOME_LABEL_TO_EXECUTION_BIN = {
  "Less than $10,000": "<$25k",
  "$10,000 to $24,999": "<$25k",
  "$25,000 to $49,999": "$25k-$74,999",
  "$50,000 to $74,999": "$25k-$74,999",
  "$75,000 to $99,999": "$75k-$149,999",
  "$100,000 to $149,999": "$75k-$149,999",
  "$150,000 or more": "$150k+",
};

const TENURE_LABEL_TO_NORMALIZED = {
  "Owned or being bought by you or someone in your household": "homeowner",
  "Rented for cash": "renter",
  "Occupied without payment of cash rent": "other",
};

const EMPLOYMENT_LABEL_TO_NORMALIZED = {
  "Working full-time": "working_full_time",
  "Working part-time": "working_part_time",
  "Not working": "not_working",
};

const METRO_LABEL_TO_NORMALIZED = {
  Metro: "metro",
  "Non-Metro": "non_metro",
};

function usage() {
  return [
    "Usage: node scripts/normalize-shed-2024.mjs --input <public2024.csv|zip> [--out <path>]",
    "",
    "Normalizes the official 2024 SHED public-use data into the benchmark row format",
    `expected by ${path.relative(rootDir, manifestPath)}.`,
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    input: null,
    out: defaultOutputPath,
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

function mapIncomeBand(ppinc7) {
  return INCOME_LABEL_TO_EXECUTION_BIN[ppinc7] ?? null;
}

function mapTenureType(pprent) {
  return TENURE_LABEL_TO_NORMALIZED[pprent] ?? null;
}

function mapEmploymentStatus(ppemploy) {
  return EMPLOYMENT_LABEL_TO_NORMALIZED[ppemploy] ?? null;
}

function mapMetro(ppmsacat) {
  return METRO_LABEL_TO_NORMALIZED[ppmsacat] ?? null;
}

function mapChildrenFlag(ppkid017) {
  const count = parseNumber(ppkid017);
  if (count == null) {
    return null;
  }
  return count > 0 ? "has_children" : "no_children";
}

function mapFinancialWellbeing(value) {
  if (value === "Doing okay" || value === "Living comfortably") {
    return 1;
  }
  if (value === "Finding it difficult to get by" || value === "Just getting by") {
    return 0;
  }
  return null;
}

function mapFinancialChange(value) {
  if (value === "Much worse off" || value === "Somewhat worse off") {
    return 0;
  }
  if (value === "About the same") {
    return 0.5;
  }
  if (value === "Somewhat better off" || value === "Much better off") {
    return 1;
  }
  return null;
}

function mapBooleanYesNo(value) {
  if (value === YES) return 1;
  if (value === NO) return 0;
  return null;
}

function hasAnyYes(row, fields) {
  return fields.some((field) => row[field] === YES);
}

function mapHousingCostStress(row) {
  const tenureType = mapTenureType(row.pprent);

  if (!tenureType) {
    return null;
  }

  const renterSignals = ["R11", "R1_f", "R1_g", "R5B_c", "I41_d"];
  const ownerSignals = ["R5C_a", "R5C_b", "R5C_c", "I41_d"];
  const otherSignals = ["I41_d"];

  if (tenureType === "renter") {
    return hasAnyYes(row, renterSignals) ? 1 : 0;
  }

  if (tenureType === "homeowner") {
    return hasAnyYes(row, ownerSignals) ? 1 : 0;
  }

  return hasAnyYes(row, otherSignals) ? 1 : 0;
}

function mapBenefitsStatus(row) {
  return hasAnyYes(row, ["I0_c", "I0_d", "I0_e", "I41_a", "I41_b", "I41_c", "I41_d", "I41_e"])
    ? "receives_benefits"
    : "no_reported_benefits";
}

function normalizeRow(row) {
  const weight = parseNumber(row.weight);
  const age = parseNumber(row.ppage);
  const ageBand = mapAgeBand(age);
  const incomeBand = mapIncomeBand(row.ppinc7);

  return {
    respondentId: row.shedid,
    weight,
    slices: {
      overall: "overall",
      age_band: ageBand,
      income_band: incomeBand,
      sex: row.ppgender || null,
      race_ethnicity: row.ppethm || null,
      tenure_type: mapTenureType(row.pprent),
      housing_status: row.pphouse4 || null,
      children_flag: mapChildrenFlag(row.ppkid017),
      benefits_status: mapBenefitsStatus(row),
      employment_status: mapEmploymentStatus(row.ppemploy),
      metro_proxy: mapMetro(row.ppmsacat),
      region: row.ppreg4 || null,
      household_size: parseNumber(row.pphhsize),
    },
    benchmarkFields: {
      financial_wellbeing: mapFinancialWellbeing(row.B2),
      can_cover_400_expense: mapBooleanYesNo(row.pay_casheqv),
      financial_change_vs_last_year: mapFinancialChange(row.B3),
      housing_cost_stress: mapHousingCostStress(row),
    },
    rawFields: {
      B2: row.B2 || null,
      B3: row.B3 || null,
      pay_casheqv: row.pay_casheqv || null,
      R11: row.R11 || null,
      R1_f: row.R1_f || null,
      R1_g: row.R1_g || null,
      R5B_c: row.R5B_c || null,
      R5C_a: row.R5C_a || null,
      R5C_b: row.R5C_b || null,
      R5C_c: row.R5C_c || null,
      I41_d: row.I41_d || null,
    },
  };
}

export function normalizeShedCsvText(csvText, inputPath = "inline.csv") {
  const sourceRows = buildObjectsFromCsv(csvText);
  const rows = sourceRows.map(normalizeRow);

  return {
    version: 1,
    datasetId: shedManifest.datasetId,
    datasetLabel: shedManifest.datasetLabel,
    generatedAt: new Date().toISOString(),
    source: {
      inputPath,
      rowCount: rows.length,
    },
    normalization: {
      confirmatorySliceFamilies: executionSpec.analysisPlan.confirmatorySliceFamilies,
      confirmatorySliceDefinitions:
        executionSpec.analysisPlan.confirmatorySliceDefinitions,
      benchmarkFields: {
        financial_wellbeing:
          "Binary 1 if B2 is 'Doing okay' or 'Living comfortably', else 0.",
        can_cover_400_expense:
          "Binary 1 if pay_casheqv is 'Yes', else 0.",
        financial_change_vs_last_year:
          "Ordered normalization of B3 with worse=0, same=0.5, better=1.",
        housing_cost_stress:
          "Conservative proxy: renter arrears/affordability signals, homeowner foreclosure-distress signals, or housing assistance receipt.",
      },
    },
    rows,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const csvText = readInputText(args.input);
  const normalized = normalizeShedCsvText(csvText, args.input);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(normalized, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        datasetId: normalized.datasetId,
        rows: normalized.rows.length,
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
