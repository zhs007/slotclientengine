# 238 orientation-focus-maximized-focus 任务计划

## 1. 目标与完成定义

### 目标

修正 Scene Layout `orientation-focus` 的页面适配：先只根据宿主原始 `pageSize` 选择横屏或竖屏 variant，
再把该 variant 的实际 `focusRect` 按 contain 语义尽可能放大到页面中。没有显式安全边距时，focus 映射到
CSS 页面后必须至少有一条尺寸边界相等，即 focus 宽度等于页面宽度或 focus 高度等于页面高度；不得继续只以
“逻辑画布能容纳 focus”作为完成条件。

任务以 `/Users/zerro/Downloads/minecart2/layout25.zip` 和页面 `299×466` 为回归样例，同时保持横竖背景、
art 坐标、reel/node placement、资源生命周期和 strict manifest 行为不变。

### 完成定义

- [ ] 原始页面 `height > width` 选择 portrait，`width > height` 选择 landscape；正方形保持上一 variant，首次正方形为 landscape，focus/art 派生尺寸不得反向改变方向。
- [ ] 选中 variant 后，以该 variant 的实际 `focusRect` 计算最大 contain scale，并由页面宽高反推逻辑 viewport；不再先把某一轴固定为 `artSize` 最大设计尺寸。
- [ ] `layout25.zip` 在 `299×466` 下选择 portrait，逻辑 viewport 约为 `1056×1645.80602006689`，focus 的 CSS 映射约为 `299×406.311553030303`，宽度精确贴合页面宽度（浮点容差内）。
- [ ] landscape、portrait、near-square、square、极端宽高比和 focus/art 独立或越界几何均保持 focus 完整；受有限 art 边界约束产生额外未覆盖区域或黑边时，不拉伸、不猜测背景尺寸。
- [ ] `createSceneLayoutFramePolicy()`、`resolveSceneLayoutFrameViewport()`、`resolveSceneLayoutViewport()` 与 Game Layout Editor 预览使用同一 variant/focus 几何，不出现 frame 选 portrait 而 scene 选 landscape，或两套 focus scale 公式漂移。
- [ ] `maximized-focus` 单背景算法、generic `uiframeworks` 手写 `fixed/focus/orientation-focus` policy、manifest/schema/ZIP 内容和游戏业务逻辑保持不变。
- [ ] 定向自动化验收通过；使用真实 `layout25.zip` 的 Game Layout Editor 人工预览中，`299×466` 绿框宽度贴合页面且无错误方向或拉伸。

## 2. 范围

### 包含

- `packages/rendercore/src/viewport` 的“原始页面选择 orientation variant + 选中 focus 最大化”纯几何 helper/policy。
- Scene Layout frame resolver 与 framework policy factory 对新 helper 的统一接入。
- square variant 延续、无状态 pure calculation 与 framework policy resolver 的连续 resize 行为。
- `packages/rendercore` viewport/scene-layout 单测、README，以及最小背景适配/scene-layout 领域文档。
- Game Layout Editor preview 对 frame helper 的最小 previous-variant 接线；不改变 editor draft、资源、导入导出或 ZIP。
- 用 `layout25.zip` manifest 中的 portrait/landscape 数值建立小型代码 fixture 或测试常量；不把生产 ZIP 或资源复制进仓库。

### 不包含

- 不修改 `layout25.zip`、`assets.map.json`、layout manifest、Symbols/Popup package 或任何 production 美术 bytes。
- 不修改 `focusRect`、artSize、reel placement、node placement、背景绑定或游戏 mode 配置来迁就旧算法。
- 不增加第三种 Scene Layout adaptation mode，不在 app 监听 `window`，不使用 CSS `cover/object-fit` 或额外 DOM crop 修补。
- 不改变 generic `uiframeworks` 直接手写的 `orientation-focus` policy 语义；Scene Layout 通过现有 resolver surface 注入权威 rendercore 计算。
- 不重构 Game Layout Editor 状态/UI/IO，也不重构 scene runtime、mode transition、popup、reel、symbol、render object、loading、ZIP parser 或资源 ownership。
- 不在本任务删除或迁移 versioned manifest 的 `frameFocusRect/minFocusMargin` 字段；`minFocusMargin` 继续作为显式安全边界，`frameFocusRect` 停止覆盖 Scene Layout 实际 `focusRect` 的最大化目标，schema 清理需独立版本化任务。
- 不新增依赖、不修改 lockfile、workspace 或生成物。

## 3. 制定计划时的基线

