import { parse, type Program } from 'acorn';

export type ParseOutcome =
  { ok: true; ast: Program } | { ok: false; message: string; line?: number; column?: number };

/**
 * Parses a ServiceNow script. Options are lenient on purpose: platform scripts are ES5 in the
 * global scope (often a bare function declaration) and newer scoped apps allow modern syntax.
 */
export function parseScript(source: string): ParseOutcome {
  try {
    const ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
      allowReturnOutsideFunction: true,
      allowHashBang: true,
    });
    return { ok: true, ast };
  } catch (error) {
    const loc = (error as { loc?: { line: number; column: number } }).loc;
    const message = (error instanceof Error ? error.message : String(error)).replace(
      /\s*\(\d+:\d+\)$/,
      '',
    );
    return { ok: false, message, line: loc?.line, column: loc ? loc.column + 1 : undefined };
  }
}
