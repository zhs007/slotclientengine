# 63 buildgamestatic game static config 任务报告

## 结果

已完成 `apps/buildgamestatic` 初始化、`packages/gameframeworks/static-config` 核心能力、`apps/game003` 静态 YAML 迁移与生成配置接入。

浏览器验收按任务要求未代跑，交由用户执行。

## 主要改动

- 新增 `apps/buildgamestatic` CLI：
  - 读取 `apps/game003/config/game-static.yaml`。
  - 严格校验 schema、未知字段、路径、引用文件、URL、数字和 reel/window 尺寸。
  - 生成确定性的 `apps/game003/src/generated/game-static.generated.ts`。
  - 支持 `--check` 校验生成物同步，失败时不覆盖文件。
- 新增 `@slotclientengine/gameframeworks/static-config`：
  - 提供静态配置类型、运行期校验、skin helper、query 拒绝 helper 和 frame policy helper。
  - 不引入 YAML、fs、path 等 Node-only 依赖到浏览器静态配置入口。
- 迁移 `apps/game003`：
  - `gameId`、`brandLabel`、固定 live `serverUrl` / `gamecode`、skin、资源路径、art/focus/frame/reel timing 等静态值来自 YAML 生成模块。
  - `serverUrl` query 继续显式失败。
  - `gamecode` query 可省略；若旧链接提供则必须与 YAML 固定值一致。
  - `skin` 校验来自 YAML `supportedSkins`，当前仍只支持 `skin=1`。
  - symbol display 集合和 scale 仍以 manifest 为准，YAML 不维护第二份 scale 表。
- 更新文档和规则：
  - `apps/game003/README.md`
  - `apps/buildgamestatic/README.md`
  - `packages/gameframeworks/README.md`
  - `agents.md`

## 依赖与生成物

- 新增 `apps/buildgamestatic` workspace package。
- 新增依赖：
  - `yaml`
  - `prettier`，用于生成 TS 前格式化输出，保证 generated 文件与 `format:check` 不冲突。
- 已执行 `pnpm install --no-frozen-lockfile` 并同步 `pnpm-lock.yaml`。
- `dist/`、`coverage/` 等生成物仍为忽略产物，不应提交。

## 验收命令

已通过：

```bash
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter buildgamestatic format:check

CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check

CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check

./node_modules/.bin/prettier --check agents.md
```

过程中遇到过两类环境问题，均已处理：

- `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`：按计划使用 `CI=true` 重试。
- 沙箱 registry `EPERM`：按计划使用 `http_proxy=http://127.0.0.1:1087` / `https_proxy=http://127.0.0.1:1087` 代理重试并通过。

## 第二遍遗漏检查

- `apps/buildgamestatic` 文件齐全，并包含 `.prettierignore`，避免 `coverage/` 被 format check 扫描。
- `packages/gameframeworks/src/static-config` 文件齐全，`package.json` 已新增 `./static-config` export。
- `apps/game003/config/game-static.yaml` 保留中文注释，且 `gameId=game003`、`brandLabel=game003` 与任务合同一致。
- `apps/game003/src/generated/game-static.generated.ts` 由工具生成，无绝对路径、时间戳、用户名或 token。
- `game003` 横竖屏 focus、frame policy、主转轮窗口、cell `172 x 130` 均有测试覆盖。
- `release:check` 已覆盖 YAML 存在、generated 同步、dist 资产、敏感字符串和 JPG symbol runtime 引用扫描。
- 浏览器验收未执行，按用户要求交由用户验收。
