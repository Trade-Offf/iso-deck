#!/usr/bin/env node
// 渲染前检查 deck 数据：引用的 id 是否存在、数字是否都走了台账、镜头和分拍是否越界、柱子比例是否失真。
// 用法：node scripts/cli.mjs validate <deck 目录或 html> [--json] [--strict]
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadDeck } from './lib/deck.mjs';

const FACT = /\{([A-Za-z_][\w.-]*)\}/g;
const NUM =
  /(?:[¥$€£]\s?\d[\d,.]*(?:\s?[–~-]\s?\d[\d,.]*)?|\d[\d,.]*(?:\s?[–~-]\s?\d[\d,.]*)?\s?(?:%|倍|分钟|分(?![享析布别开段派配成类工])|天|小时|秒|条|元|块钱|万|亿|ms|TB|GB|MB|KB|PB|台|次|人|美元|刀))/g;

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function walk(v, fn, path) {
  if (typeof v === 'string') fn(v, path);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${path}[${i}]`));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, fn, path ? `${path}.${k}` : k);
}

/** 观众能看到的文字 */
function visibleTexts(step) {
  const out = [];
  const push = (v, where) => walk(v, (s) => out.push([s, where]), '');
  push(step.title, '标题');
  push(step.body, '正文');
  if (step.callout) push(step.callout.text, '提示框');
  push(step.changes, '变化列表');
  if (step.cover) push([step.cover.kicker, step.cover.title, step.cover.subtitle, step.cover.stats, step.cover.agenda], '封面');
  const sc = step.scene || {};
  if (isObj(sc.card)) push([sc.card.title, sc.card.lines, (sc.card.bars || []).map((b) => [b.label, b.text])], '信息卡');
  if (isObj(sc.entities)) for (const [id, e] of Object.entries(sc.entities)) if (isObj(e)) push(entityText(e), `实体 ${id}`);
  if (isObj(sc.links)) for (const [id, l] of Object.entries(sc.links)) if (isObj(l)) push(l.label, `连线 ${id}`);
  for (const b of step.beats || []) if (b.card) push([b.card.title, b.card.lines], '分拍信息卡');
  return out;
}
const entityText = (e) => [e.label, e.sub, e.text, (e.tags || []).map((t) => t.text)];

function refBase(v) {
  if (typeof v !== 'string') return null;
  const m = /^(.+?)[+-]\d*\.?\d+$/.exec(v);
  return m ? m[1] : v;
}

function squashed(values) {
  const vs = values.filter((v) => typeof v === 'number' && v > 0);
  if (vs.length < 3) return null;
  const max = Math.max(...vs);
  const small = vs.filter((v) => v < max / 12);
  return small.length >= 2 ? Math.round(max / Math.min(...vs)) : null;
}

export function validateDeck({ raw, deck }) {
  const issues = [];
  const add = (level, where, msg) => issues.push({ level, where, msg });
  const facts = isObj(raw.facts) ? raw.facts : null;
  const model = isObj(raw.model) ? raw.model : null;

  /* 数字台账 */
  if (facts)
    for (const [k, f] of Object.entries(facts)) {
      if (!isObj(f) || f.value == null) add('error', `facts.${k}`, '要写成 { value, source }');
      else if (!f.source || !String(f.source).trim()) add('error', `facts.${k}`, '缺少 source：写明这个数字从哪来（会议、报表、测试记录）');
    }
  const used = new Set();
  walk({ title: raw.title, subtitle: raw.subtitle, model: raw.model, steps: raw.steps }, (s, path) => {
    for (const m of s.matchAll(FACT)) {
      used.add(m[1]);
      if (!facts || !(m[1] in facts)) add('error', path, `{${m[1]}} 不在数字台账 deck.facts 里`);
    }
  }, '');
  if (facts) for (const k of Object.keys(facts)) if (!used.has(k)) add('warn', `facts.${k}`, '台账里有，但页面没有用到');

  /* 硬写的数字 */
  let bare = 0;
  const scanNums = (texts, where) => {
    for (const [s, field] of texts) {
      const plain = s.replace(FACT, '');
      for (const m of plain.matchAll(NUM)) {
        bare += 1;
        if (facts) add('warn', where, `${field}里的“${m[0].trim()}”没有走数字台账，换成 {key} 并在 facts 里写出处`);
      }
    }
  };
  if (model) {
    for (const [id, e] of Object.entries(model.entities || {})) scanNums(entityText(e).flat(2).filter(Boolean).map((s) => [s, `实体 ${id} `]), 'model');
    for (const [id, l] of Object.entries(model.links || {})) if (l && l.label) scanNums([[l.label, `连线 ${id} `]], 'model');
  }

  const steps = raw.steps || [];
  if (!steps.length) add('error', 'deck', 'steps 是空的');
  steps.forEach((rs, i) => {
    const ps = deck.steps[i];
    const where = `第 ${i + 1} 步${rs.short ? `（${rs.short}）` : ''}`;
    if (!list(rs.notes).length && !(rs.beats || []).length) add('warn', where, '没有 notes（口播提词）');
    scanNums(visibleTexts(rs), where);

    const sc = rs.scene || {};
    if (!model && (Array.isArray(sc.entities) || Array.isArray(sc.links))) add('error', where, 'entities / links 写成 id 列表时，需要在 deck.model 里定义这些实体和连线');
    if (model && sc.entities) {
      const src = Array.isArray(sc.entities) ? Object.fromEntries(sc.entities.map((id) => [id, true])) : sc.entities;
      for (const [id, v] of Object.entries(src)) if (v && !(isObj(v) && 'type' in v) && !(model.entities || {})[id]) add('error', where, `实体 ${id} 不在 model.entities 里`);
    }
    if (model && sc.links) {
      const src = Array.isArray(sc.links) ? Object.fromEntries(sc.links.map((id) => [id, true])) : sc.links;
      for (const [id, v] of Object.entries(src)) if (v && !(isObj(v) && 'from' in v) && !(model.links || {})[id]) add('error', where, `连线 ${id} 不在 model.links 里`);
    }

    const scene = ps.scene || {};
    const ents = scene.entities || {};
    const links = scene.links || {};
    for (const [id, l] of Object.entries(links)) {
      for (const end of [l.from, l.to]) if (end && !ents[end]) add('error', where, `连线 ${id} 连到了本页不存在的实体 ${end}`);
      for (const p of l.pts || []) for (const c of Array.isArray(p) ? p : [p]) {
        const b = refBase(c);
        if (b && !ents[b]) add('error', where, `连线 ${id} 的拐点引用了不存在的实体 ${b}`);
      }
    }
    for (const f of scene.flows || []) {
      const segs = f.routes ? f.routes.flatMap((r) => r.path || []) : (f.route || []).flat();
      for (const s of segs) if (!links[s]) add('error', where, `数据包路线用到了本页不存在的连线 ${s}`);
    }
    const z = scene.camera && scene.camera.zoom;
    if (z != null && (z < 0.3 || z > 3)) add('warn', where, `镜头倍数 ${z} 超出 0.3–3`);

    const beats = rs.beats || [];
    beats.forEach((b, k) => {
      for (const id of list(b.focus)) if (!ents[id]) add('error', `${where} 第 ${k + 1} 拍`, `focus 的实体 ${id} 不在本页`);
      if (b.zoom != null && (b.zoom < 1.1 || b.zoom > 1.5)) add('warn', `${where} 第 ${k + 1} 拍`, `推近 ${b.zoom} 倍，建议 1.2–1.35`);
      if (!b.say) add('warn', `${where} 第 ${k + 1} 拍`, '没有 say（这一拍讲什么）');
    });
    if (beats.length && list(beats[beats.length - 1].focus).length) add('warn', where, '最后一拍还停在近景，建议补一拍不带 focus 的全景收尾');

    const heights = Object.values(ents).filter((e) => e.type === 'block' && typeof e.h === 'number').map((e) => e.h);
    const r1 = squashed(heights);
    if (r1) add('warn', where, `方块高度相差约 ${r1} 倍，矮的几个几乎看不见。差距太大时别按比例画，改用文字标注`);
    const bars = (scene.card && scene.card.bars) || [];
    const r2 = squashed(bars.map((b) => b.value));
    if (r2) add('warn', where, `信息卡对比条相差约 ${r2} 倍，短的几条看不出长度`);
  });
  if (!facts && bare) add('warn', 'deck', `页面上有 ${bare} 处数字，但没有 deck.facts 台账。对外汇报建议每个数字都写明出处`);

  return {
    ok: !issues.some((x) => x.level === 'error'),
    errors: issues.filter((x) => x.level === 'error').length,
    warnings: issues.filter((x) => x.level === 'warn').length,
    steps: steps.length,
    issues,
  };
}

export function printReport(name, r) {
  const head = r.ok ? `✓ ${name}：${r.steps} 步，没有错误` : `✗ ${name}：${r.errors} 个错误`;
  console.log(`${head}${r.warnings ? `，${r.warnings} 条提醒` : ''}`);
  for (const x of r.issues) console.log(`  ${x.level === 'error' ? '✗' : '!'} ${x.where}：${x.msg}`);
}

export async function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { json: { type: 'boolean' }, strict: { type: 'boolean' } } });
  if (!positionals.length) {
    console.log('用法：iso-deck validate <deck 目录或 html> [--json] [--strict]\n  --strict  提醒也算失败');
    return 1;
  }
  let failed = false;
  for (const p of positionals) {
    const loaded = loadDeck(p);
    const r = validateDeck(loaded);
    if (values.json) console.log(JSON.stringify({ file: loaded.file, ...r }, null, 2));
    else printReport(p, r);
    if (!r.ok || (values.strict && r.warnings)) failed = true;
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await run(process.argv.slice(2));
