# 67 rendercore vnicore symbol animation 执行报告

UTC 时间：`260701-041820`

## 1. 执行结论

任务 67 已按计划完成非浏览器部分：

- `packages/rendercore` 已新增共享 symbol manifest parser、manifest 驱动的 VNI symbol animation resource 解析和 VNI-backed `SymbolAni`。
- `packages/vnicore` 已支持 `autoTick: false` 和 `fitPadding`，供 rendercore 用游戏 ticker 手动推进 VNI player。
- `apps/symbolsviewer` 已新增 `game003-s1` symbol set，可通过同一套 rendercore manifest/VNI resolver 预览 `L1.win` VNI 动画。
- `apps/game003` 已通过 manifest、YAML VNI glob 和生成配置接入 `assets/game003-s1/L1-wins.json`，中奖流程仍只请求可见 symbol 进入 `win` 状态，不在 app 业务播放代码里硬编码 VNI。
- `game-static.generated.ts` 和 `game-loading.generated.ts` 已由 `apps/buildgamestatic` 重新生成并通过 `--check`。
- `agents.md`、相关 README 和本报告已同步。

浏览器验收按用户要求未执行，交给用户手动验收。

## 2. 主要改动

### 2.1 rendercore

- 新增 `packages/rendercore/src/symbol/manifest.ts`：
  - 解析 `symbol-state-textures.manifest.json`。
  - 读取 normal/state textures、layered normal、scale 和 optional `animations`。
  - 提供 `createSymbolAssetMapFromManifestModules`、`createSymbolScaleMapFromManifest`、`getSymbolDisplaySymbolsFromManifest`、`createSymbolVniAnimationResourcesFromManifest`。
  - 对未知字段、未知 state、缺 asset、非法 scale、非法 VNI project、非法 `stageRect`、缺 VNI asset 显式失败。
- 新增 `packages/rendercore/src/symbol/vni-animation.ts`：
  - 用 `@slotclientengine/vnicore/pixi` 的 `VNIPlayer` 渲染隐藏 canvas。
  - 以 manifest `stageRect` 裁剪成 Pixi overlay texture。
  - 由 `RenderSymbol.update(deltaSeconds)` 手动推进，避免 RAF 和游戏 ticker 双推进。
  - `destroy()` 释放 player、隐藏 DOM container、overlay sprite。
- `SymbolAni` 增加 optional `destroy()`；`RenderSymbol` 在状态切换和销毁时释放旧动画。
- `generate-symbol-state-textures.mjs` 重新生成 manifest 时保留仍有效的 `animations`，避免重生成状态贴图丢失 VNI 配置。
- `packages/rendercore/package.json` 新增 `@slotclientengine/vnicore: workspace:*`，`pnpm-lock.yaml` 相应增加 workspace link。

### 2.2 vnicore

- `VNIPlayerOptions` 新增：
  - `autoTick?: boolean`，默认 `true`；rendercore 传 `false` 后由宿主 ticker 调用 `update(...)`。
  - `fitPadding?: number`，默认保持旧 responsive padding；rendercore 传 `0` 保证 stage/canvas 像素坐标可用于显式 crop。
- 补充 `packages/vnicore/tests/pixi/vni-player.test.ts` 覆盖 host-driven playback 和 zero padding。
- 更新 README 和 `docs/api-zh.md`。

### 2.3 game003

- `assets/game003-s1/symbol-state-textures.manifest.json` 中新增 `L1.animations.win`：
  - `kind: "vni"`
  - `project: "./L1-wins.json"`
  - `stageRect: { x: 744, y: 744, width: 512, height: 512 }`
  - `playback: { mode: "range", startTime: 0, endTime: 2, loop: false }`
- `apps/game003/config/game-static.yaml` 新增 VNI project/assets loading 资源和 `symbols.vniProjectGlob` / `symbols.vniAssetGlob`。
- 生成物新增 VNI modules：
  - `apps/game003/src/generated/game-static.generated.ts`
  - `apps/game003/src/generated/game-loading.generated.ts`
