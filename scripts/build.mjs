import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { createMarkdownRenderer, contentUsesMermaid, contentUsesKatex } from './lib/markdown.mjs';
import {
  escapeHtml,
  slugify,
  stripHtml,
  readingMinutes,
  buildTagRegistry,
  getRelatedPosts,
  resolvePostUrl,
  resolveOgImage,
  layout,
  renderPostContent,
  renderPostContentEncrypted,
  renderPostTocAside,
  renderIndexContent,
  renderSearchContent,
  renderTagsIndexContent,
  renderTagArchiveContent,
  renderRss,
  renderSitemap,
  renderRootRedirect,
  renderSitemapIndex,
  renderHreflangLinks,
  renderLocaleSwitcher,
  renderPageContent,
  postJsonLd,
  siteJsonLd,
  buildLocaleHreflangGroup,
  renderRobots,
  normalizeSiteUrl,
} from './lib/html.mjs';
import { loadPagesForLocale, buildPageTranslationIndex, resolvePageUrl } from './lib/pages.mjs';
import { encryptPayload } from './lib/encrypt.mjs';
import { isEncryptedPost, loadEncryptedRules } from './lib/encrypted.mjs';
import { loadDotEnv } from './lib/dotenv.mjs';
import { getUi } from './lib/i18n.mjs';

const ROOT = process.cwd();
const CONTENT_DIR = path.resolve(ROOT, 'content', 'posts');
const PAGES_DIR = path.resolve(ROOT, 'content', 'pages');
const DIST_DIR = path.resolve(ROOT, 'dist');
const SITE_CONFIG_PATH = path.resolve(ROOT, 'site.config.json');

