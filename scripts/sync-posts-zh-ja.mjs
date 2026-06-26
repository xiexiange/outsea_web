import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "_posts_src");
const postsDir = path.join(__dirname, "..", "content", "posts");

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md"));

for (const name of files) {
  const dot = name.indexOf(".index.");
  if (dot === -1) continue;
  const slug = name.slice(0, dot);
  const locale = name.slice(dot + ".index.".length, -".md".length);
  const dest = path.join(postsDir, slug, `index.${locale}.md`);
  const content = fs.readFileSync(path.join(srcDir, name), "utf8");
  fs.writeFileSync(dest, content, "utf8");
  const title = content.split("\n")[1] || "";
  const ok = !title.includes("?");
  console.log(`${slug}/${locale}: ${ok ? "OK" : "BAD"} | ${title.slice(0, 50)}`);
}