```text
UTC: 2026-08-21T09:47:34Z
HEAD: f3520395df8d48957bcd0c241d4980fe22506210
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,editor-artifacts}.md`；`packages/rendercore` 无补充 `AGENTS.md`。
- 另读取与当前合同直接相关的 `docs/background-adaptation.md`、`packages/rendercore/README.md`；未加载无关游戏、Popup、VNI、Cocos 或 editor artifact 规则。
- 外部回归输入 `/Users/zerro/Downloads/minecart2/layout25.zip` 存在。其 `layout.manifest.json` 的 BaseGame、FreeGame、BonusGame 均为 `orientation-focus`，且三者当前使用相同几何：
  - landscape：`artSize=2000×2000`，`focusRect=(22,531.5,1954,940)`，`frameFocusRect=1954×940`；
  - portrait：`artSize=2000×2000`，`focusRect=(499,253,1056,1435)`，`frameFocusRect=1056×1435`；
  - 两个 variant 都未声明 `minFocusMargin`。
- 当前 frame 调用链：`resolveSceneLayoutFrameViewport()` 供 Game Layout Editor 和 local scene flow 使用；`createSceneLayoutFramePolicy()` 供 `game003v2` 与 `gameframeworks` Scene Layout template 传入 `uiframeworks`；renderer/runtime 最终用 `frameDesignSize` 调用 `applyViewport()`。
- 当前 Scene art 调用链：`resolveSceneLayoutViewport()` 对 `orientation-focus` 调用 `calculateResponsiveArtViewport()`，按传入逻辑 viewport 的方向选择 variant，再用 `calculateFocusedArtViewport()` 求 `visibleRect/worldOffset/focusRectInViewport`。
- 当前旧 frame 算法位于 `calculateFocusedFrameDesignSize()` 和 `resolveOrientationFrameDesignSize()`：先算 `focusSize + minMargin` 的最低容纳尺寸；窄屏分支把逻辑高度固定为 `maxDesignSize.height`，再按页面宽高比计算并 clamp 宽度。它优化的是“大逻辑画布且能容纳 focus”，不是“focus scale 最大”。
- 对 `layout25.zip` 的 `299×466` portrait：旧算法输出约 `1283.261802575107×2000`、scale `0.233`，focus CSS 约 `246.048×334.355`，所以宽高都不贴页面边界；期望 contain 算法输出约 `1056×1645.80602006689`、scale `0.283143939394`，focus CSS 约 `299×406.311553030303`。
- 定向 Git 历史因用户明确询问“以前怎样实现”而核对：
  - `e65f8d0f`（2026-07-17，task 98）引入 `calculateFocusedFrameDesignSize()` 和 Scene Layout `orientation-focus` frame 公式，来源是当时 game003 的最大 art/最低 focus margin DOM frame 合同；
  - `63fb9ad3` 已为单背景引入真正的 `calculateMaximizedFocusedArtViewport()`，但双背景路径没有复用；
  - `761bf282`（2026-08-19）允许 art 与 focus/margin 独立并可显示未覆盖区域，只放宽边界，没有把双背景的优化目标改成 focus 最大化。
- 当前能力缺口不是 ZIP 配置错误，也不是 green guide 绘制错误；是 orientation frame sizing 仍走旧公式，导致 frame 和实际 focus 的目标不一致。

## 4. 需求解释与技术决策

### 需求解释

1. “先根据屏幕大小决定横竖屏”中的屏幕只指未经派生的宿主 `pageSize`。portrait/landscape focus、art 或反推的逻辑 viewport 都不得参与方向判断。
2. “尽可能让 focusRect 最大化”采用等比 contain：`focusScale = min(pageWidth/focusWidth, pageHeight/focusHeight)`；不得裁掉 focus、非等比拉伸或改写素材。
3. 逻辑 viewport 由 `pageSize / focusScale` 反推，再复用既有有限 art/focus viewport 定位。正常情况下 focus 至少一轴与页面相等；若显式安全边距或有限 art 约束改变可见 frame，验收以不违反这些显式约束下的最大值为准，不用 fallback 掩盖未覆盖区域。
4. 对 Scene Layout，绿框代表实际 art-space `focusRect`，所以它是最大化的权威输入。`frameFocusRect` 是旧 DOM frame 声明，不能继续让不同尺寸悄悄覆盖用户看到的 focus 几何。
5. `layout25.zip` 的 portrait focus 与 frameFocus 尺寸相同且无 margin，因此回归值可精确证明问题与修复，不需要修改 ZIP。
6. “以前的实现”写入计划基线与文档迁移说明：旧实现保留最大 art 背景、只保证 focus 最低可见；新实现优先最大化 focus，同时仍显示 page aspect 所需的额外 art/未覆盖空间。

