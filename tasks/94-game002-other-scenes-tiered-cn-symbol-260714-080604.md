# 94 game002 otherScenes 分档 CN symbol 执行报告

## 1. 执行结论

- UTC 初版报告时间：`2026-07-14T08:06:04Z`
- UTC 补充修正完成时间：`2026-07-14T09:14:20Z`
- 分支：`main`
- HEAD：`882711e`
- 环境：Node.js `v24.14.0`、pnpm `11.7.0`
- 结论：任务 94 的代码、资源闭包、测试、构建、文档和二次遗漏审计已完成；浏览器/live 视觉验收按用户要求未由 Codex 执行，明确交接给用户，因此当前状态是“自动验收完成，待人工浏览器验收”，不能宣称完整发布验收完成。
- 初始工作区：任务计划本身为 untracked；`assets/game002-s3` 下 AF、CM、CN_1..4、CO、Nearwin1、Symbol.atlas、Symbol.png、WL、WM 是用户已有未提交美术修改。
- 最终工作区：保留上述全部用户美术修改；新增/修改任务 94 实现、测试、生成物、文档与本报告；未 stash、未 reset、未 checkout、未清理 untracked。
- 第一次非 TTY pnpm 执行遇到 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，按仓库约定改用同一命令加 `CI=true` 后继续；未修改代码规避验收，未使用代理。

## 2. 用户新美术保护

任务保留现有用户美术修改，没有执行 reset、checkout、stash、状态贴图重生成或资源覆盖。按后续明确要求，验收不计算或比较资源 SHA/hash；资源只校验 manifest 引用、Spine 版本、configured animation、configured slot、atlas page、texture 存在性以及 build/dist 闭包。

## 3. Manifest 与通用 schema

`assets/game002-s3/symbol-state-textures.manifest.json` 的 `symbols.CN` 顶层只保留 `scale + valuePresentation`，不再允许 `normal/spinBlur/disabled`。`valuePresentation.reelStates` 明确声明透明 reel normal 以及 blur/disabled；实际 normal art 只来自分档 Spine。`defaultValues=[1,2,5,10,25,50,100,250,500,1000]` 是 defaultScene 和本地临时轮带 CN 的唯一候选数组。该配置也是候选值、档数、阈值、Spine 路径、animation、文本 slot/local offset 和样式的唯一来源。

当前实例为：

| 数值范围   | skeleton      | animation           |
| ---------- | ------------- | ------------------- |
| `1..9`     | `./CN_1.json` | `Idle`, `loop=true` |
| `10..99`   | `./CN_2.json` | `Idle`, `loop=true` |
| `100..999` | `./CN_3.json` | `Idle`, `loop=true` |
| `>=1000`   | `./CN_4.json` | `Idle`, `loop=true` |

文本显示精确使用 `String(raw positive safe integer)`，不走美元 formatter；manifest 配置 `slot: "Num"` 与 slot-local `x/y`。resolver 校验每档 skeleton 都真实包含 `Num`；presenter 与 reel-slot value controller 都通过 official Spine slot object API 挂接文本，因此数字继承 slot/bone 动画。parser 对 value-managed symbol 顶层 normal/state、unknown key、空/重复/非正安全整数 defaultValues、空 tiers、阈值缺失/重复/倒序/非安全整数、最后一档有上限、非 Spine tier、非 named looping animation、非法 reelStates/transform/text 字段均显式失败。解析结果深冻结。

通用合同不认识四档或 `CN_数字` 命名。测试覆盖 1/3/5 档与 `bronze.json`、`ruby.json` 等任意名字；当前四档只是 game002 manifest 的配置实例。

状态贴图 generator 会严格验证并原样保留仍有效的 `valuePresentation`、`animations` 和 `renderPriority`，不会因重生成丢失 metadata。

## 4. rendercore 实现

新增通用 `symbol-value-presentation` 能力并从 rendercore 根导出：

