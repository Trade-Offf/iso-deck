import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDeck } from '../scripts/lib/deck.mjs';
import { validateDeck } from '../scripts/validate.mjs';
import { buildSingle } from '../scripts/build-single.mjs';
import { newDeck } from '../scripts/new-deck.mjs';
import { buildPlaybook } from '../scripts/playbook.mjs';
import { parseRange, describeIssue } from '../scripts/shoot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'engine');
const tmp = () => mkdtempSync(join(tmpdir(), 'iso-deck-test-'));

/** 用一段 deck 对象写出临时 HTML，返回 loadDeck 的结果 */
function deckFrom(deck) {
  const dir = tmp();
  const file = join(dir, 'index.html');
  writeFileSync(
    file,
    `<!doctype html><html><head><title>t</title><link rel="stylesheet" href="${ENGINE}/iso.css" /></head><body><div id="app"></div>
<script src="${ENGINE}/iso-stage.js"></script>
<script src="${ENGINE}/iso-deck.js"></script>
<script>const { block, link } = Iso.h; IsoDeck.mount('#app', ${deck});</script></body></html>`,
  );
  return loadDeck(file);
}

const BASE_MODEL = `{
  entities: { a: block(0, 0, { label: ['A'] }), b: block(10, 0, { label: ['B'] }), c: block(0, 10, { label: ['C'] }) },
  links: { ab: link('a', 'b', { label: '连' }), bc: link('b', 'c') },
}`;

for (const p of ['examples/ai-translation', 'examples/order-flow', 'templates/report.html', 'templates/system.html']) {
  test(`${p} 校验无错误、无提醒`, () => {
    const r = validateDeck(loadDeck(join(ROOT, p)));
    assert.equal(r.errors, 0, JSON.stringify(r.issues, null, 1));
    assert.equal(r.warnings, 0, JSON.stringify(r.issues, null, 1));
  });
}

test('prepare：按 id 引用模型、局部覆盖会合并、整块对象原样使用', () => {
  const { deck } = deckFrom(`{ model: ${BASE_MODEL}, steps: [
    { title: 'x', notes: ['n'], scene: { entities: ['a', 'b'], links: ['ab'] } },
    { title: 'y', notes: ['n'], scene: { entities: { a: true, b: { dim: 1 }, z: block(5, 5, { label: ['Z'] }) }, links: { ab: { style: 'muted' } } } },
  ] }`);
  const [s1, s2] = deck.steps.map((s) => s.scene);
  assert.deepEqual(Object.keys(s1.entities), ['a', 'b']);
  assert.equal(s1.entities.a.type, 'block');
  assert.equal(s1.links.ab.from, 'a');
  assert.equal(s2.entities.b.dim, 1);
  assert.equal(s2.entities.b.x, 10, '覆盖只改 dim，坐标仍来自模型');
  assert.equal(s2.entities.z.x, 5);
  assert.equal(s2.links.ab.style, 'muted');
  assert.equal(s2.links.ab.label, '连');
});

test('facts：{key} 替换为 value，未定义的 key 报错，缺 source 报错', () => {
  const ok = deckFrom(`{ facts: { n: { value: '12 倍', source: '测试' } }, steps: [{ title: '省 {n}', notes: ['x'], scene: {} }] }`);
  assert.equal(ok.deck.steps[0].title, '省 12 倍');
  assert.equal(validateDeck(ok).errors, 0);

  const bad = deckFrom(`{ facts: { n: { value: '1' } }, steps: [{ title: '{n} 和 {m}', notes: ['x'], scene: {} }] }`);
  const msgs = validateDeck(bad).issues.filter((x) => x.level === 'error').map((x) => x.msg).join('\n');
  assert.match(msgs, /缺少 source/);
  assert.match(msgs, /\{m\} 不在数字台账/);
});

test('有台账时，硬写的数字会被提醒', () => {
  const r = validateDeck(deckFrom(`{ facts: { n: { value: '1', source: 's' } }, steps: [{ title: '成本 ¥1.3 → {n}', notes: ['x'], scene: {} }] }`));
  assert.ok(r.issues.some((x) => /¥1\.3/.test(x.msg)), JSON.stringify(r.issues));
});

test('引用错误：模型里没有的实体、连到本页不存在的实体、focus 不在本页', () => {
  const r = validateDeck(deckFrom(`{ model: ${BASE_MODEL}, steps: [
    { title: 'x', notes: ['n'], scene: { entities: ['a', 'nope'], links: ['ab'] }, beats: [{ say: 's', focus: ['c'] }, { say: 'end' }] },
  ] }`));
  const msgs = r.issues.map((x) => x.msg).join('\n');
  assert.match(msgs, /实体 nope 不在 model\.entities/);
  assert.match(msgs, /连到了本页不存在的实体 b/);
  assert.match(msgs, /focus 的实体 c 不在本页/);
});

test('没有 model 时，scene 写成 id 列表会报错', () => {
  const r = validateDeck(deckFrom(`{ steps: [{ title: 'x', notes: ['n'], scene: { entities: ['a'] } }] }`));
  assert.ok(r.issues.some((x) => x.level === 'error' && /deck\.model/.test(x.msg)), JSON.stringify(r.issues));
});

