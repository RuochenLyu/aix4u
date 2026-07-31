# Adding a product / 新增产品流程

每次 ship 一个新产品，让它作为一块新骨牌掉进 aix4u.com。整个流程四步，通常一次会话内完成。以下同时是给人和给 AI 协作者（Claude / Codex）的操作规程。

## Step 1 — 定身份（设计决策，人来拍板）

在 [DESIGN.md](DESIGN.md) §3.1 的表格里新增一行，决定：

| 决策 | 规则 |
|---|---|
| **形状** | 从未占用的 tetromino 里选（当前空闲：J、Z）。**形状必须有语义**——几何本身要能讲这个产品的故事（先例：L=罐子立在草地、S=波浪、I=纸带、O=对折页、T=门）。产品多于 7 个后允许复用形状，优先让低优先级产品让出 |
| **皮肤概念** | 一句话讲清整块骨牌是什么画面。参考品牌已有资产（logo/图标/主色），但不是把 logo 贴上去，而是把产品的**功能故事**画成一块地皮/物件 |
| **accent / accentDark** | 从产品品牌色取；检查与现有五色不撞车（亮暗两主题下都要可区分） |
| **face preset** | keeper / collector / watcher / mascot / calm 五选一，或在 content.ts 新增 preset。性格要和产品气质、和 motion 一致 |
| **motion preset** | 同上：落法即性格 |
| **priority** | 决定悬空/落床。数字越小越靠前 |

## Step 2 — 写文案（Claude 的活）

按 DESIGN §8 的 voice rules 写三层文案，全部进 `src/data/products.json`：

- `tagline`（信息面板 flavor line）：动词开头、≤7 词、说"你得到什么"不说品类、禁 "AI-powered" 类填充词
- `description`（JSON-LD/meta 用长描述）：一两句，事实性
- `kind` / `status` chip：如 `MACOS · FREE`

先调研产品本体（读它的仓库/官网/README），文案基于事实，不编造。

## Step 3 — 出皮肤（Codex 的活，用 image-gen）

用 [assets-brief-template.md](assets-brief-template.md) 生成任务书发给 Codex。关键约束（模板里已固化）：

- 画布 = 形状占格 × 240px，透明底、二值 Alpha、严格形状遮罩、最近邻硬像素
- **无格线、无描边、无 bevel、无脸**——这些全部由网页代码绘制
- 亮暗两版；脸部安静区坐标由站点侧提供（按 face 锚点换算，格内矩形 ~110×100px）
- 每版 2 候选，交付到 `public/skins/_candidates/`，站点侧选型后转成无损 webp（用仓库自带的 sharp：`node -e "require('sharp')('in.png').webp({lossless:true}).toFile('out.webp')"`）放到 `public/skins/<id>-{light,dark}.webp`

## Step 4 — 接线与验收（一条 JSON + 构建自检）

1. `src/data/products.json` 的 `items` 里加一条（照抄任意现有产品的字段结构；`face` 锚点避开皮肤关键特征）。外链默认自动带 `?ref=aix4u`，商店类链接加 `"noRef": true`。
2. `npm run build` —— schema 校验、3200 场景布局断言（含硬降重放）、链接校验会替你把关：坏 hex、锚点越界、缺 rel/ref 都会直接失败。
3. 浏览器过一遍：亮暗两主题、掉落、hover 信息面板、移动端一屏。
4. HUD 的 `COLLECTED` 计数、sitemap、JSON-LD ItemList 全部从 JSON 派生，无需手动更新。

> 例：正在路上的 **Pluck**（macOS 抠图 app）——形状候选 J 或 Z；皮肤概念方向：一张照片的主体被"拔"出来、背景格子化透明（棋盘格 = 透明的通用符号，天然像素友好）；tagline 方向：`Pluck the subject, drop the background`。到 Step 1 拍板时定稿。
