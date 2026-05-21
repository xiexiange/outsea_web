import { getUi, localePath } from './i18n.mjs';

export function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function slugify(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function readingMinutes(plain) {
  const cjk = (plain.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = plain.split(/\s+/).filter(Boolean).length;
  const minutes = Math.ceil(cjk / 400 + words / 200);
  return Math.max(1, minutes);
}

export function buildTagRegistry(posts) {
  const tagToSlug = new Map();
  const slugToTag = new Map();
  const used = new Set();

  for (const post of posts) {
    for (const tag of post.tags) {
      if (tagToSlug.has(tag)) continue;
      let base = slugify(tag);
      if (!base) {
        base = `tag-${Buffer.from(tag, 'utf8').toString('hex').slice(0, 12)}`;
      }
      let slug = base;
      let i = 1;
      while (used.has(slug)) {
        slug = `${base}-${i++}`;
      }
      used.add(slug);
      tagToSlug.set(tag, slug);
      slugToTag.set(slug, tag);
    }
  }
  return { tagToSlug, slugToTag };
}

export function getRelatedPosts(post, allPosts, limit = 3) {
  return allPosts
    .filter((p) => p.slug !== post.slug)
    .map((p) => ({
      post: p,
      score: p.tags.filter((t) => post.tags.includes(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.post.date?.getTime() || 0) - (a.post.date?.getTime() || 0))
    .slice(0, limit)
    .map((x) => x.post);
}

export function resolvePostUrl(config, slug) {
  const base = String(config.siteUrl || '').replace(/\/$/, '');
  const loc = config.locale || 'en';
  return `${base}/${loc}/posts/${encodeURIComponent(slug)}/`;
}

export function resolveOgImage(config, post) {
  const siteBase = String(config.siteUrl || '').replace(/\/$/, '');
  if (post.coverUrl) {
    return post.coverUrl.startsWith('http')
      ? post.coverUrl
      : `${siteBase}${post.coverUrl.startsWith('/') ? '' : '/'}${post.coverUrl}`;
  }
  if (config.iconImage) {
    const img = config.iconImage;
    return img.startsWith('http') ? img : `${siteBase}${img}`;
  }
  return '';
}

function lp(config, pathname) {
  return localePath(config.locale || 'en', pathname);
}

function navHref(config, url) {
  const u = String(url || '').trim();
  if (!u || u.startsWith('http://') || u.startsWith('https://') || u.startsWith('#')) return u;
  return lp(config, u.startsWith('/') ? u : `/${u}`);
}

export function renderHreflangLinks(config, translationGroup, canonicalPath) {
  if (!translationGroup?.size) return '';
  const base = String(config.siteUrl || '').replace(/\/$/, '');
  const links = [];
  for (const [loc, entry] of translationGroup.entries()) {
    const href = `${base}/${loc}${canonicalPath}`;
    links.push(`<link rel="alternate" hreflang="${escapeHtml(entry.htmlLang || loc)}" href="${escapeHtml(href)}" />`);
  }
  const def = config.defaultLocale || 'en';
  if (translationGroup.has(def)) {
    const entry = translationGroup.get(def);
    links.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${base}/${def}${canonicalPath}`)}" />`
    );
  }
  return links.join('\n    ');
}

export function renderLocaleSwitcher(config, translationGroup, currentPath) {
  const locales = config.locales || {};
  const ui = config.ui || getUi(config.locale);
  const options = Object.keys(locales)
    .map((loc) => {
      const entry = translationGroup?.get(loc);
      const label = locales[loc]?.label || loc;
      const href = entry ? lp({ locale: loc }, currentPath) : lp({ locale: loc }, '/');
      const selected = loc === config.locale ? ' selected' : '';
      return `<option value="${escapeHtml(href)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
  return `<div class="locale-switcher">
  <label class="locale-switcher-label" for="locale-select">${escapeHtml(ui.language)}</label>
  <select id="locale-select" class="locale-select" aria-label="${escapeHtml(ui.language)}">${options}</select>
</div>`;
}

export function renderHeadMeta({
  title,
  description,
  config,
  canonicalUrl,
  ogType = 'website',
  ogImage = '',
  jsonLd = null,
  extraCss = [],
  hreflangHtml = '',
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description || '');
  const safeCanonical = canonicalUrl ? escapeHtml(canonicalUrl) : '';
  const safeOgImage = ogImage ? escapeHtml(ogImage) : '';

  const ogTags = [
    `<meta property="og:type" content="${escapeHtml(ogType)}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:site_name" content="${escapeHtml(config.siteName)}" />`,
    safeCanonical ? `<meta property="og:url" content="${safeCanonical}" />` : '',
    safeOgImage ? `<meta property="og:image" content="${safeOgImage}" />` : '',
    `<meta name="twitter:card" content="${safeOgImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    safeOgImage ? `<meta name="twitter:image" content="${safeOgImage}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  const cssLinks = [
    '<link rel="stylesheet" href="/assets/styles.css" />',
    '<link rel="stylesheet" href="/assets/shiki.css" />',
    ...extraCss.map((href) => `<link rel="stylesheet" href="${href}" />`),
  ].join('\n    ');

  const iconHref = config.iconImage ? escapeHtml(config.iconImage) : '';
  const iconLinks = iconHref
    ? `<link rel="icon" href="${iconHref}" type="image/webp" />
    <link rel="apple-touch-icon" href="${iconHref}" />`
    : '';

  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';

  return `<title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    ${safeCanonical ? `<link rel="canonical" href="${safeCanonical}" />` : ''}
    ${hreflangHtml}
    ${iconLinks}
    ${ogTags}
    ${cssLinks}
    ${jsonLdScript}`;
}

export function renderHeaderCenterNav(config) {
  return (config.tutorialNav || [])
    .map((item) => `<a href="${escapeHtml(navHref(config, item.url))}">${escapeHtml(item.label)}</a>`)
    .join('<span class="nav-sep">/</span>');
}

export function renderEncryptedAccessScript(config) {
  const block = config?.encrypted || {};
  const authApiUrl = String(block.authApiUrl || '').trim();
  if (!authApiUrl) return '';
  const payload = JSON.stringify({
    authApiUrl,
    from: String(block.from || 'web_blog').trim() || 'web_blog',
    sessionTtlHours: Number(block.sessionTtlHours) > 0 ? Number(block.sessionTtlHours) : 12,
  });
  return `<script id="blog-encrypted-access" type="application/json">${payload.replace(/</g, '\\u003c')}</script>`;
}

export function renderSidebar(config, posts, activeSlug, encryptedSlugs = new Set()) {
  const ui = config.ui || getUi(config.locale);
  const items = posts
    .map((p) => {
      const activeClass = p.slug === activeSlug ? 'is-active' : '';
      const lock = encryptedSlugs.has(p.slug)
        ? `<span class="article-lock" title="${escapeHtml(ui.encrypted)}" aria-hidden="true">&#x26bf;</span> `
        : '';
      return `<li class="article-list-item ${activeClass}${encryptedSlugs.has(p.slug) ? ' is-encrypted' : ''}">
  <a href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(p.slug)}/`))}">
    <span class="article-list-title">${lock}${escapeHtml(p.title)}</span>
    <span class="meta">${escapeHtml(p.dateText)}</span>
  </a>
</li>`;
    })
    .join('');
  return `<aside class="article-list-pane">
  <h2 class="pane-title">${escapeHtml(ui.articleList)}</h2>
  <ul class="article-list">${items || `<li class="empty">${escapeHtml(ui.noArticles)}</li>`}</ul>
</aside>`;
}

export function renderMermaidScript() {
  return `<script src="/assets/mermaid.min.js" defer></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
  mermaid.run({ querySelector: '.content .mermaid' });
});
</script>`;
}

export function renderPostTocAside(tocHtml, config) {
  if (!tocHtml) return '';
  const label = config.locale === 'ja' ? '目次' : config.locale === 'zh' ? '本页目录' : 'On this page';
  return `<aside class="post-toc-aside" aria-label="${escapeHtml(label)}">${tocHtml}</aside>`;
}

export function layout({
  title,
  description,
  config,
  posts,
  activeSlug,
  contentHtml,
  tocAsideHtml = '',
  headExtra = {},
  enableMermaid = false,
  enableKatex = false,
  localeSwitcherHtml = '',
}) {
  const ui = config.ui || getUi(config.locale);
  const centerNav = renderHeaderCenterNav(config);
  const encryptedSlugs = config.encryptedSlugs instanceof Set ? config.encryptedSlugs : new Set();
  const sidebarHtml = renderSidebar(config, posts, activeSlug, encryptedSlugs);
  const layoutClass = tocAsideHtml ? ' content-layout--with-toc' : '';
  const headMeta = renderHeadMeta({
    title,
    description,
    config,
    ...headExtra,
    extraCss: [...(enableKatex ? ['/assets/katex.min.css'] : [])],
  });
  const htmlLang = config.htmlLang || config.locale || 'en';
  const htmlDir = config.dir || 'ltr';

  return `<!doctype html>
<html lang="${escapeHtml(htmlLang)}" dir="${escapeHtml(htmlDir)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${headMeta}
  </head>
  <body data-locale="${escapeHtml(config.locale)}" data-locale-prefix="${escapeHtml(lp(config, '/'))}">
    <header class="site-header">
      <div class="container header-grid">
        <a class="header-left icon-link" href="${escapeHtml(lp(config, '/'))}" aria-label="${escapeHtml(ui.home)}">
          ${config.iconMarkup}
        </a>
        <nav class="header-center primary-nav" aria-label="Main">
          ${centerNav}
        </nav>
        <div class="header-right">
          ${localeSwitcherHtml}
          <button id="search-trigger" class="search-trigger" type="button">${escapeHtml(ui.search)}</button>
        </div>
      </div>
    </header>

    <div class="container content-layout${layoutClass}">
      ${sidebarHtml}
      <main class="article-content-pane">
        ${contentHtml}
      </main>
      ${tocAsideHtml}
    </div>

    <div id="search-overlay" class="search-overlay" aria-hidden="true">
      <div class="search-modal">
        <div class="search-modal-header">
          <strong>${escapeHtml(ui.searchSite)}</strong>
          <button id="search-close" class="search-close" type="button">${escapeHtml(ui.close)}</button>
        </div>
        <form id="search-form" class="search-form" action="${escapeHtml(lp(config, '/search/'))}" method="get">
          <input id="search-query" name="q" class="search-input" type="search" placeholder="${escapeHtml(ui.searchPlaceholder)}" />
        </form>
        <section id="search-inline-results" class="search-inline-results"></section>
      </div>
    </div>

    <footer class="site-footer">
      <div class="container">
        <p class="affiliate-disclosure muted">${escapeHtml(ui.affiliateNotice)}</p>
        <p>&copy; ${escapeHtml(config.siteName)} &middot; <a href="${escapeHtml(lp(config, '/tags/'))}">${escapeHtml(ui.tags)}</a> &middot; <a href="${escapeHtml(lp(config, '/rss.xml'))}">RSS</a></p>
      </div>
    </footer>
    ${renderEncryptedAccessScript(config)}
    <script src="/assets/minisearch.umd.js" defer></script>
    <script src="/assets/site.js" defer></script>
    ${enableMermaid ? renderMermaidScript() : ''}
  </body>
</html>`;
}

function renderPostTags(post, config, tagToSlug) {
  if (!post.tags.length) return '';
  return `<div class="tags">${post.tags
    .map((t) => {
      const slug = tagToSlug.get(t);
      return slug
        ? `<a class="tag" href="${escapeHtml(lp(config, `/tags/${encodeURIComponent(slug)}/`))}">${escapeHtml(t)}</a>`
        : `<span class="tag">${escapeHtml(t)}</span>`;
    })
    .join('')}</div>`;
}

function renderPostNav(config, ui, prevPost, nextPost) {
  const navParts = [];
  if (prevPost) {
    navParts.push(
      `<a class="post-nav-link post-nav-prev" href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(prevPost.slug)}/`))}">&larr; ${escapeHtml(prevPost.title)}</a>`
    );
  }
  if (nextPost) {
    navParts.push(
      `<a class="post-nav-link post-nav-next" href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(nextPost.slug)}/`))}">${escapeHtml(nextPost.title)} &rarr;</a>`
    );
  }
  if (!navParts.length) return '';
  return `<nav class="post-nav" aria-label="${escapeHtml(ui.prevNext)}">${navParts.join('')}</nav>`;
}

