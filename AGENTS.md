# AGENTS.md

本仓库是基于 `pnpm` + `turbo` 的 TypeScript monorepo，用于 slot 游戏前端引擎、编辑器、运行时和可运行游戏开发。

## 指令使用方式

- 本文件只保存全仓长期不变量、规则路由和默认验收策略。
- 开始修改前，根据“领域规则路由”只读取与任务路径或功能直接相关的规则文件；禁止为保险起见一次性读取全部领域规则。
- 子目录存在 `AGENTS.md` 时，其规则在该目录范围内补充本文件。
- 用户当前任务的明确要求优先于默认验收级别，但不会自动扩大到无关代码或无关系统。
- 精确资源清单、动画时间、版本能力、当前配置值应由 manifest、YAML、测试或 package README 保存，不继续追加到根文件。
- 只有稳定、跨任务、会影响未来实现决策的规则才允许进入本文件；一次性任务结论和执行证据进入 `tasks/`。

## 工具链

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试：`vitest`
- 代码检查：`eslint`
- 格式化：`prettier`
- VS Code 调试 TypeScript：`ts-node`
- 子项目使用根级基础工具链依赖时，版本必须与根目录一致。

## 目录职责

- `apps/`：可运行游戏、编辑器、viewer 和构建工具。
- `packages/`：内部依赖库和共享 runtime。
- `assets/`：运行资源、manifest 和游戏静态配置输入。
- `tasks/`：任务计划、执行报告和证据，不作为 runtime 合同来源。
- `docs/`：面向开发者或用户的长期文档。
- `docs/agent-rules/`：按需读取的领域实现合同。

## 全仓架构不变量

- 后续游戏默认依赖 `@slotclientengine/gameframeworks`；除框架内部或任务明确要求外，游戏 app 不直接依赖 `uiframeworks`、`netcore` 或 `logiccore`。
- `packages/logiccore` 拥有通用 server 数据解析、严格校验和画面 mutation 前的不可变 execution plan；不得写入具体游戏 component、symbol 或画面状态机。
- `packages/rendercore` 拥有通用 Pixi/Spine/VNI 渲染、reel、symbol、popup、scene-layout 和 presentation 算法；游戏 app 只提供业务配置、resolver、formatter、layout 与显式 typed extension，不复制共享状态机或直接操作内部 display tree。
- 共享包不得硬编码 `game002`、`game003`、业务 component 名或 symbol code。游戏专属行为留在相应 app，通过 strict typed contract 注入。
- manifest、YAML 或 versioned config 是资源、能力、时序和变体绑定的唯一来源；不得在 app、生成物、测试或 shared runtime 维护第二份业务表。
- live slot 客户端只使用本地公开轮带渲染；服务器 scene 只覆盖本轮临时可见落点。不得读取、缓存、推断或泄露服务器真实轮带。
- 未知 kind、extension、state、animation、component、资源、路径、value 或版本必须显式失败。不得增加 placeholder、猜测路径、首项默认值、静默 alias 或效果降级来掩盖错误。
- 资源 ownership、prepare/commit/rollback/destroy 边界必须明确；异步失败不得留下半提交画面、泄漏或修改宿主对象。
- Pixi VNI runtime 与 Cocos runtime 是独立实现，不互相依赖，也不引入隐藏 renderer/DOM bridge。
- 生成文件必须由对应生成器更新并运行 `--check` 或 parity checker；禁止手改生成物。
- 新增空目录使用 `.keepme`。

## 领域规则路由

根据任务实际影响范围读取下列文件。一个任务跨多个领域时读取对应文件的并集，但不要读取无关领域。

