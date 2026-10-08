import type { AnyNode, FunctionDeclaration } from 'acorn';
import { calleeName, FUNCTION_TYPES, locate, walk } from '../ast';
import type { RuleDefinition, RuleViolation } from '../rule';

const GLIDE_AJAX_DOCS = 'https://www.servicenow.com/docs/r/api-reference/c_GlideAjaxAPI.html';
const GLIDE_FORM_DOCS = 'https://www.servicenow.com/docs/r/api-reference/c_GlideFormAPI.html';
const SERVER_ONLY_CLASSES = new Set(['GlideRecord', 'GlideRecordSecure', 'GlideAggregate']);

export const noGetXmlWait: RuleDefinition = {
  id: 'no-getxmlwait',
  title: 'No synchronous GlideAjax (getXMLWait)',
  severity: 'error',
  defaultFor: ['client'],
  why:
    'getXMLWait() freezes the browser until the server answers: the agent cannot type, scroll or click, ' +
    'and a slow instance makes the whole form hang. It is not supported in Service Portal or scoped ' +
    'applications, so the script breaks as soon as it is reused there.',
  fix: 'Call ga.getXMLAnswer(function (answer) { ... }) and move the code that needs the answer into the callback.',
  docsUrl: GLIDE_AJAX_DOCS,
  check({ script }) {
    const violations: RuleViolation[] = [];
    walk(script.ast, (node) => {
      if (node.type === 'CallExpression' && calleeName(node) === 'getXMLWait') {
        violations.push({
          message: 'getXMLWait() blocks the browser while it waits for the server.',
          ...locate(node, script.script),
        });
      }
    });
    return violations;
  },
};

export const noGlideRecordClient: RuleDefinition = {
  id: 'no-gliderecord-client',
  title: 'No GlideRecord in client scripts',
  severity: 'error',
  defaultFor: ['client'],
  why:
    'Client-side GlideRecord queries the database from the browser: each query is a separate, usually ' +
    'synchronous round trip, and it ships whole records to the browser, including fields the agent ' +
    'should not need. It is not supported in Service Portal or Workspace.',
  fix: 'Do the lookup in your Script Include and return only the values the form needs through GlideAjax.',
  docsUrl: GLIDE_AJAX_DOCS,
  check({ script }) {
    const violations: RuleViolation[] = [];
    walk(script.ast, (node) => {
      if (node.type !== 'NewExpression') return;
      const name = calleeName(node);
      if (name && SERVER_ONLY_CLASSES.has(name)) {
        violations.push({
          message: `new ${name}() runs a database query from the browser.`,
          ...locate(node, script.script),
        });
      }
    });
    return violations;
  },
};

export const noSyncGetReference: RuleDefinition = {
  id: 'no-sync-getreference',
  title: 'No synchronous g_form.getReference()',
  severity: 'error',
  defaultFor: ['client'],
  why:
    'Without a callback, g_form.getReference() blocks the browser while it fetches the entire referenced ' +
    'record. It is not supported synchronously in Service Portal or Workspace.',
  fix: "Pass a callback (g_form.getReference('caller_id', function (caller) { ... })), or better, fetch only what you need with GlideAjax.",
  docsUrl: GLIDE_FORM_DOCS,
  check({ script }) {
    const violations: RuleViolation[] = [];
    walk(script.ast, (node) => {
      if (
        node.type === 'CallExpression' &&
        calleeName(node) === 'getReference' &&
        node.arguments.length < 2
      ) {
        violations.push({
          message: 'g_form.getReference() is called without a callback.',
          ...locate(node, script.script),
        });
      }
    });
    return violations;
  },
};

export const onChangeIsLoadingGuard: RuleDefinition = {
  id: 'onchange-isloading-guard',
  title: 'onChange returns early while the form loads',
  severity: 'warning',
  defaultFor: ['client'],
  appliesTo: (script) => /function\s+onChange\s*\(/.test(script.script),
  why:
    'onChange scripts also run when the form loads. Without an isLoading check the script makes a server ' +
    'call on every form open and can flash messages the agent did not trigger.',
  fix: 'Start onChange with: if (isLoading) { return; }',
  docsUrl: GLIDE_FORM_DOCS,
  check({ script }) {
    const onChange = script.ast.body.find(
      (n): n is FunctionDeclaration =>
        n.type === 'FunctionDeclaration' && n.id?.name === 'onChange',
    );
    if (!onChange) return [];
    const loadingParam = onChange.params[3];
    const loadingName = loadingParam?.type === 'Identifier' ? loadingParam.name : 'isLoading';
    const guarded = onChange.body.body.some(
      (statement) =>
        statement.type === 'IfStatement' &&
        mentions(statement.test as AnyNode, loadingName) &&
        returns(statement.consequent as AnyNode),
    );
    return guarded
      ? []
      : [
          {
            message: `onChange never returns early when ${loadingName} is true.`,
            ...locate(onChange, script.script),
          },
        ];
  },
};

function mentions(node: AnyNode, identifier: string): boolean {
  let found = false;
  walkExpression(node, (n) => {
    if (n.type === 'Identifier' && n.name === identifier) found = true;
  });
  return found;
}

function returns(node: AnyNode): boolean {
  if (node.type === 'ReturnStatement') return true;
  return node.type === 'BlockStatement' && node.body.some((s) => s.type === 'ReturnStatement');
}

/** Shallow visitor for small expression trees (no function bodies). */
function walkExpression(node: AnyNode, visit: (node: AnyNode) => void) {
  visit(node);
  if (FUNCTION_TYPES.has(node.type)) return;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object' && 'type' in value)
      walkExpression(value as AnyNode, visit);
  }
}
