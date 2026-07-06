# 83 rendercore symbol render priority 执行报告

## 结论

已完成 `rendercore` symbol manifest 的 `renderPriority` 能力，并接入 `game003` 与 `symbolsviewer`。

- 每个 symbol 可在 `symbol-state-textures.manifest.json` 内声明可选 `renderPriority`。
- 缺省值为 `0`。
- 只允许非负安全整数；负数、小数、`NaN`、`Infinity`、字符串、`null` 或未知 symbol 均显式失败。
- 数值更大的 symbol 压住数值更小的 symbol。
- 同优先级继续保持默认顺序：下面压住上面、右边压住左边。
- `renderPriority` 只影响 Pixi symbol 叠放，不改变服务器 scene、reel stop、win result 顺序、symbol state、中奖金额 overlay 或点击逻辑。
- `game003` 主转轮当前只有 `WL`、`CL`、`SC` 声明 `renderPriority: 1`；其它主转轮 symbol 和 `bg-bar` symbol 默认 `0`。

最终浏览器视觉验收按用户要求未执行，交由用户完成。

## 主要改动

### rendercore

- `packages/rendercore/src/symbol/manifest.ts`
  - manifest parser 允许并解析 `renderPriority`。
  - 新增 `createSymbolRenderPriorityMapFromManifest(...)`。
  - 非法 priority 显式抛 `SymbolAssetError`。
- `packages/rendercore/src/symbol/render-symbol.ts`
  - `RenderSymbol` 保存只读 `renderPriority`。
- `packages/rendercore/src/symbol/catalog.ts`
  - `createSymbolCatalog(...)` 支持 `symbolRenderPriorities` 和 per-symbol override。
- `packages/rendercore/src/symbol/standalone-catalog.ts`
  - standalone catalog 支持 manifest 派生的 priority map。
- `packages/rendercore/src/reel/symbol-registry.ts`
  - reel registry 支持 `symbolRenderPriorities`，并把 priority 传给 `RenderSymbol`。
- `packages/rendercore/src/reel/render-reel.ts`
  - slot container 的 `zIndex = renderPriority * stride + defaultOrder`。
  - 外部 slot parent 场景在 spin 中给每个 slot 挂单轴 mask，停止后取消 mask，继续允许大 symbol 越格展示。
- `packages/rendercore/src/reel/render-reel-set.ts`
  - 增加 shared sortable slot layer，使高 priority 可跨列压住低 priority，同时同 priority 保持右列压左列。
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`
  - grid-cell root 按当前可见 symbol priority 调整 `zIndex`，同 priority 保持原 order。
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
  - 重新生成 manifest 时保留旧 manifest 中仍然有效的显式 `renderPriority`。
  - 旧 manifest 的非法 `renderPriority` 会让生成器显式失败。

### game003

- `assets/game003-s1/symbol-state-textures.manifest.json`
  - `WL`、`CL`、`SC` 新增 `renderPriority: 1`。
  - 生成器运行后将 `states` 数组按当前脚本 JSON 格式展开。
- `apps/game003/src/assets.ts`
  - 暴露主转轮和 `bg-bar` 的 manifest priority map helper。
- `apps/game003/src/skin-config.ts`
  - skin 配置从 manifest 派生 `symbolRenderPriorities`，不在 YAML/generated 中维护第二份表。
- `apps/game003/src/symbol-animation-config.ts`
  - 暴露 `GAME003_SYMBOL_RENDER_PRIORITIES`。
- `apps/game003/src/game-demo.ts`
  - demo/runtime registry 传入 priority map。
- `apps/game003/src/game-adapter.ts`
  - live runtime registry 传入 skin priority map。
- `apps/game003/src/bg-bar-runtime.ts`
  - `bg-bar` standalone catalog 接收 `bg-bar` manifest priority map。
- `apps/game003/src/minecart-interaction-runtime.ts`
  - 矿车 payload catalog 复用 `bg-bar` manifest priority map。

### symbolsviewer

- `apps/symbolsviewer/src/symbol-assets.ts`
  - 包装 rendercore priority helper，并传给 paytable/standalone catalog。
- `apps/symbolsviewer/src/symbol-set-config.ts`
  - `game003-s1` 和 `bg-bar` symbol set 都从对应 manifest 派生 priority map。
- `apps/symbolsviewer/src/main.ts`
  - 状态面板展示 `priority N`，并在缺失/非法 priority 时显式失败。

### 文档和协作规则

- `packages/rendercore/README.md`
  - 记录 manifest 字段、helper、严格校验、生成器保留和 reel 叠放语义。
- `apps/game003/README.md`
  - 记录 `WL` / `CL` / `SC` 的 manifest priority 来源和 app 边界。
- `apps/symbolsviewer/README.md`
  - 记录 viewer 从 manifest 读取和展示 priority。
- `agents.md`
  - 增加仓库长期规则：priority 只能从 manifest 派生，不在 YAML、generated config 或 runtime 中写第二份表/专属 `zIndex` 分支。

## 测试覆盖

新增/扩展测试覆盖：

- manifest parser：
  - 缺省为 `0`。
  - 显式合法整数保留。
  - 负数、小数、`NaN`、`Infinity`、字符串、`null` 显式失败。
  - `createSymbolRenderPriorityMapFromManifest(...)` 对缺 manifest symbol 显式失败。
- generator：
  - 保留旧 manifest 中显式 `renderPriority`。
  - 显式 `renderPriority: 0` 也会保留。
  - 非法旧 priority 生成失败。
- catalog / standalone catalog / reel registry：
  - priority map 传入 `RenderSymbol`。
  - per-symbol override 可覆盖 map。
  - 非 paytable/display symbol 或非法值显式失败。
- reel 渲染：
  - 单轴高 priority 压住低 priority。
  - 同 priority 保持下面压住上面。
  - reel set 中高 priority 可跨列压住低 priority。
  - 全部为 `0` 时保持右列压左列、下面压上面的默认顺序。
  - spin 中 shared slot mask 存在，落停后取消 mask 并保持排序。
  - grid-cell reel set 按可见 symbol priority 排序，同 priority 保持原 order。
- game003：
  - manifest helper 读取 `WL/CL/SC = 1`，其它主转轮 symbol 为 `0`。
  - `bg-bar` manifest 全部为 `0`。
  - skin/runtime config 传递 priority map。
  - source-boundary 测试确认没有 `SC/CL/WL` 专属 runtime 层级分支。
- symbolsviewer：
  - helper 读取合法 priority。
  - 非法 priority 显式失败。
  - symbol set config 暴露主 manifest priority 和 `bg-bar` priority。

## 验收命令

已通过：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
git diff -- assets/game003-s1/symbol-state-textures.manifest.json
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
git diff --check
```

