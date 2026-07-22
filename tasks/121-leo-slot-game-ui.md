# Task 121：独立 Leo 游戏内 UI 与 game002 Factory 接入

## 1. 任务目标

本任务基于 Task 120 已完成的 `SlotGameUiFactory` contract，实现一套独立、可注入、per-instance 的 Leo 游戏内 UI，并只在 `game002` 中试点接入。

目标结构：

```text
game002
  -> @slotclientengine/gameframeworks
       - round / session / presentation / collect / error / destroy
       - SlotGameUiFactory contract
       |
       +-- uiFactory: @slotclientengine/game-ui-leo
             - Leo React HUD
             - frame host / viewport adapter
             - snapshot -> view
             - interaction -> typed commands

game003
  -> @slotclientengine/gameframeworks
       +-- default @slotclientengine/uiframeworks UI
```

任务完成后：

1. 新增独立 package `packages/game-ui-leo`，包名为 `@slotclientengine/game-ui-leo`。
2. Leo UI 实现 Task 120 的 `SlotGameUiFactory`，同步返回稳定的 `frame/gameLayer/overlay`。
3. Leo UI 可以使用 React，但只能承担游戏内 presentation；不得拥有 live session、round、collect、balance reconciliation 或 adapter。
4. `game002` 在 `createSlotGameFramework()` 中显式注入 Leo factory。
5. `game003` 继续不传 `uiFactory`，保留默认 UI 作为稳定对照组。
6. Task 118 的 Leo Loading UI 保持独立、原生 DOM、零 React 运行时依赖；游戏内 React 只能在 loading 100% 后的正式 game entry 中加载。
7. game002 的 live、loading、spin request、Pixi/rendercore、cascade、CN、金额和发布合同不变。

本任务完成后必须新增中文执行报告：

```text
tasks/121-leo-slot-game-ui-[utctime].md
```

