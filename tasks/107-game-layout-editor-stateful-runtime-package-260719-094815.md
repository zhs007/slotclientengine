# 107 game layout editor stateful runtime package 任务报告

## 基线

- 工作目录：`/Users/zerro/github.com/slotclientengine`
- branch / HEAD：`main` / `9b4a1c8`
- 初始 status：仅有用户提供的未跟踪任务合同 `tasks/107-game-layout-editor-stateful-runtime-package.md`；实施期间未修改该文件，也未清理用户文件。
- Node / pnpm：`v24.14.0` / `11.9.0`

## 完成内容

- `gamelayouteditor` 可导入、替换、复用 standalone image-string ZIP，创建多个独立命名 node，并编辑/预览原始 string、anchor、placement 与 scale；缺 glyph 或替换不兼容时原子失败。
- Spine node playback 收敛为 single loop / state machine discriminated union；编辑器支持稳定状态、初始状态、direct transition CRUD，preview 真实等待 runtime completion 后再进入目标 loop。
- symbols dependency 保存 validated 原始 file map、package id、reel set、`standard | grid-cell` render mode 与 `includeInExport`；默认仅预览，显式勾选后才 vendor 完整 package。
- 新增 package-level transitive closure、files/CDN loader 与组合 runtime；同一入口创建 scene node、image-string、共享 Spine state controller、symbol catalog 和真实 standard/grid-cell reel presentation。
- background player 改为复用通用 `SpineStateController`，未复制第二套 transition completion、并发、destroy 与 snapshot 状态机。
- 编辑器 preview 在存在 symbols binding 时改走 production 组合 runtime；随机 scene/local phase 仍由编辑器通过 Web Crypto 从公开本地轮带采样并显式传入。

## Manifest 与公共 API

- 保持 `{ "version": 1, "kind": "scene-layout" }`，旧 image、single-loop Spine、无 reel order / 无 symbol binding 的合法 v1 继续原样解析。
- 新增 `resource.kind: "image-string"`，包含 canonical nested manifest path、初始 `text` 和 `anchor`。
- Spine resource 使用 single-loop 字段或 `stateMachine`，两者严格互斥；状态和 transition animation 全部在 prepare 前大小写精确校验。
- `reels.main.order` 只在绑定 symbols package 时必填，并与 node order 全局唯一；binding 明确保存 manifest、`reel: "main"`、reelSet 和 renderMode。
- `symbolPackage` 只有真正省略才表示 layout-only；`null`、alias、unknown key、错误路径和不兼容 binding 均显式失败。
- 新增 `collectSceneLayoutPackagePaths()`、`createSceneLayoutPackageResource()`、`loadSceneLayoutPackageFromUrl()`、`createSceneLayoutPackageRuntime()`。
- runtime 提供 `requestNodeState()` / `getNodeStateSnapshot()`、image-string get/set/name API、`resetReelScene()` 与 `getReelPresentation()`。
- 当前态重复请求立即 resolve 且不 replay；缺 direct transition、transition 中并发请求和 destroy pending request 均失败；transition Promise 只在目标 loop 已开始的 completion 边界 resolve。
- `setImageStringText()` 先完整 layout/validate 后原子提交；运行期 setter 不回写 manifest。

## 主要文件

### 新增

- `packages/rendercore/src/spine/state-controller.ts`
- `packages/rendercore/src/scene-layout/package-resource.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/tests/scene-layout/package-resource.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime.test.ts`
- `packages/rendercore/tests/spine/state-controller.test.ts`
- `apps/gamelayouteditor/tests/source-boundary.test.ts`

### 修改

- `packages/rendercore/src/scene-layout/{types,manifest,resource,runtime,index}.ts`
- `packages/rendercore/src/background/spine-background-player.ts`
- `apps/gamelayouteditor/src/model/{editor-project,editor-resource,resource-commands}.ts`
- `apps/gamelayouteditor/src/io/{imported-layout-zip,exported-layout-zip,imported-symbol-package}.ts`
- `apps/gamelayouteditor/src/preview/layout-preview.ts`
- `apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,project-workspace,resource-picker,resources-workspace,ui-session}.ts`
- rendercore/editor 对应 manifest、runtime、validation、store、UI 与 ZIP 测试。
- README、scene-layout/image-string/symbol-package/background 文档及根 `agents.md`。

