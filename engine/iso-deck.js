/*
 * iso-deck.js — 基于 Iso.Stage 的动态 PPT 外壳
 *
 *   IsoDeck.mount('#app', deck)
 *
 * 负责：16:9 固定画布等比缩放、键盘/翻页笔翻页、页内分拍、指标条、讲稿区、步骤条、封面页、URL 锚点同步。
 * mount 时先用 prepare 展开流程模型（deck.model）和数字台账（deck.facts）。
 * 字段说明见 ../references/scene-api.md
 */
(function (global) {
  'use strict';

  const { Stage, iconSvg, md, esc, center } = global.Iso;

  const UI = {
    zh: {
      notes: '提词', side: '讲稿', full: '全屏', replay: '重播', pause: '暂停', resume: '继续',
      prev: '← 上一步', next: '下一步：', nextBeat: '下一个镜头', last: '已是最后一步',
      step: (i, n) => `第 ${i} / ${n} 步`, beat: (i, n) => (i ? `镜头 ${i} / ${n}` : '全景'),
      hint: '<kbd>←</kbd> <kbd>→</kbd> 翻页 · <kbd>F</kbd> 全屏 · <kbd>S</kbd> 讲稿 · <kbd>N</kbd> 提词',
      notesTitle: (i) => `口播 · 第 ${i} 步`, noNotes: '本步没有提词',
      callout: { tip: '提示', insight: '洞察', warn: '注意' },
      legend: { req: '请求', back: '响应', write: '写入', push: '推送', msg: '消息', fail: '失败' },
    },
    en: {
      notes: 'Notes', side: 'Script', full: 'Fullscreen', replay: 'Replay', pause: 'Pause', resume: 'Resume',
      prev: '← Back', next: 'Next: ', nextBeat: 'Next shot', last: 'Last step',
      step: (i, n) => `Step ${i} / ${n}`, beat: (i, n) => (i ? `Shot ${i} / ${n}` : 'Overview'),
      hint: '<kbd>←</kbd> <kbd>→</kbd> page · <kbd>F</kbd> full · <kbd>S</kbd> script · <kbd>N</kbd> notes',
      notesTitle: (i) => `Talk track · step ${i}`, noNotes: 'No notes for this step',
      callout: { tip: 'Tip', insight: 'Insight', warn: 'Note' },
      legend: { req: 'Request', back: 'Response', write: 'Write', push: 'Push', msg: 'Message', fail: 'Failure' },
    },
  };
  const CALLOUT_ICON = { tip: 'info', insight: 'sparkles', warn: 'alert' };
  const CHANGE = { '+': 'add', '~': 'mod', '-': 'del', '−': 'del' };
  const LEGEND_STYLE = {
    req: [''],
    back: ['background:#b3d79f'],
    write: ['background:#a9c5e8', 'sq'],
    push: ['background:#b3d79f'],
    msg: ['background:#f6cd82', 'sq'],
    fail: ['background:#e5533d'],
  };

  const R = (v) => Math.round(v * 100) / 100;
  const fmt = (v, def) => (def && def.format ? def.format(v) : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
  const bodyHTML = (body) =>
    (Array.isArray(body) ? body : body ? [body] : [])
      .map((p) => (/^\s*</.test(p) ? p : `<p>${md(p)}</p>`))
      .join('');
  const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

  /* ---------- 数字台账：文字里的 {key} 换成 deck.facts[key].value ---------- */
  const FACT = /\{([A-Za-z_][\w.-]*)\}/g;
  const factValue = (f) => (f && typeof f === 'object' ? f.value : f);
  // 不比较 Object.prototype：在 Node 的 vm 沙箱里跑校验时，对象可能来自另一个 realm
  const isPlain = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    return p === null || Object.getPrototypeOf(p) === null;
  };
  function fill(v, facts) {
    if (typeof v === 'string') return v.replace(FACT, (m, k) => (Object.prototype.hasOwnProperty.call(facts, k) ? String(factValue(facts[k])) : m));
    if (Array.isArray(v)) return v.map((x) => fill(x, facts));
    if (isPlain(v)) {
      const o = {};
      for (const k of Object.keys(v)) o[k] = fill(v[k], facts);
      return o;
    }
    return v;
  }

  /* ---------- 流程模型：scene 里按 id 引用 deck.model，值为 true 原样取用，为对象时覆盖部分字段 ---------- */
  function pick(src, defs, isWhole) {
    if (!src) return {};
    if (Array.isArray(src)) src = Object.fromEntries(src.map((id) => [id, true]));
    const out = {};
    for (const [id, v] of Object.entries(src)) {
      if (v === false || v == null) continue;
      const base = defs[id];
      if (v === true) {
        if (base) out[id] = base;
        continue;
      }
      out[id] = base && !isWhole(v) ? { ...base, ...v } : v;
    }
    return out;
  }
  function resolveScene(scene, model) {
    if (!scene) return { entities: {} };
    if (!model) return scene;
    return {
      ...scene,
      entities: pick(scene.entities, model.entities || {}, (v) => 'type' in v),
      links: pick(scene.links, model.links || {}, (v) => 'from' in v),
    };
  }

  function prepare(deck) {
    const facts = deck.facts || {};
    const model = deck.model ? fill(deck.model, facts) : null;
    const steps = (deck.steps || []).map((s) => {
      const st = fill(s, facts);
      return { ...st, scene: resolveScene(st.scene, model) };
    });
    return { ...deck, title: fill(deck.title, facts), subtitle: fill(deck.subtitle, facts), model, steps };
  }

  /* ---------- 页内分拍：推近到 focus 的对象，其余对象变淡 ---------- */
  function beatScene(scene, beat, baseZoom) {
    const focus = asList(beat.focus);
    const ents = scene.entities || {};
    if (!focus.length && beat.zoom == null && !beat.at) return { ...scene, card: beat.card !== undefined ? beat.card : scene.card };
    const pts = focus.map((id) => ents[id]).filter(Boolean).map(center);
    const at = beat.at || (pts.length ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length] : scene.camera && scene.camera.at);
    const entities = {};
    for (const [id, e] of Object.entries(ents)) {
      entities[id] = focus.length && !focus.includes(id) && e.type !== 'zone' ? { ...e, dim: Math.max(e.dim || 0, 1) } : e;
    }
    const links = {};
    for (const [id, l] of Object.entries(scene.links || {})) {
      const on = focus.includes(l.from) || focus.includes(l.to);
      links[id] = !focus.length || on ? l : { ...l, style: 'muted', label: '' };
    }
    return { ...scene, entities, links, card: beat.card !== undefined ? beat.card : null, camera: { at, zoom: R(baseZoom * (beat.zoom ?? 1.3)) } };
  }

  /* ---------- 画面检查：遮挡、出框 ---------- */
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const inter = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  const SOFT = new Set(['entity']);
  // 等距体块的外接矩形四角是空的：和文字比较时只算中间这块
  const core = (x) => {
    if (x.kind !== 'entity') return x.box;
    const [l, t, r, b] = x.box;
    const dx = (r - l) * 0.2;
    const dy = (b - t) * 0.15;
    return [l + dx, t + dy, r - dx, b - dy];
  };
  function findIssues(boxes, W, H) {
    const issues = [];
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (a.kind !== 'cover' && !a.dim && (a.box[0] < -4 || a.box[1] < -4 || a.box[2] > W + 4 || a.box[3] > H + 4)) {
        issues.push({ level: 'warn', type: 'out-of-frame', a: `${a.kind}:${a.id}`, box: a.box });
      }
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (a.id === b.id && a.kind !== 'label' && b.kind !== 'label') continue;
        if (a.kind === 'cover' && b.kind === 'cover') continue;
        const mixed = SOFT.has(a.kind) !== SOFT.has(b.kind);
        const ov = mixed ? inter(core(a), core(b)) : inter(a.box, b.box);
        if (ov < 40) continue;
        const ratio = ov / Math.max(1, Math.min(area(a.box), area(b.box)));
        const bothSoft = SOFT.has(a.kind) && SOFT.has(b.kind);
        if (bothSoft ? ratio < 0.35 : ratio < 0.06) continue;
        const level = bothSoft ? 'warn' : ratio >= 0.15 ? 'error' : 'warn';
        issues.push({ level, type: 'overlap', a: `${a.kind}:${a.id}`, b: `${b.kind}:${b.id}`, ratio: R(ratio) });
      }
    }
    return issues;
  }

  function mount(target, input, options = {}) {
    const deck = prepare(input);
    const ui = { ...UI[deck.lang === 'en' ? 'en' : 'zh'], ...(deck.ui || {}) };
    const [W, H] = deck.size || [1600, 900];
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    const steps = deck.steps;
    const metricDefs = deck.metrics || [];
    root.classList.add('dk-viewport');
    root.innerHTML = `
      <div class="dk" style="width:${W}px;height:${H}px">
        <header class="dk-top">
          <div class="dk-brand"><span class="dk-logo">${iconSvg(deck.icon || 'layers', 18)}</span><b>${esc(deck.title || '')}</b><span class="dk-sub">${esc(deck.subtitle || '')}</span></div>
          <div class="dk-top-right">
            <span class="dk-counter"></span>
            <button class="dk-chip" data-act="notes">${iconSvg('message', 14)}${esc(ui.notes)}</button>
            <button class="dk-chip" data-act="side">${iconSvg('file', 14)}${esc(ui.side)}</button>
            <button class="dk-chip" data-act="full">${iconSvg('monitor', 14)}${esc(ui.full)}</button>
          </div>
        </header>
        <main class="dk-main">
          <section class="dk-stage-col">
            <div class="dk-metrics"></div>
            <div class="dk-stage-wrap">
              <div class="dk-stage"></div>
              <div class="dk-legend"></div>
              <div class="dk-stage-tools">
                <button class="dk-chip" data-act="replay">${iconSvg('activity', 14)}${esc(ui.replay)}</button>
                <button class="dk-chip" data-act="pause">${iconSvg('clock', 14)}<span>${esc(ui.pause)}</span></button>
              </div>
              <div class="dk-cover"></div>
            </div>
            <nav class="dk-timeline"><div class="dk-tl-progress"></div></nav>
          </section>
          <aside class="dk-side">
            <div class="dk-side-inner"></div>
            <div class="dk-nav">
              <button class="dk-btn" data-act="prev">${esc(ui.prev)}</button>
              <button class="dk-btn dk-btn--primary" data-act="next"><span class="t"></span><span>→</span></button>
            </div>
            <div class="dk-hint">${ui.hint}</div>
          </aside>
        </main>
        <div class="dk-notes"></div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const dk = $('.dk');
    if (deck.sideWidth) dk.style.setProperty('--dk-side-w', `${deck.sideWidth}px`);
    const side = $('.dk-side-inner');
    const cover = $('.dk-cover');
    const timeline = $('.dk-timeline');
    const metricsBar = $('.dk-metrics');
    const legend = $('.dk-legend');
    const notesEl = $('.dk-notes');
    const nextBtn = $('[data-act="next"]');
    const prevBtn = $('[data-act="prev"]');

    const stage = new Stage($('.dk-stage'), {
      cardInset: { x: 14, top: 14, bottom: 58 },
      ...(options.stage || {}),
    });

    /* 等比缩放 */
    const fit = () => {
      const s = Math.min(root.clientWidth / W, root.clientHeight / H);
      dk.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    addEventListener('resize', fit);
    fit();

    /* 指标条 */
    const cells = metricDefs.map((m) => {
      const el = document.createElement('div');
      el.className = 'dk-metric is-unknown';
      el.innerHTML = `<div class="k">${m.icon ? iconSvg(m.icon, 13) : ''}${esc(m.label)}</div><div class="v">?</div>`;
      metricsBar.appendChild(el);
      return { el, v: el.querySelector('.v'), def: m, val: undefined, raf: 0 };
    });
    function setMetric(cell, v, animate) {
      const prev = cell.val;
      cell.val = v;
      cancelAnimationFrame(cell.raf);
      const unknown = v == null || v === '?';
      cell.el.classList.toggle('is-unknown', unknown);
      if (unknown) {
        cell.v.textContent = '?';
        return;
      }
      if (animate && prev !== v) {
        cell.el.classList.remove('is-flash');
        void cell.el.offsetWidth;
        cell.el.classList.add('is-flash');
        setTimeout(() => cell.el.classList.remove('is-flash'), 900);
      }
      if (animate && typeof v === 'number' && typeof prev === 'number' && prev !== v) {
        const t0 = performance.now();
        const run = (t) => {
          const k = Math.min(1, (t - t0) / 650);
          const e = 1 - (1 - k) ** 3;
          const cur = prev + (v - prev) * e;
          cell.v.textContent = fmt(Number.isInteger(v) && Number.isInteger(prev) ? Math.round(cur) : Math.round(cur * 10) / 10, cell.def);
          if (k < 1) cell.raf = requestAnimationFrame(run);
        };
        cell.raf = requestAnimationFrame(run);
      } else cell.v.textContent = fmt(v, cell.def);
    }

    /* 步骤条 */
    const dots = steps.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'dk-tl-step';
      b.innerHTML = `<span class="dot">${i + 1}</span><span class="lb">${esc(s.short || '')}</span>`;
      b.addEventListener('click', () => go(i));
      timeline.appendChild(b);
      return b;
    });

    /* 讲稿区 */
    function sideHTML(step, i) {
      const c = step.callout;
      const kind = c && CALLOUT_ICON[c.kind] ? c.kind : 'tip';
      const callout = c
        ? `<div class="dk-callout dk-callout--${kind}">${iconSvg(CALLOUT_ICON[kind], 16)}<div><span class="t">${esc(ui.callout[kind])}　</span>${md(c.text)}</div></div>`
        : '';
      const changes = (step.changes || []).length
        ? `<div class="dk-changes">${step.changes
            .map((s) => {
              const m = /^([+~\-−]) /.exec(s);
              const k = m ? CHANGE[m[1]] : 'mod';
              return `<div class="c c--${k}"><i>${m ? m[1] : '·'}</i><span>${md(m ? s.slice(2) : s)}</span></div>`;
            })
            .join('')}</div>`
        : '';
      return `
        <div class="dk-kicker"><span>${esc(ui.step(i + 1, steps.length))}<em class="dk-beat"></em></span>${step.badge ? `<span class="dk-badge">${esc(step.badge)}</span>` : ''}</div>
        <h1 class="dk-title">${md(step.title || '')}</h1>
        <div class="dk-body">${bodyHTML(step.body)}</div>
        ${callout}${changes}`;
    }

    function notesHTML(step, i) {
      const notes = asList(step.notes);
      const beats = step.beats || [];
      if (!notes.length && !beats.length) return `<span class="k">${esc(ui.noNotes)}</span>`;
      const list = beats.length ? `<ol class="dk-beats">${beats.map((b) => `<li>${md(b.say || '')}</li>`).join('')}</ol>` : '';
      return `<span class="k">${esc(ui.notesTitle(i + 1))}</span>${notes.map((p) => `<p>${md(p)}</p>`).join('')}${list}`;
    }

    function metricsAt(i) {
      for (let k = i; k >= 0; k--) if (steps[k].metrics) return steps[k].metrics;
      return {};
    }

    let index = -1;
    let beat = -1;
    let sideTimer = 0;
    let userHidSide = false;
    const zoomCache = new Map();
    const beatCount = (i) => (steps[i] && steps[i].beats ? steps[i].beats.length : 0);
    const baseZoom = (i) => {
      if (!zoomCache.has(i)) zoomCache.set(i, stage.plan(steps[i].scene, null).zoom);
      return zoomCache.get(i);
    };
    const sceneAt = (i, b) => (b < 0 ? steps[i].scene : beatScene(steps[i].scene, steps[i].beats[b], baseZoom(i)));

    function showBeat() {
      const n = beatCount(index);
      const tag = side.querySelector('.dk-beat');
      if (tag) tag.textContent = n ? ` · ${ui.beat(beat + 1, n)}` : '';
      notesEl.querySelectorAll('.dk-beats li').forEach((li, k) => li.classList.toggle('is-cur', k === beat));
      prevBtn.disabled = index === 0 && beat < 0;
      nextBtn.disabled = index === steps.length - 1 && beat >= n - 1;
      nextBtn.querySelector('.t').textContent =
        beat < n - 1 ? ui.nextBeat : index < steps.length - 1 ? `${ui.next}${steps[index + 1].short || ''}` : ui.last;
      if (options.hash !== false) history.replaceState(null, '', `#${index + 1}${beat >= 0 ? `.${beat + 1}` : ''}`);
    }

    function go(i, { beat: b = -1, instant = false } = {}) {
      i = Math.max(0, Math.min(steps.length - 1, i));
      b = Math.max(-1, Math.min(beatCount(i) - 1, b));
      if (i === index && b === beat && !instant) return;
      const first = index < 0;
      const sameStep = i === index;
      index = i;
      beat = b;
      const step = steps[i];

      stage.goTo(sceneAt(i, b), { instant });
      if (sameStep && !instant) {
        showBeat();
        if (options.onChange) options.onChange(i, step, b);
        return;
      }

      const html = sideHTML(step, i);
      clearTimeout(sideTimer);
      if (first || instant) side.innerHTML = html;
      else {
        side.classList.add('is-out');
        sideTimer = setTimeout(() => {
          side.innerHTML = html;
          side.scrollTop = 0;
          side.classList.remove('is-out');
          showBeat();
        }, 180);
      }

      const vals = metricsAt(i);
      cells.forEach((c) => setMetric(c, vals[c.def.key], !first && !instant));

      dots.forEach((d, k) => {
        d.classList.toggle('is-done', k < i);
        d.classList.toggle('is-cur', k === i);
      });
      timeline.style.setProperty('--p', steps.length > 1 ? i / (steps.length - 1) : 0);
      $('.dk-counter').textContent = `${i + 1} / ${steps.length}`;

      dk.classList.toggle('dk--nometrics', !(step.metricsBar ?? deck.metricsBar ?? true));

      if (step.cover) {
        const c = step.cover;
        const stats = (c.stats || [])
          .map((s) => {
            // 台账里的值常带单位（“87 分”），大字只放数字
            const m = !s.unit && /^(.*\d)\s+([^\d\s]{1,3})$/.exec(String(s.value));
            const [value, unit] = m ? [m[1], m[2]] : [s.value, s.unit];
            return `<div class="dk-stat"><div class="l">${md(s.label || '')}</div><div class="v">${md(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>${s.from ? `<div class="f">${md(s.from)}</div>` : ''}</div>`;
          })
          .join('');
        const agenda = (c.agenda || []).map((a) => `<span>${esc(a)}</span>`).join('');
        cover.className = `dk-cover${c.layout ? ` dk-cover--${c.layout}` : ''}`;
        cover.innerHTML = `<div class="dk-cover__in">${c.kicker ? `<div class="k">${esc(c.kicker)}</div>` : ''}<h2>${md(c.title || '')}</h2>${c.subtitle ? `<p>${md(c.subtitle)}</p>` : ''}${stats ? `<div class="dk-stats">${stats}</div>` : ''}${agenda ? `<div class="dk-agenda">${agenda}</div>` : ''}</div>`;
        void cover.offsetWidth;
        cover.classList.add('is-on');
      } else cover.classList.remove('is-on');

      notesEl.innerHTML = notesHTML(step, i);

      const lg = step.legend ?? deck.legend ?? [];
      legend.innerHTML = lg
        .map((k) => {
          const d = typeof k === 'string' ? [ui.legend[k] || k, ...(LEGEND_STYLE[k] || [''])] : [k.label, k.style || '', k.shape];
          return `<span><i class="${d[2] || ''}" style="${d[1]}"></i>${esc(d[0])}</span>`;
        })
        .join('');

      dk.classList.toggle('dk--noside', step.side === false || userHidSide);
      showBeat();
      if (options.onChange) options.onChange(i, step, b);
    }

    const next = () => (beat < beatCount(index) - 1 ? go(index, { beat: beat + 1 }) : go(index + 1));
    const prev = () => (beat >= 0 ? go(index, { beat: beat - 1 }) : go(index - 1, { beat: beatCount(index - 1) - 1 }));
    const togglePause = () => {
      stage.setPaused(!stage.paused);
      $('[data-act="pause"] span').textContent = stage.paused ? ui.resume : ui.pause;
      $('[data-act="pause"]').classList.toggle('is-on', stage.paused);
    };
    const toggleSide = () => {
      userHidSide = !userHidSide;
      dk.classList.toggle('dk--noside', userHidSide || steps[index].side === false);
      $('[data-act="side"]').classList.toggle('is-on', userHidSide);
    };
    const toggleNotes = () => {
      dk.classList.toggle('dk--notes');
      $('[data-act="notes"]').classList.toggle('is-on', dk.classList.contains('dk--notes'));
    };
    const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());

    const ACTS = { next, prev, replay: () => stage.replay(), pause: togglePause, side: toggleSide, notes: toggleNotes, full: toggleFull };
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn && ACTS[btn.dataset.act]) ACTS[btn.dataset.act]();
    });

    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) next();
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) prev();
      else if (k === 'Home') go(0);
      else if (k === 'End') go(steps.length - 1);
      else if (k === 'f' || k === 'F') toggleFull();
      else if (k === 'p' || k === 'P') togglePause();
      else if (k === 'r' || k === 'R') stage.replay();
      else if (k === 's' || k === 'S') toggleSide();
      else if (k === 'n' || k === 'N') toggleNotes();
      else return;
      e.preventDefault();
    });

    const fromHash = () => {
      const m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash);
      return m ? [parseInt(m[1], 10) - 1, m[2] ? parseInt(m[2], 10) - 1 : -1] : null;
    };
    addEventListener('hashchange', () => {
      const h = fromHash();
      if (h && (h[0] !== index || h[1] !== beat)) go(h[0], { beat: h[1] });
    });

    /** 检查当前画面：遮挡、出框。shoot.mjs 会调用 */
    function audit() {
      const { width, height, zoom, boxes } = stage.debugBoxes();
      const all = boxes.slice();
      if (cover.classList.contains('is-on')) {
        const host = $('.dk-stage').getBoundingClientRect();
        const k = host.width / Math.max(1, $('.dk-stage').clientWidth) || 1;
        cover.querySelectorAll('.dk-cover__in > *').forEach((el, n) => {
          const r = el.getBoundingClientRect();
          all.push({ id: `cover${n}`, kind: 'cover', box: [(r.left - host.left) / k, (r.top - host.top) / k, (r.right - host.left) / k, (r.bottom - host.top) / k].map(R) });
        });
      }
      return { step: index + 1, beat: beat + 1, beats: beatCount(index), short: steps[index].short || '', zoom, width, height, issues: findIssues(all, width, height), boxes: all };
    }

    const start = () => {
      const h = fromHash();
      go(h ? h[0] : 0, { beat: h ? h[1] : -1 });
      api.ready = true;
    };
    const api = {
      go, next, prev, stage, audit, deck, ready: false,
      get index() { return index; },
      get beat() { return beat; },
      get count() { return steps.length; },
      beatCount,
    };
    global.__isoDeck = api;
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(start);
    return api;
  }

  global.IsoDeck = { mount, prepare, beatScene, findIssues, UI };
})(window);
