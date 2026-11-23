#!/usr/bin/env node
// 由 deck 的口播稿（notes）和页内节拍（beats）生成 oil-studio 录屏剧本（Playbook JSON）。
// 每句口播一个拍点：翻页的拍点先等镜头到位，再按字数留出讲话时间。
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadDeck } from './lib/deck.mjs';

const MS_PER_CHAR = 230;
const MIN_HOLD = 2500;
const TRANSITION = 1400;

const plain = (s) => String(s).replace(/\*\*|`|<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export function buildPlaybook(deck, { url, title, subtitles = false, msPerChar = MS_PER_CHAR } = {}) {
  if (!/^https?:\/\//.test(url || '')) throw new Error('--url 必须是 http(s) 地址。先运行 iso-deck serve <目录>，再传 http://127.0.0.1:4178/...');
  const hold = (t) => Math.max(MIN_HOLD, Math.round(plain(t).length * msPerChar));
  const beats = [];
  const add = (id, text, actions) => beats.push({ id, ...(text ? { subtitle: plain(text) } : {}), actions: [...actions, { action: 'wait', ms: hold(text || '') }] });

  deck.steps.forEach((step, i) => {
    const n = String(i + 1).padStart(2, '0');
    const enter = i === 0 ? [{ action: 'open', url }, { action: 'wait', ms: 1500 }, { action: 'press', key: 'Home' }, { action: 'wait', ms: TRANSITION }] : [{ action: 'press', key: 'ArrowRight' }, { action: 'wait', ms: TRANSITION }];
    const notes = (Array.isArray(step.notes) ? step.notes : step.notes ? [step.notes] : []).map(plain).filter(Boolean);
    const lines = notes.length ? notes : [plain(step.title || '')];
    lines.forEach((t, k) => add(`p${n}${lines.length > 1 ? `-${k + 1}` : ''}`, t, k === 0 ? enter : []));
    (step.beats || []).forEach((b, k) => add(`p${n}-b${k + 1}`, b.say || '', [{ action: 'press', key: 'ArrowRight' }, { action: 'wait', ms: TRANSITION }]));
  });

  return {
    source: { title: title || deck.title || 'iso-deck' },
    ...(subtitles ? { settings: { subtitles: { enabled: true } } } : {}),
    beats,
  };
}

export function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { url: { type: 'string' }, out: { type: 'string', short: 'o' }, title: { type: 'string' }, subtitles: { type: 'boolean' }, 'ms-per-char': { type: 'string' } },
  });
  if (!positionals[0] || !values.url) {
    console.log(`用法：iso-deck playbook <deck 目录或 html> --url http://127.0.0.1:4178/<路径> [-o playbook.json] [--subtitles]
  --title        录屏时匹配的浏览器标签页标题，默认取页面 <title>
  --subtitles    打开字幕（字幕文字取口播稿）
  --ms-per-char  每个字留多少毫秒讲话时间，默认 ${MS_PER_CHAR}`);
    return 1;
  }
  const { deck, title } = loadDeck(positionals[0]);
  const book = buildPlaybook(deck, { url: values.url, title: values.title || title, subtitles: values.subtitles, msPerChar: values['ms-per-char'] ? +values['ms-per-char'] : undefined });
  const json = JSON.stringify(book, null, 2);
  if (values.out) {
    writeFileSync(values.out, json);
    const ms = book.beats.reduce((s, b) => s + b.actions.reduce((x, a) => x + (a.ms || 0), 0), 0);
    console.log(`✓ ${values.out}：${book.beats.length} 个拍点，约 ${Math.round(ms / 1000)} 秒`);
  } else console.log(json);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run(process.argv.slice(2));
