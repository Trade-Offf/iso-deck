#!/usr/bin/env node
// 把引用了本地 css/js 的 deck 打包成一个 HTML：双击就能打开，可以直接发给别人。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveDeckFile, deckName, isRemote, shown } from './lib/deck.mjs';

/** 内联后的 HTML 字符串 */
export function inline(file) {
  const dir = dirname(file);
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) =>
    isRemote(href) ? m : `<style>\n${readFileSync(resolve(dir, href), 'utf8')}\n</style>`,
  );
  html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (m, s) =>
    isRemote(s) ? m : `<script>\n${readFileSync(resolve(dir, s), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`,
  );
  return html;
}

/** 默认输出到 deck 目录下的 dist/<名字>.html */
export function buildSingle(input, out) {
  const file = resolveDeckFile(input);
  const html = inline(file);
  out = resolve(out || join(dirname(file), 'dist', `${deckName(file)}.html`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return { out, bytes: Buffer.byteLength(html) };
}

export function run(argv) {
  const [input, out] = argv;
  if (!input) {
    console.log('用法：iso-deck build <deck 目录或 html> [输出路径]\n  默认输出到 <deck 目录>/dist/<名字>.html');
    return 1;
  }
  const r = buildSingle(input, out);
  console.log(`✓ ${shown(r.out)}（${(r.bytes / 1024).toFixed(1)} KB），双击即可打开`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run(process.argv.slice(2));
