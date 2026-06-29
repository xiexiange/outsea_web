/** Append Amazon Associates tag to product URLs when missing. */
export function applyAmazonAffiliateTag(url, affiliate = {}) {
  const raw = String(url || '').trim();
  if (!raw) return raw;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  if (parsed.searchParams.has('tag')) return raw;

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  const isProduct = /\/dp\/[A-Z0-9]{10}/i.test(path) || /\/gp\/product\//i.test(path);
  if (!isProduct) return raw;

  let tag = '';
  if (host.endsWith('amazon.com')) {
    tag = String(affiliate.amazon?.com || '').trim();
  } else if (host.endsWith('amazon.co.jp')) {
    tag = String(affiliate.amazon?.coJp || affiliate.amazon?.['co.jp'] || '').trim();
  }
  if (!tag) return raw;

  parsed.searchParams.set('tag', tag);
  return parsed.toString();
}

export function applyAffiliateTagsToContent(content, affiliate = {}) {
  const hasCom = Boolean(affiliate.amazon?.com);
  const hasJp = Boolean(affiliate.amazon?.coJp || affiliate.amazon?.['co.jp']);
  if (!hasCom && !hasJp) return content;

  const re = /https:\/\/(?:www\.)?amazon\.(?:com|co\.jp)\/[^\s)\]"']+/gi;
  return String(content).replace(re, (url) => applyAmazonAffiliateTag(url, affiliate));
}
