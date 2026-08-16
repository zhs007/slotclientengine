# 218 vnicore-data-runtime-viewer-refactor 任务计划

## 1. 目标与完成定义

### 目标

对 `packages/vnicore` 进行一轮重构级优化，将当前混在 `core` / `pixi` / `VNIPlayer`
中的数据合同、游戏 runtime 状态机、Pixi 渲染、自动时钟、viewport、diagnostics、
snapshot 和预览编排拆成三个单向依赖层：

```text
@slotclientengine/vnicore/data
  ↓
@slotclientengine/vnicore/core
  ↓
@slotclientengine/vnicore/viewer
  ↓
apps/anieditorv5viewer
```

- `data` 只拥有 VNI authored data 的 types、strict validation、bundle/profile/asset manifest
  和无副作用的资源路径处理。
- `core` 是专门给 game runtime 的 Pixi VNI 引擎；只接受宿主 ticker 和外部
  Pixi parent，public API 精简，steady-frame 热路径不构造完整 snapshot、DOM
  diagnostics 或 viewer 临时值。
- `viewer` 包装同一个 core，为现有 `apps/anieditorv5viewer`（下文简称
  `vniviewer`）提供 RAF、viewport/zoom、immutable snapshot、diagnostics 和预览编排；
  不复制采样公式、播放状态机或 Pixi display tree。

### 完成定义

- [ ] package 只通过明确子路径暴露 `data` / `core` / `viewer`，没有将三层再混合
      的 root wildcard barrel；旧 `./pixi` 和旧含义的 `./core` 完成仓库内原子迁移，
      不留静默 alias/fallback。
- [ ] `data` 不依赖 Pixi、DOM、ticker 或 viewer；非法 schema/profile/asset/path 仍在
      消费前显式失败，现有 `V5G_0.x` / `VNI_0.x` 数据支持不变。
- [ ] `core` 不创建 `PIXI.Application`、renderer、canvas、DOM 或 RAF；游戏宿主
      只用 `update(deltaSeconds): void`、commands、scalar queries 和 edge listeners/drain
      驱动 runtime。
- [ ] `core` 保留当前游戏所需的 timeline/range/segmented/manual staged playback、
      particle drain、layer group/text binding、dynamic replacement、loaded-resource sharing/pool
      与所有 Pixi 效果语义，但不暴露 mutable sampler buffer、project clone/reset hook
      或 private display-tree helper。
- [ ] 预热后、无资源/结构/事件变化的 `core.update()` 不做每帧 project/state
      snapshot、array spread/map/filter/sort、DOM dataset 写入或可避免的 Pixi 对象创建；
      sampling scratch、顺序、lookup 和空结果由 runtime owner 稳定复用。
- [ ] core 的 init 失败能 rollback；`destroy()` 幂等地停止活动 operation、释放
      runtime-owned texture/view/pool/listener，detach display tree，不销毁宿主或共享
      source texture，重复 init/destroy 不保留可达的 mutable runtime state。
- [ ] `viewer` 包装使 vniviewer 现有上传/profile、普通与 segmented 播放、
      cyclic-selection、particle-combo 目标预览、组间插入、文字替换、
      zoom 和 `data-vni-*` diagnostics 行为保持不变。
- [ ] vniviewer 仍自己拥有 upload/ZIP parsing、`PIXI.Application`、canvas、DOM UI、
      Blob URL 和 profile lifecycle；viewer wrapper 只包装 core，不成为第二个 app。
- [ ] rendercore 及其它仓库内直接 consumer 全部改用新责任子路径，无旧
      import 残留；VNI 可见画面、采样端点、播放完成/循环/粒子排空
      和 strict failure 语义不变。
