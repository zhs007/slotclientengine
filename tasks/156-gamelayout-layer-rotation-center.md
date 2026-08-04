# 156 gamelayout-layer-rotation-center 任务计划

## 1. 目标与完成定义

### 目标

为 Game Layout Editor 的 scene node placement 增加按角度配置的旋转与归一化旋转中心，
支持 `90`、`180`、负数等有限角度，并由 rendercore 的 production scene-layout runtime
统一应用。编辑器预览、直接 manifest runtime、mapped/legacy ZIP、优化后 ZIP 和
presentation surface 必须消费同一合同；旧 layout 缺少新字段时保持原有画面。

### 完成定义

- [ ] 普通图层和背景节点的每个 active variant 都可编辑有限角度 `rotation`；正数、负数、
      `90`、`180` 和大于一圈的值不被静默截断或归一化，preview 按度数实时旋转。
- [ ] 每个 node placement 保存 `center: { x, y }`，两轴为 `[0, 1]` 内有限数，默认
      `0.5 / 0.5`；中心改变时旋转支点可观察地改变，`x/y/scale` 仍保持既有 authored
      placement 语义。Spine 的 `0.5 / 0.5` 精确映射到其 authored 原点 `(0, 0)`。
- [ ] image、official Spine、runtime VNI 和 image-string scene node 使用 rendercore
      同一旋转实现；background 作为稳定 scene node 同样生效，不在 editor 或游戏 app
      复制资源类型分支。
- [ ] 旧 manifest/ZIP 缺少 `rotation` 或 `center` 时规范化为 `rotation: 0`、
      `center: { x: 0.5, y: 0.5 }`，加载后的像素位置、scale、mode/variant 可见性和播放
      状态不变；重新导出后写出 canonical 字段。
- [ ] node 旋转和中心修改属于 geometry-only 更新：复用已加载 texture、Spine/VNI player、
      当前 mode、reel scene 和 popup，不触发 structural rebuild 或重新抽样。
- [ ] editor ZIP 导入/导出与 gamelayoutpkgcli 优化、引用改写后完整保留角度和中心；非法字段、
      `NaN`/Infinity、越界中心或 unknown key 在画面 mutation 前显式失败。
- [ ] 完成 L2 定向自动化与任务 156 UTC 中文执行报告；浏览器视觉验收由用户执行，执行报告
      只记录用户反馈或标为待验收，不以 happy-dom、fake runtime 或单测冒充。

## 2. 范围

### 包含

- `SceneLayoutManifestV1.nodes[*].placements.<variant>` 的 rotation/center public contract、
  strict parser、old-data defaults、geometry-compatible 判定和 public type。
- rendercore scene-layout node transform：归一化 center 到 node-local pivot 的映射、
  degree-to-Pixi matrix、scale/position 补偿、geometry hot update，以及
  image/Spine/VNI/image-string 一致行为。
- maximized-focus / orientation-focus、`top-left` / `center` 两种全局坐标类型下的 node
  placement；坐标类型切换前后保持同一视觉 transform。
- gamelayouteditor 的 draft/default/clone/import/projection、隐藏 variant placement cache、
  普通图层及背景 Inspector 字段、preview 与选中图层 outline。
- mapped ZIP、合法 legacy direct-path ZIP、重新导出和 gamelayoutpkgcli WebP/reference rewrite
  的字段保持测试。
- rendercore/editor 文档和最小 scene-layout 领域规则同步。

### 不包含

- main reel 仍只支持 `x/y`，不增加整体 scale、rotation 或 center。
- award-celebration Popup placement 与 Spine/video transition overlay 不增加旋转；它们虽然
  当前与 node 共用部分 placement 结构，但本任务会拆清类型/parser 边界，不允许接受后忽略。
- 不旋转 focus rect、frame focus、reel/cell guide、video blackout 或 viewport/container。
- 不增加拖拽旋转手柄、角度吸附、动画关键帧、非均匀 scale、skew、3D transform 或按 mode
  额外覆写 placement。
