# 93 game002 bg-win symbol overlay 任务报告

## 1. 执行结论

- UTC 完成时间：`2026-07-14 06:08:26`
- 分支：`main`
- 最终 HEAD：`ece1c64`（执行期间未提交、未改写历史）
- 实现状态：任务 93 的代码、测试、文档和协作规则改动已完成。
- 自动验收状态：任务涉及的 logiccore、rendercore、gameframeworks、game002 全部严格命令通过；game003 的定向迁移测试、static config、lint、typecheck、build、release check 通过。
- 未关闭项：按用户要求未执行浏览器/live 验收；`game003` 全量测试及根级 test 被当前 checkout 已存在的 Spine 4.2.43/4.3.x 冲突阻断；根级 format 被未修改的其它 package 既有格式问题阻断。

## 2. 工作区基线

执行前重新确认：

```text
Node.js: v24.14.0
pnpm: 11.7.0
branch: main
HEAD: ece1c64
initial status: ?? tasks/93-game002-bg-win-symbol-overlay.md
```

计划文件是执行前已有的用户 untracked 文件。本次未使用 reset、checkout、stash、清理 untracked 或批量格式化，没有覆盖该文件。

## 3. 实际实现

### 3.1 logiccore wire 合同

- `packages/logiccore/src/types.ts` 为 `WinResult` 增加可选 `coinWin64/cashWin64`。
- `packages/logiccore/src/parser.ts` 在字段存在时要求 finite number；缺失仍合法。
- parser 回归覆盖字段保留和冻结、64/旧字段并存、缺失，以及 NaN、Infinity、字符串、null 显式失败。
- shared 层没有加入 game002 金额优先级或 `bg-win` 语义。

### 3.2 rendercore 通用能力

- 新增 `VisibleSymbolPresentationTarget`，只暴露批量状态请求、状态快照、几何快照和动画推进；carousel 不 import、不判断具体 ReelSet。
- `RenderReelSet` 结构上满足该能力；`RenderGridCellReelSet` 补齐 grid 坐标 API。
- grid-cell geometry 正确叠加 cell root 位移，返回整个可见 grid 的 `(x,y)`；spin 中状态请求和 geometry read 显式失败。
- grid-cell 停轴后每 tick 继续推进内部 symbol animation，使 manifest `win once` 自然回到 normal，同时保持逐格 spin、scene、dimming、mask 和 renderPriority 合同。
- 新增 `createSymbolWinCarousel(...)`：
  - 支持多个组件名，保持组件数组顺序和各自 `usedResults` 顺序；未触发组件跳过，无组件时不回退全部 results。
  - 同一 result 被多个组件引用时分别保留 `componentName/resultIndex`。
  - `prepare()` 在 spin 前完成 component/result/pos/amount fail-fast 并返回冻结数据；`start()` 不重复解析或调用 resolver。
  - 同组 pos 同时请求 `win`，以实际中奖格中心平均点选择最近真实格，等距按 x/y；完成依据所有 symbol 自然回 normal，不使用 timer。
  - 首轮完成、循环暂停、lingering、clear、destroy、formatter/geometry/state 数量漂移和 destroyed 状态均有明确合同与测试。
- 中性 fake future target 测试证明通用实现不依赖两种现有 ReelSet。

### 3.3 game002 接入

- `Game002ReelRuntime` 只委托 rendercore public visible-symbol API，没有遍历 cell、slot、children 或 Spine player。
- 新增 app-owned `GAME002_WIN_COMPONENT_NAMES=["bg-win"]`、样式、金额 resolver 和 component validator。
- 金额严格按字段存在性选择：

```text
cashWin64 !== undefined ? cashWin64 : cashWin
```

选中值必须 finite positive；`cashWin64=0` 不回退；无 component cash、step total、totalwin fallback。

- 真实 fixture 保留 `cashWin=0/cashWin64=300`、八个真实 pos 和 `usedResults=[0]`。自动测试确认 formatter 输出 `$3.00`，anchor 选择 `(1,3)`，相对 reel 坐标为 `(180,420)`，y 再偏移 `0.22 * cellHeight`。
- adapter mount z-order 为 background、reels、result carousel、global win-amount；carousel 与 reels 使用同一 art-space 原点。
- `playSpin()` 在启动 reels 前 prepare 并 fail-fast，随后同时清理旧 carousel 与 global win-amount。
- pending 明确分为 `spinning` / `win-sequence`。停轴并校验 target scene 后才启动 result carousel 与 global win-amount；首轮和 global 主要播放都完成后 resolve，之后 carousel 继续 lingering；下一 spin clear。
- pointer 仍只调用 global win-amount `requestAdvance()`；idle/pending 错误分别走 fatal/reject；mount rollback、resize 和 destroy 均已覆盖。
- `WL,H1,H2,L1,L2,L3,L4` 均验证为 manifest exact `Win`、once 且 skeleton 实际存在该动画；feature symbols 没有被伪造 win。