- `createSymbolValuePresentationResourcesFromManifest(...)` 复用 `parseSymbolStateTextureManifest`、官方 Spine 4.3 version/resource/slot 校验与 official player；精确解析 skeleton/atlas/texture module，缺失或错配立即失败，无 static/首帧/default tier fallback。
- `createSymbolValuePresenter(...)` 仅依赖最小 geometry target，不依赖 GameLogic、组件名、game002/game003 或具体 ReelSet。
- `prepare()` 校验坐标、symbol/code/value、重复位置并按 manifest 有序阈值选档；每个同时可见 item 初始化独立 official Spine player。资源失败会 reject，app 不启动 reels。
- `show()` 校验 prepared 所属权/单次消费、geometry 数量/顺序/坐标/code/kind；`discard()` 单次消费并释放只用于预检的 prepared players。Spine view 挂到 reel-local container，raw Text 则通过 official `addSlotObject()` 绑定到 manifest 指定 slot，并跟随 slot/bone transform、visibility 和 color。
- `update()` 只推进 active players；`clear()` 幂等清理 view/text/player；`destroy()` 取消迟到 prepare、释放 active/container，重复 destroy 幂等，销毁后其它操作显式失败。
- 当前实现没有启用可选 idle player pool；每批每格保持独立 player，clear/destroy 时直接释放。这样不会跨档或跨值串状态，也不改变详细合同中“可以复用 pool”的可选语义。
- 多 CN、空批次、跨 presenter/伪造/重复 prepared、discard 单次消费、未消费 prepared 的 destroy、prepare/destroy 竞态、geometry 漂移、text 样式/位置、snapshot、invalid delta、clear/destroy 与 future fake geometry target 均有回归测试。
- `TemporaryReelStrip` 现在把 presentation value 与 symbol code 一起冻结：current endpoint 保留当前值，本地公开轮带中间 occurrence 使用 consumer resolver 的 manifest 候选值，target endpoint 接受明确业务值。`RenderSymbol` 的通用 value controller 直接把 tier Spine 挂在真实 reel slot 内，滚动过程中不再依赖透明 CN normal；值不变时复用当前显示，值变化时恢复 reel state 作为异步初始化期间的可见底图。

精确 Vite 资源闭包生成器 `generate-symbol-value-vite-resources.mjs`：

- 从 manifest 遍历实际 tiers；不使用 glob，不枚举当前四个名字。
- 对 JSON 使用静态 data import 和 `?url`，atlas 使用 `?raw` 与 `?url`，texture 使用 `?url`。
- 同一路径共享 atlas/texture 只生成一次，当前实例共 8 个资源：4 skeleton + 1 atlas + 1 texture + 2 个 `reelStates` PNG。
- 拒绝路径逃逸、错误扩展名、缺文件、同路径类型冲突、unknown key、非法 tier/text/transform；`--check` 对缺失或 stale 生成物显式失败。

## 5. game002 接入

`cn-value-sequence.ts` 只拥有 app 语义：第 0 step、固定组件 `bg-gencoins`、symbol `CN`。它通过 gameframeworks facade 读取 component/otherScene，不直接 import logiccore。

映射规则：

- 未触发组件返回空 items。
- 触发时 `usedOtherScenes` 必须恰好一个。
- scene/otherScene 都按 x 优先 `6 x 9` 校验，不转置。
- CN code 从 game config 的 symbol code map 获取，不硬编码数值 `8`。
- CN cell 必须是 positive safe integer；非 CN cell 必须精确为 `0`。
- 附件样例完整写入 fixture，映射结果为 raw values `2/25/1/1`，对应三个低档和一个第二档。

adapter 生命周期：

1. 解析 otherScene 并在 `spinToScene()` 前等待 value presenter `prepare()`；非法 data/resource 时 reels 从未启动。
2. prepare 成功后才清理上一轮展示并启动 spin，避免 prepare 失败时先破坏当前可见状态。
3. defaultScene CN 在 reset 时从 manifest 候选数组取值；spin 的每个本地临时轮带 CN occurrence 在建 strip 时固定取值并随真实 slot 滚动。触发 `bg-gencoins` 时，target endpoint 在 spin 启动前直接写入服务器 otherScene 值，逐格落地至最终停轴都不为空；停轴校验后只 `discard()` 已 prepared 的预检 players，不叠加第二套 Spine。未触发组件时 target CN 继续使用本地候选值。
4. CN value 是 main-reel symbol 自身的一部分，位于 `bg-win` carousel 与 global win-amount 之下；它不改变 scene、stop、symbol state、result/amount，也不额外阻塞 collect。
5. 独立 tick 持续更新 value Spine；下一 spin、initial state、destroy、mount rollback 都清理。
6. 并发 spin 与 destroy/迟到 prepare 使用明确 token/phase 防止复活。
7. viewport 继续复用 rendercore/framework 的既有 art mapping，无 app 私有 resize 算法。随机候选只影响 CN 视觉 value，不改变公开轮带 code、server scene、stop 或任何结算字段。