## 验证

所有命令使用 Node 24 bundled PATH；没有降低 engine、覆盖 coverage threshold 或跳过脚本。

- `pnpm --filter @slotclientengine/rendercore test`：exit 0；59 test files、384 tests；最终 branch coverage 高于 80% 门槛。
- `pnpm --filter @slotclientengine/rendercore typecheck`：exit 0。
- `pnpm --filter @slotclientengine/rendercore lint`：exit 0。
- `pnpm --filter @slotclientengine/rendercore build`：exit 0。
- `pnpm --filter gamelayouteditor test`：exit 0；14 test files、93 tests；branch coverage `70.15%`。
- `pnpm --filter gamelayouteditor typecheck`：exit 0。
- `pnpm --filter gamelayouteditor lint`：exit 0。
- `pnpm --filter gamelayouteditor build`：exit 0；Vite 915 modules，只有 chunk size warning。
- `pnpm --filter gamelayouteditor format:check`：exit 0。
- `git diff --check`：exit 0。
- `pnpm typecheck`：exit 0；26/26 packages。
- `pnpm lint`：exit 0；26/26 packages。
- `pnpm build`：最终重试 exit 0；26/26 packages。一次中间运行因多个 app 并行清理同一 `packages/gameframeworks/dist/static-config` 命中目录竞态而失败，原命令重试通过。
- `pnpm format:check`：exit 0；26/26 packages。
- `pnpm test`：未通过。任务相关包均通过，但未改动的 `@slotclientengine/netcore/tests/main-adv.test.ts` 7 个测试各在 10 秒超时；Turbo/Vitest 在失败后因开放句柄不退出，人工中止后根命令为 exit 130。隔离执行 `pnpm --filter @slotclientengine/netcore test` 可稳定复现相同 7 个超时并同样不退出，因此未伪报全仓 test 成功。
- 安装依赖时仅因依赖下载需要使用了用户给定的 `127.0.0.1:1087` 代理；安装成功，lockfile 未变化。其余验证未使用代理。

## 资源闭包与安全检查

- layout ZIP 实际文件必须精确等于 layout direct assets、被引用 image-string nested closure 和显式包含的 symbols package closure；缺失、orphan、重复/case collision 和 path escape 均失败。
- image-string 多 node 共享一份 dependency resource，但各自拥有独立 text/view；symbols vendoring 只加目录前缀，不改 nested bytes 或相对路径。
- layout ZIP 限额更新为 4096 entries / 200 MiB compressed / 50 MiB single expanded file / 500 MiB total expanded，并继续使用 bounded streaming/path policy。
- include=false 的导出不含 `dependencies/symbols/**`；include=true 时必须完整包含唯一 package，cell size、reel count、reel set 与 display codes 全部预校验。
- manifest/ZIP 不保存 sampled scene、otherScene preview mapping、服务器真实轮带、token、cookie、玩家输入或 spin random。
- 组合 runtime 只接收运行期可见 scene 与 local phase；服务器目标窗口不要求存在于公开本地轮带。

## 文档与 AGENTS.md

- 更新 `apps/gamelayouteditor/README.md`、`packages/rendercore/README.md`、`docs/scene-layout-manifest.md`、`docs/image-string-manifest.md`、`docs/symbol-package.md`、`docs/background-adaptation.md`。
- scene-layout 文档包含完整可复制的 package URL loader、runtime init、viewport/update、state request、image-string setter 和 reel reset 示例，并说明 CDN 解压目录、layout-only 行为和运行期 scene 边界。
- 根 `agents.md` 追加 scene-layout package/state/image-string/reel ownership 规则，保留既有规则顺序与内容。

## 未完成项或风险

- 任务 107 实现无已知未完成项。
- 全仓 `pnpm test` 仍受上述 netcore 既有超时/开放句柄阻塞；该问题不在任务 107 改动范围内，已如实保留证据。
- 按用户要求，本次不执行最终浏览器人工验收；浏览器验收由用户完成。
