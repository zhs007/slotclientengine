# 98 game layout editor bootstrap 执行报告

## 结论

任务 98 已完成代码实现与自动化验收。新增的 `apps/gamelayouteditor` 是纯浏览器静态应用，最终只依赖 `@slotclientengine/rendercore`、Pixi.js 和 fflate；不依赖或修改 `uiframeworks`、gameframeworks、netcore、session、WebSocket、后端或浏览器持久化。

执行期间根据实际试用反馈收紧了交互：

- 图片背景上传并完成真实尺寸解码后，右侧立即预览。
- Spine 背景优先读取 skeleton 中有限正数 `width/height`；资源没有 bounds 时才需要在高级区填写。
- 新项目主转轮默认 `5 x 3`、cell `160 x 160`、gap `0`。
- 背景可用后自动把主转轮居中，并以四边默认外扩 `60` 生成 focus；靠近 art 边界时在 art 内封顶。
- focus 输入使用相对主转轴四边的 `left/top/right/bottom`，默认 `-60/-60/60/60`；预览和导出派生绝对 `focusRect`，导入已有 manifest 时反算相对值。
- 预览分辨率现按真实游戏链路处理：rendercore 先从物理 page size 派生 `frameDesignSize/cssSize/offset`，再以逻辑 frame size 计算 Pixi art viewport；game002 使用 `maximized-focus`，game003 使用 `orientation-focus` 并显示真实黑边，不引入 uiframeworks 依赖。
- 编辑器字段提交重建表单时会按稳定 key 恢复所有已展开高级区；壳层固定为视口高度，左侧配置独立滚动，右侧预览不再被大量图层内容向下或向高处撑开。
- rendercore parser 最终硬性要求每个 variant 的 focus 完整包含 reel。
- 常用区只暴露背景、列数和行数；art/focus、cell/gap/position、project id 收进高级折叠区。
- 双背景项目只完成一侧时，可先用该侧生成严格的临时单 variant manifest 预览；另一侧缺失仍会禁止最终导出。
- 编辑过程允许不完整 draft；严格完整校验只卡导出和 production manifest，不再无条件清空已有可用预览。

最后的浏览器交互验收按用户要求未代做，状态保持“待用户验收”。

## 基线与用户输入保护

- branch：`main`
- HEAD：`f654ac0da4dca9d4bcda3b8b397b6e38c12c8e52`
- 未创建分支、未提交、未暂存。
- 未执行 reset、checkout、stash、clean 或覆盖用户资源。
- 执行前已有的 `assets/game003-s1/bg1.jpg`、`mainreelbg.png` 修改保持不变。
- 执行前已有的 `bgco/bgcobk/major/majorbk/mega/megabk/mini/minibk/minor/minorbk.png` 未跟踪文件保持不变；本任务只在等价 fixture 中引用同类 layer，不接入 game003 production 配置。
- 真实尺寸仍为：`bg1.jpg 2000x1125`，当前 YAML 声明 `2000x2000`；`mainreelbg.png 1057x793`，当前 YAML 声明 `1130x824`。这是用户美术刷新中的已知漂移，本任务未擅自修改 YAML 或图片。

## 最终 ownership 与依赖

```text
apps/gamelayouteditor
  UI、draft/store、浏览器 File/Blob、zip、安全限制、渐进预览

packages/rendercore/scene-layout
  strict schema/parser、asset closure、viewport、node/reel geometry、Pixi/Spine runtime

packages/rendercore/reel
  columnGap/rowGap 的真实 runtime 几何

packages/uiframeworks
  本任务零改动、编辑器零依赖
```

编辑器 preview 尺寸直接作为游戏 scene viewport，Vite `base` 为 `./`。最终 bundle 和 dev module chain 均未出现 `SlotcraftClient`、netcore 或 uiframeworks。

## Scene layout v1

新增公共能力：

```ts
parseSceneLayoutManifest(value)
collectSceneLayoutAssetPaths(manifest)
createSceneLayoutResource(options)
loadSceneLayoutResourceFromUrl(options)
createSceneLayoutFramePolicy(manifest)
resolveSceneLayoutViewport(options)
resolveSceneLayoutReelGrid(manifest, reelId, variantId)
createSceneLayoutRuntime(options)
```

