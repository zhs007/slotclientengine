# gameloading game003 bootstrap 任务报告

## 1. 实施摘要

已按 `tasks/64-gameloading-game003-bootstrap.md` 执行任务 64。

- 新增独立包 `packages/gameloading`，负责轻量 DOM loading、资源加载、`99%` / `100%` 生命周期编排。
- `apps/game003` 已拆分为轻入口 `main.ts`、资源清单 `loading-resources.ts`、正式游戏入口 `game-entry.ts`。
- `game003` 资源加载完成后最多推进到 `99%`；`99%` 回调完成 live WebSocket `connect + enterGame`；成功后才到 `100%` 并创建 framework / Pixi 游戏画面。
- `packages/gameframeworks` 已支持外部预连接 live session，避免 loading 阶段连接后进入游戏时重复 WebSocket 连接。
- `apps/buildgamestatic` 已支持从 YAML 生成独立 `game-loading.generated.ts`，并在 `--check` 中校验同步。
- 已同步 README、`agents.md`、测试、发布检查脚本和 lockfile。
- 浏览器手动验收按用户要求未由 Codex 执行，保留给用户验收。

## 2. 变更文件清单

新增：

- `packages/gameloading/**`
- `apps/game003/src/game-entry.ts`
- `apps/game003/src/loading-resources.ts`
- `apps/game003/src/generated/game-loading.generated.ts`
- `apps/game003/tests/loading-flow.test.ts`
- `apps/game003/tests/loading-resources.test.ts`
- `apps/game003/tests/main-loading-flow.test.ts`

修改：

- `agents.md`
- `apps/buildgamestatic/README.md`
- `apps/buildgamestatic/src/cli.ts`
- `apps/buildgamestatic/src/generator.ts`
- `apps/buildgamestatic/src/types.ts`
- `apps/buildgamestatic/src/yaml-loader.ts`
- `apps/buildgamestatic/tests/*.test.ts`
- `apps/game003/README.md`
- `apps/game003/config/game-static.yaml`
- `apps/game003/package.json`
- `apps/game003/scripts/verify-static-dist.mjs`
- `apps/game003/src/main.ts`
- `apps/game003/src/styles.css`
- `apps/game003/tests/source-boundary.test.ts`
- `apps/game003/tests/static-config.test.ts`
- `packages/gameframeworks/README.md`
- `packages/gameframeworks/src/*.ts`
- `packages/gameframeworks/tests/*.test.ts`
- `pnpm-lock.yaml`

## 3. `packages/gameloading` public API 摘要

导出核心能力：

- `createGameLoading(options)`：创建 loading 控制器。
- `GameLoadingResource`：资源定义，支持 `id`、`url`、`kind`、`weight`、自定义 `load`。
- `GameLoadingOptions`：注入 root、resources、`onBeforeComplete`、`onEnterGame`、`onError`。
- `GameLoadingHandle`：提供 `start()`、`destroy()` 和 `loadedResources`。
- 默认 loader：按扩展名识别 `image`、`json`、`text`、`binary`、`wasm`、`module`、`style`。

关键规则：

- 资源 id 必须唯一且非空。
- 权重必须是有限正数。
- 无自定义 loader 时必须有 URL。
- 未知扩展名、缺 URL、HTTP 非 ok、图片 / style 加载失败均显式失败。
- 资源阶段最高显示 `99%`。
- `onBeforeComplete` 成功后才显示 `100%`。
- `onEnterGame` 只在 `100%` 后调用。
- `destroy()` 后不继续更新 DOM 或进入后续回调。

## 4. `game003` 新启动顺序

当前顺序为：

1. `main.ts` 只创建 `loadingHost` / `gameHost`，并启动 `@slotclientengine/gameloading`。
2. `loading-resources.ts` 合并生成的静态资源 URL 和 `game003-runtime-module` 动态模块资源。
3. 静态资源和 `game003-runtime-module` 加载完成后，loading 固定到 `99%`。
4. `onBeforeComplete` 从 module cache 中取正式入口，调用 `prepareGame003At99({ search })`。
5. `prepareGame003At99` 解析 URL、拒绝旧 `serverUrl`、使用固定 live URL / gamecode，并调用 `prepareSlotGameLiveSession` 完成 live 初始化。
6. live 初始化成功后 loading 到 `100%`。
7. `onEnterGame` 切换到 `gameHost`，调用 `enterGame003({ root, prepared })`。
8. `enterGame003` 才创建 framework、adapter、Pixi canvas，并执行 framework connect。

