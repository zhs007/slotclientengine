# 109 symbol value tier ImgNumber 任务报告

## 1. 执行信息

- UTC 时间：`2026-07-19 09:59:14Z`
- 仓库：`/Users/zerro/github.com/minecart2`
- 分支：`main`
- 起始 HEAD：`9b4a1c8c0c5bd45d6f320b53ae8ce11e72be4c8f`
- 结束 HEAD：`9b4a1c8c0c5bd45d6f320b53ae8ce11e72be4c8f`（本任务未提交）
- Node：`v24.14.0`，路径 `/Users/zerro/.nvm/versions/node/v24.14.0/bin/node`
- pnpm：`10.0.0`，路径 `/Users/zerro/.nvm/versions/node/v24.14.0/bin/pnpm`
- 代理：未设置、未使用
- 依赖：未新增第三方依赖，未修改 lockfile
- 初始工作区：只有用户提供的未跟踪计划 `tasks/109-symbol-value-tier-imgnumber.md`

预检后先建立测试基线：rendercore `56 files / 366 tests`、symbolseditor `7 files / 34 tests`、game002 `18 files / 95 tests` 均通过，相关 typecheck 也通过。后续所有命令均使用上述 Node 24 与 pnpm 10。

## 2. 实施结果

任务合同中的 production、编辑器、资源生成、loading、release check、文档和自动化验收均已完成。最终浏览器手工验收按用户要求未代执行，留给用户执行第 10 节清单。

### 2.1 rendercore 严格 schema 与公共类型

- `SymbolValuePresentationSpec.text` 已扩展为严格互斥的 `font | image | image-string` discriminated union。
- `image-string` 只接受 `type/tiers`；每档 binding 只接受 `resource/slot/anchor/transform/followSlotColor`。
- binding 数量必须与已解析的 art tier 数量完全一致，并按同一 tier index 消费，不复制阈值。
- resource 必须是规范化的本地相对路径；空路径、路径逃逸、未知字段、非法 anchor/transform/scale、空 slot、binding 数量漂移均 fail-fast。
- `font` 与完整数值 `image` 的旧合同保留；三种分支不会保留或容忍另一分支的隐藏字段，也没有 fallback。
- raw value 继续要求 positive safe integer，tier 继续只由严格递增的 `maxExclusive` 选择，ImgNumber 渲染 `String(value)`。

### 2.2 image-string 资源与生命周期

- 新增统一的 `createSymbolImageStringResourcePool`，普通 `imageStringNodes` 和 value-presentation 共用同一池。
- 相同 canonical manifest path 只解析并加载一次；nested manifest、精确 glyph closure 与 Vite module 都严格校验。
- glyph 缺失、多余、解码尺寸漂移、非法 image-string v1 manifest 或当前文本缺字均显式失败。
- 初始化使用原子 rollback；失败时会释放本次已创建的 texture/resource/Object URL，`destroy()` 幂等。
- owner 统一持有共享 resource；每个 occurrence 只创建轻量 `RenderImageString`，renderer 销毁不误销毁共享纹理。
- value controller 与 standalone presenter 都使用 resolved tier binding，通过官方 Spine slot API attach/detach；slot 不存在时在展示前失败。
- 挂载后的 ImgNumber 继承 slot/bone transform、可见性及可选颜色。异步初始化支持取消和清理，不会留下晚到的 renderer 或 slot attachment。
- 显式 reel texture 仍优先于 normal active Spine；同 value/tier 且资源/playback 等价时保留 player 与时间轴，不因 ImgNumber 重播 Loop。

### 2.3 symbol package、生成器与 symbolsviewer

