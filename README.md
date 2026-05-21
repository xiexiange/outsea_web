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