loading/static-dist 同步纳入 manifest 精确引用的 tier 与 `reelStates` 资源，并按 URL 去重共享 atlas/png。`CN.png` 不再进入 bundle；`release:check` 验证 dist 包含 8 个 value resources、每档 skeleton 的 configured `Num` slot，同时仍排除 `Nearwin*`、`WM_Fx` 等非发布资源。

## 6. symbolsviewer 接入

- `game002-s3 -> CN` 时通过 rendercore public presenter 显示 Value 输入、Apply、Clear；默认值 `25`。
- 输入 raw positive safe integer 后按 manifest 阈值预览 Spine + raw number；切换 symbol/set、reset、clear、destroy 均清理，tick 走 public API。
- 普通 symbol 不出现 Value 控件。
- `CN_1..CN_4` 仍不是主 display symbols，也不进入 symbol selector；game002-s3 主 display set 仍为 13 个。
- viewer 和 game002 由同一 generator、同一 manifest 分别生成精确资源模块，两个 `--check` 都通过。

## 7. 文件清单与依赖

任务修改：

- `agents.md`
- `assets/game002-s3/symbol-state-textures.manifest.json`
- `packages/rendercore/README.md`
- `packages/rendercore/scripts/generate-symbol-state-textures.mjs`
- `packages/rendercore/src/index.ts`
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`
- `packages/rendercore/src/reel/render-reel.ts`
- `packages/rendercore/src/reel/spin-strip.ts`
- `packages/rendercore/src/reel/symbol-registry.ts`
- `packages/rendercore/src/reel/types.ts`
- `packages/rendercore/src/spine/runtime-player.ts`
- `packages/rendercore/src/symbol/index.ts`
- `packages/rendercore/src/symbol/manifest.ts`
- `packages/rendercore/src/symbol/render-symbol.ts`
- `packages/rendercore/src/symbol/types.ts`
- `packages/rendercore/tests/background/runtime-player.test.ts`
- `packages/rendercore/tests/reel/spin-strip.test.ts`
- `packages/rendercore/tests/symbol/state-texture-generator.test.ts`
- `apps/game002/README.md`
- `apps/game002/package.json`
- `apps/game002/scripts/verify-static-dist.mjs`
- `apps/game002/src/game-adapter.ts`
- `apps/game002/src/game-demo.ts`
- `apps/game002/src/loading-resources.ts`
- `apps/game002/src/skin-config.ts`
- `apps/game002/tests/assets.test.ts`
- `apps/game002/tests/fixtures/game002-gmi.ts`
- `apps/game002/tests/game-adapter.test.ts`
- `apps/game002/tests/game-demo.test.ts`
- `apps/game002/tests/loading-resources.test.ts`
- `apps/game002/tests/source-boundary.test.ts`
- `apps/symbolsviewer/README.md`
- `apps/symbolsviewer/package.json`
- `apps/symbolsviewer/src/main.ts`
- `apps/symbolsviewer/src/symbol-set-config.ts`
- `apps/symbolsviewer/tests/symbol-set-config.test.ts`

任务新增：

- `packages/rendercore/scripts/generate-symbol-value-vite-resources.mjs`
- `packages/rendercore/src/symbol-value-presentation/types.ts`
- `packages/rendercore/src/symbol-value-presentation/create-symbol-value-presenter.ts`
- `packages/rendercore/src/symbol-value-presentation/index.ts`
- `packages/rendercore/src/symbol-value-presentation/render-symbol-value-controller.ts`
- `packages/rendercore/tests/symbol-value-presentation/manifest-resources.test.ts`
- `packages/rendercore/tests/symbol-value-presentation/render-symbol-value-controller.test.ts`
- `packages/rendercore/tests/symbol-value-presentation/symbol-value-presenter.test.ts`
- `packages/rendercore/tests/symbol/symbol-value-vite-resource-generator.test.ts`
- `apps/game002/src/cn-value-sequence.ts`
- `apps/game002/src/generated/symbol-value-resources.generated.ts`
- `apps/game002/tests/cn-value-sequence.test.ts`
- `apps/symbolsviewer/src/generated/game002-symbol-value-resources.generated.ts`
- 本报告。

用户已有修改且本任务只读取/保护、未覆盖：`AF.json`、`CM.json`、`CN_1..4.json`、`CO.json`、`Nearwin1.json`、`Symbol.atlas`、`Symbol.png`、`WL.json`、`WM.json`。

未新增第三方依赖；`pnpm-lock.yaml` 零 diff。

## 8. 自动验收结果

### 8.1 资源与边界

- 四个 CN skeleton 的 `4.3.x`/`Idle` jq 预检：通过（8 个断言全为 true）。
- 未执行资源 SHA/hash 校验；结构、版本、animation、slot、atlas page 与打包闭包校验通过。
- manifest valuePresentation dump：当前四档、raw text 与 `Idle loop=true` 符合合同。
- shared source 扫描 `bg-gencoins|GAME002_CN|CN_[0-9]|tierCount === 4`：无输出。
- game002 source 扫描 `@slotclientengine/logiccore|@esotericsoftware/spine-pixi-v8`：无输出。
- 当前资源名仅出现在 manifest、generated closure、配置测试/docs；手写 runtime 没有 `CN_${index}`、固定四档 tuple、basename 推档。
- game002/symbolsviewer `check:symbol-value-resources`：均通过，resourceCount 均为 8。
- game003 相关路径 diff：空。
- `pnpm-lock.yaml` diff：空。
- `git diff --check`：通过。

### 8.2 定向包

| 命令                                                                                                                           | 结果                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `CI=true pnpm --filter @slotclientengine/logiccore test`                                                                       | 通过，59 tests                                         |
| `CI=true pnpm --filter @slotclientengine/gameframeworks test`                                                                  | 通过，33 tests                                         |
| `CI=true pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/symbol-value-vite-resource-generator.test.ts` | 通过，4 tests；覆盖 1/3/5 档、任意命名、stale/非法输入 |
| `CI=true pnpm --filter @slotclientengine/rendercore format:check`                                                              | 通过                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore lint`                                                                      | 通过                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore test`                                                                      | 通过，37 files / 247 tests；branch coverage 80.92%     |
| `CI=true pnpm --filter @slotclientengine/rendercore typecheck`                                                                 | 通过                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore build`                                                                     | 通过                                                   |
| `CI=true pnpm --filter game002 generate:symbol-value-resources`                                                                | 通过，8 resources                                      |
| `CI=true pnpm --filter game002 check:symbol-value-resources`                                                                   | 通过，无 stale                                         |
| `CI=true pnpm --filter game002 format:check`                                                                                   | 通过                                                   |
| `CI=true pnpm --filter game002 lint`                                                                                           | 通过                                                   |
| `CI=true pnpm --filter game002 test`                                                                                           | 通过，16 files / 82 tests                              |
| `CI=true pnpm --filter game002 typecheck`                                                                                      | 通过                                                   |
| `CI=true pnpm --filter game002 build`                                                                                          | 通过                                                   |
| `CI=true pnpm --filter game002 release:check`                                                                                  | 通过，source/dist 精确资源闭包通过                     |
| `CI=true pnpm --filter symbolsviewer generate:symbol-value-resources`                                                          | 通过，8 resources                                      |
| `CI=true pnpm --filter symbolsviewer check:symbol-value-resources`                                                             | 通过，无 stale                                         |
| `CI=true pnpm --filter symbolsviewer format:check`                                                                             | 通过                                                   |
| `CI=true pnpm --filter symbolsviewer lint`                                                                                     | 通过                                                   |
| `CI=true pnpm --filter symbolsviewer test`                                                                                     | 通过，2 files / 17 tests                               |
| `CI=true pnpm --filter symbolsviewer typecheck`                                                                                | 通过                                                   |
| `CI=true pnpm --filter symbolsviewer build`                                                                                    | 通过                                                   |