function renderRelated(config, ui, relatedPosts) {
  if (!relatedPosts.length) return '';
  return `<section class="related-posts card">
  <h2 class="card-title">${escapeHtml(ui.relatedPosts)}</h2>
  <ul class="related-list">${relatedPosts
    .map(
      (p) =>
        `<li><a href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(p.slug)}/`))}">${escapeHtml(p.title)}</a><span class="meta">${escapeHtml(p.dateText)}</span></li>`
    )
    .join('')}</ul>
</section>`;
}

export function renderPostContent(post, { config, tagToSlug, relatedPosts, prevPost, nextPost }) {
  const ui = config.ui || getUi(config.locale);
  const tags = renderPostTags(post, config, tagToSlug);
  const related = renderRelated(config, ui, relatedPosts);
  const postNav = renderPostNav(config, ui, prevPost, nextPost);

  return `<article class="prose">
  <div class="breadcrumbs"><a href="${escapeHtml(lp(config, '/'))}">${escapeHtml(ui.home)}</a> / <span>${escapeHtml(post.title)}</span></div>
  <h1>${escapeHtml(post.title)}</h1>
  <div class="post-meta-row">
    <span class="meta">${escapeHtml(post.dateText)}</span>
    <span class="meta reading-time">${post.readingMinutes} ${escapeHtml(ui.readingMin)}</span>
  </div>
  ${tags}
  <div class="post-body">
    <div class="content">${post.bodyHtml}</div>
  </div>
  ${related}
  ${postNav}