- symbol package bytes、Vite modules 与预览路径都会递归收集 value-tier 使用的 nested image-string manifest 和精确 glyph，并与普通 image-string node 去重。
- `generate-symbol-value-vite-resources.mjs` 支持 per-tier image-string，生成精确 manifest/glyph import 与 loading map；生成内容使用仓库现有 Prettier 格式化。
- 生成阶段校验 defaultValues 对应的全部 code point、精确 glyph closure 和实际解码 PNG/WebP 尺寸。
- state-texture generator 会保留合法 `image-string` 分支，并拒绝混合旧 image 字段或非法分支。
- symbolsviewer 改为异步准备并持有 game002 value resource bundle，切换 symbol set 和销毁时会释放旧 bundle；主 display symbol 集未扩大。

### 2.4 symbolseditor

- Value Inspector 将 art Spine tiers 与 Number presentation 拆为独立 section。
- Number presentation 提供 `Font`、`完整数值图片`、`ImgNumber（按 tier）` 三种模式；切换模式会原子替换 union，不保留隐藏旧字段。
- ImgNumber 每档可独立选择 dependency、精确 Spine slot、anchor、transform 和 `followSlotColor`。
- 增加 tier 会创建未配置的空 binding，不复制相邻档；删除和移动 tier 时 binding 与 art tier 同步对齐。
- dependency 删除保护会报告精确引用位置 `SYMBOL.valuePresentation.text.tiers[index]`。
- 预览、导出 ZIP、重新导入、再次导出均走 rendercore 公共 package/resource 路径；自动化 round-trip 验证稳定。

### 2.5 game002 CN 迁移

- `assets/game002-s3/symbol-state-textures.manifest.json` 中 CN 已从完整数值图片模式迁移为 `type: image-string`。
- 四个 art tier 均显式绑定同一 `./dependencies/image-strings/cn-digits/image-string.manifest.json`，slot 为各 skeleton 实际存在的 `Num`，anchor 为 `(0.5, 0.5)`，transform 为 identity，`followSlotColor: true`。
- 实际检查 `CN_1.json` 到 `CN_4.json`，四档均存在 exact `Num` slot；没有硬编码四档到 rendercore。
- 新 ImgNumber 字符集严格为 `0..9`，文件为 `u0030.png` 到 `u0039.png`。它们是旧 `0-1.png` 到 `9-1.png` 的逐字节拷贝，没有重画或字体替代。
- glyph 实际尺寸为：`0 36x49`、`1 26x48`、`2 37x48`、`3 36x49`、`4 35x48`、`5 33x49`、`6 34x49`、`7 35x48`、`8 35x49`、`9 34x48`；manifest 使用 `lineHeight=49`、居中的 `fixedAdvance=37`，48px 高字符使用 `y=1`。
- 已覆盖 `9/10/99/100/999/1000` 实际字符串组合和全部 `0..9` glyph。旧完整数值图片源文件仍保留为用户美术源，但已从 generated/loading/production dist runtime closure 排除。
- 99% loading 会并行准备 live session 与 value resource bundle；任一失败使用 `allSettled` rollback，100% 后 adapter 只接收已准备资源。下一 spin、退出、失败和 destroy 都有明确释放路径，不会创建第二份 WebSocket。
- release verifier 现在检查 source/dist 的 nested manifest、全部且仅有精确 glyph、解码尺寸、逐字节一致、单次产物，以及旧完整值图片不进入 runtime closure。

## 3. 主要修改文件与职责

- rendercore schema/runtime：`packages/rendercore/src/symbol/manifest.ts`、`package.ts`、`symbol-image-string/{resources,types}.ts`、`symbol-value-presentation/*`、`symbol/index.ts`。
- 生成与校验：`packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs`、`generate-symbol-state-textures.mjs`。
- rendercore 测试：manifest resource、controller、pool、package fixture、两类 generator 测试。
- symbolseditor：`src/model/editor-project.ts`、`src/ui/resource-picker.ts`、`src/ui/workspace-app.ts` 及对应 UI/dependency/round-trip 测试。
- game002：CN manifest、新 nested dependency、prepared lifecycle、adapter、loading、release verifier、generated map 及相关测试。
- symbolsviewer：prepared resource lifecycle、generated map、config 与测试。
- 文档：rendercore、game002、symbolseditor、symbolsviewer README，`docs/image-string-manifest.md`、`docs/symbol-package.md` 和根级 `agents.md`。

