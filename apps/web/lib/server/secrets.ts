import 'server-only';
import { decryptSecret, encryptSecret, parseKey } from './crypto';
import { serverEnv } from './env';

let key: Buffer | undefined;

function encryptionKey(): Buffer {
  key ??= parseKey(serverEnv().TOKEN_ENCRYPTION_KEY);
  return key;
}

export const seal = (plaintext: string) => encryptSecret(plaintext, encryptionKey());
export const unseal = (token: string) => decryptSecret(token, encryptionKey());
