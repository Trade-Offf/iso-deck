#!/usr/bin/env node
// 从模板新建一个 deck：复制模板和引擎，路径改成 ./engine/，打开即可用。
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { shown } from './lib/deck.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES = Object.fromEntries(
  readdirSync(join(ROOT, 'templates'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), join(ROOT, 'templates', f)]),
);

export function newDeck(dir, { template = 'report', title, force = false } = {}) {
  const src = TEMPLATES[template];
  if (!src) throw new Error(`没有模板 ${template}，可选：${Object.keys(TEMPLATES).join(' / ')}`);
  dir = resolve(dir);
  const file = join(dir, 'index.html');
  if (existsSync(file) && !force) throw new Error(`${file} 已存在。换个目录，或加 --force 覆盖`);
  mkdirSync(dir, { recursive: true });
  let html = readFileSync(src, 'utf8').replace(/((?:src|href)=")(?:\.\.\/)+engine\//g, '$1./engine/');
  if (title) {
    const safeHtml = title.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const safeJs = `'${title.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/<\//g, '<\\/')}'`;
    html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${safeHtml} · 动态图解</title>`).replace(/(\n\s+title: )'[^']*'/, (m, p) => p + safeJs);
  }
  writeFileSync(file, html);
  cpSync(join(ROOT, 'engine'), join(dir, 'engine'), { recursive: true });
  return file;
}

export function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { template: { type: 'string', short: 't' }, title: { type: 'string' }, force: { type: 'boolean' } },
  });
  if (!positionals[0]) {
    console.log(`用法：iso-deck new <目录> [--template ${Object.keys(TEMPLATES).join('|')}] [--title 标题] [--force]
  report  向上汇报：现在的流程 → 改哪一段 → 怎么改 → 效果
  system  系统讲解：全景导览 → 主流程 → 故障场景 → 总结`);
    return 1;
  }
  const file = newDeck(positionals[0], { template: values.template, title: values.title, force: values.force });
  const rel = shown(file);
  console.log(`✓ ${rel}
  下一步：改 ${rel} 里的 model / facts / steps
  检查：iso-deck validate ${dirname(rel)} && iso-deck shoot ${dirname(rel)}
  打包：iso-deck build ${dirname(rel)}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run(process.argv.slice(2));