</article>`;
}

export function renderPostContentEncrypted(post, { config, tagToSlug, relatedPosts, prevPost, nextPost }) {
  const ui = config.ui || getUi(config.locale);
  const tags = renderPostTags(post, config, tagToSlug);
  const related = renderRelated(config, ui, relatedPosts);
  const postNav = renderPostNav(config, ui, prevPost, nextPost);
  const encUrl = lp(config, `/posts/${encodeURIComponent(post.slug)}/body.enc.json`);

  return `<article class="prose post-encrypted" data-encrypted="1" data-enc-url="${escapeHtml(encUrl)}">
  <div class="breadcrumbs"><a href="${escapeHtml(lp(config, '/'))}">${escapeHtml(ui.home)}</a> / <span>${escapeHtml(post.title)}</span></div>
  <h1>${escapeHtml(post.title)} <span class="post-encrypted-badge">${escapeHtml(ui.encrypted)}</span></h1>
  <div class="post-meta-row">
    <span class="meta">${escapeHtml(post.dateText)}</span>
    <span class="meta reading-time">${post.readingMinutes} ${escapeHtml(ui.readingMin)}</span>
  </div>
  ${tags}
  <section class="post-encrypt-gate card" id="post-encrypt-gate">
    <h2 class="card-title">${escapeHtml(ui.encrypted)}</h2>
    <p class="muted">${escapeHtml(ui.unlock)}</p>
    <form class="post-encrypt-form" id="post-encrypt-form" autocomplete="off" action="#" method="post">
      <label class="post-encrypt-label" for="post-encrypt-password">Password</label>
      <input id="post-encrypt-password" class="post-encrypt-input" type="password" name="password" autocomplete="current-password" required />
      <button type="button" class="post-encrypt-submit" id="post-encrypt-submit">${escapeHtml(ui.unlock)}</button>
    </form>
    <p class="post-encrypt-error" id="post-encrypt-error" hidden></p>
  </section>
  <div class="post-body post-body-locked" id="post-body" hidden>
    <div class="content" id="post-decrypted-content"></div>
  </div>
  ${related}
  ${postNav}
