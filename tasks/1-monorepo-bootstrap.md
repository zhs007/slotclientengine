# Monorepo 初始化任务计划

## 1. 目标

在当前仓库中完成一个可持续扩展的 TypeScript monorepo 初始化，满足 slot 游戏前端引擎项目的基础要求，为后续接入游戏模版、网络库、渲染库和独立运行应用提供统一基线。

## 2. 已知需求落点

- 根目录必须具备 monorepo 基础配置。
- 使用 `pnpm` 作为唯一包管理器。
- 使用 `turbo` 统一编排脚本。
- 使用 `vite@>=8` 作为前端打包工具。
- 使用 `vitest@>=4` 作为测试框架。
- 使用 `eslint@>=10` 与 `prettier` 管理代码质量。
- 使用 `ts-node` 作为 VS Code 直接调试 TypeScript 的执行方式。
- Node.js 版本固定为 `>=24`。
- 必须存在 `apps/`、`packages/`、`tasks/`、`docs/`。
- 空目录保留 `.keepme`。
- 任务完成后输出中文任务报告到 `tasks/`。

## 3. 为保证可落地，补充的必要项

以下内容虽然未在原始需求中逐项点名，但属于 monorepo 初始化的必要组成，建议纳入本次初始化范围：

- `pnpm-workspace.yaml`
  作用：声明 `apps/*` 与 `packages/*` 为工作区，否则 `pnpm` 无法识别 monorepo。
- `turbo.json`
  作用：统一定义 `build`、`dev`、`lint`、`test`、`typecheck`、`format` 等任务。
- `tsconfig.base.json`
  作用：为所有子项目提供统一 TypeScript 编译基线，确保版本和行为一致。
- 根级脚本规范
  作用：确保所有子项目通过 `turbo run <task>` 执行，而不是各自散乱维护命令。

## 4. 默认假设

本计划为可直接执行版本，不依赖额外口头确认。若后续业务要求发生变化，再单独开任务调整。

- 默认使用 ESM 风格的 TypeScript 配置。
- 默认根目录只放通用工具链依赖，不直接承载业务源码。
- 默认前端应用与内部库后续统一从根级继承 TypeScript、ESLint、Prettier、Vitest 版本。
- 默认锁文件使用 `pnpm-lock.yaml`，应纳入版本控制。
- 默认根目录允许维护共享配置包，例如 `packages/config-*`。
- 默认文档以中文为主，必要时可中英混合。

## 5. 执行任务拆分

### 任务 1：建立仓库骨架

目标：完成最小目录与占位文件落地。

交付物：

- `apps/`
- `packages/`
- `tasks/`
- `docs/`
- 空目录中的 `.keepme`
- `.gitignore`
- `agents.md`

验收标准：

- 目录结构清晰可见。
- 空目录提交后不会丢失。
- `agents.md` 说明仓库基础协作规则。

### 任务 2：建立根级 monorepo 配置

目标：让仓库具备被 `pnpm` 与 `turbo` 正确识别的能力。

交付物：

- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`

具体要求：

- `package.json` 中声明 `private: true`。
- `package.json` 中声明 Node.js `>=24` 的 `engines`。
- 根级 `devDependencies` 至少包含：
  `typescript`、`turbo`、`vite`、`vitest`、`eslint`、`prettier`、`ts-node`、`@types/node`。
- 根级 `scripts` 至少包含：
  `build`、`dev`、`lint`、`test`、`typecheck`、`format`、`format:check`。
- `pnpm-workspace.yaml` 至少纳入 `apps/*` 与 `packages/*`。
- `turbo.json` 至少定义与根脚本同名任务。

验收标准：

- 执行 `pnpm install` 时，工作区可被识别。
- 后续任一子项目可以无歧义继承根级工具链版本。

### 任务 3：统一子项目版本继承策略

目标：保证后续新增子项目时，工具链版本不漂移。

执行方式：

- 约定所有子项目不得单独升级 `vite`、`vitest`、`eslint`、`prettier`、`ts-node`、`typescript`。
- 子项目若需要这些工具，应优先直接使用根级版本。
- 如确有独立版本需求，必须单开任务评估兼容性后再变更。

建议落地方式：

- 优先通过 workspace 依赖、共享配置包或根级脚本暴露统一能力。
- 后续新增 `packages/config-eslint`、`packages/config-typescript`、`packages/config-vitest` 时，统一从根级维护版本。

验收标准：

- 新建任意一个 `app` 或 `package` 时，不需要自行决定工具链版本。

### 任务 4：安装依赖并生成锁文件

目标：完成可复现的依赖安装。

执行步骤：

1. 确认本机 Node.js 版本不低于 `24`。
2. 确认已安装 `pnpm`。
3. 在仓库根目录执行 `pnpm install`。
4. 如安装失败，先执行：
   `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`
5. 再次执行 `pnpm install`。

交付物：

- `pnpm-lock.yaml`

验收标准：

- 依赖安装成功。
- 锁文件生成成功。

### 任务 5：建立共享代码规范基线

目标：为后续子项目接入提供统一的 lint、format、test、typecheck 规范。

建议交付物：

- 根级 ESLint 配置文件
- 根级 Prettier 配置文件
- 根级 Vitest 共享配置文件
- VS Code 调试说明文档或 `.vscode/launch.json`

说明：

- 该任务建议在第一个实际子项目创建前完成。
- 由于当前尚未确定框架细节，配置应先以 TypeScript 通用规则为主，再按具体子项目补充分层规则。

验收标准：

- 任一后续子项目都可以复用统一规范，而不是从零复制配置。

### 任务 6：建立首个示例应用与首个共享库

目标：验证 monorepo 结构不是“静态摆设”，而是可运行、可引用、可测试。

建议交付物：

- `apps/<sample-app>/`
- `packages/<sample-lib>/`
- 示例应用通过 workspace 引用示例共享库
- 示例应用具备最小 `vite` 启动能力
- 示例库具备最小导出能力

验收标准：

- `pnpm dev`、`pnpm build`、`pnpm test`、`pnpm lint`、`pnpm typecheck` 至少能在示例项目上跑通。

## 6. 当前阶段建议立即执行范围

为了尽快进入“可继续迭代”的状态，建议本轮先完成以下内容：

- 任务 1：建立仓库骨架
- 任务 2：建立根级 monorepo 配置
- 任务 3：统一子项目版本继承策略
- 如网络条件允许，再执行任务 4：安装依赖并生成锁文件

## 7. 本计划中无需二次确认的事项

以下事项已经在计划中按默认工程实践定稿，可直接执行：

- monorepo 管理工具使用 `pnpm workspace + turbo`
- TypeScript 作为主语言，并准备共享 `tsconfig`
- 子项目与根级工具链版本保持一致
- 保留 `tasks/` 与 `docs/` 作为正式目录
- 使用 `.keepme` 保留空目录
- 使用中文任务文档

## 8. 后续如需确认，建议单独开任务的事项

这些事项会影响后续实现，但不阻塞当前初始化：

- 首个可运行应用使用纯 `vite` 还是 `react + vite`
- 渲染层最终使用 `pixi.js`、`phaser`、`three.js` 还是自研封装
- 网络层协议栈使用 `fetch`、`ws` 还是自定义传输封装
- 是否需要 `changeset`、`commitlint`、`husky`、`lint-staged`
- 是否需要 `playwright` 或 `cypress` 做端到端测试
- 是否需要根级 `README.md` 与 `CONTRIBUTING.md`

## 9. 完成定义

当以下条件全部满足时，可认为“初始化任务”完成：

- 基础目录与占位文件存在
- 根级 monorepo 配置存在
- 依赖可安装，且锁文件可生成
- 根级脚本可被 `turbo` 统一调度
- 后续创建子项目时，有明确的版本继承与目录约定
- `tasks/` 中留有任务计划与任务报告
- 若仓库协作规则被调整，`agents.md` 已同步更新
