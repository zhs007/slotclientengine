# pixiani 初始化任务计划

## 1. 任务目标

将 `packages/pixiani` 从“旧动画模板直接复制进 monorepo”的状态，整理为符合当前仓库约束的内部动画基础包，使它既保留 `src/core` 这套可复用的动画基础设施，又能作为后续 Agent 产出动画文件的稳定承载层，被当前仓库中的应用、模板或其他包直接接入。

本计划为可直接执行版本，不依赖额外口头说明。

## 2. 当前现状

基于当前仓库内容，可以确认 `packages/pixiani` 仍保留明显的旧模板特征：

- `package.json` 仍使用占位包名 `[projname]`，无法作为正式 workspace 包使用。
- 包内单独维护了 `turbo`、`typescript`、`vite`、`vitest`、`eslint`、`prettier` 等工具链版本，且版本明显落后于根目录。
- 包内脚本仍以二级任务名为主，例如 `build:app`、`lint:app`、`test:run`、`typecheck:app`，与根级 `turbo run build|lint|test|typecheck|format` 的统一入口不一致。
- 包内存在自己的 `turbo.json`，说明该包仍按“独立模板仓库”思路组织，而不是直接融入当前 monorepo。
- `tsconfig.json` 未继承根级 `tsconfig.base.json`，TypeScript 目标、模块解析策略与仓库基线不一致。
- `README.md` 和 `agents.md` 都还在描述一个“可单独起项目的动画模板”，而不是当前仓库中的内部动画库。
- `src/core` 已有可复用基础实现，包括 `VisualEntity`、`ObjectPool`、`EntityManager`，但整体接口仍偏旧模板语义，尚未明确为“Agent 写动画时依赖的稳定内核”。
- `src/ani`、`tests/ani` 当前为空壳目录语义，说明包的核心价值确实在 `core` 与最小入口骨架，而不是现成动画资产。
- `src/main.ts` 与 `index.html` 仍保留独立运行示例入口，这对开发动画很有帮助，但需要明确它在 monorepo 中是“调试壳”还是“正式应用入口”。

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `packages/pixiani` 在当前 monorepo 中有明确且一致的正式定位。
- 包名、目录结构、入口导出、脚本约定都与仓库现行规范一致。
- `src/core` 被整理成稳定基础层，适合作为 Agent 编写动画时的默认依赖。
- `src/ani`、`tests/ani`、调试入口与正式库导出之间的关系清晰，不再互相混淆。
- 该包可通过根目录的 `pnpm` 与 `turbo` 统一执行开发、校验和构建任务。
- 文档能准确说明：这个包不是成品动画库，而是“动画基础设施 + 动画承载模板”。
- 执行完成后，在 `tasks/` 下产出一份中文任务报告。
- 若执行过程中调整了仓库协作规则、目录规范或基础脚本，已同步更新根级 `agents.md`。

## 4. 默认假设

为保证任务可执行，默认按以下假设推进：

- `packages/pixiani` 当前优先作为仓库内部包使用，而不是立即作为独立 npm 包发布。
- `src/core` 应视为稳定基础设施层，但允许进行“为了适应当前 monorepo 与 Agent 工作流”的必要整理，不要求保持旧模板完全不变。
- 后续真实动画主要由 Agent 在 `src/ani` 中生成，当前初始化任务的重点是“把地基整理好”，不是立即补一批展示动画。
- `src/main.ts` 可以继续保留为本包的本地调试入口，但其职责应明确为开发/预览，而不是库导出本身。
- 若发现某些 `core` 设计细节不够理想，只要不阻塞初始化落地，可先在报告中记录为后续演进事项。

## 5. 执行范围

本次任务应覆盖以下范围：

