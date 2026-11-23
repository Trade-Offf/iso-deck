# 录成视频

两种做法：直接出 GIF / MP4（快，没有声音），或用 oil-studio 录屏（带字幕、可配音、可剪辑）。

## 直接出 GIF / MP4

需要 Node 22+、Chrome、ffmpeg（macOS：`brew install ffmpeg`）。

```bash
node scripts/cli.mjs shoot <deck目录> --gif demo.gif --steps 2-5 --hold 2600 --width 960
node scripts/cli.mjs shoot <deck目录> --mp4 demo.mp4 --hold 3000 --width 1600
```

- 按真实动画翻页并连续截帧：每页先停在全景，再走完它的节拍。
- `--hold`：每一拍停留多少毫秒（默认 2600）。
- `--fps`：截帧频率（默认 12）。GIF 用 10–12 足够，MP4 会补到 30 帧。
- `--width`：输出宽度。README 里的动图用 960，体积控制在几 MB。
- GIF 适合放 README、发群；MP4 适合发正式场合。

## 用 oil-studio 录屏

oil-studio 是一个 macOS 录屏剪辑工具，它的 Skill 能按剧本（Playbook）自动操作浏览器并录屏。

1. 起一个本地服务（oil-studio 只接受 http 地址）。服务根目录要能同时访问到 deck 和它引用的 `engine/`：用 `new` 建的 deck 自带 `engine/`，直接服务 deck 目录；仓库里的示例引用 `../../engine/`，要服务仓库根目录。

   ```bash
   node scripts/cli.mjs serve <deck目录> --port 4178                 # url 用 http://127.0.0.1:4178/
   node scripts/cli.mjs serve . --port 4178                          # 示例：url 用 http://127.0.0.1:4178/examples/agent-autoloop/
   ```

2. 生成剧本。每句口播（`notes` 的每个元素、每个节拍的 `say`）是一拍；翻页的那一拍先按 `→`，等 1.4 秒过渡，再按字数留出讲话时间（每字约 230 毫秒，最少 2.5 秒）。

   ```bash
   node scripts/cli.mjs playbook <deck目录> --url http://127.0.0.1:4178/ --subtitles -o playbook.json
   ```

3. 先空跑一遍，确认剧本合法：

   ```bash
   python3 -B ~/.claude/skills/oil-studio/scripts/record_playbook.py --playbook playbook.json --dry-run
   ```

4. 交给 oil-studio 的 Skill 录制、加字幕、导出。镜头推近已经在 deck 的 beats 里做了，录屏时不用再加缩放。

## 录之前

- 提词要像说话：录视频时 `notes` 就是字幕，写得太书面会很别扭。
- 讲稿区要不要露出来：观众只看视频时，可以按 `S` 隐藏讲稿区，或在 step 上写 `side: false`。
- 语速快的人用 `--ms-per-char 180`，慢的用 `260`。
