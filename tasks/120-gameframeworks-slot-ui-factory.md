# Task 120：gameframeworks 游戏内 UI Factory 与状态边界解耦

## 1. 任务目标

本任务在最新 `main` 基线上，为 `@slotclientengine/gameframeworks` 建立可注入、per-instance、presentation-only 的游戏内 UI contract，把 framework 的 round 状态机与当前默认 `uiframeworks` DOM UI 解耦。

目标结构：

```text
game002 / game003
        |
        v
@slotclientengine/gameframeworks
  - connect / spin / presentation / collect / idle
  - balance / bet / win / error
  - session / adapter / destroy
  - SlotGameUiFactory contract
        |
        +-- 默认实现：现有 @slotclientengine/uiframeworks controller
        |
        +-- 未来实现：Leo 游戏内 UI（不在 Task 120 范围）
```

任务完成后：

1. `gameframeworks` 继续作为游戏唯一 facade 和 round 状态 owner。
2. `createSlotGameFramework()` 支持注入 `SlotGameUiFactory`，不传时继续使用当前默认 UI。
3. 当前 `SlotGameUiAdapter` 对 `createSlotUiController()` 的硬编码创建关系被收敛为默认 factory 实现。
4. UI 只接收只读状态 snapshot 和 typed commands，不拥有 socket、spin、presentation、collect 或 balance reconciliation。
5. UI instance、DOM、viewport listener、timer 和销毁生命周期都限定在单个 framework instance 内。
6. game002、game003 的可见 UI、live、spin payload、adapter、loading 99%/100% 和发布产物行为保持不变。

本任务只建立 UI 扩展接口，不实现 Leo 游戏内 UI。Leo HUD 应在后续独立任务中通过本任务的 factory contract 接入。

任务完成后必须新增中文执行报告：

```text
tasks/120-gameframeworks-slot-ui-factory-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 实现基线与分支要求

### 2.1 最新 main 基线

开始实现前必须确认：

```bash
git status --short --branch
git log -1 --oneline main
git log -1 --oneline origin/main
git log -1 --oneline gitee/main
```

Task 120 必须基于已经包含 Task 118 loading 重构及其验收收尾修复的最新 `main`。Task 118 收尾修复参考提交为：

```text
06daa7b fix: close task 118 loading UI acceptance gaps
```

如果该提交已被 squash、cherry-pick 或以等价修改进入 `main`，以实际最新 `main` 为准，不要求保留相同 commit id。

建议实现分支：

```text
codex/task-120-gameframeworks-slot-ui-factory
```

如果 main 工作树存在其他同事的未提交修改，不得移动、清理、stash、覆盖或顺带提交；应从最新 main 创建独立 worktree/分支实施。

### 2.2 test 分支不是实现基线

不得 merge 或 cherry-pick `test` 分支中的以下集成：

- `game-leo-frameworks`；
- `ui-leo-frameworks`；
- `netcore2`；
- `eventcore` 驱动的 round continuation；
- `stateData`；
- 全局 Zustand stores；
- 全局 Inversify container；
- `__PLATFORM__` Vite 源码替换。

Task 120 不需要迁移 `test` 分支的任何视觉组件或资源。

## 3. Node 与 pnpm 环境约束

仓库要求 Node.js `>=24.0.0`。执行任务时必须先检查当前 shell：

```bash
command -v node
command -v pnpm
```

如果当前 shell 中没有 `node`，先进入已经安装好的 nvm Node 24 环境：

```bash
nvm use 24
```

然后确认：

```bash
node --version
pnpm --version
command -v node
command -v pnpm
```

后续 install、generate、test、lint、typecheck、build 和 release check 必须统一使用这次 `nvm use 24` 环境中解析到的 `node` 与 `pnpm`。

环境处理不得变成仓库修改：

- 不执行 `nvm install`，除非用户另行明确要求安装；
- 不为了当前 shell 修改 `.nvmrc`；
- 不修改 `package.json` 的 `engines` 或 `packageManager`；
- 不强制升级或降级 Node、pnpm；
- 不因为本机环境重写 lockfile；
- 不混用系统 Node、其他 nvm 版本或另一套 pnpm；
- 不通过修改仓库版本约束来绕过本机命令不可用问题。

如果执行器的后续命令会启动新的 shell，必须确保新 shell 仍使用同一 Node 24 bin 路径；不能在同一次验收中混用多套 Node/pnpm。

## 4. 当前 main 实现事实

### 4.1 round 状态机已经集中在 gameframeworks

当前 `packages/gameframeworks/src/framework.ts` 已建立明确的线性顺序：

```text
connect
  -> applyInitialState
  -> idle

spin
  -> session.spin
  -> create GameLogic
  -> adapter.playSpin
  -> optional session.collect
  -> update balance
  -> idle