| 路径或功能                                                                                             | 必读规则                                                                                                       |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `apps/game002`、`assets/game002-*`、`assets/gamecfg002`                                                | `docs/agent-rules/game002.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/loading-ui.md`     |
| `apps/game003`、`assets/game003-*`、`assets/gamecfg003`                                                | `docs/agent-rules/game003.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/loading-ui.md`     |
| `apps/gameviewer`、配置驱动 round、scene-layout template runtime                                       | `docs/agent-rules/gameviewer-round-flow.md`、`docs/agent-rules/shared-game-runtime.md`                         |
| `packages/rendercore`、`logiccore`、`gameframeworks`、`uiframeworks`                                   | `docs/agent-rules/shared-game-runtime.md`；再按实际业务读取 game002、game003、Game Viewer 或 scene-layout 规则 |
| `apps/gamelayouteditor`、scene layout、mode transition                                                 | `docs/agent-rules/scene-layout.md`、`docs/agent-rules/editor-artifacts.md`                                     |
| `apps/imgnumbereditor`、`popupeditor`、`symbolseditor`、`packages/editorresource`、`browserartifactio` | `docs/agent-rules/editor-artifacts.md`                                                                         |
| `packages/rendercore/popup`、award-celebration popup                                                   | `docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/shared-game-runtime.md`                              |
| `packages/vnicore`、`apps/anieditorv5viewer`、`docs/anieditor5`                                        | `docs/agent-rules/vni-runtime.md`                                                                              |
| `packages/anieditorv5runtime-cc`                                                                       | `docs/agent-rules/cocos-runtime.md`                                                                            |
| `packages/gameloading*`、游戏首屏 loading                                                              | `docs/agent-rules/loading-ui.md`                                                                               |

如果任务只修改文档、任务报告或与上述领域无关的独立 package，不加载领域规则。

## 默认验收策略

验收按风险分级，默认使用能证明本次改动正确的最小级别。

### L0：文本或元数据

适用于文档、注释、无行为变化的版本文本或简单配置：

- 检查目标 diff；
- 搜索残留旧值；
- 运行与文件格式直接相关的 checker。

### L1：单 package 定向验收（默认）

适用于 package 内部实现：

- 目标 package 的 typecheck；
- 直接相关测试，必要时目标 package 全量测试；
- 发生构建或导出变化时运行目标 package build/check；
- `git diff --check`。

不默认运行根级 `pnpm typecheck/lint/test/build/format:check`。

### L2：直接依赖链

仅在以下情况升级：

- 修改跨 package public API；
- 修改共享 schema、生成器或正式交付物；
- 直接消费者可能编译或行为回归；
- 定向测试已暴露直接依赖问题。

运行修改 package、直接消费者和必需的 parity/checker，不自动扩展到整个 monorepo。

### L3：整仓或发布验收

仅在以下情况使用：

- 用户明确要求发布级或整仓验收；
- 修改根工具链、workspace 配置或 lockfile；
- 大规模跨包重构无法用直接依赖链界定；
- 准备正式 release。

L3 才运行整仓 typecheck、lint、test、build、format 和人工视觉/性能验收。人工 Creator、浏览器或 profiler 验收不能由 fake runtime、编译或单测替代。

### 验收纪律

- 不得仅以“更保险”为理由升级级别。需要升级时先说明触发条件和新增命令。
- 验收失败先最小化复现并判断是否由本任务引入；不得立刻扩大到全仓扫描。
- 文档或报告收尾后只重跑受影响的格式/链接/diff 检查，不重复已经通过的重型测试。
- 除非用户明确要求，执行报告保持简洁，不收集与风险无关的 coverage、历史提交矩阵或 profiler 证据。

## 工作约定

- 先检查工作区状态；保留用户已有和无关修改，不清理、不覆盖、不顺手格式化。
- 使用 `pnpm`，不要切换 npm/yarn。依赖缺失时优先 `CI=true pnpm install --frozen-lockfile`。
- Prettier 不检查 `dist/`、`coverage/`、缓存和外部生成物；package 需要时维护自己的 `.prettierignore`。
- 修改 YAML 后同步运行对应生成器与 `--check`；生成的 TypeScript 文件禁止手改。
- 任务影响稳定职责边界时，更新最小范围的领域规则；不要把具体任务报告重新复制进根文件。