- `apps/game003/src/assets.ts` 改为复用 rendercore manifest helper，不再保留 app-local parser。
- `apps/game003/src/skin-config.ts` 通过 manifest resolver 构建 symbol animation resolver。
- `game-adapter.ts` / `game-demo.ts` 仅接收 resolver，不写 `L1-wins`、`stageRect` 或 VNI 播放细节。

### 2.4 symbolsviewer

- `apps/symbolsviewer/src/symbol-assets.ts` 改为 rendercore helper 薄封装。
- `apps/symbolsviewer/src/symbol-set-config.ts` 新增 `game003-s1`，包含：
  - `assets/gamecfg003/gameconfig.json`
  - `assets/game003-s1/*.png`
  - `assets/game003-s1/*-wins.json`
  - `assets/game003-s1/assets/*.{png,jpg,jpeg,webp}`
- 新增测试覆盖 `game003-s1` set、scale、VNI project modules 和 VNI asset modules。

### 2.5 buildgamestatic / gameframeworks

- `apps/buildgamestatic` 支持 `symbols.vniProjectGlob` 和 `symbols.vniAssetGlob`：
  - 只允许明确目录下的 JSON project glob。
  - 只允许明确目录下的图片 asset glob。
  - 拒绝递归 `**`、根目录宽泛 glob、目录不存在和扩展名不匹配。
- `packages/gameframeworks/src/static-config` 增加 `vniProjectModules` / `vniAssetModules` 类型和运行时校验。

## 3. 非浏览器验收命令

以下命令最终均通过：

```bash
pnpm install
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 release:check
git diff --check
CI=true pnpm exec prettier --check agents.md packages/rendercore/README.md apps/symbolsviewer/README.md apps/game003/README.md apps/buildgamestatic/README.md packages/vnicore/README.md packages/vnicore/docs/api-zh.md
```

关键测试数量：

- vnicore：`12` files / `139` tests passed。
- rendercore：`23` files / `134` tests passed。
- buildgamestatic：`4` files / `16` tests passed。
- gameframeworks：`9` files / `31` tests passed。
- symbolsviewer：`2` files / `26` tests passed。
- game003：`16` files / `69` tests passed。

额外边界检查：

```bash
rg -n "parseStateTextureManifest" apps/symbolsviewer apps/game003
```

结果：无输出，说明旧 app-local parser 名称已无残留。

```bash
rg -n "L1-wins|stageRect|kind: \"vni\"|vniProjectModules|vniAssetModules" packages/rendercore apps/symbolsviewer apps/game003 assets/game003-s1 apps/buildgamestatic packages/gameframeworks agents.md
```

结果：命中只位于 rendercore、manifest、生成链路、配置、测试、文档和 agents 规则；`apps/game003/src/game-adapter.ts` / `apps/game003/src/game-demo.ts` 未命中 `L1-wins` 或 `stageRect`。

VNI project 校验：

```bash
node --input-type=module -e "import fs from 'node:fs'; import { assertVNIProject } from './packages/vnicore/dist/core/index.js'; const data = JSON.parse(fs.readFileSync('assets/game003-s1/L1-wins.json','utf8')); const project = assertVNIProject(data); console.log(project.name, project.stage.width, project.stage.height, project.stage.duration, project.assets.length, project.layers.length);"
```

输出：

```text
SCATTER1 2000 2000 2 5 5
```

VNI project 引用的 5 个 asset 均存在：

```text
assets/image_asset_image_mqksg37p_9.jpg
assets/02_asset_image_mqkuxzs8_5.jpg
assets/05_asset_image_mql7lnt5_h.jpg
assets/01_asset_image_mql7nr09_l.jpg
assets/l1_asset_image_mr075krb_3.png
```

## 4. 执行中遇到的问题和处理

