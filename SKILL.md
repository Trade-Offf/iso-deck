---
name: iso-deck
description: 把口播稿、汇报提纲或系统说明做成会动的等距图解 PPT（单个 HTML，双击即可演示）：流程一层层长出来，镜头推到正在讲的地方，数字有出处。用于向上汇报、系统/流程讲解、技术分享、录成讲解视频。用户说“做成动态图解”“做成等距动画 PPT”“像那份翻译汇报一样做一份”“把这份稿子做成会动的图”时使用。
---

# iso-deck：动态等距图解

产物是一个 HTML 文件：左边舞台是等距视角的流程图，翻页时同一个东西平滑移动、变色、改状态；右边讲稿区放要点；`N` 打开提词。打包后双击就能演示，可以直接发给别人。

好看只是表面。这份 PPT 能说服人，靠的是四件事。每一步都要守住：

1. **讲的顺序**：先让听众看懂现在的流程，再说改哪一段、怎么改、效果如何。
2. **画面连续**：一张全景图贯穿始终，每页只改其中一部分，听众不会迷路。
3. **数字可信**：页面上的每个数字都能说出出处。
4. **能改**：改一句稿子、换一个数字，不用重画。

## 工作流程

### 1. 先问清三件事（缺了就问，不要猜）

- **讲给谁听、要他们做什么决定**：老板批资源？新同事上手？外部分享？
- **讲多久**：决定页数，大约每分钟 1 页，节拍多的页算 2 页。
- **素材**：口播稿、会议记录、数据表、系统文档。数字必须有来源，没有来源就问用户要，不要编。

### 2. 选模板

读 `references/templates.md`，按场景挑一个：

| 场景 | 模板 | 主线 |
| --- | --- | --- |
| 向上汇报、项目复盘 | `report` | 现在的流程 → 改哪一段 → 怎么改 → 效果 |
| 讲解系统、新人入职 | `system` | 全景导览 → 主流程 → 故障场景 → 总结 |

```bash
node <skill目录>/scripts/cli.mjs new <目标目录> --template report --title "标题"
```

这会复制模板和引擎到目标目录，打开 `index.html` 就能看。

### 3. 整理稿子

读 `references/script-cleanup.md`。要点：

- 去掉口误、重复、语气词，**保留**每一个数字、条件和结论。
- 一页只讲一件事。原话放 `notes`（提词），讲稿区 `body` 只放 1–3 条要点。
- 一页里要逐块讲的内容，拆成 `beats`（页内节拍），不要拆成很多页。

### 4. 写数据：模型、故事、台账分开

读 `references/scene-api.md`（字段手册）和 `references/facts.md`。

- `deck.model`：全景图里有什么、谁连着谁，坐标**只写一次**。
- `steps[].scene`：每页按 id 引用模型。`entities: ['a', 'b']` 原样取用；`{ b: { dim: 1 } }` 只改状态。
- `deck.facts`：`{ key: { value, source } }`。页面里一律写 `{key}`，不要硬写数字。
- `steps[].beats`：`[{ say, focus: ['id'], zoom, card }]`，最后一拍不带 `focus`，回到全景。

### 5. 检查 → 截图 → 修 → 再检查

```bash
node <skill目录>/scripts/cli.mjs validate <deck目录>   # 数据检查，任何 Node 版本
node <skill目录>/scripts/cli.mjs shoot <deck目录>      # 逐页截图 + 遮挡检查，需要 Node 22+ 和 Chrome
```

- `validate` 有 ✗ 必须修。! 是提醒，要逐条判断：硬写的数字、比例悬殊的柱子、缺提词。
- `shoot` 会输出 `shots/index.html` 总览页和 `report.json`。**一定要亲自看截图**：报告只能发现框和框的重叠，看不出“讲的东西不在画面中心”这类问题。
- 布局怎么调看 `references/layout-rules.md`，镜头怎么推看 `references/camera-judgment.md`。
- 重复到 `shoot` 没有 ✗、截图里每页的重点都清楚为止。

### 6. 交付

```bash
node <skill目录>/scripts/cli.mjs build <deck目录>      # → <deck目录>/dist/<名字>.html
```

把 `dist/` 里的单个 HTML 交给用户，告诉他：

- 双击打开；`→` 或空格翻页，`N` 打开提词，`F` 全屏，地址栏 `#5` 跳到第 5 页，`#5.2` 跳到第 5 页第 2 拍。
- 每个数字的出处都在 `deck.facts` 里，被追问时可以答。

需要录视频时读 `references/video.md`：用 `shoot --gif/--mp4` 直接出动图，或用 `playbook` 生成 oil-studio 录屏剧本。

## 必须遵守

- **不编数字**。没有来源就留 `?` 并问用户。示例数据要在 `source` 里写“示例数据”。
- **不要按比例画差距悬殊的柱子**。比如 ¥292 对 ¥1.1：小的那根会压扁到看不见。差距超过 10 倍时改用文字或标签对照。
- **一页最多一个新概念**。新实体一次出现 3–4 个以内，多了就拆页或拆拍。
- **每页开头、结尾都停在全景**。推近只为了看清正在讲的那一块，讲完就拉回来。
- 改完任何坐标都要重新 `shoot` 并看图，不要凭想象判断位置。
- 对外分享前去掉内部信息：公司名、内部系统名、真实业务数字、客户名。

## 文件

```
engine/       引擎：iso-stage.js（舞台）、iso-deck.js（PPT 外壳）、iso.css
templates/    report.html、system.html
examples/     ai-translation（汇报）、order-flow（系统讲解），数字都是示例数据
references/   templates · script-cleanup · scene-api · facts · layout-rules · camera-judgment · video
scripts/      cli.mjs 及各子命令
```

引擎零依赖，deck 里只引用 `engine/` 下的三个文件。