### 3.4 game003 等价迁移

- 删除 app-owned `win-symbol-loop.ts` 及其重复状态机测试，adapter 改用同一个 rendercore carousel。
- `bg-wins`、positive `result.cashWin` resolver、YAML style/pause、component totals validator 留在 game003 app。
- 保留旧实现对可选 `result.symbol` 的非负整数校验；不增加 scene code 默认匹配。
- 首轮/lingering/下一 spin clear、global win-amount、coin overlay、bg-bar、minecart 的协调路径不变。
- `apps/game003/config` 与 `apps/game003/src/generated` 无 diff，static config check 通过。

### 3.5 文档与协作规则

- 更新 `packages/rendercore/README.md`：能力接口、多个组件、生命周期、未来 ReelSet 接入和职责边界。
- 更新 game002/game003 README：各自组件名、金额规则、首轮/lingering/clear 和迁移边界。
- 更新根 `agents.md`：game002 `bg-win`、64 字段存在性选择、真实格 anchor、通用 carousel 与两类 ReelSet 边界。
- `packages/logiccore/docs/usage-en.md` 的共享示例改为中性组件名，shared grep 不再出现游戏专属字面量。

## 4. 自动验收记录

### 4.1 通过

```text
git diff --check

CI=true pnpm --filter @slotclientengine/logiccore format:check
CI=true pnpm --filter @slotclientengine/logiccore lint
CI=true pnpm --filter @slotclientengine/logiccore test          # 9 files / 59 tests
CI=true pnpm --filter @slotclientengine/logiccore typecheck
CI=true pnpm --filter @slotclientengine/logiccore build

CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test         # 33 files / 232 tests
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test     # 9 files / 33 tests
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build

CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test                              # 15 files / 72 tests
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check                     # static dist passed

CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 exec vitest run tests/win-sequence.test.ts tests/source-boundary.test.ts
                                                                  # 2 files / 22 tests
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check                     # static dist passed

CI=true pnpm lint                                               # 23/23 packages
CI=true pnpm typecheck                                          # 23/23 packages
CI=true pnpm build                                              # 23/23 packages
```

边界 grep 结论：

- 通用 carousel source 对 `"bg-win"|"bg-wins"|GAME002_|GAME003_` 无匹配。
- 通用 carousel source 对具体 ReelSet 类名和 `instanceof ... ReelSet` 无匹配。
- 64 字段只在 logiccore wire/parser/test 与 game002 resolver/fixture/docs 出现。
- game002 resolver 不读取 `logic.getTotalWin()`；shared 不包含专属金额选择。
- game003 YAML/generated、Spine 资源、bg-bar、minecart、coin overlay 无任务外 diff。

### 4.2 已执行但被既有问题阻断

#### game003 全量 test / 根级 test

```text
CI=true pnpm --filter game003 test
CI=true pnpm test
```

两条命令均只在 `game003#test` 失败；根级测试在沙箱外重跑以允许 netcore 本地端口后结果为 `22 successful / 23 total`。game003 结果为：

```text
Test Files: 12 failed | 15 passed
Tests:      4 failed | 72 passed
SymbolAssetError: Symbol "WL" normal Spine skeleton version is invalid:
Unsupported Spine skeleton version "4.2.43"; supported version is 4.3.x.
```

该冲突在本任务修改面之外：当前 HEAD 的 `assets/game003-s1/WL.json` 声明 `4.2.43`，而 `packages/rendercore/package.json` 已锁 `@esotericsoftware/spine-pixi-v8 ~4.3.10`，相关 manifest/runtime/资源均无本任务 diff。仓库合同同时明确 game003 4.2 是非发布例外且本任务不得迁移、不得增加 fallback，因此没有通过削弱生产版本门或修改资源来伪造通过。最终 game003 迁移相关的定向测试 22/22 通过。

#### 根级 format

```text
CI=true pnpm format:check
```

失败来自本任务未修改的既有文件，已确认这些目录无 diff：

- `apps/uiframeworksviewer`：6 个文件；Turbo 首个失败 package。
- `apps/gengameconfig`：7 个文件。
- `apps/reelsviewer`：至少 10 个文件。

任务涉及的 logiccore、rendercore、game002、game003 独立 format check 全部通过，没有批量格式化无关用户文件。

## 5. 二次遗漏审计

