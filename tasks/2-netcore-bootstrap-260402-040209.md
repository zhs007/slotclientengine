# netcore 初始化任务报告

## 任务背景

`packages/netcore` 最初是从独立仓库直接拷入当前 monorepo 的网络库，包名、脚本、锁文件、文档和工具链配置仍然保留明显的旧仓库痕迹，与当前仓库统一使用 `pnpm` + `turbo` 的约束不一致。本次任务的目标是将其整理为当前仓库下可持续维护的内部 workspace 包。

## 实际完成项

1. 将包正式整理为内部 workspace 包，包名改为 `@slotclientengine/netcore`，并补齐 `exports`、`files`、仓库地址和主页信息。
2. 将包脚本统一到 `pnpm` 语境，补齐 `format:check`，并把 `check` 调整为 `pnpm lint && pnpm test && pnpm typecheck && pnpm build`。
3. 删除与仓库规范冲突的 `packages/netcore/package-lock.json`，保留根级 `pnpm-lock.yaml` 作为唯一锁文件。
4. 删除旧的 `jest.config.js` 残留，并同步精简 ESLint 配置中的对应兼容逻辑。
5. 将 `packages/netcore/tsconfig.json` 改为继承根级 `tsconfig.base.json`，并切换到 TypeScript 6 可兼容的 `Node16` 模块配置。
6. 调整 `vitest.config.ts`、`eslint.config.cjs`、`tsconfig.eslint.json`，使其能在当前 monorepo 环境下稳定工作。
7. 更新 `README.md`、`README.zh.md`、`docs/usage_en.md`、`docs/usage_zh.md`、`examples/example001.ts`、`packages/netcore/agents.md`，清除旧仓库名和 `npm` 工作流说明。
8. 修复由于 Vitest 4 升级带来的 `tests/connection.test.ts` 构造 mock 兼容问题，恢复测试通过。

## 对 packages/netcore 做出的关键决策

1. 将 `netcore` 明确定位为当前 monorepo 的内部包，而不是当前就面向外部 npm 发布的独立库，因此设置为 `private: true`。
2. 保留当前产物为 `dist/` 下的 CommonJS 兼容输出，但通过 `module: Node16` / `moduleResolution: Node16` 适配 TypeScript 6 的新约束。
3. 优先复用根级工具链二进制，不再在包内重复声明 `typescript`、`vitest`、`eslint`、`prettier`、`ts-node` 等基础工具依赖；仅保留该包自身额外需要的开发依赖。
4. 保留现有源码 API 和测试资产，当前重点放在工程接入与文档纠偏，不对网络协议实现和业务接口做破坏性改动。

## 执行过的验证命令与结果

1. `pnpm install`
结果：成功。首次执行时发现 `@vitest/coverage-v8` 与根级 Vitest 主版本不一致，随后升级到 `^4.0.0` 并重新安装。

2. `pnpm lint`
结果：成功。

3. `pnpm test`
结果：成功。共 6 个测试文件，78 个测试通过，1 个测试保持跳过。

4. `pnpm typecheck`
结果：成功。中途发现 `moduleResolution: node` 在 TypeScript 6 下已报错，改为 `Node16` 后通过。

5. `pnpm build`
结果：成功。

补充说明：在一次完整串行验证中，先后暴露了 Vitest 4 mock 兼容问题和 TypeScript 6 模块解析配置问题，均已在本次任务内修复并重新验证通过。

## 遇到的问题及处理方式

1. `@vitest/coverage-v8` 仍停留在 3.x，安装后出现对 `vitest@3.2.4` 的 peer 依赖告警。
处理方式：将 `@vitest/coverage-v8` 升级为 `^4.0.0`，重新执行 `pnpm install`。

2. `tests/connection.test.ts` 中的 `WebSocket` mock 使用箭头函数，升级到 Vitest 4 后不能再被 `new WebSocket(...)` 当作构造函数使用。
处理方式：改为构造函数形式的 mock 实现，恢复该测试文件通过。

3. `packages/netcore/tsconfig.json` 原先采用 `moduleResolution: node`，在 TypeScript 6 下直接报 `TS5107`。
处理方式：改为 `module: Node16` 和 `moduleResolution: Node16`，保持现有包输出语义并消除错误。

## 当前遗留事项

1. 测试覆盖率总览为 89.45%，略低于旧文档中曾提到的 90% 目标，但本次初始化任务并未要求补测提升覆盖率，且不影响当前工程接入完成。
2. `docs/frontend-ws-doc-en.md`、`docs/frontend-ws-doc-zh.md` 仍以协议说明为主，虽然未与本次 monorepo 接入冲突，但后续可以继续统一语气和包定位描述。
3. `packages/netcore/jules*`、`codereview/*` 等历史记录文件仍保留旧仓库语境，这些属于历史资产，不作为本次初始化任务阻塞项。
4. `pnpm install` 过程中仍会看到来自某个依赖的 `url.parse()` 弃用告警，当前不影响安装和构建，未在本轮处理。

## 是否更新了 agents.md

- 已更新 `packages/netcore/agents.md`。
- 原因：包内原说明仍要求使用 `npm install`、`npm run check`，与当前仓库统一使用 `pnpm` + `turbo` 的协作方式冲突，属于本次任务必须修正的旧仓库残留说明。
- 未更新根级 `agents.md`，因为本次没有修改仓库级目录规范、根级脚本约定或统一验证流程。