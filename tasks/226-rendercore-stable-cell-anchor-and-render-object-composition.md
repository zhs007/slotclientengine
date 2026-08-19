# 226 rendercore-stable-cell-anchor-and-render-object-composition 任务计划

## 1. 目标与完成定义

### 目标

在 `packages/rendercore` 增量补齐 production game runtime 可手动编排的第一层能力：standard `ReelSpin`、新
`CellSpin` 与 legacy grid-cell 都能取得不依赖当前 occurrence 的稳定 cell 坐标；有效 RenderCore
层级之间在 rolling/settle 期间仍可转换 Anchor；`RenderObject.play()` 可显式选择循环；程序创建的
ImgNumber `RenderObject` 可绑定到程序 Spine `RenderObject` 的 exact slot；settled Symbol 与普通
`RenderObject` 可受控切换到其它 opaque 渲染层。

### 完成定义

- [ ] 三种 reel surface 对同一合法 `{x,y}` 提供统一的 cell-center `RenderAnchor`；落停后解析结果与该格
      `SymbolHandle` 中心一致，hole 也有 cell anchor。
- [ ] cell/layer Anchor 在 targetless、rolling、部分落停和 settle 期间可转换到任一仍有效的
      `RenderObjectLayer`/area local point，不依赖 rolling Sprite 或临时 SymbolPlayer。
- [ ] `RenderObject.play(name?, { loop })` 默认保持非循环；显式循环由 Spine/VNI adapter 执行并有明确的
      Promise、abort、stop、supersede 和 destroy 语义。
- [ ] detached owned ImgNumber 可按 exact slot 绑定到 owned Spine，跟随 slot transform，同时保留自身局部
      offset/anchor；解绑和任一对象销毁不泄漏、不双重 destroy。
- [ ] settled borrowed Symbol 与已挂载普通 `RenderObject` 可原子切换到另一个 opaque layer，并保持当前
      视觉原点；Symbol 在 spin/replacement/destroy 前由 area 自动收回。
- [ ] 不开放 raw Pixi `Container`、Matrix、world coordinate、symbols 主层或 Spine player；不放宽
      `getSymbol()` 的 landed-only、exact occurrence 和 stale failure 合同。
- [ ] game runtime public core exports、中文可复制使用示例、README、定向测试、最小领域规则和 UTC
      执行报告同步。

## 2. 范围

### 包含

- `SymbolArea`/area façade 的 stable cell-center Anchor 与 area-local resolve 能力。
- `RenderReelSet`、`RenderCellSpin`、`RenderGridCellReelSet` 对同一合同的实现；legacy grid-cell 只同步基础
  能力，不扩展 plan surface。
- `RenderObjectPlayOptions.loop`，以及 Scene Layout runtime resource factory 创建的 Spine/VNI
  RenderObject adapter。
- 复用 official Spine player 既有 exact slot attachment owner，并为 game runtime 提供 RenderObject 间的
  opaque attachment façade。
- registered `RenderObjectLayer` 间的原子 reparent，以及 area-owned Symbol 的临时 layer override/restore。
- game runtime lifecycle、strict failure、public core export、README、使用指南与包内自包含测试；不增加
  Editor/authoring API。

### 不包含

- 不允许 rolling 中调用 `getSymbol()`，不让 cell anchor 伪装成当前 Symbol，也不缓存/返回 rolling
  occurrence、Sprite、pool player 或 visual bounds。
- 不公开 world `x/y`、Pixi `Container`/Matrix、任意 parent path、symbols 主层 getter 或直接 `zIndex`
  mutation。
- 不修改 Scene Layout/Symbol/Popup manifest、资源 closure、Editor、YAML、生成物或游戏 app；slot 名由
  game runtime 调用方按已知 Spine 资源提供，不写入第二份配置表。
- 不让 Symbol state 绕过 manifest 的 once/stable playback 定义；`SymbolHandle.play()` 不把 generic
  `loop` 变成 state fallback。
- 不支持 slot 模糊匹配、唯一项猜测、缺 slot 时挂 root、跨 Spine 偷换 owner，或绑定 VNI/image
  作为 Spine。
- 不把本任务能力加入 Scene Layout Editor inspector、authoring preview/draft、standalone viewer 或 editor
  package export；Editor 若以后需要必须另立 consumer 需求。
