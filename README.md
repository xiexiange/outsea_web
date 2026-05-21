# Outsea Web — 海外推广博客

基于 [blog](e:/Project/blog) 项目的**纯静态**站点生成器，面向海外用户的**好物推荐 / 联盟推广**内容，内置 **en / zh / ja** 多语言。

## 快速开始

```bash
npm install
npm run build
npm run dev
```

浏览器访问 `http://127.0.0.1:4173/en/`（根路径 `/` 会自动跳转到默认语言）。

## 多语言内容结构

每篇文章一个目录，按语言分文件：

```
content/posts/<文章目录>/
  index.en.md
  index.zh.md
  index.ja.md
  images/          # 可选，图片与附件
```

- 用 `translationKey` 关联各语言版本（语言切换器、hreflang SEO）
- 各语言可共用同一 `slug`，也可在 frontmatter 里单独指定
- 仍支持单文件 `index.md` + `lang: en`（仅该语言构建）

## 写文章

Frontmatter 示例：

```yaml
---
title: Best Portable Chargers for Travel
date: 2026-05-21 10:00:00
published: true
translationKey: portable-charger-2026
slug: portable-charger-2026
tags:
  - deals
  - guides
description: Short summary for listings and SEO.
---
```

### 商品推荐块

正文中用 `product` 代码块（构建期渲染为卡片）：

````markdown
```product
title: Product name
price: from $29
url: https://example.com/your-affiliate-link
rating: 4.6 / 5
image: images/product.webp
note: One-line pros or note
```
````

页脚会自动展示联盟链接披露文案（见 `scripts/lib/i18n.mjs`）。

## 站点配置

编辑根目录 `site.config.json`：

| 字段 | 说明 |
|------|------|
| `siteUrl` | 正式域名（RSS、sitemap、canonical） |
| `defaultLocale` | 默认语言，如 `en` |
| `locales` | 各语言的 `label`、`htmlLang`、`siteName`、`siteDescription` |
| `tutorialNav` | 顶栏导航（路径相对各语言根，如 `/tags/deals/`） |

## 构建输出

```
dist/
  index.html          # 跳转到 /{defaultLocale}/
  sitemap.xml         # 各语言 sitemap 索引
  assets/             # 全局 CSS/JS、search-index.{locale}.json
  en/  zh/  ja/        # 各语言完整站点
    posts/<slug>/
    tags/
    search/
    rss.xml
    sitemap.xml
```

## 部署到 Cloudflare Pages（GitHub 自动构建）

推荐方式：代码在 GitHub，由 Cloudflare 在每次 push 时自动 `npm run build` 并发布 `dist/`。

### 1. 推送仓库

仓库示例：`https://github.com/xiexiange/outsea_web`（确保 `main` 分支已推送最新代码）。

`dist/` 已在 `.gitignore` 中，**不要**把构建产物提交到 Git，交给 Cloudflare 构建。

### 2. 在 Cloudflare 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**
2. 选 **Pages** → **Connect to Git**
3. 授权 GitHub，选择仓库 `outsea_web`
4. 构建设置：

| 项 | 值 |
|----|-----|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/`（仓库根目录，留空即可） |

5. **Environment variables**（可选但建议）：

| 变量名 | 值 |
|--------|-----|
| `NODE_VERSION` | `20` |

6. 点 **Save and Deploy**，等待首次构建成功。

### 3. 自定义域名（可选）

Pages 项目 → **Custom domains** → 添加你的域名（域名需在 Cloudflare DNS 或按提示改 NS）。

### 4. 上线前改站点 URL

编辑 `site.config.json`，把 `siteUrl` 改成正式地址，例如：

```json
"siteUrl": "https://your-domain.com"
```

提交并 push 后，Cloudflare 会重新构建，RSS / sitemap / canonical 才会正确。

### 5. 路由说明

构建会生成 `dist/_redirects`，Cloudflare Pages 会自动识别：

- `/` → `/en/`（或你在 `defaultLocale` 里配置的语言）
- `/en`、`/zh`、`/ja` 补全尾部斜杠

文章链接请使用目录形式：`/en/posts/slug/`（与本地构建一致）。

### 6. 常见问题

| 现象 | 处理 |
|------|------|
| 构建失败 `npm ci` / 依赖 | 确认仓库根目录有 `package-lock.json`，Build 使用 `npm run build` |
| 页面 404 | 检查 **Build output** 是否为 `dist`（不是 `/dist` 或 `build`） |
| 只有首页、子路径 404 | 确认已部署最新构建（含 `_redirects`）；访问带尾部 `/` 的 URL |
| 预览环境 | 每个 PR 会有 `*.pages.dev` 预览子域，可在 Pages 设置里开关 |

### 其他方式（了解即可）

- **Wrangler CLI**：本地 `npx wrangler pages deploy dist`，适合手动发布，不连 Git。
- **GitHub Actions**：自己写 workflow 构建再上传；一般不如 Cloudflare 直连 Git 省事。

---

## 部署（宝塔 / Nginx）

1. 本地 `npm run build`
2. 将 `dist/` **全部**上传到站点根目录
3. Nginx 建议：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

子路径形如 `/en/posts/xxx/`，需保证目录索引 `index.html` 可访问。

## 与参考 blog 项目的差异

| 能力 | blog | outsea_web |
|------|------|------------|
| 默认语言 | 中文 UI | 英文 UI，多 locale 目录 |
| URL | `/posts/...` | `/en/posts/...` |
| 内容定位 | 技术笔记 | 好物推荐 + 商品卡片 |
| 加密文章 | 支持 | 保留（一般推广站可不配置） |

## 示例文章

已包含一篇三语示例：`content/posts/portable-charger-2026/`。上线前请将 `example.com` 联盟链接替换为真实推广 URL，并修改 `site.config.json` 中的 `siteUrl`。
