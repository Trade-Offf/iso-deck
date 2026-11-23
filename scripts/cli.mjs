#!/usr/bin/env node
// iso-deck 命令入口
const COMMANDS = {
  new: ['./new-deck.mjs', '从模板新建 deck'],
  validate: ['./validate.mjs', '检查数据：引用、数字台账、镜头参数'],
  shoot: ['./shoot.mjs', '逐页截图并检查遮挡 / 出画；也能录 GIF、MP4'],
  build: ['./build-single.mjs', '打包成一个可以直接发给别人的 HTML'],
  serve: ['./serve.mjs', '本地 http 服务（录屏用）'],
  playbook: ['./playbook.mjs', '生成 oil-studio 录屏剧本'],
  install: ['./install.mjs', '装成本机 Agent 的 Skill'],
  gallery: ['./build-gallery.mjs', '重新生成仓库的 docs/ 示例画廊（维护者用）'],
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '-h' || cmd === '--help' || !COMMANDS[cmd]) {
  if (cmd && !COMMANDS[cmd] && !cmd.startsWith('-')) console.log(`没有命令 ${cmd}\n`);
  console.log('用法：iso-deck <命令> [参数]\n');
  for (const [k, [, d]] of Object.entries(COMMANDS)) console.log(`  ${k.padEnd(9)} ${d}`);
  console.log('\n每个命令加 --help 或不带参数可看详细用法。');
  process.exitCode = cmd && !COMMANDS[cmd] ? 1 : 0;
} else {
  try {
    const mod = await import(COMMANDS[cmd][0]);
    const code = await mod.run(rest);
    if (typeof code === 'number') process.exitCode = code;
  } catch (e) {
    console.error(`✗ ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exitCode = 1;
  }
}