### 关键决策

1. **新增 orientation-aware maximized helper**：在 viewport 层组合“raw page 选 variant”和现有 `calculateMaximizedFocusedArtViewport()`；不把公式写在 Scene Layout、Editor 或 game app。
2. **实际 focusRect 是唯一缩放输入**：helper 使用选中 variant 的 `artSize + focusRect`。不使用 `frameFocusRect` 重新定义 green focus，也不从 reel/background bounds 猜 focus。
3. **frame 与 scene 共用选择结果**：pure helper 接受 optional previous variant 处理 square；Scene Layout frame resolver把选中的逻辑 viewport交给 runtime，scene resolver继续只负责 art-space placement，避免一个 API按page选方向、另一个按派生尺寸选出相反方向。
4. **framework 复用现有 resolver seam**：`createSceneLayoutFramePolicy()` 对 orientation manifest 返回/封装一个由 rendercore 持有的 maximized resolver；DOM frame policy discriminator描述 sizing 算法，不作为 manifest adaptation mode 的替代来源。这样 production 不修改 `uiframeworks` 公式，也不复制 helper。
5. **square 保持明确状态**：pure API由调用方传 `previousVariantId`；framework policy在自身实例内只保存最后一个已确定 variant，非正方形更新、正方形复用，首次正方形 landscape。不得使用 process-global 状态。
6. **不做 schema 迁移**：本任务保持现有 ZIP 可解析/可重导出；`frameFocusRect/minFocusMargin` 的未来删除、重命名或重新定义需要独立 versioned migration，不和算法修复绑在一起。
7. **失败保持 strict**：非正 page/art/focus、缺 variant、非法 previous variant 继续显式失败；不 fallback 到另一 variant、artSize、整张背景或首项。

## 5. 职责与合同

- **viewport helper**：拥有 raw page orientation、focus contain 最大化、有限 art projection、square previous variant；返回 immutable variant + viewport geometry，不读取 manifest/DOM/Pixi。
- **Scene Layout geometry**：materialize 当前 mode，向 viewport helper提交 exact `artSize/focusRect`，产出 frame snapshot/policy；不加载资源或修改 runtime tree。
- **Scene Layout runtime**：继续只应用 `frameDesignSize`、`visibleRect/worldOffset`、variant placement 和可见性；不重新决定 CSS scale或 focus 最大化。
- **framework/uiframeworks**：只调用 rendercore policy resolver并应用返回的逻辑尺寸/CSS scale；不从 policy mode 反推背景 variant，不复制 contain 公式。
- **Game Layout Editor/local flow**：只传页面尺寸和前一 variant，resize renderer并画 runtime snapshot guide；preview zoom不参与算法。
- **数据合同**：layout manifest仍是 art/focus/variant唯一来源；外部 `layout25.zip` 只作回归证据，不成为测试运行时依赖或仓库资源表。
- **失败策略**：任何 invalid size/rect/variant在画面 mutation前失败；不得静默 alias、clamp非法输入、猜方向或沿用错误 snapshot。
- **禁止行为**：不修改 focus 数字适配某个设备，不让派生 viewport反馈方向，不在 Editor/game app/CSS维护第二套 scale，不以黑边或未覆盖区域为由拉伸背景。

## 6. 文件范围

### 预计新增

```text
tasks/238-orientation-focus-maximized-focus-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/viewport/{responsive-art-viewport,index}.ts
packages/rendercore/src/scene-layout/{geometry,types}.ts
packages/rendercore/src/scene-layout/local-scene-flow.ts
packages/rendercore/tests/viewport/responsive-art-viewport.test.ts
packages/rendercore/tests/scene-layout/{fixtures,geometry}.test.ts
packages/rendercore/README.md
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/tests/layout-preview.test.ts
docs/background-adaptation.md
docs/agent-rules/scene-layout.md
```

执行时若现有 seam 足够，可不改 `types.ts` 或 fixture；不得为了匹配清单制造空 diff。

### 原则上不应修改

