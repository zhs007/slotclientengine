# game003 other scenes coin overlay 执行报告

## 1. 基本信息

- 任务计划：`tasks/84-game003-other-scenes-coin-overlay.md`
- 执行时间戳：`260706-044310` UTC
- 仓库：`/Users/zerro/github.com/minecart2`
- 结论：任务范围内实现完成，`game003` 发布面自动验收通过；根级 `typecheck`、`test`、`format:check` 存在旁路失败，已在第 5 节列明。
- 浏览器验收：未由 Codex 执行，按用户要求留给人工浏览器验收 `game003`。

## 2. 实现内容

### 2.1 logiccore 通用 otherScenes 合同

- 在 `packages/logiccore/src/types.ts` 增加 `OtherSceneMatrix`、`clientData.otherScenes`、`basicComponentData.usedOtherScenes`、`usedOtherSceneIndexes`，并扩展 `GameLogic` / `GameLogicStep` 查询接口。
- 在 `packages/logiccore/src/parser.ts` 解析 `clientData.otherScenes`，与 `scenes` 一样使用严格 scene 矩阵解析；缺失、非数组或非法矩阵显式失败。
- 在 `packages/logiccore/src/component.ts` 解析并校验 `usedOtherScenes`，禁止缺失、非整数、负数和越界索引。
- 在 `packages/logiccore/src/game-logic.ts` 增加 `getOtherScene`、`getOtherScenes`、`getComponentOtherScenes` 等通用查询。
- 更新 `packages/logiccore/README.md` 和相关 fixture / 测试，明确 `logiccore` 不理解 `bg-gencoins`、`CO` 或 coin 金额语义。

### 2.2 gameframeworks facade

- 在 `packages/gameframeworks/src/component-helpers.ts` 增加 `getComponentOtherScenesByName`，让游戏 app 继续只依赖 `@slotclientengine/gameframeworks`。
- 在 `packages/gameframeworks/src/types.ts` / `src/index.ts` re-export `OtherSceneMatrix` 与新 helper。
- 更新 `packages/gameframeworks/tests/test-helpers.ts`、`component-helpers.test.ts`，覆盖查询成功、组件过滤和缺失 component 失败。

### 2.3 game003 app 层 CO 金额显示

- 在 `apps/game003/config/game-static.yaml` 的 `appExtensions.game003CoinOverlay` 增加 app 专属配置，并重新生成 `apps/game003/src/generated/game-static.generated.ts`。
- 新增 `apps/game003/src/coin-overlay-config.ts`：严格解析 `game003CoinOverlay`，限定 component 为 `bg-gencoins`、coin symbol 为 `CO`，并校验文字样式。
- 新增 `apps/game003/src/coin-overlay-sequence.ts`：读取第 0 step 的 `bg-gencoins.usedOtherScenes`，要求 exactly one otherScene；目标 scene 中每个 `CO` 必须有 positive integer raw amount，非 `CO` 必须为 `0`。
- 新增 `apps/game003/src/coin-overlay-runtime.ts`：使用 Pixi `Text` 将 raw amount 渲染到对应 `CO` symbol 几何快照上，resize/refresh 跟随主转轮坐标。
- 更新 `apps/game003/src/game-adapter.ts`：spin 前清理旧 overlay，主转轮停止并校验目标画面后显示本轮 CO 金额；下一轮、初始状态和销毁时清理。
- 更新 `apps/game003/tests/*`：覆盖配置解析、sequence 校验、runtime 布局、adapter 生命周期、source boundary 和静态配置。

### 2.4 旁路 fixture、消费者和协作规则同步

- 更新 `apps/gameframeworksviewer`，展示 step/component 的 otherScenes 计数，并补齐 mock GMI。
- 更新 `apps/gameclientcli`，统计组件 `usedOtherSceneCount` 并补齐测试 fixture。
- 更新 `apps/uiframeworksviewer`、`packages/uiframeworks`、`packages/gameframeworks` 的 fake/mount context，适配 `otherScenes` 必填和当前 framework context 类型。
- 更新 `agents.md`：补充 `logiccore` 拥有通用 `otherScenes`/`usedOtherScenes`，`game003` 的 `bg-gencoins`/`CO` 金额 overlay 只属于 app 层，shared 包不能硬编码该语义。
- `pnpm-lock.yaml` 未变化，未新增第三方依赖。

## 3. 关键合同确认

- `clientData.otherScenes` 现在是必填输入，不会被静默当成空数组。
- `logiccore` 和 `gameframeworks` 只提供通用矩阵和 facade，不包含 `bg-gencoins`、`CO`、coin overlay 等游戏专属字符串。
- `apps/game003` 不直接 import `@slotclientengine/logiccore`。
- `CO` code 未硬编码为 `11`，运行时通过 `runtime.gameConfig.getSymbolCode("CO")` 查询。
- CO 金额显示为 raw amount，例如 `150` 显示 `150`，不复用 `formatServerUsdAmount`。
- 非 CO 的 `otherScene[x][y]` 第一版必须为 `0`；CO 缺失金额、非 CO 带金额、矩阵尺寸不匹配、几何快照缺失都会显式失败。

