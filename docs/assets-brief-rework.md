# 素材返工单（发给 Codex，image-gen skill）

v2 批次 33 张已验收，大部分直接采用。只返工两项：

## 1. raytally 皮肤重画（4 张：2 构图 × 亮暗）

**旧概念作废**：柱状图/图表意象错了——RayTally 不是分析工具。它的品牌概念是**萤火虫 = 正在发亮的机会**，产品文案："每天收录正在发亮的机会——每天观察热门趋势和新品发布，收成可以动手做的产品灵感。"

**新概念：L 形 = 夜草地上的萤火虫罐**。竖臂（左上 2 格）是一只玻璃罐（罐口朝上，有软木塞或敞口都行），罐里 2-3 只发亮的萤火虫——已经"收录"的机会；横臂（底部 3 格）是夜色草地，草叶剪影之间还有几只自由飞舞的萤火虫亮点——尚未收成的机会。叙事就是"每天收集发光的东西"。黄绿色系（#d9f24e 基调），夜草地偏深、萤火虫是最亮的元素。

其余约束与 v2 任务书相同：L 形占格 (1,1)(1,2)(2,2)(3,2)、每格 24×24 逻辑像素、10 倍最近邻导出、透明底、二值 Alpha、名牌带区域（横臂中部）纹理留白、亮色版整体明快（草地用亮色调处理）/ 暗色版底压暗 + 萤火虫强自发光（对照 docs/reference/m2.png）。

命名：`raytally-light-1/2.png`、`raytally-dark-1/2.png`，存到 `/Users/ruochen/workspace/aix4u/public/skins/_candidates/`（覆盖旧文件）。

## 2. og-image 重做（2 张）

以已交付的 **og-image-1 的构图为基底**（左侧大号白色描边 AIX4U 像素 logo + 右侧 2-3 个带图标的彩色骨牌 + 拖尾 + 灰蓝网格底），只改副标题文案：

> ~~indie products, dropping like tetrominoes~~
> **indie products by Ruochen**

字体与排版保持 og-image-1 的像素风格，一行放下。尺寸 1200×630 不透明。命名 `og-image-3.png`、`og-image-4.png`，存到 `/Users/ruochen/workspace/aix4u/public/icons/_candidates/`。

## 不要动的

其余素材均已定稿采用，不要重新生成：meikyu（选 1 号）、ahr999（选 1 号）、x2markdown（选 1 号）、health-analyst（选 2 号）、favicon-1、next-crate-1、github-1、kshift-1、x-twitter-1。不要修改任何代码文件。
