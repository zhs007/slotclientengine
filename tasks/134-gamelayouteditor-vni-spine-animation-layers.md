# 134 gamelayouteditor-vni-spine-animation-layers 任务计划

## 1. 目标与完成定义

### 目标

为 Game Layout Editor 增加可独立导入、管理和绑定的 VNI 动画资源，并补全普通 VNI/Spine 动画图层的播放配置。用户可分别把 VNI 或 official Spine 资源加入统一 filename-key 资源库，再显式创建普通图层，配置图层顺序、横竖屏可见性、坐标、缩放和循环方式；编辑器 preview、导出 ZIP、重新导入以及 rendercore production runtime 保持同一行为。

### 完成定义

- [x] VNI export bundle ZIP 可作为独立资源导入；只接受经过 vnicore 严格校验的 `purpose=runtime` profile，唯一 runtime 自动选择，多个 runtime 要求用户明确选择。
- [x] official Spine 4.3 的 skeleton JSON、atlas 和精确 texture closure 可继续独立导入；VNI 与 Spine 导入都只提交资源，不自动创建、绑定或替换图层。
- [x] 用户可用任一已导入 VNI/Spine 资源创建或重绑普通图层，并配置稳定 node id、order、每个 active variant 的显示开关、`x/y/scale`。
- [x] VNI 图层显式配置整段 timeline 是否循环；Spine 普通图层显式选择大小写精确的 animation，并配置循环或单次播放。
- [x] 非循环 VNI/Spine 从首帧开始播放一次，结束后不自动重播；循环播放在完整周期边界继续。preview 与 production runtime 的 update、隐藏、切 variant 和 destroy 行为一致。
- [x] 现有稳定 Spine 背景仍只允许显式 single loop；VNI 不进入背景或 scene transition 候选，不改变现有 Spine/MP4 有向转场合同。
- [x] VNI project 和其图片的 exact closure 能完成 layout ZIP 导出、重新导入、content-addressed 映射、生产加载和 package optimizer 往返；缺失、orphan、错误 profile、错误版本和非法 playback 显式失败。
- [ ] rendercore、gamelayouteditor、gamelayoutpkgcli 的定向测试、lockfile 触发的 L3 验收及真实浏览器人工验收完成，并生成任务 134 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/gamelayouteditor` 的 VNI resource draft、导入/替换 transaction、资源列表、Resource Picker、普通图层 Inspector、preview、manifest/ZIP round-trip 和测试。
- `packages/rendercore/src/scene-layout` 的 VNI node schema、Spine `loop:boolean` 扩展、exact closure、resource preparation、Pixi VNI player ownership 和 runtime playback。
- VNI profile 选择沿用 `@slotclientengine/vnicore/core` 权威 validator；timeline/player 沿用 `@slotclientengine/vnicore/pixi`。
- `apps/gamelayoutpkgcli` 的 scene VNI typed reference rewrite、WebP 后处理、asset grouping 和 parity 测试。
- scene-layout manifest 文档、Game Layout Editor README 和最小领域规则更新。

### 不包含

- VNI 内部 layer、track、particle、mask、group、文字替换或 segmented/manual playback 编辑；这些仍由 VNI 编辑器和 vnicore 拥有。
- 为 VNI 选择“动画名”；当前 VNI resource 是一个完整 project timeline，不从 layer 或 preset 名称推导第二套 clip。
- VNI 背景、VNI scene transition、VNI symbol、VNI popup 或 award tier 编辑。
- 改变稳定 Spine 背景的 single-loop 合同，或改变现有 Spine/MP4 有向转场。
- 旋转、alpha、blend mode、锚点、裁剪、canvas 拖拽、关键帧、自动播放控制按钮、undo/redo 或图层分组。
- 接受 `purpose=editing`、从路径猜 profile、从文件名猜 kind 或为坏 VNI/Spine 增加 fallback。
- 修改 VNI schema、VNI export fixtures、Cocos runtime、game app 或 root 工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T08:52:57Z
HEAD: abedbf0c67bac430d78e8109aaa0c8a3b942bbb4
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取的规则和计划依据：

```text
AGENTS.md
docs/agent-rules/scene-layout.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
docs/agent-rules/vni-runtime.md
tasks/templates/task-plan.md
tasks/129-gamelayouteditor-preview-coordinate-refresh.md
```

当前代码基线：

- `packages/rendercore/src/scene-layout/{types,manifest,runtime}.ts` 只支持 `image | spine | image-string` node；Spine `loop` 固定为 `true`，尽管底层 official player 已接受 boolean loop。
- `VNIPlayer` 已提供 `init/setLoop/play/update/destroy`，支持 manual tick，并按原始 100% stage 尺寸渲染。
- `apps/popupeditor/src/io/resource-import.ts` 已形成严格 VNI bundle 合同：只枚举 `purpose=runtime`，并校验 bundle/project profile parity。
- gamelayouteditor 的 resource draft、导入、Picker 和 UI 尚无 VNI；Spine 已能独立原子导入，但 editor playback 固定 loop。
- 现有普通图层已经拥有 per-variant visibility 和 `x/y/scale`，本任务直接复用。
- editor ZIP、rendercore package loader 和 gamelayoutpkgcli 均需同步新增 typed VNI closure，不能扫描任意 JSON。

不需要审计完整 Git 历史；当前 schema、runtime、编辑器和 optimizer 已足以确认缺口。

## 4. 需求解释与技术决策

### 需求解释

- “单独导入”解释为 VNI 和 Spine 都是统一资源库内独立、可复用的 typed resource；
  导入成功不会自动创建 node，同一 resource 可被多个普通图层显式引用。
- “单独添加图层”解释为每个 VNI/Spine node 有独立 id、order、playback 和
  per-variant placement；共享 bytes 不合并 node identity 或 placement。
- 横竖屏是否显示沿用 placement 是否存在的现有合同；关闭某 variant 删除该 placement，
  重新开启使用固定 `{x:0,y:0,scale:1}`，不继承另一 variant。
- Spine 的循环开关只开放给普通图层。背景仍强制 loop，转场仍按 once/event 合同运行。
- VNI 的循环开关作用于完整 project timeline；不循环时完整播放一次并进入完成态，不
  猜测 loop range 或 segmented marker。

### 关键决策

1. **保持 scene-layout manifest v1，做向后兼容的 typed union 扩展**
   - 新增 VNI node resource：`{kind:"vni", project:string, loop:boolean}`。
   - 普通 Spine animation 的 `loop` 从字面量 `true` 扩展为 boolean；旧 `loop:true` 不变，缺字段、非 boolean 和未知字段继续失败。
   - state-machine Spine 与 transition schema 不变；新增 kind 不改变旧字段解释，因此不创建 v2。

2. **背景和普通动画图层使用不同约束**
   - parser 对所有 adaptation/game-mode background 引用拒绝 VNI，并拒绝 `loop:false` 的 Spine 背景。
   - 普通 Spine/VNI 图层允许 `loop:true|false`；Resource Picker 按 binding context 禁用非法背景候选。
   - 不通过隐藏 UI 代替 schema 校验，手写或导入非法 manifest 也必须失败。

3. **VNI 导入只消费权威 runtime export**
   - 输入是含 `manifest.json` 的 VNI export bundle ZIP；唯一 runtime 自动选择，多个 runtime 通过对话框明确选择后二次准备。
   - project 必须通过 `assertVNIProject()` 和 profile parity；只收集其声明图片并结构化改写为 flat filename keys，拒绝缺失、别名、错误媒体和 orphan。
   - 不转换 editing profile、不手输或从路径猜 profile；默认不承诺 loose project JSON。

4. **VNI stage 作为有明确尺寸的透明普通图层**
   - VNI 保持原始 100% stage 尺寸，不做 fit/cover/crop；node `scale` 只缩放外层 slot。
   - `top-left` placement 对应 stage 左上角，`center` 对应 stage 中心；全局原点切换按 stage size 和 node scale 可逆换算。
   - 不绘制 VNI backgroundColor；选择框使用真实 display bounds。

5. **rendercore 拥有生产播放与资源生命周期**
   - resource prepare 解析 project 并建立 exact asset URL；每个 VNI node 创建 `autoTick:false` 的独立 player/playhead。
   - init 后设置 loop 并从 0 播放；runtime ticker 只更新 renderable node，非循环完成后不由 editor 重启。
   - structural prepare 失败销毁 player/texture/URL 并保留旧 runtime；geometry/visibility 更新复用 player 和时间。
   - runtime destroy 先销毁 player，再释放 owned URLs，且重复 destroy 幂等。

6. **ZIP 与 optimizer 使用 typed nested closure**
   - manifest 只引用 VNI project filename key；project `asset.path` 也是结构化 key，图片 bytes 只在全局 workspace 一份。
   - export/import/loader 用 `assertVNIProject()` 收集 exact closure；不扫描任意 JSON。
   - gamelayoutpkgcli 用 `rewriteVNIProjectAssetPaths()` 改写 project，同时补 scene root/group closure，再重算 hash/map 并复验。

7. **播放配置采用严格 editor discriminated union**
   - playback 区分 Spine animation 与 VNI timeline；Spine 要求合法 animation + boolean loop，VNI 只允许 boolean loop，其它 kind 不得带 playback。
   - add/rebind 一次验证资源类型、playback、node id 和 variants；失败不修改 resource/node/selection/preview。
   - 旧 Spine `loop:true` 精确保留；新配置往返不以默认值掩盖缺字段。

## 5. 职责与合同

- **gamelayouteditor model/UI**：拥有 resource draft、profile 选择、node binding/playback 和 transaction；不采样 timeline 或操作 player。
- **browserartifactio/editorresource**：拥有 bounded source、flat workspace、冲突 review、SHA-256/content-addressing；app 不复制。
- **vnicore**：拥有 VNI validation、asset rewrite、timeline/particle/manual update 和 Pixi player。
- **rendercore scene-layout**：拥有正式 schema、exact closure、origin、player prepare/update/visibility/destroy。
- **gamelayoutpkgcli**：拥有 typed reference rewrite、WebP 后处理和加载 group，不改播放语义。
- **失败策略**：未知/错误 profile、loop、resource、orphan、hash/size/path 和 init 失败均在 commit 前显式失败。
- **禁止行为**：不猜 kind/profile、不绘制 VNI backgroundColor、不自动绑定/循环、不复制 runtime、不恢复 mixed fallback。

## 6. 文件范围

### 预计新增

```text
apps/gamelayouteditor/src/io/imported-vni-resource.ts
apps/gamelayouteditor/tests/imported-vni-resource.test.ts
```

如 bundle profile 对话状态可清晰并入现有 picker/session，避免再建碎片模块。

### 预计修改

```text
apps/gamelayouteditor/package.json
apps/gamelayouteditor/src/model/{editor-project,editor-resource,resource-commands}.ts
apps/gamelayouteditor/src/io/{exported-layout-zip,imported-layout-zip}.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/{app-shell,layout-workspace,resource-picker,resources-workspace,ui-session}.ts
apps/gamelayouteditor/tests/{app-shell,editor-store,layout-preview,source-boundary,ui-markup,validation,zip-io}.test.ts
apps/gamelayouteditor/README.md
packages/rendercore/src/scene-layout/{types,manifest,resource,package-resource,runtime,index}.ts
packages/rendercore/tests/scene-layout/{manifest,resource,package-resource,runtime,production-zip}.test.ts
apps/gamelayoutpkgcli/src/{reference-rewriter,asset-groups}.ts
apps/gamelayoutpkgcli/tests/{reference-rewriter,asset-groups}.test.ts
docs/scene-layout-manifest.md
docs/agent-rules/{scene-layout,editor-artifacts}.md
pnpm-lock.yaml
```

`gamelayouteditor` 直接导入 `@slotclientengine/vnicore/core` 校验 bundle，因此新增同版本
workspace direct dependency 并同步 lockfile importer；不新增外部依赖。

### 原则上不应修改

```text
packages/vnicore/**
packages/anieditorv5runtime-cc/**
apps/popupeditor/**
packages/rendercore/src/{symbol,popup,win-amount}/**
apps/game002/**
apps/game003/**
assets/**
AGENTS.md
```

若必须修改 VNI schema/player public API、Cocos runtime、游戏 app 或 root 工具链，属于
明显范围扩张，执行前必须停止说明，不能用修改计划事后合理化。

## 7. 实施步骤

1. **确认基线并建立失败测试**
   - 重查 HEAD/status、规则、task 129 已落地的 coordinate/geometry fast path。
   - 为 VNI manifest kind、Spine false loop、VNI bundle selection、ZIP closure 和
     runtime lifecycle建立当前失败测试。

2. **扩展 rendercore scene-layout 合同**
   - 新增 VNI resource union/parser、Spine boolean loop 和 background 限制。
   - 扩展 asset/package closure、resource factories、URL/package loaders 和 public
     types，严格准备 VNI project/asset URLs。
   - 接入 manual-tick VNI player与 Spine loop flag，完成 origin、visibility、
     geometry reuse、init rollback 和 destroy。

3. **实现 VNI 资源导入 transaction**
   - 解析 bounded bundle ZIP，校验 manifest 和所有候选 project/profile，只展示
     runtime profiles。
   - 选择后结构化 flatten project asset refs，进入统一 import review；冲突、取消或
     prepare 失败不修改原 project。
   - 支持替换已有同类型 VNI resource，并保护所有引用 node 的 playback/placement。

4. **扩展 editor draft、manifest 和 UI**
   - 加入 VNI resource/playback discriminated union、严格 resolve 和 round-trip。
   - 资源列表/过滤器/Picker 显示 VNI stage、duration、profile；VNI 只可创建普通图层。
   - 普通 Spine Inspector 增加 loop checkbox；VNI Inspector 增加 timeline loop
     checkbox；背景继续只展示固定 loop 语义。
   - 复用现有 order、per-variant visibility、`x/y/scale` 和 selection outline。

5. **同步 ZIP、optimizer 与直接 consumer**
   - export/import 收集并校验 VNI exact closure，content-addressed 往返保持 logical
     root、profile metadata 和 node identity。
   - gamelayoutpkgcli 结构化重写 scene VNI root/project asset refs，更新 group closure，
     用 production package parser 复验无 orphan。

6. **测试、文档与收尾**
   - 完成 parser/resource/runtime/editor/UI/ZIP/optimizer 的正常、失败和 rollback 测试。
   - 更新 manifest 文档、README 和最小领域规则；不修改 VNI fixture 或生成配置。
   - 先运行三个目标 package 的定向测试，再运行 lockfile 触发的 L3 命令和人工验收，
     检查 diff，生成任务 134 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 使用真实最小 VNI runtime bundle fixture 或仓库现有合法 fixture 的受控副本，不能用
  fake JSON 跳过 `assertVNIProject()` 和 profile parity。
- player factory 测试验证 init/play/update/destroy 次数、loop flag、非循环完成、
  hidden variant 暂停更新、geometry update 保留 player/playhead。
- 覆盖共享 VNI resource 的两个独立 node、stale async prepare、部分 init 失败 rollback
  和重复 destroy。
- Spine 覆盖 loop true/false、未知 animation、background false-loop 拒绝和旧
  loop:true manifest。
- ZIP/optimizer 覆盖 flat logical keys、content hash、project nested image rewrite、
  missing/orphan/profile mismatch 和 import-export-import parity。

### 验收级别

`L3`。行为风险本可由 rendercore、gamelayouteditor、gamelayoutpkgcli 的直接依赖链
界定，但 gamelayouteditor 新增 vnicore workspace direct dependency 必须同步
`pnpm-lock.yaml`，命中根规则的 L3 条件。

### 执行会话必须运行

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

### 自动化验收重点

- strict schema：VNI kind、Spine/VNI boolean loop、background restrictions、unknown
  key/value failure 和 legacy Spine parity。
- import：single/multi runtime profile、editing-only、profile mismatch、missing/orphan、
  flat alias conflict、cancel/replace atomicity。
- runtime：100% VNI stage geometry、top-left/center、loop/once、variant visibility、
  geometry fast path、shared bytes/independent playhead 和 cleanup。
- editor UI：VNI filter/card/Picker、node add/rebind、Spine animation + loop、VNI loop、
  order、横竖显示、`x/y/scale`。
- delivery：export/import/preview/CDN package/optimizer/group closure 全链路不丢 VNI
  project 或 image，不泄漏 physical hash 为业务 identity。

### 人工验收

1. 在真实浏览器分别导入一个 VNI runtime bundle 和一个 official Spine 4.3 资源；
   确认只进入资源库，没有自动创建图层。
2. 各创建一个普通图层，调整顺序、横竖屏显示、`x/y/scale`；切换 variant 和坐标原点，
   确认位置、选中框和资源播放不跳变。
3. 分别验证 VNI loop/once 及 Spine 指定 animation 的 loop/once；确认 once 不自动
   重播，几何编辑不重置 playhead，背景仍不能关闭 loop。
4. 导出 ZIP、重新导入并预览，再用 gamelayoutpkgcli 优化该 ZIP；确认播放配置、VNI
   profile、node id 和图片内容均保持，输出无 orphan。

### 独立验收建议

`必须`。涉及跨包 public schema、正式 ZIP、VNI/Spine async resource ownership 和
production optimizer。独立复验：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter gamelayouteditor test
pnpm --filter gamelayoutpkgcli test
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 未加载 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载实际失败后才设置现有本地代理并重试原命令。
- 不新增外部依赖；gamelayouteditor 使用 workspace vnicore，并由 frozen lockfile
  install/check 保证 package 与 lockfile importer 一致。

## 10. 生成物、文档与规则

- 本任务不修改 YAML、VNI export fixtures 或生成 TypeScript；若执行发现生成物被影响，
  必须使用对应 generator/checker，禁止手改。
- 更新 `docs/scene-layout-manifest.md`，记录 VNI resource、Spine boolean loop、背景
  限制、stage origin 和 exact closure。
- 更新 `apps/gamelayouteditor/README.md`，说明导入、runtime profile 选择、普通图层
  playback、ZIP 和人工操作。
- 仅在职责边界确有稳定变化时最小更新 `docs/agent-rules/scene-layout.md` 与
  `editor-artifacts.md`；vnicore 本身职责不变，不修改 `vni-runtime.md` 或根
  `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/134-gamelayouteditor-vni-spine-animation-layers-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、关键决策与偏差、实际验收结果、未完成人工验收和剩余
风险；不收集无关 coverage、完整历史矩阵或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- VNI player 包含 texture、particle 和内部 RAF 能力；scene runtime 必须强制
  `autoTick:false` 并证明 destroy/rollback 不留下 ticker、texture 或 Object URL。
- VNI project nested asset 经过 filename-key flatten 和 WebP 后处理会改变 JSON bytes；
  必须重算 hash/size/path 并用 production parser 复验。
- 非循环 VNI 的 particle drain 与非循环 Spine 的完成 pose 底层语义不同；验收以各
  权威 runtime 的自然完成态为准，不在 app 模拟统一假完成帧。
- 多 node 共享同一 VNI resource 时 texture cache/owner 顺序可能出错；必须有生命周期
  测试，不能用“只创建一个 node”回避。

### 假设

- 用户要求的 VNI 循环指完整 project timeline 循环，不是 segmented/manual range。
- 用户要求的常规配置沿用现有普通图层 `order + per-variant x/y/scale/visibility`，
  不包含 rotation、alpha 或 blend mode。
- VNI 交付输入是 AniEditor 导出的 runtime bundle ZIP；loose JSON 不是默认完成条件。
- Spine 单次播放结束后沿用 official Spine player 的完成 pose，不自动 reset 或 hide。

### 待确认

无。上述解释可由当前编辑器、VNI bundle 和 scene-layout 合同落实，执行不需要额外产品
选择。

## 13. 完成清单

- [ ] VNI/Spine 独立导入、普通图层配置和 loop/once 行为已满足。
- [ ] 背景、转场、坐标、variant 和现有资源行为保持。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public schema、exact closure、职责和资源生命周期符合计划。
- [ ] editor、runtime、ZIP、optimizer、README 和规则已按需同步。
- [ ] 指定 L3 自动化验收已通过，人工验收已明确记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的四份领域规则和本计划；
2. 核对 Git 基线与工作区，确认 task 129 的 geometry fast path 未被回退；
3. 按计划实现，不重新制定另一套 VNI/Spine import 或 playback 协议；
4. 小幅适配当前实现时在报告记录；
5. 需要 VNI schema/player、Cocos、游戏 app 或 root 工具链变化时先停止说明；
6. 先做目标 package 最小复现，再运行计划规定的 L3 验收；
7. 完成后生成 UTC 中文执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
