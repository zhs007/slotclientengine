# rendercore symbol system 初始化任务报告

## 完成摘要

本次按 `tasks/20-rendercore-symbol-system.md` 执行，新增内部渲染核心库 `packages/rendercore` 和展示验证应用 `apps/symbolsviewer`。

主要完成项：

- 新增 `@slotclientengine/rendercore` workspace package。
- 实现 symbol 状态定义、状态等价、默认状态、纯逻辑 `SymbolStateMachine`。
- 实现显式 `deltaSeconds` 推进的 `SymbolAni`、默认 viewer animation resolver、全局 `SymbolStateSequenceController`。
- 实现 `RenderSymbol` Pixi 显示对象，基于 `@slotclientengine/pixiani/core` 的 `VisualEntity`，只持有一个主 `Sprite` 和传入的共享 `Texture`。
- 实现 `createSymbolCatalog`，把 `LogicGameConfig` paytable 与 symbol 资产精确匹配，只输出交集。
- 新增 `apps/symbolsviewer`，加载 `assets/gamecfg/game2.json` 和 `assets/symbols/*.png`，一次性展示可处理 symbols，并提供全局状态序列控制。
- 补齐 README、单元测试、局部验收、根级验收和本报告。

## 实际新增/修改文件

新增：

- `packages/rendercore/package.json`
- `packages/rendercore/tsconfig.json`
- `packages/rendercore/tsconfig.build.json`
- `packages/rendercore/tsconfig.eslint.json`
- `packages/rendercore/vite.config.ts`
- `packages/rendercore/eslint.config.cjs`
- `packages/rendercore/README.md`
- `packages/rendercore/src/index.ts`
- `packages/rendercore/src/symbol/*`
- `packages/rendercore/tests/setup.ts`
- `packages/rendercore/tests/symbol/*`
- `apps/symbolsviewer/package.json`
- `apps/symbolsviewer/index.html`
- `apps/symbolsviewer/tsconfig.json`
- `apps/symbolsviewer/tsconfig.eslint.json`
- `apps/symbolsviewer/vite.config.ts`
- `apps/symbolsviewer/eslint.config.cjs`
- `apps/symbolsviewer/README.md`
- `apps/symbolsviewer/src/*`
- `apps/symbolsviewer/tests/*`
- `tasks/20-rendercore-symbol-system-260610-080729.md`

修改：

- `pnpm-lock.yaml`

未修改：

- `packages/pixiani` 源码和 README。
- 根级 `AGENTS.md`。本任务未改变仓库协作规则、目录规范或基础脚本。
- `assets/gamecfg/game2.json` 和 `assets/symbols` 源资产。它们在执行前已经是未跟踪输入资产，本次只读取，不改写。

## rendercore 公开 API 摘要

核心导出位于 `@slotclientengine/rendercore` 和 `@slotclientengine/rendercore/symbol`：

- `RenderSymbol`
- `SymbolStateMachine`
- `SymbolStateSequenceController`
- `createDefaultSymbolStatePreset`
- `createDefaultSymbolAnimationResolver`
- `createSymbolCatalog`
- `ManualSymbolAni`
- `createStaticSymbolAni`
- `createLoopSymbolAni`
- `createAppearSymbolAni`
- `createWinSymbolAni`
- `RenderCoreError` / `SymbolStateError` / `SymbolAnimationError` / `SymbolAssetError`
- symbol 状态、ani、resolver、catalog 相关类型

顶层入口没有引入 Node-only API。

## symbol 状态机规则摘要

已实现规则：

- 默认状态必须存在，且必须是 `stable`。
- `stable` 只允许 `loop` 或 `static`。
- `once` 只允许 `once`。
- 状态 id 重复、未知状态请求、非法默认状态都会抛错。
- 显式 `frameDurationSeconds < 1 / 60`、`0`、负数、`NaN`、`Infinity` 会抛错。
- `static` 当前状态下请求切换立即生效。
- `loop` 当前状态下请求切换进入 pending，等 `notifyLoopComplete()` 后切换。
- `once` 完成后通过 `notifyOnceComplete()` 回到当时的当前默认状态。
- `once` 播放期间修改默认状态，完成后回到新的默认状态。

## 状态等价配置摘要

默认 preset：

- `normal`: `stable` / `static`
- `spinBlur`: `stable` / `static`，等价到 `normal`
- `disabled`: `stable` / `static`，等价到 `normal`
- `appear`: `once` / `once`
- `win`: `once` / `once`

等价校验：