- [ ] 完成自动验收和 vniviewer 真实浏览器 Performance/Memory/视觉验收，
      并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/vnicore/src` 整体职责分层、public exports、runtime hot path、资源与
  operation lifecycle、测试、示例和文档。
- `apps/anieditorv5viewer` 改为只消费 `data` + `viewer` 合同，并对现有
  vniviewer 能力做 parity 验收。
- 迁移所有仓库内直接 consumer：`packages/rendercore`、`apps/gamelayouteditor`、
  `apps/gamelayoutpkgcli`、`apps/popupeditor` 及相关 tests/examples/Vite aliases。
- 增加 export-boundary、hot-path identity/construction count、init rollback、destroy/resource release、
  core/viewer parity 和直接 consumer 编译测试。
- 更新 vnicore README/API/usage/migration 文档和稳定 VNI 领域规则。

### 不包含

- 不新建第二个 vniviewer app，不重做上传 UI、ZIP parser、Pixi Application
  或 DOM controls。
- 本任务选择实现 viewer wrapper；不另建未有明确 consumer 的 editor wrapper。
  未来 editor 包装必须复用同一 core，不能复制状态机。
- 不修改 VNI JSON schema、编辑器导出、export fixtures 字节、美术资源、
  Cocos runtime、视觉公式、动画时序或 particle/effect 上限。
- 不引入 ECS、Web Worker、OffscreenCanvas、隐藏 renderer/canvas-to-texture bridge、
  atlas 重打包、启发式 LRU 或新的 runtime 依赖。
- 不为外部未知 consumer 保留旧 barrel、V5G public 名称 alias 或双写路径；
  schema family 兼容与 public TypeScript alias 是两件事。
- 不修改 `pnpm-lock.yaml`、root 工具链或无关 app/package。

## 3. 制定计划时的基线

```text
UTC: 2026-08-16T12:43:17Z
HEAD: fec51746db1e34ccd26636942af54da26bff1248
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取 root `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/vni-runtime.md`；`packages/vnicore` 下无补充 `AGENTS.md`。
- `packages/vnicore/package.json` 当前导出 root、`./core`、`./pixi`；root 同时
  wildcard re-export data/sampler 和 Pixi player，无法从 import path 看出 consumer 职责。
- `src/core/**` 当前既含 schema/validation/manifest，又含 timeline、particle、effect、
  carousel 采样和 runtime mutable helper；该目录不是单纯数据层。
- `src/pixi/vni-player.ts` 约 3268 行，一个类同时拥有 load/init、transport、
  sampling/rendering、RAF、viewport、DOM diagnostics、snapshot、clone/pool hook、mount
  和 destroy，是本轮重构的主要边界问题。
- task 217 已让 VNIPlayer 内部复用 stable project sampler、animation order cache 和
  mask scratch；本任务必须保留这些成果，不把 mutable `*Into` API 重新公开。
- `VNIPlayerOptions` 当前将 game 需要的 `parent/project/assetUrls/autoTick:false`
  与 viewer 专用的 `diagnosticsElement/viewport/viewportScale/requestRender/onTimeChange/
onPlayingChange` 混在一起；game consumers 全部使用宿主 ticker。
- 当前只有 vniviewer 使用 DOM diagnostics、viewport/zoom、完整 playback snapshot、
  manual auto-preview 和 particle-combo pool stats；`rendercore/symbol` 只为 loop edge 读取
  `getPlaybackState().loopIndex`，可改为 scalar query。
- `VNIPlayerPoolManager` 的 resource sharing、有界 pool 和 lease reset 是 game runtime
  能力；viewer 只包装其预览 descriptor/snapshot。
- `vniviewer` 指现有 `apps/anieditorv5viewer`，不新建 app。

## 4. 需求解释与技术决策

### 需求解释

1. 需求是单向 data → runtime core → viewer adapter，不是三份播放器。
2. core 唯一时间源是宿主 `update(deltaSeconds)`；RAF 属于 viewer，不保留
   `autoTick` 双模式。
3. core 简洁包含内部职责与 public API 收口，但不删除已有游戏能力或
   把逻辑复制进 viewer。
4. 性能/内存要求落到热路径分配、有界缓存、明确 owner 和 lifecycle；无
   profiler 证据时不承诺 FPS 百分比。
5. viewer wrapper 必须覆盖现有 vniviewer 全部合同，不是功能子集。

### 关键决策

1. **重新定义子路径，不保留并行兼容面。**
   - `./data` 是 authored data contract；`./core` 是 game runtime；`./viewer` 是
     vniviewer adapter。
   - `package.json#exports` 和各 barrel 用 allowlist 显式导出，测试锁定不能跨层
     import 的 symbol。
   - 该 package 为 private workspace package，本任务原子迁移全部仓库 consumer；
     保留 root/`./pixi` 会延续责任混淆，因此不采用。
2. **core 使用宿主驱动的单模式 runtime。**
   - core options 仅保留 Pixi parent、已校验 project/asset URLs 和显式 runtime
     配置；删除 RAF、viewport、DOM、diagnostic 和 UI callback options。
   - game 只通过 command、`update(): void`、`getTime/getPhase/getLoopIndex/isPlaying/
isParticleDraining` 等 scalar query 及完成 edge listener 消费状态。
   - 完整 immutable playback/project/pool snapshot 只由 viewer wrapper 构造，不为 game
     每帧查询暴露通用 snapshot API。