</article>`;
}

export function renderIndexContent(config, posts) {
  const ui = config.ui || getUi(config.locale);
  const latest = posts[0];
  const cards = posts
    .slice(0, 8)
    .map(
      (p) => `<article class="card pick-card">
  <h2 class="card-title"><a href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(p.slug)}/`))}">${escapeHtml(p.title)}</a></h2>
  <div class="meta">${escapeHtml(p.dateText)}</div>
  ${p.description ? `<p class="muted">${escapeHtml(p.description)}</p>` : ''}
</article>`
    )
    .join('');

  if (!latest) {
    return `<section class="hero"><h1>${escapeHtml(config.siteName)}</h1><p class="muted">${escapeHtml(ui.noArticles)}</p></section>`;
  }
  return `<section class="hero">
  <h1>${escapeHtml(config.siteName)}</h1>
  <p class="muted">${escapeHtml(config.siteDescription)}</p>
</section>
<section class="welcome card">
  <h2 class="card-title">${escapeHtml(ui.featured)}</h2>
  <p><a href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(latest.slug)}/`))}">${escapeHtml(latest.title)}</a></p>
</section>
<section class="grid">${cards}</section>`;
}

export function renderSearchContent(config) {
  const ui = config.ui || getUi(config.locale);
  return `<section class="hero">
  <h1>${escapeHtml(ui.searchPageTitle)}</h1>
  <p class="muted">${escapeHtml(ui.searchPageDesc)}</p>