- 首次 `game003 generate:static-config` 在 sandbox 内触发依赖恢复/网络访问失败；按环境要求改用已批准的 escalated 命令后恢复依赖并继续。
- `buildgamestatic` 新增 VNI glob 校验时 regex 写法触发 typecheck 问题；已修正并补充正反向测试。
- 多个 package 的 `format:check` 抓到新代码排版问题；已用对应 package 的 Prettier 修正后全部复查通过。
- `pnpm --dir packages/vnicore exec prettier ...` 未带 `CI=true` 时触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；已按仓库约定改用 `CI=true pnpm --dir ... exec ...`。

## 5. 浏览器验收交接

按用户要求，浏览器验收未由执行者完成。建议手动检查：

### symbolsviewer

```bash
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5207 --strictPort
```

- 打开 `symbolsviewer`。
- `Set` 切到 `game003-s1`。
- 确认 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC` 全部可见。
- 播放到 `win`，确认 `L1` 播放 VNI 动画，其它 symbol 仍为默认 win 效果。
- 切换其它 set 后再切回 `game003-s1`，确认旧 symbol/状态/画布无残留，console 无错误。

### game003

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

- 使用合法 live query 进入游戏。
- 确认 loading 先走到 `99%`，live 初始化成功后到 `100%` 再挂载游戏画面。
- 触发包含 `L1` 的中奖结果时，确认中奖队列顺序仍按 `bg-wins.basicComponentData.usedResults -> clientData.results[] -> result.pos`，可见窗口中的 `L1` 播放 VNI win 动画。
- 确认无第二条 WebSocket、无 console error。

## 6. 变更与协作规则

- `pnpm-lock.yaml` 有预期变化：`packages/rendercore` 新增 `@slotclientengine/vnicore` workspace dependency。
- `agents.md` 已新增规则，约束后续不得在 app 内复制 manifest/VNI parser 或硬编码 `L1` VNI 播放细节。
- 新增 VNI symbol 动画时，必须同步 manifest、YAML VNI glob、loading 资源、生成物、symbolsviewer 预览和 game runtime resolver。

## 7. 260701-045327 follow-up

用户浏览器验收反馈两类问题：

- `game003` / `symbolsviewer` 中能看到明显黑色，怀疑光效层背景被叠上去。
- `game003` 播放完 VNI win 动画后浏览器报错：`Cannot read properties of null (reading 'clear')`，栈落在 Pixi `_DefaultBatcher.break` / `StencilMaskPipe.push` / `RenderReel.collectRenderablesWithEffects`。

本次 follow-up 处理边界：

- 保持现有美术资源不变：未修改 `assets/game003-s1/L1-wins.json`、`assets/game003-s1/assets/*` 或 `assets/game003-s1/symbol-state-textures.manifest.json`。
- 未强行修改 `L1.png` 或光效层 `blendMode`；视觉效果是否需要调整，后续应回到动画 viewer / symbolsviewer 对齐确认。
- `VNIPlayer` 不再提供 exported stage background 绘制能力；runtime 默认 `backgroundAlpha: 0`，只渲染动画层、特效、粒子和挂载节点。
- 初步处理曾尝试把问题收敛到 `VNIPlayer.destroy()` 和 overlay texture 释放时机；该方案随后被第 9 节的架构修正替代，最终实现不再保留 VNI 内部 app/canvas 和 canvas-to-texture 桥接。

本次 follow-up 追加验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
git diff --check
```

浏览器验收仍按用户要求交给用户执行。

## 8. 260701-045327 animation viewer 追加

为方便用户确认原始 VNI 动画效果，`apps/anieditorv5viewer` 已新增 project selector 条目：

```text
game003-l1-wins
```

实现边界：

- 直接引用 `assets/game003-s1/L1-wins.json`。
- 直接通过 `assets/game003-s1/assets/*` 生成 viewer 专用 asset URL manifest。
- 不复制、不移动、不修改 `assets/game003-s1` 下的美术资源。
- 不修改 `game003`、`symbolsviewer` 或 manifest 的运行配置。

追加验收命令均通过：

```bash
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
git diff --check
```

手动浏览器验收方式：

```bash
CI=true pnpm --filter anieditorv5viewer dev -- --host 127.0.0.1 --port 5175 --strictPort
```

打开 viewer 后在 `Project` 下拉中选择 `game003-l1-wins`，即可查看 `assets/game003-s1/L1-wins.json` 原始动画。

## 9. 260701-132900 VNIPlayer 架构修正

用户进一步确认：`VNIPlayer` 本来不应该创建自己的 canvas；animation viewer 应由 viewer 自己创建 Pixi app/canvas，`VNIPlayer` 只把节点挂到外部 Pixi tree；`rendercore` / game runtime 也应该走同一逻辑。

最终实现边界：

- `VNIPlayerOptions` 从 `container: HTMLElement` 改为 `parent: PIXI.Container`。
- `VNIPlayer` 不再创建 `PIXI.Application`、renderer、canvas、`ResizeObserver` 或 pixel diagnostics；宿主如需 DOM diagnostics，显式传 `diagnosticsElement`。
- `VNIPlayer` 新增 `getDisplayObject()`、`setViewportSize(width, height)`、`viewport` 和 `requestRender` 选项，供 viewer 适配外部 canvas 和手动 render。
- `apps/anieditorv5viewer` 现在自己创建 Pixi `Application` / canvas，把 `app.stage` 传给 `VNIPlayer`；animation viewer 也保持透明，不显示 JSON `stage.backgroundColor`。
- `packages/rendercore` 的 VNI symbol animation 直接把 `VNIPlayer` display tree 挂到 symbol 的 `overlayLayer` 中；rendercore 只创建带 mask 的 Pixi viewport，并按 `stageRect` 中心对齐 VNI root，不再创建隐藏 DOM、隐藏 canvas、canvas texture 或额外 renderer。
- `game003` / `symbolsviewer` 通过 rendercore 走同一条 Pixi tree 直挂路径。
- 继续保持美术资源不变：未修改 `assets/game003-s1/L1-wins.json`、`assets/game003-s1/assets/*`、`assets/game003-s1/symbol-state-textures.manifest.json`，也未强改 `L1` blendMode。
- `VNIPlayer` 是 runtime-only，已彻底移除 stage background 绘制开关；runtime 和 animation viewer 均不绘制 stage background。

本次架构修正同步了：

- `agents.md`
- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/examples/basic-player.ts`
- `packages/rendercore/README.md`
- `apps/anieditorv5viewer/README.md`

最终非浏览器验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
node_modules/.bin/prettier --check agents.md packages/vnicore/README.md packages/vnicore/docs/api-zh.md packages/vnicore/docs/usage-zh.md apps/anieditorv5viewer/README.md packages/rendercore/README.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
git diff --check
```

关键测试数量：

- vnicore：`12` files / `140` tests passed。
- rendercore：`23` files / `134` tests passed。
- anieditorv5viewer：`2` files / `16` tests passed。
- game003：`16` files / `69` tests passed。
- symbolsviewer：`2` files / `26` tests passed。

额外遗漏检查：

```bash
rg -n "hidden canvas|透明隐藏 canvas|canvas-to-texture|createHiddenVniContainer|createCroppedCanvasTexture|HTMLCanvas|data-vni-pixel|pixel-samples|non-background|max-pixel|container:|new VNIPlayer\\(\\{[\\s\\S]*container" packages/vnicore packages/rendercore apps/anieditorv5viewer apps/symbolsviewer apps/game003 agents.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
```

结果：生产代码中无隐藏 canvas / canvas-to-texture / VNIPlayer container 旧路径残留；命中的 `隐藏 canvas` / `canvas-to-texture` 仅位于 `agents.md` 和 `packages/rendercore/README.md` 的禁止恢复说明中，`HTMLCanvasElement` 命中仅位于 viewer 测试的外部 Pixi app mock。

浏览器验收仍按用户要求交给用户执行。建议重点检查：

- anieditorv5viewer：选择 `game003-l1-wins`、`scatter1`、`scatter2`，确认原始动画效果和 console。
- symbolsviewer：`game003-s1` 中播放 `L1.win`，确认黑色矩形是否消失、console 是否无 Pixi batcher 报错。
- game003：触发包含 `L1` 的中奖播放，确认播放结束后无 `Cannot read properties of null (reading 'clear')`。

## 10. 260701-143000 VNIPlayer stage background 彻底移除

用户进一步确认：`VNIPlayer` 不会用于 editor，stage background 不应保留任何可开启路径。

最终处理：

- 从 `VNIPlayerOptions` 删除 `renderStageBackground`。
- 从 `VNIPlayer` 删除 `stageBackground`、`drawStageBackground(...)` 和对 `project.stage.backgroundColor` 的读取。
- animation viewer、rendercore、game runtime 都无法再通过 `VNIPlayer` 绘制导出 stage background。
- `project.stage.backgroundColor` 仍作为导出 JSON schema 元数据由 core validation 保留；它不进入 Pixi player 渲染路径。
- 同步更新 `agents.md`、`packages/vnicore/README.md`、`packages/vnicore/docs/api-zh.md` 和 VNIPlayer 单测。

本次追加验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
node_modules/.bin/prettier --check agents.md packages/vnicore/README.md packages/vnicore/docs/api-zh.md packages/vnicore/docs/usage-zh.md apps/anieditorv5viewer/README.md packages/rendercore/README.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
git diff --check
```

追加遗漏检查：

```bash
rg -n "renderStageBackground|stageBackground|drawStageBackground|parseColorHex\\(this\\.project\\.stage\\.backgroundColor\\)|backgroundColor\\).*VNIPlayer|VNIPlayer.*backgroundColor" packages/vnicore apps/anieditorv5viewer packages/rendercore apps/game003 apps/symbolsviewer agents.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
```

结果：`VNIPlayer` 实现、viewer、rendercore、game app 中无 stage background 绘制开关或读取路径残留；仅 core validation 保留 JSON schema 的 `stage.backgroundColor` 字段校验。

## 11. 260701-144500 VNI layer blendMode 渲染落点修正

用户在关闭 stage 背景后继续验收 `anieditorv5viewer`，确认 `game003-l1-wins`、`scatter1`、`scatter2` 仍可见黑色矩形；同时确认导出 JSON 中相关 layer 的 `blendMode` 已经是 `add`。本次不修改美术资源、不改 JSON、不加入按资源名强制修复。

根因判断：

- vnicore 的 image/text layer 使用外层 `PIXI.Container` 承载位移、缩放、旋转、透明度和可见性。
- 旧实现把采样到的 layer `blendMode` 写到外层 transform container：`instance.display.blendMode = ...`。
- 实际含 JPG 光效黑底的绘制对象是该 container 下的 `Sprite` 子节点；Pixi v8 的批处理路径下，blendMode 应落到实际 renderable child，才能让这些黑底像素按 `add` 混合，而不是以 normal 图层盖上来。

处理：

- `packages/vnicore/src/pixi/layer-instance.ts`
  - `applySampledLayerState(...)` 保持外层 transform container 的 `blendMode = "normal"`。
  - 新增 `applyBlendModeToLayerRenderables(...)`，把采样后的 `blendMode` 应用到 `instance.display.children` 的实际 renderable child。
  - 粒子、safe glow、render effect 原本已经直接把 blendMode 应用到自己的 Sprite / piece，本次不改变这些路径。
- `packages/vnicore/tests/pixi/vni-player.test.ts`
  - 新增单测覆盖：layer 采样到 `blendMode: "add"` 时，外层 container 仍为 `normal`，子 Sprite 为 `add`。

本次追加验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
node_modules/.bin/prettier --check agents.md packages/vnicore/README.md packages/vnicore/docs/api-zh.md packages/vnicore/docs/usage-zh.md apps/anieditorv5viewer/README.md packages/rendercore/README.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
git diff --check
```

额外遗漏检查：

```bash
rg -n "renderStageBackground|stageBackground|drawStageBackground|display\\.blendMode|applyBlendModeToLayerRenderables|toPixiBlendMode" packages/vnicore apps/anieditorv5viewer packages/rendercore apps/game003 apps/symbolsviewer tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
```

结果：运行代码中没有 stage background 绘制开关残留；layer transform container 只保留 `blendMode = "normal"`，采样后的 blendMode 通过 `applyBlendModeToLayerRenderables(...)` 写到真正 renderable child。浏览器视觉验收仍按用户要求交给用户执行。

## 12. 260701-145500 VNI base layer 直接使用 Sprite/Text

用户继续指出：基础 image layer 已经是确定图片，不应该还有无意义的 `Container -> Sprite` 包装。第 11 节的 child blendMode 修正虽然把 blendMode 落到了 renderable child，但仍保留了不必要的 base layer transform container，因此本节继续收敛到更简单的 Pixi 节点树。

最终节点树：

```text
VNIPlayer parent
└─ stageRoot Container
   └─ contentRoot Container
      └─ VNI group <groupId> Container
         ├─ base layer Sprite/Text
         ├─ safeGlowDisplay Container
         ├─ effectDisplay Container
         └─ particleDisplay Container
```

说明：

- base image layer 直接使用 `PIXI.Sprite` 作为 `instance.display`。
- base text layer 直接使用 `PIXI.Text` 作为 `instance.display`。
- `blendMode` 直接写到 base `Sprite/Text` 本体：`instance.display.blendMode = toPixiBlendMode(sampled.blendMode)`。
- 删除第 11 节中临时的 `Container -> Sprite` child blendMode 落点方案；运行代码中不再有 `applyBlendModeToLayerRenderables(...)`。
- 原先 child sprite 上的 asset display compensation 迁移为 `displayScaleCompensation`，在采样时乘到 `instance.display.scale` 上，保持视觉尺寸不变。
- `safeGlowDisplay`、`effectDisplay`、`particleDisplay` 仍保留为 Container，因为这些路径每帧可能生成多个动态 Sprite 或 mask piece，不是单一确定图片。
- `stageRoot`、`contentRoot`、`groupContainer`、`slotContainer` 仍保留为有语义的结构节点：分别负责外部挂载、stage viewport 适配、layer group 顺序和 group slot 插入。

本次追加验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
```

额外对象模型检查：

```bash
node -e "import('./node_modules/.pnpm/pixi.js@8.17.1/node_modules/pixi.js/lib/index.mjs').then(({Container, Sprite, Texture}) => { const group = new Container(); const sprite = new Sprite(Texture.EMPTY); group.addChild(sprite); sprite.blendMode = 'add'; console.log(JSON.stringify({tree: ['groupContainer','Sprite'], groupChildren: group.children.length, spriteBlendMode: sprite.blendMode, spriteLocalBlendMode: sprite.localBlendMode, spriteGroupBlendModeBeforeTransform: sprite.groupBlendMode})); })"
```

输出：

```json
{
  "tree": ["groupContainer", "Sprite"],
  "groupChildren": 1,
  "spriteBlendMode": "add",
  "spriteLocalBlendMode": "add",
  "spriteGroupBlendModeBeforeTransform": "normal"
}
```

结论：Pixi v8 的 `blendMode` setter 会立即把 `localBlendMode` 设为 `add`；`groupBlendMode` 是渲染前 transform pass 中的懒更新字段，不能在设置后立刻用它判断最终 batch blend。当前 vnicore 已直接把 `add` 写到 base Sprite/Text 本体，不再经过无意义的 base layer wrapper。

## 13. 260701-150100 JPG 黑底光效 matte 处理

用户进一步指出：`L1` 基础 sprite 一开始正确，黑框只在光效/粒子出来后出现；并要求对照 `docs/anieditor5` 下的编辑器 Pixi v8 实现。

源码对照结论：

- `docs/anieditor5/src/pixi_stage.ts` 中编辑器每个 layer 使用 `Container -> Sprite`，并在 `applyLayerTransform(...)` 里把 `blendMode` 设到 layer `Container`。
- 编辑器没有对 JPG 光效做 alpha/matte 预处理；`loadImageTexture(...)` 是 `new Image()` 后 `PIXI.Texture.from(image)`。
- 编辑器 `drawGuides()` 会在内容下方绘制一块 `0x0a0a0a` 的 stage guide 背景；因此 JPG 黑底光效在编辑器里被黑底承接，不会暴露透明宿主 canvas 上的 alpha 写入问题。
- Pixi v8 对非预乘纹理会把 `add` 调整为 `add-npm`；WebGL blend state 是 RGB `SRC_ALPHA, ONE`，alpha `ONE, ONE`。黑色 JPG 像素不会增加 RGB，但会把透明 canvas 的 alpha 写成不透明，最终表现为黑框。
- `packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts` 中 Cocos `add` 的颜色通道为 `SRC_ALPHA + ONE`，alpha 通道为 normal alpha blend；这说明 VNI 语义并不是“让 Pixi add-npm 把黑底 alpha 加满”。

本次修正：

- 新增 `packages/vnicore/src/pixi/additive-matte-texture.ts`。
- `VNIPlayer` 在加载 texture 时，只对同时满足以下条件的资源派生透明 matte texture：
  - 资源路径是 `.jpg` / `.jpeg`。
  - 资源的所有 image layer 用法都属于 `add` / `screen` / `lighten`。
- matte 规则：以像素最大 RGB 通道作为 alpha；近黑像素 alpha 置 0；非黑像素做一次 unmatte，避免 `SRC_ALPHA` 叠加后光效明显变暗。
- 不修改原始美术资源，不对 PNG/normal layer/未被叠加 blend 引用的 JPG 生效。
- 如果同一个 JPG asset 被 normal layer 复用，则保持原始 opaque texture，避免正常图片被透明化。
- 派生过程只使用一次性纹理预处理 canvas，不是 `VNIPlayer` 自己的播放 canvas；`VNIPlayer` 仍由宿主提供 Pixi `parent`，不创建 app/renderer/canvas，不绘制 stage background。
- `destroy()` 会销毁这类派生 texture/source，避免 viewer 切换动画时留下 GPU 资源。

新增测试：

- `packages/vnicore/tests/pixi/vni-player.test.ts` 覆盖 additive JPG matte：纯黑像素 alpha 变 0，有亮度像素生成非零 alpha 并做 unmatte；layer sprite 使用派生 texture；`destroy()` 释放派生 texture。
- 同文件覆盖共享 JPG 边界：同一 JPG 同时被 `add` 和 `normal` layer 使用时不会派生 matte。

本节追加验收命令均通过：

```bash
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore format:check
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer format:check
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer format:check
node_modules/.bin/prettier --check agents.md packages/vnicore/README.md packages/vnicore/docs/api-zh.md packages/vnicore/docs/usage-zh.md apps/anieditorv5viewer/README.md packages/rendercore/README.md tasks/67-rendercore-vnicore-symbol-animation-260701-041820.md
git diff --check
```

额外 grep 检查：

```bash
rg -n "renderStageBackground|stageBackground|drawStageBackground|applyBlendModeToLayerRenderables|backgroundColor = parseColorHex|new PIXI\\.Application\\(|container: HTMLElement" packages/vnicore apps/anieditorv5viewer packages/rendercore apps/game003 apps/symbolsviewer
rg -n "additiveMatte|deriveAdditiveMatteTexture|shouldDeriveAdditiveMatteTexture|getAdditiveMatteAssetIds|CanvasSource|ownedTextures" packages/vnicore
```

结果：没有恢复 `VNIPlayer` 自己的 `PIXI.Application` / canvas / stage background；旧的 `applyBlendModeToLayerRenderables` helper 仍不存在。`stage.backgroundColor` 只在 schema validation 中作为导出元数据保留。additive matte 入口只存在于 `packages/vnicore/src/pixi/additive-matte-texture.ts`、`VNIPlayer.loadTexture(...)` 和对应单测。
