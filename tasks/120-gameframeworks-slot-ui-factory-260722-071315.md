# Task 120 执行报告：gameframeworks 游戏内 UI Factory 与状态边界解耦

## 1. 执行结论

Task 120 已按计划完成代码实现与自动化验收。

- `@slotclientengine/gameframeworks` 已公开导出 `SlotGameUiFactory`、`SlotGameUi`、`SlotGameUiCreateContext`、`SlotGameUiCommands`、`SlotGameUiElements`。
- `createSlotGameFramework()` 已支持 per-instance `uiFactory` 注入；不传时继续使用现有 `@slotclientengine/uiframeworks` controller，默认 HUD DOM、frame policy、money formatter 和按钮行为保持不变。
- framework 仍独占 connect、spin、presentation、collect、balance reconciliation、error 与 destroy；UI 只接收只读 snapshot，并通过 typed commands 请求 framework 操作。
- destroy 与 active connect、session spin、adapter presentation 的交错已使用 lifecycle generation 阻断，迟到 continuation 不会继续 apply initial state、presentation 或 collect。
- game002、game003 未修改，loading 99%/100%、prepared session、live 参数、spin payload 和发布入口行为均通过原有回归与 release 静态检查。
- 按用户要求，浏览器人工验收未由 Codex 执行，留给用户完成。

## 2. 基线与环境

执行开始时三个 main 引用一致：

```text
main        c01884c Merge branch 'codex/task-118-gameloading-ui-refactor'
origin/main c01884c Merge branch 'codex/task-118-gameloading-ui-refactor'
gitee/main  c01884c Merge branch 'codex/task-118-gameloading-ui-refactor'
```

三个 main 引用尚未包含计划要求的 Task 118 收尾修复。当前独立工作树位于已合入该修复与 Task 120 计划的等价最新基线：

```text
ea839f0 merge: integrate task 118 loading UI fixes
d68a464 docs: plan task 120 game UI factory
06daa7b fix: close task 118 loading UI acceptance gaps
```

实现分支：

```text
codex/task-120-gameframeworks-slot-ui-factory
```

统一命令环境：

```text
Node v24.14.0
pnpm 11.9.0
node /Users/zerro/.nvm/versions/node/v24.14.0/bin/node
pnpm /Users/zerro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm
```

依赖使用现有 `pnpm-lock.yaml` 通过 `pnpm install --frozen-lockfile` 安装，未改 package manager、engine 或 lockfile。

## 3. 设计与实现

### 3.1 公共 presentation contract

在 `packages/gameframeworks/src/types.ts` 增加 UI factory contract，并从 public entry 导出。`SlotGameFrameworkOptions.uiFactory` 只决定 presentation，不接收或创建 live session、game adapter、logic、collect。

factory create context 在调用边界冻结；design size、bet options、initial snapshot、commands 均为冻结只读值，frame policy 也按 variant 复制并深度冻结。factory 必须同步返回稳定的 `frame/gameLayer/overlay`。

### 3.2 默认 UI 兼容

`packages/gameframeworks/src/ui-adapter.ts` 已收敛为内部 default factory：

- 只从 `@slotclientengine/uiframeworks` public entry 导入；
- 继续复用 `createSlotUiController()`；
- 将 typed commands 映射到原 controller handlers；
- 将 framework snapshot 投影为带 design size 的现有 UI snapshot；
- 不复制 DOM、CSS、layout 或 viewport 算法。

game002、game003 未显式传 `uiFactory`，因此本次回归同时验证默认路径完全兼容。

### 3.3 创建边界与错误合同

新增内部 `ui-factory.ts` 负责：

- 校验 factory handle 的 elements、update、viewport subscription 和 destroy；
- 创建时同步验证 initial viewport snapshot；
- 非法 handle fail-fast，并在可行时调用其 destroy 清理；
- 对后续 viewport snapshot 做有限数值校验和只读复制。

UI `update()` 抛错时，framework 保存并抛回原始 Error，不再递归调用失败 UI 的 update；同一错误只调用一次 `onError`，同时按 UI、session、adapter 顺序完成清理。

### 3.4 per-instance commands 与异步生命周期

每个 framework instance 独立创建 command object、UI handle、state projection 和 viewport forwarding closure。保留的 command 在 destroy 后变为 no-op；`requestSpin()` 吸收 UI fire-and-forget rejection，但 framework 原有 connected/idle 并发保护保持有效。