- `packages/pixiani/package.json`
- `packages/pixiani/tsconfig.json`
- `packages/pixiani/vite.config.ts`
- `packages/pixiani/eslint.config.cjs`
- `packages/pixiani/turbo.json`
- `packages/pixiani/src/main.ts`
- `packages/pixiani/src/layout.ts`
- `packages/pixiani/src/core/**`
- `packages/pixiani/src/ani/**`
- `packages/pixiani/tests/**`
- `packages/pixiani/README.md`
- `packages/pixiani/agents.md`
- 如有必要，新增 `packages/pixiani/src/index.ts` 或同类正式导出入口
- 如有必要，根级 `package.json`
- 如有必要，根级 `turbo.json`
- 如有必要，根级 `agents.md`

## 6. 关键决策先行项

在开始改动前，必须先明确以下决策，并将结论写进实现与文档：

### 决策 1：正式包定位

需要先明确 `pixiani` 的正式身份，建议采用以下定位：

- 它不是“现成动画合集”。
- 它也不只是“独立演示项目模板”。
- 它应被定义为：`PixiJS + GSAP` 动画基础设施包，内含 `core`、动画组织约定、测试约定和可选调试入口，供 Agent 在其上持续产出动画文件。

建议结论：

- 把 `pixiani` 定位为“动画内核 + 动画模板承载层”。
- 文档中明确 `core` 是稳定层，`ani` 是任务产出层，`main.ts` 是本地调试壳。

### 决策 2：包名与导出方式

需要确定正式包名与导出边界，避免后续导入路径持续漂移。

建议方向：

- 包名改为与 monorepo 一致的内部命名，例如 `@slotclientengine/pixiani`。
- 正式导出应以库入口为核心，至少允许外部直接引用：
  - `core`
  - 通用布局/运行时辅助
  - 后续在 `ani` 中新增的动画实体
- 若保留 `src/main.ts` 作为预览入口，需避免它和库入口混用。

### 决策 3：保留还是移除包内 turbo.json

当前根级已经统一使用 `turbo.json` 和标准任务名，因此应优先决定是否继续保留包内二级 turbo 配置。

建议结论：

- 默认移除 `packages/pixiani/turbo.json`。
- 包内脚本改为直接暴露 `build`、`lint`、`test`、`typecheck`、`format`、`dev`。
- 仅在确有根级 `turbo` 无法表达的特殊需求时，才保留包内额外配置。

### 决策 4：core 的稳定边界

`src/core` 是后续 Agent 的主要依赖层，因此必须明确哪些内容属于稳定契约。

建议至少固定以下约定：

- `VisualEntity` 负责统一生命周期与 timeline 清理。
- `ObjectPool` 负责实例复用，`init/reset` 语义必须稳定。
- `EntityManager` 负责统一更新、结束检测、回收与父节点清理。
- `core` 中对外暴露的类型、泛型、方法命名，要优先服务“后续不断新增动画实体”的可维护性。

## 7. 任务拆分

### 任务 1：明确 `pixiani` 在 monorepo 中的正式定位

目标：先统一语义，再动工程配置，避免后续文件改完却继续自相矛盾。

执行内容：

- 确定正式包名、描述、是否 `private`、面向对象和使用场景。
- 统一“基础设施层 / 动画实现层 / 调试入口”的术语。
- 明确 `src/core`、`src/ani`、`src/main.ts` 各自职责，并写入 README 与包内说明。
- 明确本包是“内部基础包”，还是“内部应用模板”。如两者兼有，必须给出主次关系。

验收标准：

- 包定位有一句清晰、稳定、可重复引用的定义。
- 文档、包配置、目录说明不再互相冲突。

### 任务 2：修正包配置并接入根级工具链

目标：让 `pixiani` 成为标准 workspace 包，而不是独立模板项目。

执行内容：

- 修改 `package.json` 的 `name`、`description`、`packageManager`、`type`、`private`、`exports`、`files`、`scripts`。
- 将脚本统一为根仓标准任务名：
  - `build`
  - `dev`
  - `lint`
  - `test`
  - `typecheck`
  - `format`
  - `format:check`
- 清理或迁移应由根目录统一维护的工具链依赖版本。
- 判断 `pixi.js`、`gsap` 属于运行时依赖还是 peer 依赖；若当前仅供仓内使用，优先保持简单且可运行。
- 评估是否移除包内 `turbo.json`，让根级 `turbo` 直接调度本包。

