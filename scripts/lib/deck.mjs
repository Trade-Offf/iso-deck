// 读取 deck HTML：找出引用的脚本、在 Node 里执行得到 deck 数据（不需要浏览器）。
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join, basename, relative } from 'node:path';
import vm from 'node:vm';

/** 打印用路径：在当前目录下显示相对路径，否则显示绝对路径 */
export const shown = (p) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

export const isRemote = (p) => /^(https?:)?\/\//.test(p);

/** 目录或 HTML 路径 → HTML 文件的绝对路径 */
export function resolveDeckFile(input) {
  let p = resolve(input);
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!existsSync(p)) throw new Error(`找不到 deck 文件：${p}`);
  return p;
}

/** deck 的名字：index.html 取所在目录名，否则取文件名 */
export function deckName(file) {
  const b = basename(file, '.html');
  return b === 'index' ? basename(dirname(file)) : b;
}

export function htmlTitle(html) {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return m ? m[1].trim() : '';
}

export function scriptsOf(html, dir) {
  return [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((m) => {
    const src = /\bsrc="([^"]+)"/.exec(m[1] || '');
    if (!src) return { code: m[2] };
    if (isRemote(src[1])) return { remote: src[1] };
    return { src: resolve(dir, src[1]) };
  });
}

/**
 * 在沙箱里执行页面脚本，拦截 IsoDeck.mount，拿到原始 deck 和展开后的 deck。
 * 返回 { raw, deck, options, title, file, Iso, IsoDeck }
 */
export function loadDeck(input) {
  const file = resolveDeckFile(input);
  const html = readFileSync(file, 'utf8');
  const dir = dirname(file);
  const ctx = {
    console,
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    addEventListener: () => {}, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    history: { replaceState() {} }, location: { hash: '' },
    document: { fonts: null, documentElement: {}, querySelector: () => null, createElement: () => ({ getContext: () => null }) },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const mounted = [];
  let patched = false;
  for (const s of scriptsOf(html, dir)) {
    if (s.remote) continue;
    const code = s.src ? readFileSync(s.src, 'utf8') : s.code;
    vm.runInContext(code, ctx, { filename: s.src || file });
    if (!patched && ctx.IsoDeck) {
      patched = true;
      ctx.IsoDeck.mount = (target, deck, options) => {
        mounted.push({ deck, options: options || {} });
        return {};
      };
    }
  }
  if (!ctx.IsoDeck) throw new Error(`${file} 没有加载 iso-deck.js`);
  if (!mounted.length) throw new Error(`${file} 没有调用 IsoDeck.mount(...)`);
  const { deck: raw, options } = mounted[mounted.length - 1];
  return { file, title: htmlTitle(html), raw, deck: ctx.IsoDeck.prepare(raw), options, Iso: ctx.Iso, IsoDeck: ctx.IsoDeck };
}