framework destroy 增加 lifecycle generation：connect/spin 在 mount、session connect、session spin、adapter presentation、collect 等 await 恢复后均校验 instance 是否仍有效。destroy 后不会迟到推进 initial state、presentation、collect 或 idle。

## 4. 测试与静态边界

新增 `ui-factory.test.ts`，覆盖：

1. 默认 controller DOM 与按钮 parity；
2. 每个 framework 只创建一个 UI，两个 instance 完全隔离；
3. 完整、冻结的 create context 与稳定 host；
4. adapter mount 使用 factory elements；
5. typed commands 与连续两次 requestSpin 的业务互斥；
6. successful round 的完整 UI state 顺序；
7. viewport initial snapshot、subscription、unsubscribe；
8. destroy 幂等及依赖单次清理；
9. destroy during connect；
10. destroy during session spin；
11. destroy during adapter presentation；
12. 非法 factory、elements、method 与 viewport fail-fast；
13. UI update 原始异常、单次 onError 与非递归清理。

新增 `source-boundary.test.ts`，证明：

- 无 netcore2、Leo test-branch framework、stateData、EventEmitter round bridge、spinEnd continuation；
- 无 React、Zustand、Inversify；
- 默认 UI 只使用 uiframeworks public entry；
- UI create context 不拥有 session、socket、adapter、collect 或 logic；
- game002/game003 未新增对 uiframeworks、netcore、logiccore 的直接依赖；
- framework source 不通过 `document.querySelector()` 查找 mount host。

## 5. 自动化验收结果

以下命令均在同一 Node 24 环境通过。

### gameframeworks

```text
format:check 通过
lint         通过
typecheck    通过
test         11 files / 48 tests 通过
coverage     statements 91.51%, branches 82.07%, functions 96.87%, lines 91.70%
build        通过
```

### uiframeworks

```text
format:check 通过
lint         通过
typecheck    通过
test         9 files / 52 tests 通过
build        通过
```

### game002

```text
format:check 通过
lint         通过
typecheck    通过
test         18 files / 97 tests 通过
release:check 通过；game002 static dist check passed
```

### game003

```text
format:check 通过
lint         通过
typecheck    通过
test         27 files / 136 tests 通过
release:check 通过；game003 static dist check passed
```

game002 与 game003 的 typecheck、test、release:check 全程串行执行，未并行写共享 package dist。

## 6. 修改范围

Task 120 只修改或新增以下范围：

```text
packages/gameframeworks/README.md
packages/gameframeworks/src/framework.ts
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/ui-adapter.ts
packages/gameframeworks/src/ui-factory.ts
packages/gameframeworks/tests/source-boundary.test.ts
packages/gameframeworks/tests/ui-factory.test.ts
tasks/120-gameframeworks-slot-ui-factory-260722-071315.md
```

未修改 game002、game003、uiframeworks、rendercore、生成配置、资源或 lockfile。

## 7. 风险与浏览器验收建议

自动化测试与 release 静态产物检查已经证明默认 UI 接线、状态顺序、loading entry 拆分和发布闭包未回退。剩余风险主要是浏览器中的真实输入与 resize 观感，不属于 contract 可完全替代的视觉人工检查。

建议用户浏览器验收时至少确认：

1. game002 使用合法 `skin=1&lines=30` URL，从 Leo loading 进入默认 HUD，连接后可 spin；
2. game003 从 simple loading 进入默认 HUD，连接、spin、bg-bar/矿车和金额展示行为无视觉回退；
3. 横竖屏或窗口 resize 后 canvas/viewport 仍与现有 frame policy 对齐；
4. 连点 spin 只启动一轮，presentation/collect 完成后回到可 spin；
5. 控制台无双 WebSocket、重复 enter、未处理 Promise rejection 或 destroy 后事件。

## 8. Task 121 接入点

Task 121 可以在独立 Leo 游戏内 UI package 中实现 `SlotGameUiFactory`，同步创建 host，并在内部 mount React root；随后仅由 game002 在 `createSlotGameFramework()` options 中注入 `uiFactory`。Leo UI 通过 `context.commands` 回到 framework，通过 `update(snapshot)` 渲染，不接触 session、adapter、collect 或 balance owner。game003 可继续不传 factory，作为默认 uiframeworks 稳定对照组。
