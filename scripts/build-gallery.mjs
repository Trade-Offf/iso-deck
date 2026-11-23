#!/usr/bin/env node
// 生成 GitHub Pages 画廊：docs/<示例>.html（单文件）+ docs/posters/<示例>.png + docs/index.html
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSingle } from './build-single.mjs';
import { loadDeck } from './lib/deck.mjs';
import { launch, sleep } from './lib/chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const BLURB = {
  'ai-translation': '向上汇报：把流程里的一段交给 AI，讲清改了哪、省了多少、质量守不守得住。',
  'order-flow': '系统讲解：给新同事讲一次下单经过哪些服务，页内节拍逐块推近。',
};
const ORDER = ['ai-translation', 'order-flow'];

export async function buildGallery({ posters = true } = {}) {
  mkdirSync(join(DOCS, 'posters'), { recursive: true });
  const names = readdirSync(join(ROOT, 'examples'))
    .filter((n) => existsSync(join(ROOT, 'examples', n, 'index.html')))
    .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
  const items = [];
  for (const name of names) {
    const src = join(ROOT, 'examples', name);
    const { deck } = loadDeck(src);
    buildSingle(src, join(DOCS, `${name}.html`));
    items.push({ name, title: deck.title, subtitle: deck.subtitle, steps: deck.steps.length });
  }
  if (posters) {
    const page = await launch({ width: 1600, height: 900, scale: 1 });
    try {
      for (const it of items) {
        await page.navigate(pathToFileURL(join(DOCS, `${it.name}.html`)).href);
        await page.waitFor('window.__isoDeck && window.__isoDeck.ready');
        await page.evaluate(`__isoDeck.go(${Math.min(1, it.steps - 1)}, { instant: true }), true`);
        await sleep(1200);
        writeFileSync(join(DOCS, 'posters', `${it.name}.jpg`), await page.screenshot('jpeg', 86));
      }
    } finally {
      await page.close();
    }
  }
  const cards = items
    .map(
      (it) => `<a class="card" href="./${it.name}.html"><img src="./posters/${it.name}.jpg" alt="${esc(it.title)}" loading="lazy">
  <div class="meta"><b>${esc(it.title)}</b><span>${esc(BLURB[it.name] || it.subtitle || '')}</span><i>${it.steps} 页 · 打开演示 →</i></div></a>`,
    )
    .join('\n');
  writeFileSync(
    join(DOCS, 'index.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>iso-deck · 动态等距图解</title>
<style>
body{margin:0;background:#f4efe6;color:#2b2622;font:15px/1.6 -apple-system,"PingFang SC","Hiragino Sans GB",sans-serif}
main{max-width:1180px;margin:0 auto;padding:56px 24px 80px}
h1{font-size:34px;margin:0 0 8px;letter-spacing:.5px}p.lead{margin:0 0 36px;color:#6b625a;max-width:720px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px}
.card{display:block;background:#fffdf9;border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(60,40,20,.06);transition:transform .2s}
.card:hover{transform:translateY(-3px)}.card img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;border-bottom:1px solid #eee4d6}
.meta{padding:14px 16px 16px;display:grid;gap:4px}.meta span{color:#6b625a;font-size:13.5px}.meta i{font-style:normal;font-size:12.5px;color:#2f7a3d;font-weight:600}
code{background:#ece3d5;padding:2px 6px;border-radius:5px;font-size:13px}
</style>
<main><h1>iso-deck</h1>
<p class="lead">把一份口播稿做成会动的等距图解：流程一层层长出来，镜头推到正在讲的地方，数字都有出处。下面每个示例都是一个单独的 HTML 文件，打开就能演示，按 <code>→</code> 翻页，<code>N</code> 看提词。</p>
<div class="grid">${cards}</div></main></html>`,
  );
  return items;
}

export async function run(argv) {
  const items = await buildGallery({ posters: !argv.includes('--no-posters') });
  console.log(`✓ docs/index.html：${items.length} 个示例`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run(process.argv.slice(2));