3. **内部拆分大类，保留一份 canonical state。**
   - 将 load/resources、transport、sampling/render pass、mount/binding、manual capability、
     pool/lease 和 lifecycle 拆成 core 内部 owner；对外仍由一个轻量 runtime
     facade 协调。
   - viewer 包装委托该 facade，不继承、不访问 private field、不采样第二份
     timeline。
4. **数据与 runtime mutable state 分离。**
   - core 把已校验 authored project 视为 readonly；playback seed、particle、transport、
     replacement 和 duration-dependent cache 存在 runtime-owned state，不回写 template。
   - loaded clone 只共享 readonly source texture/resource handle；display tree、project runtime
     state、listener、particle、transport 和 lease 独立。
5. **viewer 只增加包装语义。**
   - wrapper 拥有 RAF/cancelRAF、viewport/zoom layout、`requestRender`、UI callbacks、
     DOM dataset diagnostics、immutable snapshots 和预览池统计。
   - app 仍拥有 canvas/mount 真实尺寸、upload/profile selection、Blob URL 和 UI
     互斥编排；wrapper destroy/profile switch 必须先 cancel operation/lease/RAF，再
     destroy core，最后清 diagnostics。

## 5. 职责与合同

- **Data**：拥有 VNI/V5G schema types、strict parser/validator、bundle manifest、profile parity、
  asset URL manifest 和 path rewrite/traversal。不导出 frame sampler、Pixi type、runtime state
  或 viewer descriptor。
- **Core**：拥有 timeline/track/effect/particle/card-carousel sampling、render order、mask、
  group slot、text binding、replacement、transport、resource handle/pool 和 Pixi display tree。
  纯 sampler 若无已确认外部合同则降为 internal，public 只留 runtime 所需 value types。
- **Viewer wrapper**：拥有预览时钟、尺寸/zoom、diagnostic projection、完整 immutable
  state 和 vniviewer-only orchestration helper；不拥有 upload/ZIP/DOM controls 或新的播放
  状态机。
- **Consumer**：游戏/rendercore 只 import `core`，数据/CLI/importer 只 import `data`，
  vniviewer import `data` + `viewer`。测试和 Vite alias 不得绕过 public entry 形成
  第二份合同。
- **生命周期**：每个 resource/cache/pool/view/RAF/listener/operation 有唯一 owner；
  prepare/init 未 commit 前的失败全量 rollback，pool release 恢复 authored/runtime defaults
  并 detach，destroy 幂等。
- **失败策略**：未知 schema/animation/easing/blend/capability/state/resource/path、非法
  delta 和被 destroy 后的命令仍在责任边界显式抛错；不猜测、不 placeholder、
  不回退到 viewer 实现。
- **内存合同**：缓存以 player/template/animation 为明确 key 且有界；scratch 不逃逸
  owner；每次 public pure value/snapshot 保持独立值语义，core internal mutable buffer 不进
  public barrel。
- **禁止行为**：不复制 timeline/effect 公式，不暴露 private Pixi container，不为
  viewer 添加隐藏 renderer/DOM bridge，不以丢 delta、降采样或无界 cache 换性能。

## 6. 文件范围

### 预计新增

```text
packages/vnicore/src/data/**
packages/vnicore/src/core/**
packages/vnicore/src/viewer/**
packages/vnicore/tests/data/**
packages/vnicore/tests/core/**
packages/vnicore/tests/viewer/**
tasks/218-vnicore-data-runtime-viewer-refactor-<utctime>.md
```

### 预计修改

```text
packages/vnicore/package.json
packages/vnicore/src/index.ts
packages/vnicore/src/{core,pixi}/**
packages/vnicore/tests/{core,pixi}/**
packages/vnicore/{README.md,docs/**,examples/**,tsconfig*.json,vite.config.ts}
apps/anieditorv5viewer/{src/**,tests/**,README.md,vite.config.ts}
packages/rendercore/{src/**,tests/**,README.md,vite.config.ts}
apps/gamelayouteditor/{src/**,tests/**,vite.config.ts}
apps/gamelayoutpkgcli/{src/**,tests/**}
apps/popupeditor/{src/**,tests/**}
apps/{gameviewer,gameviewer2}/vite.config.ts
docs/agent-rules/vni-runtime.md
```

### 原则上不应修改

```text
packages/anieditorv5runtime-cc/**
docs/anieditor5/export/**
packages/vnicore/tests/fixtures/export/**
assets/**
pnpm-lock.yaml
package.json
pnpm-workspace.yaml
```

如果执行时发现必须修改 VNI schema、fixture 字节、Cocos runtime、lockfile 或新增
外部依赖，先停止并说明为何已超出本计划，不通过改计划事后合理化。

## 7. 实施步骤