验收标准：

- 在根目录执行 `pnpm build`、`pnpm lint`、`pnpm test`、`pnpm typecheck` 时，`pixiani` 能以标准 workspace 包方式参与。
- 包内不再需要自成体系的 turbo 任务命名。

### 任务 3：统一 TypeScript、Vite、ESLint、Vitest 配置

目标：让工程基线与根仓保持一致，同时保留动画开发所需的最小调试能力。

执行内容：

- 让 `packages/pixiani/tsconfig.json` 继承根级 `tsconfig.base.json`，只保留本包差异项。
- 重新审视 `module`、`moduleResolution`、`target`、`types`、`include` 配置，确保兼容当前根级版本。
- 校验 `vite.config.ts` 是否仍应同时承担应用构建和测试配置；如配置职责过重，可拆分为更清晰的结构，但不强制新增复杂度。
- 升级 `eslint.config.cjs` 到与当前根级版本相容的最小可维护写法。
- 确保 Vitest 能继续覆盖 `core` 和未来 `ani` 目录。

验收标准：

- 配置文件与根级工具链版本兼容。
- 类型检查、测试、构建都能在当前 monorepo 环境中稳定执行。

### 任务 4：整理正式导出入口与调试入口

目标：区分“给其他包用的入口”和“给动画开发者本地预览的入口”。

执行内容：

- 评估是否新增正式库入口，例如 `src/index.ts`，统一导出 `core`、布局辅助及未来可复用类型。
- 明确 `src/main.ts` 仅作为调试/预览入口存在，不承担正式库导出职责。
- 校验 `index.html`、Vite 构建产物和包导出字段之间的关系，避免 `build` 输出混乱。
- 若本包最终既需要“库构建”又需要“调试页面构建”，需在计划内明确采用哪种最小实现策略。

建议优先策略：

- 正式对外使用 `src/index.ts`。
- `src/main.ts` 继续用于 `pnpm --filter @slotclientengine/pixiani dev` 本地预览。
- 若当前阶段没有发布需求，可先以“类型检查 + 测试 + 调试可运行”为主，不强求一次性把库打包策略做复杂。

验收标准：

- 开发者和 Agent 都能明确知道“该从哪里引用库能力、从哪里跑本地预览”。
- 入口职责边界清晰，没有互相借道。

### 任务 5：整理 `core` 为稳定动画内核

目标：把当前 `src/core` 从“能用的旧基础实现”整理为“后续可持续依赖的稳定内核”。

执行内容：

- 审核 `VisualEntity`、`ObjectPool`、`EntityManager` 的命名、抽象边界和泛型表达。
- 检查 `init(config: unknown)` 这类过弱类型约束是否需要提升为泛型或基础接口，以降低后续 Agent 写动画时的歧义。
- 检查对象池回收与父节点移除流程是否足够稳定，避免动画实体接入时出现隐藏生命周期问题。
- 明确哪些类和类型需要作为公开 API 导出。
- 若 `core` 中存在明显偏旧模板的实现细节，应统一整理成当前仓库约定的编码风格。

验收标准：

- `core` 的公开能力清晰、最小且稳定。
- 后续新增动画实体时，不需要反复猜测生命周期和回收机制。

### 任务 6：规范动画目录与测试目录的初始化形态

目标：让 `src/ani` 与 `tests/ani` 既符合当前模板定位，也符合仓库目录约束。

执行内容：

- 确认 `src/ani`、`tests/ani` 是否需要保留为空目录。
- 若需要保留空目录，按仓库约定补 `.keepme`，避免目录丢失。
- 如有必要，在目录下补最小说明文件或导出占位，但不要加入误导性的示例动画。
- 明确未来动画文件的组织规则，例如按实体名、效果名或场景名拆分。

验收标准：

- 空目录不会在版本控制中丢失。
- 后续 Agent 新增动画文件时有明确落点和命名方式。

### 任务 7：更新文档与包内协作说明