```text
apps/**（上列 Game Layout Editor preview 接线与定向测试除外）
assets/**
packages/{uiframeworks,gameframeworks,logiccore,netcore,vnicore}/**
packages/rendercore/src/{reel,symbol,popup,presentation}/**
packages/rendercore/src/scene-layout/{manifest,manifest-v2,manifest-v3,production-zip,package-resource,runtime}.ts
docs/agent-rules/{game002,game003,loading-ui,editor-artifacts}.md
{AGENTS.md,package.json,pnpm-workspace.yaml,pnpm-lock.yaml}
/Users/zerro/Downloads/minecart2/layout25.zip
```

若执行发现必须修改 manifest version/schema、generic frame-policy public type、`uiframeworks` 算法、游戏 app 或 production ZIP，
必须先说明新的兼容影响和范围，不能在实现后改计划合理化。

## 7. 实施步骤

1. **确认执行基线与外部样例**
   - 重核 HEAD/status、相关领域规则、现有 viewport/geometry API，以及 `layout25.zip` exact manifest 数值。
   - 用纯计算再次记录 `299×466` 的旧/新 expected；若 ZIP 几何已变化，停止并按实际权威数据重新规划。
2. **建立 orientation focus 最大化几何**
   - 在 `responsive-art-viewport.ts` 增加 pure helper：校验两个 variant，按 raw page + optional previous variant选方向，调用现有 maximized-focus几何。
   - 保持返回对象 immutable；复用现有 size/rect validation和有限 art行为，不复制 scene manifest逻辑。
   - 增加 instance-local policy resolver，仅为连续resize保存square所需的上一variant，不持有DOM/Pixi/runtime。
3. **统一 Scene Layout frame入口**
   - `resolveSceneLayoutFrameViewport()` 对 orientation mode使用新helper和实际 `focusRect`，由结果计算scale/cssSize/offset；maximized-focus单背景分支不变。
   - `createSceneLayoutFramePolicy()` 对 orientation manifest封装同一resolver，使game003v2和Scene Layout template的production frame获得相同行为。
   - 确认 materialized game mode exact adaptation被使用，不缓存旧mode geometry或由mode id猜variant。
4. **保持 scene variant与frame一致**
   - 为 frame resolver接入previous variant或等价显式状态传递；Game Layout Editor/local flow只传runtime已有snapshot variant，不自行算方向。
   - Game Layout Editor只调整preview size调用与定向mock/test，不改draft、manifest、资源workspace、IO或用户配置。
   - 验证派生 `frameDesignSize` 与raw page同方向关系，`runtime.applyViewport()`不会选择相反variant；square切换按合同稳定。
5. **更新定向测试**
   - viewport测试覆盖layout25 `299×466`、对应landscape、near-square、portrait→square保持、首次square landscape、缺variant和invalid size。
   - geometry测试断言logical/CSS focus边界，不只断言frame宽高；更新旧“game003 black-bar sizing”期望，使测试表达新合同而非旧实现。
   - 增加actual focus与legacy frameFocus尺寸不同的fixture，证明Scene Layout最大化实际focus；不为生产ZIP建立binary fixture。
   - 保留single-background maximized-focus、visibleRect/worldOffset、focus/art越界和reel mapping既有回归。
6. **同步文档和稳定规则**
   - README与背景适配文档说明旧算法、迁移后的公式、raw orientation输入、square语义、actual focus权威及显式边距/有限art例外。
   - `scene-layout.md`只记录稳定合同：“先按raw page选variant，再最大化该variant focus”；不写layout25具体数字。
7. **定向验收与报告**
   - 运行L2命令和真实ZIP人工预览；失败先最小化到pure helper、frame resolver或host CSS应用，不扩成整仓测试。
   - 搜索orientation Scene Layout仍调用旧 `calculateFocusedFrameDesignSize()` 的残留路径，检查diff，生成UTC中文执行报告。

## 8. 测试与验收

### 测试原则

- 用数学不变量验收：`focusScale` 是两个轴scale的最小值，focus完整且没有更大的合法等比scale；无显式margin时至少一轴与page相等（浮点容差）。
- 分别断言raw `pageSize`方向、selected variant、logical viewport、CSS scale和`focusRectInViewport`，避免只看最终截图掩盖variant错误。
- `299×466` 使用layout25的最小几何常量，不读取用户Downloads目录，保证CI可重复。
- 更新与新明确合同冲突的旧期望，不改生产代码去满足“最大设计画布”旧测试。
- 既有single-background测试必须原样通过，证明任务只改变orientation Scene Layout frame目标。

### 验收级别

