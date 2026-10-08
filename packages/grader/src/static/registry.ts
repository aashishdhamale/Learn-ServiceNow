import {
  noGetXmlWait,
  noGlideRecordClient,
  noSyncGetReference,
  onChangeIsLoadingGuard,
} from './rules/client';
import { ajaxContract, forbidCall, requireCall, requireNew } from './rules/parametric';
import { ajaxIncludeExtendsProcessor, noGlideRecordInLoop, noHardcodedSysId } from './rules/server';
import type { RuleDefinition } from './rule';

/** Every rule the grader knows. Scenario files refer to these ids. */
export const RULES: ReadonlyMap<string, RuleDefinition> = new Map(
  [
    noGetXmlWait,
    noGlideRecordClient,
    noSyncGetReference,
    onChangeIsLoadingGuard,
    noHardcodedSysId,
    noGlideRecordInLoop,
    ajaxIncludeExtendsProcessor,
    requireCall,
    requireNew,
    forbidCall,
    ajaxContract,
  ].map((rule) => [rule.id, rule]),
);

/** Rules applied to every captured script of their kind unless a scenario disables them. */
export const DEFAULT_RULES: readonly RuleDefinition[] = [...RULES.values()].filter(
  (r) => r.defaultFor,
);
