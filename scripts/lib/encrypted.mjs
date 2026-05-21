export function loadEncryptedRules(config) {
  const block = config?.encrypted || {};
  return {
    tags: Array.isArray(block.tags) ? block.tags.map(String) : [],
    slugs: Array.isArray(block.slugs) ? block.slugs.map(String) : [],
    from: String(block.from || 'web_blog').trim() || 'web_blog',
    authApiUrl: String(block.authApiUrl || '').trim(),
    sessionTtlHours: Number(block.sessionTtlHours) > 0 ? Number(block.sessionTtlHours) : 12,
  };
}

export function isEncryptedPost(data, slug, tags, rules) {
  if (data == null) return false;
  if (data.encrypted === true) return true;
  const s = String(data.encrypted ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (rules.slugs.includes(slug)) return true;
  if (rules.tags.length && tags.some((t) => rules.tags.includes(t))) return true;
  return false;
}
