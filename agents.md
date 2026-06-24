# Agents

本仓库是基于 `pnpm` + `turbo` 的 TypeScript monorepo，面向 slot 游戏前端引擎开发，后续会承载游戏模版、网络库、渲染库及可运行应用。

## 仓库约束

- Node.js 版本要求：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- 代码检查：`eslint`
- 代码格式化：`prettier`
- VS Code 调试运行 TypeScript：`ts-node`

## 目录约定

- `apps/`：可运行项目
- `packages/`：内部依赖库
- `packages/gameframeworks`：后续 slot 游戏默认 facade，整合 UI、网络和逻辑数据流。
- `packages/vnicore`：Pixi.js v8 VNI 动画核心库，供 `apps/anieditorv5viewer` 等 Pixi 运行时使用；不要与 `packages/anieditorv5runtime-cc` 的 Cocos Creator runtime 混用。
- `tasks/`：任务计划、任务报告和执行记录
- `docs/`：项目文档

## 执行约定

- 新增空目录时请放置 `.keepme` 文件，避免目录丢失。
- 子项目如需使用根级基础工具链依赖，应与根目录版本保持一致。
- 后续游戏默认依赖 `@slotclientengine/gameframeworks`，不要直接依赖 `@slotclientengine/uiframeworks`、`@slotclientengine/netcore`、`@slotclientengine/logiccore`，除非是在框架内部或任务明确要求。
- `packages/vnicore` 拥有 VNI 播放状态机、segmented 高级播放、live 粒子排空、layer group render order 和 group slot 挂接语义；viewer 只能做 UI 配置、输入校验、状态展示和调用，不要在 `apps/anieditorv5viewer` 里复制播放状态机、group adjacency 算法或直接操作 runtime 私有 Pixi container。
- 更新 `packages/anieditorv5runtime-cc` 的 public runtime 行为时，必须同步模块化源码、`standalone/anieditorv5runtime-cc.ts`、`scripts/check-standalone.mjs`、standalone 测试和 `standalone.zip`，避免 Cocos 主要交付面与 workspace package 漂移。
- 若依赖安装失败，可先执行：
  `export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;`
- 当任务影响仓库协作规则、目录规范或基础脚本时，需要同步更新本文件。
