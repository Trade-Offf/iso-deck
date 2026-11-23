// 启动本机 Chrome / Edge / Chromium 的无头模式，并用 DevTools 协议控制页面。需要 Node 22+（内置 fetch 和 WebSocket）。
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const mac = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ];
  const win = [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  for (const p of process.platform === 'darwin' ? mac : process.platform === 'win32' ? win : []) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch {}
  }
  throw new Error('没找到 Chrome / Edge / Chromium。装一个，或者用环境变量 CHROME_PATH 指定路径。');
}

export async function launch({ width = 1600, height = 900, scale = 1 } = {}) {
  if (typeof WebSocket === 'undefined') throw new Error(`截图需要 Node 22 或更高版本，当前是 ${process.version}`);
  const profile = mkdtempSync(join(tmpdir(), 'iso-deck-chrome-'));
  const proc = spawn(
    findChrome(),
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio',
      `--user-data-dir=${profile}`, '--remote-debugging-port=0', `--window-size=${width},${height}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try {
      port = parseInt(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10);
    } catch {}
  }
  if (!port) {
    proc.kill();
    throw new Error('Chrome 没有启动成功');
  }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method && listeners.has(msg.method)) for (const fn of listeners.get(msg.method)) fn(msg.params);
  };
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++seq;
      pending.set(id, { ok, fail });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) =>
    new Promise((ok) => {
      const fn = (p) => {
        listeners.get(method).delete(fn);
        ok(p);
      };
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(fn);
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const navigate = async (url) => {
    const loaded = once('Page.loadEventFired');
    await send('Page.navigate', { url });
    await loaded;
  };
  const waitFor = async (expression, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression).catch(() => false)) return true;
      await sleep(80);
    }
    throw new Error(`等待超时：${expression}`);
  };
  const screenshot = async (format = 'png', quality) => {
    const r = await send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}) });
    return Buffer.from(r.data, 'base64');
  };
  const close = async () => {
    try {
      ws.close();
    } catch {}
    proc.kill();
    await sleep(150);
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, evaluate, navigate, waitFor, screenshot, close, sleep };
}

export { sleep };
