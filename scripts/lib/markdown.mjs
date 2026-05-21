import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItToc from 'markdown-it-toc-done-right';
import markdownItContainer from 'markdown-it-container';
import markdownItTaskLists from 'markdown-it-task-lists';
import { katex } from '@mdit/plugin-katex';
import { createHighlighter } from 'shiki';
import { escapeHtml } from './html.mjs';
import { getUi } from './i18n.mjs';

const ADMONITION_BY_LOCALE = {
  en: { tip: 'Tip', warning: 'Warning', danger: 'Danger', info: 'Info', note: 'Note' },
  zh: { tip: '提示', warning: '警告', danger: '危险', info: '信息', note: '备注' },
  ja: { tip: 'ヒント', warning: '注意', danger: '危険', info: '情報', note: 'メモ' },
};

function ratingStarsHtml(ratingText) {
  const m = String(ratingText).match(/([\d.]+)/);
  if (!m) return '';
  const value = Math.min(5, Math.max(0, parseFloat(m[1])));
  const full = Math.floor(value);
  const half = value - full >= 0.45 ? 1 : 0;
  const empty = 5 - full - half;
  const star = (type) =>
    `<span class="product-star product-star--${type}" aria-hidden="true"></span>`;
  return (
    star('full').repeat(full) +
    (half ? star('half') : '') +
    star('empty').repeat(empty)
  );
}

function parseProductBlock(code, locale, postSlug) {
  const meta = {};
  for (const line of String(code || '').trim().split('\n')) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.+)$/);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  const ui = getUi(locale);
  const title = meta.title || 'Product';
  const price = meta.price || '';
  const url = meta.url || '#';
  const rating = meta.rating || '';
  const note = meta.note || meta.pros || '';
  const badge = meta.badge || '';
  let imgSrc = '';
  if (meta.image) {
    const img = meta.image;
    imgSrc = img.startsWith('http')
      ? img
      : `/${locale}/posts/${encodeURIComponent(postSlug || '')}/${img.replace(/^\.\//, '')}`;
  }

  const mediaInner = imgSrc
    ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(title)}" loading="lazy" />`
    : `<span class="product-card-placeholder" aria-hidden="true"></span>`;

  const stars = rating ? ratingStarsHtml(rating) : '';

  return `<aside class="product-card">
  <a class="product-card-media" href="${escapeHtml(url)}" rel="nofollow sponsored" target="_blank">${mediaInner}</a>
  <div class="product-card-content">
    ${badge ? `<span class="product-card-badge">${escapeHtml(badge)}</span>` : ''}
    <h3 class="product-card-title"><a href="${escapeHtml(url)}" rel="nofollow sponsored" target="_blank">${escapeHtml(title)}</a></h3>
    <div class="product-card-meta">
      ${price ? `<div class="product-card-price"><span class="meta-label">${escapeHtml(ui.productPrice)}</span><span class="meta-value">${escapeHtml(price)}</span></div>` : ''}
      ${rating ? `<div class="product-card-rating"><span class="meta-label">${escapeHtml(ui.productRating)}</span><span class="meta-value">${stars}<span class="rating-text">${escapeHtml(rating)}</span></span></div>` : ''}
    </div>
    ${note ? `<p class="product-card-note">${escapeHtml(note)}</p>` : ''}
    <a class="product-card-cta" href="${escapeHtml(url)}" rel="nofollow sponsored" target="_blank"><span>${escapeHtml(ui.productCta)}</span></a>
  </div>
</aside>`;
}

const SHIKI_LANGS = [
  'bash',
  'shell',
  'dart',
  'kotlin',
  'java',
  'javascript',
  'typescript',
  'json',
  'yaml',
  'xml',
  'html',
  'css',
  'markdown',
  'python',
  'sql',
  'nginx',
  'properties',
  'ini',
  'powershell',
  'docker',
  'rust',
  'go',
  'c',
  'cpp',
  'groovy',
];

let highlighterPromise = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light'],
      langs: SHIKI_LANGS,
    });
  }
  return highlighterPromise;
}

function hasTocPlaceholder(content) {
  return /\[\[toc\]\]/i.test(content);
}

function hasLevel2Headings(content) {
  return /^##\s+/m.test(content);
}

function prepareContentForToc(content) {
  if (hasTocPlaceholder(content) || !hasLevel2Headings(content)) return content;
  return `[[toc]]\n\n${content}`;
}

function splitTocFromHtml(html) {
  const re = /^<nav class="post-toc">[\s\S]*?<\/nav>\s*/;
  const m = html.match(re);
  if (!m) return { tocHtml: '', bodyHtml: html };
  return { tocHtml: m[0], bodyHtml: html.slice(m[0].length) };
}

/** Must match markdown-it-anchor slugify so TOC hrefs resolve to heading ids. */
export function slugifyHeading(s) {
  return (
    String(s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fff-]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

export async function createMarkdownRenderer(locale = 'en') {
  const highlighter = await getHighlighter();
  const admonitionLabels = ADMONITION_BY_LOCALE[locale] || ADMONITION_BY_LOCALE.en;
  let activePostSlug = '';

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code, lang) {
      if (lang === 'product') {
        return '';
      }
      if (lang === 'mermaid') {
        return `<pre class="mermaid">${md.utils.escapeHtml(code.trim())}</pre>`;
      }
      const loaded = highlighter.getLoadedLanguages();
      const language = lang && loaded.includes(lang) ? lang : 'text';
      try {
        return highlighter.codeToHtml(code, {
          lang: language,
          theme: 'github-light',
          transformers: [
            {
              pre(node) {
                node.properties.class = 'shiki code-block';
                if (lang) node.properties['data-lang'] = lang;
              },
              code(node) {
                node.properties.class = 'shiki-code';
              },
            },
          ],
        });
      } catch {
        return highlighter.codeToHtml(code, { lang: 'text', theme: 'github-light' });
      }
    },
  });

  md.use(markdownItAnchor, {
    level: [2, 3, 4],
    permalink: markdownItAnchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'before',
      class: 'header-anchor',
      ariaHidden: true,
    }),
    slugify: slugifyHeading,
  });

  md.use(markdownItToc, {
    level: [2, 3, 4],
    containerClass: 'post-toc',
    listType: 'ul',
    slugify: slugifyHeading,
  });

  md.use(markdownItTaskLists, { enabled: true, label: true, labelAfter: true });
  md.use(katex);

  for (const [name, label] of Object.entries(admonitionLabels)) {
    md.use(markdownItContainer, name, {
      validate(params) {
        return params.trim().split(/\s+/)[0] === name;
      },
      render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
          return `<div class="admonition admonition-${name}"><p class="admonition-title">${label}</p>\n`;
        }
        return '</div>\n';
      },
    });
  }

  const defaultFence =
    md.renderer.rules.fence ||
    ((tokens, idx, options, env, slf) => slf.renderToken(tokens, idx, options, env, slf));
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx];
    const info = token.info ? token.info.trim().toLowerCase() : '';
    if (info === 'product') {
      return parseProductBlock(token.content, locale, activePostSlug);
    }
    return defaultFence(tokens, idx, options, env, slf);
  };

  return {
    md,
    render(content, postSlug = '') {
      activePostSlug = postSlug;
      const prepared = prepareContentForToc(content);
      const html = md.render(prepared);
      return splitTocFromHtml(html);
    },
  };
}

export function contentUsesMermaid(html) {
  return html.includes('class="mermaid"');
}

export function contentUsesKatex(html) {
  return html.includes('class="katex"') || html.includes('katex-display');
}
