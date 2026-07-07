import { z } from "zod/v4";

export const GeographySchema = z.object({
  type: z.enum(["national", "state", "district"]),
  value: z.string().min(2).max(8),
  label: z.string().min(2).max(60),
});

export const FiltersSchema = z.object({
  ageBands: z.array(z.string()).optional(),
  incomeBands: z.array(z.string()).optional(),
  sexes: z.array(z.string()).optional(),
  tenure: z.array(z.string()).optional(),
  children: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
});

export const FormatSchema = z.union([
  z.object({ kind: z.literal("likert5") }),
  z.object({ kind: z.literal("binary") }),
  z.object({
    kind: z.literal("choice"),
    options: z.array(z.string().min(1).max(120)).min(2).max(8),
  }),
]);

export const RunRequestSchema = z.object({
  question: z.string().min(10).max(500),
  format: FormatSchema,
  audience: z.object({
    geography: GeographySchema,
    filters: FiltersSchema.default({}),
  }),
  model: z.enum(["gpt-5-mini", "gpt-5.2"]).default("gpt-5-mini"),
  verbatimCount: z.number().int().min(0).max(12).default(6),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
