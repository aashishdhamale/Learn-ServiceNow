import { z } from 'zod';
import type { SnowHttp } from './http';

/** Table API records with every value flattened to a string, as stored in the database. */
export type SnowRecord = Record<string, string>;

export interface ListOptions {
  /** Encoded query; build it with encodedQuery(). */
  query?: string;
  fields?: string[];
  limit?: number;
}

const TABLE_NAME = /^[a-z0-9_]+$/;
const ListResponse = z.object({ result: z.array(z.record(z.string(), z.unknown())) });

/** Read-only Table API. There are deliberately no write methods. */
export class TableApi {
  constructor(private readonly http: SnowHttp) {}

  async list(table: string, options: ListOptions = {}): Promise<SnowRecord[]> {
    if (!TABLE_NAME.test(table)) throw new Error(`"${table}" is not a valid table name.`);
    const response = await this.http.request({
      path: `/api/now/table/${table}`,
      query: {
        sysparm_query: options.query,
        sysparm_fields: options.fields?.join(','),
        sysparm_limit: options.limit ?? 100,
        sysparm_exclude_reference_link: true,
        sysparm_display_value: false,
      },
      schema: ListResponse,
    });
    return response.result.map(flattenRecord);
  }
}

function flattenRecord(record: Record<string, unknown>): SnowRecord {
  const flat: SnowRecord = {};
  for (const [key, value] of Object.entries(record)) flat[key] = flattenValue(value);
  return flat;
}

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const inner = (value as { value?: unknown }).value;
    return inner === undefined ? JSON.stringify(value) : flattenValue(inner);
  }
  return String(value);
}