```

并发 spin 会被 framework 拒绝；adapter presentation reject 时不会 collect；session、adapter 和 UI 由 framework 统一 destroy。这些合同必须保留。

### 4.2 UI 创建仍被硬编码

当前 `packages/gameframeworks/src/framework.ts` 直接构造 `SlotGameUiAdapter`，而 `packages/gameframeworks/src/ui-adapter.ts` 内部直接调用：

```ts
createSlotUiController(...)
```

因此 framework 虽然拥有正确状态机，但只能使用当前 `uiframeworks` DOM UI，无法安全注入后续 Leo 游戏内 UI。

### 4.3 uiframeworks 已有 presentation controller

`packages/uiframeworks/src/controller.ts` 的 `createSlotUiController()` 已提供：

- frame / gameLayer / overlay；
- viewport snapshot 和 resize subscription；
- UI snapshot update；
- command handlers；
- destroy。

Task 120 应使用这一 controller 作为默认实现，不应扩展或复制 `uiframeworks` 内仍存在的旧 network/round framework 路径。

## 5. 目标公共 contract

公共 contract 归 `@slotclientengine/gameframeworks` 所有。名称允许根据仓库现有风格做小幅调整，但必须保留以下职责边界。

```ts
export interface SlotGameUiElements {
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
}

export interface SlotGameUiCommands {
  requestSpin(): void;
  increaseBet(): void;
  decreaseBet(): void;
  setMuted(muted: boolean): void;
  setFastMode(enabled: boolean): void;
  setAutoMode(enabled: boolean): void;
}

export interface SlotGameUiCreateContext {
  readonly root: HTMLElement;
  readonly designSize: { readonly width: number; readonly height: number };
  readonly framePolicy?: SlotGameFramePolicy;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialState: SlotGameStateSnapshot;
  readonly brandLabel?: string;
  readonly currency?: string;
  readonly locale?: string;
  readonly formatMoney?: (amount: number) => string;
  readonly commands: SlotGameUiCommands;
}

export interface SlotGameUi {
  readonly elements: SlotGameUiElements;
  getViewport(): SlotGameViewportSnapshot;
  onViewportChange(listener: SlotGameViewportListener): () => void;
  update(state: SlotGameStateSnapshot): void;
  destroy(): void;
}

export interface SlotGameUiFactory {
  create(context: SlotGameUiCreateContext): SlotGameUi;
}
```

`SlotGameFrameworkOptions` 增加可选字段：

```ts
readonly uiFactory?: SlotGameUiFactory;
```

不传 `uiFactory` 时，必须创建当前默认 `uiframeworks` controller UI。

### 5.1 create 必须同步返回稳定 host

`factory.create()` 必须同步返回有效的 `frame/gameLayer/overlay` 和完整 UI handle。未来 React UI 可以在内部创建 React root，但 host DOM 必须同步建立；不得等待 React effect 后再通过全局 selector 反查节点。

### 5.2 snapshot 是只读投影

`SlotGameStateSnapshot` 的唯一 owner 仍是 framework：

```text
framework state
  -> ui.update(readonly snapshot)
```

UI 不得修改 snapshot，不得在 UI package 建立 balance、round、collect 或 adapter identity 的第二份权威状态。

UI 实现可以保存最后一次 snapshot 用于渲染，但它只是 presentation cache，不能自行推进业务状态。

### 5.3 command 只能回到 framework

UI command 的调用方向固定为：

```text
UI interaction
  -> typed command
  -> framework
  -> state transition
  -> ui.update(new snapshot)
```

command 不得直接调用：

- netcore client 或 live session；
- game adapter；
- collect；
- loading controller；
- event bus；
- app-owned singleton。

`requestSpin()` 由 framework 启动并吸收 click handler 的 fire-and-forget rejection，同时必须保留 framework 业务层的并发 spin 防护。CSS disabled 状态不能替代业务互斥。

## 6. 默认 UI 实现

现有 `SlotGameUiAdapter` 可以重构为默认 `SlotGameUiFactory`，也可以拆成更清楚的 default factory/controller adapter。无论选择哪种文件组织，都必须满足：

1. 只从 `@slotclientengine/uiframeworks` public entry 导入；
2. 继续复用 `createSlotUiController()`；
3. 保持当前 DOM class、布局、frame policy、money formatter 和按钮行为；
4. 不复制 `uiframeworks` 的 DOM、CSS、viewport 或 layout 算法；
5. 不把默认 UI 的私有类型泄露进公共 `SlotGameUi` contract；
6. 默认 factory 可以由 `gameframeworks` 内部创建，不要求 game app 直接依赖 `uiframeworks`。

game002、game003 在 Task 120 中原则上不需要显式传 `uiFactory`。它们继续验证“不传 factory 的默认路径完全兼容”。

## 7. 状态和生命周期约束

### 7.1 禁止 stateData 模式

Task 120 不得新增以下链路：

```text
framework -> event -> app stateData -> adapter -> callback -> framework
```

不得使用 payload 中携带 optional `spinEnd` continuation，也不得把 adapter presentation completion 改成 EventEmitter ack。

保留：

```text
await session.spin()
  -> await adapter.playSpin()
  -> await collectIfNeeded()
  -> idle
