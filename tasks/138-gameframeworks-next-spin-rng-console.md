# 138 gameframeworks-next-spin-rng-console 任务计划

## 1. 目标与完成定义

### 目标

为测试服 spin 的隐藏 `lstrand` 参数提供通用、一次性的浏览器控制台入口。开发者可以在使用
`@slotclientengine/gameframeworks` 的游戏中输入可复制的 `rng(...)` 指令，替换下一次实际发出的
spin 请求所用 RNG 序列；game002 迁移到该通用能力，并继续输出服务器返回的本轮 RNG。

### 完成定义

- [ ] game002 浏览器控制台可执行
      `rng(8, 61, 41, 33, 13, 729)`，下一次实际发送的 spin `ctrlparam` 精确包含
      `lstrand: [8, 61, 41, 33, 13, 729]`。
- [ ] 该 override 只消费一次；随后 spin 恢复原 `buildSpinRequest` 输出，不残留
      `lstrand`。
- [ ] 连续设置时最后一次合法指令覆盖尚未消费的序列；非法指令显式失败且不破坏原 pending
      序列。
- [ ] 当前 spin 已发出后再输入指令，不修改在途请求，只作用于后续下一次 spin。
- [ ] gameframeworks 在启用该能力时把每次成功解析的 GMI
      `GameLogic.getRandomNumbers()` 输出为可直接复制执行的 `rng(...)`；game002 不再私有输出同一
      信息。
- [ ] 未启用控制台能力的 consumer、bet/lines/times/autonums、spin/presentation/collect
      顺序、本地公开轮带和视觉 phase RNG 行为保持不变。
- [ ] framework destroy 后注销本实例安装的控制台指令，不保留 pending RNG、全局引用或覆盖宿主
      后续写入。
- [ ] gameframeworks 与 game002 的定向自动化验收通过；使用真实测试服确认一次性服务端局面控制。

## 2. 范围

### 包含

- `packages/gameframeworks`：
  - 通用 RNG 控制台指令的 public option/type、严格校验、一次性 pending 状态、spin 请求合并、
    GMI RNG 日志和 destroy 清理；
  - public export、README 和直接保护合同的测试。
- `apps/game002`：
  - 在正式 game entry 中显式启用通用控制台能力；
  - 移除 adapter 私有 RNG 输出，保留并准确命名 multiplier diagnostic logger；
  - 更新接入测试和 README。
- `docs/agent-rules/shared-game-runtime.md`：
  - 记录测试服 `lstrand` 只属于一次性请求 override，不能成为本地视觉随机源或真实轮带来源。

### 不包含

- 不修改测试服务器、WebSocket 协议格式或 `packages/netcore` 的通用透传逻辑。
- 不把 `lstrand` 写入 URL、YAML、manifest、localStorage、cookie、玩家状态或长期配置。
- 不实现多轮 RNG 队列、自动重放、历史收藏、UI 输入框、远程调试接口或 production feature flag
  系统。
- 不用 server `randomNumbers`/`lstrand` 驱动 rendercore reel phase、CN presentation 或其它客户端
  视觉随机。
- 不读取、缓存、推断或输出服务器真实轮带。
- 不顺手改造 game001/game003/gameviewer；它们可通过同一显式 option 后续启用，不复制实现。

## 3. 制定计划时的基线