- 等价源和目标必须存在。
- `stable` 只能等价到 `stable`。
- `once` 只能等价到 `once`。
- 支持多级链。
- 环会抛错。

## 状态与动画解耦实现摘要

状态定义只包含语义，不包含视觉效果。`RenderSymbol` 每次状态切换时根据当前 `SymbolAnimationContext` 调用注入的 `SymbolAnimationResolver` 获取 `SymbolAni`。

resolver context 包含：

- paytable 信息：`code`、`symbol`、`pays`
- `requestedState`
- `resolvedState`
- resolved state definition
- 共享 `Texture`
- root `Container`
- 主 `Sprite`
- 临时 `overlayLayer`

测试覆盖了：

- 默认 resolver 能解析 `normal`、`appear`、`win`。
- resolver 能看到 `spinBlur -> normal` 这类等价后的 requested/resolved。
- 自定义 resolver 可以让同一个 `win` 状态在不同 symbol 上返回不同 ani。
- resolver 返回缺失或 playback 不匹配会抛错。

## symbol 资源复用摘要

`RenderSymbol` 构造时只创建一个主 `Sprite`，并使用调用方传入的 `Texture` 引用。

- `normal` 使用静态单帧 ani。
- `appear` 只调整主 `Sprite.scale`，完成后复位到 `1`。
- `win` 只在 `overlayLayer` 临时添加扫光 `Graphics`，完成或 reset 后清理。
- `normal`、`appear`、`win` 不创建状态专属 texture。

## symbolsviewer 实现摘要

`apps/symbolsviewer`：

- 通过 `import rawGameConfig from "../../../assets/gamecfg/game2.json"` 读取配置。
- 通过 `import.meta.glob("../../../assets/symbols/*.png", { eager: true, query: "?url", import: "default" })` 读取图片 URL。
- 使用 `Assets.load` 加载 `Texture`。
- 用 `createSymbolCatalog` 只展示可处理 symbol。
- 默认全局序列为 `normal -> appear -> win -> spinBlur -> disabled`。
- 所有展示 symbol 共用一个 `SymbolStateSequenceController`。
- 用户可以播放/暂停、下一状态、reset、设置默认 stable 状态、增加状态、移除状态、上移/下移状态。
- 序列 step 为 `once` 时，viewer 等全部 `RenderSymbol.update()` 上报 `onceCompleted` 后再推进。

## 资源校验结果

当前输入下：

- 可展示 symbols：`S00`、`S0`、`S1`、`S5`、`S10`
- 被忽略的 paytable 缺图 symbols：`BN`、`SC`、`RS`、`X2`、`X5`、`X10`
- 被忽略的孤儿图片：`SX`

缺图 symbol 和孤儿图片不进入 `displayableSymbols`，也不会被替换为其它图片。

## 测试覆盖率结果

`pnpm --filter @slotclientengine/rendercore test`：

- Test Files：6 passed
- Tests：39 passed
- Statements：92.42%
- Branches：80.62%
- Functions：95.37%
- Lines：92.30%

满足 task 要求的 80% 阈值，未降低 coverage 阈值。

`pnpm --filter symbolsviewer test`：

- Test Files：1 passed
- Tests：5 passed
- 覆盖了 game2 解析、资产 glob 转换、paytable/图片交集、默认序列和序列编辑 helper。

## 验收命令结果

已执行并通过：

```bash
pnpm install
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer build
pnpm lint
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

`pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 4173`：

- 沙箱内失败，错误为 `listen EPERM: operation not permitted 127.0.0.1:4173`。
- 提权后已启动成功：

```text
Local: http://127.0.0.1:4173/
```

执行中还发现 pnpm 会把分隔符 `--` 原样传给 Vite，导致 `--host/--port` 不生效；已把 `apps/symbolsviewer/package.json` 的 `dev` 脚本改为剥离前导 `--` 后再执行 `vite`。

## 浏览器验收结果

按用户最新要求，浏览器最终验收由用户接手。助手停止继续做完整浏览器验收。

在用户接手前，助手已做以下 in-app Browser 自动化抽查：

- 打开 URL：`http://127.0.0.1:4173/`
- 视口：`1280x720`
- DOM 确认：
  - 页面标题为 `Symbols Viewer`
  - canvas 存在，内部尺寸 `1080x520`
  - 状态列表包含 `S00`、`S0`、`S1`、`S5`、`S10`
  - 默认序列包含 `normal`、`appear`、`win`、`spinBlur`、`disabled`
