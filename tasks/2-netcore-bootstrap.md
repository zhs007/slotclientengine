# netcore 初始化任务计划

## 1. 任务目标

将 `packages/netcore` 从“独立仓库直接复制进 monorepo”的状态，整理为符合当前仓库约束的内部网络库，使其能够被 `pnpm` + `turbo` 正常编排、被其他 workspace 包稳定依赖，并为后续接入真实应用或游戏模板提供清晰、可维护的基线。

本计划为可直接执行版本，不依赖额外口头上下文。

## 2. 当前现状

基于当前仓库内容，可确认 `packages/netcore` 仍保留明显的旧仓库痕迹：

- `package.json` 仍使用旧包名 `slotcraft-client-net`，且脚本以 `npm` 为中心。
- 包内存在独立 `devDependencies`，与根目录工具链版本体系未对齐。
- `tsconfig.json` 未继承根级 `tsconfig.base.json`。
- 包内存在 `package-lock.json`，与仓库统一使用 `pnpm` 的要求冲突。
- 包内 `agents.md` 明确要求使用 `npm install`、`npm run check`，与根仓协作规范不一致。
- README、中文文档、仓库地址、安装方式、命令示例仍指向旧项目语境。
- 包内测试、lint、build 虽然存在，但尚未明确接入 monorepo 的根级脚本与 turbo 流程。

## 3. 完成定义

当以下条件全部满足时，可认为本任务完成：

- `packages/netcore` 可被视为当前 monorepo 下的一个正式内部包。
- 依赖安装、构建、测试、类型检查、格式化均通过 `pnpm` / `turbo` 统一运行。
- 包配置与根级 Node.js、TypeScript、ESLint、Prettier、Vitest 版本策略一致。
- 清理掉与 monorepo 规范冲突的旧仓库残留文件和指令。
- 文档能准确描述该包在当前仓库中的定位、使用方式和开发方式。
- 任务执行完成后，在 `tasks/` 下产出中文任务报告。
- 若执行过程中修改了仓库协作规则、目录规范或基础脚本，同步更新根级 `agents.md`。

## 4. 默认假设

为保证任务可执行，先按以下假设推进：

- `packages/netcore` 当前定位为内部库，默认优先服务本仓库内部项目，而不是立即作为独立 npm 包发布。
- 若无强制外部兼容需求，优先向当前 monorepo 的工程规范靠拢，而不是保留旧仓库的发布习惯。
- 默认保留现有源码设计、测试资产和示例代码，当前重点是“工程接入与整理”，不是立即重写网络协议实现。
- 若执行中发现源码逻辑缺陷，可记录在报告中，但不应阻塞本次初始化任务完成，除非该缺陷直接导致构建或测试无法通过。

## 5. 执行范围

本次任务应覆盖以下范围：

- `packages/netcore/package.json`
- `packages/netcore/tsconfig*.json`
- `packages/netcore/vitest.config.ts`
- `packages/netcore/eslint.config.cjs`
- `packages/netcore/src/**`
- `packages/netcore/tests/**`
- `packages/netcore/README.md`
- `packages/netcore/README.zh.md`
- `packages/netcore/docs/**`
- `packages/netcore/agents.md`
- `packages/netcore/package-lock.json`
- 如有必要，根级 `package.json`
- 如有必要，根级 `turbo.json`
- 如有必要，根级 `agents.md`

## 6. 任务拆分

### 任务 1：确认包定位与命名

目标：明确 `netcore` 在 monorepo 中的正式身份，避免后续脚本、导入方式、文档名称继续漂移。

执行内容：

- 审核 `packages/netcore/package.json` 的 `name`、`version`、`description`、`license`、`type`、`files`、`main`、`types`。
- 将旧仓库品牌信息与当前仓库语境对齐。
- 若决定作为内部库使用，包名应采用与 monorepo 一致的命名方式，例如 `@slotclientengine/netcore` 或同等风格的 workspace 包名。
- 明确是继续输出 CommonJS，还是切换为更适合当前仓库的产物格式；若没有强制兼容要求，需给出统一结论并据此调整入口字段。

验收标准：

- 包名、描述、入口字段、模块类型之间无冲突。
- 文档、代码示例、未来应用引用方式可以围绕同一个正式包名展开。

### 任务 2：接入根级工具链与 workspace 规范

目标：让 `netcore` 不再像一个独立仓库，而是作为当前 monorepo 子包被统一管理。

执行内容：

- 梳理包内 `devDependencies`，将应由根目录统一维护的工具链依赖收敛到根级版本策略。
- 优先复用根级 `typescript`、`eslint`、`prettier`、`vitest`、`ts-node`、`@types/node`。
- 如包内确有运行时依赖，保留在包自身；如仅用于开发和测试，优先判断是否应保留在包内或迁移到根级。
- 移除 `package-lock.json`，确保仓库只保留 `pnpm-lock.yaml` 作为锁文件。
- 检查是否需要在根级脚本或 `turbo.json` 中补充/修正该包任务接入方式。

验收标准：

- 在仓库根目录执行 `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm typecheck` 时，`netcore` 能被 `turbo` 正确纳入。
- 仓库内不再引入 `npm` 锁文件冲突。

### 任务 3：统一 TypeScript 与构建配置

目标：让包配置与 monorepo 的 TypeScript 基线一致，降低后续新增包时的维护成本。

执行内容：

- 让 `packages/netcore/tsconfig.json` 继承根级 `tsconfig.base.json`，仅保留该包真正需要覆盖的差异配置。
- 复核 `rootDir`、`outDir`、`declaration`、`module`、`moduleResolution`、`target`、`lib` 是否仍然合理。
- 检查 `tsconfig.eslint.json` 是否也应随之调整。
- 评估当前构建命令是否继续使用 `tsc` 即可；若可满足需要，优先保持简单，不额外引入打包器。

