import { z } from 'zod';

export const MODULES = [
  'PLATFORM',
  'ITSM',
  'ITOM',
  'HRSD',
  'CSM',
  'FSM',
  'SPM',
  'SECOPS',
  'IRM',
] as const;
export const ModuleSchema = z.enum(MODULES);
export type Module = z.infer<typeof ModuleSchema>;

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const SCRIPT_KINDS = ['client', 'server'] as const;
export const ScriptKindSchema = z.enum(SCRIPT_KINDS);
export type ScriptKind = z.infer<typeof ScriptKindSchema>;

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase-kebab-case');
const DottedId = z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/, 'use dotted.lowercase-ids');
const Alias = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'use camelCase');
const TableName = z.string().regex(/^[a-z0-9_]+$/, 'not a valid table name');
const FieldName = z.string().regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/, 'not a valid field name');

/** Values embedded in an encoded query must not contain the condition separator. */
const QueryValue = z
  .union([z.string(), z.boolean(), z.number()])
  .transform(String)
  .refine((v) => !/[\^\r\n]/.test(v), 'must not contain ^ or line breaks');

const Severity = z.enum(['error', 'warning']);

export const ExpectationSchema = z.object({
  field: FieldName,
  equals: z.union([z.string(), z.boolean(), z.number()]).transform(String),
  severity: Severity.default('error'),
  /** Shown when the expectation fails: what is wrong, in the learner's terms. */
  message: z.string().min(1),
  why: z.string().optional(),
});
export type Expectation = z.infer<typeof ExpectationSchema>;

export const StructureCheckSchema = z.object({
  id: Slug,
  title: z.string().min(1),
  table: TableName,
  /** Equality conditions that identify the learner's record. */
  match: z.record(FieldName, QueryValue),
  /** Substrings the record's script must contain (narrows matches, e.g. out-of-box scripts). */
  scriptContains: z.array(QueryValue).default([]),
  expect: z.array(ExpectationSchema).default([]),
  /** Makes the record's script available to static rules and the review under this alias. */
  capture: z
    .object({
      alias: Alias,
      scriptField: FieldName.default('script'),
      kind: ScriptKindSchema,
    })
    .optional(),
  /** Extra guidance when no record matches. */
  notFoundHint: z.string().optional(),
});
export type StructureCheck = z.infer<typeof StructureCheckSchema>;

export const StaticRuleRefSchema = z.object({
  /** Rule id from the grader's rule registry, e.g. "require-call". */
  rule: z.string().min(1),
  /** Alias of a captured script (see StructureCheck.capture). */
  target: Alias,
  /** Optional unique id when the same rule is used more than once. */
  id: z.string().optional(),
  severity: Severity.optional(),
  options: z.record(z.string(), z.unknown()).default({}),
  message: z.string().optional(),
  why: z.string().optional(),
  fix: z.string().optional(),
  docsUrl: z.url().optional(),
});
export type StaticRuleRef = z.infer<typeof StaticRuleRefSchema>;

export const FunctionalSchema = z.object({
  /** Name of the ATF test suite the learner imports/creates in their PDI. */
  suiteName: z.string().min(1),
  /** True when the suite contains UI steps that need a client test runner. */
  requiresClientRunner: z.boolean().default(false),
  /** Markdown setup guide, relative to the scenario directory. */
  setupGuide: z.string().min(1),
  /** Scripts the learner pastes into ATF steps, shown next to the guide. */
  scripts: z.array(z.object({ title: z.string().min(1), path: z.string().min(1) })).default([]),
});
export type Functional = z.infer<typeof FunctionalSchema>;

export const ScenarioSchema = z
  .object({
    id: Slug,
    version: z.number().int().positive(),
    kind: z.literal('SCRIPT_LAB').default('SCRIPT_LAB'),
    title: z.string().min(1),
    summary: z.string().min(1),
    module: ModuleSchema,
    difficulty: DifficultySchema,
    /** Release family the scenario was written against (e.g. "zurich"). */
    releaseFamily: z.string().min(1),
    estimatedMinutes: z.number().int().positive().optional(),
    /** Markdown. */
    requirement: z.string().min(1),
    acceptanceCriteria: z.array(z.string().min(1)).min(1),
    objectives: z
      .array(z.object({ id: DottedId, title: z.string().min(1), module: ModuleSchema }))
      .min(1),
    hints: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).default([]),
    structureChecks: z.array(StructureCheckSchema).min(1),
    staticRules: z.array(StaticRuleRefSchema).default([]),
    /** Default rules (applied by script kind) to switch off for this scenario. */
    disabledDefaultRules: z.array(z.string()).default([]),
    functional: FunctionalSchema.optional(),
    architectRubric: z
      .array(z.object({ id: Slug, criterion: z.string().min(1) }))
      .min(1),
    docs: z.array(z.object({ title: z.string().min(1), url: z.url() })).default([]),
  })
  .superRefine((scenario, ctx) => {
    const aliases = new Set<string>();
    scenario.structureChecks.forEach((check, i) => {
      const alias = check.capture?.alias;
      if (!alias) return;
      if (aliases.has(alias)) {
        ctx.addIssue({
          code: 'custom',
          path: ['structureChecks', i, 'capture', 'alias'],
          message: `duplicate capture alias "${alias}"`,
        });
      }
      aliases.add(alias);
    });
    scenario.staticRules.forEach((ref, i) => {
      if (!aliases.has(ref.target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['staticRules', i, 'target'],
          message: `unknown target "${ref.target}"; capture it in a structure check first`,
        });
      }
    });
    reportDuplicates(ctx, 'structureChecks', scenario.structureChecks.map((c) => c.id));
    reportDuplicates(ctx, 'objectives', scenario.objectives.map((o) => o.id));
    reportDuplicates(ctx, 'architectRubric', scenario.architectRubric.map((r) => r.id));
  });

export type Scenario = z.infer<typeof ScenarioSchema>;

/** A scenario plus where it was loaded from. */
export interface LoadedScenario extends Scenario {
  sourceDir: string;
}

function reportDuplicates(ctx: z.RefinementCtx, path: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) ctx.addIssue({ code: 'custom', path: [path], message: `duplicate id "${id}"` });
    seen.add(id);
  }
}