1. **确认执行基线与 public allowlist**
   - 重新核对 HEAD/工作区，用 `rg` 生成所有 root/`core`/`pixi` imports 及 public
     symbol consumer 矩阵，区分 data、game runtime、viewer-only 需求。
   - 将最终 `data/core/viewer` 导出 allowlist 固定在 package export-boundary 测试中；
     没有 consumer 且只为旧实现方便存在的 helper 不进 public API。

2. **建立独立 data 层**
   - 迁移 types、validation、asset/bundle manifest、profile parity、asset path resolve/rewrite
     和 authored group traversal，消除对 Pixi/runtime/viewer 的依赖。
   - 保留现有 strict validation 错误、schema family 和 asset metadata 语义；补充
     data barrel 只导出数据合同的结构测试。
   - 迁移 CLI/editor/rendercore 的纯数据 imports 到 `@slotclientengine/vnicore/data`。

3. **建立 host-driven game runtime core**
   - 将 sampler、particle/effect、Pixi render pass、transport、mount/binding、manual capability、
     loaded resource/pool 按 owner 拆分，以单一 runtime facade 组合。
   - 从 core options/state 移除 `autoTick`、`performance.now`、RAF、viewport/fit/zoom、
     `HTMLElement`、dataset diagnostics、UI callbacks、project snapshot 和完整 playback snapshot。
   - 提供游戏所需的明确 scalar queries/edge listeners，用 `getLoopIndex()` 等替换
     rendercore 为读一个标量而构造的 `getPlaybackState()`。
   - 保留 task 217 stable samplers/scratch/order cache；将当前 3000+ 行 player 的
     init/render/transport/mount/lifecycle 分开，但不创建可独立变更的第二份状态。

4. **收紧热路径与资源生命周期**
   - 为 steady timeline/range/segmented/manual/particle-drain 分别审计每帧分配；将
     可复用 array/map/set/result/sample buffer 收到 player 或 effect owner，结构变化时才
     invalidate/rebuild。
   - 为 Pixi Container/Sprite/Graphics/Texture view 构造数、stable result identity、cache bound、
     operation cancel、init rollback、pool release 和 idempotent destroy 增加定向测试。
   - 使用同一 Node/browser 环境和固定 fixture 记录重构前后 warm-update benchmark；
     benchmark 是回归证据，不用不稳定绝对时间作单测 gate。

5. **建立 vniviewer wrapper**
   - 用 composition 包装 core，实现 RAF/cancelRAF、viewport size/scale、requestRender、
     time/playing callbacks、immutable playback/project/pool snapshots 和 DOM diagnostics projection。
   - 包装 manual cyclic auto-preview 和 particle-combo target preview 所需 descriptor/lease/pool
     便利 API，但实际 transport、variant、safe replacement 和 reset 仍由 core 拥有。
   - 明确 wrapper unload/destroy 顺序，防止 profile 切换、重传 ZIP 或预览互斥时
     残留 RAF、lease、listener、dataset 或 detached Pixi tree。

6. **迁移 vniviewer 与 game consumers**
   - vniviewer 只从 `data` 读数据合同、从 `viewer` 创建包装；保留现有
     five-tab UI、strict ZIP/profile flow、canvas ownership、Blob URL 清理和三类播放互斥。
   - rendercore 只从 `core` 创建 runtime，每帧一次提交完整 non-negative finite
     delta，使用 scalar query/edge，不引入 viewer snapshot/RAF/DOM。
   - 迁移 layout/popup editors、CLI、examples 和 Vite aliases，搜索确认无 package root、
     `./pixi`、旧 data-from-`./core` 或 private source import 残留。

7. **同步测试、文档和规则**
   - 按 data/core/viewer 责任重排现有测试，保留所有采样端点、视觉公式、
     strict failure、range/segmented/manual、pool/clone 和 destroy 回归。
   - 更新 README、中英文 usage、API 与 migration 文档，给出游戏 core 和 viewer
     wrapper 的最小示例，删除旧 import/`autoTick` 说明。
   - 把稳定 data/core/viewer 单向依赖、host-driven core 和 wrapper lifecycle 写入
     `docs/agent-rules/vni-runtime.md`；具体 benchmark/命令结果只写执行报告。

## 8. 测试与验收

### 测试原则

- 不为保留旧混合 public surface 而添加 compatibility alias；测试改为验证新责任
  合同，视觉/时序/strict failure 期望保持不变。
- data 覆盖正常、非法、profile mismatch、path rewrite 与不可变输入；core 覆盖
  时间边界、大 delta、event/complete/loop/drain、pool/reset、rollback/destroy；viewer
  覆盖 RAF、snapshot、viewport、diagnostics 和 profile/unload 清理。