验收标准：

- `netcore` 的 TypeScript 配置与根级基线关系清晰。
- `pnpm typecheck` 与 `pnpm build` 可稳定执行。

### 任务 4：统一测试与质量检查入口

目标：保留现有测试资产，同时让测试、lint、格式化命令符合仓库统一使用方式。

执行内容：

- 审核包内 `scripts`，将 `npm run ...` 语境改为适配 `pnpm` + `turbo` 的脚本组织方式。
- 确认 `build`、`test`、`lint`、`typecheck`、`format`、`format:check` 的命名与根仓一致。
- 校验 `vitest.config.ts`、`eslint.config.cjs` 与当前依赖版本是否兼容。
- 如现有配置使用了旧版本写法，应一并升级到当前仓库可维护的写法。
- 明确是否保留 `check` 脚本；若保留，应保证其底层调用仍符合当前包管理器约束。

验收标准：

- 质量检查脚本名称统一，执行路径清晰。
- 包内现有测试可在 monorepo 环境中被稳定执行。

### 任务 5：清理旧仓库指令和文档漂移

目标：消除误导性文档，避免后续开发者按照旧仓库说明误操作。

执行内容：

- 更新 `packages/netcore/agents.md`，去除 `npm install`、`npm run check` 等与根仓不一致的指令。
- 更新 `README.md`、`README.zh.md`、`docs/**` 中的安装方式、命令示例、包名、仓库地址、项目定位。
- 将“独立发布库”视角切换为“monorepo 内部网络库”视角；若仍需保留未来发布可能性，应明确写为后续事项，而不是当前事实。
- 检查示例代码中的导入路径与包名引用，确保与正式命名一致。

验收标准：

- 文档中不再出现与当前仓库规范冲突的命令或定位描述。
- 新成员只读当前仓库文档即可正确安装、开发、测试 `netcore`。

### 任务 6：验证与问题收口

目标：在任务结束前形成可复现的验证闭环，并记录剩余问题。

执行步骤：

1. 在仓库根目录执行 `pnpm install`。
2. 如依赖下载失败，先执行：
   `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`
3. 再次执行 `pnpm install`。
4. 执行 `pnpm lint`。
5. 执行 `pnpm test`。
6. 执行 `pnpm typecheck`。
7. 执行 `pnpm build`。

若上述命令中存在失败项：

- 先修复本次初始化范围内的配置类问题。
- 若失败来自 `netcore` 历史逻辑缺陷或测试假设不成立，应在任务报告中明确记录“现象、原因、影响、是否阻塞后续”。

验收标准：

- 至少形成一轮完整验证记录。
- 剩余问题被清晰记录，而不是隐含留存。

## 7. 建议执行顺序

为降低返工，建议按以下顺序执行：

1. 先做包定位与命名。
2. 再做 `package.json`、依赖、锁文件、脚本整理。
3. 然后统一 `tsconfig`、ESLint、Vitest 配置。
4. 接着修正文档与 `agents.md`。
5. 最后执行 `pnpm install` 与全量验证。
6. 收尾输出任务报告。

## 8. 交付物清单

任务完成后，至少应有以下交付物：

- 已整理完成的 `packages/netcore` 工程配置
- 已更新完成的 `packages/netcore` 文档
- 已清理完成的锁文件与旧仓库残留说明
- 一份中文任务报告，放在 `tasks/` 下

任务报告命名规则：

- 文件名格式：`2-[taskname]-[utctime].md`
- `taskname` 必须使用英文加中横线，且应与本任务计划名称保持一致或高度一致
- `utctime` 使用年月日时分秒，格式示例：`260401-181300`

建议本任务报告命名示例：

- `tasks/2-netcore-bootstrap-260402-103000.md`

## 9. 任务报告要求

任务执行完成后，必须输出一份中文任务报告，内容至少包含：

- 任务背景
- 实际完成项
- 对 `packages/netcore` 做出的关键决策
- 执行过的验证命令与结果
- 遇到的问题及处理方式
- 当前遗留事项
- 是否更新了 `agents.md`，若更新，说明原因

## 10. agents.md 更新规则

本次任务执行过程中，若出现以下任一情况，需要同步更新根级 `agents.md`：

- 仓库协作规则发生变化
- 目录规范发生变化
- 根级脚本约定发生变化
- 依赖安装或验证流程新增了必须遵守的统一步骤

若仅是 `packages/netcore` 包内文档修正，而未改变仓库级规则，则可以不修改根级 `agents.md`。

## 11. 本计划中不要求本轮解决的事项

以下事项可以记录，但不作为本次初始化任务的完成前置：

- 重新设计网络协议抽象
- 大规模重命名源码类名，如 `SlotcraftClient` 是否改为更通用品牌名
- 引入新的运行时框架或网络传输层
- 将 `netcore` 立即发布到外部 npm 仓库
- 将现有示例扩展为完整可运行游戏应用

## 12. 风险与注意事项

- 包内现有测试可能依赖旧版配置行为，升级配置时要先保住可运行性，再逐步做规范收紧。
- 若 `type`、`main`、`types`、构建输出格式调整不当，可能导致下游导入方式变化，应在报告中明确记录。
- 文档里的旧仓库名、旧 CI 徽章、旧安装命令很容易漏改，执行时应专门做一次全文检查。
- 如果安装依赖失败，不要直接判定任务不可执行，应先按代理方式重试。

