/**
 * A small evaluator for the encoded-query subset the app sends: conditions joined by ^,
 * operators = != LIKE STARTSWITH IN, ORDERBY/ORDERBYDESC, and javascript:gs.getUserID().
 */
export interface QueryContext {
  currentUserId: string;
}

type Row = Record<string, string>;

interface Condition {
  field: string;
  operator: string;
  value: string;
}

const CONDITION = /^([a-z0-9_.]+)(!=|=|LIKE|STARTSWITH|IN)(.*)$/;

export function applyEncodedQuery(rows: Row[], query: string | null, context: QueryContext): Row[] {
  if (!query) return rows;
  const conditions: Condition[] = [];
  const order: Array<{ field: string; desc: boolean }> = [];
  for (const part of query.split('^')) {
    if (part.startsWith('ORDERBYDESC')) order.push({ field: part.slice(11), desc: true });
    else if (part.startsWith('ORDERBY')) order.push({ field: part.slice(7), desc: false });
    else {
      const match = CONDITION.exec(part);
      if (!match) throw new Error(`Fake instance cannot evaluate query part "${part}"`);
      const value = match[3] === 'javascript:gs.getUserID()' ? context.currentUserId : match[3]!;
      conditions.push({ field: match[1]!, operator: match[2]!, value });
    }
  }
  const filtered = rows.filter((row) => conditions.every((c) => matches(row[c.field] ?? '', c)));
  for (const { field, desc } of [...order].reverse()) {
    filtered.sort((a, b) => (desc ? -1 : 1) * (a[field] ?? '').localeCompare(b[field] ?? ''));
  }
  return filtered;
}

function matches(actual: string, { operator, value }: Condition): boolean {
  switch (operator) {
    case '=':
      return actual === value;
    case '!=':
      return actual !== value;
    case 'LIKE':
      return actual.toLowerCase().includes(value.toLowerCase());
    case 'STARTSWITH':
      return actual.toLowerCase().startsWith(value.toLowerCase());
    case 'IN':
      return value.split(',').includes(actual);
    default:
      return false;
  }
}
