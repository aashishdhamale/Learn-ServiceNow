/**
 * A hibernating PDI does not answer API calls with JSON. Depending on its state it redirects
 * to the developer portal or serves an HTML holding page. These heuristics are deliberately
 * broad; tune them with a captured response if a real hibernation page slips through.
 */
export interface RawResponseInfo {
  status: number;
  location?: string | null;
  contentType?: string | null;
  body?: string;
}

const PORTAL_HOST = /developer\.servicenow\.com/i;
const HIBERNATION_TEXT =
  /hibernat|instance (?:is )?(?:asleep|sleeping|waking)|wake (?:up )?(?:your|the) instance/i;

export function looksLikeHibernation(response: RawResponseInfo): boolean {
  if (response.status >= 300 && response.status < 400) {
    return Boolean(
      response.location &&
      (PORTAL_HOST.test(response.location) || /hibernat/i.test(response.location)),
    );
  }
  const isHtml = (response.contentType ?? '').includes('text/html');
  if (!isHtml || !response.body) return false;
  return HIBERNATION_TEXT.test(response.body) || PORTAL_HOST.test(response.body);
}