`main.ts` 静态边界已用测试和额外 `rg` 复核：未静态导入 Pixi、rendercore、gameframeworks、gameframeworks styles、game-entry、game-adapter、game-demo。

## 5. `99%` live 初始化如何避免双连接

- `packages/gameframeworks` 新增 `SlotGameLiveSessionLike` 和 `liveSession` 选项。
- `prepareSlotGameLiveSession({ live, clientFactory })` 在 `99%` 阶段创建并连接 session，只做 live 初始化，不创建 UI / adapter / Pixi。
- `enterGame003` 把同一个 `prepared.liveSession` 传入 `createSlotGameFramework`。
- `SlotGameLiveSession.connect()` 已支持已连接后的幂等返回：先检查 fail-fast monitor，再 validate 当前 userInfo，不重复调用 `client.connect()` 或 `client.enterGame()`。
- 如果同时传 `liveSession` 和 `clientFactory`，framework 会显式失败。
- 连接失败由 `prepareSlotGameLiveSession` 调用 `disconnect()` 清理后重新抛错；进入游戏失败由 `enterGame003` destroy framework/session，`main.ts` 也会在失败路径断开 prepared session。

## 6. 资源类型和扩展名处理说明

默认扩展名规则：

- `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` / `.svg` / `.avif` -> image
- `.json` -> json
- `.txt` / `.csv` / `.xml` / `.yaml` / `.yml` -> text
- `.bin` / `.dat` / `.atlas` -> binary
- `.wasm` -> fetch arrayBuffer 后 `WebAssembly.compile`
- `.js` / `.mjs` -> `import(/* @vite-ignore */ url)`
- `.css` -> 注入 stylesheet link 并等待 load

`game003` 的 loading 资源进入 `apps/game003/config/game-static.yaml` 的 `loading.resources`，由 `apps/buildgamestatic` 生成 `game-loading.generated.ts`。glob 资源按 key 排序展开，空 glob、重复 id、重复 URL 均显式失败；group weight 平均拆分给展开后的资源。symbol 清单使用显式 brace glob，没有使用宽泛 `*.png`。

## 7. `agents.md` 更新情况

已更新。

- 增加 `packages/gameloading` 目录职责。
- 增加通用 loading 调度归属边界，游戏 app 只配置资源和回调。
- 增加 `game003` 必须在 loading `99%` 完成 live 初始化、`100%` 后才创建 framework / Pixi 画面的规则。
- 生成文件规则已覆盖 `game-static.generated.ts` 和 `game-loading.generated.ts`，二者均由 `apps/buildgamestatic` 生成，禁止手改。

## 8. 执行过的命令和结果

依赖 / 生成：

- `pnpm install --no-frozen-lockfile`：通过，更新 `pnpm-lock.yaml`。
- `CI=true pnpm --filter game003 generate:static-config`：通过。
- `CI=true pnpm --filter game003 check:static-config`：通过。

单包验证：

- `CI=true pnpm --filter @slotclientengine/gameloading lint`：通过。
- `CI=true pnpm --filter @slotclientengine/gameloading test`：通过。
- `CI=true pnpm --filter @slotclientengine/gameloading typecheck`：通过。
- `CI=true pnpm --filter @slotclientengine/gameloading build`：通过。
- `CI=true pnpm --filter @slotclientengine/gameloading format:check`：通过。
- `CI=true pnpm --filter @slotclientengine/gameframeworks lint`：通过。
- `CI=true pnpm --filter @slotclientengine/gameframeworks test`：通过。
- `CI=true pnpm --filter @slotclientengine/gameframeworks typecheck`：通过。
- `CI=true pnpm --filter @slotclientengine/gameframeworks build`：通过。
- `CI=true pnpm --filter @slotclientengine/gameframeworks format:check`：通过。
- `CI=true pnpm --filter buildgamestatic lint`：通过。
- `CI=true pnpm --filter buildgamestatic test`：通过。
- `CI=true pnpm --filter buildgamestatic typecheck`：通过。
- `CI=true pnpm --filter buildgamestatic build`：通过。
- `CI=true pnpm --filter buildgamestatic format:check`：通过。
- `CI=true pnpm --filter game003 lint`：通过。
- `CI=true pnpm --filter game003 test`：通过。
- `CI=true pnpm --filter game003 typecheck`：通过。
- `CI=true pnpm --filter game003 build`：通过。
- `CI=true pnpm --filter game003 release:check`：通过。
- `CI=true pnpm --filter game003 format:check`：通过。

根级验证：

