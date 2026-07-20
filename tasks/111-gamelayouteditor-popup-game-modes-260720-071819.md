# 任务 111：Game Layout Editor Popup Game Modes 执行报告

## 结论

任务 111 的代码、模型、production runtime、ZIP IO、UI、文档和自动化验收均已完成。用户浏览器验收依次发现 game002-s3 BG Spine 的同内容多 atlas page 导入缺陷、Blob URL 缺少显式 Pixi texture parser、Spine export bounds 被误当作 art canvas、legacy symbols ZIP 的大写 owned resource path 无法通过 layout 最终导出、hash-flat Spine 路径与旧 `./basename` parser 合同冲突、Symbols Editor 初始空 gallery 的 Pixi 零参数 `addChild` 崩溃，以及 legacy 完整数值图片 prefix 未随 leaf payload 物化；七项根因均已修复并加入 direct upload、legacy materialization、shared Blob texture loader、art/placement、legacy symbols image/Spine/value-image import/export、真实 official Spine 与空 preview resize 回归测试。RenderCore、Game Layout Editor、Popup Editor、Symbols Editor 的 scoped 验收及全仓 typecheck、lint、build、format、测试、`git diff --check` 均通过。

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

最终工作区保持未提交状态，全部变更均为任务 111 的实现、测试、文档、用户计划与本报告；未执行额外 stage、commit、reset、stash 或 clean。

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

## 首次浏览器验收发现与修复

用户导入 `assets/game002-s3` 的 `BG.json`、`BG.atlas` 与 `BG*.png` 后，preview 报告 atlas 有 8 个 page、texture mapping 只有 7 个。现场 SHA-256 证据为：

- `BG.png`：`f94e7ed7c72d513377a8d23cc3cebb12daa8be770a48da42934538d1305823fa`
- `BG_2.png`：`f94e7ed7c72d513377a8d23cc3cebb12daa8be770a48da42934538d1305823fa`

两个文件内容完全相同。旧逻辑直接把 payload 的 hash-flat basename 当 atlas page name，导致两个不同逻辑 page 都被重写为同一个 `f94e...webp`；`textures` record 随后覆盖其中一项。该行为混淆了“atlas 逻辑 page identity”和“owned payload identity”。

修复后的合同为：

- 完全相同的 texture bytes 仍只保存一份完整 SHA-256 hash-flat payload。
- atlas 中的逻辑 page name 必须保持唯一；同内容的第二项及以后使用确定性的 `-2`、`-3` alias。
- 每个逻辑 page 都通过 `textures` 显式映射到 owned payload path，允许多个 page 映射同一路径，不做 basename 猜测或 fallback。
- direct Spine upload 与 legacy layout materialization 复用同一 allocator；RenderCore 仍严格校验 atlas page key 精确闭合，并已用真实 game002 BG official Spine 资源验证共享 payload mapping。

修复前已导入项目中的坏 atlas 已丢失一个 page identity，无法安全自动反推。浏览器复验必须用原始 `BG` 文件组重新导入或替换该 Spine resource。

用户按上述方式重新替换资源后，第二次浏览器验收越过 page closure 校验，但 Pixi 对 `blob:` texture URL 报告无法选择 parser。根因是共享 official Spine player 仍调用 `Assets.load(url)` 依赖扩展名猜测，而浏览器 Blob URL 没有扩展名；image-string、popup、symbol 与 scene image 路径此前均已显式使用 `loadTextures`，Spine 是遗漏路径。

第二次修复在 shared official Spine player 中显式指定 Pixi `loadTextures` parser，并按 URL 复用同一个加载 Promise：多个逻辑 atlas page 指向同一 owned payload 时只加载一次 texture，再把同一 texture source 分别绑定到全部 page。测试使用同一个无扩展名 `blob:http://localhost/shared-texture` 同时服务两个 atlas page，锁定 parser 参数、单次加载和双 page bind。修复前已失败的 Pixi Assets cache 需要通过硬刷新或重启 dev server 清除；正确重新导入后的 resource 本身无需再次替换。

