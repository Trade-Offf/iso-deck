#!/usr/bin/env node
// 把这个仓库装成本机 Agent 的 Skill：Cursor、Claude Code、Codex 等。
import { existsSync, mkdirSync, cpSync, rmSync, symlinkSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = 'iso-deck';
const ITEMS = ['SKILL.md', 'README.md', 'README.en.md', 'LICENSE', 'package.json', 'engine', 'references', 'scripts', 'templates', 'examples'];

export const AGENTS = {
  cursor: join(homedir(), '.cursor'),
  claude: join(homedir(), '.claude'),
  codex: join(homedir(), '.codex'),
  agents: join(homedir(), '.agents'),
};

/** 返回装好的目录列表 */
export function install({ agents, dir, link = false } = {}) {
  const targets = dir
    ? [resolve(dir)]
    : (agents && agents.length ? agents : Object.keys(AGENTS).filter((a) => existsSync(AGENTS[a]))).map((a) => {
        if (!AGENTS[a]) throw new Error(`不认识 ${a}，可选：${Object.keys(AGENTS).join(' / ')}`);
        return join(AGENTS[a], 'skills', NAME);
      });
  if (!targets.length) throw new Error('没找到 ~/.cursor、~/.claude、~/.codex 或 ~/.agents。用 --dir 指定 skills 目录');
  for (const t of targets) {
    if (resolve(t) === ROOT) continue;
    if (existsSync(t) || isLink(t)) rmSync(t, { recursive: true, force: true });
    mkdirSync(dirname(t), { recursive: true });
    if (link) {
      symlinkSync(ROOT, t, 'dir');
      continue;
    }
    mkdirSync(t, { recursive: true });
    for (const item of ITEMS) {
      const src = join(ROOT, item);
      if (existsSync(src)) cpSync(src, join(t, item), { recursive: true, filter: (p) => !/[/\\](shots|dist|node_modules)([/\\]|$)/.test(p) });
    }
  }
  return targets;
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function run(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { agent: { type: 'string', multiple: true }, dir: { type: 'string' }, link: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) {
    console.log(`用法：iso-deck install [--agent cursor|claude|codex|agents]... [--dir <skills 目录>] [--link]
  默认装到本机已有的 Agent 目录下的 skills/${NAME}
  --link  用软链接代替复制（改仓库立刻生效，适合开发）`);
    return 0;
  }
  const done = install({ agents: values.agent, dir: values.dir, link: values.link });
  for (const t of done) console.log(`✓ ${t}`);
  console.log(`\n在 Agent 里说“用 ${NAME} 把这份稿子做成动态图解”就能用。截图检查需要 Node 22+ 和 Chrome。`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run(process.argv.slice(2));