- 不从 atlas texture 尺寸、文件名或 manifest 外业务表猜旋转配置；不修改 Symbols/Popup/VNI
  owner schema，不改游戏 app、资源包、根工具链、依赖或 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-03T13:46:22Z
HEAD: ab9cec204ea8d525f371ccceb659d65b2b2a91d3
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/templates/task-plan.md
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
```

当前代码基线：

- `packages/rendercore/src/scene-layout/types.ts` 的 `SceneLayoutNodePlacement` 只有必填
  `x/y/scale`，并同时被 node、popup 和 Spine transition 引用；若直接扩字段会意外扩大三类
  schema，实施时必须拆出 node transform contract 或为非 node placement 保持精确窄类型。
- `parseNodePlacement()` 只接受 `x/y/scale`，并被 node、popup、transition parser 共用；
  `parseSceneLayoutManifest()` 拒绝 unknown key，所以现有 ZIP 不能携带 rotation/center。
- `DefaultSceneLayoutRuntime.applySnapshot()` 只对 node slot 设置 position/scale；
  `applyGeometryManifest()` 已支持 geometry-only 原子替换并复用 player，是旋转热更新的共同入口。
- runtime 的每个 node 已有稳定 outer `slot` 以及 `before/named/after` 三层；production
  `SceneLayoutPackageRuntime`、`SceneLayoutPresentationSurface`、editor `LayoutPreview` 和其它
  ZIP consumer 最终都委托该 runtime 渲染 scene node，不需要 app 私有旋转分支。
- 每个 runtime node 已经由同一 outer `slot` 持有 position/scale；rotation/pivot 应继续作用于
  这个 node matrix。image 有 manifest `size`，VNI 有 `project.stage`，image-string 有 authored
  anchor/layout；Spine 自身 authored 原点就是默认旋转中心，因此 `center: 0.5/0.5` 必须映射
  为 local `(0,0)`，不能读取 skeleton bounds 或 atlas texture 尺寸重新猜一个“视觉中心”。
- `assertSceneLayoutGeometryCompatible()` 已从 immutable structure 中排除 node placements，
  因而新 transform 字段只要留在 placement 内即可继续走 geometry update。
- editor 的 `EditorNodeDraft.placements` 与 `hiddenPlacements`、所有 node/background 初值、
  clone/import/export projection 目前都只复制 `x/y/scale`；`layout-workspace.ts` 也只渲染这
  三个 number input，`app-shell.ts` 的通用 `setPath()` 可更新已存在的嵌套数值。
- `convertProjectCoordinateOrigin()` 目前按未旋转矩形换算 image/VNI 的 top-left/center；
  增加 pivot 后必须用同一 transform helper 换算，否则切换坐标类型会使旋转节点跳位。
- `layout-preview.ts` 的选中 outline 读取 runtime `getNode(id).getBounds()`，正常情况下会自动
  包含旋转后的 axis-aligned bounds，但仍需回归裁切和 geometry hot update。
- editor ZIP rewrite 与 `gamelayoutpkgcli/reference-rewriter.ts` 均通过 object spread 保留
  placement，理论上无需新增资源改写算法；需要 round-trip 测试防止 parse/serialize 重建时
  丢字段。

## 4. 需求解释与技术决策

### 需求解释

- “传角度”解释为 manifest/editor 直接保存度数，不要求用户传弧度；rendercore 是唯一把
  degree 转为 Pixi transform 的位置。
- `rotation` 接受任意有限数，包括负值和大于 `360` 的值；canonical JSON 保留输入值，
  不做 `% 360`，避免 round-trip 暗改配置。
- `center.x/y` 是 node-local 旋转中心的归一化配置：`0/0`、`0.5/0.5`、`1/1` 分别表达
  左上、中心、右下语义；只接受 `[0, 1]`，UI 不 clamp，越界直接报错。rendercore 按资源
  authored local coordinate 映射 pivot，Spine 的 `0.5/0.5` 固定为 authored `(0,0)`。
- 新能力覆盖 manifest 的 scene node，因此普通图层与背景都支持；Popup、transition 和 reel
  不是本需求中的“图层属性”，保持现状。
- “兼容老数据”包括 parser、editor ZIP import、direct/mapped package runtime 和优化器；
  不是只让 TypeScript optional，也不是捕获错误后回退无旋转。

### 关键决策

1. **在 scene-layout v1 扩展 node placement，并输出 canonical 默认值**
   - node placement canonical 形态为 `x/y/scale/rotation/center`；parser 对缺少后两项的 v1
     输入补 `0` 与 `{0.5, 0.5}`，对部分 center、非有限数、越界值和 unknown key 显式失败。
   - 旧包在 `rotation=0` 时不应用 pivot 位移，因此视觉逐像素保持；editor 再导出会明确写出
     默认值，后续 consumer 不依赖隐式 UI state。
   - popup/transition 使用独立的 `x/y/scale` strict type/parser，避免 public type 扩展造成
     “可配置但 runtime 忽略”的假能力。

2. **由 rendercore 统一解析 node-local pivot**
   - 抽出资源局部坐标适配器，把 normalized center 映射为 node-local pivot；该适配只使用
     manifest/owner 已有的 authored geometry 与 origin，不改变资源 identity、art size 或 placement。
   - image 使用显式 `size`，VNI 使用 `project.stage`，image-string 复用其 authored anchor/layout；
     Spine 直接以 authored origin 为中心基准，`0.5/0.5 -> (0,0)`，不得从 skeleton bounds、
     atlas texture 或当前动画帧另算中心。
   - pivot 只由 placement center 和不变的 authored local contract 决定，不随 Spine/VNI 帧、
     image-string update 或后续 `before/after` attachment 漂移。

3. **用 outer slot 的统一二维 transform 保留 authored x/y**
   - rendercore helper 先按现有 coordinate origin 解析 authored base position，再由 scale、
     node-local pivot 和 rotation 计算 Pixi position/pivot/angle；`rotation=0` 时 local origin 在屏幕上
     仍落在旧实现的位置。
   - `before/named/after` 与借出的 named node 一起跟随 outer slot transform，consumer 不需操作
     内部 display tree；art mask、z-order、visibility 和 node identity 不变。
   - `applyGeometryManifest()` 复用同一 helper，保证 angle/center/scale/x/y 的任意组合热更新
     不重建资源或 player。

4. **坐标类型转换复用 transform 数学，不维护第二套公式**
   - 抽取纯函数，根据 resource/reference geometry、旧/新 coordinate origin 和完整 placement
     求等价 x/y；`rotation/center/scale` 原值保留。
   - editor 的 visible/hidden placement 一起转换；maximized/orientation、image/VNI 与 authored
     origin 型 Spine/image-string 均用测试证明切换前后 world transform 等价。

5. **editor draft 始终持有完整 transform**
   - 新建、绑定背景、添加普通图层、创建 mode 背景、恢复 variant visibility 统一使用
     `rotation: 0, center: {x: 0.5, y: 0.5}`，不在 UI 渲染时临时补对象。
   - ordinary layer 与 background Inspector 显示 angle、center x、center y；angle step 为 `1`，
     center step 为 `0.01` 且展示 `[0,1]` 约束。输入交给 transaction + strict manifest validation，
     非法值不 commit。
   - clone、resource rebind、hide/show、mode/variant 切换和 ZIP import 保留完整 placement；替换
     资源时保留 normalized center，并按新资源的 authored local contract 重新解析 pivot。

6. **ZIP 和所有 renderer 通过共同 runtime 获得能力**
   - direct/mapped/URL/Blob/legacy ZIP loader 只负责严格解析并传递 canonical manifest；旋转实际
     应用仅在 rendercore scene runtime。
   - package runtime、presentation surface、local authoring/template consumer 用 runtime contract
     测试证明，无需逐 app 接线；gamelayoutpkgcli 只增加字段保持测试，不新增 transform 实现。

## 5. 职责与合同

- **gamelayouteditor**：拥有完整 node transform draft、默认值、Inspector 输入、transaction、
  坐标类型转换触发和 preview；不直接设置 Pixi pivot/angle。
- **rendercore manifest**：拥有 node-only versioned schema、old-data normalization、strict validation
  和 public types；popup/transition/reel 保持各自窄合同。
- **rendercore runtime**：拥有 authored local origin、normalized center 解析、position/pivot/scale/rotation
  transform、geometry hot update和全部 node resource kind 的一致行为。
- **package/ZIP/optimizer**：保存 canonical manifest 与 exact closure；rotation/center 不改变资源
  closure、hash、ownership 或 asset-groups。
- **资源生命周期**：transform container 属于 node runtime；prepare 失败不提交，geometry update
  不替换资源，destroy 仍由现有 runtime 幂等释放。
- **失败策略**：非法角度/中心、部分对象、unknown field、错误
  schema 或 ZIP 在 mutation 前显式失败；不静默改成零角度、中心点或首个合法值。
- **禁止行为**：不在 editor/game app 复制旋转，不读取 Spine 动态 bounds 猜中心，不让
  attachment 反向改 pivot，不从 skeleton/atlas 文件猜 art size，不用 CSS transform 或 renderer bridge。

## 6. 文件范围

### 预计修改

```text
packages/rendercore/src/scene-layout/types.ts
packages/rendercore/src/scene-layout/manifest.ts
packages/rendercore/src/scene-layout/runtime.ts
packages/rendercore/tests/scene-layout/manifest.test.ts
packages/rendercore/tests/scene-layout/runtime.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/tests/scene-layout/presentation-surface.test.ts
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/resource-commands.ts
apps/gamelayouteditor/src/model/game-mode-commands.ts
apps/gamelayouteditor/src/model/coordinate-origin.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/tests/coordinate-origin.test.ts
apps/gamelayouteditor/tests/editor-store.test.ts
apps/gamelayouteditor/tests/layout-preview.test.ts
apps/gamelayouteditor/tests/validation.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
apps/gamelayouteditor/tests/app-shell.test.ts
apps/gamelayoutpkgcli/tests/reference-rewriter.test.ts
apps/gamelayoutpkgcli/tests/package-flow.test.ts
apps/gamelayouteditor/README.md
docs/scene-layout-manifest.md
docs/agent-rules/scene-layout.md
```

若纯 transform 数学需要独立模块，可在 `packages/rendercore/src/scene-layout/` 新增一个小型
geometry helper 及对应 test；不在 editor 另写副本。

### 原则上不应修改

```text
packages/rendercore/src/{reel,popup,symbol,background}/**
packages/{logiccore,gameframeworks,uiframeworks,vnicore}/**
apps/gamelayoutpkgcli/src/**
apps/{game002,game003,gameviewer,gameviewer2}/**
assets/**
AGENTS.md
package.json
pnpm-lock.yaml
```

若实现需要给 Popup/transition/reel 增加 rotation、要求普通 Spine 新增 art size、修改 manifest
version、改 optimizer 生产代码或让游戏 app 手工应用 transform，属于明显范围扩张，必须先说明，
不能修改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与建立兼容回归**
   - 重查 HEAD/status、相关规则、manifest/runtime public symbols 和当前 ZIP fixtures。
   - 先补 parser tests：旧 `x/y/scale` 默认规范化、正负/多圈角度、默认/自定义 center、
     unknown/partial/non-finite/out-of-range strict failure，并证明 popup/transition 不接受新字段。

2. **扩展 node-only public contract**
   - 在 `types.ts/manifest.ts` 拆清 node transform 与其它 scaled placement，加入 canonical
     rotation/center 和 frozen output。
   - 保持 `sceneLayoutStructure()` 排除 placement，验证只改 transform 可通过
     `assertSceneLayoutGeometryCompatible()`，资源或 topology 变化仍失败。

3. **实现 rendercore production transform**
   - 建立 pure helper，按各 node resource 的 authored local origin 解析 normalized pivot 和补偿后
     的 Pixi transform；明确断言 Spine `0.5/0.5 -> (0,0)`。
   - 在 init/applySnapshot/applyGeometryManifest 统一应用 position、pivot、scale、angle；覆盖四类
     resource、正负角、0/0.5/1 center、rotation=0 old parity、attachment 跟随、rollback 和 destroy。
   - 用 package runtime 与 presentation surface 测试证明 mapped ZIP consumer 和
     presentation-only consumer 自动获得相同行为，且 mode/variant/resize 后 transform 保持。

4. **接入 editor model 与坐标转换**
   - 更新所有 node/background placement 初值、draft types、clone、hide/show、rebind、mode 创建、
     manifest projection/import，使完整 transform 不丢失且新建默认一致。
   - 让坐标类型转换调用共同 transform 数学或等价 pure contract，覆盖 visible/hidden placement
     和两种 adaptation，证明切换前后 world transform 不变。
   - 保持 rotation/center 编辑被识别为 geometry-only，断言 texture/player/reel sample identity
     不变化。

5. **接入 Inspector、preview 与 ZIP round-trip**
   - 在普通图层和背景 Inspector 增加 angle/center 字段、输入约束和中文错误；确保 transaction
     rollback 后 DOM 重绘为 committed value。
   - 扩展 preview 测试，验证旋转后 node bounds/选中 outline、variant visibility、zoom/resize 和
     geometry refresh；不在 editor 直接操作 runtime display tree。
   - 扩展 mapped/legacy ZIP import-export、重复确定性导出、gamelayoutpkgcli reference rewrite 和
     optimized package flow 测试，确认字段逐层保留且 closure/map 不变化。

6. **文档、验收与报告**
   - 更新 editor README、manifest 文档与 scene-layout 领域规则，明确度数、normalized center、
     defaults、old-data、node-only 边界和 Spine authored-origin 语义。
   - 运行下列 L2 定向命令与 `git diff --check`；失败先最小化，不扩大整仓扫描。
   - 生成 `tasks/156-gamelayout-layer-rotation-center-<utctime>.md` 中文报告，列出用户尚需执行
     的浏览器场景和结果回填位置。

## 8. 测试与验收

### 测试原则

- parser 测 old/default/canonical 与 strict failure；runtime 测 world transform 和 lifecycle；
  editor 测 transaction/default/round-trip；CLI 只测字段保持，避免重复测 Pixi 算法。
- 不以只检查 `slot.angle` 代替行为测试；至少断言 resource-local center、pivot compensation、旋转后
  world bounds/point 和 rotation=0 parity。
- 使用 fake Spine/VNI 时只证明 transform/lifecycle；浏览器真实资源播放和视觉中心由用户验收。
- 旧 fixture 不要求全仓机械补字段；保留一组缺字段 fixture 专门保护兼容，canonical export
  断言则要求显式默认字段。

### 验收级别

`L2`。原因是修改 rendercore scene-layout public schema/type 和 production runtime，直接影响
gamelayouteditor、package runtime、presentation surface 与优化 ZIP consumer；范围仍可由三个
直接 package 的定向测试/typecheck 和 editor build 界定，不需要 L3 整仓验收。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/runtime.test.ts tests/scene-layout/package-runtime.test.ts tests/scene-layout/presentation-surface.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/coordinate-origin.test.ts tests/editor-store.test.ts tests/layout-preview.test.ts tests/validation.test.ts tests/zip-io.test.ts tests/app-shell.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/package-flow.test.ts
pnpm --filter @slotclientengine/rendercore --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter gamelayouteditor build
git diff --check
```

### 人工验收

浏览器验收由用户执行。执行方需提供可运行 editor 和至少一个含 image、Spine、VNI、
image-string 的真实 ZIP/导出包，并在报告中列出以下场景，不自行宣称通过：

- 旧 ZIP 导入后四类节点位置/scale/动画与旧版一致；分别设置 `90`、`180`、`-90`，确认方向
  和 Inspector 数值，切 variant/mode/分辨率后不丢失。
- 对同一图层比较 center `0/0`、`0.5/0.5`、`1/1`，确认支点变化；再切换全局坐标类型，画面
  不跳位，选中红框覆盖旋转后可见范围。
- 导出 ZIP、重新导入，再经过 gamelayoutpkgcli 优化后由 production renderer 打开；角度/中心、
  mode/background 和 animation 均保持，旧包与新包没有额外 orphan/missing 诊断。

### 独立验收建议

`建议`。涉及跨包 public contract、正式 scene-layout v1 ZIP 和 resource geometry，但不涉及
credential、服务器数据或新增异步 ownership。独立验收重点：

1. 旧 ZIP 默认值不改变视觉，非零角度在四类 node 上中心一致。
2. geometry hot update 不重建 player/reel sample，坐标类型切换保持 world transform。
3. optimized ZIP round-trip 不丢 `rotation/center`，Popup/transition/reel schema 未被误扩展。

最多复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/manifest.test.ts tests/scene-layout/runtime.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/coordinate-origin.test.ts tests/zip-io.test.ts
pnpm --filter gamelayoutpkgcli exec vitest run tests/reference-rewriter.test.ts tests/package-flow.test.ts
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才按仓库约定设置
  `http_proxy/https_proxy` 并重试原命令。
- 本任务不新增依赖、不修改 package.json 或 lockfile；Pixi 已提供 position/pivot/scale/angle。

## 10. 生成物、文档与规则

- 本任务无 YAML 或代码生成物；layout ZIP 是测试/人工验收产物，不提交为 runtime 业务表。
- 更新 `docs/scene-layout-manifest.md` 与 `apps/gamelayouteditor/README.md`，给出 canonical node
  placement 示例、单位、中心范围、旧包 defaults 和 node-only 边界。
- 更新 `docs/agent-rules/scene-layout.md` 的稳定职责：node matrix 与 normalized center 由
  rendercore 统一解析，Spine 默认中心使用 authored origin，不允许 editor/app 复制、动态 bounds
  推导或 atlas-size guess。
- 不修改根 `AGENTS.md`；精确任务证据只写 UTC 执行报告。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/156-gamelayout-layer-rotation-center-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告记录最终实现/文件、偏差、六条命令结果、用户浏览器
验收状态和剩余风险；不收集无关 coverage、整仓矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- ordinary Spine 没有显式 art size，因此绝不能把 `0.5/0.5` 解释为当前动画可见 bounds 的中心；
  必须固定映射到 authored origin，并用真实 Spine 浏览器验收矩阵方向和支点。
- center/pivot 与现有 `coordinateOrigin` 的 image/VNI anchor 语义叠加，若只设置 Pixi pivot 而
  未补偿 position，会导致 rotation=0 老数据或坐标切换跳位；pure transform/world-point 测试是
  合并前阻断项。
- `SceneLayoutNodePlacement` 当前被 popup/transition 复用，类型拆分可能暴露直接 consumer
  编译错误；只修受影响 consumer，不借机扩大到为它们实现旋转。
- 优化器生产代码虽预期通过 object spread 自动保留字段，缺少 flow 回归仍可能在 parse/rewrite
  过程中规范化丢失，因此 CLI 测试是 L2 必需证据。

### 假设

- 角度采用与 UI/Pixi `angle` 一致的顺时针度数语义，`rotation` 数值原样持久化；不接受弧度。
- “中心 0.5、0.5”表示 node 的默认 authored 中心并限制在 `[0,1]`；对 Spine 它就是 local
  原点 `(0,0)`，不支持本任务范围外的像素 pivot。
- 本任务的“图层”包括普通 scene node 和 background node，不包括 reel、Popup 或 transition。
- 浏览器验收由用户执行；实现会提供环境、真实 ZIP 和清单，但不会代替用户填写通过结论。
