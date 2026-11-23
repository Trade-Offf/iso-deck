#!/usr/bin/env node
// 逐页（含页内节拍）截图，检查元素重叠和出画，生成一张总览页。需要 Node 22+ 和本机 Chrome。
// 也能把演示录成 GIF / MP4（需要 ffmpeg）。
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { launch, sleep } from './lib/chrome.mjs';
import { resolveDeckFile, deckName, isRemote, shown } from './lib/deck.mjs';

const W = 1600;
const H = 900;

/** "1-3,7" → [1,2,3,7]（从 1 开始） */
export function parseRange(spec, max) {
  if (!spec) return Array.from({ length: max }, (_, i) => i + 1);
  const out = new Set();
  for (const part of String(spec).split(',')) {
    const [a, b] = part.split('-').map((x) => parseInt(x, 10));
    for (let i = a; i <= (Number.isFinite(b) ? b : a); i++) if (i >= 1 && i <= max) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

const pad = (n) => String(n).padStart(2, '0');
const KIND = { entity: '实体', note: '便签', pills: '标签', label: '连线文字', card: '信息卡', cover: '封面' };
const who = (k) => {
  const [kind, id] = k.split(':');
  return kind === 'card' || kind === 'cover' ? KIND[kind] || kind : `${KIND[kind] || kind} ${id}`;
};
/** 把检查结果写成一句人话 */
export const describeIssue = (x) =>
  x.type === 'out-of-frame' ? `${who(x.a)} 超出画面` : `${who(x.a)} 和 ${who(x.b)} 重叠 ${Math.round(x.ratio * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function open(input, scale) {
  const url = isRemote(input) ? input : pathToFileURL(resolveDeckFile(input)).href;
  const page = await launch({ width: W, height: H, scale });
  await page.navigate(url);
  await page.waitFor('window.__isoDeck && window.__isoDeck.ready');
  await page.evaluate('document.fonts && document.fonts.ready.then(() => true)');
  return page;
}

function sheet(name, frames) {
  const cards = frames
    .map((f) => {
      const bad = f.issues.filter((x) => x.level === 'error').length;
      const warn = f.issues.length - bad;
      const tag = bad ? `<b class="e">${bad} 处遮挡</b>` : warn ? `<b class="w">${warn} 处提醒</b>` : '<b class="ok">OK</b>';
      const list = f.issues.map((x) => `<li class="${x.level}">${esc(x.msg)}</li>`).join('');
      return `<figure><a href="${f.file}"><img src="${f.file}" loading="lazy"></a><figcaption>${pad(f.step)}${f.beat ? `.${f.beat}` : ''} ${esc(f.short)} ${tag}</figcaption>${list ? `<ul>${list}</ul>` : ''}</figure>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(name)} · 截图总览</title>
<style>body{margin:0;padding:24px;background:#f4efe6;font:13px/1.5 -apple-system,"PingFang SC",sans-serif;color:#2b2622}
h1{font-size:18px;margin:0 0 16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:18px}
figure{margin:0;background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.08)}img{width:100%;display:block;border-radius:6px}
figcaption{margin-top:6px;font-weight:600}b{font-size:11px;padding:1px 6px;border-radius:8px;margin-left:6px}
.ok{background:#dff3e4;color:#23743c}.w{background:#fff1d6;color:#8a5a00}.e{background:#fde0dc;color:#b3261e}
ul{margin:6px 0 0;padding-left:18px;color:#6b625a}li.error{color:#b3261e}</style>
<h1>${esc(name)} · ${frames.length} 张</h1><main>${cards}</main>`;
}

/** 截图 + 检查。返回 { frames, errors, warnings, out } */
export async function shoot(input, { out, steps, scale = 1, wait = 900, beats = true } = {}) {
  const name = isRemote(input) ? 'deck' : deckName(resolveDeckFile(input));
  out = resolve(out || join(isRemote(input) ? '.' : dirname(resolveDeckFile(input)), 'shots'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const page = await open(input, scale);
  const frames = [];
  try {
    const count = await page.evaluate('__isoDeck.count');
    for (const step of parseRange(steps, count)) {
      const n = beats ? await page.evaluate(`__isoDeck.beatCount(${step - 1})`) : 0;
      for (let b = -1; b < n; b++) {
        await page.evaluate(`__isoDeck.go(${step - 1}, { beat: ${b}, instant: true }), true`);
        await sleep(wait);
        const a = await page.evaluate('__isoDeck.audit()');
        const file = `${pad(step)}${b >= 0 ? `-${b + 1}` : ''}.png`;
        writeFileSync(join(out, file), await page.screenshot('png'));
        frames.push({ step, beat: b + 1, short: a.short, zoom: a.zoom, file, issues: a.issues.map((x) => ({ ...x, msg: describeIssue(x) })) });
      }
    }
  } finally {
    await page.close();
  }
  const errors = frames.reduce((s, f) => s + f.issues.filter((x) => x.level === 'error').length, 0);
  const warnings = frames.reduce((s, f) => s + f.issues.filter((x) => x.level !== 'error').length, 0);
  writeFileSync(join(out, 'report.json'), JSON.stringify({ name, errors, warnings, frames }, null, 2));
  writeFileSync(join(out, 'index.html'), sheet(name, frames));
  return { frames, errors, warnings, out };
}

const has = (bin) => {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** 按真实动画节奏翻页，连续截帧到 tmp 目录。返回 [{ f, t }] */
async function capture(input, tmp, { steps, hold, fps }) {
  const page = await open(input, 1);
  const shots = [];
  try {
    const count = await page.evaluate('__isoDeck.count');
    const list = parseRange(steps, count);
    if (!list.length) throw new Error(`--steps ${steps} 不在 1–${count} 之间`);
    // 拍点序列：每页先看全景，再走完该页的节拍
    const marks = [];
    for (const s of list) {
      marks.push([s - 1, -1]);
      const n = await page.evaluate(`__isoDeck.beatCount(${s - 1})`);
      for (let b = 0; b < n; b++) marks.push([s - 1, b]);
    }
    await page.evaluate(`__isoDeck.go(${marks[0][0]}, { beat: ${marks[0][1]}, instant: true }), true`);
    await sleep(600);
    const gap = 1000 / fps;
    for (let m = 0; m < marks.length; m++) {
      if (m) await page.evaluate(`__isoDeck.go(${marks[m][0]}, { beat: ${marks[m][1]} }), true`);
      const t0 = Date.now();
      while (Date.now() - t0 < hold) {
        const t = Date.now();
        const f = join(tmp, `${String(shots.length).padStart(5, '0')}.jpg`);
        writeFileSync(f, await page.screenshot('jpeg', 82));
        shots.push({ f, t });
        const spent = Date.now() - t;
        if (spent < gap) await sleep(gap - spent);
      }
    }
  } finally {
    await page.close();
  }
  return shots;
}

/**
 * 录成 GIF / MP4：截帧后按真实时间间隔交给 ffmpeg 合成。
 * hold：每一拍停留的毫秒数；fps：截帧频率上限。
 */
export async function record(input, file, { steps, hold = 2600, fps = 12, width = 960 } = {}) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  if (!has(ffmpeg)) throw new Error('录 GIF / MP4 需要 ffmpeg（macOS：brew install ffmpeg），或用 FFMPEG_PATH 指定');
  file = resolve(file);
  const tmp = join(dirname(file), `.frames-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    const shots = await capture(input, tmp, { steps, hold, fps });
    const q = (f) => `'${f.replace(/'/g, "'\\''")}'`;
    const list = shots.map((s, i) => `file ${q(s.f)}\nduration ${(((shots[i + 1]?.t ?? s.t + 1000 / fps) - s.t) / 1000).toFixed(3)}`).join('\n');
    const concat = join(tmp, 'list.txt');
    writeFileSync(concat, `${list}\nfile ${q(shots[shots.length - 1].f)}\n`);
    const base = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concat];
    if (file.endsWith('.gif')) {
      execFileSync(ffmpeg, [...base, '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, file]);
    } else {
      execFileSync(ffmpeg, [...base, '-vf', `fps=30,scale=${width}:-2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return file;
}

export async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      steps: { type: 'string' },
      scale: { type: 'string' },
      wait: { type: 'string' },
      'no-beats': { type: 'boolean' },
      'no-fail': { type: 'boolean' },
      gif: { type: 'string' },
      mp4: { type: 'string' },
      hold: { type: 'string' },
      fps: { type: 'string' },
      width: { type: 'string' },
    },
  });
  const input = positionals[0];
  if (!input) {
    console.log(`用法：iso-deck shoot <deck 目录、html 或 http 地址> [选项]
  --out <目录>     截图输出目录，默认 deck 旁边的 shots/
  --steps 1-3,7    只截这些页
  --scale 2        高清截图（默认 1）
  --wait 900       每页等动画的毫秒数
  --no-beats       不截页内节拍
  --no-fail        有遮挡也返回 0
  --gif <文件>     录一段 GIF（需要 ffmpeg），配合 --steps / --hold / --fps / --width
  --mp4 <文件>     录一段 MP4`);
    return 1;
  }
  const rec = values.gif || values.mp4;
  if (rec) {
    const f = await record(input, rec, {
      steps: values.steps,
      hold: values.hold ? +values.hold : undefined,
      fps: values.fps ? +values.fps : undefined,
      width: values.width ? +values.width : undefined,
    });
    console.log(`✓ ${shown(f)}`);
    return 0;
  }
  const r = await shoot(input, {
    out: values.out,
    steps: values.steps,
    scale: values.scale ? +values.scale : 1,
    wait: values.wait ? +values.wait : 900,
    beats: !values['no-beats'],
  });
  const rel = shown(r.out);
  console.log(`${r.errors ? '✗' : '✓'} ${r.frames.length} 张截图 → ${rel}/index.html`);
  for (const f of r.frames) for (const x of f.issues) console.log(`  ${x.level === 'error' ? '✗' : '!'} ${pad(f.step)}${f.beat ? `.${f.beat}` : ''} ${f.short}：${x.msg}`);
  if (r.errors) console.log(`  共 ${r.errors} 处遮挡。打开总览页看图，按 references/layout-rules.md 调位置`);
  return r.errors && !values['no-fail'] ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run(process.argv.slice(2));