```text
UTC: 2026-07-30T03:51:46Z
HEAD: d1865892eda9c4a33dc44220f05d8eeeaaf1d037
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时必须保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取的规则与模板：

```text
AGENTS.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/game002.md
tasks/templates/task-plan.md
```

`packages/gameframeworks` 与 `apps/game002` 当前没有更深层 `AGENTS.md`。

当前实现结论：

- `packages/gameframeworks/src/framework.ts`
  `SlotGameFrameworkImpl.spin()` 先通过 `buildSpinParams()` 生成请求，再调用
  `SlotGameLiveSessionLike.spin(params)`；这里是一次性 `lstrand` 合并的通用边界。
- 同文件 `buildSpinParams()` 负责 bet option 与 app `buildSpinRequest` 的合并；当前没有 pending
  one-shot override。
- `packages/gameframeworks/src/types.ts`
  `SlotGameSpinRequest` 与 netcore `SpinParams` 均允许额外字段，但
  `SlotGameFrameworkOptions` 没有控制台 RNG 配置。
- `packages/netcore/src/live-client.ts` `LiveClient.spin()` 把
  `bet/lines/times/autonums/ctrlname` 之外的 `...rest` 原样放入 `ctrlparam`，所以现有代码已经能够
  透传 `lstrand`，无需修改 netcore。
- `apps/game002/src/game-entry.ts` 的 `buildSpinRequest` 当前固定返回 launch config 中的
  `bet/lines/times/autonums`。
- `apps/game002/src/game-adapter.ts` `Game002PixiAdapter.playSpin()` 当前输出
  `rng 1,2,...`；同一个 `logRng` callback 还被误用于 multiplier settled-scene diagnostics。
- `apps/game002/tests/game-adapter.test.ts` 当前只保护 adapter 私有 RNG 日志，没有保护请求级
  `lstrand`、one-shot 或控制台生命周期。

## 4. 需求解释与技术决策

### 需求解释

- “换下一次 spin”指下一次通过 framework 前置状态检查、构造参数并交给 session 的 spin；在
  before-connect、非 idle 或 destroyed 状态被拒绝的调用不消费 pending 序列。
- 指令采用浏览器控制台可执行的标准 JavaScript 形式：
  `rng(8, 61, 41, 33, 13, 729)`。成功 spin 的日志使用同一形式，允许复制后改数字再执行。
- 序列必须非空，且每项是非负 safe integer；允许 `0`，拒绝负数、小数、`NaN`、Infinity、
  string、array alias 和其它隐式转换。
- 多次合法调用采用 last-write-wins；这是“换这个序列”的单 pending slot，不是队列。
- pending 序列在请求即将交给 session 时原子 take。session 失败时不自动恢复，因为请求是否已到达
  服务器无法可靠判断，自动重试可能重复控制局面。
- app 自己的 `buildSpinRequest` 若已有 `lstrand`，本次 pending console override 在消费的那一轮
  明确覆盖它；下一轮恢复 app 原输出。game002 当前不提供静态 `lstrand`。

### 关键决策

1. **通用能力由 gameframeworks 拥有，consumer 显式启用**
   - 在 `SlotGameFrameworkOptions` 增加 instance-scoped RNG console option，由 framework 创建、
     使用和销毁 controller。
   - game002 传入浏览器 target/logger；未启用的 consumer 不产生全局 `rng`，避免库默认污染
     global namespace 或把测试服能力无条件带给全部 production app。

2. **直接增强最终 spin params，不修改 netcore**
   - one-shot controller 在 `buildSpinParams()` 完成后才覆盖 `lstrand`，其它字段保持原样。
   - netcore 已有 extra-field 透传合同；为本任务修改网络包会重复职责并扩大 public API。

3. **控制台挂载严格处理冲突和 ownership**
   - 安装前若 target 已存在 `rng`，显式失败，不静默覆盖宿主或另一 framework。
   - 安装的 function identity 由 controller 保存；destroy 只移除仍属于本实例的属性。如果外部在运行期
     替换该属性，不删除外部的新值。
   - target 不可写、不可扩展或 property definition 失败时在 framework 创建边界显式报配置错误。

4. **RNG 输出随通用 console 能力迁移**
   - framework 在 `createSlotGameLogicResult()` 成功后、adapter presentation 前，用注入 logger 输出
     `rng(...)`。
   - game002 adapter 只保留业务 multiplier diagnostic callback，命名为 `logDiagnostic`；不再承担
     请求调试功能。

5. **不扩大 framework state snapshot**
   - pending 测试 override 是短生命周期调试状态，不进入 HUD、platform snapshot、玩家状态或
     `SlotGameStateSnapshot`，避免 UI consumer 获得无关或可持久化的 server override。

## 5. 职责与合同

- **gameframeworks**：拥有命令注册、输入校验、immutable copy、last-write-wins pending slot、
  one-shot take、请求覆盖、返回 RNG 格式化和 destroy 清理。
- **game002**：只声明启用该能力并提供实际 browser target/logger；不自行解析命令或维护
  `lstrand`。
- **netcore**：继续按现有 `SpinParams` extra fields 透传到 `gamectrl3.ctrlparam`，不识别 RNG 业务
  语义。
- **数据合同**：
  - console 输入：一个或多个非负 safe integer positional arguments；
  - wire 输出：`lstrand: readonly number[]` 的普通 JSON array 形态；
  - 日志输出：`rng(<comma-separated integers>)`。
- **消费边界**：
  - take 发生在 app base request 已成功构造、session spin 即将调用的边界；
  - 无 pending 时不添加、删除或规范化 base request 的 `lstrand`；
  - pending 被 take 后无论网络结果如何都不恢复。
- **失败策略**：
  - 空序列或非法元素抛出带 index/value context 的 `SlotGameConfigError`，原 pending 不变；
  - global command 冲突或无法安装时 framework 创建失败；
  - 日志 callback 不得改变 spin/presentation/collect 结果；沿用 framework observer 的非权威失败
    策略，具体测试固定。
- **禁止行为**：字符串 split/JSON 猜测、array/variadic 双 alias、silent coercion、默认 RNG、
  多轮缓存、session 失败自动重放、server RNG 驱动画面或 game002 私有副本。

## 6. 文件范围

### 预计新增

```text
packages/gameframeworks/src/rng-console.ts
packages/gameframeworks/tests/rng-console.test.ts
```

### 预计修改

```text
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/types.ts
packages/gameframeworks/tests/framework-flow.test.ts
packages/gameframeworks/tests/exports.test.ts
packages/gameframeworks/README.md

