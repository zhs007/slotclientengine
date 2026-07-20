# 任务 111：Game Layout Editor Popup Game Modes 执行报告

## 结论

任务 111 的代码、模型、production runtime、ZIP IO、UI、文档和自动化验收均已完成。RenderCore、Game Layout Editor、Popup Editor 的 scoped 验收及全仓 typecheck、lint、build、format、单并发测试、`git diff --check` 均通过。

按用户要求，本次未执行最终浏览器人工验收；该项在本文末尾列为待用户执行，并提供完整复现步骤和记录模板。

## 执行现场

- repository：`/Users/zerro/github.com/slotclientengine`
- branch：`main`
- 起始 HEAD：`37618e8`
- 结束 HEAD：`37618e8`（本次未提交）
- Node：`v24.14.0`
- pnpm：`10.0.0`
- 使用已有 NVM Node 24 环境；执行开始时运行了 `nvm use 24`，后续命令固定使用同一 Node 24 路径。
- 未执行 `pnpm install`，没有依赖下载失败。
- 未使用 HTTP/HTTPS 代理，也未修改 `.npmrc`、shell profile、lockfile 或依赖版本。

初始 `git status --short`：

```text
?? tasks/111-gamelayouteditor-popup-game-modes.md
```

该计划文件视为用户输入并完整保留。最终工作区只包含任务 111 的实现、测试、文档、用户计划和本报告；未 reset、stash、clean 或覆盖用户文件。

最终 `git status --short`：

```text
 M agents.md
 M apps/gamelayouteditor/README.md
 M apps/gamelayouteditor/src/io/exported-layout-zip.ts
 M apps/gamelayouteditor/src/io/imported-popup-package.ts
 M apps/gamelayouteditor/src/model/editor-project.ts
 M apps/gamelayouteditor/src/model/editor-store.ts
 M apps/gamelayouteditor/src/model/resource-commands.ts
 M apps/gamelayouteditor/src/model/validation.ts
 M apps/gamelayouteditor/src/preview/layout-preview.ts
 M apps/gamelayouteditor/src/ui/app-shell.ts
 M apps/gamelayouteditor/src/ui/project-workspace.ts
 M apps/gamelayouteditor/tests/app-shell.test.ts
 M apps/gamelayouteditor/tests/layout-preview.test.ts
 M apps/gamelayouteditor/tests/popup-package.test.ts
 M apps/gamelayouteditor/tests/zip-io.test.ts
 M docs/popup-manifest.md
 M docs/scene-layout-manifest.md
 M packages/rendercore/src/scene-layout/manifest.ts
 M packages/rendercore/src/scene-layout/package-runtime.ts
 M packages/rendercore/src/scene-layout/runtime.ts
 M packages/rendercore/src/scene-layout/types.ts
 M packages/rendercore/src/spine/state-controller.ts
 M packages/rendercore/tests/scene-layout/manifest.test.ts
 M packages/rendercore/tests/scene-layout/package-runtime.test.ts
 M packages/rendercore/tests/scene-layout/runtime.test.ts
?? apps/gamelayouteditor/src/model/game-mode-commands.ts
?? apps/gamelayouteditor/tests/game-mode-commands.test.ts
?? apps/gamelayouteditor/tests/popup-fixture.ts
?? packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts
?? tasks/111-gamelayouteditor-popup-game-modes-260720-071819.md
?? tasks/111-gamelayouteditor-popup-game-modes.md
```

## Schema、兼容与 production runtime

`scene-layout` v1 新增可选 `gameModes`：

```ts
interface SceneLayoutGameModes {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameMode[];
}

interface SceneLayoutGameMode {
  readonly id: string;
  readonly nodeStates: Readonly<Record<string, string>>;
  readonly awardCelebrationPopup?: string;
}
```

严格校验包括 mode id/唯一性、initial 引用、全部 stateful Spine node 的精确稳定态映射、initial state 对齐、popup 引用、popup orphan、binding id 与 nested package id 一致。`popups` 从原来恰好一项扩展为一项或多项；旧的无 `gameModes` v1 manifest 仍可 parse 并继续使用低层 API，但调用新 game-mode API 会明确失败，不猜 BaseGame、首个 popup 或 node state。

Game Layout Editor 导入旧 layout 时执行显式 editor migration：创建 `BaseGame`，并从每个 stateful node 的 manifest `initialState` 构造完整 `nodeStates`。production loader 不做该迁移。

`SceneLayoutPackageRuntime` 新增并补齐 JSDoc：