`L2`：rendercore public Scene Layout frame policy的可观察行为改变，并直接影响gameframeworks/game003v2消费者；不改schema、
生成物、资源、lockfile或root工具链，因此不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/viewport/focused-art-viewport.test.ts tests/viewport/responsive-art-viewport.test.ts tests/scene-layout/geometry.test.ts tests/scene-layout/local-scene-flow.test.ts
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor exec vitest run tests/layout-preview.test.ts
pnpm --filter @slotclientengine/gameframeworks --filter game003v2 typecheck
git diff --check
```

### 人工验收

必须在 Game Layout Editor 导入 `/Users/zerro/Downloads/minecart2/layout25.zip`：

1. 自定义预览页面为 `299×466`，确认 `variant=portrait`，逻辑尺寸约 `1056×1645.806`；
2. 打开focus guide，确认绿框完整、宽度贴合页面左右边界，背景不被非等比拉伸；
3. 切换landscape、portrait、near-square、square并连续resize，确认背景/node/reel使用同一variant，square不抖动；
4. 切换BaseGame/FreeGame/BonusGame，确认相同几何稳定且mode资源/placement没有因frame变化重建或串用。

### 独立验收建议

`建议`：涉及跨包可观察frame policy和真实ZIP视觉结果，但不涉及credential、安全、异步资源transaction或schema。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/viewport/responsive-art-viewport.test.ts tests/scene-layout/geometry.test.ts tests/scene-layout/local-scene-flow.test.ts
pnpm --filter gamelayouteditor exec vitest run tests/layout-preview.test.ts
pnpm --filter @slotclientengine/gameframeworks --filter game003v2 typecheck
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的Node 24与pnpm；当前shell无`node`时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才设置仓库约定代理并重试。
- 本任务复用现有viewport helper、Scene Layout parser与framework resolver，不新增依赖、不修改lockfile。
- `layout25.zip` 是本机人工验收输入；自动测试不得依赖Downloads路径或复制其资源。

## 10. 生成物、文档与规则

- 不改YAML、manifest schema、assets map、ZIP或任何生成文件，无generator/parity输出。
- 更新`packages/rendercore/README.md`和`docs/background-adaptation.md`，把orientation方案说明从“最大art/最低容纳”改为“raw page选variant/actual focus contain最大化”，并保留坐标与未覆盖区域合同。
- 更新`docs/agent-rules/scene-layout.md`的稳定适配不变量；不把layout25路径、299×466或具体focus数字写入领域规则/根`AGENTS.md`。
- generic `uiframeworks`手写policy文档不在本任务修改；若执行实际改变其public行为，必须先重新评估范围与文档。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/238-orientation-focus-maximized-focus-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录最终算法/API与实际文件、旧实现迁移、自动验收、
layout25人工结果、计划偏差和剩余风险；不收集整仓coverage、历史提交矩阵或无关profiler数据。

## 12. 风险、假设与待确认

### 风险

- `createSceneLayoutFramePolicy()` 的orientation输出改由maximized resolver驱动，依赖旧policy discriminator或旧逻辑画布尺寸的外部consumer会观察到行为变化；必须用直接consumer typecheck和文档明确DOM policy与manifest adaptation的区别。
- 实际focus与legacy `frameFocusRect`不同的历史ZIP会改变画面缩放，这是需求要求的修正而非兼容fallback；执行报告需列出定向fixture结果。
- focus最大化可能显示更多art外区域；根据现有合同应忠实呈现未覆盖区域，不能为了消除黑边恢复旧clamp、拉伸背景或修改focus。
- square连续性需要instance-local previous variant；若状态放入global或pure helper隐式可变，会导致多个runtime互相污染。
- Editor frame、production framework和runtime scene若只改其中一条链，会出现预览正确而游戏仍旧、或frame/scene variant不一致。
- `layout25.zip`是本机外部文件，执行时可能被替换；自动回归必须保存精确几何常量并在人工验收前重新核对manifest。

### 假设

- 用户所称`forcerect`指Scene Layout绿色guide对应的实际`focusRect`。
- “宽度或者高度和屏幕一样”指focus等比映射后的尺寸与CSS页面至少一轴相等，不是要求整个art或canvas非等比铺满。
- `layout25.zip`未配置`minFocusMargin`，因此`299×466`回归不存在安全边距例外。
- 现有`maximized-focus`有限art行为符合需求；任务只需把orientation variant接入相同优化目标，不重新设计单背景算法。

### 待确认

- 无阻塞待确认项。若执行时发现用户希望立即从canonical manifest删除`frameFocusRect/minFocusMargin`，该要求会触发schema、Editor导入导出和历史ZIP升级范围，必须另行规划，不能隐式并入task 238。
