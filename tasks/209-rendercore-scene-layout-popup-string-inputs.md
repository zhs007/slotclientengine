# 209 rendercore-scene-layout-popup-string-inputs 任务计划

## 1. 目标与完成定义

### 目标

在任务 206 的 Gamelayout exact-name `RenderObject` factory 和任务 208 的安全 render layer 之外，补齐 Scene Layout 内已装配 Popup 的业务字符串输入：游戏既可继续通过 Popup player 的 exact-name handle 在播放前或播放中修改字体文字、manual ImgNumber，也可把本次 mode transition prelude 所需的翻译结果和金额字符串作为一次性输入交给 `requestGameMode()`。RenderCore 必须在 Popup 可见和 mode transition mutation 前完整预检，并在 Popup 完成、失败、取消或 runtime destroy 后恢复调用前状态，避免本轮金额泄露到下次播放。

以 `/Users/zerro/Downloads/crave/congratulations-popup.zip` 为具体合同样例：它是 Popup v5 的普通 `type="spine"` 弹窗，包含命名字体文字 `overlay-1000` 和 manual ImgNumber `imgnumber-0`；它应作为 `FreeGame -> BaseGame` directed transition 的 `preludePopup` 播放，而不是伪装成 mode `award-celebration`。

### 完成定义

- [ ] `SceneLayoutPackageRuntime` 为 `requestGameMode()` 增加可选、typed、per-play 的 prelude Popup string inputs；字体文字和 ImgNumber 均按 `kind + exact name` 指定最终 string。
- [ ] `SceneLayoutPresentationSurface` 提供等价的 presentation-only 请求入口；不要求 consumer 取得 raw Container 或复制 transition/Popup 状态机。
- [ ] 输入只作用于目标 directed edge 显式绑定的普通 Spine `preludePopup`；无 prelude、错误 popup type、unknown/kind-mismatched/duplicate name、非法文字或 ImgNumber 缺 glyph 时显式失败。
- [ ] 全部输入在 Popup `start()`、target mode 设置或可见画面 mutation 前完成预检；任一输入失败时，所有节点、Popup phase、prepared transition 和稳定 mode 保持调用前状态。
- [ ] 本次输入覆盖只维持一个 prelude 生命周期；complete、immediate dismiss、transition prepare/start failure、runtime destroy 均恢复此前每个 handle 的 `text + overridden` 状态，且 cleanup 恰好一次。
- [ ] 既有 `getSpinePopup(id).getTextNode(name).setText()` / `getImageStringNode(name).setText()` 继续可在播放前或播放中直接改值，`resetText()` 行为、旧 prompt、award `win-amount` 和 task 167 的 persistent override 语义不变。
- [ ] `requestGameMode(modeId, options)`、`prepareGameModeTransition()`、video trusted-gesture、none/Spine transition、无 prelude edge 和既有 consumer 保持兼容；per-play string 不成为 resource prepare/cache identity。
- [ ] RenderCore 不接收 translation key、locale、金额 number 或业务 result；Crave 传入翻译与 formatter 已产出的最终 string。
- [ ] 新增 `docs/crave-scene-layout-popup-inputs.md`，可独立指导 Crave 在出免费游戏前设置 `CONGRATULATIONS!` 翻译和实际赢分、等待 Popup 完整结束后再切 BaseGame；不修改 Crave 源码。
- [ ] public exports、README、长期规则、定向自动化和 UTC 中文执行报告完成；浏览器真实 Crave/Gamelayout 验收由用户执行，执行会话不得代验或声称已通过。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的通用 Popup string input 类型，以及 exact selector、批量应用、失败回滚和 scoped restore 内部能力。
- `packages/rendercore/scene-layout` 的 prelude request input、directed edge/popup 校验、activation/complete/failure/destroy cleanup。
- full package runtime 与 presentation surface 的一致 public workflow。
- 普通 Spine Popup 的字体文字/manual ImgNumber；既有 handle 在 active Popup 上动态修改的文档与回归测试。
- 当前 `congratulations-popup.zip` 和 `assets/crave/layout.manifest.json` 只作为只读基线证据；shared package 测试使用包内最小 fixture。
- RenderCore README、Popup/Scene Layout 使用文档、最小领域规则和新的 Crave 接入文档。

### 不包含