目标：让任何新加入的开发者或 Agent 只看仓库内文档就能正确使用 `pixiani`。

执行内容：

- 重写 `packages/pixiani/README.md`，改为描述当前 monorepo 内部包定位。
- 更新 `packages/pixiani/agents.md`，把旧模板语境改为当前仓库的 Agent 执行规则。
- 在文档中明确：
  - `core` 是默认基础层
  - 新动画写在 `src/ani`
  - 对应测试写在 `tests/ani`
  - `main.ts` 是调试入口
  - 验证命令必须从根目录按统一脚本执行
- 明确依赖安装失败时的代理处理方式。

验收标准：

- 文档与代码配置一致。
- 包内不再出现占位项目名、旧工具链版本暗示、旧模板仓库语气。

### 任务 8：验证初始化结果并输出任务报告

目标：形成真正可复现的落地闭环，而不是只完成配置修改。

执行步骤：

1. 在仓库根目录执行 `pnpm install`。
2. 如依赖下载失败，先执行：
   `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`
3. 再次执行 `pnpm install`。
4. 执行 `pnpm lint`。
5. 执行 `pnpm test`。
6. 执行 `pnpm typecheck`。
7. 执行 `pnpm build`。
8. 如本包保留预览能力，再补充执行一次针对 `pixiani` 的 `dev` 或预览验证，确认本地入口可启动。

若过程中存在失败项：

- 先优先修复本次初始化范围内的配置问题。
- 若失败源于历史实现缺陷或 `core` 设计问题且不适合在本任务内彻底重构，应在任务报告中明确记录现象、原因、影响范围和后续建议。

验收标准：

- 至少完成一轮完整验证。
- 所有未解决问题都进入任务报告，而不是口头遗留。

## 8. 建议执行顺序

为减少返工，建议按以下顺序执行：

1. 先明确正式包定位、包名和入口职责。
2. 再整理 `package.json`、脚本、依赖与 `turbo` 接入方式。
3. 然后统一 `tsconfig`、`vite`、`eslint`、`vitest` 配置。
4. 接着处理正式导出入口与调试入口分离。
5. 再整理 `src/core` 的稳定边界与公开 API。
6. 随后处理 `src/ani`、`tests/ani` 的初始化形态。
7. 最后更新 README、`agents.md`、执行全量验证并产出任务报告。

## 9. 交付物清单

任务完成后，至少应有以下交付物：

- 已整理完成的 `packages/pixiani` 工程配置
- 已明确的正式包名与导出入口
- 已更新的 `src/core` 稳定基础设施边界
- 已规范的 `src/ani`、`tests/ani` 初始化目录
- 已更新的 `packages/pixiani/README.md`
- 已更新的 `packages/pixiani/agents.md`
- 一份中文任务报告，放在 `tasks/` 下

任务报告命名规则：

- 文件名格式：`3-[taskname]-[utctime].md`
- `taskname` 使用英文加中横线，并与本任务计划名称保持一致或高度一致
- `utctime` 使用年月日时分秒，格式示例：`260401-181300`

建议本任务报告命名示例：

- `tasks/3-pixiani-bootstrap-260402-103000.md`

## 10. 任务报告要求

任务执行完成后，必须输出一份中文任务报告，内容至少包含：

- 任务背景
- 实际完成项
- 对 `packages/pixiani` 做出的关键决策
- 对 `src/core` 的整理结论
- 正式导出入口与调试入口的处理方式
- 执行过的验证命令与结果
- 遇到的问题及处理方式
- 当前遗留事项
- 是否更新了 `agents.md`，若更新，说明原因

## 11. agents.md 更新规则

本次任务执行过程中，若出现以下任一情况，需要同步更新根级 `agents.md`：

- 仓库协作规则发生变化
- 目录规范发生变化
- 根级脚本约定发生变化
- 依赖安装或验证流程新增了必须统一遵守的步骤

若仅更新 `packages/pixiani/agents.md` 以反映该包自身的使用规则，而未改变根仓规则，则不必修改根级 `agents.md`。
