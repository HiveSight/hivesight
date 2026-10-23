import { z } from "zod/v4";
import { DEFAULT_MODEL, SERVED_MODEL_IDS } from "@/engine/models";
import { INDIVIDUAL_MODELS, individualModeEnabled } from "@/engine/individual-study";
import { canonicalGeography } from "@/lib/geographies";
import { AGE_BANDS, BENEFITS, CHILDREN, INCOME_BANDS, SEXES, TENURES } from "@/engine/bands";

// The label is derived from the value (canonicalGeography), so a request
// cannot weight one place while prompting about another.
export const GeographySchema = z
  .object({
    type: z.enum(["national", "state", "district"]),
    value: z.string().min(2).max(8),
    label: z.string().max(60).optional(),
  })
  .transform((g, ctx) => {
    const canonical = canonicalGeography(g.type, g.value);
    if (!canonical) {
      ctx.addIssue({ code: "custom", message: `Unknown ${g.type} geography "${g.value}"` });
      return z.NEVER;
    }
    return canonical;
  });

// Strict: an unknown key (say "sex" for "sexes") would otherwise be dropped
// and silently widen the audience to everyone.
export const FiltersSchema = z.strictObject({
  ageBands: z.array(z.enum(AGE_BANDS)).optional(),
  incomeBands: z.array(z.enum(INCOME_BANDS)).optional(),
  sexes: z.array(z.enum(SEXES)).optional(),
  tenure: z.array(z.enum(TENURES)).optional(),
  children: z.array(z.enum(CHILDREN)).optional(),
  benefits: z.array(z.enum(BENEFITS)).optional(),
});

export const FormatSchema = z.union([
  z.object({ kind: z.literal("likert5") }),
  z.object({ kind: z.literal("binary") }),
  z.object({
    kind: z.literal("choice"),
    options: z
      .array(z.string().trim().min(1).max(120))
      .min(2)
      .max(8)
      .refine(
        (options) => new Set(options.map((o) => o.toLowerCase())).size === options.length,
        "Choice options must be distinct"
      ),
  }),
]);

export const RunRequestSchema = z
  .object({
    question: z.string().min(10).max(500),
    format: FormatSchema,
    audience: z.object({
      geography: GeographySchema,
      filters: FiltersSchema.default({}),
    }),
    model: z.enum(SERVED_MODEL_IDS).default(DEFAULT_MODEL),
    // Population cells unless the asker opts in to the individual mode.
    mode: z.enum(["cells", "individual"]).default("cells"),
    verbatimCount: z.number().int().min(0).max(12).default(6),
  })
  .refine((r) => r.mode === "cells" || (individualModeEnabled() && INDIVIDUAL_MODELS.includes(r.model)), {
    message: "Individual mode is not offered with this model",
    path: ["mode"],
  });

export type RunRequest = z.infer<typeof RunRequestSchema>;