### 8.3 根级

| 命令                                                                         | 结果                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI=true pnpm lint`                                                          | 通过，23/23 packages                                                                                                                                                                                                                                                                                                                    |
| `CI=true pnpm typecheck`                                                     | 通过，23/23 packages                                                                                                                                                                                                                                                                                                                    |
| `CI=true pnpm build`                                                         | 通过，23/23 packages                                                                                                                                                                                                                                                                                                                    |
| `CI=true pnpm exec turbo run lint typecheck build --output-logs=errors-only` | 通过，69/69 tasks                                                                                                                                                                                                                                                                                                                       |
| `CI=true pnpm format:check`                                                  | 失败；任务外已有多处格式问题，当前 Turbo 报告首个失败为 `apps/uiframeworksviewer`，可见 `src/demo-game.ts`、`tests/mock-client.test.ts`、tsconfig/vite config；同时输出还列出 gengameconfig 和多个历史 demo。rendercore/game002/symbolsviewer 已分别 format:check 通过。未批量修改任务外文件。                                          |
| `CI=true pnpm test`                                                          | 失败；并行运行在 20/23 tasks 成功后，`game002#test` 的依赖构建与其它 task 同时清理 `packages/gameframeworks/dist/static-config`，Vite 报 `ENOTEMPTY: directory not empty`。game002 已独立通过全部 82 tests，因此该首错属于共享构建目录竞争。                                                                                            |
| `CI=true pnpm exec turbo run test --concurrency=1 --output-logs=errors-only` | 失败；串行排除目录竞争后 21/23 tasks 成功，唯一真实失败为 `apps/game003`。首错见 `tests/bg-bar-layout.test.ts`：`Symbol "WL" normal Spine skeleton version is invalid: Unsupported Spine skeleton version "4.2.43"; supported version is 4.3.x.`；game003 最终 12 files failed、15 passed，4 loading-flow tests 同因 module init 失败。 |