- core/viewer 在相同 fixture、相同 delta 序列下对 time/phase/visible layers/effect counts/
  completion edge 保持 parity；viewer 附加功能不改 core 结果。
- 热路径测试使用 identity、constructor spy 和可达资源边界；不用脆弱的
  wall-clock 阈值代替真实 browser profiler。

### 验收级别

`L2`：重构 vnicore public subpaths 并迁移 rendercore、viewer、editor/CLI 直接 consumers，
但不修改 schema、生成物、root 工具链或 lockfile。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/rendercore --filter anieditorv5viewer --filter gamelayouteditor --filter gamelayoutpkgcli --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
git diff --check
```

超过 6 条是因为 declaration exports、runtime consumers、viewer build 和 diff 需独立证明。
不默认运行 root 级验收；新发现的直接 consumer 只加入同一 L2 定向验收。

### 人工验收

- 用 vniviewer 上传现有 bundle-manifest ZIP 和 single-project ZIP 样本，逐项复验
  profile 切换、普通/range/segmented、cyclic auto-preview、particle-combo target
  preview、组间插入、文字/图片替换、10%–400% zoom 和 diagnostics 清理。
- 在代表性粒子、mask、sequence effect、multi_move、basic tracks、card carousel
  项目上对比重构前后首/中/尾关键帧，确认 Pixi preview 视觉等价。
- 使用 browser Performance/Memory 在相同项目和播放时长下记录 warm steady
  playback 的 frame time、minor GC、allocation timeline 和 heap slope；连续执行至少
  20 次 load/play/unload/profile switch，确认没有递增的 RAF、listener、Pixi display、
  owned texture/view 或 pool lease。
- 人工数据必须在同一浏览器/硬件/资源上对比，报告原始数值；若无法
  执行，明确标记未完成，不用 unit test 宣称真实 FPS/内存改善。

### 独立验收建议

**必须**：重点复验 export 边界/旧 import 零残留、core/viewer 的 phase/
completion/particle-drain/关键帧 parity，以及 init failure、pool release、profile unload
和 repeated destroy 的资源可达性。最多重跑 vnicore test、rendercore+viewer typecheck
和 viewer test 三组命令。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 无 Node 时使用 nvm 切换到 24。
- 依赖缺失时只执行 `CI=true pnpm install --frozen-lockfile`；下载实际失败后才
  按仓库规则设置代理并重试原命令。
- 不新增依赖，不修改 lockfile。内部模块拆分使用 TypeScript/Pixi 现有能力，
  不为 benchmark 引入永久 runtime package。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、VNI export fixture 或其它生成物；若发生 fixture 变化必须
  先解释为何架构重构需要改 authored bytes。
- README/API/usage/migration 记录最终 public import、host-driven core、viewer wrapper、
  owner/destroy 和从 root/`core`/`pixi` 旧路径迁移的精确表格。
- `docs/agent-rules/vni-runtime.md` 只记录稳定责任边界；文件数、benchmark 数值、
  测试数和具体执行证据进任务报告，不进领域规则。

## 11. 执行报告

规划时不生成报告。执行完成后以 `date -u +%y%m%d-%H%M%S` 创建
`tasks/218-vnicore-data-runtime-viewer-refactor-<utctime>.md`。报告记录最终分层/API、
实际修改文件、consumer 迁移、自动命令、
重构前后 warm benchmark 原始数据，浏览器视觉/Performance/Memory 结果，计划偏差，
未完成人工验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- `./core` 改变含义，漏迁 import 会造成 bundle/type 问题，必须用定向 `rg` +
  直接 consumer typecheck 锁定。
- RAF 移到 viewer 后，粒子排空、manual promise 和 complete listener 必须继续由同一
  delta 流驱动。
- 拆分 player 可能改变 Pixi child order、mask、texture owner 或 init commit 顺序，需要
  Pixi 回归和真实视觉验收。
- heap/GC 有噪声，需固定环境并用趋势/可达 owner 判断；清理 V5G public alias
  不等于删除 V5G schema support。

### 假设

- 仓库内 consumer 是该 private package 的迁移边界，不为未提供的外部 consumer
  保留旧路径。
- vniviewer 合同来自其 README、测试和 VNI 规则；game 宿主已有 ticker/renderer，
  viewer wrapper 补足独立预览的 RAF。
- 现有 fixtures 用于自动 parity；真实浏览器验收只用现有 ZIP，不猜测替代资源。

### 待确认

- 无执行前阻塞项。若实施时发现仓库外必须兼容的 vnicore consumer，需要
  用户提供其实际 import/API 合同后再决定是否扩展迁移范围，不预留静默兼容层。
