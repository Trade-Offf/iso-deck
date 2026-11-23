# 字段手册

## 页面骨架

```html
<link rel="stylesheet" href="./engine/iso.css" />
<div id="app"></div>
<script src="./engine/iso-stage.js"></script>
<script src="./engine/iso-deck.js"></script>
<script>
  const { block, db, crowd, zone, note, link, hot, idle, down } = Iso.h;
  IsoDeck.mount('#app', deck, { stage: { zoomMax: 2 } });
</script>
```

`mount` 的第三个参数：`stage` 传给舞台（如 `zoomMax`），`hash: false` 不同步地址栏，`onChange(index, step, beat)` 翻页回调。

快捷键：`← →` / 空格 / 翻页笔翻页（有节拍时先走完节拍），`Home` `End`，`F` 全屏，`P` 暂停数据包，`R` 重播本页，`S` 隐藏讲稿区，`N` 提词抽屉。地址栏 `#3` 到第 3 页，`#3.2` 到第 3 页第 2 拍。

## deck

```js
{
  title, subtitle, icon,            // 左上角品牌区
  lang: 'zh',                       // 界面文字：'zh'（默认）或 'en'
  ui: { next: 'Next' },             // 单独改某几个界面文字（覆盖 lang 的预设）
  size: [1600, 900],                // 设计画布，自动等比缩放
  sideWidth: 320,                   // 讲稿区宽度
  legend: ['req', 'write', 'push', 'fail'],
  metrics: [{ key: 'cost', label: '每百条成本', icon: 'chart' }],  // 顶部指标条
  metricsBar: false,                // 全局关闭指标条，在个别页写 true 打开
  model: { entities, links },       // 流程模型，见下
  facts: { key: { value, source } },// 数字台账，见 facts.md
  steps: [ /* 每一页 */ ],
}
```

## model：坐标只写一次

```js
model: {
  entities: { dev: block(2, -30, { label: ['开发'] }), keys: db(2, -10, { label: 'key 表' }) },
  links: { dk: link('dev', 'keys', { label: '定义 key' }) },
}
```

页面里按 id 引用：

| scene 里写 | 含义 |
| --- | --- |
| `entities: ['dev', 'keys']` | 原样取用模型里的这两个 |
| `entities: { dev: true }` | 同上 |
| `entities: { dev: { dim: 1, tags: [...] } }` | 取模型里的 dev，只改这几个字段 |
| `entities: { x: block(0, 0, {...}) }` | 带 `type` 的完整对象：本页独有，不查模型 |
| `links: { dk: { style: 'muted' } }` | 连线同理；带 `from` 的完整对象不查模型 |

不用 model 也可以，每页直接写完整对象，`validate` 不会报错。但改一个坐标要改很多处，所以多页共用同一张图时一定用 model。

## step：一页

| 字段 | 说明 |
| --- | --- |
| `short` | 步骤条上的短标题，也用于“下一步：xxx”按钮 |
| `title` | 讲稿区大标题，支持 `**粗体**`、`` `代码` `` |
| `body` | 段落数组；以 `<` 开头的按原始 HTML 插入（如表格） |
| `callout` | `{ kind: 'tip' \| 'insight' \| 'warn', text }` |
| `changes` | 本页变化，前缀 `+ ` 新增 / `~ ` 调整 / `- ` 移除 |
| `metrics` | `{ key: 值 }`，省略则沿用上一页 |
| `badge` | 讲稿区右上角小标签 |
| `notes` | 口播提词（字符串或数组），`N` 打开 |
| `beats` | 页内节拍，见下 |
| `scene` | 舞台场景 |
| `cover` | 封面 / 章节页，见下 |
| `side: false` | 隐藏讲稿区，舞台全宽 |

`body` 里加粗统一用 `**`。同一段混用 `<b>` 时整段按 HTML 插入，`**` 不再生效。

### cover

```js
cover: {
  layout: 'split',                   // 左文右图，场景在右侧继续动
  kicker: '多语言翻译流程 · AI 提效汇报',
  title: '翻译成本<em>降一个数量级</em>',  // <em> 是强调色；不自动换行，用 <br>
  subtitle: '一两句说明',
  stats: [{ label: '每百条成本', value: '{cost_new}', from: '原来 {cost_old}' }],  // 值末尾的单位会自动变小字
  agenda: ['现在的流程', '改哪一段', '怎么改', '效果如何'],
}
```

split 封面的场景要用 `camera.at` 把图推到右半边：`at` 是屏幕中心对准的地面坐标，取在图的左下方，图就会往右移。

### beats：页内节拍

```js
beats: [
  { say: '第一道：机器校验。', focus: ['ai', 'check'], card: { title: '机器校验', lines: [...] } },
  { say: '第二道：人工审核。', focus: ['keys', 'lead'], zoom: 1.25 },
  { say: '两道关合起来：AI 起草，人做决定。' },   // 不带 focus：回到全景
]
```

| 字段 | 说明 |
| --- | --- |
| `say` | 这一拍讲什么，显示在提词抽屉里，录视频时当字幕 |
| `focus` | 推近到这些实体的中心；其余实体变暗，不相关的连线变淡、去掉文字 |
| `zoom` | 在本页全景倍数上再乘多少，默认 1.3，建议 1.2–1.35 |
| `at` | 手动指定镜头中心 `[x, y]` |
| `card` | 这一拍的信息卡；不写则这一拍不显示信息卡 |