## 4. 精确 generated/loading/dist 闭包

- game002 与 symbolsviewer 的 generated value resource map 各包含 19 个精确资源：原有 8 个 value state/Spine 资源、1 个 nested image-string manifest、10 个数字 glyph。
- 旧完整数值图片 import map 已为空；没有宽泛 glob、路径猜测、首档 fallback 或额外 glyph。
- loading 将 nested glyph 明确作为 Pixi texture 资源处理。
- game002 production dist 经 release check 确认：nested manifest/glyph 均存在且只出现一次，source/dist bytes 一致，旧完整数值图片不在 runtime closure。

## 5. 测试 fixture 说明

- 新增 `apps/game002/tests/value-resource-fixture.ts`，为不需要真实 GPU/asset loading 的 adapter 与流程测试显式提供 fake prepared resource bundle。
- fixture 仅存在于测试目录，不参与 production build，不改变 production parser/runtime，也没有加入 CN、Num、四档、文件名或游戏语义 fallback。
- 旧断言按新合同更新：验证 per-tier binding、精确 nested closure、销毁/rollback、UI 对齐和 package round-trip，而不是要求 production 双写旧完整图片配置。

## 6. 自动化验收

### 6.1 聚焦与包级结果

以下命令均通过：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore format:check

pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor lint
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check

pnpm --filter symbolsviewer generate:symbol-value-resources
pnpm --filter symbolsviewer check:symbol-value-resources
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm --filter symbolsviewer lint
pnpm --filter symbolsviewer build
pnpm --filter symbolsviewer format:check

pnpm --filter game002 generate:symbol-value-resources
pnpm --filter game002 check:symbol-value-resources
pnpm --filter game002 test
pnpm --filter game002 typecheck
pnpm --filter game002 lint
pnpm --filter game002 build
pnpm --filter game002 release:check
pnpm --filter game002 format:check
```

最终聚焦测试结果：

- rendercore：`56 files / 372 tests`，coverage branch `80.03%`，阈值通过。
- symbolseditor：`7 files / 35 tests`。
- game002：`18 files / 95 tests`。
- symbolsviewer：`2 files / 17 tests`。
- 四个包的 lint、typecheck、build、format check 均通过。
- game002 `release:check` 通过，输出 `game002 static dist check passed.`。

### 6.2 根级门禁

按顺序执行并整体以 exit code `0` 完成：

```bash
pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

其中 format、typecheck、build 的 turbo 汇总均为 `26/26`；命令链成功进入并完成 build，说明根级 test 也通过。另执行 `git diff --check`，通过。仅有 Vite chunk-size warning，没有编译或验收失败；未出现明显异常耗时。

## 7. 文档与仓库合同

- rendercore README 与 `docs/image-string-manifest.md` 记录 strict union、per-tier binding、共享 resource 和生命周期。
- `docs/symbol-package.md` 记录 value-tier nested exact closure。
- symbolseditor README 记录三种 Number presentation 模式和 tier/dependency 行为。
- game002 与 symbolsviewer README 记录 prepared image-string resource 与精确 loading。
- 根级 `agents.md` 已将 game002 CN 的 current contract 更新为 per-tier ImgNumber，删除与旧完整数值图片 runtime 配置冲突的描述。

## 8. 已知限制与未完成项

- 唯一未完成项是用户指定由其亲自执行的浏览器手工验收；自动化门禁、静态 dist 验收和 release check 已完成。
- 旧 `1.png..1000.png` 完整数值图片仍留在 source 美术目录，避免破坏用户资源；production generated/loading/dist 不再引用它们。
- build 的 chunk-size warning 为现有体积提示，不影响产物或本任务验收。
- 未 stage、未 commit、未修改 lockfile、未使用代理。

