# Task 224 Symbols Editor Spine 资源替换执行报告

## 结果

已完成 Symbols Editor 的 Spine 美术增量替换修复：

- 同 filename-key 覆盖 skeleton、atlas、texture 时，先在 clone 上安装完整批次，再基于最终
  candidate 统一 reconcile；兼容的 animation、slot、transform、composite layer、value tier、
  ImgNumber、音效和其它 symbol/state 配置保持不变。
- 新增 `spine-binding-reconciliation.ts` 作为 importer 与 Picker 共用的 Spine metadata/
  compatibility owner；既有 missing-animation 精确清理从 `resource-import.ts` 移入该模块，
  行为保持。
- 被覆盖的合法单 page atlas 改变 page logical name 时，只重写 exact 绑定该 atlas 且仍引用
  旧 page 的普通 Spine state、composite layer 和 value tier texture path；其它图片不修改。
- Picker 再次确认当前 skeleton/atlas 现在是 no-op；改选不同但兼容的 skeleton 会保留仍存在的
  animation。value tier 会按全部 skeleton 的 animation/slot 交集保留有效配置，只清理明确失效
  的选择。
- 导入反馈新增 Atlas page 精确同步摘要；缺失 animation 仍列出 exact location，普通兼容覆盖
  明确显示“现有配置保持不变”。
- README 增加一次导入完整 Spine closure 的推荐美术工作流，并明确 overwrite 与独立同名资源
  的 identity 边界。

## 修改文件

```text
apps/symbolseditor/src/model/spine-binding-reconciliation.ts
apps/symbolseditor/src/model/resource-import.ts
apps/symbolseditor/src/ui/resource-picker.ts
apps/symbolseditor/src/ui/workspace-app.ts
apps/symbolseditor/tests/resource-import.test.ts
apps/symbolseditor/tests/resource-picker.test.ts
apps/symbolseditor/README.md
tasks/224-symbolseditor-spine-asset-replacement.md
tasks/224-symbolseditor-spine-asset-replacement-260817-094419.md
```

测试中 `resource-import.test.ts` 原先依赖已经失效的 Crave `h1.webp` fixture；本任务直接相关
测试改用仓库当前 Minecart2 symbol fixture，与既有 Picker 测试保持一致。未修改 production
assets、schema、共享 package API、依赖或 lockfile。

## 自动验收

通过：

- `pnpm --filter symbolseditor typecheck`
- `pnpm --filter symbolseditor exec vitest run tests/resource-import.test.ts tests/resource-picker.test.ts`
  - 2 files，17 tests 全部通过。
  - 覆盖多 symbol/多 state 完整 Spine 批次、原 project 不变、atlas page exact rewrite、
    missing animation、composite leaf、tiered shared animation、Picker same-path no-op 和兼容
    skeleton 保留。
- `pnpm --filter symbolseditor build`
  - 构建通过；仅有既存的单 chunk 大于 500 kB 提示。
- `pnpm --filter symbolseditor format:check`
- `git diff --check`

执行过 `pnpm --filter symbolseditor test`：共 86 个用例，76 通过，10 失败。失败均在测试主体前
读取既有 Crave fixture 时发生：当前 `assets/crave/assets.map.json` 不再提供测试 helper 请求的
`h1.webp`、`cn_1.json` 或旧 `symbol-state-textures.manifest.json`。涉及
`app-shell.test.ts` 6 项、`editor-project.test.ts` 3 项、`vni-bundle-import.test.ts` 1 项；错误与
task 224 的 reconcile/Picker 实现无调用关系。未为本任务扩大范围重写全部历史 Crave fixture。

环境准备使用 Node 24 和 `CI=true pnpm install --frozen-lockfile`；依赖从现有 pnpm store 复用，
未修改 lockfile。pnpm 提示 esbuild/sharp build scripts 按当前 workspace policy 被忽略，但本次
typecheck、测试与 Vite build 均正常完成。

## 计划偏差

- 计划允许 missing slot 在 Picker 显式改选时精确清理；资源 overwrite 继续遵循既有领域规则：
  只有 missing animation 自动清理，slot/closure 等其它不兼容仍由 candidate 校验使整批回滚。
- 未新增独立 `spine-binding-reconciliation.test.ts`；共享 helper 通过现有 importer 与 Picker
  public workflow 测试覆盖，避免测试 private implementation。
- 未修改 `app-shell.test.ts`。现有全量 app-shell fixture 在测试 setup 阶段失效；task 224 的 UI
  结果类型和文案已由 typecheck/build 验证，真实交互由用户接管浏览器验收。
- 未修改 `docs/agent-rules/editor-artifacts.md`，因为现有规则已经准确声明目标行为。

## 浏览器验收

按用户要求由用户执行，当前待完成。建议使用包含至少两个已配置 symbol 的真实项目复验：

1. 一次选择同一 closure 的更新 skeleton JSON、atlas、page 图片并 overwrite，确认全部仍存在的
   animation/slot/transform/layer/value/ImgNumber/音效配置保持，预览使用新 bytes。
2. 用 atlas page logical name 改变且新图片齐全的批次覆盖，确认只同步 exact atlas texture
   binding，ZIP 可导出并重导。
3. 覆盖删除一个已选 animation 的 skeleton，确认只清理并提示 exact state；再尝试缺 page 或
   slot 的非法批次，确认整个项目不变。
4. 对已配置 state/value tier 打开 Picker 并确认当前 skeleton/atlas，确认不再清空 animation
   或 slot；改选包含同名 animation/slot 的兼容 skeleton，确认配置继续保留。

## 剩余风险

- 全量 Symbols Editor test 仍受过期 Crave fixture 阻塞；这是仓库测试资产维护问题，不影响本次
  17 个直接回归测试，但后续应独立迁移这些历史 fixture。
- 浏览器真实 official Spine decode、Pixi preview 和 ZIP 下载/重导尚待用户验收；自动测试和
  Vite build 不替代视觉结果。
