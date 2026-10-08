import type { Program } from 'acorn';
import type { ScriptKind } from '@snow-mastery/scenarios';
import type { CapturedScript } from '../types';
import type { Location } from './ast';

export interface ParsedScript extends CapturedScript {
  ast: Program;
}

export interface RuleContext {
  script: ParsedScript;
  options: Record<string, unknown>;
  /** Every parsed captured script, for cross-script rules (e.g. the GlideAjax contract). */
  scripts: Map<string, ParsedScript>;
}

export interface RuleViolation extends Location {
  message: string;
}

export interface RuleDefinition {
  id: string;
  /** Short statement of the good practice, shown for passes and failures alike. */
  title: string;
  /** Title for a configured (parametric) use of the rule, e.g. "Calls getXMLAnswer()". */
  describe?: (options: Record<string, unknown>) => string;
  severity: 'error' | 'warning';
  /** Script kinds this rule runs on by default; omit for scenario-only (parametric) rules. */
  defaultFor?: ScriptKind[];
  /** Further narrows when a default rule applies (e.g. only client-callable includes). */
  appliesTo?: (script: CapturedScript) => boolean;
  why: string;
  fix?: string;
  docsUrl?: string;
  check(context: RuleContext): RuleViolation[];
}

export function requireStringOption(
  options: Record<string, unknown>,
  key: string,
  ruleId: string,
): string {
  const value = options[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Rule "${ruleId}" needs a string option "${key}".`);
  }
  return value;
}

export function optionalStringOption(
  options: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = options[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
