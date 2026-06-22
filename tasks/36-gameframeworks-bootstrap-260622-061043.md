# 36 gameframeworks bootstrap 执行报告

## 实现摘要

已新增 `packages/gameframeworks`，包名为 `@slotclientengine/gameframeworks`，作为后续 slot 游戏默认 facade。该包整合：

- `@slotclientengine/uiframeworks` 的 UI-only HUD/controller。
- `@slotclientengine/netcore` 的 live session、spin、collect。
- `@slotclientengine/logiccore` 的 `GameLogic` 创建和类型重导出。

已新增 `apps/gameframeworksviewer`，作为最小可运行验证 app。viewer 默认 mock 模式可离线运行，支持中奖、无中奖、零赢分多段结果、delayed spin 场景，并把格式化后的 `GameLogic` 输出到 list。

## 新增/修改文件清单

新增：

- `packages/gameframeworks/**`
- `apps/gameframeworksviewer/**`
- `packages/uiframeworks/src/controller.ts`
- `packages/uiframeworks/.prettierignore`
- `tasks/36-gameframeworks-bootstrap-260622-061043.md`

修改：

- `agents.md`
- `pnpm-lock.yaml`
- `packages/uiframeworks/README.md`
- `packages/uiframeworks/src/dom.ts`
- `packages/uiframeworks/src/index.ts`
- `packages/uiframeworks/src/state.ts`
- `packages/uiframeworks/src/types.ts`
- `packages/uiframeworks/tests/dom.test.ts`
- `packages/uiframeworks/tests/exports.test.ts`
- `packages/uiframeworks/tests/state.test.ts`

## Public API 摘要

`@slotclientengine/gameframeworks` 暴露：

- `createSlotGameFramework(options)`
- `SlotGameFramework.spin(): Promise<GameLogic>`
- `SlotGameAdapter.playSpin(logic)`
- `findComponentSteps(logic, name)`
- `getComponentScenesByName(logic, name, options?)`
- `getComponentResultsByName(logic, name, options?)`
- `shouldCollectFinalResult(totalwin, results)`
- 常用 logic 类型重导出：`GameLogic`、`GameLogicStep`、`LogicComponent`、`SceneMatrix`、`WinResult`

游戏侧不需要直接依赖 `uiframeworks`、`netcore`、`logiccore`。

## uiframeworks 边界调整

`uiframeworks` 新增 `createSlotUiController()`。它只负责：

- 创建 HUD DOM / game layer / overlay。
- 绑定 spin、bet、sound、fast、auto、buy bonus handlers。
- 渲染外部传入的 `SlotUiStateSnapshot`。

它不接受 `live`、`clientFactory`、`logicFactory`，因此 `gameframeworks` 不会经过旧 `createSlotUiFramework().spin()` 的提前 collect 流程。

`SlotUiSpinState` 新增 `presenting`，DOM 会显示 `Presenting`，且 spin 按钮保持 disabled，不会把游戏展示阶段误映射为 `idle`。

## Spin 时序说明

新框架时序为：

```text
点击 spin
  -> 同步设置 UI spinning，按钮禁用
  -> netcore spin
  -> 校验 raw spin result
  -> logiccore 创建 GameLogic
  -> 设置 UI presenting，更新 win
  -> adapter.playSpin(logic)
  -> playSpin resolve 后按协议判断 collect
  -> 如需 collect，设置 collecting 并调用 netcore collect
  -> 刷新 balance，回 idle
```

`adapter.playSpin(logic)` 收到的 `GameLogic` 与 `framework.spin()` 最终 resolve 的对象相同。

`adapter.playSpin(logic)` reject 时不会 collect，框架进入 error。collect 失败也进入 error，不会静默回 idle。