关键结果：

- rendercore：30 个 test files、195 个 tests 全部通过。
- game003：25 个 test files、119 个 tests 全部通过。
- symbolsviewer：2 个 test files、16 个 tests 全部通过。
- `game003 release:check` 通过，包含静态配置 check、生产 build 和 static dist check。
- Vite 构建仅输出既有大 chunk warning，不影响命令结果。
- `buildgamestatic` 生成文件已是最新，`check:static-config` 通过。
- `pnpm-lock.yaml` 未变化。
- 文档和任务报告已通过 `pnpm exec prettier --check`；`assets/game003-s1/symbol-state-textures.manifest.json` 保持生成器输出格式，不用 Prettier 风格覆盖。

执行中有两类已处理问题：

- 早期在受限沙箱下执行 `pnpm` 曾触发依赖/权限相关失败；按工具策略改为授权执行后验收命令全部通过。
- `format:check` 曾发现 rendercore 6 个文件和 game003 `src/skin-config.ts` 需要 Prettier；已运行对应包内 `format` 修正，并重新通过 `format:check`。

## 二次审计

已执行并通过：

```bash
git status --short --untracked-files=all
git diff --stat
git diff --check
rg -n "renderPriority|symbolRenderPriorit|createSymbolRenderPriorityMapFromManifest" packages/rendercore/src packages/rendercore/scripts apps/game003/src apps/symbolsviewer/src assets/game003-s1/symbol-state-textures.manifest.json
rg -n "zIndex.*(SC|CL|WL)|(SC|CL|WL).*zIndex|if .*symbol.*(SC|CL|WL)|switch .*symbol" apps/game003/src apps/symbolsviewer/src packages/rendercore/src
git diff -- apps/game003/src/generated/game-static.generated.ts apps/game003/src/generated/game-loading.generated.ts pnpm-lock.yaml package.json
rg -n '"renderPriority": 1|"renderPriority"' assets/game003-s1/symbol-state-textures.manifest.json assets/game003-s1/bg-bar-symbol-state-textures.manifest.json
```

审计结论：

- 未发现 `SC` / `CL` / `WL` 专属 `zIndex` 或 runtime symbol 分支。
- `apps/game003/src/generated/game-static.generated.ts` 无 diff。
- `apps/game003/src/generated/game-loading.generated.ts` 无 diff。
- `pnpm-lock.yaml` 无 diff。
- `package.json` 无 diff。
- `assets/game003-s1/symbol-state-textures.manifest.json` 中只有 `WL`、`CL`、`SC` 三处 `renderPriority: 1`。
- `assets/game003-s1/bg-bar-symbol-state-textures.manifest.json` 未声明 priority，全部走默认 `0`。

## 浏览器手动验收交接

按用户要求，浏览器视觉验收由用户执行。

建议验收命令：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5209 --strictPort
```

建议检查点：

- `game003` 横屏和竖屏都进入 `skin=1`。
- 主转轮中 `WL`、`CL`、`SC` 与低 priority symbol 视觉重叠时位于上层。
- 同为普通 priority 的 symbol 仍保持默认层级：下面压住上面、右边压住左边。
- spin 中单轴裁切仍正常；落停后大 symbol 可越出格子，不被单轴 mask 继续裁掉。
- 中奖 symbol state、中奖金额 overlay、点击加速/关闭金额动画行为没有变化。
- `symbolsviewer` 状态面板能看到每个 symbol 的 `priority N`；`WL`、`CL`、`SC` 为 `1`，其它主转轮 symbol 为 `0`。