翻页进入时先显示全景（第 0 拍），再按 `→` 逐拍推进。

## scene

```js
scene: {
  entities: { id: entity },
  links: { id: link },
  flows: [flow],
  card: { title, icon, lines, bars, corner },
  camera: { at: [x, y], zoom },   // 可选：手动镜头，跳过自动取景
  fit: { pad, zoomMax },          // 可选：自动取景参数
}
```

翻页动画是自动的，规则只有一条：**同一个 id 就是同一个东西**。两页都有的 id 平滑过渡；只在新页出现的从空中落下；只在旧页出现的淡出；新连线在两端就位后描画出来。

### 坐标

- 地面网格：`x` 往屏幕右下，`y` 往屏幕右上。投影 `iso(x, y, z) = [14(x+y), 7(x−y) − z]`，一格约 28×14 像素。
- 前后遮挡按 `x − y` 自动排序。
- 画面自动缩放居中，只需关心相对位置。相邻实体间隔 8–12 格。

### 实体

| 工厂函数 | 用途 | 主要参数 |
| --- | --- | --- |
| `block(x, y, o)` | 圆角立方体：服务、模块、人、柱状图 | `s` 边长(格) 默认 4，`h` 高(px) 默认 40，`color`，`glyph`，`label`（字符串或两行数组），`sub`，`pills: 'above' \| 'below'`，`radius` |
| `db(x, y, o)` | 圆柱：数据库、存储、队列 | `r` 半径(格)，`h`，`color`，`glyph`，`label`，`sub` |
| `crowd(rect, count, label, o)` | 人群底板 + 小人 | `rect = { x0, x1, y0, y1 }`，`count` 可补间增减 |
| `zone(rect, label, o)` | 虚线区域：层、团队、机房 | `tint` 底色 |
| `note(x, y, text, o)` | 漂浮便签 | `tone`，`icon`，`z` 离地高度 |

通用状态（数字，翻页平滑过渡）：`cpu: 0–1`（头顶 CPU 条，`-1` 不显示），`heat: 0–1`（红色脉冲），`dead: 0–1`（变灰 + 红叉），`dim: 0–1`（弱化），`tags: [{ text, tone, icon }]`（头顶标签），`opacity`，`lift`。

预设：`hot(cpu)`、`idle(cpu)`、`down('超时')`，展开进参数：`block(0, 0, { ...hot(0.9) })`。

- 颜色：`blue green orange yellow purple red gray slab`
- tone：`paper dark red green blue orange muted`
- 图标：`server database globe zap users user activity trendingUp flag info alert check x sparkles cpu cloud lock shield box layers message bot code file search gear balancer clock phone monitor chart key mail rocket target`

### link

```js
link('a', 'b')                                         // 直线
link('a', 'b', { label: '写回 · 待审' })
link('a', 'b', ['a', ['b', 'a'], 'b'], { style: 'dashed' })  // 折线
```

| 字段 | 说明 |
| --- | --- |
| `pts` | 途经点：实体 id（取中心）、`[x, y]`、或 `['a', 'b']`（取 a 的 x、b 的 y，画直角折线）；`'a+2'` 表示偏移 |
| `heads` | `'end'`（默认）/ `'both'` / `'none'` |
| `style` | `'solid'` / `'dashed'` / `'muted'` |
| `label`、`labelAt` | 文字与大致位置（0–1），引擎会在附近找不压东西的位置；`labelFixed: true` 固定 |
| `labelTone`、`labelIcon` | 文字气泡的色调和图标 |
| `fail: 0–1` | 到终点时按比例爆红叉 |

### flow：数据包

```js
{ route: ['ab'], rate: 6 }                        // 每秒 6 个
{ route: ['ab', 'bc'], rate: 2.4, kind: 'push' }  // 多段串联
{ route: ['ab'], rate: 2.4, bounce: true }        // 到达后原路返回
{ route: ['lb', ['a', 'b', 'c']], rate: 5 }       // 某一段轮询多条线
{ routes: [{ path: ['x'], weight: 3 }, { path: ['y'] }], pick: 'weights' }
{ routes: [...], fanout: true }                   // 广播
```

`kind`：`req` 橙圆（默认）、`write` 蓝方、`push` 绿圆、`msg` 黄方、`heavy` 紫大方块、`ping` 白小圆、`fail` 红。

### card：信息卡

```js
card: {
  title: '两道关', icon: 'shield',
  bars: [{ label: '现有工具', value: 1.2, text: '{cost_old}', tone: 'orange' }],  // 对比条，可选 max
  lines: ['① 占位符校验', '= 发布权仍在人手里'],
  corner: 'auto',   // 自动选不压画面的角；也可 'tr' 'br' 'tl' 'bl'
}
```

行前缀：`= ` 结论（加粗）、`# ` 提问（灰色斜体）、`+ ` 绿、`~ ` 橙、`- ` 红。

## 单独使用舞台

```js
const stage = new Iso.Stage(document.getElementById('stage'));
stage.goTo(scene1);   // 之后 stage.goTo(scene2) 自动过渡
// stage.replay() / stage.setPaused(true) / stage.goTo(s, { instant: true }) / stage.debugBoxes()
```

## 调试接口

页面加载后有 `window.__isoDeck`：`go(i, { beat, instant })`、`next()`、`prev()`、`audit()`（返回当前画面所有元素的框和遮挡问题）、`count`、`beatCount(i)`、`index`、`beat`、`ready`。`shoot` 就是用它截图的。
