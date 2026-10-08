import { describeSnowError, SnowForbiddenError, isSnowError } from './errors';
import { encodedQuery } from './query';
import type { SnowClient } from './client';

/**
 * Overall connection state, from most to least severe. DEGRADED means Script Lab layers 1–2
 * work but functional testing (ATF) will be blocked.
 */
export type HealthStatus =
  | 'OK'
  | 'DEGRADED'
  | 'MISSING_ACCESS'
  | 'AUTH_EXPIRED'
  | 'HIBERNATING'
  | 'INSTANCE_NOT_FOUND'
  | 'UNREACHABLE'
  | 'ERROR';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped';

export interface HealthCheckItem {
  id: 'instance' | 'auth' | 'tables' | 'cicd-role' | 'atf-enabled';
  label: string;
  status: CheckStatus;
  message: string;
  action?: string;
}

export interface HealthReport {
  status: HealthStatus;
  headline: string;
  action?: string;
  checks: HealthCheckItem[];
  user?: { sysId: string; userName: string; name: string; roles: string[] };
  /** Value of glide.buildname, when the instance exposes it. */
  release?: string;
  checkedAt: string;
}

export interface HealthCheckOptions {
  /** Tables the Script Lab reads (from all scenarios' structure checks). */
  requiredTables: string[];
  now?: () => Date;
}

const CICD_ROLES = ['admin', 'sn_cicd.sys_ci_automation'];
const ATF_PROPERTY = 'sn_atf.runner.enabled';
const BUILD_PROPERTY = 'glide.buildname';

export async function checkConnection(
  client: SnowClient,
  options: HealthCheckOptions,
): Promise<HealthReport> {
  const checkedAt = (options.now?.() ?? new Date()).toISOString();
  const checks: HealthCheckItem[] = [];

  let user: HealthReport['user'];
  try {
    user = await currentUser(client);
  } catch (error) {
    return failedReachability(error, client.instance, checkedAt);
  }
  checks.push({
    id: 'instance',
    label: 'Instance reachable',
    status: 'ok',
    message: `${client.instance} is awake.`,
  });
  checks.push({
    id: 'auth',
    label: 'Signed in',
    status: 'ok',
    message: user
      ? `Connected as ${user.name || user.userName}.`
      : 'Connected (could not identify the user).',
  });

  const tableCheck = await checkTables(client, options.requiredTables);
  checks.push(tableCheck);

  const isAdmin = user?.roles.includes('admin') ?? false;
  const hasCicdRole = user ? user.roles.some((r) => CICD_ROLES.includes(r)) : undefined;
  checks.push(
    hasCicdRole === undefined
      ? {
          id: 'cicd-role',
          label: 'Can run ATF suites (CI/CD API)',
          status: 'warn',
          message: 'Could not read your roles, so this could not be confirmed.',
        }
      : hasCicdRole
        ? {
            id: 'cicd-role',
            label: 'Can run ATF suites (CI/CD API)',
            status: 'ok',
            message: isAdmin ? 'You have the admin role.' : 'You have sn_cicd.sys_ci_automation.',
          }
        : {
            id: 'cicd-role',
            label: 'Can run ATF suites (CI/CD API)',
            status: 'fail',
            message: 'Your user has neither admin nor sn_cicd.sys_ci_automation.',
            action:
              'Grant sn_cicd.sys_ci_automation to your user, or connect as the PDI admin user.',
          },
  );

  const properties = await readProperties(client);
  checks.push(atfCheck(properties[ATF_PROPERTY]));

  const status = overallStatus(checks);
  return {
    status,
    ...headlineFor(status, client.instance),
    checks,
    user,
    release: properties[BUILD_PROPERTY] || undefined,
    checkedAt,
  };
}

async function currentUser(client: SnowClient): Promise<HealthReport['user']> {
  const [record] = await client.table.list('sys_user', {
    query: 'sys_id=javascript:gs.getUserID()',
    fields: ['sys_id', 'user_name', 'name'],
    limit: 1,
  });
  if (!record?.sys_id) return undefined;
  let roles: string[] = [];
  try {
    const rows = await client.table.list('sys_user_has_role', {
      query: encodedQuery([
        { field: 'user', value: record.sys_id },
        { field: 'state', value: 'active' },
      ]),
      fields: ['role.name'],
      limit: 500,
    });
    roles = [...new Set(rows.map((r) => r['role.name'] ?? '').filter(Boolean))];
  } catch (error) {
    if (!(error instanceof SnowForbiddenError)) throw error;
  }
  return { sysId: record.sys_id, userName: record.user_name ?? '', name: record.name ?? '', roles };
}

