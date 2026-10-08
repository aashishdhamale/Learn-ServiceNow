/** Builds ServiceNow encoded queries from structured conditions, rejecting injection. */
export type QueryOperator = '=' | '!=' | 'LIKE' | 'STARTSWITH' | 'IN';

export interface QueryCondition {
  field: string;
  operator?: QueryOperator;
  value: string | number | boolean | Array<string | number>;
}

const FIELD = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;

export class EncodedQueryError extends Error {}

export function encodedQuery(
  conditions: QueryCondition[],
  options: { orderBy?: string; orderByDesc?: string } = {},
): string {
  const parts = conditions.map(({ field, operator = '=', value }) => {
    assertField(field);
    const text = Array.isArray(value) ? value.map(String).join(',') : String(value);
    if (/[\^\r\n]/.test(text)) {
      throw new EncodedQueryError(`Query value for "${field}" must not contain ^ or line breaks.`);
    }
    return `${field}${operator}${text}`;
  });
  if (options.orderBy) {
    assertField(options.orderBy);
    parts.push(`ORDERBY${options.orderBy}`);
  }
  if (options.orderByDesc) {
    assertField(options.orderByDesc);
    parts.push(`ORDERBYDESC${options.orderByDesc}`);
  }
  return parts.join('^');
}

function assertField(field: string) {
  if (!FIELD.test(field)) throw new EncodedQueryError(`"${field}" is not a valid field name.`);
}
