import { describe, expect, it } from 'vitest';
import { instanceBaseUrl, normalizeInstanceName, SnowInvalidInstanceError } from '../src';

describe('normalizeInstanceName', () => {
  it.each([
    ['dev12345', 'dev12345'],
    ['  Dev12345 ', 'dev12345'],
    ['dev12345.service-now.com', 'dev12345'],
    ['https://dev12345.service-now.com/now/nav/ui', 'dev12345'],
  ])('accepts %j', (input, expected) => {
    expect(normalizeInstanceName(input)).toBe(expected);
  });

  it.each(['', 'dev 1', 'evil.com/x', 'dev12345.evil.com', '-dev', 'a'.repeat(64), 'dev@x'])(
    'rejects %j so learner input cannot redirect requests',
    (input) => {
      expect(() => normalizeInstanceName(input)).toThrow(SnowInvalidInstanceError);
    },
  );
});

describe('instanceBaseUrl', () => {
  it('uses service-now.com by default', () => {
    expect(instanceBaseUrl('dev1')).toBe('https://dev1.service-now.com');
  });

  it('honours a test URL template', () => {
    expect(instanceBaseUrl('dev1', 'http://127.0.0.1:4010/{instance}/')).toBe('http://127.0.0.1:4010/dev1');
  });
});
