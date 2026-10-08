import { SnowInvalidInstanceError } from './errors';

// Instance names are DNS labels. Validating strictly keeps learner input from steering
// requests (and bearer tokens) to arbitrary hosts.
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Accepts "dev12345", "Dev12345", "dev12345.service-now.com" or a full https URL and
 * returns the bare instance name. Throws SnowInvalidInstanceError otherwise.
 */
export function normalizeInstanceName(input: string): string {
  let name = input.trim().toLowerCase();
  name = name.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  name = name.replace(/\.service-now\.com$/, '');
  if (!INSTANCE_NAME.test(name)) throw new SnowInvalidInstanceError(input);
  return name;
}

/**
 * Base URL for an instance. `template` (SNOW_INSTANCE_URL_TEMPLATE) exists for tests and the
 * e2e mock server; "{instance}" in it is replaced with the instance name.
 */
export function instanceBaseUrl(instance: string, template?: string): string {
  const name = normalizeInstanceName(instance);
  if (template) return template.replaceAll('{instance}', name).replace(/\/+$/, '');
  return `https://${name}.service-now.com`;
}