function parseDateStringAsLocal(s) {
  if (!s) return null;
  const str = String(s).trim();
  const withTime = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (withTime) {
    const [, y, mo, d, h, mi, se] = withTime;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), se === undefined ? 0 : Number(se));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0, 0);
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLocal(d) {
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatDateUtcWall(d) {
  if (!d) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function dateAndTextFromFrontmatter(raw) {
  if (raw == null || raw === '') return { date: null, dateText: '' };
  if (typeof raw === 'string') {
    const date = parseDateStringAsLocal(raw);
    return { date, dateText: date ? formatDateLocal(date) : '' };
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { date: raw, dateText: formatDateUtcWall(raw) };
  }
  const date = parseDateStringAsLocal(String(raw));
  return { date, dateText: date ? formatDateLocal(date) : '' };
}

function resolveCoverUrl(data, slug, locale) {
  const cover = data.cover ?? data.image;
  if (!cover) return '';
  const s = String(cover).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('./')) return `/${locale}/posts/${encodeURIComponent(slug)}/${s.slice(2)}`;
  if (s.startsWith('/')) return s;
  return `/${locale}/posts/${encodeURIComponent(slug)}/${s}`;
}

async function loadSiteConfig() {
  const defaults = {
    siteName: 'Outsea Picks',
    siteDescription: 'Curated product recommendations',
    siteUrl: 'https://example.com',
    defaultLocale: 'en',
    locales: { en: { label: 'English', htmlLang: 'en', dir: 'ltr' } },
    iconText: 'OP',
    iconImage: '',
    tutorialNav: [{ label: 'Home', url: '/' }],
  };

  try {
    const raw = await readFile(SITE_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const tutorialNav = Array.isArray(parsed.tutorialNav)
      ? parsed.tutorialNav
          .map((item) => ({
            label: String(item?.label || '').trim(),
            url: String(item?.url || '').trim(),
          }))
          .filter((item) => item.label && item.url)
      : defaults.tutorialNav;

    return {
      siteName: String(parsed.siteName || defaults.siteName),
      siteDescription: String(parsed.siteDescription || defaults.siteDescription),
      siteUrl: normalizeSiteUrl(parsed.siteUrl || defaults.siteUrl),
      defaultLocale: String(parsed.defaultLocale || defaults.defaultLocale),
      locales:
        parsed.locales && typeof parsed.locales === 'object' ? parsed.locales : defaults.locales,
      iconText: String(parsed.iconText || defaults.iconText),
      iconImage: parsed.iconImage != null ? String(parsed.iconImage).trim() : defaults.iconImage,
      tutorialNav: tutorialNav.length ? tutorialNav : defaults.tutorialNav,
      encrypted: parsed.encrypted && typeof parsed.encrypted === 'object' ? parsed.encrypted : {},
    };
  } catch {
    return defaults;
  }
}

function mergeLocaleConfig(base, locale) {
  const loc = base.locales?.[locale] || {};
  return {
    ...base,
    locale,
    htmlLang: loc.htmlLang || locale,
    dir: loc.dir || 'ltr',
    siteName: loc.siteName || base.siteName,
    siteDescription: loc.siteDescription || base.siteDescription,
    ui: getUi(locale),
  };
}

function iconSourcePathFromUrl(url) {
  if (!url) return null;
  if (url.startsWith('/assets/')) {
    const rel = url.slice('/assets/'.length).split('/').filter(Boolean);
    if (!rel.length) return null;
    return path.join(ROOT, 'src', 'assets', ...rel);
  }
  if (url.startsWith('/posts/')) {
    const rel = url.slice('/posts/'.length).split('/').filter(Boolean);
    if (!rel.length) return null;
    return path.join(CONTENT_DIR, ...rel);
  }
  return null;
}

async function resolveIconMarkup(config) {
  const imgUrl = (config.iconImage || '').trim();
  if (!imgUrl) {
    return `<span class="site-icon">${escapeHtml(config.iconText)}</span>`;
  }
  const fsPath = iconSourcePathFromUrl(imgUrl);
  if (!fsPath) {
    return `<span class="site-icon">${escapeHtml(config.iconText)}</span>`;
  }
  try {
    await stat(fsPath);
    return `<img class="site-icon site-icon-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(config.siteName)}" width="36" height="36" decoding="async" />`;
  } catch {
    return `<span class="site-icon">${escapeHtml(config.iconText)}</span>`;
  }
}

async function copyAssets() {
  await mkdir(path.resolve(DIST_DIR, 'assets'), { recursive: true });
  const styles = await readFile(path.resolve(ROOT, 'src', 'assets', 'styles.css'), 'utf8');
  const shikiCss = await readFile(path.resolve(ROOT, 'src', 'assets', 'shiki.css'), 'utf8');
  const siteJs = await readFile(path.resolve(ROOT, 'src', 'assets', 'site.js'), 'utf8');
  await writeFile(path.resolve(DIST_DIR, 'assets', 'styles.css'), styles);
  await writeFile(path.resolve(DIST_DIR, 'assets', 'shiki.css'), shikiCss);
  await writeFile(path.resolve(DIST_DIR, 'assets', 'site.js'), siteJs);

  const siteIcon = path.resolve(ROOT, 'src', 'assets', 'icon.webp');
  try {
    await copyFile(siteIcon, path.resolve(DIST_DIR, 'assets', 'icon.webp'));
    await copyFile(siteIcon, path.resolve(DIST_DIR, 'favicon.ico'));
  } catch {
    console.warn('warn: src/assets/icon.webp not copied');
  }

  const copies = [
    ['mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
    ['minisearch/dist/umd/index.js', 'minisearch.umd.js'],
    ['katex/dist/katex.min.css', 'katex.min.css'],
  ];
  for (const [from, to] of copies) {
    const src = path.resolve(ROOT, 'node_modules', ...from.split('/'));
    try {
      await copyFile(src, path.resolve(DIST_DIR, 'assets', to));
    } catch {
      console.warn(`warn: ${to} not copied (run npm install)`);
    }
  }

  const katexFonts = path.resolve(ROOT, 'node_modules', 'katex', 'dist', 'fonts');
  try {
    await copyDirRecursive(katexFonts, path.resolve(DIST_DIR, 'assets', 'fonts'));
  } catch {
    console.warn('warn: katex fonts not copied');
  }
}

async function copyDirRecursive(fromDir, toDir) {
  await mkdir(toDir, { recursive: true });
  const entries = await readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.resolve(fromDir, entry.name);
    const to = path.resolve(toDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(from, to);
      continue;
    }
    if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

function isPublishedFlag(data) {
  if (Object.prototype.hasOwnProperty.call(data, 'published')) {
    const v = data.published;
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no') return false;
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'draft')) {
    const v = data.draft;
    if (typeof v === 'boolean') return !v;
    const s = String(v).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return false;
    return true;
  }
  return true;
}

async function loadPostsForLocale(locale, markdownRender, encryptRules) {
  let entries = [];
  try {
    entries = await readdir(CONTENT_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const posts = [];
  const localeFile = `index.${locale}.md`;

  async function pushPost({ data, content, sourceDir, dirName, filename }) {
    if (!isPublishedFlag(data)) return;
    const title = data.title || dirName || filename?.replace(/\.md$/i, '') || 'untitled';
    const { date, dateText } = dateAndTextFromFrontmatter(data.date);
    const tags = Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : [];
    const explicitSlug = slugify(data.slug ?? '');
    const fallbackSlug = slugify(dirName || filename?.replace(/\.md$/i, '')) || slugify(title);
    const slug = explicitSlug || fallbackSlug || `post-${posts.length + 1}`;
    const description = String(data.description || '');
    const tagList = tags.map(String);
    const encrypted = isEncryptedPost(data, slug, tagList, encryptRules);
    const translationKey = String(data.translationKey || data.translation_key || dirName || slug);
    const { tocHtml, bodyHtml } = markdownRender(content, slug);
    const html = tocHtml + bodyHtml;
    const plain = encrypted ? '' : stripHtml(html);
    posts.push({
      title: String(title),
      slug,
      locale,
      translationKey,
      date,
      dateText,
      tags: tagList,
      description,
      html,
      tocHtml,
      bodyHtml,
      plain,
      readingMinutes: readingMinutes(encrypted ? description : plain),
      coverUrl: resolveCoverUrl(data, slug, locale),
      sourceDir,
      encrypted,
      enableMermaid: contentUsesMermaid(html),
      enableKatex: contentUsesKatex(html),
    });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const sourceDir = path.resolve(CONTENT_DIR, dirName);
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
    await pushPost({ data, content, sourceDir, dirName });
  }

  posts.sort((a, b) => {
    const at = a.date ? a.date.getTime() : 0;
    const bt = b.date ? b.date.getTime() : 0;
    return bt - at || a.title.localeCompare(b.title, locale);
  });
  return posts;
}

function buildTranslationIndex(postsByLocale, baseConfig) {
  const index = new Map();
  for (const [locale, posts] of Object.entries(postsByLocale)) {
    const locMeta = baseConfig.locales?.[locale] || {};
    for (const p of posts) {
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

function getTranslationGroup(translationIndex, translationKey) {
  return translationIndex.get(translationKey) || new Map();
}

async function buildLocale(locale, baseConfig, posts, translationIndex, pageTranslationIndex, pages, encryptKey) {
  const config = mergeLocaleConfig(baseConfig, locale);
  config.iconMarkup = baseConfig.iconMarkup;
  config.encryptedSlugs = new Set(posts.filter((p) => p.encrypted).map((p) => p.slug));
  const encryptRules = loadEncryptedRules(config);

  const localeDist = path.resolve(DIST_DIR, locale);
  const postsOutDir = path.resolve(localeDist, 'posts');
  await mkdir(postsOutDir, { recursive: true });
  await mkdir(path.resolve(localeDist, 'search'), { recursive: true });
  await mkdir(path.resolve(localeDist, 'tags'), { recursive: true });

  const { tagToSlug, slugToTag } = buildTagRegistry(posts);
  const siteBase = normalizeSiteUrl(config.siteUrl).replace(/\/$/, '');
  const localeBase = `${siteBase}/${locale}`;
  const homeHreflangHtml = renderHreflangLinks(config, buildLocaleHreflangGroup(config), '/');

  const globalSwitcher = renderLocaleSwitcher(config, new Map(), '/');

  await writeFile(
    path.resolve(localeDist, 'index.html'),
    layout({
      title: config.siteName,
      description: config.siteDescription,
      config,
      posts,
      activeSlug: '',
      contentHtml: renderIndexContent(config, posts),
      localeSwitcherHtml: globalSwitcher,
      headExtra: {
        canonicalUrl: `${localeBase}/`,
        hreflangHtml: homeHreflangHtml,
        ogType: 'website',
        ogImage: resolveOgImage(config, {}),
        jsonLd: siteJsonLd(config),
      },
    }),
    'utf8'
  );

  await writeFile(
    path.resolve(localeDist, 'search', 'index.html'),
    layout({
      title: `${config.ui.search} · ${config.siteName}`,
      description: config.siteDescription,
      config,
      posts,
      activeSlug: '',
      contentHtml: renderSearchContent(config),
      headExtra: { canonicalUrl: `${localeBase}/search/`, robots: 'noindex, follow' },
    }),
    'utf8'
  );

  const tagCounts = new Map();
  for (const p of posts) {
    for (const t of p.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const tagEntries = [...tagToSlug.entries()].map(([label, slug]) => ({
    label,
    slug,
    count: tagCounts.get(label) || 0,
  }));

  await writeFile(
    path.resolve(localeDist, 'tags', 'index.html'),
    layout({
      title: `${config.ui.tags} · ${config.siteName}`,
      description: config.siteDescription,
      config,
      posts,
      activeSlug: '',
      contentHtml: renderTagsIndexContent(config, tagEntries),
      headExtra: { canonicalUrl: `${localeBase}/tags/` },
    }),
    'utf8'
  );

  for (const [slug, label] of slugToTag.entries()) {
    const tagPosts = posts.filter((p) => p.tags.includes(label));
    await mkdir(path.resolve(localeDist, 'tags', slug), { recursive: true });
    await writeFile(
      path.resolve(localeDist, 'tags', slug, 'index.html'),
      layout({
        title: `${label} · ${config.ui.tags} · ${config.siteName}`,
        description: `${config.ui.tagArchive}: ${label}`,
        config,
        posts,
        activeSlug: '',
        contentHtml: renderTagArchiveContent(config, label, tagPosts),
        headExtra: { canonicalUrl: `${localeBase}/tags/${encodeURIComponent(slug)}/` },
      }),
      'utf8'
    );
  }

  for (const page of pages) {
    const outDir = path.resolve(localeDist, page.slug);
    await mkdir(outDir, { recursive: true });
    const canonicalUrl = resolvePageUrl(config, page.slug);
    const pagePath = `/${encodeURIComponent(page.slug)}/`;
    const translationGroup = pageTranslationIndex.get(page.translationKey) || new Map();
    const hreflangHtml = renderHreflangLinks(config, translationGroup, pagePath);
    const localeSwitcherHtml = renderLocaleSwitcher(config, translationGroup, pagePath);

    await writeFile(
      path.resolve(outDir, 'index.html'),
      layout({
        title: `${page.title} · ${config.siteName}`,
        description: page.description || page.title,
        config,
        posts,
        activeSlug: '',
        contentHtml: renderPageContent(page, config),
        localeSwitcherHtml,
        headExtra: {
          canonicalUrl,
          hreflangHtml,
          ogType: 'website',
          ogImage: resolveOgImage(config, {}),
        },
      }),
      'utf8'
    );
  }

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const prevPost = posts[i + 1] || null;
    const nextPost = posts[i - 1] || null;
    const relatedPosts = getRelatedPosts(p, posts);
    const outDir = path.resolve(postsOutDir, p.slug);
    await mkdir(outDir, { recursive: true });

    if (p.sourceDir) {
      const imagesSrcDir = path.resolve(p.sourceDir, 'images');
      try {
        const st = await stat(imagesSrcDir);
        if (st.isDirectory()) {
          await copyDirRecursive(imagesSrcDir, path.resolve(outDir, 'images'));
        }
      } catch {
        // ignore
      }
      try {
        const entries = await readdir(p.sourceDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isFile()) continue;
          const lower = ent.name.toLowerCase();
          if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(lower)) continue;
          await copyFile(
            path.resolve(p.sourceDir, ent.name),
            path.resolve(outDir, ent.name)
          );
        }
      } catch {
        // ignore
      }
    }

    const canonicalUrl = resolvePostUrl(config, p.slug);
    const ogImage = resolveOgImage(config, p);
    const postPath = `/posts/${encodeURIComponent(p.slug)}/`;
    const translationGroup = getTranslationGroup(translationIndex, p.translationKey);
    const hreflangHtml = renderHreflangLinks(config, translationGroup, postPath);
    const localeSwitcherHtml = renderLocaleSwitcher(config, translationGroup, postPath);

    if (p.encrypted) {
      if (!encryptKey) {
        throw new Error(`Post "${p.slug}" (${locale}) is encrypted but BLOG_ENCRYPT_KEY is not set`);
      }
      const envelope = encryptPayload(encryptKey, {
        tocHtml: p.tocHtml,
        bodyHtml: p.bodyHtml,
        enableMermaid: p.enableMermaid,
        enableKatex: p.enableKatex,
      });
      await writeFile(path.resolve(outDir, 'body.enc.json'), JSON.stringify(envelope), 'utf8');
      await writeFile(
        path.resolve(outDir, 'index.html'),
        layout({
          title: `${p.title} · ${config.siteName}`,
          description: p.description || config.ui.encrypted,
          config,
          posts,
          activeSlug: p.slug,
          contentHtml: renderPostContentEncrypted(p, {
            config,
            tagToSlug,
            relatedPosts,
            prevPost,
            nextPost,
          }),
          tocAsideHtml: '',
          enableMermaid: false,
          enableKatex: false,
          localeSwitcherHtml,
          headExtra: {
            canonicalUrl,
            hreflangHtml,
            ogType: 'article',
            ogImage,
            jsonLd: postJsonLd(config, p),
          },
        }),
        'utf8'
      );
      continue;
    }

    await writeFile(
      path.resolve(outDir, 'index.html'),
      layout({
        title: `${p.title} · ${config.siteName}`,
        description: p.description,
        config,
        posts,
        activeSlug: p.slug,
        contentHtml: renderPostContent(p, {
          config,
          tagToSlug,
          relatedPosts,
          prevPost,
          nextPost,
        }),
        tocAsideHtml: renderPostTocAside(p.tocHtml, config),
        enableMermaid: p.enableMermaid,
        enableKatex: p.enableKatex,
        localeSwitcherHtml,
        headExtra: {
          canonicalUrl,
          hreflangHtml,
          ogType: 'article',
          ogImage,
          jsonLd: postJsonLd(config, p),
        },
      }),
      'utf8'
    );
  }

  const rssPosts = posts.filter((p) => !p.encrypted);
  await writeFile(path.resolve(localeDist, 'rss.xml'), renderRss(rssPosts, config), 'utf8');
  await writeFile(
    path.resolve(localeDist, 'sitemap.xml'),
    renderSitemap(config, posts, [...slugToTag.keys()], pages),
    'utf8'
  );
  await writeFile(
    path.resolve(DIST_DIR, 'assets', `search-index.${locale}.json`),
    JSON.stringify(
      posts.map((p) => ({
        id: p.slug,
        title: p.title,
        slug: p.slug,
        dateText: p.dateText,
        description: p.description,
        tags: p.tags.join(','),
        content: p.encrypted ? '' : p.plain,
      }))
    ),
    'utf8'
  );

  return { postCount: posts.length, tagCount: tagEntries.length, pageCount: pages.length };
}

await loadDotEnv(ROOT);
await mkdir(DIST_DIR, { recursive: true });
await copyAssets();

const baseConfig = await loadSiteConfig();
baseConfig.iconMarkup = await resolveIconMarkup(baseConfig);
const localeList = Object.keys(baseConfig.locales || { en: {} });
if (!localeList.length) localeList.push('en');

const encryptRules = loadEncryptedRules(baseConfig);
const encryptKey = process.env.BLOG_ENCRYPT_KEY || '';
if (encryptRules.authApiUrl && !encryptKey) {
  console.warn('warn: encrypted.authApiUrl is set but BLOG_ENCRYPT_KEY is empty');
}

const postsByLocale = {};
const pagesByLocale = {};
for (const locale of localeList) {
  const markdownRenderer = await createMarkdownRenderer(locale);
  postsByLocale[locale] = await loadPostsForLocale(locale, markdownRenderer.render, encryptRules);
  pagesByLocale[locale] = await loadPagesForLocale(locale, PAGES_DIR, markdownRenderer.render);
}

const translationIndex = buildTranslationIndex(postsByLocale, baseConfig);
const pageTranslationIndex = buildPageTranslationIndex(pagesByLocale, baseConfig);

let totalPosts = 0;
let totalPages = 0;
for (const locale of localeList) {
  const stats = await buildLocale(
    locale,
    baseConfig,
    postsByLocale[locale] || [],
    translationIndex,
    pageTranslationIndex,
    pagesByLocale[locale] || [],
    encryptKey
  );
  totalPosts += stats.postCount;
  totalPages += stats.pageCount;
  console.log(
    `  [${locale}] ${stats.postCount} post(s), ${stats.pageCount} page(s), ${stats.tagCount} tag(s)`
  );
}

await writeFile(
  path.resolve(DIST_DIR, 'index.html'),
  renderRootRedirect(baseConfig.defaultLocale || 'en'),
  'utf8'
);
await writeFile(
  path.resolve(DIST_DIR, 'sitemap.xml'),
  renderSitemapIndex(baseConfig, localeList),
  'utf8'
);
await writeFile(path.resolve(DIST_DIR, 'robots.txt'), renderRobots(baseConfig), 'utf8');

const defaultLocale = baseConfig.defaultLocale || 'en';
const redirectLines = [
  `/ /${defaultLocale}/ 302`,
  ...localeList.map((loc) => `/${loc} /${loc}/ 302`),
  '',
].join('\n');
await writeFile(path.resolve(DIST_DIR, '_redirects'), redirectLines, 'utf8');

console.log(`built: ${totalPosts} post(s), ${totalPages} page(s) across ${localeList.length} locale(s) -> dist/`);
