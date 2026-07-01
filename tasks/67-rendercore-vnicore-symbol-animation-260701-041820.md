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