- `getGameModeIds()`
- `getGameModeSnapshot()`
- `requestGameMode(modeId)`
- `startAwardCelebrationForCurrentMode({ betAmountRaw, winAmountRaw })`
- `requestAdvanceAwardCelebration()`
- `dismissActiveAwardCelebrationImmediately()`
- `getActiveAwardCelebrationSnapshot()`

模式切换先对所有 node 做无副作用原子 preflight，再在同一调用边界并行启动 transition；全部完成后才提交 stable mode。未知 mode、并发 transition、popup active 时切 mode、缺 direct transition均明确失败。popup start 对 mode 绑定、active player、transition phase 和 safe-integer bet/win 做严格校验。统一 `update()` 继续同时推进 scene、reel 和 popup。

## Game Layout Editor 工作流

- `EditorProject` 从 singular popup 改为 `popupDependencies: Map` 与显式 `gameModes`。
- 新增 mode 添加、重命名、删除、设置 initial、node state、popup 绑定/解绑命令。
- 新增 popup import、same-id 显式 replace、引用保护删除和 per-variant placement 命令。
- popup 导入会完整 parse、闭包校验并真实 prepare image/image-string/VNI/official Spine；全部成功后才修改项目。
- 普通导入不自动绑定；duplicate id 明确失败。replace 保留 mode 引用、placement 和 selection，失败时旧 bytes 保持。
- store transaction、clone、layout import/export 均深拷贝 popup `Uint8Array`。
- 右侧 UI 现由 store snapshot 持续重建，提供 mode/initial/node state/popup binding、dependency import/replace/delete、variant placement 和 runtime diagnostics。
- preview 默认 `betAmountRaw=100`、`winAmountRaw=6000`；Play/Replay、Advance 和立即清理均调用 production package runtime。
- manifest 只要含 `symbolPackage`、`popups` 或 `gameModes` 任一项就创建 package runtime；无 symbols package 的 popup-only 项目可真实 prepare/play。

## ZIP 精确闭包与 round-trip

`exportLayoutZip()` 改为按 popup id 接收 `popupFilesById`，从 mode 引用集派生实际 vendor 集合：

- 每个引用 popup 只写入 `dependencies/popups/<id>/` 一次。
- 同一 popup 被多个 mode 共用时不复制 dependency。
- 不被 mode 引用的 editor popup 不进入 manifest 或 ZIP。
- nested popup manifest、VNI、atlas、image-string 和其它 bytes 只增加目录前缀，不被改写。
- 最终完整 layout 再经过 `collectSceneLayoutPackagePaths()` exact-equality 校验。
- 导入按 manifest binding 逐项恢复 popup、mode、placement 和 bytes，不通过目录枚举猜依赖。

自动化测试已锁定：两个 mode 共用一份 popup、两个 mode 使用不同 popup、未引用 popup 排除、nested bytes 逐字节一致、两次 deterministic export 完全一致、layout ZIP 全量 round-trip、legacy migration，以及 missing/orphan/unknown/非法 nested package 在 mutation 前失败。

## 修改文件

RenderCore：

- `packages/rendercore/src/scene-layout/types.ts`
- `packages/rendercore/src/scene-layout/manifest.ts`
- `packages/rendercore/src/scene-layout/runtime.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/spine/state-controller.ts`
- `packages/rendercore/tests/scene-layout/manifest.test.ts`
- `packages/rendercore/tests/scene-layout/runtime.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts`（新增）

Game Layout Editor：

