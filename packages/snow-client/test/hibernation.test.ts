import { describe, expect, it } from 'vitest';
import { looksLikeHibernation } from '../src';

describe('looksLikeHibernation', () => {
  it('detects a redirect to the developer portal', () => {
    expect(
      looksLikeHibernation({
        status: 302,
        location: 'https://developer.servicenow.com/dev.do#!/home?wu=true',
      }),
    ).toBe(true);
  });

  it('detects an HTML holding page', () => {
    expect(
      looksLikeHibernation({
        status: 200,
        contentType: 'text/html; charset=UTF-8',
        body: '<title>Instance Hibernating page</title>',
      }),
    ).toBe(true);
  });

  it('ignores normal JSON responses and unrelated redirects', () => {
    expect(
      looksLikeHibernation({ status: 200, contentType: 'application/json', body: '{"result":[]}' }),
    ).toBe(false);
    expect(
      looksLikeHibernation({ status: 302, location: 'https://dev1.service-now.com/login.do' }),
    ).toBe(false);
  });
});