- 不修改 `apps/**`、`assets/crave/**`、下载目录 ZIP、Gamelayout manifest/ZIP、Popup manifest/schema/version、assets map 或生成物。
- 不导入、升级或重打包 `congratulations-popup.zip`；当前 `assets/crave` 中较旧的 vendored Popup 由后续 Gamelayout 资产会话替换。
- 不修改 Popup Editor、Game Layout Editor 或 package CLI；209 只消费它们已经能导出的命名 text/manual ImgNumber contract。
- 不把普通 Spine Popup 改成 `award-celebration`，不把 manual ImgNumber 改成 reserved `win-amount`，不新增自动金额计数/tier/threshold 行为。
- 不实现 i18n 表、translation service、locale fallback、货币/金额 formatter、服务器 result 解析或 FreeGame/BaseGame 业务判断。
- 不让 RenderCore 硬编码 `congratulations`、`overlay-1000`、`imgnumber-0`、Crave、FreeGame、BaseGame 或具体赢分来源；这些只作为文档示例。
- 不改变 task 206 named RenderObject、task 208 render layer、Popup 内部 display tree、ticker/input binding 或 mode transition schema。
- 不新增依赖，不修改 lockfile、根工具链、LogicCore 或 server 数据边界。

## 3. 制定计划时的基线