实现内容：

- recursive unknown-key rejection、deep freeze、variant/node/order/path/bounds/reference 校验。
- 单背景 `maximized-focus` 与横竖双背景 `orientation-focus`。
- background 必须为对应 variant 最低 order；reel 必须位于 art 内且完整包含在 focus 内。
- 精确资源闭包，无宽泛 glob/fallback；CDN loader 拒绝绝对 URL、origin/path 逃逸、非 2xx、错误 JSON、尺寸漂移和缺资源。
- image 与 official Spine 4.3 node；default animation 大小写精确。
- 稳定 named Container、`getNode()`、`attachChild()`、`attachRelative(before/after)`、`getReelGrid()`。
- 一个 art mask；variant 切换复用 node/player 并保留 Spine 时间轴。
- 初始化失败、异步过期请求、资源替换和 destroy 都有回滚/释放。

## Reel gap

- 普通 reel 增加 `rowGap`，缺省 `0`。
- grid-cell reel 增加 `columnGap/rowGap`，缺省 `0`。
- stride、visible rect、mask、symbol center、effect、cascade、selective refill 和 geometry snapshot 统一使用真实 gap。
- game002 显式 `0/0`；game003 显式 `15/0`。
- 非零 x/y gap 已有回归测试；旧 gap=0 行为保持兼容。

## 编辑器、导入与导出

- Vite + TypeScript + Pixi v8，纯静态 CDN 子路径部署。
- 表单修改，不允许 canvas 拖动回写配置。
- 预设/自定义 preview 尺寸、resize handle、zoom、focus/reel/cell guide 和诊断。
- zoom 仅改变 CSS 显示比例，不参与 rendercore 坐标。
- image/Spine background 和普通 layer，order、x/y、统一 scale、方向 visibility、exact Spine loop animation。
- stale async validation/runtime 请求不会覆盖更新的 preview。
- zip import 成功后原子替换；失败保留原项目并释放临时 URL/resource。
- fflate streaming Unzip：256 entries、50 MiB 压缩包、20 MiB 单文件、100 MiB 总解压上限。
- 只允许小写 ASCII POSIX 相对路径；拒绝 zip-slip、绝对路径、反斜杠、重复/collision、额外/缺失文件。
- export 使用稳定 JSON、固定 zip 时间和原始图片 bytes，支持 export -> import round-trip。

## 等价 fixture

- game002：`2000x2000`、focus `580,277,840,1200`、reel `6x9`、cell `120x120`、gap `0/0`；真实 `BG.json/BG.atlas` 验证 exact `BG` loop，错误大小写失败。
- game003：orientation-focus、reel `5x5`、cell `165x130`、gap `15/0`；横竖背景、conveyor 单侧可见和新增 jackpot layer 均被覆盖。
- fixture 只证明 schema/runtime 表达能力，没有迁移或覆盖 game002/game003 production scene layout。

## 自动化验收

最终执行结果：

- 根 `pnpm lint`：24/24 成功。
- 根 `pnpm typecheck`：24/24 成功。
- 根 `pnpm test`：24/24 成功。
- 根 `pnpm build`：24/24 成功。
- `@slotclientengine/rendercore`：49 files、304 tests 全通过；coverage statements 87.98%、branches 80.22%、functions 93.68%、lines 88.22%。
- `gamelayouteditor`：8 files、31 tests 全通过；coverage statements 86.94%、branches 73.8%、functions 88.04%、lines 89.58%。
- game002：18 files、95 tests 全通过。
- game003：27 files、135 tests 全通过。
- editor、rendercore、game002、game003 的 lint/typecheck/test/build/format:check 均通过。
- `git diff --check` 通过，无 `_tmp_*` 残留。

根 `pnpm format:check` 未通过：Turbo 首个失败为本任务未修改的 `apps/reelsviewer` 既有 16 个格式文件，并提前终止其它任务。没有为了让根命令变绿而格式化或改写范围外文件；本任务涉及包的独立格式门禁均通过。

