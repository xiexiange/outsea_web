import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TAG = process.argv[2] || 'idovepicks-20';
const DIRS = ['content/posts', 'scripts/_posts_src'];
const re = /(https:\/\/www\.amazon\.com\/(?:[^\s\n]+?\/)?dp\/[A-Z0-9]{10})(?![^\s\n?]*tag=)/gi;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

let count = 0;
for (const dir of DIRS) {
  const abs = join(ROOT, dir);
  for (const file of walk(abs)) {
    const src = readFileSync(file, 'utf8');
    const next = src.replace(re, `$1?tag=${TAG}`);
    if (next !== src) {
      writeFileSync(file, next);
      console.log('updated:', file.replace(ROOT + '/', '').replace(ROOT + '\\', ''));
      count++;
    }
  }
}
console.log(`files updated: ${count}`);