- 不实现任意 display-tree 重排、同层细粒度 child index 编辑、跨 renderer/DOM bridge 或 gameplay layer
  plan/DSL。
- 不新增依赖，不修改 lockfile、LogicCore、GameFrameworks 业务编排或 legacy grid-cell plan DTO。

## 3. 制定计划时的基线

```text
UTC: 2026-08-19T03:14:11Z
HEAD: ada0ebd3e848ff6526e2909d0f7ef66fa69b9be7
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout}.md`；目标目录无子级 `AGENTS.md`。
- `SymbolHandle.getAnchor()` 当前捕获 exact occurrence；standard/cell/grid-cell 在目标格尚未落地时都会拒绝
  `getSymbol()`，旧 handle 在 spin/replacement 后 stale。该合同正确，不能用放宽校验解决 cell 坐标需求。
- `ReelRender`/`CellRender` 目前只有 `add/remove`；稳定格子几何已分别存在于 layout、runtime cell root 和
  grid-cell geometry 中，但没有统一 `SymbolArea.getCellAnchor()` public contract。
- `RenderAnchor` 已通过 owner→global→target local 延迟解析；失败主要来自调用方只能持有 occurrence anchor。
  `RenderObjectLayer` 已有 `getAnchor/resolveAnchor/addAt`，但 attached object 必须先手工 remove，且各 layer
  的 mounted ledger 无法原子协同 reparent。
- `RenderObjectPlayOptions` 当前只有 `signal`。Scene Layout program Spine/VNI factory 分别写死
  `loop: false`/`setLoop(false)`，pending playback 只处理一次完成、abort、stop、supersede 和 destroy。
- official Spine player 已有 strict `attachSlotObject/removeSlotObject` 和保留 child local transform 的
  wrapper；当前缺口只是 game runtime 的 opaque RenderObject attachment capability。factory 返回 generic
  `RenderObject`，不能让游戏取得 player。
- area 显示顺序为 `bottom < symbols < top < win`；symbols 主层仍是内部 owner。普通 layer 与
  SymbolHandle 都缺少受控 layer-switch transaction。
- 相关测试入口为 `tests/{presentation,reel,scene-layout,spine,symbol}`；shared package fixture 必须继续自包含，
  不读取任一游戏 `assets/`。

## 4. 需求解释与技术决策

### 需求解释

- “具体 cell 坐标”定义为 area local 中该逻辑可见格的稳定中心，不是当前贴图/Spine bounds、rolling
  strip slot 或 server stop。落停后它与当前 Symbol 中心重合；转动时仍代表最终网格位置。
- “任何时候转换”指 source/target runtime 与 layer 仍有效时，包括 idle、targetless、rolling、部分落停和
  settle；destroyed runtime、foreign anchor、stale occurrence、active lease 仍必须显式失败。
- 循环是本次 `play()` 的 presentation policy，不写回 manifest。默认 `loop: false` 保持兼容。
- “绑定到 Spine”按 exact slot name 实现，不把 root 当 fallback。ImgNumber 仍由创建者拥有，Spine 只
  拥有 attachment 生命周期。
- “切换层”是受控 reparent，不是向游戏公开 display tree。普通对象在 registered opaque layers 间移动；
  borrowed Symbol 需要 area 参与，确保下一次 spin/mutation 能回收 occurrence。

### 关键决策

1. **新增稳定 cell Anchor，不放宽 Symbol occurrence。**
   - 在三种 `SymbolArea` surface 上提供统一 `getCellAnchor(position)`；Anchor 由 area owner 与稳定 cell
     geometry 解析，不读取当前 symbol view。
   - 数值坐标仍通过 `area.resolveAnchor(cellAnchor)` 或
     `targetLayer.resolveAnchor(cellAnchor)` 获得，结果明确属于 target local space。
   - position 必须是范围内整数；hole 合法。landing 后用测试证明 cell 与 Symbol anchor 同点。

2. **Anchor 延迟读取 current transform。**
   - Anchor 保存 owner/position identity，不缓存跨 mode、placement 或 parent transform 的全局点。
   - rolling/settle 只改变 motion owner，不使 stable grid/attachment layer 失效；低层转换继续走唯一
     `resolveRenderAnchor()`，不增加 world-coordinate API 或另一套 matrix helper。