## 4. 任务范围内验收

以下命令通过：

```bash
CI=true pnpm --filter @slotclientengine/logiccore test
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore format:check
CI=true pnpm --filter @slotclientengine/logiccore build
CI=true pnpm --filter @slotclientengine/logiccore test:exports
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter @slotclientengine/uiframeworks test
CI=true pnpm --filter @slotclientengine/uiframeworks typecheck
CI=true pnpm --filter @slotclientengine/uiframeworks format:check
CI=true pnpm --filter gameframeworksviewer test
CI=true pnpm --filter gameframeworksviewer typecheck
CI=true pnpm --filter gameframeworksviewer format:check
CI=true pnpm --filter uiframeworksviewer test
CI=true pnpm --filter uiframeworksviewer typecheck
CI=true pnpm --filter gameclientcli test
CI=true pnpm --filter gameclientcli typecheck
CI=true pnpm --filter gameclientcli format:check
CI=true pnpm lint
CI=true pnpm build
git diff --check
```

以下边界检查通过：

```bash
rg -n "@slotclientengine/logiccore" apps/game003/src
rg -n "bg-gencoins|game003CoinOverlay|COIN_OVERLAY|GAME003_COIN" packages/logiccore/src packages/gameframeworks/src packages/rendercore/src
```

两个 `rg` 命令均无输出，表示没有发现禁止的直接依赖或 shared 包专属语义泄漏。

## 5. 根级旁路失败记录

以下根级命令未完全通过，但首个真实失败均在本任务改动边界外：

```bash
CI=true pnpm typecheck
```

首个真实失败：

```text
apps/reelsviewer/src/assets.ts(345,14): Property 'layers' does not exist on type 'TransparentSymbolTextureSource | LayeredSymbolTextureSource<...>'.
apps/reelsviewer/src/assets.ts(345,32): Parameter 'layer' implicitly has an 'any' type.
apps/reelsviewer/src/assets.ts(347,40): Parameter 'keyframe' implicitly has an 'any' type.
```

后续 `game003`、`gameframeworksviewer`、`buildgamestatic` 等 SIGTERM/SIGINT 是 turbo 在 `reelsviewer` 首错后中断造成；这些目标包已单独通过任务范围内 typecheck。

```bash
CI=true pnpm test
```

首个真实失败：

```text
anieditorv5viewer tests/main.test.ts / uploaded-zip-project.test.ts
ENOENT: no such file or directory, open '../../docs/anieditor5/megawin.zip'
ENOENT: no such file or directory, open '../../docs/anieditor5/roundreel.zip'
```

共 10 个失败用例，均来自缺少上述 zip fixture。

```bash
CI=true pnpm format:check
```

观察到的旁路 Prettier 问题：

```text
apps/uiframeworksviewer/eslint.config.cjs
apps/uiframeworksviewer/src/demo-game.ts
apps/uiframeworksviewer/tests/mock-client.test.ts
apps/uiframeworksviewer/tsconfig.eslint.json
apps/uiframeworksviewer/tsconfig.json
apps/uiframeworksviewer/vite.config.ts
apps/gengameconfig/src/*.ts and tests/*.ts
apps/spine2pixiani-demo/*
```

本次触达的 `uiframeworksviewer` 文件是 `src/mock-client.ts` 和 `tests/demo-game.test.ts`，不在该 package 的 Prettier 报警列表中。`gameclientcli`、`gameframeworksviewer`、`@slotclientengine/uiframeworks`、`game003`、`logiccore`、`gameframeworks` 的单包 format:check 已通过。

## 6. 浏览器验收交接

Codex 未执行浏览器验收。建议人工验收时启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5173
```

浏览器重点检查：

- `game003` 仍先显示 `packages/gameloading` loading，`100%` 后才进入游戏画面。
- 正常 spin 后主转轮停止时，目标 scene 中每个 `CO` symbol 上出现 raw 数字金额。
- 金额显示应锚在对应 `CO` 图标中间偏下位置，横屏和竖屏 resize 后仍贴合。
- 非 `CO` symbol 不出现金额。
- 下一次 spin 开始前上一轮 CO 金额清理干净，不残留。
- 旧 query 中若带 `serverUrl`，仍应显式失败，不应静默覆盖 live server。

## 7. 最终工作区摘要

主要变更集中在：

- `packages/logiccore`
- `packages/gameframeworks`
- `apps/game003`
- `apps/gameframeworksviewer`
- `apps/gameclientcli`
- `apps/uiframeworksviewer`
- `packages/uiframeworks`
- `agents.md`

新增 game003 app 文件：

- `apps/game003/src/coin-overlay-config.ts`
- `apps/game003/src/coin-overlay-sequence.ts`
- `apps/game003/src/coin-overlay-runtime.ts`
- `apps/game003/tests/coin-overlay-config.test.ts`
- `apps/game003/tests/coin-overlay-sequence.test.ts`
- `apps/game003/tests/coin-overlay-runtime.test.ts`

任务计划文件仍保留为：

- `tasks/84-game003-other-scenes-coin-overlay.md`