用户随后确认背景 Inspector 显示约 `3744.3176 × 2371.955`，预览只能看到局部。现场核对 `BG.json` 得到 skeleton header `x=-1872.233`、`y=-1006.915`、`width=3744.3176`、`height=2371.955`；这是 Spine 导出的动画/attachment 内容包围盒，不是美术的 art canvas。该套 production 背景的唯一画布合同仍来自 `assets/game002-s3/background.manifest.json`：`artSize=2000×2000`，Spine transform 为 `x=1000,y=1000,scale=1`。旧编辑器错误地把 export bounds 当 art size，并把居中原点 Spine 放在 `(0,0)`，因此尺寸错误且只显示局部。

第三次修复明确分离两种语义：Spine bounds 只以“export bounds（非 art size）”展示，不再初始化、替换或重置 art/reel/focus；Spine 背景必须显式填写 art size。首次补全 `2000×2000` 时，默认原点背景自动置于 `(1000,1000)`，reel/focus 同步按既有合同居中；背景 Inspector 新增可编辑 `x/y/scale`，允许非居中 Spine 明确配置而不引入 game002 硬编码。替换成 bounds 不同的 Spine 会保留既有 art size 和手工 placement。

用户随后导出含旧 game002-s3 symbols package 的 layout 时，最终 ZIP 报 `package path 必须为小写：dependencies/symbols/game002-s3/AF.disabled.png`。根因是旧 ZIP 可以被 legacy parser 读取，但 Game Layout Editor 保存并原样 vendor 了旧 file map；全局 deterministic ZIP 在最终小写路径校验才失败。

第四次修复把 Symbols Editor 原有的结构化 package materializer 下沉为 RenderCore symbol package 公共能力：顶层 raster、VNI project、Spine skeleton/atlas 统一重写为完整 SHA-256 小写 hash-flat path，同时精确改写 symbol manifest、VNI asset 和 atlas page 引用并重新计算 closure。根据用户对 owner 边界的最终确认，legacy migration 由 Symbols Editor 显式执行“导入旧包 → 导出新包”；Game Layout Editor 在导入和导出边界拒绝旧路径并提示该流程，不静默修改 dependency。已符合 strict contract 的 package 原字节 vendor，nested dependency 保持自包含。回归测试使用与现场一致的 `AF.disabled.png`，证明旧包可由 Symbols Editor 升级、升级后全部路径小写且可重新导入。

用户再次导入同一旧 package 时，`AF.appear` 报 `Spine skeleton must be a ./basename path: ./assets/<sha256>.json`。物化器正确生成了任务 110 规定的 hash-flat 子路径，但 symbol Spine parser 仍保留任务 75 时期的 `./basename` 与 PNG-only 限制；这是两份 production 合同冲突，并非资源内容错误。

第五次修复让 symbol official Spine skeleton、atlas 与 texture 接受经过 canonical package path 校验的 manifest-relative `./` 精确子路径，texture 扩展名与统一 materializer 对齐为 PNG/JPEG/WebP；`../`、绝对路径、URL、反斜杠、非法 segment、错误扩展名和 atlas page 不匹配仍显式失败。新增回归从 legacy `AF.json/AF.atlas/AF.png` 物化到 `./assets/<full-sha256>.json|atlas|webp`，再通过 official Spine prepare；Symbols Editor 集成回归锁定同形 `AF.appear` 旧 ZIP 可导入、可导出全小写新 ZIP且新 ZIP 可再次导入。

用户打开 Symbols Editor 时，初始 preview 尚无 resource 和 cell，`ResizeObserver` 仍立即触发 resize rebuild；旧代码随后执行 `gallery.addChild(...[])`。Pixi v8 的零参数 `addChild` 会把 child 解析为 `undefined` 并读取其 `parent`，而异步 `rebuild()` 又把异常暴露为未处理 Promise。

第六次修复让 gallery root 按项挂载，空集合保持真正 no-op；resize 只同步重排当前 display tree，不再通过异步 `setResource()` 重建或争用 resource/Object URL owner。新增真实 Pixi `Container` 回归锁定初始空 gallery 不抛错，并验证非空 roots 仍保持顺序挂载。

用户导出旧 game002-s3 package 时随后报告 `materialized symbol closure 缺少：1.png`。该 package 使用 legacy 完整数值图片合同 `text.type=image,prefix="./"`，由 `defaultValues` 动态派生 `1.png` 等路径；旧物化器已把图片 leaf 改为 hash-flat payload，却没有把动态 prefix 合同结构化升级，导致新 closure 仍索引旧名。

