import type { Scenario, StaticRuleRef } from '@snow-mastery/scenarios';
import { LayerRecorder, plural } from '../layer-result';
import type { CapturedScript, Clock, Finding, LayerResult } from '../types';
import { parseScript } from './parse';
import { DEFAULT_RULES, RULES } from './registry';
import type { ParsedScript, RuleDefinition } from './rule';

interface Application {
  rule: RuleDefinition;
  ref?: StaticRuleRef;
}

/** Layer 2: parse the captured scripts and run the default and scenario rules over them. */
export function runStaticLayer(
  scenario: Scenario,
  captured: Map<string, CapturedScript>,
  clock: Pick<Clock, 'now'>,
): LayerResult {
  const recorder = new LayerRecorder('STATIC', clock);
  if (captured.size === 0) {
    return recorder.finish('BLOCKED', 'Nothing to analyse until layer 1 finds your scripts.');
  }

  const parsed = new Map<string, ParsedScript>();
  for (const script of captured.values()) {
    const outcome = parseScript(script.script);
    if (outcome.ok) {
      parsed.set(script.alias, { ...script, ast: outcome.ast });
    } else {
      recorder.add({
        checkId: 'syntax',
        severity: 'error',
        passed: false,
        title: `${script.name || script.alias} parses as JavaScript`,
        message: `Syntax error: ${outcome.message}.`,
        why: 'ServiceNow cannot run a script that does not parse, and no other rule can check it.',
        fix: 'Open the script in your PDI; the editor highlights the line.',
        target: targetOf(script),
        line: outcome.line,
        column: outcome.column,
      });
    }
  }

  for (const script of parsed.values()) {
    for (const application of applicationsFor(scenario, script)) {
      for (const finding of applyRule(application, script, parsed)) recorder.add(finding);
    }
  }
  for (const ref of scenario.staticRules.filter((r) => !captured.has(r.target))) {
    recorder.add({
      checkId: ref.id ?? ref.rule,
      severity: 'info',
      passed: false,
      title: titleFor(RULES.get(ref.rule), ref),
      message: `Not checked: layer 1 did not find the script "${ref.target}".`,
    });
  }

  const errors = recorder.blockingFailures.length;
  const warnings = recorder.warnings.length;
  const checked = recorder.findings.filter((f) => f.severity !== 'info').length;
  const summary =
    errors > 0
      ? `${plural(errors, 'problem')}${warnings ? ` and ${plural(warnings, 'warning')}` : ''} in your scripts.`
      : warnings > 0
        ? `No blocking problems; ${plural(warnings, 'warning')} worth fixing.`
        : `Your scripts pass all ${plural(checked, 'check')}.`;
  return recorder.finish(errors > 0 ? 'FAILED' : 'PASSED', summary);
}

function applicationsFor(scenario: Scenario, script: ParsedScript): Application[] {
  const defaults = DEFAULT_RULES.filter(
    (rule) =>
      rule.defaultFor?.includes(script.kind) &&
      !scenario.disabledDefaultRules.includes(rule.id) &&
      (rule.appliesTo?.(script) ?? true),
  ).map((rule) => ({ rule }));
  const configured = scenario.staticRules
    .filter((ref) => ref.target === script.alias)
    .map((ref) => {
      const rule = RULES.get(ref.rule);
      if (!rule) throw new Error(`Scenario ${scenario.id} uses unknown rule "${ref.rule}".`);
      return { rule, ref };
    });
  return [...defaults, ...configured];
}

function applyRule(
  { rule, ref }: Application,
  script: ParsedScript,
  scripts: Map<string, ParsedScript>,
): Finding[] {
  const base = {
    checkId: ref?.id ?? rule.id,
    severity: ref?.severity ?? rule.severity,
    title: titleFor(rule, ref),
    target: targetOf(script),
  };
  const violations = rule.check({ script, options: ref?.options ?? {}, scripts });
  if (violations.length === 0) {
    return [{ ...base, passed: true, message: 'Looks good.' }];
  }
  return violations.map((violation) => ({
    ...base,
    passed: false,
    message: ref?.message ?? violation.message,
    why: ref?.why ?? rule.why,
    fix: ref?.fix ?? rule.fix,
    docsUrl: ref?.docsUrl ?? rule.docsUrl,
    line: violation.line,
    column: violation.column,
    snippet: violation.snippet,
  }));
}

function titleFor(rule: RuleDefinition | undefined, ref: StaticRuleRef): string;
function titleFor(rule: RuleDefinition, ref?: StaticRuleRef): string;
function titleFor(rule: RuleDefinition | undefined, ref?: StaticRuleRef): string {
  if (!rule) return ref?.rule ?? 'Unknown rule';
  return ref && rule.describe ? rule.describe(ref.options) : rule.title;
}

function targetOf(script: CapturedScript) {
  return { alias: script.alias, table: script.table, sysId: script.sysId, name: script.name };
}