apps/game002/src/game-entry.ts
apps/game002/src/game-adapter.ts
apps/game002/tests/loading-flow.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/README.md

docs/agent-rules/shared-game-runtime.md
```

测试最终可按职责合并到现有 test file；若不需要独立 `rng-console.test.ts`，执行报告说明小幅文件偏差。

### 原则上不应修改

```text
packages/netcore
packages/logiccore
packages/rendercore
packages/uiframeworks
apps/game001
apps/game003
apps/gameviewer
assets
pnpm-lock.yaml
```

若执行发现服务器要求的 `lstrand` wire 类型不是 number array，或必须改 netcore 才能透传，属于合同
变化，必须先停止并说明，不能通过猜测或兼容 fallback 扩大计划。

## 7. 实施步骤

1. **确认执行基线**
   - 重新核对 HEAD、工作区、上述规则、framework spin 链和 netcore `...rest` 透传。
   - 若入口只有小幅移动，按当前 symbol 适配并在报告说明；若职责变化则停止重新确认范围。

2. **实现通用 one-shot controller**
   - 在 `packages/gameframeworks/src/rng-console.ts` 实现 option validation、`rng(...values)` 注册、
     immutable pending copy、原子 take、copyable formatter 和 idempotent destroy。
   - 对 property collision、非法序列、重复设置、外部替换 command、重复 destroy 建立确定合同。

3. **接入 framework spin 生命周期**
   - 扩展 `SlotGameFrameworkOptions` 和 public type/export。
   - framework constructor 根据显式 option 创建 controller；`spin()` 在 base params 构造成功后 take
     并仅覆盖本轮 `lstrand`。
   - logic 成功解析后输出返回 RNG；destroy 清空 pending 并注销指令，包含 constructor/mount/UI
     失败触发的 cleanup 路径。

4. **迁移 game002 consumer**
   - `game-entry.ts` 显式传入 `window` 和 console info logger，使正式 game002 获得通用指令。
   - 删除 `Game002PixiAdapter.playSpin()` 的 RNG 输出；把仍供 multiplier compiler 使用的
     `logRng` 重命名为 `logDiagnostic`，避免混淆两类日志。
   - 更新 app 测试，确认 framework option 已接入且 adapter 不再拥有 RNG 请求调试职责。

5. **同步测试、README 与规则**
   - gameframeworks 覆盖合法输入、非法输入保留 pending、last-write-wins、one-shot、base request
     precedence、在途设置、session rejection 不恢复、copyable log、冲突和 destroy ownership。
   - 更新 gameframeworks README 的 opt-in API/命令/lifecycle；更新 game002 README 的实际使用方式和
     测试服限制。
   - 在 shared runtime 规则加入最小稳定边界，不把具体样例序列复制成长期规则。

6. **定向验收与报告**
   - 使用第 8 节 L2 命令验证 package 与直接 consumer。
   - 有有效测试服 credential 时执行人工网络验收；没有时在报告中明确列为未完成，不用 mock 冒充。
   - 生成 UTC 执行报告，不 commit、不 push、不创建 PR。

## 8. 测试与验收

### 测试原则

- 单测直接观察 session 收到的 params 和 console target property，不依赖真实 WebSocket。
- 使用 immutable snapshot 证明调用后修改外部输入不会改变 pending；虽然 canonical API 为 variadic，
  controller 内部仍不得复用可变收集数组。
- 覆盖正常路径、严格失败、spin 状态边界、请求失败的不恢复策略和 destroy cleanup。
- 不为测试放宽输入，不接受 string、嵌套 array 或 silent conversion。

### 验收级别

`L2`。原因是修改 `@slotclientengine/gameframeworks` public options/types 和 framework spin 请求行为，
并同步直接 consumer game002；不涉及根工具链、lockfile、生成器或 release，故不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
pnpm --filter game002 test
pnpm --filter game002 typecheck
git diff --check
```

gameframeworks build 用于验证新增 public declaration/export；game002 test/typecheck 验证直接 consumer
接入。没有资源或生成配置变化，不运行 game002 resource generator/release check。

### 人工验收

在 game002 固定测试服、有效 launcher credential 和 Chromium DevTools 下：