第七次修复为 image text 增加与 `defaultValues` 精确等键的 `images` value→path 映射：legacy `prefix` 继续只用于旧包导入，Symbols Editor 导出时逐值解析真实 source、散列 bytes，并生成 `images[value] -> ./assets/<full-sha256>.<canonical-ext>`；新映射和 prefix 严格互斥，缺键、多键、非法 raster path 均失败。package value-tier module lookup 同步保留完整 manifest-relative subpath，不再退化为 basename。RenderCore 与 Symbols Editor 回归均锁定旧 `1.png` 被移除、hash 映射可 prepare 且新 ZIP 可重新导入。

## 修改文件

RenderCore：

- `packages/rendercore/src/scene-layout/types.ts`
- `packages/rendercore/src/scene-layout/manifest.ts`
- `packages/rendercore/src/scene-layout/runtime.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/spine/state-controller.ts`
- `packages/rendercore/src/spine/runtime-player.ts`
- `packages/rendercore/src/symbol/manifest.ts`
- `packages/rendercore/src/symbol/materialize-package.ts`（新增）
- `packages/rendercore/src/symbol/index.ts`
- `packages/rendercore/tests/background/runtime-player.test.ts`
- `packages/rendercore/tests/scene-layout/manifest.test.ts`
- `packages/rendercore/tests/scene-layout/runtime.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime.test.ts`
- `packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts`（新增）
- `packages/rendercore/tests/scene-layout/resource.test.ts`
- `packages/rendercore/tests/symbol/spine-animation.test.ts`
- `packages/rendercore/tests/symbol/materialize-package.test.ts`（新增）

Game Layout Editor：

