import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/scenario-sync';

describe('canonicalJson', () => {
  it('is independent of key order, including nested objects', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: [2, { x: 2, y: 1 }] }, b: 1 }),
    );
  });

  it('keeps array order significant', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});