3. **循环播放以首个完整循环作为 await 边界。**
   - `loop` 省略/`false`：保持现有 once completion 后 resolve/reset 行为。
   - `loop: true`：Spine/VNI 进入真实 loop；Promise 在第一个完整 loop edge resolve，播放继续，直到
     `stop()`、下一次 `play()`、attachment owner cleanup 或 destroy。
   - 首个 loop edge 前 abort/stop/supersede/destroy 拒绝 Promise并清理；之后 `stop()` 只停止后台循环。
     非 boolean、adapter 不支持的 loop 或 Symbol state 语义冲突显式失败。

4. **用 typed opaque slot attachment 连接两个 RenderObject。**
   - 增加 narrow Spine-slot attachment capability/helper；public 输入仍是 Spine `RenderObject`、child
     `RenderObject` 和 exact slot name，不返回 player/Container。
   - factory 在内部 adapter 登记既有 `RendercoreSpineSlotPlayer` capability；非 Spine、
     foreign/destroyed/已挂载 child、unknown slot
     在 mutation 前失败。
   - 直接复用 official player 的 slot wrapper 跟随与 strict ownership，并保留 ImgNumber 自身 local
     anchor/offset。返回显式 detach handle；
     重绑先完整 preflight，Spine/child/factory destroy 或失败都解除关系但不窃取 child ownership。

5. **layer switch 是原子 ownership transaction。**
   - registered `RenderObjectLayer` 共享内部 attachment ledger，提供 additive move/reparent façade；目标层先解析
     object origin Anchor、order 与 owner，再一次提交 parent、target-local position 和 ledger。
   - 目标提交失败恢复 source parent/position/order/ledger；成功保持视觉原点。既有 `add/remove/addAt` 保持兼容。
   - settled borrowed Symbol 通过 area-owned override 进入 public `bottom/top/win` 或其它合法 opaque target；
     返回 restore/dispose capability，重复切层复用同一记录。spin、replacement、release、presentation interrupt
     或 destroy 前自动 restore/close，不 destroy borrowed occurrence。
   - symbols 主层只作为 restore 的内部 owner，不作为 public `RenderObjectLayer` 暴露；普通对象若需要
     reel/cell-space 继续使用现有 `getReel()/getCell()` attachment surface。

6. **文档面向手动 consumer。**
   - 提供 game runtime 可复制示例：三种 spin 的 cell anchor、rolling 中 layer-local resolve、once/loop
     play、ImgNumber→Spine slot bind/detach、RenderObject reparent、Symbol 临时提到 win/top 并恢复。
   - 明确每个返回值的坐标空间、borrowed/owned、Promise 边界、自动 cleanup 和 strict failure；不要求用户
     阅读任务对话或内部源码。

## 5. 职责与合同

- **SymbolArea/reel owner**：拥有稳定 cell geometry、exact occurrence、spin interruption 和 borrowed Symbol
  layer override cleanup；不把 rolling registry 或主 symbols layer暴露给游戏。
- **RenderAnchor/RenderObjectLayer**：拥有 current-transform 坐标解析、registered attachment ledger 与原子
  reparent；数值只属于显式 target local space。
- **RenderObject adapter**：声明是否支持 playback、loop 和 Spine slot attachment；generic public object 不靠
  kind 字符串或 duck typing 猜能力。
- **Spine runtime**：严格验证 animation/slot、推进 loop edge、委托唯一 slot wrapper 并清理 attachment；不拥有
  ImgNumber resource/text，也不读取业务名。
- **game runtime caller**：拥有 exact resource/animation/slot/layer 选择、ImgNumber 文本、局部 offset、何时
  stop/detach/restore；owned object 最终仍由 caller destroy。
- **失败策略**：非法 position/order/loop、foreign/stale/destroyed object、unknown slot、重复 attachment、active
  lease、unregistered source layer 或 target失效均在可见 mutation 前失败；无 root/首项 fallback。
- **生命周期**：attach/reparent 先 prepare 后 commit；失败恢复 source。runtime cleanup 只 detach/restore，绝不
  destroy borrowed Symbol，也不替 caller destroy owned child。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/presentation/spine-slot-attachment.ts