collect 规则保持：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1)
```

## Balance / Bet / Win

`gameframeworks` 自动驱动 HUD 的：

- `balance`
- `bet`
- `win`
- `spinning` / `presenting` / `collecting` / `idle` 状态

游戏只处理当前局面的 `GameLogic`，不处理通用 HUD 状态，不调用 collect。

## Viewer mock/live 说明

`apps/gameframeworksviewer` 默认 mock 模式，不需要外部网络。

live 模式必须显式设置 `VITE_GAMEFRAMEWORKSVIEWER_MODE=live`，不会从 mock 隐式 fallback。未覆盖其他 live env 时，viewer 会复用 `apps/gameclientcli` / `apps/game001` 前序任务默认参数：

```text
serverUrl=wss://gameserv.rgstest.slammerstudios.com/
gamecode=CqbQ0Y7gtBpO5419j8h02
businessid=guest
jurisdiction=MT
clienttype=web
language=en
requestTimeoutMs=30000
bet=10 lines=10 times=1 autonums=-1
```

仍可用 `VITE_GAMEFRAMEWORKSVIEWER_SERVER_URL`、`TOKEN`、`GAMECODE`、`BUSINESSID`、`CLIENTTYPE`、`JURISDICTION`、`LANGUAGE`、`REQUEST_TIMEOUT_MS`、`BET`、`LINES`、`TIMES`、`AUTONUMS` 显式覆盖。

## agents.md

已更新 `agents.md`：

- 增加 `packages/gameframeworks` 的职责说明。
- 明确后续游戏默认依赖 `@slotclientengine/gameframeworks`，不要直接依赖底层三包，除非框架内部或任务明确要求。

## 验收命令及结果

安装：

- `pnpm install`：通过

uiframeworks：

- `pnpm --filter @slotclientengine/uiframeworks lint`：通过
- `pnpm --filter @slotclientengine/uiframeworks test`：通过，44 tests passed
- `pnpm --filter @slotclientengine/uiframeworks typecheck`：通过
- `pnpm --filter @slotclientengine/uiframeworks build`：通过
- `pnpm --filter @slotclientengine/uiframeworks format:check`：通过

gameframeworks：

- `pnpm --filter @slotclientengine/gameframeworks lint`：通过
- `pnpm --filter @slotclientengine/gameframeworks test`：通过，20 tests passed，branch coverage 91.04%
- `pnpm --filter @slotclientengine/gameframeworks typecheck`：通过
- `pnpm --filter @slotclientengine/gameframeworks build`：通过
- `pnpm --filter @slotclientengine/gameframeworks format:check`：通过

gameframeworksviewer：

- `pnpm --filter gameframeworksviewer lint`：通过
- `pnpm --filter gameframeworksviewer test`：通过，10 tests passed
- `pnpm --filter gameframeworksviewer typecheck`：通过
- `pnpm --filter gameframeworksviewer build`：通过
- `pnpm --filter gameframeworksviewer format:check`：通过

根级：

- `pnpm lint`：通过，20 packages successful
- `pnpm test`：通过，20 packages successful
- `pnpm typecheck`：通过，20 packages successful
- `pnpm build`：通过，20 packages successful
- `git diff --check`：通过
- `pnpm format:check`：未通过。剩余失败来自任务外既有包和生成物，已确认本任务相关包均通过自己的 `format:check`。示例失败包包括 `@slotclientengine/pixiani`、`gengameconfig`，并且多个任务外包的 `coverage/` / `dist/` 被 `prettier --check .` 扫描。

## 浏览器验收

启动命令：

```bash
pnpm --filter gameframeworksviewer dev -- --host 127.0.0.1 --port 5203
```

沙箱内首次启动因监听本地端口被拒绝：

```text
listen EPERM: operation not permitted 127.0.0.1:5203
```

已用提升权限重新启动同一命令，仅用于本地浏览器验收，启动成功：

```text
Local: http://127.0.0.1:5203/
```

浏览器检查结果：

- 首屏不白屏，mock 模式、Scenario select、HUD、Logic list 正常渲染。
- 默认 `default-win` 点击 spin 后 list 追加记录，包含 `totalwin=44`、step/result/component 摘要，状态回 idle，collect 计数为 1。
- `delayed-win` 点击 spin 后 150ms 内状态为 `spinning`，spin 按钮 disabled，list 尚未追加，tick 仍增长；约 1000ms 后 list 追加，状态回 idle，collect 计数为 1。
- `no-win` 场景 spin 后 list 追加，collect 计数为 0。
- `zero-multi-collect` 场景 `totalwin=0` 且 `results=2`，spin 后 collect 计数为 1，证明多段零赢分规则保留。

## 追加 live 服务器验收

按用户追加要求，已用前序任务默认参数和用户后续提供的新 token 尝试真实连接服务器。

CLI 烟测命令：

```bash
pnpm --filter gameclientcli start -- --spins 1 --verbose
pnpm --dir apps/gameclientcli exec node dist/index.js --spins 1 --verbose
```

两种方式均已确认参数为：

```text
server=wss://gameserv.rgstest.slammerstudios.com/
gamecode=CqbQ0Y7gtBpO5419j8h02
bet=10 lines=10 times=1 autonums=-1
requestTimeoutMs=30000
```

两次真实 WebSocket 连接均到达服务器，但服务器返回相同 notice，命令 fail-fast 退出：

```text
server noticemsg2: {"msgid":"noticemsg2","msgcode":6,"msgparam":{"ecode":6,"dtapierrcode":"000101|211005"},"ctrltype":"notice","type":0}
```

用户随后提供新 token：

```text
gamecode=CqbQ0Y7gtBpO5419j8h02
token=d8c08cac23c24f3b87781b7591a1505b
```

使用新 token 后 CLI 真实连接和 1-spin 成功：

```bash
pnpm --filter gameclientcli start -- --spins 1 --verbose --gamecode CqbQ0Y7gtBpO5419j8h02 --token d8c08cac23c24f3b87781b7591a1505b
```

关键输出：

```text
登录用户摘要
pid: guest
nickname: trial-661350
currency: EUR
initialBalance: 200000
verbose spin=1 gameid=69009 bet=10 lines=10 totalwin=0 replyPlay.results.length=1
completedSpins: 1
finalBalance: 199900
```

为排除 npm script 转参影响，也执行了 direct node 版本；旧 token 时确认同样失败，证明旧失败不是脚本转参问题。

live viewer 新 token 启动命令：

```bash
VITE_GAMEFRAMEWORKSVIEWER_MODE=live \
VITE_GAMEFRAMEWORKSVIEWER_TOKEN=d8c08cac23c24f3b87781b7591a1505b \
VITE_GAMEFRAMEWORKSVIEWER_GAMECODE=CqbQ0Y7gtBpO5419j8h02 \
pnpm --filter gameframeworksviewer dev -- --host 127.0.0.1 --port 5204
```

启动成功：

```text
Local: http://127.0.0.1:5204/
```

浏览器页面确认：

- mode badge 为 `live`。
- connect 成功，状态显示 `default-win / connected / collect 0`。
- 首次 live 验收时 HUD balance 显示 `$199,900.00`、bet 显示 `$10.00`，暴露出服务器金额单位不能直接按美元展示。
- 已按用户确认的口径修正：服务器 live 金额使用 USD 最小单位，`100` 表示 `$1.00`，`10` 表示 `$0.10`；viewer live HUD 现在按 `/100` 展示，mock 模式保持原演示口径。
- 修正后预期：`balance=199900` 展示为 `$1,999.00`，`bet=10` 展示为 `$0.10`，`totalwin=200` 的 HUD win 展示为 `$2.00`。
- 点击 Spin 后真实 `GameLogic` list 追加：

```text
#1 bet=10 lines=10 times=1
totalwin=200 steps=1 results=2
step[0] cashWin=200 coinWin=20 scenes=1 results=2
```

- Spin 后框架回到 `idle`，Spin 按钮重新可用，HUD status 为 `Ready`。
- 浏览器 console error/warn 日志为空。

补充 CLI 对比：

```bash
pnpm --filter gameclientcli start -- --spins 1 --verbose --gamecode CqbQ0Y7gtBpO5419j8h02 --token d8c08cac23c24f3b87781b7591a1505b
```

再次成功，关键输出为 `totalwin=1000 replyPlay.results.length=1`。CLI 和 viewer 均执行最终 collect 策略且无错误；余额字段仍按服务器推送的 `userbaseinfo.gold` 快照展示，未额外在前端合成 win 后余额。

结论：新 token 下已经完成真实 live 服务器连接、真实 spin、`GameLogic` 生成、展示完成后回 idle 的浏览器验收。

## 第二遍遗漏检查

- `packages/gameframeworks` 和 `apps/gameframeworksviewer` 已被 workspace 自动纳入，不需要修改 `pnpm-workspace.yaml`。
- `pnpm-lock.yaml` 已更新新增 importer。
- viewer `dependencies` 只有 `@slotclientengine/gameframeworks`。
- viewer 源码测试覆盖：不直接 import `uiframeworks`、`netcore`、`logiccore`。
- `framework.spin()` 返回 `GameLogic`，无 `SlotGameSpinResult` wrapper。
- collect 发生在 `adapter.playSpin(logic)` resolve 后，有单测和浏览器验证。
- adapter reject 不 collect，collect fail 进入 error。
- `presenting` 不映射为 idle，spin 按钮 disabled。
- live URL 非 ws/wss 会失败。
- live viewer 已支持复用前序默认连接参数和 spin 参数，且保持显式 `MODE=live` 才连接真实服务。
- live viewer HUD 已按服务器 USD 最小单位 `/100` 展示金额；Logic list 仍保留原始协议数值。
- 已做真实 live 连接尝试；旧 token 返回 `noticemsg2 000101|211005`，用户提供的新 token 已完成 CLI 1-spin 和 viewer 浏览器 live spin。
- 未扩展 `logiccore`，因此无需执行 logiccore 专项回归。
- 新增目录都有实际文件，无需 `.keepme`。
- 生成物未出现在 `git status --short`。

## 已知风险和后续建议

- 根级 `pnpm format:check` 仍受任务外包影响失败。建议单独开任务统一处理 monorepo 内各包 `.prettierignore`，并决定是否格式化既有未格式化源码。
- 当前 viewer 是逻辑 list 验证 app，不包含真实游戏渲染。后续接入真实游戏模板时，应继续只依赖 `@slotclientengine/gameframeworks`。