- `apps/gamelayouteditor/src/model/editor-project.ts`
- `apps/gamelayouteditor/src/model/editor-store.ts`
- `apps/gamelayouteditor/src/model/resource-commands.ts`
- `apps/gamelayouteditor/src/model/game-mode-commands.ts`（新增）
- `apps/gamelayouteditor/src/model/validation.ts`
- `apps/gamelayouteditor/src/io/imported-popup-package.ts`
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts`
- `apps/gamelayouteditor/src/preview/layout-preview.ts`
- `apps/gamelayouteditor/src/ui/app-shell.ts`
- `apps/gamelayouteditor/src/ui/project-workspace.ts`
- `apps/gamelayouteditor/tests/app-shell.test.ts`
- `apps/gamelayouteditor/tests/layout-preview.test.ts`
- `apps/gamelayouteditor/tests/popup-package.test.ts`
- `apps/gamelayouteditor/tests/zip-io.test.ts`
- `apps/gamelayouteditor/tests/game-mode-commands.test.ts`（新增）
- `apps/gamelayouteditor/tests/popup-fixture.ts`（新增）
- `apps/gamelayouteditor/README.md`

文档与长期约束：

- `docs/scene-layout-manifest.md`
- `docs/popup-manifest.md`
- `agents.md`

修改 `agents.md` 是因为本任务改变了长期 ownership：Game Layout Editor 拥有 generic game-mode binding，RenderCore scene-layout 拥有 mode runtime，popup 内部仍归 Popup Editor/RenderCore popup；shared code 不得硬编码具体 mode 名。

## 自动化验收

基线测试：

| 命令                                              | 结果                      |
| ------------------------------------------------- | ------------------------- |
| `pnpm --filter @slotclientengine/rendercore test` | 64 files / 439 tests 通过 |
| `pnpm --filter gamelayouteditor test`             | 16 files / 106 tests 通过 |
| `pnpm --filter popupeditor test`                  | 4 files / 10 tests 通过   |

最终 scoped 验收：

| 范围               | test                                                                    | typecheck | lint | build | format |
| ------------------ | ----------------------------------------------------------------------- | --------- | ---- | ----- | ------ |
| RenderCore         | 65 files / 447 tests 通过；coverage 87.45% statements / 80.53% branches | 通过      | 通过 | 通过  | 通过   |
| Game Layout Editor | 17 files / 111 tests 通过；coverage 80.69% statements / 71.16% branches | 通过      | 通过 | 通过  | 通过   |
| Popup Editor       | 4 files / 10 tests 通过；coverage 84.47% statements / 63.17% branches   | 通过      | 通过 | 通过  | 通过   |

最终根级验收：

| 命令                                       | 结果                      |
| ------------------------------------------ | ------------------------- |
| `pnpm typecheck`                           | Turbo 27/27 通过          |
| `pnpm lint`                                | Turbo 27/27 通过          |
| `pnpm build`                               | Turbo 27/27 通过          |
| `pnpm format:check`                        | Turbo 27/27 通过          |
| `pnpm exec turbo run test --concurrency=1` | Turbo 27/27 通过          |
| `git diff --check`                         | 通过，无 whitespace error |

验收过程中一次 root typecheck 暴露新增 test fixture 把不允许的 `bounds` 写成 `null`；已按 production 类型合同删除该 fixture 字段，最终 scoped 与 root 命令全部重新通过，没有放宽 production schema。

非阻塞 warning：Vite 对多个既有 app 报告 minified chunk 大于 500 kB；game003 的既有 ts-node ESM loader 报 ExperimentalWarning 和 `fs.Stats` DEP0180。均未导致失败，也不是任务 111 新增的 runtime fallback 或功能错误。

## 浏览器人工验收（待用户执行）

本次按用户明确要求未启动浏览器或执行最终人工验收。建议按以下步骤直接复现：

1. 执行 `pnpm --filter popupeditor dev`，导出一个合法 strict bigwin popup ZIP。
2. 执行 `pnpm --filter gamelayouteditor dev`，新建 layout 并导入 ZIP；确认导入后没有自动绑定。
3. 创建或选择 BaseGame、FreeGame、BonusGame（也可使用项目实际合法 id），分别配置 node stable state 和同一或不同 popup。
4. 在 preview 切换 mode，确认 transition 完成后 snapshot 为 stable 且 node state 正确。
5. 保持 bet `100`、win `6000`，运行 Play/Replay、Advance、awaiting-dismiss、dismiss，目视确认真实 image/VNI/Spine/ImgNumber、金额递增和 tier 跳转。
6. 切换 landscape/portrait 或改变页面尺寸，确认 popup root 按各 variant 相对最终 viewport center 的 placement 重定位。
7. 导出 layout ZIP，再重新导入并重复步骤 4-6；确认 mode、popup、placement 和效果无损。
8. 按 `docs/scene-layout-manifest.md` 示例用 production package runtime 加载，调用 `requestGameMode()` 与 `startAwardCelebrationForCurrentMode()`；确认游戏端不需要 popup id 或 nested path。

人工验收记录模板：

```text
浏览器/版本：
viewport（landscape）：
viewport（portrait）：
popup package id：
mode -> node state / popup mapping：
bet/win：100 / 6000
Play/Replay：
Advance / awaiting-dismiss / dismiss：
响应式 placement：
导出并重导入：
production API 加载：
最终结果：
```

## 剩余项与风险

- 唯一未完成验收项是由用户执行的真实浏览器/GPU 目视验收；没有自动化、build 或 package round-trip 项目被跳过。
- 本次未接入具体 game002/game003 业务事件，也未修改真实轮带、YAML/generated 配置或现有 win-amount production 路径；这些不在任务 111 范围。
- 未增加首个 popup、唯一 popup、字体、图片、空动画或 mode 名猜测等 fallback。