packages/rendercore/tests/presentation/spine-slot-attachment.test.ts
docs/rendercore-cell-anchor-and-render-object-composition-guide.md
tasks/226-rendercore-stable-cell-anchor-and-render-object-composition-<utctime>.md
```

若 attachment 最终更适合收敛进现有 `render-object.ts`，可不新增源文件；不得复制第二套 adapter registry。

### 预计修改

```text
packages/rendercore/src/presentation/{index,render-anchor,render-object,render-object-layer,imgnumber-render-object}.ts
packages/rendercore/src/scene-layout/render-object-factory.ts
packages/rendercore/src/reel/{symbol-area,reel-area,reel-spin,render-reel-set,render-cell-spin,render-grid-cell-reel-set}.ts
packages/rendercore/src/symbol/symbol-handle.ts
packages/rendercore/tests/presentation/{render-object,render-object-layer,imgnumber-render-object}.test.ts
packages/rendercore/tests/reel/{render-reel-spin,render-cell-spin,render-grid-cell-reel-set}.test.ts
packages/rendercore/tests/scene-layout/render-object-factory.test.ts
packages/rendercore/README.md
docs/rendercore-layer-symbol-area-render-object-coordinate-guide.md
docs/agent-rules/shared-game-runtime.md
```

按实际已有测试文件归位；不为凑清单创建重复 fixture。

### 原则上不应修改

```text
packages/{logiccore,uiframeworks,vnicore,audiocore,editorresource,browserartifactio}/**
packages/rendercore/src/{popup,background,viewport,image-string}/**
packages/rendercore/src/scene-layout/{data,manifest,resource,production-zip}.ts
packages/gameframeworks/**
apps/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若实现需要 manifest/schema 升版、公开 symbols layer/raw display tree、改变 `getSymbol()` rolling 合同、修改
game app 或新增依赖，属于明显范围扩大，必须先说明，不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 public consumer**
   - 重核 HEAD/status、三种 area façade、presentation adapter registry、factory fake player 和 exports。
   - 搜索 `SymbolArea`/`RenderObjectPlayOptions`/`RenderObjectLayer` 的直接结构型 fake，判断仓库变化是小幅适配
     还是需要重新规划；保留无关修改。

2. **实现 stable cell Anchor**
   - 在 common contract 和 standard/CellSpin/grid-cell owner 接入同名能力，复用各自 authoritative cell
     geometry，统一 center、hole、range 与 destroy 校验。
   - 补 idle/rolling/partial-landed/settled、transformed parent、hole 和 stale/foreign failure 测试；继续证明
     rolling 中 `getSymbol()` 失败。

3. **扩展 RenderObject playback**
   - 给 play options 增加 strict loop policy，将 Spine `loopCompleted` 和 VNI first-complete edge接入同一
     pending playback owner。
   - 覆盖 once 兼容、首圈 resolve 后继续、stop、abort、supersede、destroy、非法/unsupported loop；不改变
     Symbol manifest state playback。

4. **实现 Spine slot attachment**
   - 复用 official Spine player 的 exact slot validation/follow primitive，在 RenderObject adapter 登记 opaque
     capability，并由 game runtime factory 创建的 Spine object 暴露 narrow helper；不新增 Editor façade。
   - 验证 ImgNumber dynamic text/anchor、local offset、rebind、detach、双方 destroy、unknown slot、occupied
     child 和 init failure rollback。

5. **实现 RenderObject/Symbol layer switch**
   - 把 layer mounted ledger 收敛成可协同的原子 reparent；保留视觉原点、order 和失败 rollback。
   - 给 area exact Symbol 增加临时 layer override/restore，并串入 spin、replacement、release、interrupt、destroy
     cleanup；验证 borrowed ownership、stale handle、跨 transform 与重复切层。

6. **同步 exports、文档与长期合同**
   - 更新 root/presentation/reel/symbol 必需出口，README 和两份指南；示例只使用 public API。
   - 最小更新 shared runtime rule，记录 stable cell vs occurrence、loop Promise、slot attachment 和 Symbol
     layer cleanup，不把 task-specific 文件表写入规则。

7. **定向验收与报告**
   - 运行第 8 节命令；失败先最小化到对应 presentation/reel/factory 测试，不立即扩为整仓扫描。
   - 生成 UTC 中文执行报告，列出未完成的真实 Spine/浏览器人工验收。

## 8. 测试与验收

### 测试原则

- cell anchor 测试同时覆盖三种实现和 spin 各阶段，比较 target-local 数值，不读取 private Container。
- playback/attachment 使用 package 内 deterministic fake/manual player，并复用既有 official Spine slot
  attachment测试事实；新增测试不读取游戏 assets。
- reparent/override 覆盖成功、preflight failure、commit rollback、spin cleanup、replacement、destroy 和 owned/
  borrowed 边界。
- 既有 once play、`add/remove/addAt`、landed Symbol anchor、plan compatibility 和 Scene Layout factory 行为不得
  为新测试而改变。

### 验收级别

`L2`：修改 `@slotclientengine/rendercore` 跨 presentation/reel/scene-layout 的 public contract 与直接 factory
consumer，但不改 schema、生成物、依赖或游戏 app。使用 rendercore 全包验证加 GameFrameworks 直接消费者
typecheck，不运行整仓命令。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore format:check
git diff --check
```

### 人工验收

用户已明确不要求浏览器或真实资源人工验收。本任务以包内 deterministic 测试、typecheck、build 和可直接
使用的 game runtime API 文档作为交付证据；执行报告不得把未运行的浏览器检查写成已通过。

### 独立验收建议

`建议`。重点复验跨层原子 rollback、borrowed Symbol 在 spin/replacement 的 cleanup，以及 Spine slot child 与
loop playback 在 destroy/abort 下的 ownership；不涉及 credential、服务器数据、schema、ZIP 或正式生成物。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell 无 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 不新增依赖、不修改 lockfile。依赖缺失时才执行 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败
  后才设置仓库约定代理并重试原命令。

## 10. 生成物、文档与规则

- 本任务无 YAML、manifest 版本或代码生成物变化；不得手改 `dist/`。
- 新指南是 production game runtime 手动使用的 canonical 入口；现有 coordinate guide 保持空间/Anchor
  权威定义并交叉链接，README 提供最短选择表和示例入口，避免维护两份冲突语义。
- 只更新 `docs/agent-rules/shared-game-runtime.md` 中稳定跨任务的 lifecycle/opaque boundary；不修改根
  `AGENTS.md` 或 Scene Layout schema规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/226-rendercore-stable-cell-anchor-and-render-object-composition-<utctime>.md
```

报告简要记录最终 API/文件、关键偏差、实际命令与结果、人工验收状态、剩余风险；不收集无关 coverage、
完整历史矩阵或整仓统计。

## 12. 风险、假设与待确认

### 风险

- Pixi/Spine slot attachment 的更新边界必须与 host `update(deltaSeconds)` 同帧一致；错误的 update 顺序
  可能让 attachment 落后一帧，需复用 official player 测试事实和真实游戏 runtime 观察。
- Symbol 临时离开内部 symbols parent 会与 mask、pool、replacement、spin cleanup 交叉；必须由 area owner
  记录并自动 restore，不能仅用通用 layer map 管理。
- loop Promise resolve 后仍有后台 playback；若文档没有明确要求 `stop()`，consumer 容易误以为 resolve
  等于停止。
- legacy grid-cell 内部已有 `getCell(x,y)` 私有命名；实现统一 public surface 时可能需要内部重命名，但不能
  改变 legacy plan 或 runtime 行为。

### 假设

- “坐标”默认指逻辑 cell center；其它对齐点可由 cell-local offset/Anchor 组合，任务不新增完整 geometry
  snapshot。
- 程序 Spine 与 ImgNumber 均由同一 active RenderCore runtime/factory 创建；跨 runtime 绑定显式失败。
- `loop: true` 的首圈 resolve、随后后台继续符合手动编排预期；需要等待整个无限循环不是可完成 Promise
  合同，停止由 `stop()`/abort/cleanup 表达。
- Symbol layer switch 只针对 settled exact occurrence；rolling 内容只能使用 cell/reel stable attachment
  surface，不提供 rolling Symbol façade。
