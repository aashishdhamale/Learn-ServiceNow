export { applyEncodedQuery, type QueryContext } from './encoded-query';
export {
  FakeInstance,
  type FakeInstanceOptions,
  type FakeMode,
  type FakeOAuthClient,
  type FakeSuite,
  type FakeUser,
} from './fake-instance';

/** A TokenProvider that always returns the same token; pairs with FakeInstance's staticTokens. */
export function staticTokens(token = 'test-token') {
  return {
    getAccessToken: async () => token,
    refreshAccessToken: async () => token,
  };
}

/** sleep() that resolves immediately and records requested delays. */
export function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => void delays.push(ms) };
}
