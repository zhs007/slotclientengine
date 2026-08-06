# 174 symbolseditor-spine-imgnumber-preview-continuity 执行报告

## 1. 最终实现

- Symbols Editor 将普通多状态 Spine 与 value tier Spine 的共享 slot 候选分开计算：普通 symbol 取所有 top-level Spine state metadata 的 slot 交集，value symbol 继续取所有 tier skeleton 的 slot 交集。
- ImgNumber runtime 仅允许 shared `spineSlot` 在当前已准备的 Spine state 中 attach；late player 初始化不再从 `spinBlur`、`disabled` 等 direct overlay 抢走 renderer。
- `RenderSymbol` 在 requested state 有显式 state texture 时，用 requested state 驱动 ImgNumber presentation；从 direct/static state 返回 Spine state 时先同步 ImgNumber state，再激活 Spine player。
- Spine player 沿用 exact resource cache：同资源状态切换只切 animation；不同资源或不同 value tier 才重建。新增回归测试保护该合同，未新增 schema 或第二份资源映射。
- 按用户后续澄清，整个 value-managed symbol 只保留一个 session-only 预览数值。该数值由 threshold 自动命中档位，UI 标识当前档位；非法输入保留上一次有效预览，移动、删除或改阈值后使用同一数值重新解析。
- preview cell 按 symbol 使用当前 tier 的预览值，旧的全局 toolbar value 输入已移除；预览值不进入 manifest、ZIP 或 undo transaction。
- 同步更新 Symbols Editor/rendercore README，以及 editor artifact/shared runtime 的稳定规则。

实际修改文件：

```text
apps/symbolseditor/README.md
apps/symbolseditor/src/styles.css
apps/symbolseditor/src/ui/app-shell.ts
apps/symbolseditor/src/ui/ui-session.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/app-shell.test.ts
apps/symbolseditor/tests/ui-session.test.ts
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
packages/rendercore/README.md
packages/rendercore/src/symbol-image-string/controller.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/tests/symbol-image-string/controller.test.ts
packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts
```

## 2. 关键决策与计划偏差

- 没有修改 Spine cache/value controller 的 production ownership 实现；现有 exact-resource cache 已满足同资源单 player，只补充组合场景回归保护。
- 计划外最小修改 `packages/rendercore/src/symbol/render-symbol.ts`：定向测试证明 `spinBlur`/`disabled` 会经 state equivalence resolve 为 normal，导致 exact non-Spine ImgNumber target 未激活；同时返回 Spine 时旧的 reset/sync 顺序会错过新 player attachment。修复保持 symbol manifest 和 public schema 不变。
- 为了让 slot helper 可直接测试，补充修改 `apps/symbolseditor/src/ui/app-shell.ts`；为了呈现 threshold 自动命中的当前预览档位，补充修改 `apps/symbolseditor/src/styles.css`。二者均为 app 内部适配。
- 未修改 lockfile、生成物、正式 assets、根工具链或根 `AGENTS.md`。

## 3. 自动化验收

依赖使用 Node 24 与 pnpm，通过 `CI=true pnpm install --frozen-lockfile` 安装；lockfile 未变化。

以下计划内 L2 命令全部通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol-image-string/controller.test.ts tests/symbol-value-presentation/render-symbol-value-controller.test.ts tests/symbol/spine-animation.test.ts
  3 files / 30 tests passed
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/app-shell.test.ts tests/ui-session.test.ts
  2 files / 30 tests passed
pnpm --filter symbolseditor build
  passed；Vite 仅报告既有的 chunk size warning
git diff --check
  passed
```

## 4. 人工验收

未完成真实浏览器中的 Spine 4.3、模糊 ImgNumber、多档资源视觉验收，也未用 DevTools 实测 player/container 数量。自动化已覆盖 slot 交集、late-init attachment、requested/resolved state、同资源 player continuity、统一预览数值的 threshold 自动选档和 session 重置，但不能替代真实资源的可见性、模糊外观和闪帧检查。

## 5. 剩余风险与未完成项

- 建议按任务计划第 8 节用真实资源复验 normal/spinBlur/disabled 往返、相同/不同 Spine 资源 player 计数，以及两档 ImgNumber 的边界值预览。
- 当前 same-resource identity 仍按 exact manifest resource key 判定；内容相同但 logical key 不同的资源不会合并，这是现有严格 ownership 合同。
- 除上述人工视觉验收外，没有已知未完成实现项。
