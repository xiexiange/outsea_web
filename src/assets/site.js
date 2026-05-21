(() => {
  let searchEngine = null;
  let docsById = new Map();
  let indexReady = null;

  function getLocale() {
    return document.body?.dataset?.locale || 'en';
  }

  function getLocalePrefix() {
    const p = document.body?.dataset?.localePrefix || '/en/';
    return p.endsWith('/') ? p : `${p}/`;
  }

  function lp(pathname) {
    const p = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    return getLocalePrefix() + p;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function renderResultCard(p, headingTag) {
    const h = headingTag || 'h3';
    return `<article class="card">
      <${h} class="card-title"><a href="${lp(`posts/${encodeURIComponent(p.slug)}/`)}">${escapeHtml(p.title)}</a></${h}>
      <div class="meta">${escapeHtml(p.dateText || '')}</div>
      ${p.description ? `<p class="muted">${escapeHtml(p.description)}</p>` : ''}
    </article>`;
  }

  function tokenizeForIndex(text) {
    const s = String(text || '').toLowerCase();
    const tokens = new Set();
    for (const part of s.split(/[\s,，、；;|/]+/)) {
      const w = part.trim();
      if (w.length >= 2) tokens.add(w);
    }
    const cjk = s.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < cjk.length; i++) {
      tokens.add(cjk[i]);
      if (i + 1 < cjk.length) tokens.add(cjk.slice(i, i + 2));
    }
    return [...tokens];
  }

  function hasCjk(text) {
    return /[\u4e00-\u9fff]/.test(text);
  }

  function substringSearch(all, q, limit) {
    const lower = q.toLowerCase();
    return all
      .map((p) => {
        const title = (p.title || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const tags = (p.tags || '').toLowerCase();
        const content = (p.content || '').toLowerCase();
        let score = 0;
        if (title.includes(lower)) score += 40;
        if (tags.includes(lower)) score += 25;
        if (desc.includes(lower)) score += 15;
        if (content.includes(lower)) score += 5;
        return score > 0 ? { p, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.p);
  }

  function initMiniSearch() {
    if (!indexReady) {
      indexReady = fetch(`/assets/search-index.${getLocale()}.json`)
        .then((r) => r.json())
        .then((docs) => {
          docsById = new Map(docs.map((d) => [d.id || d.slug, d]));
          if (typeof MiniSearch !== 'undefined') {
            searchEngine = new MiniSearch({
              idField: 'id',
              fields: ['title', 'description', 'tags', 'content'],
              storeFields: ['title', 'slug', 'dateText', 'description'],
              tokenize: (t) => tokenizeForIndex(t),
              searchOptions: {
                boost: { title: 4, tags: 2.5, description: 1.5, content: 1 },
                prefix: true,
                fuzzy: 0.15,
                tokenize: (t) => tokenizeForIndex(t),
              },
            });
            searchEngine.addAll(docs);
          }
          return docs;
        });
    }
    return indexReady;
  }

  function runSearch(q, limit = 20) {
    const v = (q || '').trim();
    const all = [...docsById.values()];
    if (!v) return all.slice(0, limit);

    if (hasCjk(v) || !searchEngine) {
      return substringSearch(all, v, limit);
    }

    const fromMini = searchEngine
      .search(v)
      .slice(0, limit)
      .map((r) => docsById.get(r.id))
      .filter(Boolean);

    if (fromMini.length) return fromMini;
    return substringSearch(all, v, limit);
  }

  function initSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    const trigger = document.getElementById('search-trigger');
    const closeBtn = document.getElementById('search-close');
    const form = document.getElementById('search-form');
    const input = document.getElementById('search-query');
    const results = document.getElementById('search-inline-results');
    if (!overlay) return;

    const open = () => {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => input && input.focus());
    };
    const close = () => {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    };

    trigger && trigger.addEventListener('click', open);
    closeBtn && closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    const render = (items) => {
      if (!results) return;
      results.innerHTML = items.length
        ? items.slice(0, 8).map((p) => renderResultCard(p, 'h3')).join('')
        : '<div class="empty">没有匹配结果</div>';
    };

    initMiniSearch()
      .then((docs) => render(docs.slice(0, 8)))
      .catch(() => {
        if (results) results.innerHTML = '<div class="empty">搜索索引加载失败</div>';
      });

    input &&
      input.addEventListener('input', (e) => {
        const q = e.target.value;
        indexReady
          ? indexReady.then(() => render(runSearch(q, 8)))
          : render([]);
      });

    form &&
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        window.location.href = lp('search/') + '?q=' + encodeURIComponent(input ? input.value : '');
      });
  }

  function initSearchPage() {
    const root = document.getElementById('search-results');
    if (!root) return;
    const q = new URLSearchParams(location.search).get('q') || '';

    initMiniSearch()
      .then(() => {
        const items = runSearch(q, 50);
        root.innerHTML = items.length
          ? items.map((p) => renderResultCard(p, 'h2')).join('')
          : '<div class="empty">没有找到匹配结果。</div>';
      })
      .catch(() => {
        root.innerHTML = '<div class="empty">搜索索引加载失败。</div>';
      });
  }

  function initCodeCopy() {
    document.querySelectorAll('pre.code-block, pre.shiki, pre.hljs').forEach((pre) => {
      if (pre.classList.contains('mermaid') || pre.closest('.code-block-wrap')) return;

      const wrap = document.createElement('div');
      wrap.className = 'code-block-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const lang = pre.getAttribute('data-lang');
      if (lang) {
        const label = document.createElement('span');
        label.className = 'code-lang-label';
        label.textContent = lang;
        wrap.appendChild(label);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = '复制';
      wrap.appendChild(btn);

      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code');
        const text = code ? code.innerText : pre.innerText;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = '已复制';
          setTimeout(() => {
            btn.textContent = '复制';
          }, 1500);
        } catch {
          btn.textContent = '失败';
        }
      });
    });
  }

  function initImageLightbox() {
    const lb = document.createElement('div');
    lb.id = 'image-lightbox';
    lb.className = 'image-lightbox';
    lb.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="关闭">×</button><img alt="" />';
    document.body.appendChild(lb);

    const img = lb.querySelector('img');
    const close = () => lb.classList.remove('open');

    lb.querySelector('.lightbox-close').addEventListener('click', close);
    lb.addEventListener('click', (e) => {
      if (e.target === lb) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    document.querySelectorAll('.content img').forEach((el) => {
      if (el.closest('a')) return;
      el.style.cursor = 'zoom-in';
      el.addEventListener('click', () => {
        img.src = el.src;
        img.alt = el.alt || '';
        lb.classList.add('open');
      });
    });
  }

  function initProseTables() {
    document.querySelectorAll('.prose table').forEach((table) => {
      if (table.closest('.table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function initSmoothHashNavigation() {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    const selectors = [
      '.post-toc-aside a[href^="#"]',
      '.prose .header-anchor[href^="#"]',
    ];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((a) => {
        a.addEventListener('click', (e) => {
          const href = a.getAttribute('href');
          if (!href || href === '#') return;
          const id = decodeURIComponent(href.slice(1));
          const target = document.getElementById(id);
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior, block: 'start' });
          history.replaceState(null, '', href);
        });
      });
    });
  }

  const BLOG_ENC_SESSION = 'blog_enc_session_v1';

  function readEncryptedAccessConfig() {
    const el = document.getElementById('blog-encrypted-access');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || '{}');
    } catch {
      return null;
    }
  }

  function loadEncryptedSession() {
    try {
      const raw = sessionStorage.getItem(BLOG_ENC_SESSION);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s?.contentKey || !s?.expiresAt || Date.now() > Number(s.expiresAt)) {
        sessionStorage.removeItem(BLOG_ENC_SESSION);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function saveEncryptedSession(data) {
    sessionStorage.setItem(BLOG_ENC_SESSION, JSON.stringify(data));
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function deriveAesKey(secret) {
    const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(secret)));
    return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['decrypt']);
  }

  async function decryptEnvelope(secret, envelope) {
    const key = await deriveAesKey(secret);
    const iv = Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(envelope.tag), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(envelope.data), (c) => c.charCodeAt(0));
    const combined = new Uint8Array(data.length + tag.length);
    combined.set(data);
    combined.set(tag, data.length);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, combined);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`failed to load ${src}`));
      document.body.appendChild(s);
    });
  }

  async function renderDecryptedPost(article, session) {
    const encUrl = article.getAttribute('data-enc-url');
    if (!encUrl) return;
    const res = await fetch(encUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('无法加载加密正文');
    const envelope = await res.json();
    const payload = await decryptEnvelope(session.contentKey, envelope);

    const gate = document.getElementById('post-encrypt-gate');
    const body = document.getElementById('post-body');
    const content = document.getElementById('post-decrypted-content');
    if (!body || !content) return;

    content.innerHTML = (payload.tocHtml || '') + (payload.bodyHtml || '');
    body.hidden = false;
    if (gate) gate.hidden = true;

    if (payload.enableKatex && !document.querySelector('link[href="/assets/katex.min.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/katex.min.css';
      document.head.appendChild(link);
    }
    if (payload.enableMermaid) {
      await loadScriptOnce('/assets/mermaid.min.js');
      if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        await mermaid.run({ querySelector: '#post-decrypted-content .mermaid' });
      }
    }

    initCodeCopy();
    initProseTables();
    initImageLightbox();
    initSmoothHashNavigation();
    initTocSpy();
  }

  function resolveAuthApiUrl(cfg) {
    const raw = String(cfg?.authApiUrl || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/')) return raw;
    return raw;
  }

  async function verifyBlogPassword(password, cfg) {
    const apiUrl = resolveAuthApiUrl(cfg);
    if (!apiUrl) throw new Error('未配置验证接口');
    const from = cfg.from || 'web_blog';
    const passwordHash = await sha256Hex(`${from}:${password}`);
    let res;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, passwordHash }),
      });
    } catch {
      throw new Error('无法连接验证服务（请检查网络或 HTTPS 同源代理）');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || data.message || '密码错误或验证失败');
    }
    return data;
  }

  function initEncryptedPosts() {
    const article = document.querySelector('article.post-encrypted');
    if (!article) return;

    const cfg = readEncryptedAccessConfig() || {};
    const errEl = document.getElementById('post-encrypt-error');
    const form = document.getElementById('post-encrypt-form');
    const submitBtn = document.getElementById('post-encrypt-submit');
    const input = document.getElementById('post-encrypt-password');

    if (!cfg.authApiUrl && errEl) {
      errEl.hidden = false;
      errEl.textContent = '站点未配置 encrypted.authApiUrl';
    }

    const tryUnlock = async (session) => {
      try {
        await renderDecryptedPost(article, session);
      } catch (e) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = e.message || '解密失败';
        }
      }
    };

    const existing = loadEncryptedSession();
    if (existing) tryUnlock(existing);

    const runUnlock = async () => {
      if (errEl) errEl.hidden = true;
      const password = input?.value || '';
      if (!password) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = '请输入密码';
        }
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '验证中…';
      }
      try {
        const data = await verifyBlogPassword(password, cfg);
        const ttlHours = Number(cfg.sessionTtlHours) > 0 ? Number(cfg.sessionTtlHours) : 12;
        const session = {
          token: data.token,
          contentKey: data.contentKey,
          expiresAt: data.expiresAt || Date.now() + ttlHours * 3600 * 1000,
        };
        saveEncryptedSession(session);
        if (input) input.value = '';
        await tryUnlock(session);
      } catch (ex) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = ex.message || '验证失败';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '解锁阅读';
        }
      }
    };

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        runUnlock();
      });
    }
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        runUnlock();
      });
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runUnlock();
        }
      });
    }
  }

  function initLocaleSelect() {
    const sel = document.getElementById('locale-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const url = sel.value;
      if (url && url !== window.location.pathname + window.location.search) {
        window.location.href = url;
      }
    });
  }

  function initTocSpy() {
    const toc = document.querySelector('.post-toc-aside .post-toc');
    if (!toc) return;
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    if (!links.length) return;

    const headings = links
      .map((a) => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))))
      .filter(Boolean);

    const onScroll = () => {
      const y = window.scrollY + 100;
      let active = 0;
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].offsetTop <= y) active = i;
      }
      links.forEach((a, i) => a.classList.toggle('is-active', i === active));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLocaleSelect();
    initSearchOverlay();
    initSearchPage();
    initCodeCopy();
    initImageLightbox();
    initProseTables();
    initEncryptedPosts();
    initSmoothHashNavigation();
    initTocSpy();
  });
})();