```text
UTC: 2026-08-14T05:42:06Z
HEAD: c99a445009a49c2ad4f30b5bb41e4bf695e92c2c
branch: detached HEAD (HEAD 同时由 main、gitee/main、codex/task-208-render-layer-api 指向)
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、`docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/editor-artifacts.md`、`docs/agent-rules/scene-layout.md`；`packages/rendercore` 下没有补充 `AGENTS.md`。
- 已读取任务 167、203、206、208 的计划/执行报告，以及 `docs/popup-manifest.md`、`docs/scene-layout-manifest.md`、`docs/crave-task203-manual-migration.md`、`docs/crave-named-render-object-migration.md`。
- `PopupStringNodeHandle` 已有 `kind/name/index/text/overridden/setText/resetText`；`AwardCelebrationPlayer` 与 `SpinePopupPlayer` 已公开 exact-name handle。任务 209 不重复实现字体文字或 ImgNumber renderer。
- `SceneLayoutPackageRuntime.getSpinePopup(id)` 已可取得 layout-owned player；`requestGameMode()` 会自动播放 edge 的 `preludePopup`，并在 Popup complete 前保持 source mode。当前缺少把本轮 string 与这次 request 绑定、批量失败回滚和完成后自动恢复的高层合同。
- `SceneLayoutGameModeRequestOptions` 当前只包含 `recreateReel/reels`，且 `requestOptionsSignature()` 只描述 target reel prepare identity；per-play string 不应使相同 prepared transition/resource 失效。
- `DefaultSpinePopupPlayer` 在构造/init 后已拥有全部 text/manual ImgNumber runtime target；handle `setText()` 对单节点原子，但 caller 逐项设置多个节点时没有跨节点 transaction 或本轮 scoped restore。
- `/Users/zerro/Downloads/crave/congratulations-popup.zip` 的 `popup.manifest.json` 是 v5 `type="spine"`，exact text name 为 `overlay-1000`，manual ImgNumber name 为 `imgnumber-0`，start/loop/end 为 `Start/Loop/End`。
- `assets/crave/layout.manifest.json` 当前已把 popup binding `congratulations` 设为 `type="spine"`，并绑定到 `FreeGame -> BaseGame` 的 `preludePopup`；当前 vendored nested manifest 是 v1 且只含 manual ImgNumber，不等同于下载目录的 v5 ZIP。本任务不修改二者。
- 本规划会话只创建计划；未修改源码、app、assets 或 ZIP，未安装依赖，未运行构建或测试。

## 4. 需求解释与技术决策

### 需求解释

- “popup 弹出来以后改文字或 imgnumber”包含两条合法路径：现有 exact handle 可在 active player 上立即修改；转场已知值则推荐作为本次 `requestGameMode()` 的 prelude input，在显示前完成原子配置。
- 字体文字输入是 Crave 从翻译系统得到的最终单行 string；RenderCore 不读取 translation key，也不按 locale 猜默认值。
- 普通 Spine Popup 的 manual ImgNumber 输入同样是 formatter 最终 string，而不是 raw number。这样金额单位、小数位、币种前后缀与业务精度继续由 Crave 拥有，RenderCore 只做 glyph/layout strict validation。
- 下载 ZIP 虽然用于“获奖完成提示”，但 schema 身份仍是普通 Spine Popup；五档 `award-celebration` 的 `betAmountRaw/winAmountRaw`、自动 `win-amount` 与本次 manual ImgNumber 输入是两个不同合同。
- FreeGame 结束时，Crave 先计算最终赢分和翻译，再 `await requestGameMode("BaseGame", { preludePopupStrings })`；RenderCore 自行完成 prelude start/loop/end 和后续 transition，不新增第二个业务流程。

### 关键决策

1. **在 mode request 上增加一次性 prelude string input，不新增业务 Popup API。**
   - 目标 public 形态：

     ```ts
     type SceneLayoutPopupStringInput =
       | { readonly kind: "text"; readonly name: string; readonly text: string }
       | {
           readonly kind: "image-string";
           readonly name: string;
           readonly text: string;
         };

     interface SceneLayoutGameModeRequestOptions extends SceneLayoutGameModePrepareOptions {
       readonly preludePopupStrings?: readonly SceneLayoutPopupStringInput[];
     }
     ```

   - 最终名字可按现有风格小幅调整，但只能有一个 canonical input union；不提供 `any` map、name-only 模糊分派或 text/ImgNumber fallback。
   - `prepareGameModeTransition()` 只接收 prepare options；per-play string 只在 `requestGameMode()` activation 使用，不进入 prepare signature 或资源缓存键。

2. **输入绑定 exact directed edge 的 prelude，而不是 caller 再传 popup id。**
   - runtime 从当前 stable mode 到 target mode 的 exact edge 取得 `preludePopup`；caller 不重复维护 popup id 表。
   - 提供输入但 edge 无 prelude、binding 不是普通 Spine Popup或 target/source 不合法时，在 prepare/画面 mutation 前失败。
   - manifest 仍是 popup identity/placement/type 的唯一来源；不从 Popup name、文件名或首项猜 binding。

3. **批量应用是 prelude 启动前的 transaction。**
   - 先校验 input 数组、重复 `kind + name`、exact handle、kind、单行/NFC 字符串与 ImgNumber glyph；全部成功后才提交 handle override并启动 Popup。
   - 若现有 renderer 无独立 prepare seam，内部 helper 可保存各 handle 的 `text/overridden` 并在任一 setter 失败时按逆序恢复；Popup 尚不可见，恢复失败必须作为显式 internal invariant error处理，不能继续转场。
   - failure 必须断言无部分 override、无 active prelude、无 targetMode、无 Popup phase/visibility变化；已经准备好的 target resource仍按现有 cancel/release合同清理。

4. **override 只属于本次 prelude 生命周期。**
   - activation 前捕获每个目标 handle 的既有 persistent状态；Popup complete后、继续 none/Spine/video transition前恢复。
   - immediate dismiss、active prelude failure、request rejection和runtime destroy走同一个幂等 cleanup；不能把当轮金额留到下次播放，也不能抹掉调用前已有的长期本地化 override。
   - scoped input active期间，consumer仍可用现有 handle修改当前显示；同一节点随后会在 scoped cleanup 时恢复到 request 前状态。文档要求不要把“本轮临时值”和“期望跨播放持久化的值”混在同一个节点生命周期中。

5. **现有 handle 是播放中更新的正式入口。**
   - 不增加 `setPopupTextByIndex`、raw overlay、Pixi Text或 image-string renderer getter。
   - 使用 exact name优先；index仅保留 task 167 兼容，不进入新的 transition input，以免 editor reorder改变业务绑定。
   - `setText/resetText` 的 persistent语义与 award player自动 `win-amount`语义保持，209 的 scoped helper只组合这些原子能力。

6. **Crave只交付使用文档，不修改代码或资源。**
   - 新文档以下载 ZIP 的真实 v5 manifest作示例，明确 `overlay-1000`/`imgnumber-0`只是当前资源的 exact names，后续资源重导后必须重新核对 manifest。
   - 同时给出推荐的 request-scoped输入和 active player handle更新；说明 full runtime/presentation surface、ticker、input binding、await、strict failure、cleanup及用户浏览器验收。
   - 文档不臆测 Crave 文件路径/class/result字段，只用 `translate(...)`、`formatFreeGameWin(...)` 等明确的 consumer-owned占位函数。

## 5. 职责与合同

- **Popup package/player**：拥有 exact string node、字体/ImgNumber renderer、单节点 set/reset 与 start/loop/end；不拥有 game mode、翻译或金额业务。
- **Popup string transaction helper**：拥有 input 去重/selector校验、调用前快照、批量apply/rollback/restore和幂等cleanup；不播放Popup或切mode。
- **Scene Layout package runtime**：从 exact directed edge解析prelude，调用transaction后启动player，并在complete/failure/destroy边界cleanup后继续或拒绝transition。
- **Presentation surface**：透传同一request-scoped能力并保持presentation-only reel限制；不复制runtime状态机。
- **Crave**：决定FreeGame结束时机、翻译、金额来源/formatter、目标mode和await顺序；若直接handle修改则决定persistent/reset边界。
- **资源生命周期**：Popup/player/resource仍由package runtime拥有；string scope只保存逻辑handle状态，不destroy player、resource或node。
- **失败策略**：missing prelude、wrong popup type、empty/duplicate/unknown/mismatched name、非法string、missing glyph、active transition/prelude、destroyed runtime/player和cleanup invariant全部显式失败，不fallback。
- **禁止行为**：不维护第二份popup/node表，不猜唯一node，不从layer id/order/resource名推导业务name，不按text/image-string互退，不用manifest default冒充实际业务值。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/string-node-input.ts
packages/rendercore/tests/popup/string-node-input.test.ts
docs/crave-scene-layout-popup-inputs.md
tasks/209-rendercore-scene-layout-popup-string-inputs-<utctime>.md
```