沙箱内运行 netcore WebSocket 测试时曾因 localhost bind 限制出现超时；允许本地监听后 netcore 6 files、79 passed、1 skipped，随后完整根测试 24/24 通过。这不是代码失败。

## HTTP 与模块链验收

- 最新 `dist/index.html` 在 `/gamelayouteditor/dist/` 非根路径返回 HTTP 200。
- HTML 引用的 1 个入口 JS、10 个 modulepreload JS 和 1 个 CSS 均返回 HTTP 200。
- 最新入口 JS 约 308.0 KiB，CSS 约 4.2 KiB。
- Vite dev 的 `/src/main.ts`、`/src/ui/app-shell.ts`、`/src/preview/layout-preview.ts` 均成功转换；app-shell 直接导入 `/packages/rendercore/src/scene-layout/index.ts`。
- 源码、package、Vite config、dev module chain 与 dist 扫描均无 `SlotcraftClient`、netcore 或 uiframeworks。
- 用户先前遇到的 `netcore/dist/index.js does not provide an export named SlotcraftClient` 已从依赖根因上消除；最终方案不是增加 uiframeworks 子入口，而是完全移除编辑器对 uiframeworks 的依赖。
- 首轮上传图片后出现的 `Cannot read properties of null (reading 'source')` 已定位为 Pixi 无法从无扩展名 `blob:` URL 自动选择 loader、`Assets.load(url)` 返回 null。scene image runtime 现对 Blob URL 显式使用 `loadParser: "loadTextures"`，并在空 texture 上先抛 scene-layout 领域错误；新增对应回归测试。

## 浏览器人工验收（待用户）

运行：

```bash
pnpm --filter gamelayouteditor dev -- --host 0.0.0.0
```

请重启旧 dev 进程并硬刷新，避免旧 Vite module cache。建议逐项确认：

1. 新建单背景后只上传一张图片，右侧立即显示；默认 reel 为 `5x3`，focus 包住 reel 且四边默认外扩 60。
2. 改 columns/rows 或高级 reel position/cell/gap，focus guide 自动重新包住 reel。
3. 双背景先只上传 landscape，右侧先显示 landscape；portrait 缺失时导出仍明确失败。再上传 portrait 后按页面方向切换且不串背景。
4. game002 等价 Spine `BG` 在横/竖/方/近方尺寸持续 loop。
5. 图层 order/x/y/scale 与 conveyor 单侧 visibility 生效；canvas 拖动不改数据。
6. zoom 只改变显示大小，viewport/visibleRect/worldOffset 诊断不变；修改 preview size 时诊断变化。
7. export、刷新、重新 import 后画面和数据一致；`minibk` after 数字 resize/切方向仍对齐。
8. 在非根静态 HTTP 路径加载 dist，Network 无 API/WS、无 uiframeworks/netcore/SlotcraftClient 错误。

这些浏览器项未在本报告中标记为通过。

## 文件

新增：

- `apps/gamelayouteditor/**`
- `packages/rendercore/src/scene-layout/**`
- `packages/rendercore/tests/scene-layout/**`
- `docs/scene-layout-manifest.md`
- 本报告

修改：

- `packages/rendercore/package.json`、`src/index.ts`、README
- `packages/rendercore/src/reel/**` 与对应测试
- `apps/game002/src/cascade-sequence.ts`、`game-demo.ts`、`game-layout.ts`
- `apps/game003/src/game-layout.ts`
- `docs/background-adaptation.md`
- `agents.md`
- `pnpm-lock.yaml`
- `tasks/98-game-layout-editor-bootstrap.md`（记录用户收紧后的最终合同）

删除：无。

## 已知限制与后续建议

- 本任务不自动迁移 game002/game003 production 配置；建议在浏览器验收完成后另开任务逐游戏切换。
- v1 只配置 Spine default loop，不编辑任意状态机。
- Spine skeleton 没有有效 bounds 时仍需在高级区填写 art size；不猜测 texture/page 尺寸作为 art 合同。
- browser File/Blob 和 zip 全在内存中，受明确大小上限约束；无自动保存、撤销历史或在线素材库。
- game003 当前工作树美术与 YAML 尺寸漂移仍需由美术/配置负责人确认后单独处理。
