import { describe, expect, it } from 'vitest';
import { encodedQuery, EncodedQueryError } from '../src';

describe('encodedQuery', () => {
  it('joins conditions and ordering', () => {
    expect(
      encodedQuery(
        [
          { field: 'table', value: 'incident' },
          { field: 'script', operator: 'LIKE', value: 'VipCallerAjax' },
          { field: 'name', operator: 'IN', value: ['a', 'b'] },
          { field: 'active', value: true },
        ],
        { orderByDesc: 'sys_updated_on' },
      ),
    ).toBe(
      'table=incident^scriptLIKEVipCallerAjax^nameINa,b^active=true^ORDERBYDESCsys_updated_on',
    );
  });

  it('rejects values that would inject extra conditions', () => {
    expect(() => encodedQuery([{ field: 'name', value: 'x^ORactive=true' }])).toThrow(
      EncodedQueryError,
    );
  });

  it('rejects invalid field names', () => {
    expect(() => encodedQuery([{ field: 'name;drop', value: 'x' }])).toThrow(EncodedQueryError);
  });
});