test('模型连线文字里硬写的数字也会被提醒', () => {
  const r = validateDeck(deckFrom(`{ facts: { n: { value: '1', source: 's' } }, model: { entities: { a: block(0, 0), b: block(9, 0) }, links: { ab: link('a', 'b', { label: '≤50 条 {n}' }) } },
    steps: [{ title: 'x', notes: ['n'], scene: { entities: ['a', 'b'], links: ['ab'] } }] }`));
  assert.ok(r.issues.some((x) => /50 条/.test(x.msg)), JSON.stringify(r.issues));
});

test('比例悬殊的柱子会被提醒（坐标系被压扁）', () => {
  const r = validateDeck(deckFrom(`{ steps: [{ title: 'x', notes: ['n'], scene: {
    entities: { p: block(0, 0, { h: 292 }), q: block(5, 5, { h: 14 }), r: block(10, 10, { h: 1 }) },
    card: { bars: [{ value: 292 }, { value: 14 }, { value: 1 }] } } }] }`));
  const msgs = r.issues.map((x) => x.msg).join('\n');
  assert.match(msgs, /方块高度相差约/);
  assert.match(msgs, /对比条相差约/);
});

test('beatScene：focus 以外的实体变暗、无关连线静音、镜头推近', () => {
  const { deck, IsoDeck } = deckFrom(`{ model: ${BASE_MODEL}, steps: [{ title: 'x', notes: ['n'], scene: { entities: ['a', 'b', 'c'], links: ['ab', 'bc'] } }] }`);
  const s = IsoDeck.beatScene(deck.steps[0].scene, { focus: ['a'], zoom: 1.3 }, 1);
  assert.equal(s.entities.a.dim || 0, 0);
  assert.equal(s.entities.c.dim, 1);
  assert.equal(s.links.ab.style, undefined);
  assert.equal(s.links.bc.style, 'muted');
  assert.equal(s.camera.zoom, 1.3);
  assert.equal(s.card, null);
});

test('findIssues：文字压在体块中心算遮挡，落在体块空角不算', () => {
  const { IsoDeck } = deckFrom(`{ steps: [{ title: 'x', notes: ['n'], scene: {} }] }`);
  const ent = { id: 'e', kind: 'entity', box: [100, 100, 300, 300] };
  const hit = IsoDeck.findIssues([ent, { id: 'l', kind: 'label', box: [170, 180, 230, 200] }], 1600, 900);
  assert.equal(hit[0].level, 'error');
  const corner = IsoDeck.findIssues([ent, { id: 'l', kind: 'label', box: [100, 100, 130, 120] }], 1600, 900);
  assert.equal(corner.length, 0);
  const out = IsoDeck.findIssues([{ id: 'x', kind: 'entity', box: [1500, 10, 1700, 60] }], 1600, 900);
  assert.equal(out[0].type, 'out-of-frame');
  assert.equal(IsoDeck.findIssues([{ id: 'x', kind: 'entity', box: [1500, 10, 1700, 60], dim: true }], 1600, 900).length, 0);
  assert.match(describeIssue(hit[0]), /重叠/);
});

test('build：单文件里没有本地 css/js 引用', () => {
  const out = join(tmp(), 'deck.html');
  buildSingle(join(ROOT, 'examples/order-flow'), out);
  const html = readFileSync(out, 'utf8');
  assert.doesNotMatch(html, /<script\s+src=/);
  assert.doesNotMatch(html, /<link\s+rel="stylesheet"/);
  assert.match(html, /IsoDeck\.mount/);
});

test('new：复制模板和引擎，路径改成 ./engine/，并能通过校验', () => {
  const dir = join(tmp(), 'my-deck');
  const file = newDeck(dir, { template: 'system', title: '我的系统' });
  const html = readFileSync(file, 'utf8');
  assert.match(html, /src="\.\/engine\/iso-stage\.js"/);
  assert.match(html, /title: '我的系统'/);
  const odd = readFileSync(newDeck(join(tmp(), 'odd'), { template: 'report', title: "Bob's <x>" }), 'utf8');
  assert.match(odd, /<title>Bob's &lt;x&gt;/);
  assert.match(odd, /title: 'Bob\\'s <x>'/);
  assert.ok(existsSync(join(dir, 'engine', 'iso-deck.js')));
  assert.equal(validateDeck(loadDeck(dir)).errors, 0);
  assert.throws(() => newDeck(dir, { template: 'system' }), /已存在/);
});

test('playbook：第一拍先 open，每页和每个节拍各一拍', () => {
  const { deck } = loadDeck(join(ROOT, 'examples/order-flow'));
  const book = buildPlaybook(deck, { url: 'http://127.0.0.1:4178/examples/order-flow/', subtitles: true });
  assert.equal(book.beats[0].actions[0].action, 'open');
  const ids = book.beats.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('p02-b1'));
  assert.equal(book.settings.subtitles.enabled, true);
  assert.throws(() => buildPlaybook(deck, { url: 'file:///x' }), /http/);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('1-3,7', 10), [1, 2, 3, 7]);
  assert.deepEqual(parseRange(undefined, 3), [1, 2, 3]);
  assert.deepEqual(parseRange('9-12', 10), [9, 10]);
});
