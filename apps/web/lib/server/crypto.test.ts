import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, parseKey } from './crypto';

const key = randomBytes(32);

describe('secret encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const token = encryptSecret('refresh-token-123', key);
    expect(token.startsWith('v1:')).toBe(true);
    expect(token).not.toContain('refresh-token-123');
    expect(decryptSecret(token, key)).toBe('refresh-token-123');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const token = encryptSecret('secret', key);
    const parts = token.split(':');
    const tampered = [...parts.slice(0, 3), Buffer.from('other').toString('base64url')].join(':');
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(token, randomBytes(32))).toThrow();
  });

  it('validates key length', () => {
    expect(() => parseKey(Buffer.from('short').toString('base64'))).toThrow(/32 bytes/);
    expect(parseKey(key.toString('base64'))).toHaveLength(32);
  });
});