其中 `utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

## 2. 基线与分支要求

### 2.1 Task 120 是强制基线

Task 121 必须基于已完成 Task 120 的分支或其等价合入结果：

```text
codex/task-120-gameframeworks-slot-ui-factory
aac9dba feat(gameframeworks): add injectable slot UI factory
```

开始实现前确认：

```bash
git status --short --branch
git log -1 --oneline
git log --oneline --decorate -8
git merge-base --is-ancestor aac9dba HEAD
```

如果 Task 120 后续以 squash、cherry-pick 或 merge commit 进入 `main`，以包含等价 `SlotGameUiFactory` contract 的最新 main 为准，不强制 commit id 相同。

建议实现分支：

```text
codex/task-121-leo-slot-game-ui
```

如果当前工作树存在其他同事的修改，不得清理、stash、覆盖或顺带提交；应创建独立 worktree/分支实施。

### 2.2 test 分支只作为视觉资料

实现前可以查看 `test` 分支中的以下内容：

```text
packages/ui-leo-frameworks/src/components/platform/leo.tsx
packages/ui-leo-frameworks/src/components/platform/leo.css
packages/ui-leo-frameworks/src/components/layout/index.tsx
packages/ui-leo-frameworks/src/components/layout/layout.css
packages/ui-leo-frameworks/src/assets/font/*
packages/ui-leo-frameworks/src/assets/uiimg/*
```

允许参考：

- Leo HUD 的视觉层级；
- 右侧 spin / bet control 的布局与图形资产；
- 底部 balance / win / total bet 信息结构；
- sound / fast / auto 的视觉状态；
- Anton、NotoSansR 字体与 Leo 自有 UI 图片。

不得 merge、cherry-pick 或整目录复制 `test` 分支的以下实现：

- `game-leo-frameworks`；
- `ui-leo-frameworks` package；
- `stateData`；
- `netcore2`；
- `eventcore` round bridge；
- Zustand stores；
- Inversify container；
- `GameContainer` singleton；
- `RoundService`；
- `__PLATFORM__` 源码替换；
- `document.querySelector()` 全局 host 查找；
- test 分支中的 loading、Wildsheep、buy-free 或 modal 业务实现。

test 分支代码不是可合入实现，只是 Leo 品牌视觉和资产来源参考。

## 3. Node 与 pnpm 环境约束

仓库要求 Node.js `>=24.0.0`。开始前必须检查当前 shell：

```bash
command -v node
command -v pnpm
```

如果 shell 中没有 `node`，执行：

```bash
nvm use 24
```

然后固定并确认同一套工具：

```bash
node --version
pnpm --version
command -v node
command -v pnpm
```

后续 install、generate、format、lint、typecheck、test、build 和 release check 必须统一使用这套 nvm Node 24 自带的 `node` 与 `pnpm`。

不得：

- 执行 `nvm install`，除非用户另行要求；
- 强制升级或降级 Node、pnpm；
- 修改 `.nvmrc`、`engines` 或 `packageManager` 以适配执行器；
- 使用 Codex fallback pnpm 或另一套 pnpm；
- 混用系统 Node、其他 nvm 版本和 Node 24；
- 因本机工具问题重写 lockfile。

本任务新增 React 相关 workspace dependency 时，允许在固定环境中正常更新 `pnpm-lock.yaml`；lockfile 变化必须只来自明确新增的 package dependency，不能顺带升级无关依赖。

## 4. 当前实现事实

### 4.1 gameframeworks 已拥有 UI port

Task 120 已公开：

```ts
SlotGameUiFactory;
SlotGameUi;
SlotGameUiCreateContext;
SlotGameUiCommands;
SlotGameUiElements;
```

固定调用方向：

```text
framework state
  -> ui.update(readonly snapshot)

UI interaction
  -> context.commands
  -> framework transition
  -> ui.update(next snapshot)
```

Task 121 不得改变这个方向，也不得为 Leo UI 增加第二套 round API。

### 4.2 当前 frame 与 viewport 算法仍属于 uiframeworks

默认 UI 已拥有完整的：

- page / frame / gameLayer / overlay host；
- fixed / focus / orientation-focus / maximized-focus policy；
- root viewport 读取；
- resize 更新；
- viewport snapshot 与 listener；
- frame transform 和 logical size。

Leo UI 不能复制这些算法。Task 121 应先从当前 DOM controller 中抽出 presentation-neutral 的 frame host，再让默认 UI 和 Leo UI 复用。

### 4.3 game002 已有独立 Leo Loading

`game002` 当前流程仍应保持：

```text
small initial entry
  -> @slotclientengine/gameloading
  -> @slotclientengine/gameloading-ui-leo
  -> 99% prepare live session
  -> 100% dynamic import game-entry
  -> create gameframeworks + Leo game UI + Pixi
```

游戏内 Leo UI 不得静态进入 initial loading closure，也不得回到 Loading UI package 中。

## 5. 先抽取共享 frame host

### 5.1 新的 public helper

在 `@slotclientengine/uiframeworks` 中抽取并公开一个只负责 host 与 viewport 的 controller。建议名称：

```ts
export interface SlotUiFrameHostOptions {
  readonly root: HTMLElement;
  readonly designSize: SlotUiDesignSize;
  readonly framePolicy?: SlotUiFramePolicy;
}

export interface SlotUiFrameHost {
  readonly elements: {
    readonly page: HTMLElement;
    readonly frame: HTMLElement;
    readonly gameLayer: HTMLElement;
    readonly overlay: HTMLElement;
  };
  getViewport(): SlotUiViewportSnapshot;
  onViewportChange(listener: SlotUiViewportListener): () => void;
  destroy(): void;
}

export function createSlotUiFrameHost(
  options: SlotUiFrameHostOptions,
): SlotUiFrameHost;
```

名称允许根据现有风格微调，但职责必须保持纯粹：

- 同步创建 page/frame/gameLayer/overlay；
- 应用现有 frame policy；
- 产生和更新 viewport snapshot；
- 管理 resize listener；
- destroy 幂等并释放 listener/DOM 引用；
- 不创建 HUD；
- 不创建 state store；
- 不接受 handlers；
- 不依赖 network、logic 或 game adapter。

### 5.2 默认 UI 必须复用同一 host

重构现有 `createSlotUiDom()` / `createSlotUiController()`，让它们使用新的 frame host，再在 overlay 内创建原有默认 HUD。

必须保持：

- 默认 DOM class 和层级兼容；
- frame policy 计算结果完全相同；
- resize snapshot 完全相同；
- 默认 UI CSS 和按钮行为不变；
- destroy 仍只移除一次 listener/timer；
- `gameframeworks` 默认 factory 回归全部通过。

不得为 Leo UI 再实现一份 `calculateSlotUiFrameViewport`、focus margin、transform 或 resize 算法。

## 6. 独立 Leo UI package

### 6.1 package 结构

建议结构：

```text
packages/game-ui-leo/
  package.json
  README.md
  tsconfig.json
  tsconfig.build.json
  vite.config.ts
  src/
    index.ts
    factory.ts
    store.ts
    view.tsx
    styles.css
    assets/
      font/
      controls/
  tests/
```

公共入口至少导出：

```ts
export function createLeoSlotGameUiFactory(): SlotGameUiFactory;
```

factory object 本身可以无状态，但每次 `create(context)` 必须创建全新的：

- frame host；
- React root；
- snapshot store；
- subscription 集合；
- DOM handlers；
- timer；
- destroy 生命周期。

禁止模块级 UI singleton、React root、store、commands、latest snapshot 或 viewport listener。

### 6.2 依赖边界

Leo UI package 允许新增且只新增游戏内 UI 必需的 React 依赖：

- `react`；
- `react-dom`；
- 对应的 TypeScript types 和测试开发依赖。

第一版不要引入：

- Zustand；
- Inversify；
- eventcore；
- netcore / netcore2；
- logiccore；
- game-leo-frameworks；
- ui-leo-frameworks；
- framer-motion；
- react-html-parser；
- Datadog；
- game-fontsize；
- 额外 modal、i18n、sound 或 device framework。

允许从 public entry 依赖：

```text
@slotclientengine/gameframeworks   contract types
@slotclientengine/uiframeworks     frame host / viewport only
```

不得导入任一 package 的 `src/*` 内部路径。

React / ReactDOM 的 dependency/peer dependency 组织应确保最终 game002 bundle 只有一个 React runtime，并有自动化产物检查证明没有重复副本。

### 6.3 同步 host，React 异步渲染

`factory.create()` 必须同步完成：

1. 创建 frame host；
2. 创建位于 `overlay` 内的 Leo mount node；
3. 创建 React root；
4. 返回稳定的 `SlotGameUi` handle。

不得等待 React effect 才提供 `gameLayer`，不得通过 class selector 反查 host。

React 可以在同步 host 返回后提交 view，但 game adapter mount 必须永远使用 factory 直接返回的 elements。

### 6.4 per-instance snapshot store

建议使用原生 external store 配合 `useSyncExternalStore`：

```text
initialState
  -> per-instance store

ui.update(snapshot)
  -> replace latest readonly snapshot
  -> notify this instance subscribers

React controls
  -> context.commands
```

store 只保存最后一次 presentation snapshot，不允许：

- 自行把 `spinning` 改成 `idle`；
- 乐观修改 balance/win/bet；
- 直接发 spin 或 collect；
- 创建 socket；
- 保存 adapter/session identity；
- 把 snapshot 放到 window、module singleton 或跨实例 registry。

`update()` 不应每次重新创建 React root，也不应反复调用 root-level `render()` 构造第二棵树。

## 7. Leo 第一版视觉与交互范围

### 7.1 必须实现

第一版只实现 Task 120 contract 已经真实支持的 HUD：

- 顶部 brand label；
- 可选本地时钟；
- balance；
- win；
- current total bet；
- increase bet；
- decrease bet；
- spin；
- sound muted toggle；
- fast mode toggle；
- auto mode toggle的可见状态；
- connecting / spinning / presenting / collecting / error 状态；
- keyboard focus、button semantics、aria label/pressed/live region。

金额必须复用 `context.formatMoney`；未传时才使用 package 内明确、可测试的 `currency/locale` formatter。不得在 Leo UI 中复制 game002 的 `formatServerUsdAmount` 或改变服务器整数单位。

bet 显示与当前默认 UI 一致，使用 `snapshot.betOption.bet`，不得擅自乘 lines/times。

### 7.2 控件可用状态

必须由 snapshot 决定，而不是只靠 CSS：

- spin 仅在 `connected && spinState === "idle"` 时可点击；
- bet increase/decrease 仅在 idle 时可点击，并遵守 bet option 边界；
- disabled 元素使用真实 `disabled` attribute；
- 连点 spin 即使发生在同一帧，也只能由 framework 启动一轮；
- sound/fast/auto 只调用 typed command，不直接修改权威 state；
- error 状态可见且不得被 UI 吞掉。

Auto 按钮在 Task 121 中只反映并请求现有 `autoMode` flag，不实现自动连续 spin 状态机。

### 7.3 明确不实现

第一版不实现：

- buy feature / buy-free 请求；
- menu 业务页；
- paytable；
- modal service；
- launcher translation；
- jurisdiction 特化；
- ante bet；
- autoplay round scheduler；
- platform settings persistence；
- click sound service；
- Wildsheep UI；
- Leo Loading；
- free-spin/replay UI；
- game003 UI。

如果视觉参考中存在 contract 未支持的按钮，应省略或明确以无交互装饰呈现，不能连接假的 handler，也不能为了点亮按钮把业务状态放进 UI。

## 8. CSS、布局与资产

### 8.1 frame 内布局

Leo HUD 必须相对 factory 返回的 frame/overlay 布局：

- 使用 absolute/grid/flex 相对 logical frame 定位；
- 不使用相对浏览器 window 的 `position: fixed`；
- 不读写 `document.body` 样式；
- 不覆盖全局 `body`、`main`、`button` 或通用 `.disabled`；
- 所有 class 和 CSS variable 使用 Leo package 命名空间，例如 `slot-leo-ui-*`；
- overlay 默认 `pointer-events: none`，只有真实控件恢复 `pointer-events: auto`；
- 不阻断 Pixi canvas 的游戏内点击区域；
- 横竖屏、resize 与 maximized-focus 完全服从共享 frame host snapshot。

game002 的 Pixi canvas/focus region 必须继续与 frame host 对齐，不能为适配 Leo HUD修改 rendercore art viewport。

### 8.2 资产白名单

只从 test 分支复制第一版实际使用的 Leo 字体和 control 图片，建立精确白名单。禁止复制整个 `uiimg`、loading、Wildsheep、modal 或 buyfree 目录。

每个接入资产必须：

- 在 README/执行报告记录 test 分支来源路径；
- 使用明确 import 进入 Vite 闭包；
- 不使用宽泛 glob；
- 不存在未引用资产；
- 经过发布产物检查；
- 不与 `gameloading-ui-leo` 重复打包 loading 资产。

建议保留 test 分支原始图片 bytes；CSS 可以重写和命名空间化，不得保留其全局 body rule、fixed-to-window 定位或 `rem` 全局假设。

### 8.3 字体

Anton / NotoSansR 如被第一版实际使用，应由 package 自己发布并以命名空间 font-family 注册。不得依赖 test 分支 package、远程 CDN 或系统中偶然存在的字体。

字体失败时应回退系统字体，不能阻止 framework connect 或游戏进入。

## 9. SlotGameUi 生命周期合同

Leo UI 返回的 handle 必须满足：

### `elements`

- `frame/gameLayer/overlay` 都是同步、稳定的 HTMLElement；
- 整个实例生命周期内 identity 不变；
- React rerender 不替换这些 host。

### `getViewport()`

- 返回共享 frame host 的当前 snapshot；
- 数值必须有限；
- 不缓存另一实例或旧 frame 的 snapshot。

### `onViewportChange(listener)`

- 只订阅当前 frame host；
- 返回幂等 unsubscribe；
- unsubscribe 后不再通知；
- destroy 后不再通知。

### `update(snapshot)`

- 接受 framework readonly snapshot；
- 只更新 presentation store；
- 不修改输入对象；
- destroy 后不得重建 UI 或 React root。

### `destroy()`

- 幂等；
- 释放 React root；
- 释放 clock/DOM/viewport subscription；
- 销毁 frame host；
- 清除 package 自己的 subscriber；
- 不 disconnect session，不 destroy game adapter；
- 不影响同页面的另一 framework instance。

React effect cleanup 不能替代 handle 的显式 destroy 合同。

## 10. game002 接入

### 10.1 依赖和创建

`apps/game002` 增加对 `@slotclientengine/game-ui-leo` 的 workspace dependency，并在正式 `game-entry` 中创建：

```ts
const uiFactory = createLeoSlotGameUiFactory();

framework = createSlotGameFramework({
  // existing options unchanged
  uiFactory,
});
```

factory 应在每次 `enterGame002()` 中创建，不建立 app 模块级有状态 UI singleton。

game002 只负责选择 Leo UI，不得：

- 操作 React root；
- 操作 Leo DOM child；
- 建立 UI store；
- 把 game adapter/session 传给 UI；
- 复制 factory adapter；
- 增加 stateData glue；
- 监听 UI event bus 推进 round。

### 10.2 不变合同

接入前后必须证明以下行为不变：

- live server 固定为 `wss://gameserv.rgstest.slammerstudios.com/`；
- query 必须显式 `lines=30`；
- `serverUrl` query 仍显式失败；
- loading 99% prepare session、100% 创建 framework；
- prepared session 只使用一次；
- WebSocket 不重复连接；
- spin request 字段和值不变；
- adapter mount/applyInitialState/playSpin/destroy 不变；
- game002 cascade、nearwin、CN、win summary、global win amount 不变；
- resize/focus/Pixi viewport 不变；
- beforeunload 和显式 destroy 不产生残留。

### 10.3 loading 与 bundle 边界

React、ReactDOM、Leo game UI JS/CSS/font/control assets 只能属于正式 game-entry closure。

initial loading entry 不得静态 import：

- `@slotclientengine/game-ui-leo`；
- React / ReactDOM；
- Leo game HUD 字体和 control assets；
- `@slotclientengine/gameframeworks` 正式 runtime。

`release:check` 必须扩展静态产物检查，证明：

1. loading initial chunk 仍小且独立；
2. Leo Loading 首帧不等待 React；
3. React/Leo game UI 只在 100% 后动态 game entry 中加载；
4. game UI 资产不会混入 loading package dist。

## 11. game003 稳定对照

Task 121 不修改 game003 的 UI 选择：

```text
uiFactory === undefined
  -> gameframeworks default factory
  -> existing uiframeworks HUD
```

game003 的完整 test/release 回归用于证明：

- frame host 抽取没有破坏默认 UI；
- orientation-focus 行为不变；
- bg-bar、minecart、Ways win presentation 不变；
- loading initial entry 与正式 game entry 仍分离；
- 没有因 workspace 新增 React 而把 React 打入 game003 bundle。

game003 package.json 不应增加 `@slotclientengine/game-ui-leo`、React 或 ReactDOM。

## 12. 测试要求

### 12.1 uiframeworks frame host

至少覆盖：

1. 同步创建稳定 page/frame/gameLayer/overlay；
2. fixed policy viewport；
3. focus policy viewport；
4. orientation-focus 横竖屏切换；
5. maximized-focus callback；
6. resize snapshot 与 listener；
7. unsubscribe 幂等；
8. destroy 后不再通知；
9. 两个 root/instance 完全隔离；
10. default controller DOM、CSS class、viewport 和 interaction parity。

### 12.2 game-ui-leo contract

至少覆盖：

1. factory 每次 create 都返回独立实例；
2. 同步 stable elements；
3. initial snapshot 首次渲染；
4. update 后 balance/win/bet/status 精确变化；
5. 使用传入 formatMoney；
6. increase/decrease commands；
7. spin command 与 disabled 防护；
8. muted/fast/auto pressed state 与 commands；
9. error role/live region；
10. viewport forwarding；
11. unsubscribe；
12. destroy/unmount/timer/listener 幂等清理；
13. destroy 后不重新渲染；
14. multiple instance snapshot、commands、DOM 和 listeners 隔离；
15. factory/context 中不存在 session、adapter、socket、collect；
16. 没有 module singleton、querySelector 或全局 body mutation；
17. React root 不因每次 update 重建；
18. 只包含白名单资产。

测试应使用 `act()` 或 React 官方测试边界消除异步渲染不确定性，不能用任意 sleep 掩盖提交时序。

### 12.3 gameframeworks

Task 120 的 factory、round、destroy、error 和 default UI 测试必须全部通过。建议增加一项集成测试，使用 Leo factory 验证真实 package 能满足 public contract，但不得在 `gameframeworks` runtime 中反向依赖 Leo package。

如果需要集成测试，应放在 Leo package 或 app 测试中，保持 dependency direction：

```text
game-ui-leo -> gameframeworks
gameframeworks -X-> game-ui-leo
```

### 12.4 game002

至少补充：

- enterGame002 显式注入 Leo factory；
- adapter mount 获得 Leo gameLayer/overlay；
- connect 后 controls 进入 idle；
- 连点 spin 只有一个 session request；
- `lines=30` payload 不变；
- presentation/collect 状态正确反映到 Leo UI；
- destroy 后 React root、viewport listener、framework/session/adapter 各清理一次；
- initial loading module 无 Leo game UI/React 静态 import；
- release dist closure 正确。

### 12.5 game003

- 现有全部测试通过；
- 默认 factory 路径继续工作；
- package 和产物不包含 Leo UI/React；
- release static dist check 通过。

## 13. Source-boundary 验收

增加静态测试或等价检查，证明：

1. `game-ui-leo` 不依赖 netcore、netcore2、logiccore、eventcore、Zustand、Inversify、game-leo-frameworks、ui-leo-frameworks；
2. 不出现 `stateData`、`spinEnd` continuation、RoundService、GameContainer 或 `__PLATFORM__`；
3. 不使用 `document.querySelector()`、`getElementById()` 或 window 全局 UI registry；
4. 不修改 `document.body` class/style；
5. 不从 package `src/*` 路径导入；
6. `gameframeworks` 不依赖 `game-ui-leo`；
7. game002 只通过 public package entry 创建 factory；
8. game003 不依赖 Leo UI/React；
9. loading packages 不依赖 React、ReactDOM 或 game UI；
10. app 内没有复制 frame/viewport/React adapter 算法；
11. 新 package 无宽泛 asset glob；
12. 所有 runtime timer/listener 都有 destroy path。

## 14. 自动化验收命令

所有命令使用第 3 节固定的同一套 Node 24 / pnpm 环境。

新增依赖后先执行：

```bash
pnpm install
git diff -- pnpm-lock.yaml package.json packages/*/package.json apps/*/package.json
```

然后串行验收：

```bash
pnpm --filter @slotclientengine/uiframeworks format:check
pnpm --filter @slotclientengine/uiframeworks lint
pnpm --filter @slotclientengine/uiframeworks typecheck
pnpm --filter @slotclientengine/uiframeworks test
pnpm --filter @slotclientengine/uiframeworks build

pnpm --filter @slotclientengine/gameframeworks format:check
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks build

pnpm --filter @slotclientengine/game-ui-leo format:check
pnpm --filter @slotclientengine/game-ui-leo lint
pnpm --filter @slotclientengine/game-ui-leo typecheck
pnpm --filter @slotclientengine/game-ui-leo test
pnpm --filter @slotclientengine/game-ui-leo build

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

game002 和 game003 的 typecheck/test/release 会写共享 package dist，必须按 app 串行执行，不能并行构建共享产物。

执行报告需记录：

- Node、pnpm 版本及真实路径；
- 各 package 测试数量和覆盖率；
- game002/game003 release check；
- game-ui-leo JS/CSS/font/image 体积；
- React/ReactDOM 在 game002 dist 中的 chunk 归属；
- game002 initial loading chunk 体积变化；
- game003 是否完全未包含 React；
- 精确资产白名单；
- 浏览器人工验收结果或明确未执行项。

## 15. 浏览器验收

自动化通过后，应使用合法 game002 URL 做人工验收：

1. Leo Loading 立即出现，进入正式游戏前无 React HUD 闪现；
2. 100% 后 Leo HUD 与 Pixi 游戏同时进入，frame 无跳位；
3. balance/win/bet 格式正确；
4. bet +/- 边界正确；
5. 连点 spin 不产生第二轮；
6. spinning/presenting/collecting 期间按钮状态正确；
7. sound/fast/auto pressed 状态正确；
8. error 信息可见；
9. 横竖屏和窗口 resize 后 HUD、canvas、focus region 对齐；
10. 控件以外区域不阻断 Pixi 点击；
11. destroy/re-enter 不残留旧 React UI、timer 或 listener；
12. Network 面板只有一条预期 live session 连接；
13. Console 无未处理 Promise、React cleanup、重复 key 或 hydration 警告。

同时抽查 game003，确认默认 HUD 与横竖屏行为未改变。

## 16. 非目标

Task 121 不处理：

- Wildsheep UI；
- runtime Leo/Wildsheep platform switch；
- PlatformBootstrapProvider；
- launcher config；
- translation service；
- user setting persistence；
- jurisdiction policy；
- netcore2 / binary transport；
- buy feature 请求；
- autoplay round scheduler；
- paytable/menu/modal；
- game003 迁移；
- gameframeworks round 状态机改写；
- stateData/EventEmitter integration；
- game002 玩法或 rendercore 改动；
- Loading UI 视觉或调度改动。

这些能力应在 Leo UI 作为纯 presentation adapter 稳定后，再按独立任务逐项扩展。

## 17. 完成标准

只有同时满足以下条件，Task 121 才能标记完成：

1. 基于 Task 120 已验收 factory contract 实施；
2. `@slotclientengine/game-ui-leo` 是独立 package；
3. Leo factory 同步返回稳定 host，并使用 per-instance React root/store；
4. 默认 UI 与 Leo UI 复用同一套 frame/viewport host 算法；
5. Leo UI 只消费 snapshot、只调用 typed commands；
6. framework 继续独占 session、round、presentation、collect、balance 和 destroy；
7. 未引入 test 分支的 game-leo-frameworks/stateData/netcore2/global store/event bridge；
8. 第一版只实现 contract 已支持的 HUD，不伪造 buy feature、auto scheduler 或 platform service；
9. game002 显式注入 Leo UI，live/spin/loading/adapter/rendercore 合同不变；
10. game003 保留默认 UI 并作为稳定对照通过完整回归；
11. React 和 Leo game UI 不进入 loading initial closure；
12. loading packages继续不依赖 React；
13. frame host、Leo UI、gameframeworks、game002、game003 测试和 build/release checks 全部通过；
14. 工作树无生成物漂移和无关修改；
15. 中文执行报告记录环境、设计、资产、测试、bundle 与风险；
16. 浏览器验收已完成，或报告中明确列出需由用户完成的人工项目。

## 18. 后续接入点

Task 121 稳定后，下一阶段再单独评估 `PlatformBootstrapProvider`：launcher config、translation、setting、jurisdiction 和可注入 session preparation。该阶段仍应复用当前 `gameframeworks` facade，不能以平台能力为理由重新引入第二套 round framework。

Wildsheep UI 也应作为另一个独立 `SlotGameUiFactory` package/entry 实现，不应在 Task 121 中加入运行时字符串替换或条件编译。
