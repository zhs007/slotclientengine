# game003 minecart interaction 任务报告

## 结论

已按 `tasks/73-game003-minecart-interaction.md` 完成 `apps/game003` 矿车互动实现和非浏览器严格验收。

本次实现结果：

- `bg-bar` shift 缩短为 `0.28s`，终点 `win` 动画缩短为 `0.24s`。
- `features[0]` 终点 symbol 在 win 完成并隐藏后触发矿车互动。
- 当终点 feature 是 `wild` 或 `up` 时，矿车从屏幕外冲入、overshoot、倾翻回正；payload symbol 从车厢垂直飞向主转轮中心并淡出。
- 当终点 feature 是 `normal` 时，只完成 `bg-bar` 终点流程，不播放矿车动画。
- `playSpin()` resolve 条件继续等待主转轮、`bg-bar`、矿车互动、`bg-wins` 和中奖金额动画。
- shared 包只新增通用 `appExtensions` 透传，不理解 `minecart` / `game003MinecartInteraction` 语义。
- 未新增第三方依赖，`pnpm-lock.yaml` 未变化。

## 修改文件

协作规则和文档：

- `agents.md`
- `apps/game003/README.md`
- `tasks/73-game003-minecart-interaction-260702-093351.md`

静态配置和生成：

- `apps/game003/config/game-static.yaml`
- `apps/game003/src/generated/game-loading.generated.ts`
- `apps/game003/src/generated/game-static.generated.ts`
- `apps/buildgamestatic/src/types.ts`
- `apps/buildgamestatic/src/yaml-loader.ts`
- `apps/buildgamestatic/src/generator.ts`
- `packages/gameframeworks/src/static-config/types.ts`
- `packages/gameframeworks/src/static-config/validate.ts`

game003 runtime：

- `apps/game003/src/bg-bar-runtime.ts`
- `apps/game003/src/game-adapter.ts`
- `apps/game003/src/generated-loading-url.ts`
- `apps/game003/src/minecart-interaction-config.ts`
- `apps/game003/src/minecart-interaction-layout.ts`
- `apps/game003/src/minecart-interaction-runtime.ts`
- `apps/game003/src/skin-config.ts`
- `apps/game003/scripts/verify-static-dist.mjs`
- `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json`

测试：

- `apps/buildgamestatic/tests/generator.test.ts`
- `apps/buildgamestatic/tests/yaml-loader.test.ts`
- `packages/gameframeworks/tests/static-config.test.ts`
- `apps/game003/tests/assets.test.ts`
- `apps/game003/tests/bg-bar-runtime.test.ts`
- `apps/game003/tests/game-adapter.test.ts`
- `apps/game003/tests/loading-resources.test.ts`
- `apps/game003/tests/source-boundary.test.ts`
- `apps/game003/tests/static-config.test.ts`
- `apps/game003/tests/minecart-interaction-config.test.ts`
- `apps/game003/tests/minecart-interaction-layout.test.ts`
- `apps/game003/tests/minecart-interaction-runtime.test.ts`

说明：仓库实际追踪的是小写 `agents.md`。本地大写 `AGENTS.md` 也包含同一条规则，但不在 git tracked 文件列表中。

## 资源确认

`assets/game003-s1/minecart.png` 已存在且为仓库已追踪文件。

```text
file assets/game003-s1/minecart.png
assets/game003-s1/minecart.png: PNG image data, 369 x 252, 8-bit/color RGBA, non-interlaced
```

```text
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
pixelWidth: 369
pixelHeight: 252
```

YAML / app config 中 `imageSize` 固定为：

```text
width: 369
height: 252
```

运行时通过 Pixi texture 尺寸再次校验，尺寸漂移会显式失败。

## 时间参数

最终参数：

- `bg-bar shift`: `0.28s`
- `bg-bar terminal win`: `0.24s`
- `cart rush + brake settle`: `0.38s`
- `payload fly + fade`: `0.36s`
- 总互动时长：`1.26s`
- `maxTotalBeforeReelStopSeconds`: `1.3s`
- 主转轮 `baseDurationMs`: `1300ms`

验收结论：`1.26s <= 1.3s`，且 `1.26s < 1.3s`。未修改 `baseDurationMs`、`speedSymbolsPerSecond`、`minimumSpinCycles`、`startDelayMs` 或 `stopDelayMs` 来掩盖节奏。

## 布局数值

横屏：

- `entrySide`: `left`
- `offscreenMargin`: `120`
- `stopOffsetFromReelAreaBottomCenter`: `{ x: 0, y: 85 }`
- `cartPivotInImage`: `{ x: 184.5, y: 220 }`
- `payloadAnchorInImage`: `{ x: 184.5, y: 92 }`

竖屏：

- `entrySide`: `left`
- `offscreenMargin`: `120`
- `stopOffsetFromReelAreaBottomCenter`: `{ x: 0, y: 145 }`
- `cartPivotInImage`: `{ x: 184.5, y: 220 }`
- `payloadAnchorInImage`: `{ x: 184.5, y: 92 }`

运行时停点 = 当前 `layout.sceneParts.reelArea` 底部中心 + 对应 offset；起点由当前 `visibleRect`、图片尺寸、pivot 和 `offscreenMargin` 推导；payload 目标为当前主转轮可见区中心。

## normal feature

`normal` 不再触发矿车互动。`bg-bar` 终点 `normal` 仍按传送带流程完成并隐藏，但 adapter 不启动 minecart runtime，也不会等待透明空载矿车。