若 transaction helper 放入现有 `string-node-registry.ts` 能避免重复抽象，可不新增对应源码文件；最终只能有一个批量校验/恢复 owner。

### 预计修改

```text
packages/rendercore/src/popup/{types,string-node-registry,index}.ts
packages/rendercore/src/scene-layout/{types,package-runtime,presentation-surface}.ts
packages/rendercore/tests/popup/{string-node-registry,spine-player}.test.ts
packages/rendercore/tests/scene-layout/{package-runtime-mode,package-runtime,presentation-surface}.test.ts
packages/rendercore/README.md
docs/{popup-manifest,scene-layout-manifest}.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
packages/gameframeworks/src/index.ts                 # 仅在显式类型 re-export 需要时
packages/gameframeworks/tests/**                    # 仅保护直接 public facade parity
```

### 原则上不应修改

```text
apps/**
assets/**
packages/rendercore/src/{image-string,spine,scene-layout/manifest,scene-layout/package-resource,scene-layout/production-zip}.ts
packages/{logiccore,uiframeworks,netcore,vnicore,editorresource,browserartifactio}/**
apps/{popupeditor,gamelayouteditor,gamelayoutpkgcli}/**
docs/agent-rules/editor-artifacts.md
pnpm-lock.yaml
package.json
AGENTS.md
tasks/{167,203,206,208}-*.md
/Users/zerro/Downloads/crave/**
```

执行时若需要修改Popup/Scene Layout schema、Crave/app/assets、ZIP/generator、旧handle语义、transition输入业务含义或lockfile，属于明显范围扩大，必须先说明，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线和兼容矩阵**
   - 重核 HEAD/status、两个player string handle、package runtime prelude activation/complete/fail/destroy和presentation surface。
   - 固定现有直接handle persistent override、prompt、award `win-amount`、none/Spine/video prelude以及无prelude transition回归。

2. **建立 Popup string input transaction**
   - 新增exact `kind + name + text` input类型和内部apply scope；完整预检、保存先前override状态并返回幂等restore/cleanup。
   - 覆盖多text/ImgNumber成功、重复/name-kind错、非法文本/缺glyph、第二项失败回滚、reset状态恢复、destroy与重复cleanup。

3. **接入 Scene Layout mode request**
   - 将prepare与request options职责拆开；在exact edge prelude activation前应用string scope，并让resource prepare signature忽略per-play输入。
   - 把scope挂入active prelude唯一账本；complete后先恢复再启动后续transition，cancel/failure/destroy统一恢复并reject/cleanup既有waiter。
   - 覆盖none、Spine、video二次trusted gesture、预先prepare后不同本轮strings、无prelude/wrong type、并发request和runtime destroy。