```

### 7.2 per-instance

每次 `createSlotGameFramework()` 必须创建独立的：

- UI instance；
- command object；
- viewport subscription 集合；
- state projection；
- DOM/React host（未来实现）；
- destroy 生命周期。

禁止模块级 UI singleton、全局 store、全局 container、全局 root、全局 adapter reference 或 `document.querySelector()` 查找通用 class。

### 7.3 destroy

`framework.destroy()` 必须：

1. 幂等；
2. 只调用一次 UI destroy；
3. 继续 disconnect session；
4. 继续 destroy game adapter；
5. 让 UI command 在 destroy 后不能启动新业务操作；
6. 让 viewport listener 不再收到事件；
7. 不因 UI factory 抽象而改变现有销毁顺序或产生双重 destroy。

Task 120 还应补充“active connect/spin 与 destroy 交错”的测试。每个关键 `await` 恢复后必须确认 framework/operation 仍有效，避免 destroy 后迟到 continuation 继续 apply initial state、presentation 或 collect。可以使用 instance generation、operation token 或等价的显式机制；不得依赖 UI disabled 状态或希望 socket 一定 reject。

## 8. 错误合同

- UI factory 配置错误应在创建边界显式失败；
- factory 返回缺失 frame/gameLayer/overlay、update、viewport 或 destroy 的非法 handle 时应显式失败；
- UI command 不得吞掉 framework 已发布的 error state；
- presentation、session 和 collect 错误继续由 framework 现有 error 路径处理；
- UI update 自身若失败，不得递归调用同一个失败 UI 的 update 形成错误循环；应保留原始异常并执行可证明的清理；
- `onError` 不得因同一个失败被重复调用。

错误处理实现不应把 UI package 变成不可信插件沙箱；目标是清晰 fail-fast 和可测试清理，不是恢复任意第三方 UI。

## 9. package 与依赖边界

Task 120 不增加第三方运行时依赖。

必须保持：

```text
game app
  -> @slotclientengine/gameframeworks
      -> @slotclientengine/uiframeworks（默认 UI 实现）
      -> @slotclientengine/netcore
      -> @slotclientengine/logiccore
