import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM, so ciphertext is both confidential and tamper-evident. The version prefix
// leaves room to rotate keys or algorithms without a data migration.
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

export function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptSecret(token: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = token.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unrecognised ciphertext format.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