并行根 test 的共享目录竞争已通过串行重跑单独审计。串行后唯一真实功能失败属于任务明确非目标：game003 仍有 4.2.43 资源，而当前 rendercore 发布合同固定 4.3.x；任务 94 明确要求不迁移 game003、不恢复 4.2/3.8、不增加 fallback。`git diff -- apps/game003 assets/game003-s1 apps/game003/config apps/game003/src/generated` 为空。因此没有为 root test 放宽 production parser 或修改 game003。

## 9. 浏览器/live 验收交接

执行者：用户。Codex 未启动 dev server、未打开浏览器、未使用或记录任何 live token，也未保存截图。

状态：**待人工验收**。

game002：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206
```

入口基于 `apps/game002/README.md` 当前 live query，必须含 `skin=1`、真实凭证、`lines=30`，不得含 `serverUrl`。请重点确认：gameloading 99%/100% 顺序；defaultScene 的 CN 一开始就有候选数字/档位；spin 全程临时轮带 CN 不空白且不同候选档位跟随真实 reel slot 滚动；停轴瞬间最终 CN 切为服务器 otherScene；上一局清理；`1/9,10/99,100/999,>=1000` 分档；raw 数字无 `$`，且明显跟随当前 Spine `Num` slot/bone 的位移、缩放、旋转/颜色动画而不是独立漂浮；z-order；bg-win/win-amount 无回归；横窄/横宽/竖屏 resize 对齐；非法数据显式失败。

symbolsviewer：

```bash
CI=true pnpm --filter symbolsviewer dev -- --host 127.0.0.1 --port 5209
```

选择 `game002-s3 -> CN`，输入 `9,10,99,100,999,1000`，检查边界切档和当前新美术。普通 symbol 不应出现 Value 控件，tier resources 不应进入 symbol selector。截图如保存，只放本地临时目录，不加入 git。

## 10. 二次遗漏审计

### 10.1 数据与失败边界

- [x] 只消费第 0 step、`bg-gencoins`、一个 `usedOtherScenes`。
- [x] scene/otherScene 均按 x 优先 `6 x 9`，无转置。
- [x] CN code 来自 game config，不硬编码 `8`。
- [x] CN 必须 positive safe integer；非 CN 精确为 0。
- [x] defaultScene 与本地临时轮带 CN 从 manifest `defaultValues` 取值，临时 occurrence 内稳定；target endpoint 保留给服务器 otherScene。
- [x] 未触发组件为空；触发后缺失、数量错误、越界或非法值显式失败。
- [x] app 不选 tier、不格式化货币、不维护阈值/样式第二份表。

### 10.2 manifest 与新美术

- [x] CN 顶层无 normal/state；`valuePresentation` 是 defaultValues、reelStates、档数、阈值、资源、animation、文字 slot/local offset 和样式唯一来源。
- [x] 通用实现支持任意非空档数；当前实例为 `<10/<100/<1000/unbounded`。
- [x] tier resources 不进入主 display symbols/paytable/reels。
- [x] 未执行资源 SHA/hash 校验；工作区保护与结构/版本/slot/闭包检查确认没有触发资源覆盖流程。
- [x] 遍历 manifest 实际资源校验 4.3.x、configured animation、configured `Num` slot、atlas page/texture，而非固定四文件运行时逻辑。
- [x] generator rerun 保留 valuePresentation/animations/renderPriority。
- [x] 两份 generated closure `--check`、loading/build/dist 均通过。
- [x] 1/3/5 档与任意名字 fixture 通过；未引用 JSON 不会因 glob 入包。

### 10.3 rendercore 边界

- [x] 通用 source 无 `bg-gencoins`、CN、game002/game003 分支。
- [x] 通用 presenter 只依赖最小 geometry target；game002 滚动值和服务器 target 值通过 rendercore 通用 temporary-strip / RenderSymbol 接口传递，不在 app 复制 ReelSet 私有实现。
- [x] 复用 official Spine player/parser/slot attachment/validation，无第二 renderer/canvas；数字不是 Spine 同级 overlay。
- [x] 多 item 独立 player；update/clear/destroy 无串值泄漏。可选 idle pool 未启用，clear 直接释放。
- [x] 无静态、首帧、normal 或 default tier fallback。

### 10.4 adapter 与交互

- [x] data/resource prepare 在 spin 前；失败不启动 reel。
- [x] 服务器 target matrix 在 spin 前写入实际 reel slot；停轴视觉校验后 discard 预检资源，不额外阻塞 collect。
- [x] CN value 位于实际 reel slot 内、bg-win/global win-amount 之下，没有第二套叠加 Spine。
- [x] 下一 spin、initial、destroy、mount rollback 全部清理。
- [x] async prepare/destroy/concurrent spin 有 token/phase，迟到 promise 不复活。
- [x] viewport resize 复用 shared mapping，无 app 私有映射。

### 10.5 邻接消费者与交付

- [x] symbolsviewer 使用 public API，任意档数，不把 tier 当 symbol，不在手写 source 中枚举当前资源名。
- [x] game003 CO overlay、YAML/generated、4.2 resources 零 diff。
- [x] README、`agents.md`、source-boundary、static dist 已同步。
- [x] rendercore/game002/symbolsviewer 单包严格验收全部通过。
- [x] 根级首错如实记录；未削弱 production 合同或批量改任务外文件。
- [x] UTC 报告、无 hash 验收决策、自动验收与浏览器明确交接均已记录。

## 11. 未完成项与风险

1. 唯一任务内未完成项是用户负责的浏览器/live 视觉验收。它需要真实 live 凭证和命中 `bg-gencoins` 的局；验收结论尚未产生。
2. root `format:check` 受任务外历史格式问题阻塞；任务触达三个包各自通过。
3. root `test` 受 game003 4.2.43 既有资源与 rendercore 4.3-only 合同冲突阻塞；任务 94 不应通过兼容 fallback 修复它。
4. 当前没有 idle player pool；预检 presenter 与滚动/target slot controller 都按实例创建并在 discard、换值或销毁时释放。若浏览器性能采样证明频繁创建是瓶颈，应另立通用 pool 任务并以完整资源/animation key 隔离。
5. 在用户完成第 9 节全部视觉检查前，不应标记完整发布验收通过。