async function checkTables(client: SnowClient, tables: string[]): Promise<HealthCheckItem> {
  const forbidden: string[] = [];
  const empty: string[] = [];
  for (const table of [...new Set(tables)].sort()) {
    try {
      const rows = await client.table.list(table, { fields: ['sys_id'], limit: 1 });
      if (rows.length === 0) empty.push(table);
    } catch (error) {
      if (error instanceof SnowForbiddenError) forbidden.push(table);
      else throw error;
    }
  }
  if (forbidden.length > 0) {
    return {
      id: 'tables',
      label: 'Can read your scripts',
      status: 'fail',
      message: `Access denied to: ${forbidden.join(', ')}.`,
      action:
        'Connect as a user with the admin role so the Script Lab can read your configuration.',
    };
  }
  if (empty.length > 0) {
    return {
      id: 'tables',
      label: 'Can read your scripts',
      status: 'warn',
      message: `No records visible in: ${empty.join(', ')}. Your user may lack read access.`,
    };
  }
  return {
    id: 'tables',
    label: 'Can read your scripts',
    status: 'ok',
    message: `Read access to ${tables.length} table(s).`,
  };
}

async function readProperties(client: SnowClient): Promise<Record<string, string>> {
  try {
    const rows = await client.table.list('sys_properties', {
      query: encodedQuery([
        { field: 'name', operator: 'IN', value: [ATF_PROPERTY, BUILD_PROPERTY] },
      ]),
      fields: ['name', 'value'],
      limit: 10,
    });
    return Object.fromEntries(rows.map((r) => [r.name ?? '', r.value ?? '']));
  } catch (error) {
    if (error instanceof SnowForbiddenError) return {};
    throw error;
  }
}

function atfCheck(value: string | undefined): HealthCheckItem {
  const base = { id: 'atf-enabled' as const, label: 'ATF test execution enabled' };
  if (value === 'false') {
    return {
      ...base,
      status: 'fail',
      message: 'Test and test suite execution is disabled on this instance.',
      action:
        'In your PDI open Automated Test Framework > Administration > Properties and set "Enable test/test suite execution" to Yes.',
    };
  }
  if (value === 'true') return { ...base, status: 'ok', message: 'ATF can run tests.' };
  return {
    ...base,
    status: 'warn',
    message: `Could not read ${ATF_PROPERTY}; layer 3 will tell you if ATF is off.`,
  };
}

function overallStatus(checks: HealthCheckItem[]): HealthStatus {
  const failed = (id: HealthCheckItem['id']) =>
    checks.some((c) => c.id === id && c.status === 'fail');
  if (failed('tables')) return 'MISSING_ACCESS';
  if (failed('cicd-role') || failed('atf-enabled')) return 'DEGRADED';
  return 'OK';
}

function headlineFor(
  status: HealthStatus,
  instance: string,
): { headline: string; action?: string } {
  switch (status) {
    case 'OK':
      return { headline: `${instance} is connected and ready for the Script Lab.` };
    case 'DEGRADED':
      return {
        headline: 'Connected, but ATF suites cannot run yet. Layer 3 will be blocked.',
        action: 'Fix the failing checks below.',
      };
    case 'MISSING_ACCESS':
      return {
        headline: 'Connected, but your user cannot read the configuration the Script Lab checks.',
        action: 'Connect as a user with the admin role.',
      };
    default:
      return { headline: 'Connection problem.' };
  }
}

function failedReachability(error: unknown, instance: string, checkedAt: string): HealthReport {
  const described = describeSnowError(error, instance);
  const code = isSnowError(error) ? error.code : undefined;
  const status: HealthStatus =
    code === 'HIBERNATING'
      ? 'HIBERNATING'
      : code === 'INSTANCE_NOT_FOUND' || code === 'INVALID_INSTANCE'
        ? 'INSTANCE_NOT_FOUND'
        : code === 'UNREACHABLE' || code === 'TIMEOUT'
          ? 'UNREACHABLE'
          : code === 'UNAUTHORIZED' || code === 'OAUTH_ERROR'
            ? 'AUTH_EXPIRED'
            : code === 'FORBIDDEN'
              ? 'MISSING_ACCESS'
              : 'ERROR';
  const instanceOk = status === 'AUTH_EXPIRED' || status === 'MISSING_ACCESS';
  return {
    status,
    headline: described.message.startsWith(described.title)
      ? described.message
      : `${described.title}. ${described.message}`,
    action: described.action,
    checks: [
      {
        id: 'instance',
        label: 'Instance reachable',
        status: instanceOk ? 'ok' : 'fail',
        message: instanceOk ? `${instance} is awake.` : described.message,
        action: instanceOk ? undefined : described.action,
      },
      {
        id: 'auth',
        label: 'Signed in',
        status: instanceOk ? 'fail' : 'skipped',
        message: instanceOk ? described.message : 'Not checked.',
        action: instanceOk ? described.action : undefined,
      },
    ],
    checkedAt,
  };
}