- `CI=true pnpm lint`：通过。
- `CI=true pnpm test`：未通过；`@slotclientengine/netcore` 的 `tests/main-adv.test.ts` 有 7 个用例各自 10s 超时，之后进程长时间无新输出，已中断，退出码 130。该失败位于 `packages/netcore`，不在本任务改动面内。
- `CI=true pnpm typecheck`：未通过；失败点为 `apps/uiframeworksviewer/tests/demo-game.test.ts(38,3)` 的测试 mock 缺少 `SlotGameMountContext` 当前类型要求的 `getViewport`、`onViewportChange`。该文件不在本任务改动面内；后续 turbo 终止了部分并行任务。
- `CI=true pnpm build`：通过。
- `CI=true pnpm format:check`：未通过；最先失败点为 `packages/logiccore` 既有 Prettier 格式问题，列出 `eslint.config.cjs`、`src/*.ts`、`tests/*.ts` 等 23 个文件。本任务触达的四个包已单独执行 `format:check` 且全部通过。

静态检查：

- `git diff --check`：通过。
- `rg` 检查 `apps/game003/src/main.ts` 与 loading 相关文件的重型静态 import：无命中。

## 9. 失败命令说明

- `CI=true pnpm --filter buildgamestatic test` 曾首次因沙箱 / 依赖解析网络问题失败，表现为 pnpm 依赖检查阶段 `EPERM`；按环境约束使用提权重试后通过，后续常规重跑也通过。
- `pnpm exec prettier --write ...` 曾作为非验收格式化尝试失败：一次因非 TTY 安装确认中断，一次因把 `.prettierignore` 作为显式文件传给 Prettier 后无法识别 parser。最终使用包级 `format:check` 验收本任务触达包，均通过。
- 根级 `test`、`typecheck`、`format:check` 存在无关包阻塞，详见第 8 节。任务相关包的窄范围验证已覆盖新增 loading 包、gameframeworks 预连接、buildgamestatic 生成器、game003 启动和发布检查。

## 10. 手动浏览器验收结果

未由 Codex 执行。用户明确要求“浏览器验收我来做”，因此未启动 dev server、未打开浏览器。

建议用户验收命令：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

重点观察：

- 首屏先出现 loading。
- 资源完成后到 `99%`，live 初始化成功后到 `100%`。
- `100%` 后才出现 game003 画面。
- 无效 token / 网络失败停在 loading 错误态。
- 带 `serverUrl=` 的旧链接显式失败。
- resize 不重建 framework，不重复 live connect。

## 11. 替代方案说明

未采用替代方案。loading 资源列表已进入 `apps/game003/config/game-static.yaml`，并由 `apps/buildgamestatic` 生成和校验 `game-loading.generated.ts`。

## 12. 二次复核结论

- `packages/gameloading` 保持独立，无 Pixi / gameframeworks / netcore / rendercore 运行时依赖。
- loader 规则按扩展名 fail-fast，未知类型会报错。
- `99%` / `100%` 回调顺序、失败不进入后续阶段、destroy 后不继续推进均有测试覆盖。
- `game003/main.ts` 未静态导入重型游戏 runtime。
- glob 资源展开排序、空匹配失败、id / URL 去重、权重分摊均有生成器和测试覆盖。
- symbol loading 清单未用宽泛 `*.png`。
- `prepareGame003At99` 不创建 framework / Pixi。
- loadingHost / gameHost 分离，进入失败会恢复 loading 错误态并清理 session。
- 预连接 session 不会被 framework 重复 connect。
- `serverUrl` query 禁止规则仍保留。
- static YAML、generated TS、package scripts、release check 已同步。
- 未把 token、cookie、服务器真实轮带或运行期下注放进 YAML / loading 资源。
- README 和 `agents.md` 已同步。
- `git diff --check` 已通过。

## 13. 最终工作区状态摘要

`git status --short --untracked-files=all` 摘要：

- 修改文件集中在 `agents.md`、`apps/buildgamestatic`、`apps/game003`、`packages/gameframeworks`、`pnpm-lock.yaml`。
- 新增文件集中在 `packages/gameloading`、`apps/game003/src/game-entry.ts`、`apps/game003/src/loading-resources.ts`、`apps/game003/src/generated/game-loading.generated.ts`、`apps/game003/tests/loading-*.test.ts`、本任务报告。
- `tasks/64-gameloading-game003-bootstrap.md` 任务计划文件本身也处于 untracked 状态；它在报告生成前已作为本次执行合同存在，未做删除或回滚。
- 未发现任务外的 `.DS_Store`、临时文件或无关新增文件。