4. **同步 presentation surface 与直接 facade**
   - presentation surface只公开适用的prelude string request options并委托package runtime；不接受业务reel输入或复制Popup状态机。
   - 检查gameframeworks现有export是否自动包含新类型；只有编译证明需要时做最小re-export/fixture调整。

5. **编写 Crave 使用文档**
   - 记录下载ZIP的真实type/version/node names及与当前vendored v1资源的差异，明确资产替换不属于209。
   - 给出FreeGame结束前计算最终string、`await requestGameMode("BaseGame", { preludePopupStrings })`、输入事件/ticker和失败处理示例。
   - 给出 `getSpinePopup("congratulations")` exact handle在播放前/播放中set、需要时reset的示例，并解释persistent与per-play scope不可混淆。
   - 列出Crave侧typecheck/test/定向搜索和用户浏览器验收，不声称本仓修改或验证了Crave。

6. **同步public文档、规则并收尾**
   - 更新RenderCore README、Popup/Scene Layout文档与最小稳定规则，说明最终string归consumer、per-play scope归runtime、manifest仍是identity来源。
   - 运行第8节L2定向验收，复核diff/旧API兼容并生成UTC中文执行报告；报告明确浏览器验收待用户完成。

## 8. 测试与验收

### 测试原则

- shared fixture自包含，不读取下载ZIP或`assets/crave`；真实资源仅作为人工验收输入。
- transaction测试必须观察public handle和player/runtime snapshot，同时断言失败前后全部node值、`overridden`、Popup phase、mode snapshot一致。
- lifecycle覆盖prelude complete、direct dismiss、player update异常、target transition异常、第二次request和runtime destroy；每条路径restore恰好一次。
- `prepareGameModeTransition()`缓存测试证明不同本轮string不重建resource/reel/player；request activation仍使用当次输入。
- video测试保留trusted gesture同步`play()`与Popup完成后第二次gesture边界，不因string输入提前播放。
- 已有单handle播放中set/reset行为只做直接回归，不重测Popup Editor或ImgNumber完整渲染算法。

### 验收级别

