import type { AnyNode, Node, Program } from 'acorn';
import { fullAncestor } from 'acorn-walk';

/** Visits every node with its ancestors (root first, node last). */
export function walk(ast: Program, visit: (node: AnyNode, ancestors: AnyNode[]) => void) {
  fullAncestor(ast, (node, _state, ancestors) => visit(node as AnyNode, ancestors as AnyNode[]));
}

/** Name a call is made through: foo() → "foo", a.b.foo() → "foo", a['foo']() → "foo". */
export function calleeName(node: AnyNode): string | undefined {
  if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return undefined;
  return propertyName(node.callee as AnyNode);
}

/** "foo" for Identifier foo, the property for a.foo / a['foo'], "global.Foo" stays "Foo". */
export function propertyName(node: AnyNode): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    if (!node.computed && node.property.type === 'Identifier') return node.property.name;
    if (node.property.type === 'Literal' && typeof node.property.value === 'string')
      return node.property.value;
  }
  return undefined;
}

/** For a.b.c() returns the receiver "a.b"; for foo() returns undefined. */
export function receiverText(node: AnyNode): string | undefined {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return undefined;
  return memberText(node.callee.object as AnyNode);
}

function memberText(node: AnyNode): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const object = memberText(node.object as AnyNode);
    return object ? `${object}.${node.property.name}` : undefined;
  }
  return undefined;
}

export function stringArg(node: AnyNode, index: number): string | undefined {
  if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return undefined;
  const arg = node.arguments[index] as AnyNode | undefined;
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value;
  if (arg?.type === 'TemplateLiteral' && arg.expressions.length === 0)
    return arg.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

export interface Location {
  line?: number;
  column?: number;
  snippet?: string;
}

export function locate(node: Node, source: string): Location {
  const start = node.loc?.start;
  if (!start) return {};
  const snippet = source.split(/\r?\n/)[start.line - 1]?.trim();
  return { line: start.line, column: start.column + 1, snippet: snippet?.slice(0, 160) };
}

export const LOOP_TYPES = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
export const ITERATION_METHODS = new Set([
  'forEach',
  'map',
  'filter',
  'some',
  'every',
  'reduce',
  'find',
]);
export const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