- 自动播放确认：
  - 浏览器可见后，状态推进到 `spinBlur`
  - 面板显示 `spinBlur -> normal`
- 手动推进确认：
  - 推进到 `disabled`
  - 面板显示 `disabled -> normal`
- 序列编辑确认：
  - 移除、移动、添加状态后，序列变为 `win -> normal -> spinBlur -> disabled -> appear`
- 默认状态确认：
  - 默认状态改为 `spinBlur` 后，重新触发单次 `win`，完成后面板显示 `spinBlur -> normal / spinBlur`

截图尝试失败，错误为：

```text
Timed out running CDP command "Page.captureScreenshot"
```

因此本报告不声称助手已完成最终截图验收或完整手工浏览器验收。

## pixiani 与 AGENTS.md

未修改 `packages/pixiani`。本次没有发现需要抽到 pixiani 的通用 ani primitive；symbol 状态、paytable、扫光、弹动都保留在 `rendercore` 内部或 viewer 默认 resolver 内。

未修改根级 `AGENTS.md`。本任务只新增 package、app、README、测试和报告，没有改变仓库协作规则、目录规范或基础脚本。

## 产物清理

已清理：

- `apps/symbolsviewer/.turbo/`
- `apps/symbolsviewer/coverage/`
- `apps/symbolsviewer/dist/`
- `packages/rendercore/.turbo/`
- `packages/rendercore/coverage/`
- `packages/rendercore/dist/`

暂未清理：

- `apps/symbolsviewer/node_modules/`
- `packages/rendercore/node_modules/`

原因：用户已接手浏览器验收，dev server 正在运行，保留 package-local `node_modules` 可避免影响当前本地页面。最终完成浏览器验收后可再执行：

```bash
git clean -fdX apps/symbolsviewer/node_modules packages/rendercore/node_modules
```

## 已知限制与后续建议

- 本任务中 `spinBlur` 和 `disabled` 仅等价为 `normal`，未实现真实模糊或灰度效果。
- `symbolsviewer` 只面向 PC 横屏，未做复杂移动端适配。
- `import.meta.glob` 会让 Vite 构建产物中包含 `SX.png` 这个孤儿图片文件，但 catalog 不会把 `SX` 加入 displayable list，也不会实例化展示它。
- 后续如果 reel、winline、特效对象都需要复用统一 ani clock，再考虑把更通用的 ani primitive 抽到 `pixiani`。

## 追加修正 260610-0820

用户浏览器验收时发现 `win` 扫光条在 symbol 透明区域外可见，视觉上像一根灰白斜条穿过图标。根因是默认 `createWinSymbolAni()` 只把扫光 `Graphics` 加到 `overlayLayer`，没有使用 symbol 贴图 alpha 轮廓裁剪。

第一版修正曾直接使用主 sprite 作为 mask，浏览器验收发现这会干扰主 sprite 正常渲染，导致非扫光状态变黑、扫光期间呈现黑白轮廓。已改为当前方案：

- 主 sprite 不再参与 mask，始终保持正常渲染。
- `win` 状态临时创建一个复用同一 `Texture` 的高亮 sprite。
- 高亮 sprite 使用移动的条形 `Graphics` 作为 mask，只让高亮出现在 symbol alpha 轮廓内。
- 高亮 sprite 使用 `blendMode = "screen"`，避免灰色实条感。
- reset/complete 时清理 overlay children 的 `mask`，避免污染后续状态。
- 补充测试断言主 sprite 没有 mask，高亮 sprite 复用同一 texture，且 mask 是独立临时对象。

追加执行并通过：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer build
```

## 追加调优 260610-0830

用户继续浏览器验收时反馈扫光仍不够明显，节奏感偏弱，并希望叠加一次类似 `1.2` 的放大弹动。已在默认 `win` 动画中调优：

- 扫光时长从 `0.72s` 缩短为 `0.58s`，移动进度改为 `easeOutCubic`，让扫过节奏更明确。
- 高亮层峰值 alpha 提高到 `0.95`，mask 条宽提高到 symbol 宽度的 `0.28`，增强可见度。
- `win` 进度中加入 `sin(pi * progress)` 脉冲，主 sprite 与 overlay layer 峰值 scale 为 `1.2`。
- 动画 complete/reset 时显式恢复主 sprite 与 overlay layer 的 scale，避免影响后续状态。
- 测试补充断言中段高亮 alpha 超过 `0.9`，sprite/overlay scale 超过 `1.19`，完成后恢复 `1`。

追加执行并通过：

```bash
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter symbolsviewer build
```