- 数据：usedResults/多组件顺序、重复引用、64 字段存在性、无 fallback、pos 校验、symbolNum 非坐标数量均有回归。
- shared 边界：carousel 只依赖能力接口和 logiccore 通用 helper；游戏组件名、金额和 validator 均留在 app。
- ReelSet：逐轴与逐格 spin 模型未合并；grid-cell stopped update、geometry、spin 中失败和 renderPriority 不漂移均有测试。
- adapter：prepare-before-spin、显式 phase、停轴后启动、首轮阻塞、lingering、下一 spin clear、global amount 并行、fatal/reject、viewport/destroy 已覆盖。
- game003：重复状态机删除；旧 symbol wire 校验、component totals 与 YAML 参数保留；generated 无漂移。
- 资源：七个 pay symbol 使用真实 exact `Win`；feature symbol 未改。
- 交付：README、rendercore README、`agents.md`、source-boundary、release check 和报告均已同步。

## 6. 浏览器 / live 验收（待用户执行）

按用户要求，本次没有启动浏览器，也没有宣称视觉验收完成。执行入口：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208
```

game002 重点确认：停轴前无 result 展示；八个 L1 同时真实 Spine Win；文本 `$3.00` 锚在 `(1,3)` 中间偏下；首轮后才 collect、随后 lingering；点击仅影响 global win-amount；下一 spin 清理；不同 viewport 不漂移；无组件不播放全部 results。

game003 重点确认：`bg-wins` 顺序、金额、anchor、pause、lingering、clear 与迁移前一致；global win-amount、coin overlay、bg-bar、minecart 等待和 z-order 无回归；横竖屏对齐正常。

浏览器通过前，任务不能标记为完整 live 验收完成。

## 7. 最终工作区摘要

最终 status 只包含任务 93 的实现、测试、文档、协作规则、执行前计划文件和本报告；没有 tracked `dist/coverage/.turbo`、资源、YAML 或 generated 漂移。主要状态为：

```text
M  agents.md
M  apps/game002/...（README、adapter、runtime、fixture 与测试）
M  apps/game003/...（README、adapter、validator 与测试）
D  apps/game003/src/win-symbol-loop.ts
D  apps/game003/tests/win-symbol-loop.test.ts
M  packages/logiccore/...（wire/parser/docs/test）
M  packages/rendercore/...（能力接口、grid-cell、README、test）
?? apps/game002/src/win-symbol-carousel-config.ts
?? apps/game002/tests/win-symbol-carousel-config.test.ts
?? packages/rendercore/src/symbol-win-carousel/*
?? packages/rendercore/tests/symbol-win-carousel/*
?? tasks/93-game002-bg-win-symbol-overlay.md              # 执行前用户文件
?? tasks/93-game002-bg-win-symbol-overlay-260714-060826.md # 本报告
```

未执行 git add、commit 或 push。

## 8. 浏览器反馈后的 Vite dev 修复

UTC `2026-07-14 06:51:46` 收到 game002 浏览器错误：

```text
The requested module '/@fs/.../packages/logiccore/dist/index.js'
does not provide an export named 'getComponentWinResultGroups'
```

根因不是 logiccore 漏导出：`src/index.ts` 和 CommonJS `dist/index.js` 均包含该导出。问题是 game002 将 rendercore alias 到 TypeScript 源码后，新增 carousel 产生了第一个 logiccore runtime import；Vite dev 对 workspace CommonJS `dist/index.js` 进行了浏览器原生 ESM 加载，因而无法识别 CommonJS named export。production build 的 CommonJS 转换会掩盖此问题，所以原 build/release check 没有暴露它。

修复内容：

- 在 `apps/game001/vite.config.ts`、`apps/game002/vite.config.ts`、`apps/game003/vite.config.ts` 增加 `@slotclientengine/logiccore -> packages/logiccore/src/index.ts` alias。
- 三个 app 都会从 rendercore root 导出图加载 carousel，因此同步修复，避免 game001/game003 留下同源 dev 回归。
- app 仍未直接依赖或 import logiccore；该 alias 只是 rendercore 源码联调时的传递依赖解析，与 rendercore/gameframeworks/uiframeworks 现有 Vite 配置一致。
- 更新三套 source-boundary 回归，要求 logiccore ESM source alias 存在且排在 rendercore root alias 前，同时继续禁止 app source/package 直接依赖 logiccore。

临时启动 game002 Vite dev `127.0.0.1:5216` 后读取转换模块，已确认响应改为：

```ts
import { getComponentWinResultGroups } from "/@fs/Users/zerro/github.com/slotclientengine/packages/logiccore/src/index.ts";
```

不再请求 `packages/logiccore/dist/index.js`。验证后已停止临时 dev server，没有执行浏览器视觉验收。

补充验收：

```text
game001 source-boundary: 3/3
game002 source-boundary: 8/8
game003 source-boundary: 14/14
game001/game002/game003 lint: passed
game001 test: 10 files / 48 tests passed
game001 typecheck/build: passed
game002 test: 15 files / 72 tests passed
game002 typecheck/build/release:check: passed
game003 typecheck/build/release:check: passed
game001/game002/game003 format:check: passed
git diff --check: passed
```