- `apps/gamelayouteditor/src/model/editor-project.ts`
- `apps/gamelayouteditor/src/model/editor-resource.ts`
- `apps/gamelayouteditor/src/model/editor-store.ts`
- `apps/gamelayouteditor/src/model/resource-commands.ts`
- `apps/gamelayouteditor/src/model/spine-page-name.ts`（新增）
- `apps/gamelayouteditor/src/model/game-mode-commands.ts`（新增）
- `apps/gamelayouteditor/src/model/validation.ts`
- `apps/gamelayouteditor/src/io/imported-popup-package.ts`
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts`
- `apps/gamelayouteditor/src/io/imported-symbol-package.ts`
- `apps/gamelayouteditor/src/preview/layout-preview.ts`
- `apps/gamelayouteditor/src/ui/app-shell.ts`
- `apps/gamelayouteditor/src/ui/layout-workspace.ts`
- `apps/gamelayouteditor/src/ui/project-workspace.ts`
- `apps/gamelayouteditor/src/ui/resource-picker.ts`
- `apps/gamelayouteditor/tests/app-shell.test.ts`
- `apps/gamelayouteditor/tests/layout-preview.test.ts`
- `apps/gamelayouteditor/tests/popup-package.test.ts`
- `apps/gamelayouteditor/tests/ui-session.test.ts`
- `apps/gamelayouteditor/tests/validation.test.ts`
- `apps/gamelayouteditor/tests/zip-io.test.ts`
- `apps/gamelayouteditor/tests/imported-symbol-package.test.ts`
- `apps/gamelayouteditor/tests/game-mode-commands.test.ts`（新增）
- `apps/gamelayouteditor/tests/popup-fixture.ts`（新增）
- `apps/gamelayouteditor/README.md`

Symbols Editor：

- `apps/symbolseditor/src/io/symbol-package-zip.ts`

文档与长期约束：

- `docs/scene-layout-manifest.md`
- `docs/symbol-package.md`
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
| RenderCore         | 66 files / 454 tests 通过；coverage 87.48% statements / 80.47% branches | 通过      | 通过 | 通过  | 通过   |
| Game Layout Editor | 17 files / 118 tests 通过；coverage 80.75% statements / 71.65% branches | 通过      | 通过 | 通过  | 通过   |
| Symbols Editor     | 7 files / 38 tests 通过；coverage 61.38% statements / 50.00% branches   | 通过      | 通过 | 通过  | 通过   |
| Popup Editor       | 4 files / 10 tests 通过；coverage 84.47% statements / 63.17% branches   | 通过      | 通过 | 通过  | 通过   |

最终根级验收：

| 命令                                       | 结果                      |
| ------------------------------------------ | ------------------------- |
| `pnpm typecheck`                           | Turbo 27/27 通过          |
| `pnpm lint`                                | Turbo 27/27 通过          |
| `pnpm build`                               | Turbo 27/27 通过          |
| `pnpm format:check`                        | Turbo 27/27 通过          |
| `pnpm exec turbo run test --concurrency=1` | Turbo 27/27 通过          |
| `pnpm test`                                | Turbo 27/27 通过          |
| `git diff --check`                         | 通过，无 whitespace error |

验收过程中一次 root typecheck 暴露新增 test fixture 把不允许的 `bounds` 写成 `null`；已按 production 类型合同删除该 fixture 字段，最终 scoped 与 root 命令全部重新通过，没有放宽 production schema。

非阻塞 warning：Vite 对多个既有 app 报告 minified chunk 大于 500 kB；game003 的既有 ts-node ESM loader 报 ExperimentalWarning 和 `fs.Stats` DEP0180。均未导致失败，也不是任务 111 新增的 runtime fallback 或功能错误。

## 浏览器人工验收（待用户执行）

首次浏览器验收由用户执行并发现上述 BG 导入缺陷；代码修复后的最终浏览器复验仍按用户明确要求由用户执行。建议按以下步骤直接复现：

1. 硬刷新 Game Layout Editor 或重启 dev server，清除第二次失败留下的 Pixi Assets cache。
2. 若当前项目仍保留第一次修复后重新替换的 BG resource，可直接继续；若项目因刷新丢失，重新导入 `assets/game002-s3/BG.json`、`BG.atlas` 与全部 `BG*.png`。确认 Resource Picker 把 `3744.3176×2371.955` 标为 `export bounds（非 art size）`，不再自动写入 art size。
3. 设为背景并选择真实 animation；在背景 Inspector 明确填写 `art width=2000`、`art height=2000`。确认背景 placement 自动成为 `x=1000,y=1000,scale=1`，完整背景可见，不再出现 page contract changed、unknown parser 或 texture not loaded。
4. 执行 `pnpm --filter popupeditor dev`，导出一个合法 strict bigwin popup ZIP。
5. 执行 `pnpm --filter gamelayouteditor dev`，新建 layout 并导入 ZIP；确认导入后没有自动绑定。
6. 创建或选择 BaseGame、FreeGame、BonusGame（也可使用项目实际合法 id），分别配置 node stable state 和同一或不同 popup。
7. 在 preview 切换 mode，确认 transition 完成后 snapshot 为 stable 且 node state 正确。
8. 保持 bet `100`、win `6000`，运行 Play/Replay、Advance、awaiting-dismiss、dismiss，目视确认真实 image/VNI/Spine/ImgNumber、金额递增和 tier 跳转。
9. 切换 landscape/portrait 或改变页面尺寸，确认 popup root 按各 variant 相对最终 viewport center 的 placement 重定位。
10. 硬刷新或重启 Symbols Editor，确认空项目首屏及改变页面尺寸均不再出现 `Cannot read properties of undefined (reading 'parent')`；再导入旧 game002-s3 symbols ZIP 并导出新 ZIP，确认不再报告 `materialized symbol closure 缺少：1.png`。新 ZIP 应可重新导入，entry、manifest Spine/VNI/texture 引用均为小写 hash-flat path，旧完整数值图片应变成显式 `images[value]` hash mapping。
11. 在 Game Layout Editor 导入第 10 步的新 ZIP；旧 ZIP 直接导入时应明确提示先经 Symbols Editor 迁移。导出 layout ZIP，确认不再出现 `AF.disabled.png` 小写路径错误。
12. 重新导入 layout ZIP并重复步骤 7-9；确认 mode、popup、placement 和效果无损。
13. 按 `docs/scene-layout-manifest.md` 示例用 production package runtime 加载，调用 `requestGameMode()` 与 `startAwardCelebrationForCurrentMode()`；确认游戏端不需要 popup id 或 nested path。

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
旧 symbols ZIP 经 Symbols Editor 升级：
导出并重导入：
production API 加载：
最终结果：
```

## 剩余项与风险

- 唯一未完成验收项是用户对修复后 BG 重新导入及完整任务流程执行真实浏览器/GPU 复验；没有自动化、build 或 package round-trip 项目被跳过。
- 本次未接入具体 game002/game003 业务事件，也未修改真实轮带、YAML/generated 配置或现有 win-amount production 路径；这些不在任务 111 范围。
- 未增加首个 popup、唯一 popup、字体、图片、空动画或 mode 名猜测等 fallback。