</section>
<section id="search-results" class="grid"></section>`;
}

export function renderTagsIndexContent(config, tagEntries) {
  const ui = config.ui || getUi(config.locale);
  const items = tagEntries
    .sort((a, b) => a.label.localeCompare(b.label, config.locale || 'en'))
    .map(
      (t) =>
        `<li><a href="${escapeHtml(lp(config, `/tags/${encodeURIComponent(t.slug)}/`))}">${escapeHtml(t.label)}</a> <span class="meta">(${t.count})</span></li>`
    )
    .join('');
  return `<section class="hero">
  <h1>${escapeHtml(ui.tags)}</h1>
  <p class="muted"><a href="${escapeHtml(lp(config, '/'))}">${escapeHtml(ui.backHome)}</a></p>
</section>
<ul class="tag-cloud">${items || `<li class="empty">${escapeHtml(ui.noTags)}</li>`}</ul>`;
}

export function renderTagArchiveContent(config, tagLabel, tagPosts) {
  const ui = config.ui || getUi(config.locale);
  const items = tagPosts
    .map(
      (p) =>
        `<article class="card">
  <h2 class="card-title"><a href="${escapeHtml(lp(config, `/posts/${encodeURIComponent(p.slug)}/`))}">${escapeHtml(p.title)}</a></h2>
  <div class="meta">${escapeHtml(p.dateText)}</div>
  ${p.description ? `<p class="muted">${escapeHtml(p.description)}</p>` : ''}
</article>`
    )
    .join('');
  return `<section class="hero">
  <h1>${escapeHtml(ui.tagArchive)}: ${escapeHtml(tagLabel)}</h1>
  <p class="muted"><a href="${escapeHtml(lp(config, '/tags/'))}">${escapeHtml(ui.allTags)}</a></p>
</section>
<section class="grid">${items || `<div class="empty">${escapeHtml(ui.emptyTag)}</div>`}</section>`;
}

export function renderRss(posts, config) {
  const channelLink = `${String(config.siteUrl || '').replace(/\/$/, '')}/${config.locale}/`;
  const items = posts
    .slice(0, 50)
    .map((p) => {
      const link = resolvePostUrl(config, p.slug);
      return `<item>
  <title>${escapeHtml(p.title)}</title>
  <link>${link}</link>
  <guid>${link}</guid>
  <pubDate>${(p.date || new Date()).toUTCString()}</pubDate>
  <description>${escapeHtml(p.description || '')}</description>
</item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(config.siteName)}</title>
    <link>${escapeHtml(channelLink)}</link>
    <description>${escapeHtml(config.siteDescription)}</description>
    ${items}
  </channel>
</rss>`;
}

export function renderSitemap(config, posts, tagSlugs) {
  const base = String(config.siteUrl || '').replace(/\/$/, '');
  const loc = config.locale || 'en';
  const prefix = `${base}/${loc}`;
  const urls = [
    { loc: `${prefix}/`, priority: '1.0' },
    { loc: `${prefix}/search/`, priority: '0.5' },
    { loc: `${prefix}/tags/`, priority: '0.6' },
    ...posts.map((p) => ({
      loc: `${prefix}/posts/${encodeURIComponent(p.slug)}/`,
      lastmod: p.date ? p.date.toISOString().slice(0, 10) : null,
      priority: '0.8',
    })),
    ...tagSlugs.map((slug) => ({
      loc: `${prefix}/tags/${encodeURIComponent(slug)}/`,
      priority: '0.5',
    })),
  ];

  const body = urls
    .map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
      return `  <url>
    <loc>${escapeHtml(u.loc)}</loc>${lastmod}
    <priority>${u.priority || '0.5'}</priority>
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function renderRootRedirect(defaultLocale) {
  const loc = defaultLocale || 'en';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=/${loc}/" />
    <link rel="canonical" href="/${loc}/" />
    <script>location.replace('/${loc}/');</script>
    <title>Redirecting…</title>
  </head>
  <body><p><a href="/${loc}/">Continue to ${escapeHtml(loc)}</a></p></body>
</html>`;
}

export function renderSitemapIndex(config, localeList) {
  const base = String(config.siteUrl || '').replace(/\/$/, '');
  const urls = localeList
    .map(
      (loc) => `  <sitemap>
    <loc>${escapeHtml(`${base}/${loc}/sitemap.xml`)}</loc>
  </sitemap>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</sitemapindex>`;
}

export function postJsonLd(config, post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description || '',
    datePublished: post.date ? post.date.toISOString() : undefined,
    author: { '@type': 'Organization', name: config.siteName },
    mainEntityOfPage: resolvePostUrl(config, post.slug),
    keywords: post.tags.join(', '),
    image: resolveOgImage(config, post) || undefined,
    inLanguage: config.htmlLang || config.locale,
  };
}