```

禁止新增：

- React；
- Zustand；
- Inversify；
- eventcore；
- netcore2；
- game-leo-frameworks；
- ui-leo-frameworks；
- app 到 `uiframeworks/netcore/logiccore` 的新直接依赖；
- package 内部 `src/*` 路径导入。

本任务不创建 Leo 或 Wildsheep placeholder package、alias、registry entry 或 fallback。

## 10. 实施步骤

### 10.1 先写 contract tests

先为 fake UI factory 建立 contract tests，再重构默认 UI：

1. factory 每个 framework instance 只创建一次；
2. create context 收到冻结/只读配置和 initial state；
3. adapter mount 使用 factory 返回的 `gameLayer/overlay/frame`；
4. framework 状态变化按顺序推送给 UI；
5. UI commands 驱动现有 framework methods；
6. 连续两次 requestSpin 只产生一个 session spin；
7. viewport snapshot 和 subscription 通过 UI port 转发；
8. destroy 幂等且每个依赖只清理一次；
9. 两个实例的 DOM、state、commands、listeners 完全隔离；
10. destroy 与 connect/spin/presentation 交错时，没有迟到 apply/collect。

### 10.2 抽取公共类型和默认 factory

- 在 `gameframeworks/src/types.ts` 或职责清晰的独立模块中定义 UI contract；
- 从 `gameframeworks` public entry 导出 UI contract 类型；
- 将当前 `SlotGameUiAdapter` 调整为 contract 的默认实现；
- `SlotGameFrameworkOptions.uiFactory` 只选择 presentation，不改变 session 或 adapter。

### 10.3 接入 framework

- framework constructor 选择 injected factory 或 default factory；
- 建立 per-instance commands；
- 保持初始 state apply、adapter mount 和 frame host 时序；
- 保持 round Promise 链不变；
- 保持现有 `onStateChange`，不能用 UI factory 取代 public observer。

### 10.4 回归 game002 / game003

两个 app 不迁移 UI，只验证默认行为：

- loading 仍使用 Task 118 的独立 UI；
- 100% 后才动态加载正式游戏和默认 HUD；
- prepared live session 仍只创建一次；
- spin request 完全一致；
- game002 `lines=30`；
- game003 固定 gamecode/server 和 app extension 不变；
- frame policy、viewport 和 resize 不变。

## 11. 最低测试集合

### 11.1 gameframeworks

至少覆盖：

1. 默认 factory 的 DOM/交互行为与重构前一致；
2. injected fake factory 接收完整 context；
3. initial snapshot、connecting、idle、spinning、presenting、collecting、error 顺序；
4. requestSpin 并发保护；
5. adapter presentation resolve 后才 collect；
6. adapter reject 不 collect；
7. factory elements 用于 adapter mount；
8. viewport initial snapshot、resize 和 unsubscribe；
9. multiple instance isolation；
10. destroy idempotency；
11. destroy during connect；
12. destroy during session spin；
13. destroy during adapter presentation；
14. invalid factory/handle fail-fast；
15. UI update error 不产生递归 error/update。

### 11.2 uiframeworks

- 现有 controller、DOM、layout、state、format 和 exports 测试全部通过；
- 不改变默认 UI CSS/DOM snapshot；
- 不扩展旧 `createSlotUiFramework()` 的网络/round 职责。

### 11.3 game002 / game003

- 两个 app 现有 test、typecheck、build 全部通过；
- 两个 app `release:check` 必须串行执行；
- 不并行构建共享 package `dist`，避免不同 app 的 prepare/build 互相删除或覆盖 declaration 产物；
- 静态产物检查继续证明 loading initial entry 与正式 game-entry 分离。

## 12. 自动化验收命令

在同一套 Node 24 / pnpm 环境中执行。具体 filter 名以实际 package.json 为准。

```bash
pnpm --filter @slotclientengine/gameframeworks format:check
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks build

pnpm --filter @slotclientengine/uiframeworks format:check
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks build

pnpm --filter game002 format:check
pnpm --filter game002 lint
pnpm --filter game002 typecheck
pnpm --filter game002 test
pnpm --filter game002 release:check

pnpm --filter game003 format:check
pnpm --filter game003 lint
pnpm --filter game003 typecheck
pnpm --filter game003 test
pnpm --filter game003 release:check

git diff --check
git status --short
```

game002 与 game003 的 `test/typecheck/release:check` 中包含共享依赖构建，应按 app 串行执行。只允许互不写共享产物的纯检查并行。

## 13. Source-boundary 验收

应增加静态边界测试，证明：

1. `gameframeworks` 不包含 `netcore2`、`game-leo-frameworks`、`ui-leo-frameworks`；
2. 不出现 `stateData`、全局 EventEmitter round bridge 或 optional `spinEnd` payload；
3. 不新增 React、Zustand、Inversify；
4. 默认 UI 只从 `@slotclientengine/uiframeworks` public entry 导入；
5. game002/game003 不新增对 `uiframeworks/netcore/logiccore` 的直接依赖；
6. game002/game003 initial loading entry 不静态导入未来游戏 UI；
7. `SlotGameUiFactory` 只能选择 presentation，不能创建 session 或 game adapter；
8. 不使用 `document.querySelector()` 全局 class 查找完成 mount。

## 14. 非目标

Task 120 不处理：

- Leo 游戏内 React UI；
- Wildsheep UI；
- Leo/Wildsheep runtime platform switch；
- netcore2 或二进制 transport；
- PlatformBootstrapProvider；
- launcher config、translation、setting、jurisdiction；
- buy feature 新业务；
- auto spin 新状态机；
- free spin、replay、断线恢复协议扩展；
- game002/game003 玩法、rendercore、Pixi、Spine、VNI 改动；
- Loading UI 视觉调整；
- `uiframeworks` 旧完整 framework API 的删除。

## 15. 完成标准

只有同时满足以下条件，Task 120 才能标记完成：

1. `SlotGameUiFactory` contract 已从 `gameframeworks` public entry 导出；
2. `createSlotGameFramework()` 支持 injected factory，并保持默认路径兼容；
3. round/session/adapter 状态所有权没有迁移到 UI；
4. 未引入 stateData、event bridge、全局 store 或第二套 framework；
5. fake UI contract tests 和默认 UI parity tests 完整通过；
6. destroy 与 active async operation 的交错行为有明确测试；
7. game002/game003 无可见行为和请求合同变化；
8. 所有指定 format/lint/typecheck/test/build/release checks 通过；
9. 工作树只包含 Task 120 范围修改，无生成物漂移；
10. 中文执行报告记录基线、设计选择、测试结果、风险和后续 Task 121 接入点。

Task 120 完成后，Task 121 才可以实现独立 Leo 游戏内 UI，并让 game002 注入该 factory；game003 应继续保留默认 UI 作为稳定对照组。
