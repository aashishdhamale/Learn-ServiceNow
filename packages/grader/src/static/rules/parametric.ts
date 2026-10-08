import type { AnyNode, Program } from 'acorn';
import { calleeName, locate, stringArg, walk } from '../ast';
import {
  optionalStringOption,
  requireStringOption,
  type RuleDefinition,
  type RuleViolation,
} from '../rule';

/** Rules a scenario configures with options; they never run by default. */

export const requireCall: RuleDefinition = {
  id: 'require-call',
  title: 'Uses the required API',
  describe: (options) =>
    `Calls ${String(options.method)}(${options.firstArgument ? `'${String(options.firstArgument)}'` : ''})`,
  severity: 'error',
  why: 'The scenario requires this API.',
  check({ script, options }) {
    const method = requireStringOption(options, 'method', 'require-call');
    const firstArgument = optionalStringOption(options, 'firstArgument');
    let found = false;
    walk(script.ast, (node) => {
      if (node.type !== 'CallExpression' || calleeName(node) !== method) return;
      if (firstArgument === undefined || stringArg(node, 0) === firstArgument) found = true;
    });
    const call = firstArgument ? `${method}('${firstArgument}')` : `${method}()`;
    return found ? [] : [{ message: `Expected a call to ${call}.` }];
  },
};

export const requireNew: RuleDefinition = {
  id: 'require-new',
  title: 'Creates the required object',
  describe: (options) =>
    `Creates new ${String(options.className)}(${options.firstArgument ? `'${String(options.firstArgument)}'` : ''})`,
  severity: 'error',
  why: 'The scenario requires this object.',
  check({ script, options }) {
    const constructorName = requireStringOption(options, 'className', 'require-new');
    const firstArgument = optionalStringOption(options, 'firstArgument');
    let found = false;
    walk(script.ast, (node) => {
      if (node.type !== 'NewExpression' || calleeName(node) !== constructorName) return;
      if (firstArgument === undefined || stringArg(node, 0) === firstArgument) found = true;
    });
    const expression = firstArgument
      ? `new ${constructorName}('${firstArgument}')`
      : `new ${constructorName}()`;
    return found ? [] : [{ message: `Expected ${expression}.` }];
  },
};

export const forbidCall: RuleDefinition = {
  id: 'forbid-call',
  title: 'Avoids a discouraged API',
  describe: (options) => `Does not call ${String(options.method)}()`,
  severity: 'error',
  why: 'The scenario forbids this API.',
  check({ script, options }) {
    const method = requireStringOption(options, 'method', 'forbid-call');
    const violations: RuleViolation[] = [];
    walk(script.ast, (node) => {
      if (node.type === 'CallExpression' && calleeName(node) === method) {
        violations.push({
          message: `${method}() is not allowed here.`,
          ...locate(node, script.script),
        });
      }
    });
    return violations;
  },
};

const RESERVED_PARAMS = new Set(['sysparm_type', 'sysparm_function', 'sysparm_value']);

export const ajaxContract: RuleDefinition = {
  id: 'ajax-contract',
  title: 'Client and Script Include agree on the GlideAjax contract',
  severity: 'error',
  why:
    'GlideAjax finds the Script Include by name and the method by sysparm_name. A mismatch fails ' +
    'silently: the callback just receives null and the agent sees nothing.',
  fix: "Make GlideAjax('<Script Include name>') and addParam('sysparm_name', '<method>') match the Script Include exactly (names are case-sensitive).",
  docsUrl: 'https://www.servicenow.com/docs/r/api-reference/c_GlideAjaxAPI.html',
  check({ script, options, scripts }) {
    const include = scripts.get(requireStringOption(options, 'include', 'ajax-contract'));
    if (!include) return []; // layer 1 already reports the missing Script Include
    const client = glideAjaxUsage(script.ast, script.script);
    if (client.constructions.length === 0) return [];

    const violations: RuleViolation[] = [];
    for (const { name, location } of client.constructions) {
      if (name !== undefined && unscoped(name) !== include.name) {
        violations.push({
          message: `GlideAjax('${name}') does not match the Script Include "${include.name}".`,
          ...location,
        });
      }
    }
    for (const { param, location } of client.reservedParams) {
      violations.push({
        message: `${param} is reserved by GlideAjax; use your own sysparm_ name.`,
        ...location,
      });
    }
    if (client.methods.length === 0) {
      violations.push({
        message: "No addParam('sysparm_name', ...): the server can't tell which method to run.",
      });
    }
    const available = includeMethods(include.ast);
    for (const { method, location } of client.methods) {
      if (!available.includes(method)) {
        const known = available.length ? ` (it defines: ${available.join(', ')})` : '';
        violations.push({
          message: `sysparm_name is '${method}', but ${include.name} has no such method${known}.`,
          ...location,
        });
      }
    }
    return violations;
  },
};

function unscoped(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
}

interface Located {
  location: ReturnType<typeof locate>;
}

function glideAjaxUsage(ast: Program, source: string) {
  const constructions: Array<{ name?: string } & Located> = [];
  const methods: Array<{ method: string } & Located> = [];
  const reservedParams: Array<{ param: string } & Located> = [];
  walk(ast, (node) => {
    if (node.type === 'NewExpression' && calleeName(node) === 'GlideAjax') {
      constructions.push({ name: stringArg(node, 0), location: locate(node, source) });
    }
    if (node.type === 'CallExpression' && calleeName(node) === 'addParam') {
      const param = stringArg(node, 0);
      const value = stringArg(node, 1);
      if (param === 'sysparm_name' && value)
        methods.push({ method: value, location: locate(node, source) });
      if (param && RESERVED_PARAMS.has(param))
        reservedParams.push({ param, location: locate(node, source) });
    }
  });
  return { constructions, methods, reservedParams };
}

/** Method names in Object.extendsObject(Base, { ... }) or Foo.prototype = { ... }. */
function includeMethods(ast: Program): string[] {
  const names = new Set<string>();
  const collect = (object: AnyNode | undefined) => {
    if (object?.type !== 'ObjectExpression') return;
    for (const property of object.properties) {
      if (property.type !== 'Property') continue;
      const key = property.key;
      if (key.type === 'Identifier') names.add(key.name);
      else if (key.type === 'Literal' && typeof key.value === 'string') names.add(key.value);
    }
  };
  walk(ast, (node) => {
    if (node.type === 'CallExpression' && calleeName(node) === 'extendsObject') {
      collect(node.arguments[1] as AnyNode | undefined);
    }
    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      calleeNameOfMember(node.left as AnyNode) === 'prototype'
    ) {
      collect(node.right as AnyNode);
    }
  });
  names.delete('type');
  names.delete('initialize');
  return [...names];
}

function calleeNameOfMember(node: AnyNode): string | undefined {
  return node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
    ? node.property.name
    : undefined;
}
