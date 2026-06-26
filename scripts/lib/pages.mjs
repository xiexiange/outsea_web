import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { slugify, normalizeSiteUrl } from './html.mjs';

export async function loadPagesForLocale(locale, pagesDir, markdownRender) {
  let entries = [];
  try {
    entries = await readdir(pagesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const pages = [];
  const localeFile = `index.${locale}.md`;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const sourceDir = path.resolve(pagesDir, dirName);
    const localizedPath = path.resolve(sourceDir, localeFile);
    let raw;
    try {
      raw = await readFile(localizedPath, 'utf8');
    } catch {
      const indexPath = path.resolve(sourceDir, 'index.md');
      try {
        raw = await readFile(indexPath, 'utf8');
        const { data } = matter(raw);
        const lang = String(data.lang || data.locale || '').trim().toLowerCase();
        if (lang && lang !== locale) continue;
      } catch {
        continue;
      }
    }

    const { data, content } = matter(raw);
    const title = String(data.title || dirName);
    const explicitSlug = slugify(data.slug ?? '');
    const fallbackSlug = slugify(dirName);
    const slug = explicitSlug || fallbackSlug || dirName;
    const description = String(data.description || '');
    const translationKey = String(data.translationKey || data.translation_key || dirName || slug);
    const { tocHtml, bodyHtml } = markdownRender(content, slug);

    pages.push({
      title,
      slug,
      locale,
      translationKey,
      description,
      html: tocHtml + bodyHtml,
      bodyHtml,
      tocHtml,
    });
  }

  pages.sort((a, b) => a.title.localeCompare(b.title, locale));
  return pages;
}

export function buildPageTranslationIndex(pagesByLocale, baseConfig) {
  const index = new Map();
  for (const [locale, pages] of Object.entries(pagesByLocale)) {
    const locMeta = baseConfig.locales?.[locale] || {};
    for (const p of pages) {
      const key = p.translationKey || p.slug;
      if (!index.has(key)) index.set(key, new Map());
      index.get(key).set(locale, {
        slug: p.slug,
        htmlLang: locMeta.htmlLang || locale,
      });
    }
  }
  return index;
}

export function resolvePageUrl(config, slug) {
  const base = normalizeSiteUrl(config.siteUrl).replace(/\/$/, '');
  const loc = config.locale || 'en';
  return `${base}/${loc}/${encodeURIComponent(slug)}/`;
}
