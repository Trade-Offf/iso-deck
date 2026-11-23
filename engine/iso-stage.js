/*
 * iso-stage.js — 等距（isometric）动态图解舞台引擎
 *
 * 用法：
 *   const stage = new Iso.Stage(hostElement);
 *   stage.goTo(scene);            // 每次翻页传入一个场景快照，引擎自动 diff 并补间
 *
 * 场景结构：{ entities: {id: entity}, links: {id: link}, flows: [flow], card: {...}, fit, camera }
 * 详见 ../references/scene-api.md
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#211e1b';

  const PALETTE = {
    orange: { top: ['#fee6cc', '#fcd4ad'], side: ['#f9c697', '#f3b47f'] },
    green: { top: ['#e2f2d7', '#d1e9c2'], side: ['#c3e1b2', '#b3d79f'] },
    blue: { top: ['#dfebf9', '#cde0f5'], side: ['#bcd3ef', '#a9c5e8'] },
    yellow: { top: ['#fff3d6', '#fee7b8'], side: ['#fcdb9c', '#f6cd82'] },
    purple: { top: ['#f2eaf9', '#e6dbf4'], side: ['#d9cbef', '#cbbae6'] },
    red: { top: ['#fde6df', '#fbd3c7'], side: ['#f6bca9', '#eea18a'] },
    gray: { top: ['#f3efea', '#e8e2db'], side: ['#dbd4cb', '#cdc5bb'] },
    slab: { top: ['#f7f0e7', '#f0e7dc'], side: ['#ece2d5', '#e3d7c8'] },
  };

  const TONES = {
    paper: { bg: '#fffaf2', fg: INK, stroke: INK },
    dark: { bg: INK, fg: '#fdf8f1', stroke: INK },
    red: { bg: '#fde3dc', fg: '#a8321c', stroke: '#a8321c' },
    green: { bg: '#e2f2d7', fg: '#2f6b2a', stroke: '#2f6b2a' },
    blue: { bg: '#dfebf9', fg: '#2b5a92', stroke: '#2b5a92' },
    orange: { bg: '#fee6cc', fg: '#9a4f12', stroke: '#9a4f12' },
    muted: { bg: '#f4ebe0', fg: '#6b6259', stroke: '#b9ad9f' },
  };

  /* 24×24 线性图标（lucide 风格） */
  const ICONS = {
    server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    trendingUp: '<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sparkles: '<path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8-5.8-1.9 5.8-1.9z"/><path d="M19 15v4M17 17h4"/>',
    cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V4H8M2 14h2M20 14h2M9 13v2M15 13v2"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    balancer: '<circle cx="12" cy="5" r="2"/><path d="M12 7v4M12 11l-7 7M12 11l7 7M12 11v7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16V9"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };

  const TIMING = { exit: 420, move: 820, enter: 680, stagger: 130, draw: 560, linkFade: 300 };
  const ease = {
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
    out: (t) => 1 - (1 - t) ** 3,
    back: (t) => 1 + 2.35 * (t - 1) ** 3 + 1.35 * (t - 1) ** 2,
  };

  const R = (v) => Math.round(v * 100) / 100;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const md = (s) =>
    String(s ?? '')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  /** 世界坐标（网格单位 x, y，高度 z 像素）→ 屏幕坐标。2:1 等距。 */
  const iso = (x, y, z = 0) => [R(14 * (x + y)), R(7 * (x - y) - z)];

  /* ---------- 文本测量 ---------- */
  let measureCtx = null;
  let fontFamily = null;
  function font() {
    if (!fontFamily) {
      fontFamily =
        getComputedStyle(document.documentElement).getPropertyValue('--iso-font').trim() ||
        'ui-monospace, monospace';
    }
    return fontFamily;
  }
  function textWidth(s, size, weight = 700) {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} ${size}px ${font()}`;
    return measureCtx.measureText(String(s)).width;
  }

  /* ---------- SVG 片段 ---------- */
  const text = (x, y, s, size = 13, weight = 700, fill = INK, extra = '') =>
    `<text x="${R(x)}" y="${R(y)}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}" ${extra}>${esc(s)}</text>`;

  function icon(name, cx, cy, size = 20, { stroke = INK, sw = 1.9 } = {}) {
    const p = ICONS[name];
    if (!p) return '';
    const k = size / 24;
    return `<g transform="translate(${R(cx - size / 2)} ${R(cy - size / 2)}) scale(${R(k)})" fill="none" stroke="${stroke}" stroke-width="${R(sw / k)}" stroke-linecap="round" stroke-linejoin="round">${p}</g>`;
  }

  /** HTML 内联图标 */
  const iconSvg = (name, size = 16) =>
    ICONS[name]
      ? `<svg class="iso-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
      : '';

  function pillSize(label, { icon: ic, size = 10.5 } = {}) {
    const tw = textWidth(label, size, 700);
    return { w: tw + (ic ? size + 4 : 0) + 16, h: size + 9, tw };
  }

  function pill(cx, cy, label, opts = {}) {
    const { tone = 'paper', icon: ic, size = 10.5 } = opts;
    const t = TONES[tone] || TONES.paper;
    const { w, h, tw } = pillSize(label, opts);
    const x = cx - w / 2;
    const y = cy - h / 2;
    const iw = ic ? size + 4 : 0;
    return (
      `<g class="iso-pill"><rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${R(h / 2)}" fill="${t.bg}" stroke="${t.stroke}" stroke-width="1.3"/>` +
      (ic ? icon(ic, x + 8 + size / 2, cy, size + 1, { stroke: t.fg, sw: 2.1 }) : '') +
      text(x + 8 + iw + tw / 2, cy + size * 0.36, label, size, 700, t.fg) +
      `</g>`
    );
  }

  function cpuMeter(cx, cy, v) {
    const w = 46;
    const h = 14;
    const x = cx - w / 2;
    const col = v < 0.6 ? '#7cc16f' : v < 0.85 ? '#f0a23a' : '#e5533d';
    return (
      `<g><rect x="${R(x)}" y="${R(cy - h / 2)}" width="${w}" height="${h}" rx="7" fill="#fffaf2" stroke="${INK}" stroke-width="1.3"/>` +
      `<rect x="${R(x + 4)}" y="${R(cy - 3)}" width="${w - 8}" height="6" rx="3" fill="#efe6da"/>` +
      `<rect x="${R(x + 4)}" y="${R(cy - 3)}" width="${R((w - 8) * clamp01(v))}" height="6" rx="3" fill="${col}"/></g>`
    );
  }

  /** 圆角多边形路径；rad 可为数字或与顶点一一对应的数组 */
  function roundPoly(pts, rad) {
    const n = pts.length;
    const r = (i) => (Array.isArray(rad) ? rad[i] : rad);
    const toward = (a, b, d) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(d, len / 2) / len;
      return [a[0] + dx * k, a[1] + dy * k];
    };
    let d = '';
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const a = toward(cur, prev, r(i));
      const b = toward(cur, next, r(i));
      d += `${i ? 'L' : 'M'}${R(a[0])},${R(a[1])} Q${R(cur[0])},${R(cur[1])} ${R(b[0])},${R(b[1])} `;
    }
    return d + 'Z';
  }

  /** 折线圆角路径 */
  function roundLine(pts, rad = 9) {
    if (!pts.length) return '';
    let d = `M${R(pts[0][0])},${R(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const [cx, cy] = pts[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay);
      const l2 = Math.hypot(cx - bx, cy - by);
      if (l1 < 0.01 || l2 < 0.01) continue;
      const f = Math.min(rad, l1 / 2, l2 / 2);
      d += ` L${R(bx + ((ax - bx) / l1) * f)},${R(by + ((ay - by) / l1) * f)} Q${R(bx)},${R(by)} ${R(bx + ((cx - bx) / l2) * f)},${R(by + ((cy - by) / l2) * f)}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${R(last[0])},${R(last[1])}`;
  }

  function bbox(pts, pad = [0, 0, 0, 0]) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs) - pad[0], Math.min(...ys) - pad[1], Math.max(...xs) + pad[2], Math.max(...ys) + pad[3]];
  }
  const unionBox = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
  const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const widenBox = (b, w) => {
    const extra = Math.max(0, (w - (b[2] - b[0])) / 2);
    return [b[0] - extra, b[1], b[2] + extra, b[3]];
  };

  /* ---------- 几何：圆角等距盒 ---------- */
  function boxGeom({ x0, x1, y0, y1, h, radius = 9 }) {
    const T = iso(x0, y1, h);
    const Rr = iso(x1, y1, h);
    const B = iso(x1, y0, h);
    const L = iso(x0, y0, h);
    const Rd = iso(x1, y1, 0);
    const Bd = iso(x1, y0, 0);
    const Ld = iso(x0, y0, 0);
    const p = Math.max(1, Math.min(radius, h / 2 - 0.5));
    const ty = iso((x0 + x1) / 2, (y0 + y1) / 2, h)[1];
    const outline = [T, Rr, Rd, Bd, Ld, L];
    return {
      T, R: Rr, B, L, Rd, Bd, Ld, ty, outline,
      sil: roundPoly(outline, [radius + 1, p, p, radius + 3, p, p]),
      top: roundPoly([T, Rr, B, L], [radius + 1, p, 6, p]),
      sheen: roundPoly([T, Rr, B, L].map(([x, y]) => [x, y - 3 + (y - ty) * -0.25]), [radius + 1, p, 6, p]),
      right: roundPoly([B, Rr, Rd, Bd], [6, p, p, radius + 3]),
      bevel: roundLine([L, B, Rr], 8),
    };
  }

  function paintBox(g, color) {
    const c = PALETTE[color] ? color : 'blue';
    return `
      <path d="${g.sil}" fill="url(#iso-g-${c}-side)"/>
      <path d="${g.right}" fill="#3a2a14" opacity=".05"/>
      <path d="${g.top}" fill="url(#iso-g-${c}-top)"/>
      <path d="${g.sheen}" fill="#fff" opacity=".22" filter="url(#iso-blur-sm)"/>
      <path d="${g.bevel}" transform="translate(0 1.4)" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>
      <path d="${g.bevel}" transform="translate(0 3.4)" fill="none" stroke="#5a4123" stroke-opacity=".07" stroke-width="2.4" stroke-linecap="round"/>
      <path d="${g.sil}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>`;
  }

  function castShadow(sil, h, lift, k = 0.26) {
    const dy = Math.min(9, 3 + h * 0.15) + lift;
    const a = 1 - Math.min(1, Math.max(0, lift) / 140) * 0.85;
    return `<path d="${sil}" transform="translate(0 ${R(dy)})" fill="#6b5236" opacity="${R(k * a)}" filter="url(#iso-blur-lg)"/>`;
  }

  /** 状态叠加层：过载（heat）/ 宕机（dead）/ 弱化（dim） */
  function stateOverlays(sil, e) {
    let s = '';
    if (e.heat > 0.01) s += `<path d="${sil}" fill="#f0552f" opacity="${R(e.heat * 0.3)}"/>`;
    if (e.dead > 0.01)
      s += `<path d="${sil}" fill="#b9b2a8" opacity="${R(e.dead * 0.62)}"/><path d="${sil}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>`;
    if (e.dim > 0.01) s += `<path d="${sil}" fill="#f4ebe0" opacity="${R(e.dim * 0.55)}"/>`;
    return s;
  }
  const heatGlow = (sil, e) =>
    e.heat > 0.01
      ? `<g class="iso-pulse"><path d="${sil}" fill="#f0552f" opacity="${R(e.heat * 0.7)}" filter="url(#iso-glow)"/></g>`
      : '';
  const deadCross = (cx, cy, e) =>
    e.dead > 0.01
      ? `<g opacity="${R(e.dead)}" stroke="#c0392b" stroke-width="3.2" stroke-linecap="round"><path d="M${R(cx - 9)},${R(cy - 10)} L${R(cx + 9)},${R(cy + 8)} M${R(cx + 9)},${R(cy - 10)} L${R(cx - 9)},${R(cy + 8)}"/></g>`
      : '';

  /** 头顶的 CPU 条与 tag 气泡，返回 { svg, count, maxW } */
  function pillStack(cx, y0, dir, e) {
    const items = [];
    let maxW = 0;
    if (e.cpu >= 0) {
      items.push(cpuMeter(cx, 0, e.cpu));
      maxW = 46;
    }
    for (const tg of e.tags || []) {
      items.push(`<g opacity="${R(e.tagFade ?? 1)}">${pill(cx, 0, tg.text, tg)}</g>`);
      maxW = Math.max(maxW, pillSize(tg.text, tg).w);
    }
    let svg = '';
    let y = y0;
    for (const it of items) {
      svg += `<g transform="translate(0 ${R(y)})">${it}</g>`;
      y += dir * 26;
    }
    return { svg: svg ? `<g opacity="${R(e.opacity)}">${svg}</g>` : '', count: items.length, maxW };
  }

  /** 对话气泡：尾巴尖落在 (ax, ay)，返回 { svg, box } */
  function bubble(ax, ay, say, { tone = 'paper', side = 'right', size = 11.5 } = {}) {
    const lines = Array.isArray(say) ? say : String(say).split('\n');
    const t = TONES[tone] || TONES.paper;
    const lh = size + 6;
    const w = Math.max(...lines.map((s) => textWidth(s, size, 700))) + 22;
    const h = lines.length * lh + 10;
    const x = side === 'left' ? ax - w + 16 : ax - 16;
    const y = ay - 10 - h;
    const [ta, tb] = side === 'left' ? [x + w - 26, x + w - 12] : [x + 12, x + 26];
    const r = Math.min(10, h / 2);
    const d =
      `M${R(x + r)},${R(y)} H${R(x + w - r)} Q${R(x + w)},${R(y)} ${R(x + w)},${R(y + r)} V${R(y + h - r)} Q${R(x + w)},${R(y + h)} ${R(x + w - r)},${R(y + h)} ` +
      `H${R(tb)} L${R(ax)},${R(ay)} L${R(ta)},${R(y + h)} H${R(x + r)} Q${R(x)},${R(y + h)} ${R(x)},${R(y + h - r)} V${R(y + r)} Q${R(x)},${R(y)} ${R(x + r)},${R(y)} Z`;
    const body = lines.map((s, i) => text(x + w / 2, y + 5 + lh * (i + 0.5) + size * 0.36, s, size, 700, t.fg)).join('');
    return {
      svg: `<g class="iso-say"><path d="${d}" transform="translate(0 2.6)" fill="${INK}"/><path d="${d}" fill="${t.bg}" stroke="${t.stroke}" stroke-width="1.5" stroke-linejoin="round"/>${body}</g>`,
      box: [x - 2, y - 2, x + w + 2, ay + 4],
    };
  }

  /* ---------- 人物与机器人 ---------- */
  const SKIN = '#fde3c8';
  const HAIR = '#3b342d';
  const MOOD_LIGHT = { idle: '#b3d79f', work: '#f6b26b', sleep: '#cdc5bb', happy: '#7cc16f', ask: '#f6cd82', worry: '#ec9d89' };

  function eyes(mood, cy, col, sw) {
    const L = -4.2;
    const Rx = 4.2;
    const dot = (x, y, r = 1.7) => `<circle cx="${x}" cy="${R(y)}" r="${r}" fill="${col}"/>`;
    const arc = (x, y, up) => `<path d="M${x - 2.2},${R(y)} q2.2,${up ? -2.6 : 2.4} 4.4,0" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`;
    if (mood === 'happy') return arc(L, cy + 0.6, true) + arc(Rx, cy + 0.6, true);
    if (mood === 'sleep') return arc(L, cy, false) + arc(Rx, cy, false);
    if (mood === 'work') return dot(L, cy + 1.2, 1.5) + dot(Rx, cy + 1.2, 1.5);
    let s = dot(L, cy) + dot(Rx, cy);
    const brow = (x, tilt) => `<path d="M${x - 2.2},${R(cy - 4 + tilt)} L${x + 2.2},${R(cy - 4 - tilt)}" stroke="${col}" stroke-width="${sw * 0.8}" stroke-linecap="round"/>`;
    if (mood === 'ask') s += brow(L, 0.6) + brow(Rx, -0.6);
    if (mood === 'worry') s += brow(L, -1) + brow(Rx, 1);
    return s;
  }
  function mouth(mood, cy) {
    const st = `fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"`;
    if (mood === 'happy') return `<path d="M-3.6,${R(cy - 0.6)} q3.6,4.6 7.2,0 Z" fill="#c25b45" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
    if (mood === 'work') return `<path d="M-2,${R(cy)} h4" ${st}/>`;
    if (mood === 'sleep') return `<circle cy="${R(cy)}" r="1.2" fill="${INK}"/>`;
    if (mood === 'ask') return `<circle cy="${R(cy)}" r="1.7" ${st}/>`;
    if (mood === 'worry') return `<path d="M-2.6,${R(cy + 1)} q2.6,-2.2 5.2,0" ${st}/>`;
    return `<path d="M-2.6,${R(cy - 0.4)} q2.6,2.2 5.2,0" ${st}/>`;
  }
  function moodFx(mood, hx, hy) {
    if (mood === 'sleep')
      return `<g class="iso-zzz" fill="${INK}" font-weight="800">${text(hx + 13, hy - 6, 'z', 9, 800)}${text(hx + 20, hy - 15, 'Z', 12, 800)}</g>`;
    if (mood === 'ask')
      return `<g><circle cx="${hx + 14}" cy="${hy - 9}" r="7.2" fill="#f6cd82" stroke="${INK}" stroke-width="1.4"/>${text(hx + 14, hy - 5.4, '?', 10.5, 800)}</g>`;
    if (mood === 'happy')
      return `<g fill="#f6cd82" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"><path d="M${hx + 15},${hy - 14} l1.5,3.6 3.6,1.5 -3.6,1.5 -1.5,3.6 -1.5,-3.6 -3.6,-1.5 3.6,-1.5 Z"/><path d="M${hx - 16},${hy - 6} l1,2.4 2.4,1 -2.4,1 -1,2.4 -1,-2.4 -2.4,-1 2.4,-1 Z"/></g>`;
    if (mood === 'worry') return `<path d="M${hx + 12},${hy - 4} q-3.2,4.6 0,6.4 q3.2,-1.8 0,-6.4 Z" fill="#a9c5e8" stroke="${INK}" stroke-width="1.1"/>`;
    return '';
  }
  const LAPTOP = `<g><path d="M-12,-6 L0,-1 L12,-6 L0,-11 Z" fill="#e8e2db" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="-10" y="-23" width="20" height="13.5" rx="2.4" fill="#cdc5bb" stroke="${INK}" stroke-width="1.5"/><circle cy="-16.2" r="1.8" fill="#fffaf2"/></g>`;
  const GEAR = {
    crown: `<path d="M-7,-52 L-7.6,-58.6 L-3.6,-55.4 L0,-60.6 L3.6,-55.4 L7.6,-58.6 L7,-52 Z" fill="#f6cd82" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`,
    headset: `<path d="M-12.6,-41 A12.6,12.6 0 0 1 12.6,-41" fill="none" stroke="${INK}" stroke-width="2.2"/><rect x="-15" y="-43" width="5" height="8" rx="2.4" fill="#a9c5e8" stroke="${INK}" stroke-width="1.3"/><path d="M-12,-36 q1,6 7,6.6" fill="none" stroke="${INK}" stroke-width="1.3"/>`,
    glasses: `<g fill="none" stroke="${INK}" stroke-width="1.3"><circle cx="-4.2" cy="-38.6" r="3.2"/><circle cx="4.2" cy="-38.6" r="3.2"/><path d="M-1,-38.6 h2"/></g>`,
  };

  /** 人物（role: 'human'）或机器人（role: 'bot'），原点在脚下，向上画 */
  function figureArt(e, c) {
    const mood = e.mood || 'idle';
    const bot = e.role === 'bot';
    const puck = `<path d="M-17,-1 V2.2 A17,8.5 0 0 0 17,2.2 V-1 Z" fill="url(#iso-g-slab-side)" stroke="${INK}" stroke-width="1.5"/>
      <ellipse cy="-1" rx="17" ry="8.5" fill="url(#iso-g-slab-top)" stroke="${INK}" stroke-width="1.5"/>`;
    const torso = bot
      ? `<path d="M-10.5,-3 V-21 Q-10.5,-28 -3.5,-28 H3.5 Q10.5,-28 10.5,-21 V-3 A10.5,3.6 0 0 1 -10.5,-3 Z" fill="url(#iso-g-${c}-side)" stroke="${INK}" stroke-width="1.7"/>
         <circle cy="-14" r="3" fill="${MOOD_LIGHT[mood] || MOOD_LIGHT.idle}" stroke="${INK}" stroke-width="1.3"/>`
      : `<path d="M-10,-3 V-19 A10,10 0 0 1 10,-19 V-3 A10,3.6 0 0 1 -10,-3 Z" fill="url(#iso-g-${c}-side)" stroke="${INK}" stroke-width="1.7"/>
         <path d="M-4.5,-28 L0,-22.5 L4.5,-28" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round" opacity=".55"/>`;
    const sheen = `<path d="M-6.6,-6 V-17" stroke="#fff" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>`;
    let head;
    let hy;
    if (bot) {
      hy = -41;
      head = `<path d="M0,-51 V-56" stroke="${INK}" stroke-width="1.5"/><circle cy="-58" r="2.6" fill="${MOOD_LIGHT[mood] || MOOD_LIGHT.idle}" stroke="${INK}" stroke-width="1.3"/>
        <rect x="-15" y="-45" width="3.6" height="8" rx="1.6" fill="url(#iso-g-${c}-side)" stroke="${INK}" stroke-width="1.2"/>
        <rect x="11.4" y="-45" width="3.6" height="8" rx="1.6" fill="url(#iso-g-${c}-side)" stroke="${INK}" stroke-width="1.2"/>
        <rect x="-12.4" y="-51.5" width="24.8" height="21" rx="7" fill="url(#iso-g-${c}-top)" stroke="${INK}" stroke-width="1.7"/>
        <rect x="-8.8" y="-47.6" width="17.6" height="13" rx="4" fill="#2b2622"/>
        ${eyes(mood, hy, '#c9f0b4', 1.6)}`;
    } else {
      hy = -38.6;
      head = `<circle cy="-38" r="11.6" fill="${SKIN}" stroke="${INK}" stroke-width="1.7"/>
        <path d="M-11.6,-38.6 A11.6,11.6 0 0 1 11.6,-38.6 Q7,-44.6 -1,-43 Q-7.6,-41.8 -11.6,-38.6 Z" fill="${HAIR}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
        <ellipse cx="-6.8" cy="-33" rx="2.2" ry="1.3" fill="#f3a38c" opacity=".6"/><ellipse cx="6.8" cy="-33" rx="2.2" ry="1.3" fill="#f3a38c" opacity=".6"/>
        ${eyes(mood, hy + 2.4, INK, 1.5)}${mouth(mood, -32)}`;
    }
    const gear = (e.gear && GEAR[e.gear]) || '';
    return `${puck}<g class="iso-bob">${torso}${sheen}${head}${gear}${mood === 'work' ? LAPTOP : ''}${moodFx(mood, 0, -50)}</g>`;
  }

  /* ---------- 立起来的界面卡片（审批卡、通知） ---------- */
  function cardArt(e) {
    const t = TONES[e.tone] || TONES.blue;
    const lines = e.lines || [];
    const btns = e.buttons || [];
    const tw = textWidth(e.title || '', 12.5, 800) + (e.icon ? 20 : 0);
    const lw = Math.max(0, ...lines.map((s) => textWidth(s, 11, 600)));
    const bws = btns.map((b, i) => textWidth(b, 11, 700) + (i === e.pick ? 32 : 20));
    const bw = bws.reduce((s, w) => s + w, 0) + Math.max(0, btns.length - 1) * 6;
    const W = e.w || Math.max(150, tw, lw, bw) + 26;
    const H = 30 + 8 + lines.length * 17 + (btns.length ? 32 : 0) + 6;
    const x = -W / 2;
    const y = -H;
    let s = `<rect x="${R(x)}" y="${R(y + 3)}" width="${R(W)}" height="${R(H)}" rx="10" fill="${INK}"/>
      <rect x="${R(x)}" y="${R(y)}" width="${R(W)}" height="${R(H)}" rx="10" fill="#fffaf2" stroke="${INK}" stroke-width="1.6"/>
      <path d="M${R(x + 10)},${R(y + 0.8)} H${R(x + W - 10)} Q${R(x + W - 0.8)},${R(y + 0.8)} ${R(x + W - 0.8)},${R(y + 10)} V${R(y + 30)} H${R(x + 0.8)} V${R(y + 10)} Q${R(x + 0.8)},${R(y + 0.8)} ${R(x + 10)},${R(y + 0.8)} Z" fill="${t.bg}"/>
      <path d="M${R(x)},${R(y + 30)} H${R(x + W)}" stroke="${INK}" stroke-width="1.2" stroke-opacity=".35"/>`;
    let hx = x + 12;
    if (e.icon) {
      s += icon(e.icon, hx + 7, y + 15, 14, { stroke: t.fg, sw: 2.1 });
      hx += 20;
    }
    s += `<text x="${R(hx)}" y="${R(y + 19.5)}" font-size="12.5" font-weight="800" fill="${t.fg}">${esc(e.title || '')}</text>`;
    lines.forEach((l, i) => {
      s += `<text x="${R(x + 12)}" y="${R(y + 30 + 8 + 12 + i * 17)}" font-size="11" font-weight="600" fill="#3b342d">${esc(l)}</text>`;
    });
    let bx = x + 12;
    const by = y + 30 + 8 + lines.length * 17 + 6;
    btns.forEach((b, i) => {
      const on = i === e.pick;
      const off = e.pick != null && e.pick >= 0 && !on;
      const w = bws[i];
      s += `<g opacity="${off ? 0.45 : 1}"><rect x="${R(bx)}" y="${R(by)}" width="${R(w)}" height="21" rx="6" fill="${on ? '#e2f2d7' : '#fffaf2'}" stroke="${on ? '#2f6b2a' : INK}" stroke-width="1.3"/>` +
        (on ? icon('check', bx + 11, by + 10.5, 11, { stroke: '#2f6b2a', sw: 2.6 }) : '') +
        `<text x="${R(bx + (on ? 20 : 10))}" y="${R(by + 14.5)}" font-size="11" font-weight="700" fill="${on ? '#2f6b2a' : INK}">${esc(b)}</text></g>`;
      bx += w + 6;
    });
    if (e.stamp)
      s += `<g transform="translate(${R(x + W - 30)} ${R(y + H - 26)}) rotate(-14)" opacity=".9"><circle r="19" fill="none" stroke="#c0392b" stroke-width="2"/><circle r="15.5" fill="none" stroke="#c0392b" stroke-width="1"/>${text(0, 4.5, e.stamp, 12.5, 800, '#c0392b')}</g>`;
    return { svg: s, W, H };
  }

  /* ---------- 实体形状 ---------- */
  const DEFAULTS = {
    block: { s: 4, h: 40, color: 'blue', glyph: 'server', label: [], sub: '', cpu: -1, heat: 0, dead: 0, dim: 0, lift: 0, opacity: 1, tags: [], pills: 'above', radius: 9 },
    db: { r: 1.5, h: 30, color: 'purple', glyph: '', label: '', sub: '', cpu: -1, heat: 0, dead: 0, dim: 0, lift: 0, opacity: 1, tags: [] },
    crowd: { count: 0, label: '', icon: 'users', color: 'slab', lift: 0, opacity: 1, dim: 0 },
    zone: { label: '', tint: '', opacity: 1, dim: 0 },
    note: { text: '', tone: 'paper', icon: '', size: 10.5, z: 0, lift: 0, opacity: 1, dim: 0 },
    figure: { role: 'human', mood: 'idle', gear: '', color: 'blue', s: 1.6, label: '', sub: '', say: '', sayTone: 'paper', saySide: 'right', lift: 0, opacity: 1, dim: 0, tags: [] },
    say: { text: '', tone: 'paper', side: 'right', size: 11.5, z: 0, lift: 0, opacity: 1, dim: 0 },
    card: { title: '', icon: '', lines: [], buttons: [], pick: -1, stamp: '', tone: 'blue', z: 36, face: 'left', lift: 0, opacity: 1, dim: 0 },
    doc: { s: 4, n: 3, title: '', rows: 3, label: '', sub: '', glyph: '', lift: 0, opacity: 1, dim: 0, tags: [] },
  };
  const ENTER_FROM = { block: { lift: 120 }, db: { lift: 120 }, crowd: { count: 0, lift: 26 }, zone: {}, note: { lift: -14 }, figure: { lift: 70 }, say: { lift: -12 }, card: { lift: 40 }, doc: { lift: 60 } };
  const EXIT_TO = { block: { lift: -22 }, db: { lift: -22 }, crowd: { count: 0 }, zone: {}, note: { lift: -10 }, figure: { lift: -16 }, say: { lift: -8 }, card: { lift: -16 }, doc: { lift: -16 } };

  const spotCache = new Map();
  const hash = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const PEOPLE = ['#F3B47F', '#A9C5E8', '#B3D79F', '#CBBAE6', '#F6CD82'];
  function crowdSpots(e) {
    const key = [e.x0, e.x1, e.y0, e.y1].join(',');
    if (spotCache.has(key)) return spotCache.get(key);
    const gap = 1.75;
    const pad = 0.9;
    const cols = Math.max(1, Math.floor((e.x1 - e.x0 - pad * 2) / gap) + 1);
    const rows = Math.max(1, Math.floor((e.y1 - e.y0 - pad * 2) / gap) + 1);
    const ox = (e.x1 - e.x0 - (cols - 1) * gap) / 2;
    const oy = (e.y1 - e.y0 - (rows - 1) * gap) / 2;
    const spots = [];
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        spots.push({
          x: e.x0 + ox + i * gap + (hash(i, j) - 0.5) * 0.45,
          y: e.y0 + oy + j * gap + (hash(j, i) - 0.5) * 0.45,
          k: hash(i + 7, j + 3),
          c: PEOPLE[(i * 3 + j) % PEOPLE.length],
        });
    spots.sort((a, b) => a.k - b.k);
    spotCache.set(key, spots);
    return spots;
  }
  function person(x, y, z, o, color) {
    const [px, py] = iso(x, y, z);
    const s = (0.35 + 0.65 * o) * 1.3;
    return `<g opacity="${R(o)}" transform="translate(${R(px)} ${R(py - (1 - o) * 10)}) scale(${R(s)})">
      <ellipse rx="5.6" ry="2.8" fill="#6b5236" opacity=".18"/>
      <path d="M-5.2,0 V-9 A5.2,5.2 0 0 1 5.2,-9 V0 A5.2,2.4 0 0 1 -5.2,0 Z" fill="${color}" stroke="${INK}" stroke-width="1.25"/>
      <circle cy="-17.6" r="4.3" fill="#fdf6ec" stroke="${INK}" stroke-width="1.25"/></g>`;
  }

  const SHAPES = {
    block(e) {
      const t = e.s / 2;
      const g = boxGeom({ x0: e.x - t, x1: e.x + t, y0: e.y - t, y1: e.y + t, h: e.h, radius: e.radius });
      const lift = e.lift;
      const cx = g.T[0];
      const ty = g.ty;
      const labels = e.label || [];
      const ly = ty + (e.s * 7 + e.h) * 0.4;
      let lab = '';
      if (labels.length === 1 && !e.sub) lab = text(cx, ly + 4.5, labels[0], 13.5, 800);
      else if (labels.length === 1) lab = text(cx, ly, labels[0], 13.5, 800) + text(cx, ly + 14, e.sub, 10, 600);
      else if (labels.length >= 2 && e.sub)
        lab = text(cx, ly - 9, labels[0], 13, 800) + text(cx, ly + 6.5, labels[1], 13, 800) + text(cx, ly + 20.5, e.sub, 10, 600);
      else if (labels.length >= 2) lab = text(cx, ly - 3.5, labels[0], 13, 800) + text(cx, ly + 12, labels[1], 13, 800);
      else if (e.sub) lab = text(cx, ly + 4, e.sub, 10, 600);
      const k = e.s >= 6 ? 1.15 : e.s < 3.5 ? 0.8 : 1;
      const gl = e.glyph ? icon(e.glyph, cx, labels.length ? ty - 5 : ty + 2, 22 * k) : '';
      const fade = 1 - e.dead * 0.5 - e.dim * 0.35;
      const body = `<g opacity="${R(e.opacity)}">
        ${castShadow(g.sil, e.h, lift)}
        <g transform="translate(0 ${R(-lift)})">
          ${heatGlow(g.sil, e)}
          ${paintBox(g, e.color)}
          ${stateOverlays(g.sil, e)}
          <g opacity="${R(fade)}">${e.dead > 0.5 ? '' : gl}<g opacity="${R(e.labelFade ?? 1)}">${lab}</g></g>
          ${deadCross(cx, ty, e)}
        </g></g>`;
      const below = e.pills === 'below';
      const stack = pillStack(cx, below ? g.Bd[1] - lift + 20 : g.T[1] - lift - 17, below ? 1 : -1, e);
      const poly = g.outline.map(([x, y]) => [x, y - lift]);
      const n = stack.count;
      const bounds = widenBox(bbox(poly, below ? [8, 8, 8, 14 + n * 26] : [8, 8 + Math.max(n, 1) * 26, 8, 14]), stack.maxW + 8);
      return { body, over: stack.svg, poly, bounds };
    },

    db(e) {
      const [bx, by0] = iso(e.x, e.y);
      const by = by0 - e.lift;
      const rx = 14 * Math.SQRT2 * e.r;
      const ry = 7 * Math.SQRT2 * e.r;
      const top = by - e.h;
      const A = `${R(rx)},${R(ry)} 0 0 0`;
      const sil = `M${R(bx - rx)},${R(by)} A${A} ${R(bx + rx)},${R(by)} V${R(top)} A${A} ${R(bx - rx)},${R(top)} Z`;
      const band = (k) => {
        const y = by - e.h * k;
        return `<path d="M${R(bx - rx)},${R(y)} A${A} ${R(bx + rx)},${R(y)}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-opacity=".28"/>`;
      };
      const c = PALETTE[e.color] ? e.color : 'purple';
      const a = 1 - Math.min(1, Math.max(0, e.lift) / 140) * 0.85;
      const fade = 1 - e.dead * 0.5 - e.dim * 0.35;
      let lab = '';
      if (e.label) lab += text(bx, by + ry + 16, e.label, 12, 800);
      if (e.sub) lab += text(bx, by + ry + (e.label ? 30 : 16), e.sub, 10, 600);
      const body = `<g opacity="${R(e.opacity)}">
        <ellipse cx="${R(bx)}" cy="${R(by0 + 4)}" rx="${R(rx + 2)}" ry="${R(ry + 1.5)}" fill="#6b5236" opacity="${R(0.26 * a)}" filter="url(#iso-blur-lg)"/>
        ${heatGlow(sil, e)}
        <path d="${sil}" fill="url(#iso-g-${c}-side)"/>
        <path d="${sil}" fill="url(#iso-cyl-sheen)"/>
        ${band(0.36)}${band(0.68)}
        <ellipse cx="${R(bx)}" cy="${R(top)}" rx="${R(rx)}" ry="${R(ry)}" fill="url(#iso-g-${c}-top)" stroke="${INK}" stroke-width="1.6"/>
        ${stateOverlays(sil, e)}
        <path d="${sil}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linejoin="round"/>
        <g opacity="${R(fade)}">${e.glyph && e.dead < 0.5 ? icon(e.glyph, bx, top, Math.min(20, ry * 1.6)) : ''}<g opacity="${R(e.labelFade ?? 1)}">${lab}</g></g>
        ${deadCross(bx, top, e)}
      </g>`;
      const poly = [];
      for (let d = 0; d <= 180; d += 15) poly.push([bx + rx * Math.cos((d * Math.PI) / 180), by + ry * Math.sin((d * Math.PI) / 180)]);
      for (let d = 180; d <= 360; d += 15) poly.push([bx + rx * Math.cos((d * Math.PI) / 180), top + ry * Math.sin((d * Math.PI) / 180)]);
      const stack = pillStack(bx, top - ry - 14, -1, e);
      const labW = Math.max(e.label ? textWidth(e.label, 12, 800) : 0, e.sub ? textWidth(e.sub, 10, 600) : 0);
      const bounds = widenBox(
        bbox(poly, [6, 6 + stack.count * 26, 6, 6 + (e.label ? 16 : 0) + (e.sub ? 14 : 0)]),
        Math.max(stack.maxW, labW) + 8,
      );
      return { body, over: stack.svg, poly, bounds };
    },

    crowd(e) {
      const g = boxGeom({ x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, h: 10, radius: 8 });
      const lift = e.lift;
      const spots = crowdSpots(e);
      const n = Math.min(spots.length, Math.max(0, e.count));
      const full = Math.floor(n);
      const frac = n - full;
      const people = spots
        .slice(0, Math.ceil(n))
        .map((s, i) => ({ ...s, o: i < full ? 1 : frac }))
        .sort((a, b) => a.x - a.y - (b.x - b.y))
        .map((p) => person(p.x, p.y, 10 + lift, p.o, p.c))
        .join('');
      const op = e.opacity * (1 - e.dim * 0.6);
      const body = `<g opacity="${R(op)}">
        ${castShadow(g.sil, 10, lift, 0.2)}
        <g transform="translate(0 ${R(-lift)})">${paintBox(g, e.color)}</g>
        ${people}</g>`;
      const lx = g.Bd[0];
      const lyy = g.Bd[1] - lift + 20;
      const over = e.label ? `<g opacity="${R(op)}">${pill(lx, lyy, e.label, { icon: e.icon, size: 11 })}</g>` : '';
      const poly = g.outline.map(([x, y]) => [x, y - lift]);
      let bounds = bbox(poly, [6, 34, 6, 6]);
      if (e.label) {
        const ps = pillSize(e.label, { icon: e.icon, size: 11 });
        bounds = unionBox(bounds, [lx - ps.w / 2 - 4, lyy - ps.h / 2 - 4, lx + ps.w / 2 + 4, lyy + ps.h / 2 + 4]);
      }
      return { body, over, poly, bounds };
    },

    zone(e) {
      const pts = [iso(e.x0, e.y1), iso(e.x1, e.y1), iso(e.x1, e.y0), iso(e.x0, e.y0)];
      const d = roundPoly(pts, 10);
      const fill = e.tint && PALETTE[e.tint] ? PALETTE[e.tint].top[0] : '#fffaf2';
      const L = iso(e.x0, e.y0);
      const B = iso(e.x1, e.y0);
      const mx = (L[0] + B[0]) / 2;
      const my = (L[1] + B[1]) / 2;
      const body = `<g opacity="${R(e.opacity * (1 - e.dim * 0.6))}">
        <path d="${d}" fill="${fill}" fill-opacity=".55" stroke="${INK}" stroke-opacity=".5" stroke-width="1.4" stroke-dasharray="5 6"/>
        ${e.label ? `<g transform="matrix(1 0.5 0 1 ${R(mx)} ${R(my)})">${text(0, 17, e.label, 10.5, 800, '#6b6259', 'letter-spacing="1.2"')}</g>` : ''}
      </g>`;
      return { body, over: '', poly: pts, bounds: bbox(pts, [6, 6, 6, e.label ? 30 : 6]) };
    },

    note(e) {
      const [x, y] = iso(e.x, e.y, e.z + e.lift);
      const ps = pillSize(e.text, e);
      return {
        body: '',
        over: `<g opacity="${R(e.opacity * (1 - e.dim * 0.6))}">${pill(x, y, e.text, e)}</g>`,
        poly: null,
        bounds: [x - ps.w / 2 - 4, y - ps.h / 2 - 4, x + ps.w / 2 + 4, y + ps.h / 2 + 4],
      };
    },

    figure(e) {
      const k = e.s;
      const [gx, gy] = iso(e.x, e.y);
      const py = gy - e.lift;
      const c = PALETTE[e.color] ? e.color : 'blue';
      const a = 1 - Math.min(1, Math.max(0, e.lift) / 140) * 0.85;
      const op = e.opacity * (1 - e.dim * 0.5);
      let lab = '';
      if (e.label) lab += text(gx, py + 22 * k, e.label, 12.5, 800);
      if (e.sub) lab += text(gx, py + 22 * k + (e.label ? 14 : 0), e.sub, 10, 600, '#6b6259');
      const body = `<g opacity="${R(op)}">
        <ellipse cx="${R(gx)}" cy="${R(gy + 3)}" rx="${R(18 * k)}" ry="${R(7 * k)}" fill="#6b5236" opacity="${R(0.24 * a)}" filter="url(#iso-blur-lg)"/>
        <g transform="translate(${R(gx)} ${R(py)}) scale(${R(k)})">${figureArt(e, c)}</g>
        <g opacity="${R(e.labelFade ?? 1)}">${lab}</g></g>`;
      const top = py - 62 * k;
      const stack = pillStack(gx, top - 4, -1, e);
      let over = stack.svg;
      let sayBox = null;
      if (e.say) {
        const sb = bubble(gx + (e.saySide === 'left' ? -10 : 10) * k, top - stack.count * 26 + 4, e.say, { tone: e.sayTone, side: e.saySide });
        over += `<g opacity="${R(op * (e.tagFade ?? 1))}">${sb.svg}</g>`;
        sayBox = sb.box;
      }
      const poly = [[-17, 0], [-12, -32], [0, -60], [12, -32], [17, 0], [0, 9]].map(([x, y]) => [gx + x * k, py + y * k]);
      const labW = Math.max(e.label ? textWidth(e.label, 12.5, 800) : 0, e.sub ? textWidth(e.sub, 10, 600) : 0);
      let bounds = widenBox(bbox(poly, [6, 6 + stack.count * 26, 6, 6 + (e.label ? 18 : 0) + (e.sub ? 14 : 0)]), Math.max(stack.maxW, labW) + 8);
      if (sayBox) bounds = unionBox(bounds, sayBox);
      return { body, over, poly, bounds };
    },

    say(e) {
      const [x, y] = iso(e.x, e.y, e.z + e.lift);
      const sb = bubble(x, y, e.text, e);
      return { body: '', over: `<g opacity="${R(e.opacity * (1 - e.dim * 0.6))}">${sb.svg}</g>`, poly: null, bounds: sb.box };
    },

    card(e) {
      const [gx, gy] = iso(e.x, e.y);
      const ay = gy - e.z - e.lift;
      const { svg, W, H } = cardArt(e);
      const sk = e.face === 'right' ? -0.5 : e.face === 'screen' ? 0 : 0.5;
      const corners = [[-W / 2, -H], [W / 2, -H], [W / 2, 3], [-W / 2, 3]].map(([x, y]) => [gx + x, ay + y + x * sk]);
      const a = 1 - Math.min(1, Math.max(0, e.lift) / 140) * 0.85;
      const body = `<g opacity="${R(e.opacity * (1 - e.dim * 0.5))}">
        <ellipse cx="${R(gx)}" cy="${R(gy)}" rx="${R(W * 0.34)}" ry="${R(W * 0.12)}" fill="#6b5236" opacity="${R(0.2 * a)}" filter="url(#iso-blur-lg)"/>
        <path d="M${R(gx)},${R(gy)} V${R(ay)}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 4" stroke-opacity=".45"/>
        <g class="iso-float"><g transform="matrix(1 ${sk} 0 1 ${R(gx)} ${R(ay)})">${svg}</g></g></g>`;
      const poly = [iso(e.x - 1.4, e.y - 1.4), iso(e.x + 1.4, e.y - 1.4), iso(e.x + 1.4, e.y + 1.4), iso(e.x - 1.4, e.y + 1.4)];
      return { body, over: '', poly, bounds: bbox([...corners, [gx, gy + 6]], [6, 6, 6, 6]) };
    },

    doc(e) {
      const t = e.s / 2;
      const [cx, cy] = iso(e.x, e.y, e.lift);
      const half = 7 * e.s;
      const M = `matrix(1 .5 -1 .5 ${R(cx)} ${R(cy)})`;
      const ns = 'vector-effect="non-scaling-stroke"';
      const sheet = (dy, top) =>
        `<g transform="translate(${R(((dy * 7) % 5) - 2)} ${R(-dy)})"><g transform="translate(0 2.6)"><g transform="${M}"><rect x="${-half}" y="${-half}" width="${2 * half}" height="${2 * half}" rx="3" fill="#e3d7c8" stroke="${INK}" stroke-width="1.4" ${ns}/></g></g>` +
        `<g transform="${M}"><rect x="${-half}" y="${-half}" width="${2 * half}" height="${2 * half}" rx="3" fill="${top ? '#fffdf8' : '#f7f0e7'}" stroke="${INK}" stroke-width="1.4" ${ns}/>${top || ''}</g></g>`;
      let rows = '';
      const y0 = e.title ? -half + 14 : -half + 7;
      for (let i = 0; i < e.rows; i++) {
        const w = (2 * half - 12) * (0.55 + 0.4 * hash(i + 3, e.x));
        rows += `<rect x="${-half + 6}" y="${R(y0 + i * 6)}" width="${R(w)}" height="2.6" rx="1.3" fill="#cdbfae"/>`;
      }
      const title = e.title ? `<text x="${-half + 6}" y="${-half + 10}" font-size="7.5" font-weight="800" fill="${INK}">${esc(e.title)}</text>` : '';
      let sheets = '';
      for (let i = 0; i < e.n; i++) sheets += sheet(i * 3, i === e.n - 1 ? title + rows : '');
      const B = iso(e.x + t, e.y - t, e.lift);
      let lab = '';
      if (e.label) lab += text(cx, B[1] + 18, e.label, 12, 800);
      if (e.sub) lab += text(cx, B[1] + (e.label ? 32 : 18), e.sub, 10, 600, '#6b6259');
      const a = 1 - Math.min(1, Math.max(0, e.lift) / 140) * 0.85;
      const outline = [iso(e.x - t, e.y + t), iso(e.x + t, e.y + t), iso(e.x + t, e.y - t), iso(e.x - t, e.y - t)];
      const body = `<g opacity="${R(e.opacity * (1 - e.dim * 0.5))}">
        <path d="${roundPoly(outline.map(([x, y]) => [x, y + 3]), 4)}" fill="#6b5236" opacity="${R(0.22 * a)}" filter="url(#iso-blur-lg)"/>
        ${sheets}${e.glyph ? icon(e.glyph, cx + half * 0.6, cy - (e.n - 1) * 3 - half * 0.3, 14) : ''}
        <g opacity="${R(e.labelFade ?? 1)}">${lab}</g></g>`;
      const poly = outline.map(([x, y]) => [x, y - e.lift - (e.n - 1) * 3]);
      const stack = pillStack(cx, poly[0][1] - 14, -1, e);
      const labW = Math.max(e.label ? textWidth(e.label, 12, 800) : 0, e.sub ? textWidth(e.sub, 10, 600) : 0);
      const bounds = widenBox(bbox([...outline, ...poly], [6, 6 + stack.count * 26, 6, 6 + (e.label ? 18 : 0) + (e.sub ? 14 : 0)]), Math.max(stack.maxW, labW) + 8);
      return { body, over: stack.svg, poly, bounds };
    },
  };

  /** 任意实体都能带 say 气泡；人物自己画，其余挂在顶上 */
  function shapeOf(e) {
    const s = SHAPES[e.type](e);
    if (!e.say || e.type === 'figure' || e.type === 'say') return s;
    const sb = bubble((s.bounds[0] + s.bounds[2]) / 2 + 8, s.bounds[1] + 6, e.say, { tone: e.sayTone, side: e.saySide });
    const op = (e.opacity ?? 1) * (1 - (e.dim || 0) * 0.5) * (e.tagFade ?? 1);
    return { ...s, over: `${s.over || ''}<g opacity="${R(op)}">${sb.svg}</g>`, bounds: unionBox(s.bounds, sb.box) };
  }

  function normalize(e) {
    const n = { ...(DEFAULTS[e.type] || {}), ...e };
    if (n.type === 'block' && !Array.isArray(n.label)) n.label = n.label ? [n.label] : [];
    if (n.tags) n.tags = n.tags.map((t) => (typeof t === 'string' ? { text: t } : t));
    return n;
  }
  const normalizeAll = (ents) => Object.fromEntries(Object.entries(ents || {}).map(([id, e]) => [id, normalize(e)]));
  const center = (e) => (e.type === 'crowd' || e.type === 'zone' ? [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2] : [e.x, e.y]);
  const FLOAT = new Set(['note', 'say']);
  const depth = (e) => (e.type === 'zone' ? -1e4 : FLOAT.has(e.type) ? 1e4 : center(e)[0] - center(e)[1]);
  function footprint(e) {
    if (e.type === 'crowd' || e.type === 'zone') return [e.x0, e.x1, e.y0, e.y1];
    const t = e.type === 'db' ? e.r : e.type === 'figure' ? 0.7 * e.s : e.type === 'card' ? 1.4 : (e.s || 4) / 2;
    return [e.x - t, e.x + t, e.y - t, e.y + t];
  }

  /* ---------- 连线几何 ---------- */
  function inConvex([px, py], poly) {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (Math.abs(c) < 1e-9) continue;
      if (!sign) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
    return true;
  }
  function clipStart(pts, poly, gap) {
    if (!poly || pts.length < 2 || !inConvex(pts[0], poly)) return pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (inConvex(b, poly)) continue;
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        if (inConvex([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m], poly)) lo = m;
        else hi = m;
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.min(1, hi + gap / len);
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ...pts.slice(i + 1)];
    }
    return pts;
  }
  const clipEnd = (pts, poly, gap) => clipStart([...pts].reverse(), poly, gap).reverse();

  function polyAt(pts, t) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let d = total * t;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= l || i === pts.length - 1) {
        const k = l ? Math.min(1, d / l) : 0;
        return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)];
      }
      d -= l;
    }
    return pts[0];
  }

  function linkPoints(spec, getEnt, getPoly) {
    const comp = (v, axis) => {
      if (typeof v === 'number') return v;
      let e = getEnt(v);
      let off = 0;
      if (!e) {
        const m = /^(.+?)([+-]\d*\.?\d+)$/.exec(v);
        if (m) {
          e = getEnt(m[1]);
          off = parseFloat(m[2]);
        }
      }
      return e ? center(e)[axis] + off : null;
    };
    const raw = spec.pts || [spec.from, spec.to];
    const pts = [];
    for (const p of raw) {
      const g = typeof p === 'string' ? [comp(p, 0), comp(p, 1)] : [comp(p[0], 0), comp(p[1], 1)];
      if (g[0] == null || g[1] == null) return null;
      pts.push(iso(g[0], g[1]));
    }
    let out = clipStart(pts, getPoly(spec.from), 3);
    if (spec.to) out = clipEnd(out, getPoly(spec.to), spec.heads === 'none' ? 3 : 5);
    return out;
  }

  /* ---------- 信息卡 ---------- */
  const LINE_KIND = { '=': 'is-result', '#': 'is-ask', '+': 'is-add', '~': 'is-mod', '-': 'is-del', '−': 'is-del' };
  function cardHTML(c) {
    const lines = (c.lines || [])
      .map((raw) => {
        let s = String(raw);
        let cls = '';
        const m = /^([=#+~\-−]) /.exec(s);
        if (m) {
          cls = LINE_KIND[m[1]];
          s = s.slice(2);
        }
        return `<div class="iso-card__line ${cls}">${md(s)}</div>`;
      })
      .join('');
    const max = Math.max(...(c.bars || []).map((b) => b.max ?? b.value), 1e-9);
    const bars = (c.bars || [])
      .map((b) => {
        const pct = Math.max(2, Math.min(100, (b.value / (b.max ?? max)) * 100));
        return `<div class="iso-bar iso-bar--${b.tone || 'blue'}"><div class="iso-bar__k">${md(b.label || '')}</div><div class="iso-bar__track"><i style="--w:${R(pct)}%"></i></div><div class="iso-bar__v">${md(b.text ?? String(b.value))}</div></div>`;
      })
      .join('');
    return `<div class="iso-card__head">${c.icon ? iconSvg(c.icon, 15) : ''}<span>${md(c.title || '')}</span></div>${bars ? `<div class="iso-card__bars">${bars}</div>` : ''}<div class="iso-card__body">${lines}</div>`;
  }

  function defsMarkup(uid) {
    let g = '';
    for (const [name, c] of Object.entries(PALETTE))
      g += `<linearGradient id="iso-g-${name}-top" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${c.top[0]}"/><stop offset="1" stop-color="${c.top[1]}"/></linearGradient>
        <linearGradient id="iso-g-${name}-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.side[0]}"/><stop offset="1" stop-color="${c.side[1]}"/></linearGradient>`;
    return `<defs>${g}
      <linearGradient id="iso-cyl-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".28" stop-color="#fff" stop-opacity=".38"/>
        <stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#3a2a14" stop-opacity=".08"/>
      </linearGradient>
      <filter id="iso-blur-sm" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
      <filter id="iso-blur-lg" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
      <filter id="iso-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
      <marker id="iso-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M1.5,1.5 L8,5 L1.5,8.5" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
      <pattern id="iso-grid-${uid}" width="28" height="14" x="0" y="-7" patternUnits="userSpaceOnUse">
        <path d="M0,7 L14,0 L28,7 L14,14 Z" fill="none" stroke="#cdbfae" stroke-width="0.7" opacity=".75"/>
      </pattern>
      <radialGradient id="iso-fade-${uid}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="600">
        <stop offset="0" stop-color="#fff"/><stop offset=".42" stop-color="#fff" stop-opacity=".92"/>
        <stop offset=".78" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <mask id="iso-mask-${uid}" maskUnits="userSpaceOnUse" x="-8000" y="-8000" width="16000" height="16000">
        <rect x="-8000" y="-8000" width="16000" height="16000" fill="url(#iso-fade-${uid})"/>
      </mask>
    </defs>`;
  }

  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  /* ---------- 舞台 ---------- */
  let UID = 0;
  const PACKET_SPEED = 155;
  const KIND_SPEED = { heavy: 0.7, ping: 0.85, slow: 0.32 };

  class Stage {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = {
        pad: 28,
        zoomMax: 1.6,
        zoomMin: 0.3,
        cardInset: { x: 14, top: 14, bottom: 14 },
        ...opts,
      };
      this.uid = ++UID;
      host.classList.add('iso-stage');
      this.svg = svgEl('svg', { class: 'iso-svg', xmlns: NS, preserveAspectRatio: 'xMidYMid meet' });
      this.svg.innerHTML = `${defsMarkup(this.uid)}
        <rect class="iso-grid" x="-8000" y="-8000" width="16000" height="16000" fill="url(#iso-grid-${this.uid})" mask="url(#iso-mask-${this.uid})"/>
        <g class="iso-floor"></g><g class="iso-links"></g><g class="iso-packets"></g><g class="iso-ents"></g><g class="iso-over"></g>`;
      host.appendChild(this.svg);
      this.L = {
        floor: this.svg.querySelector('.iso-floor'),
        links: this.svg.querySelector('.iso-links'),
        packets: this.svg.querySelector('.iso-packets'),
        ents: this.svg.querySelector('.iso-ents'),
        over: this.svg.querySelector('.iso-over'),
      };
      this.fade = this.svg.querySelector(`#iso-fade-${this.uid}`);

      this.cardEl = document.createElement('div');
      this.cardEl.className = 'iso-card is-hidden';
      this.cardMeasure = document.createElement('div');
      this.cardMeasure.className = 'iso-card iso-card--measure';
      host.append(this.cardEl, this.cardMeasure);
      this.cardKey = null;
      this.cardTimer = 0;

      this.ents = new Map();
      this.links = new Map();
      this.packets = [];
      this.flows = [];
      this.anim = null;
      this.scene = null;
      this.lastPlan = null;
      this.paused = false;
      this.showCards = opts.showCards ?? true;
      this.onSettle = null;
      this.setCam({ x: -400, y: -250, w: 800, h: 500 });

      this.size = '';
      new ResizeObserver(() => {
        const s = `${host.clientWidth}x${host.clientHeight}`;
        if (s !== this.size) {
          this.size = s;
          this.refit();
        }
      }).observe(host);

      this.last = performance.now();
      const loop = (t) => {
        this.tick(t);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    /* ----- 相机 ----- */
    setCam(c) {
      this.cam = c;
      this.svg.setAttribute('viewBox', `${R(c.x)} ${R(c.y)} ${R(c.w)} ${R(c.h)}`);
      this.fade.setAttribute('cx', R(c.x + c.w / 2));
      this.fade.setAttribute('cy', R(c.y + c.h / 2));
      this.fade.setAttribute('r', R(Math.max(c.w, c.h) * 0.62));
    }

    measureCard(card) {
      this.cardMeasure.innerHTML = cardHTML(card);
      return { w: this.cardMeasure.offsetWidth, h: this.cardMeasure.offsetHeight };
    }

    cardRect(corner, size, W, H) {
      const ins = this.opts.cardInset;
      const x = corner[1] === 'l' ? ins.x : W - ins.x - size.w;
      const y = corner[0] === 't' ? ins.top : H - ins.bottom - size.h;
      return [x, y, x + size.w, y + size.h];
    }

    /** 计算场景的取景：缩放尽量大、信息卡不压住任何实体 */
    plan(scene, prev) {
      const W = Math.max(1, this.host.clientWidth);
      const H = Math.max(1, this.host.clientHeight);
      const ents = normalizeAll(scene.entities);
      const boxes = [];
      const solid = [];
      const polys = {};
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [id, e] of Object.entries(ents)) {
        const s = shapeOf(e);
        polys[id] = s.poly;
        boxes.push(s.bounds);
        if (e.type !== 'zone') solid.push(s.bounds);
        b = unionBox(b, s.bounds);
      }
      const labelT = {};
      const labelled = [];
      for (const [id, spec] of Object.entries(scene.links || {})) {
        const pts = linkPoints(spec, (eid) => ents[eid], (eid) => polys[eid]);
        if (!pts) continue;
        for (const [x, y] of pts) b = unionBox(b, [x - 3, y - 3, x + 3, y + 3]);
        if (spec.label) labelled.push([id, spec, pts]);
      }
      // 连线标签：沿线在几个候选位置中挑与其他元素重叠最少的
      const entBoxes = solid;
      for (const [id, spec, pts] of labelled) {
        const ps = pillSize(spec.label);
        const t0 = spec.labelAt ?? 0.5;
        const cands = spec.labelFixed ? [t0] : [t0, ...Array.from({ length: 17 }, (_, k) => 0.1 + k * 0.05)];
        let best = null;
        cands.forEach((t) => {
          const [x, y] = polyAt(pts, t);
          const lb = [x - ps.w / 2 - 4, y - ps.h / 2 - 4, x + ps.w / 2 + 4, y + ps.h / 2 + 4];
          const cost = entBoxes.filter((bx) => overlap(bx, lb)).length * 100 + Math.abs(t - t0) * 20;
          if (!best || cost < best.cost) best = { t, lb, cost };
        });
        if (!best) best = { t: t0, lb: [0, 0, 0, 0] };
        labelT[id] = best.t;
        entBoxes.push(best.lb);
        boxes.push(best.lb);
        b = unionBox(b, best.lb);
      }
      if (b[0] === Infinity) b = [-200, -120, 200, 120];

      const fit = scene.fit || {};
      const pad = fit.pad ?? this.opts.pad;
      const zMax = fit.zoomMax ?? this.opts.zoomMax;
      const zMin = this.opts.zoomMin;
      const bw = Math.max(1, b[2] - b[0]);
      const bh = Math.max(1, b[3] - b[1]);
      const snap = (z) => Math.max(zMin, Math.floor(z * 20 + 1e-6) / 20);
      const z0 = Math.min(zMax, (W - pad * 2) / bw, (H - pad * 2) / bh);
      const camAt = (z, ax, ay) => {
        const sx = ax === 0 ? (W - bw * z) / 2 : ax < 0 ? pad : W - pad - bw * z;
        const sy = ay === 0 ? (H - bh * z) / 2 : ay < 0 ? pad : H - pad - bh * z;
        return { x: b[0] - sx / z, y: b[1] - sy / z, w: W / z, h: H / z };
      };

      if (scene.camera) {
        const z = scene.camera.zoom ?? snap(z0);
        const [cx, cy] = scene.camera.at ? iso(...scene.camera.at) : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        const cam = { x: cx - W / z / 2, y: cy - H / z / 2, w: W / z, h: H / z };
        const card = scene.card && this.showCards ? scene.card : null;
        const corner = card ? (card.corner && card.corner !== 'auto' ? card.corner : 'tr') : null;
        return { cam, zoom: z, corner, labelT, cardRect: card ? this.cardRect(corner, this.measureCard(card), W, H) : null };
      }

      const card = scene.card && this.showCards ? scene.card : null;
      if (!card) return { cam: camAt(snap(z0), 0, 0), zoom: snap(z0), corner: null, cardRect: null, labelT };

      const size = this.measureCard(card);
      const corners = card.corner && card.corner !== 'auto' ? [card.corner] : ['tr', 'br', 'tl', 'bl'];
      const clear = (cam, z, rect) => {
        const m = 12;
        const wr = [cam.x + (rect[0] - m) / z, cam.y + (rect[1] - m) / z, cam.x + (rect[2] + m) / z, cam.y + (rect[3] + m) / z];
        return !boxes.some((bx) => overlap(bx, wr));
      };
      let best = null;
      corners.forEach((corner, ci) => {
        const rect = this.cardRect(corner, size, W, H);
        const sx = corner[1] === 'l' ? 1 : -1;
        const sy = corner[0] === 't' ? 1 : -1;
        const aligns = [[0, 0], [sx, 0], [0, sy], [sx, sy]];
        for (let z = snap(z0); z >= zMin - 1e-6; z = Math.round((z - 0.05) * 100) / 100) {
          let found = null;
          for (const [ai, [ax, ay]] of aligns.entries()) {
            const cam = camAt(z, ax, ay);
            if (clear(cam, z, rect)) {
              const keep = prev && prev.corner === corner ? 0.045 : 0;
              found = { cam, zoom: z, corner, cardRect: rect, score: z - ai * 0.004 - ci * 0.001 + keep };
              break;
            }
          }
          if (found) {
            if (!best || found.score > best.score) best = found;
            break;
          }
        }
      });
      if (!best) {
        const corner = corners[0];
        const z = snap(z0 * 0.7);
        best = { cam: camAt(z, corner[1] === 'l' ? 1 : -1, corner[0] === 't' ? 1 : -1), zoom: z, corner, cardRect: this.cardRect(corner, size, W, H) };
      }
      best.labelT = labelT;
      return best;
    }

    refit() {
      if (!this.scene || this.host.clientWidth < 2) return;
      const plan = this.plan(this.scene, this.lastPlan);
      this.lastPlan = plan;
      if (this.anim) this.anim.cam.to = plan.cam;
      else this.setCam(plan.cam);
      this.placeCard(plan, true);
    }

    /* ----- 翻页 ----- */
    goTo(scene, { instant = false } = {}) {
      this.finish(true);
      this.clearPackets();
      this.flows = [];
      const now = performance.now();
      const plan = this.plan(scene, this.lastPlan);
      this.lastPlan = plan;
      const next = normalizeAll(scene.entities);

      const exiting = [...this.ents.keys()].filter((id) => !next[id]);
      const changed = Object.keys(next).filter((id) => this.ents.has(id) && !same(this.ents.get(id).cur, next[id]));
      const entering = Object.keys(next)
        .filter((id) => !this.ents.has(id))
        .sort((a, b) => depth(next[a]) - depth(next[b]));
      const moveDelay = exiting.length ? TIMING.exit * 0.55 : 0;
      const enterDelay = changed.length ? moveDelay + TIMING.move * 0.75 : exiting.length ? TIMING.exit * 0.7 : 0;
      const ready = {};
      let end = 0;

      for (const id of exiting) {
        const ent = this.ents.get(id);
        ent.tween = {
          from: { ...ent.cur },
          to: { ...ent.cur, opacity: 0, ...(EXIT_TO[ent.cur.type] || {}) },
          start: now, delay: 0, dur: TIMING.exit, ease: ease.inOut, remove: true,
        };
        end = Math.max(end, TIMING.exit);
      }
      for (const id of Object.keys(next)) {
        if (!this.ents.has(id)) continue;
        if (!changed.includes(id)) {
          ready[id] = 0;
          continue;
        }
        const ent = this.ents.get(id);
        const to = next[id];
        ent.tween = {
          from: { ...ent.cur }, to, start: now, delay: moveDelay, dur: TIMING.move, ease: ease.inOut,
          tagSwap: !same(ent.cur.tags, to.tags),
          labelSwap: !same(ent.cur.label, to.label) || (ent.cur.sub || '') !== (to.sub || ''),
        };
        ready[id] = moveDelay + TIMING.move;
        end = Math.max(end, ready[id]);
      }
      entering.forEach((id, i) => {
        const to = next[id];
        const from = { ...to, opacity: 0, ...(ENTER_FROM[to.type] || { lift: 120 }) };
        const ent = this.addEntity(id, from);
        const delay = enterDelay + i * TIMING.stagger;
        ent.tween = {
          from, to, start: now, delay, dur: TIMING.enter, ease: ease.out, liftEase: ease.back, countEase: ease.inOut,
        };
        ready[id] = delay + TIMING.enter * 0.8;
        end = Math.max(end, delay + TIMING.enter);
      });

      const nextLinks = scene.links || {};
      for (const [id, link] of this.links) {
        if (nextLinks[id]) continue;
        link.tween = { key: 'opacity', from: link.opacity, to: 0, start: now, delay: 0, dur: TIMING.linkFade, remove: true };
      }
      let k = 0;
      for (const [id, spec] of Object.entries(nextLinks)) {
        if (this.links.has(id)) {
          const link = this.links.get(id);
          link.spec = spec;
          link.labelKey = null;
          this.styleLink(link);
          continue;
        }
        const link = this.addLink(id, spec);
        const delay =
          Math.max(ready[spec.from] ?? 0, ready[spec.to] ?? 0, moveDelay + (changed.length ? TIMING.move * 0.6 : 0)) + 60 + k * 90;
        k += 1;
        link.draw = 0;
        link.tween = { key: 'draw', from: 0, to: 1, start: now, delay, dur: TIMING.draw };
        end = Math.max(end, delay + TIMING.draw);
      }

      const camDelay = exiting.length ? TIMING.exit * 0.4 : 0;
      end = Math.max(end, camDelay + TIMING.move);
      this.scene = scene;
      this.anim = {
        cam: { from: { ...this.cam }, to: plan.cam, delay: camDelay, dur: TIMING.move },
        start: now,
        end: now + end,
        flows: scene.flows || [],
        spot: [...entering, ...changed.filter((id) => !next[id].dead)],
      };
      this.updateCard(scene.card, plan, instant);
      if (instant) this.finish();
    }

    /** 立即跳到当前动画终态 */
    finish(skipSettle = false) {
      const a = this.anim;
      if (!a) return;
      for (const [id, ent] of [...this.ents]) {
        if (!ent.tween) continue;
        if (ent.tween.remove) this.removeEntity(id);
        else {
          ent.cur = ent.tween.to;
          ent.tween = null;
          this.renderEntity(ent);
        }
      }
      for (const [id, link] of [...this.links]) {
        if (!link.tween) continue;
        if (link.tween.remove) this.removeLink(id);
        else {
          link[link.tween.key] = link.tween.to;
          link.tween = null;
        }
      }
      this.setCam(a.cam.to);
      this.sortDepth();
      this.updateLinks();
      this.anim = null;
      if (!skipSettle) this.settle(a);
    }

    settle(a) {
      this.flows = a.flows.map((f) => ({ ...f, acc: 0.6, n: 0, rr: 0 }));
      for (const id of a.spot) this.spotlight(id);
      if (this.onSettle) this.onSettle();
    }

    /** 清空后重新播放当前页的入场动画 */
    replay() {
      const s = this.scene;
      if (!s) return;
      this.finish(true);
      this.clearPackets(true);
      for (const id of [...this.ents.keys()]) this.removeEntity(id);
      for (const id of [...this.links.keys()]) this.removeLink(id);
      this.flows = [];
      this.cardKey = null;
      this.cardEl.classList.add('is-hidden');
      this.goTo(s);
    }

    setPaused(v) {
      this.paused = !!v;
      this.host.classList.toggle('is-paused', this.paused);
    }

    /** 当前画面上各元素的矩形，单位是相对舞台左上角的 CSS 像素（不受外层 scale 影响），给检查脚本用 */
    debugBoxes() {
      const host = this.host.getBoundingClientRect();
      const k = host.width / Math.max(1, this.host.clientWidth) || 1;
      const rel = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) return null;
        return [(r.left - host.left) / k, (r.top - host.top) / k, (r.right - host.left) / k, (r.bottom - host.top) / k].map(R);
      };
      const boxes = [];
      for (const [id, ent] of this.ents) {
        if (ent.cur.type === 'zone' || ent.cur.opacity < 0.05) continue;
        const body = rel(ent.el);
        const dim = ent.cur.dim > 0.5 || undefined;
        if (body) boxes.push({ id, kind: FLOAT.has(ent.cur.type) ? 'note' : 'entity', type: ent.cur.type, box: body, dim });
        const over = ent.overEl.childNodes.length ? rel(ent.overEl) : null;
        if (over) boxes.push({ id, kind: 'pills', box: over, dim });
      }
      for (const [id, link] of this.links) {
        if (!link.spec.label || link.opacity < 0.05) continue;
        const b = rel(link.labelEl);
        if (b) boxes.push({ id, kind: 'label', box: b, from: link.spec.from, to: link.spec.to });
      }
      if (!this.cardEl.classList.contains('is-hidden')) {
        const b = rel(this.cardEl);
        if (b) boxes.push({ id: 'card', kind: 'card', box: b });
      }
      return { width: this.host.clientWidth, height: this.host.clientHeight, zoom: this.lastPlan?.zoom ?? null, boxes };
    }

    /* ----- 信息卡 ----- */
    updateCard(card, plan, instant) {
      const el = this.cardEl;
      clearTimeout(this.cardTimer);
      if (!card || !this.showCards) {
        el.classList.add('is-hidden');
        this.cardKey = null;
        return;
      }
      const html = cardHTML(card);
      const show = () => {
        el.classList.add('no-anim');
        el.innerHTML = html;
        this.placeCard(plan);
        void el.offsetWidth;
        el.classList.remove('no-anim', 'is-hidden', 'is-swap');
      };
      if (this.cardKey === html) this.placeCard(plan);
      else if (instant || this.cardKey == null) show();
      else {
        el.classList.add('is-swap');
        this.cardTimer = setTimeout(show, 200);
      }
      this.cardKey = html;
    }

    placeCard(plan, instant = false) {
      if (!plan || !plan.cardRect) return;
      const el = this.cardEl;
      if (instant) el.classList.add('no-anim');
      el.style.left = `${R(plan.cardRect[0])}px`;
      el.style.top = `${R(plan.cardRect[1])}px`;
      if (instant) {
        void el.offsetWidth;
        el.classList.remove('no-anim');
      }
    }

    /* ----- 实体 ----- */
    addEntity(id, e) {
      const el = svgEl('g', { 'data-id': id, class: `iso-ent iso-ent--${e.type}` });
      const overEl = svgEl('g', { 'data-id': id });
      (e.type === 'zone' ? this.L.floor : this.L.ents).appendChild(el);
      this.L.over.appendChild(overEl);
      const ent = { id, cur: { ...e }, el, overEl, poly: null, bounds: null, tween: null };
      this.ents.set(id, ent);
      this.renderEntity(ent);
      return ent;
    }

    removeEntity(id) {
      const ent = this.ents.get(id);
      if (!ent) return;
      ent.el.remove();
      ent.overEl.remove();
      this.ents.delete(id);
    }

    renderEntity(ent) {
      const s = shapeOf(ent.cur);
      ent.el.innerHTML = s.body;
      ent.overEl.innerHTML = s.over || '';
      ent.overEl.style.opacity = !FLOAT.has(ent.cur.type) && ent.cur.dim > 0.01 ? R(1 - ent.cur.dim * 0.55) : '';
      ent.poly = s.poly;
      ent.bounds = s.bounds;
    }

    sortDepth() {
      const list = [...this.ents.values()].filter((e) => e.cur.type !== 'zone').sort((a, b) => depth(a.cur) - depth(b.cur));
      const kids = [...this.L.ents.children];
      if (list.some((e, i) => kids[i] !== e.el)) for (const e of list) this.L.ents.appendChild(e.el);
    }

    spotlight(id) {
      const ent = this.ents.get(id);
      if (!ent || ent.cur.type === 'zone' || FLOAT.has(ent.cur.type)) return;
      const [x0, x1, y0, y1] = footprint(ent.cur);
      const o = 0.6;
      const path = svgEl('path', {
        class: 'iso-spot',
        d: roundPoly([iso(x0 - o, y0 - o), iso(x0 - o, y1 + o), iso(x1 + o, y1 + o), iso(x1 + o, y0 - o)], 7),
      });
      this.L.floor.appendChild(path);
      setTimeout(() => path.remove(), 1600);
    }

    /* ----- 连线 ----- */
    addLink(id, spec) {
      const el = svgEl('path', { class: 'iso-link' });
      this.L.links.appendChild(el);
      const labelEl = svgEl('g', { class: 'iso-link-label' });
      this.L.over.appendChild(labelEl);
      const link = { id, spec, el, labelEl, draw: 1, opacity: 1, tween: null, len: 0, pts: null, labelKey: null };
      this.links.set(id, link);
      this.styleLink(link);
      return link;
    }

    removeLink(id) {
      const link = this.links.get(id);
      if (!link) return;
      link.el.remove();
      link.labelEl.remove();
      this.links.delete(id);
    }

    styleLink(link) {
      link.el.setAttribute('class', `iso-link iso-link--${link.spec.style || 'solid'}`);
    }

    updateLinks() {
      const getEnt = (id) => this.ents.get(id)?.cur;
      const getPoly = (id) => this.ents.get(id)?.poly;
      for (const link of this.links.values()) {
        const spec = link.spec;
        const pts = this.ents.has(spec.from) && (!spec.to || this.ents.has(spec.to)) ? linkPoints(spec, getEnt, getPoly) : null;
        if (!pts) {
          link.el.style.opacity = 0;
          link.labelEl.style.opacity = 0;
          continue;
        }
        link.pts = pts;
        link.el.setAttribute('d', roundLine(pts, 9));
        link.len = link.el.getTotalLength();
        const style = spec.style || 'solid';
        const showHeads = link.draw > 0.97;
        link.el.setAttribute('marker-end', showHeads && spec.heads !== 'none' ? 'url(#iso-arrow)' : '');
        link.el.setAttribute('marker-start', showHeads && spec.heads === 'both' ? 'url(#iso-arrow)' : '');
        if (link.draw < 1 && style === 'solid') {
          link.el.style.strokeDasharray = `${R(link.len)} ${R(link.len)}`;
          link.el.style.strokeDashoffset = R(link.len * (1 - link.draw));
          link.el.style.opacity = link.opacity;
        } else {
          link.el.style.strokeDasharray = '';
          link.el.style.strokeDashoffset = '';
          link.el.style.opacity = R(link.opacity * (style === 'solid' ? 1 : clamp01(link.draw * 1.4)));
        }
        if (spec.label) {
          const key = `${spec.label}|${spec.labelTone || ''}`;
          if (link.labelKey !== key) {
            link.labelEl.innerHTML = pill(0, 0, spec.label, { tone: spec.labelTone || 'paper', icon: spec.labelIcon });
            link.labelKey = key;
          }
          const [x, y] = polyAt(pts, this.lastPlan?.labelT?.[link.id] ?? spec.labelAt ?? 0.5);
          link.labelEl.setAttribute('transform', `translate(${R(x)} ${R(y)})`);
          link.labelEl.style.opacity = R(clamp01((link.draw - 0.6) / 0.4) * link.opacity);
        } else if (link.labelKey) {
          link.labelEl.innerHTML = '';
          link.labelKey = null;
        }
      }
    }

    /* ----- 数据包 ----- */
    clearPackets(hard = false) {
      for (const p of this.packets) {
        if (hard) p.el.remove();
        else {
          p.el.classList.add('is-leave');
          setTimeout(() => p.el.remove(), 260);
        }
      }
      this.packets = [];
    }

    pickRoute(f) {
      const kind = f.pattern ? f.pattern[f.n % f.pattern.length] : f.kind || 'req';
      if (f.routes) {
        let i;
        if (f.pick === 'weights') {
          const w = f.routes.map((r) => r.weight ?? 1);
          let r = Math.random() * w.reduce((a, b) => a + b, 0);
          i = w.findIndex((x) => (r -= x) <= 0);
          if (i < 0) i = w.length - 1;
        } else {
          i = f.rr % f.routes.length;
          f.rr += 1;
        }
        f.n += 1;
        return { route: f.routes[i].path, kind: f.routes[i].kind || kind };
      }
      const route = f.route.map((seg) => {
        if (typeof seg === 'string') return seg;
        const s = seg[f.rr % seg.length];
        f.rr += 1;
        return s;
      });
      f.n += 1;
      return { route, kind };
    }

    spawn(f) {
      if (f.fanout && f.routes) {
        f.n += 1;
        for (const r of f.routes) this.launch(r.path, r.kind || f.kind || 'req', f);
        return;
      }
      const { route, kind } = this.pickRoute(f);
      this.launch(route, kind, f);
    }

    launch(route, kind, f) {
      if (!route.every((id) => this.links.has(id))) return;
      const el = svgEl('g', { class: `iso-pkt iso-pkt--${kind}` });
      el.innerHTML =
        kind === 'heavy'
          ? '<rect x="-6" y="-6" width="12" height="12" rx="3.5"/>'
          : kind === 'write' || kind === 'msg'
            ? '<rect x="-4.6" y="-4.6" width="9.2" height="9.2" rx="2.2"/>'
            : kind === 'ping'
              ? '<circle r="3.4"/>'
              : '<circle r="4.3"/>';
      this.L.packets.appendChild(el);
      this.packets.push({ route, seg: 0, d: 0, kind, el, back: false, bounce: !!f.bounce, dwell: 0, speed: f.speed || 1, hold: f.hold || 0 });
    }

    burst(x, y, type) {
      const el = svgEl('g', { class: `iso-fx iso-fx--${type}`, transform: `translate(${R(x)} ${R(y)})` });
      el.innerHTML =
        type === 'fail'
          ? '<circle r="5" class="iso-fx-ring"/><path d="M-3.6,-3.6 L3.6,3.6 M3.6,-3.6 L-3.6,3.6" class="iso-fx-x"/>'
          : '<circle r="4.3" class="iso-fx-ring"/>';
      this.L.packets.appendChild(el);
      setTimeout(() => el.remove(), 700);
    }

    stepPackets(dt) {
      for (const f of this.flows) for (f.acc += dt * (f.rate || 1); f.acc >= 1; f.acc -= 1) this.spawn(f);
      const alive = [];
      for (const p of this.packets) {
        if (p.dwell > 0) {
          p.dwell -= dt;
          if (p.dwell > 0) {
            alive.push(p);
            continue;
          }
          p.el.style.opacity = 1;
          if (p.back) {
            p.el.classList.remove('is-held');
            p.el.classList.add('is-back');
          }
        }
        const link = this.links.get(p.route[p.seg]);
        if (!link || !link.len) {
          p.el.remove();
          continue;
        }
        p.d += PACKET_SPEED * p.speed * (KIND_SPEED[p.kind] || 1) * dt;
        const heads = link.spec.heads || 'end';
        let a = heads === 'both' ? 10 : 0;
        let b = link.len - (heads === 'none' ? 0 : 10);
        if (b - a < 10) {
          a = 0;
          b = link.len;
        }
        const span = b - a;
        if (p.d >= span) {
          const pt = link.el.getPointAtLength(p.back ? a : b);
          if (!p.back && Math.random() < (link.spec.fail || 0)) {
            this.burst(pt.x, pt.y, 'fail');
            p.el.remove();
            continue;
          }
          if (!p.back && p.seg < p.route.length - 1) {
            p.seg += 1;
            p.d = 0;
            p.dwell = 0.16;
            p.el.style.opacity = 0;
            alive.push(p);
            continue;
          }
          if (p.bounce && !p.back) {
            p.back = true;
            p.d = 0;
            if (p.hold) {
              p.dwell = p.hold;
              p.el.classList.add('is-held');
            } else p.el.classList.add('is-back');
            alive.push(p);
            continue;
          }
          if (p.back && p.seg > 0) {
            p.seg -= 1;
            p.d = 0;
            p.dwell = 0.16;
            p.el.style.opacity = 0;
            alive.push(p);
            continue;
          }
          this.burst(pt.x, pt.y, 'ok');
          p.el.remove();
          continue;
        }
        const pt = link.el.getPointAtLength(p.back ? b - p.d : a + p.d);
        p.el.setAttribute('transform', `translate(${R(pt.x)} ${R(pt.y)})`);
        alive.push(p);
      }
      this.packets = alive;
    }

    /* ----- 主循环 ----- */
    tick(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const a = this.anim;
      if (a) {
        const c = a.cam;
        const kc = ease.inOut(clamp01((now - a.start - c.delay) / c.dur));
        this.setCam({ x: lerp(c.from.x, c.to.x, kc), y: lerp(c.from.y, c.to.y, kc), w: lerp(c.from.w, c.to.w, kc), h: lerp(c.from.h, c.to.h, kc) });
        let moved = false;
        for (const [id, ent] of [...this.ents]) {
          const tw = ent.tween;
          if (!tw) continue;
          const raw = (now - tw.start - tw.delay) / tw.dur;
          if (raw < 0 && !tw.started) continue;
          tw.started = true;
          const o = clamp01(raw);
          const s = tw.ease(o);
          const cur = tw.remove || o >= 0.5 ? { ...tw.to } : { ...tw.from };
          for (const key in tw.to) {
            const f = tw.from[key];
            const t = tw.to[key];
            if (typeof f !== 'number' || typeof t !== 'number') continue;
            if (key === 'cpu' && (f < 0 || t < 0)) continue;
            const ek = key === 'lift' && tw.liftEase ? tw.liftEase(o) : key === 'count' && tw.countEase ? tw.countEase(o) : s;
            cur[key] = lerp(f, t, ek);
          }
          const swap = o < 0.5 ? 1 - clamp01(o / 0.42) : clamp01((o - 0.55) / 0.4);
          if (tw.tagSwap) cur.tagFade = swap;
          if (tw.labelSwap) cur.labelFade = swap;
          ent.cur = cur;
          this.renderEntity(ent);
          moved = true;
          if (o >= 1) {
            if (tw.remove) this.removeEntity(id);
            else {
              ent.cur = tw.to;
              ent.tween = null;
              this.renderEntity(ent);
            }
          }
        }
        for (const [id, link] of [...this.links]) {
          const tw = link.tween;
          if (!tw) continue;
          const k = clamp01((now - tw.start - tw.delay) / tw.dur);
          link[tw.key] = lerp(tw.from, tw.to, ease.inOut(k));
          if (k >= 1) {
            if (tw.remove) this.removeLink(id);
            else link.tween = null;
          }
        }
        if (moved) this.sortDepth();
        this.updateLinks();
        if (now >= a.end) {
          this.anim = null;
          this.updateLinks();
          this.settle(a);
        }
      }
      if (!this.paused) this.stepPackets(dt);
    }
  }

  /* ---------- 编写场景用的小工厂 ---------- */
  const h = {
    block: (x, y, o = {}) => ({ type: 'block', x, y, ...o }),
    db: (x, y, o = {}) => ({ type: 'db', x, y, ...o }),
    crowd: (rect, count, label, o = {}) => ({ type: 'crowd', ...rect, count, label, ...o }),
    zone: (rect, label, o = {}) => ({ type: 'zone', ...rect, label, ...o }),
    note: (x, y, text, o = {}) => ({ type: 'note', x, y, text, ...o }),
    figure: (x, y, o = {}) => ({ type: 'figure', x, y, ...o }),
    say: (x, y, text, o = {}) => ({ type: 'say', x, y, text, ...o }),
    card: (x, y, o = {}) => ({ type: 'card', x, y, ...o }),
    doc: (x, y, o = {}) => ({ type: 'doc', x, y, ...o }),
    /** link(from, to) / link(from, to, pts) / link(from, to, opts) / link(from, to, pts, opts) */
    link: (from, to, pts, o) => {
      if (pts && !Array.isArray(pts)) [o, pts] = [pts, undefined];
      return { from, to, pts: pts || [from, to], heads: 'end', ...(o || {}) };
    },
    hot: (cpu = 1) => ({ heat: 1, dead: 0, cpu }),
    idle: (cpu = -1) => ({ heat: 0, dead: 0, cpu }),
    down: (text = '宕机') => ({ dead: 1, heat: 0, cpu: -1, tags: [{ text, tone: 'red', icon: 'alert' }] }),
  };

  global.Iso = { Stage, iso, h, ICONS, PALETTE, TONES, TIMING, icon, iconSvg, md, esc, center };
})(window);
