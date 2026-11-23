#!/usr/bin/env node
// 本地静态服务：录屏工具只接受 http 地址时用。
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.mp4': 'video/mp4', '.woff2': 'font/woff2' };

export function serve(root = '.', port = 4178) {
  root = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      let p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (p !== root && !p.startsWith(root + sep)) throw new Error('forbidden');
      if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

export async function run(argv) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string', short: 'p' } } });
  const port = values.port ? +values.port : 4178;
  await serve(positionals[0] || '.', port);
  console.log(`✓ http://127.0.0.1:${port}/  （Ctrl+C 停止）`);
  return new Promise(() => {});
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await run(process.argv.slice(2));