## 规则同步

已更新 `agents.md`，补充：

- 矿车互动属于 `apps/game003` app 层。
- shared 包只能透传通用 `appExtensions`，不能硬编码矿车语义。
- `minecart.png`、轨道停点、payload anchor、图片尺寸和时间预算来自 YAML/app 扩展配置，缺失或尺寸漂移必须显式失败。
- 不能通过延长主转轮 timing 掩盖矿车互动节奏。

## 验收命令

资源确认：

```text
file assets/game003-s1/minecart.png
通过，尺寸 369 x 252。
```

```text
sips -g pixelWidth -g pixelHeight assets/game003-s1/minecart.png
通过，pixelWidth 369，pixelHeight 252。
```

生成和单包检查：

```text
CI=true pnpm --filter buildgamestatic test
通过，4 files / 22 tests。
```

```text
CI=true pnpm --filter buildgamestatic typecheck
通过。
```

```text
CI=true pnpm --filter buildgamestatic build
通过。
```

```text
CI=true pnpm --filter @slotclientengine/gameframeworks test
通过，9 files / 33 tests。
```

```text
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
通过。
```

```text
CI=true pnpm --filter @slotclientengine/gameframeworks build
通过。
```

```text
CI=true pnpm --filter game003 generate:static-config
通过，生成文件已是最新。
```

```text
CI=true pnpm --filter game003 check:static-config
通过，buildgamestatic 校验通过。
```

```text
CI=true pnpm --filter game003 test
通过，23 files / 103 tests。
```

```text
CI=true pnpm --filter game003 typecheck
通过。
```

```text
CI=true pnpm --filter game003 build
通过，dist 中包含 minecart-DsU2buld.png。
```

```text
CI=true pnpm --filter game003 release:check
通过，game003 static dist check passed。
```

```text
CI=true pnpm --filter game003 lint
通过。
```

```text
CI=true pnpm --filter game003 format:check
通过。
```

```text
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
通过。
```

```text
CI=true pnpm --filter buildgamestatic format:check
通过。
```

边界 grep：

```text
rg -n 'minecart|Minecart|game003MinecartInteraction|game003-minecart' packages/rendercore packages/logiccore packages/gameframeworks
无匹配，rg exit 1，符合预期。
```

```text
rg -n 'height\s*/\s*5|width\s*/\s*5|conveyor.*\/\s*5' apps/game003/src apps/game003/tests apps/game003/config
无匹配，rg exit 1，符合预期。
```

```text
rg -n 'minecart\.png|game003-minecart|game003MinecartInteraction' apps/game003 assets/game003-s1 tasks agents.md AGENTS.md
通过，命中只在 game003 配置/runtime/测试/README、任务文件和协作规则中。
```

```text
rg -n 'baseDurationMs|speedSymbolsPerSecond|minimumSpinCycles|startDelayMs|stopDelayMs' apps/game003/config/game-static.yaml apps/game003/src apps/game003/tests
通过，命中只在既有 YAML timing、生成/读取代码和本次预算断言中。
```

最终清理：

```text
git diff --check
通过。
```

```text
./node_modules/.bin/prettier --check tasks/73-game003-minecart-interaction.md
通过。
```

```text
./node_modules/.bin/prettier --check AGENTS.md agents.md
通过。
```

## 浏览器验收

未执行浏览器人工验收，不能标记为已通过。

上一轮本地 dev server 曾启动成功，但随后因人工验收需要自行重启而占用 `5208`。当前该 dev server 已停止，`lsof -nP -iTCP:5208 -sTCP:LISTEN` 无监听输出，端口已释放。

人工验收时可重新启动：

```text
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

本地入口：

```text
http://127.0.0.1:5208/
```

请按任务计划第 10 节使用真实 token 打开：

```text
http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

人工重点检查：

- loading 先到 `99%`，live 初始化后到 `100%` 再挂载游戏。
- spin 后主转轮和 `bg-bar` 同时启动。
- 终点 feature 为 `normal` 时，不出现矿车。
- 终点 feature 为 `wild` / `up` 时，终点 symbol 消失后矿车从屏幕外冲入。
- 横竖屏轨道、停点、刹车、payload 垂直飞入和淡出符合视觉预期。
- 非 normal 矿车互动完成早于主转轮停轴。
- 连续 spin 不残留旧矿车、旧 payload、重复 ticker 或重复 WebSocket。

## 二次遗漏检查

已确认：

- `minecart.png` 存在，尺寸与 YAML/app config 一致。
- `game-loading.generated.ts` 包含 `game003-minecart`。
- `game-static.generated.ts` 包含 `appExtensions`，由 `buildgamestatic` 生成。
- shared 包没有 minecart 专有语义。
- `verify-static-dist.mjs` 覆盖 `minecart.png` hash / dist asset 校验。
- `bg-bar` terminal event 只发一次，且在终点 symbol 隐藏和 settle 后返回。
- 矿车互动使用 `features[0]`，不从 settle 后队列猜测。
- `normal` 跳过矿车路径和非 normal 启动矿车路径均有测试。
- 矿车 runtime 复用已加载的 `bgBarSymbolTextures`。
- 横屏/竖屏 layout、pivot、payload anchor、offscreen start、reel center target 均有测试。
- 主转轮 timing 未为矿车互动修改。
- `playSpin()` 等待主转轮、矿车互动、`bg-wins` 和 win amount。
- destroy/resize/重复 spin 路径有测试覆盖。
- README 和 `agents.md` 已同步新合同。