采用 `L2`：任务增加RenderCore跨Popup/Scene Layout的public request contract，并影响gameframeworks/presentation surface直接consumer；不修改schema、正式ZIP、app、资产、根工具链或lockfile，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --dir packages/rendercore exec vitest run tests/popup/string-node-input.test.ts tests/popup/string-node-registry.test.ts tests/popup/spine-player.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts tests/scene-layout/presentation-surface.test.ts
pnpm --dir packages/rendercore exec tsc -p tsconfig.build.json --noEmit
pnpm --dir packages/rendercore build
pnpm --dir packages/gameframeworks typecheck
git diff --check
```

当前基线的 `pnpm --dir packages/rendercore typecheck` 受任务207既有 `award-player.test.ts` readonly转换错误影响；执行会话先确认该单一基线问题，使用production `tsconfig.build.json`证明本任务源码。若基线问题已消失，再补跑完整RenderCore typecheck并在报告记录，不为通过本任务顺手修改无关测试。

### 人工验收

浏览器验收由用户执行；实现会话不启动浏览器、不代验、不标记通过。用户使用最终Gamelayout包检查：

1. FreeGame退出时，v5 `congratulations` Popup仍在source FreeGame画面上先完整播放，随后才开始回BaseGame transition。
2. `overlay-1000`显示当前语言翻译，`imgnumber-0`显示本轮真实最终赢分；不同金额连续两次播放不残留上次string。
3. start/loop/end、点击/键盘、横竖屏placement和backdrop正常；播放中handle更新立即可见。
4. 非法翻译、缺glyph或错误exact name显式报错，Popup不闪现、mode不切换、下次合法请求可继续。
5. immediate dismiss、切场景失败或runtime销毁后无残留Popup、string override、listener或pending Promise。

### 独立验收建议

`必须`。任务涉及public contract、跨模块异步prelude transaction和failure/destroy restore。独立复验重点：

```bash
pnpm --dir packages/rendercore exec vitest run tests/popup/string-node-input.test.ts tests/scene-layout/package-runtime-mode.test.ts tests/scene-layout/package-runtime-video.test.ts
pnpm --dir packages/rendercore exec tsc -p tsconfig.build.json --noEmit
pnpm --dir packages/gameframeworks typecheck
```

独立自动复验不替代用户浏览器验收。

## 9. 环境与依赖

- 使用仓库要求的Node.js 24和pnpm；shell没有Node时加载`/Users/zerro/.nvm/nvm.sh`后`nvm use 24`。
- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- 复用现有Popup string registry、image-string validation、Scene Layout prelude/player和manual ticker；不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- 本任务不修改YAML、manifest、assets map、ZIP、生成器输入或生成物，不运行无关generator/checker。
- 新增`docs/crave-scene-layout-popup-inputs.md`作为canonical Crave说明；`docs/crave-task203-manual-migration.md`只在需要时增加入口链接，不复制全文或改写历史合同。
- 更新`packages/rendercore/README.md`、`docs/popup-manifest.md`和`docs/scene-layout-manifest.md`，区分player persistent handle与transition per-play scope。
- 只向`docs/agent-rules/shared-game-runtime.md`和`docs/agent-rules/scene-layout.md`补充稳定职责边界；不修改根`AGENTS.md`或editor规则。
- exact Crave node name、资源版本差异和执行证据只放使用文档/报告，不写入长期规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/209-rendercore-scene-layout-popup-string-inputs-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终API、实际文件、transaction/cleanup决策、自动验收、Crave文档路径、用户浏览器待验项和剩余风险。

## 12. 风险、假设与待确认

### 风险

- scoped restore若分散在prelude complete、failure、dismiss和destroy分支，容易遗漏或重复；实现必须把scope放入active prelude唯一账本并统一幂等cleanup。
- direct handle persistent修改与同节点per-play input叠加时，cleanup语义容易误解；合同必须恢复request前状态，文档明确两种用法的边界。
- 当前下载ZIP与`assets/crave` vendored nested manifest版本/节点不同；自动化不能证明后续资产替换正确，用户浏览器验收必须基于最终包。
- manual ImgNumber接受最终string；formatter输出的币种符号、小数点或分组字符若不在glyph closure中会严格失败，这是资源/业务输入问题，不能加字体或空白fallback。

### 假设

- 最终Gamelayout会以普通Spine Popup身份vendor下载目录v5资源，并保留或显式更新exact node names；209不负责资产导入。
- Crave在发起FreeGame到BaseGame request前已能得到最终翻译string和最终赢分string，并持续调用runtime `update(deltaSeconds)`及现有Popup input binding。
- 本轮临时string应在prelude结束后恢复；长期语言切换若需跨多次播放保持，继续使用player exact handle并由Crave显式reset/重设。

### 待确认

- 无。ZIP type、节点name、当前transition binding和现有public handle均已从仓库/只读资源确认；浏览器视觉结果按用户要求留在实现后的人工验收。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、prepare/request职责和Popup ownership符合计划。
- [ ] 多节点输入在显示/切mode前完整预检，失败无部分mutation。
- [ ] complete/failure/dismiss/destroy均恢复request前handle状态且cleanup一次。
- [ ] 既有direct handle、award `win-amount`、prompt及none/Spine/video transition兼容。
- [ ] Crave使用文档覆盖v5真实节点、per-play输入、播放中更新、await和strict failure。
- [ ] apps、assets、下载ZIP、manifest/schema和lockfile均未修改。
- [ ] 指定L2自动化与独立复验通过。
- [ ] 浏览器验收明确由用户执行，报告未声称代验。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根`AGENTS.md`、本计划列出的领域规则和本计划；
2. 重核Git基线、现有player handle和prelude lifecycle，先保护旧API再新增scope；
3. 只修改RenderCore、必要gameframeworks出口和文档，不碰Crave/apps/assets/ZIP/schema；
4. 小幅文件拆分或命名适配写入报告，任何业务输入、schema、资产或旧API范围扩大先停止说明；
5. 运行计划规定的L2自动验收与独立复验，不执行或代替用户浏览器验收；
6. 完成后生成UTC中文执行报告，明确最终Gamelayout资产替换与浏览器检查仍由用户完成；
7. 除非用户明确要求，不commit、不push、不创建PR。