## 9. 浏览器验收复现入口

按任务计划第 9 节执行：

- symbolseditor：导入 game002 CN package 与至少两份 ImgNumber dependency，检查独立 section、跨 tier preview、tier 增删移动、引用删除保护、ZIP round-trip，以及切回完整图片后 ImgNumber 字段完全消失。
- game002：用合法参数进入，检查 99%/100% 首帧、四档 `Num` slot 跟随全部 Spine 状态、spin/drop/refill/collect/global win-amount 连续性、下一 spin/destroy/failure 清理，以及浏览器网络资源与 dist 精确闭包一致。

若浏览器发现问题，保留 URL、console stack、失败 value/tier、当前 Spine state 和 Network 中的资源路径即可复现。

## 10. 最终工作区状态

```text
 M agents.md
 M apps/game002/README.md
 M apps/game002/scripts/verify-static-dist.mjs
 M apps/game002/src/game-adapter.ts
 M apps/game002/src/game-entry.ts
 M apps/game002/src/generated/symbol-value-resources.generated.ts
 M apps/game002/src/loading-resources.ts
 M apps/game002/src/skin-config.ts
 M apps/game002/tests/assets.test.ts
 M apps/game002/tests/game-adapter.test.ts
 M apps/game002/tests/game-demo.test.ts
 M apps/game002/tests/loading-flow.test.ts
 M apps/game002/tests/loading-resources.test.ts
 M apps/symbolseditor/README.md
 M apps/symbolseditor/src/model/editor-project.ts
 M apps/symbolseditor/src/ui/resource-picker.ts
 M apps/symbolseditor/src/ui/workspace-app.ts
 M apps/symbolseditor/tests/app-shell.test.ts
 M apps/symbolseditor/tests/image-string-dependency.test.ts
 M apps/symbolsviewer/README.md
 M apps/symbolsviewer/src/generated/game002-symbol-value-resources.generated.ts
 M apps/symbolsviewer/src/main.ts
 M apps/symbolsviewer/src/symbol-set-config.ts
 M apps/symbolsviewer/tests/symbol-set-config.test.ts
 M assets/game002-s3/symbol-state-textures.manifest.json
 M docs/image-string-manifest.md
 M docs/symbol-package.md
 M packages/rendercore/README.md
 M packages/rendercore/scripts/generate-symbol-state-textures.mjs
 M packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs
 M packages/rendercore/src/symbol-image-string/resources.ts
 M packages/rendercore/src/symbol-image-string/types.ts
 M packages/rendercore/src/symbol-value-presentation/create-symbol-value-presenter.ts
 M packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts
 M packages/rendercore/src/symbol-value-presentation/types.ts
 M packages/rendercore/src/symbol-value-presentation/value-display.ts
 M packages/rendercore/src/symbol/index.ts
 M packages/rendercore/src/symbol/manifest.ts
 M packages/rendercore/src/symbol/package.ts
 M packages/rendercore/tests/symbol-image-string/controller.test.ts
 M packages/rendercore/tests/symbol-value-presentation/manifest-resources.test.ts
 M packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts
 M packages/rendercore/tests/symbol/package-fixtures.test.ts
 M packages/rendercore/tests/symbol/state-texture-generator.test.ts
 M packages/rendercore/tests/symbol/symbol-value-vite-resource-generator.test.ts
?? apps/game002/tests/value-resource-fixture.ts
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0030.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0031.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0032.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0033.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0034.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0035.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0036.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0037.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0038.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/assets/u0039.png
?? assets/game002-s3/dependencies/image-strings/cn-digits/image-string.manifest.json
?? tasks/109-symbol-value-tier-imgnumber-260719-095914.md
?? tasks/109-symbol-value-tier-imgnumber.md
```