1. 完成一次普通 spin，确认控制台出现可执行的 `rng(...)`，无旧 `rng 1,2` 重复日志。
2. 执行 `rng(8, 61, 41, 33, 13, 729)` 后 spin，检查 Network/WebSocket payload 的下一次
   `gamectrl3.ctrlparam.lstrand` 精确匹配，并确认服务器返回预期局面。
3. 再 spin 一次，确认 payload 不再带本次 override；在前一轮 presentation 期间设置新值时，确认只影响
   后续请求。
4. 输入空、负数、小数、string 与 array 形式，确认显式报错且此前合法 pending 仍可被下一轮消费。
5. destroy/刷新后确认旧 command owner 与 pending 不残留，控制台无重复注册、未处理 rejection 或额外
   WebSocket。

### 独立验收建议

`建议`。涉及跨包 public contract 和测试服隐藏 server override，但不涉及 credential 持久化、正式 schema、
生成物或资源 transaction。独立复验高风险点：

```bash
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter game002 test
```

另需独立观察一轮真实 WebSocket 的 one-shot payload；自动化单测不能替代服务器行为。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 和 pnpm；shell 未激活 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行：

  ```bash
  CI=true pnpm install --frozen-lockfile
  ```

- 只有下载实际失败后才设置 `http_proxy`/`https_proxy` 为 `http://127.0.0.1:1087` 并重试原命令。
- 本任务不新增依赖、不修改 package version 或 `pnpm-lock.yaml`。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、manifest 或生成 TypeScript，不应产生生成物 diff。
- 更新 `packages/gameframeworks/README.md`：opt-in 配置、canonical `rng(...)`、输入限制、one-shot
  消费边界、base `lstrand` precedence、destroy 和测试服限定。
- 更新 `apps/game002/README.md`：game002 已启用、返回 RNG 日志可复制、人工验证方式。
- 更新 `docs/agent-rules/shared-game-runtime.md` 的最小稳定职责；不修改根 `AGENTS.md` 或
  game002 专属动画/资源合同。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/138-gameframeworks-next-spin-rng-console-<utctime>.md
```

UTC 通过 `date -u +%y%m%d-%H%M%S` 取得。报告简要记录最终实现、实际文件、关键决策/偏差、上述命令
结果、真实测试服人工验收状态和剩余风险；不收集无关 coverage 历史、全仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- 测试服务器可能忽略、拒绝或改变未公开 `lstrand` 合同；真实 wire 行为必须用有效测试服复验。
- browser global 的短名称 `rng` 可能与宿主页冲突；本计划选择 fail-fast，不能静默覆盖。
- session rejection 时请求是否到服不确定；one-shot 不恢复会牺牲本地自动重试，但避免重复触发同一
  强制局面。
- 若生产构建也显式启用该 option，console command 会存在于生产页面；README 必须明确其测试服用途，
  consumer 仍负责是否启用。

### 假设

- 用户样例表示 wire 形态为 JSON number array，且每项符合非负 safe integer。
- `packages/netcore/src/live-client.ts` 的现有 `...rest` 透传继续把 `lstrand` 放入
  `gamectrl3.ctrlparam`。
- game002 固定 live endpoint 是支持该隐藏参数的测试服务器。
- 同一页面正常只启用一个 owning framework；多实例抢占同一 `rng` 名称按冲突显式失败。

### 待确认

无。若执行时真实服务器证明上述 wire 类型或数值范围不成立，应停止并请求新的协议合同。

## 13. 完成清单

- [ ] 通用 opt-in `rng(...)` 指令与 strict validation 已实现。
- [ ] next-dispatched-spin、last-write-wins、one-shot 和失败不恢复语义已保护。
- [ ] game002 已启用通用能力，adapter 私有 RNG 输出已移除。
- [ ] global property ownership、冲突与 destroy cleanup 已保护。
- [ ] server RNG 未进入本地视觉 phase、长期状态或静态配置。
- [ ] public export、README 和 shared runtime 规则已同步。
- [ ] 指定 L2 自动化验收已通过。
- [ ] 真实测试服人工验收已完成，或在报告中明确标为未完成。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划、`shared-game-runtime.md` 与 `game002.md`；
2. 核对 Git 基线和工作区，保留用户无关修改；
3. 按 one-shot controller → framework lifecycle → game002 接入 → 测试/文档顺序实施；
4. 小幅适配当前 symbol/file 时在报告记录，重大 public API、wire 或范围变化先停止说明；
5. 只运行本计划规定的 L2 验收，失败时先最小化复现；
6. 区分 mock 自动化与真实测试服人工验收；
7. 完成后生成 UTC 报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
