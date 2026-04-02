# pixiani 初始化任务报告

## 任务背景

本次任务目标是将 `packages/pixiani` 从旧的独立动画模板形态，整理为符合当前 `slotclientengine` monorepo 规范的内部动画基础包，使其同时具备稳定库导出能力和本地预览能力。

## 实际完成项

- 将包名改为 `@slotclientengine/pixiani`，统一为正式 workspace 包。
- 删除包内 `turbo.json`，改用根级 `turbo` 统一调度。
- 将脚本收敛为 `build`、`dev`、`lint`、`test`、`typecheck`、`format`、`format:check`。
- 新增正式库入口 `src/index.ts`，并补充 `src/core/index.ts`、`src/ani/index.ts`。
- 将 `src/main.ts` 明确为本地预览壳，不参与正式构建产物导出。
- 重整 `tsconfig.json`、新增 `tsconfig.build.json` 与 `tsconfig.eslint.json`，对齐根级工具链约束。
- 调整 `vite.config.ts`，让预览构建输出到 `dist-preview/`，避免与正式库构建的 `dist/` 混淆。
- 升级并规范 `eslint.config.cjs`，与当前仓库内其他包的做法保持一致。
- 对 `VisualEntity`、`ObjectPool`、`EntityManager` 引入更清晰的泛型边界，稳定 `core` 契约。
- 将 `src/ani`、`tests/ani` 的空目录占位从 `.gitkeep` 替换为 `.keepme`。
- 重写 `packages/pixiani/README.md` 与 `packages/pixiani/agents.md`，统一包定位和协作规则。

## 关键决策

### 1. 正式包定位

确定 `pixiani` 的主定位为“动画内核 + 动画承载模板”，而不是动画成品库或独立演示项目。

### 2. 正式导出方式

采用 `src/index.ts` 作为正式库入口，并同时暴露：

- 根入口
- `core` 子路径
- `layout` 子路径
- `ani` 子路径

`src/main.ts` 不再承担任何正式导出职责。

### 3. 构建策略

- 正式库构建使用 `tsc -p tsconfig.build.json` 输出到 `dist/`。
- 本地预览继续使用 `vite dev`。
- 若手动执行 `vite build`，输出到 `dist-preview/`，避免覆盖库产物。

### 4. `core` 稳定边界

- `VisualEntity<TConfig>` 负责统一生命周期、timeline 清理与完成标记。
- `ObjectPool<TConfig, TEntity>` 负责以稳定 `init/reset` 契约复用实体。
- `EntityManager` 负责统一更新、父节点移除和回收到对象池。

## 对 `src/core` 的整理结论

本次没有对 `core` 做重型重构，而是完成了初始化阶段最关键的契约稳定化：

- 将原先过弱的 `unknown` 初始化接口提升为显式泛型。
- 为实体补充 `beginLifecycle()` 和 `markFinished()`，减少后续 Agent 写动画时重复手工处理生命周期细节。
- 调整管理器在回收时先移除父节点，再归还对象池，避免实体 `reset()` 与显示树残留发生耦合。

## 正式导出入口与调试入口处理方式

- 正式导出入口：`src/index.ts`
- 本地调试入口：`src/main.ts`
- 预览页面入口：`index.html`

当前策略是“库优先，预览保留”。这符合本任务的初始化目标，也避免一次性引入额外的打包复杂度。

## 执行过的验证命令与结果

本次执行过程中已完成：

- 对 `packages/pixiani` 的编辑后错误检查，结果为无编辑器诊断错误。
- 在仓库根目录执行 `pnpm install`，成功更新依赖与锁文件。
- 在仓库根目录执行 `pnpm lint`，通过。
- 在仓库根目录执行 `pnpm test`，通过。
- 在仓库根目录执行 `pnpm typecheck`，通过。
- 在仓库根目录执行 `pnpm build`，通过。

其中 `packages/pixiani` 测试结果为 4 个测试文件、7 个测试全部通过，覆盖率满足当前阈值要求。

## 遇到的问题及处理方式

- 原包名仍为占位值 `[projname]`，已改为正式内部包名。
- 包内仍保留旧模板的 `turbo run build:app` 等二级任务命名，已改为标准脚本名并移除包内 `turbo.json`。
- 旧配置中正式库入口与调试入口混杂，已通过 `src/index.ts` 和 `src/main.ts` 完成职责分离。
- `src/ani`、`tests/ani` 使用 `.gitkeep`，不符合仓库约定，已改为 `.keepme`。

## 当前遗留事项

- 未来首次新增动画实体时，应同步补充 `src/ani/index.ts` 的聚合导出。
- 若后续需要对外发布或供非 bundler 环境消费，可再评估更明确的发布产物策略。

## agents.md 更新情况

- 已更新 `packages/pixiani/agents.md`，因为该包的定位、目录职责和验证方式发生了明显变化。
- 未更新根级 `agents.md`，因为本次没有修改全仓协作规则、目录规范或根级基础脚本约定。