import type { AnyNode, Node } from 'acorn';
import { calleeName, FUNCTION_TYPES, ITERATION_METHODS, locate, LOOP_TYPES, walk } from '../ast';
import type { RuleDefinition, RuleViolation } from '../rule';

const GLIDE_AJAX_DOCS = 'https://www.servicenow.com/docs/r/api-reference/c_GlideAjaxAPI.html';
const QUERY_CLASSES = new Set(['GlideRecord', 'GlideRecordSecure', 'GlideAggregate']);
const SYS_ID = /^[0-9a-f]{32}$/i;

export const noHardcodedSysId: RuleDefinition = {
  id: 'no-hardcoded-sys-id',
  title: 'No hard-coded sys_ids',
  severity: 'error',
  defaultFor: ['client', 'server'],
  why:
    'sys_ids differ between instances and change when a record is recreated, so the script silently ' +
    'breaks after a clone, a migration or a data fix, and nobody reading it knows what the value means.',
  fix: 'Look the record up by a stable key (a name or a reference field), or keep the value in a system property.',
  check({ script }) {
    const violations: RuleViolation[] = [];
    walk(script.ast, (node) => {
      const text =
        node.type === 'Literal' && typeof node.value === 'string'
          ? node.value
          : node.type === 'TemplateElement'
            ? (node.value.cooked ?? '')
            : undefined;
      if (text !== undefined && SYS_ID.test(text.trim())) {
        violations.push({
          message: `"${text.trim()}" looks like a hard-coded sys_id.`,
          ...locate(node, script.script),
        });
      }
    });
    return violations;
  },
};

export const noGlideRecordInLoop: RuleDefinition = {
  id: 'no-gliderecord-in-loop',
  title: 'No GlideRecord queries inside loops',
  severity: 'error',
  defaultFor: ['server'],
  why:
    'A query per iteration multiplies database round trips (the N+1 problem): fine with 5 rows in a PDI, ' +
    'painfully slow with 50,000 in production.',
  fix: 'Query once before the loop (an IN condition or a join via dot-walking), or use GlideAggregate for counts.',
  check({ script }) {
    const recordVariables = glideRecordVariables(script.ast);
    const reportedLoops = new Set<Node>();
    const violations: RuleViolation[] = [];
    walk(script.ast, (node, ancestors) => {
      if (!isQuery(node, recordVariables)) return;
      const loop = enclosingLoop(ancestors);
      if (!loop || reportedLoops.has(loop)) return;
      reportedLoops.add(loop);
      violations.push({
        message: 'A GlideRecord query runs on every iteration of this loop.',
        ...locate(node, script.script),
      });
    });
    return violations;
  },
};

export const ajaxIncludeExtendsProcessor: RuleDefinition = {
  id: 'ajax-include-extends-abstractajaxprocessor',
  title: 'Client-callable Script Include extends AbstractAjaxProcessor',
  severity: 'error',
  defaultFor: ['server'],
  appliesTo: (script) =>
    script.table === 'sys_script_include' && script.record.client_callable === 'true',
  why:
    'GlideAjax only dispatches to Script Includes built on AbstractAjaxProcessor; the base class is also ' +
    'what gives you this.getParameter() to read the sysparm_ values the client sends.',
  fix: 'MyInclude.prototype = Object.extendsObject(AbstractAjaxProcessor, { ... }); (use global.AbstractAjaxProcessor in a scoped app)',
  docsUrl: GLIDE_AJAX_DOCS,
  check({ script }) {
    let extendsProcessor = false;
    walk(script.ast, (node) => {
      if (node.type !== 'CallExpression' || calleeName(node) !== 'extendsObject') return;
      const base = node.arguments[0] as AnyNode | undefined;
      if (base && baseName(base) === 'AbstractAjaxProcessor') extendsProcessor = true;
    });
    return extendsProcessor
      ? []
      : [
          {
            message:
              'The prototype is not created with Object.extendsObject(AbstractAjaxProcessor, { ... }).',
          },
        ];
  },
};

function baseName(node: AnyNode): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier')
    return node.property.name;
  return undefined;
}

/** Variables initialised with new GlideRecord(...) and friends. */
function glideRecordVariables(ast: AnyNode): Set<string> {
  const names = new Set<string>();
  walk(ast as never, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.init?.type === 'NewExpression' &&
      QUERY_CLASSES.has(calleeName(node.init as AnyNode) ?? '')
    ) {
      names.add(node.id.name);
    }
  });
  return names;
}

function isQuery(node: AnyNode, recordVariables: Set<string>): boolean {
  if (node.type === 'NewExpression') return QUERY_CLASSES.has(calleeName(node) ?? '');
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return false;
  const method = calleeName(node);
  if (method === 'query') return true;
  const receiver = node.callee.object;
  return method === 'get' && receiver.type === 'Identifier' && recordVariables.has(receiver.name);
}

/** The innermost loop whose body (not its condition) contains the node, if any. */
function enclosingLoop(ancestors: AnyNode[]): Node | undefined {
  for (let i = ancestors.length - 2; i >= 0; i--) {
    const ancestor = ancestors[i]!;
    const child = ancestors[i + 1]!;
    if (LOOP_TYPES.has(ancestor.type) && 'body' in ancestor && ancestor.body === child)
      return ancestor;
    if (FUNCTION_TYPES.has(ancestor.type)) {
      const parent = ancestors[i - 1];
      if (
        parent?.type === 'CallExpression' &&
        ITERATION_METHODS.has(calleeName(parent) ?? '') &&
        parent.arguments.includes(ancestor as never)
      ) {
        return parent;
      }
    }
  }
  return undefined;
}
