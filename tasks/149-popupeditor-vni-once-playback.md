# 149 popupeditor-vni-once-playback 任务计划

## 1. 目标与完成定义

### 目标

为 Popup Editor 的 award-celebration VNI 图层增加显式“完整单次播放”配置。选择该模式时，rendercore 从 `0` 到 VNI `project.stage.duration` 只播放一次完整 authored timeline，不进入 start/loop/end 三段式 transport，也不会在金额计数结束、跨档或 dismiss 时再跳到另一段尾动画。若金额阶段比动画更长，VNI 到终点并完成粒子 drain 后保持 authored 最后一帧，直到该 tier 真正跨档或 Popup 被关闭才隐藏。

以下载目录中的 `award-celebration-popup (2).zip` 作为真实回归输入：其中三档 `countDurationSeconds` 和 VNI 总时长均为 `5.6s`，改为完整单次播放后应在同一时长边界结束，不再追加当前 segmented 配置产生的 `0.9s/1.0s` end 段。

### 完成定义

- [ ] Popup v1 的 VNI layer `playback` 支持严格判别的 `{ "mode": "once" }`；既有 `mode="segmented"` 和三个分段字段保持原行为。
- [ ] `once` 从 `0` 到 `project.stage.duration` 播放一次，明确关闭 VNIPlayer 默认 loop；终点后只允许既有粒子 drain，不重播、不回绕、不调用 segmented end。
- [ ] 当 `countDurationSeconds > project.stage.duration` 时，动画完成不会移除或隐藏 VNI layer；非粒子 display 保持最后采样帧直到金额阶段结束，之后才按跨档/dismiss 生命周期移除。
- [ ] 金额计数、threshold、跨档、advance、dismiss、immediate cleanup 和 snapshot 保持；提前跨档或 dismiss 时 once 按原 timeline 完成并进入 ending/drain，`dismissImmediately()` 仍可同步清理。
- [ ] Editor 提供播放模式选择；once 不显示、不保存 `loopStartTime/loopEndTime/keepParticlesAlive`，segmented 继续显示并严格校验。
- [ ] 旧 ZIP 继续显示 segmented；选择 once 后导出、重导和 preview 精确保留 once，不通过分段点伪装。
- [ ] 未知 mode、mode-specific 错误字段/区间和资源错配显式失败，不猜测或降级。
- [ ] 指定 ZIP 的三档真实浏览器回归通过，并生成任务 149 UTC 中文执行报告。

## 2. 范围

### 包含

- `packages/rendercore/popup` 的 VNI playback public union、strict parser、资源交叉校验和 award layer runtime。
- `apps/popupeditor` 的 mode 选择、mode-specific 表单、draft/manifest canonical 转换、diagnostics、preview 和 ZIP round-trip。
- rendercore Popup、Popup Editor 和 Popup manifest 的最小文档更新。
- parser、package prepare、runtime transport、Editor UI 和真实 ZIP 的直接回归。

### 不包含

- 修改 `packages/vnicore` 的 transport、schema 或 VNI project；现有 `setLoop(false)` 与 timeline `play()` 已提供能力。
- 修改 Spine `segmented-animations`、image `visibleSegments` 或 image-string 金额生命周期。
- 自动从 VNI 时长推导金额时长、分段点或模式；`countDurationSeconds` 继续是独立显式配置。
- 把所有旧 Popup 包自动迁移为 once；旧 segmented 配置继续按原合同读取和播放。
- 修改下载 ZIP bytes、把约 9.8 MB 用户文件提交为 fixture，或修改 production assets。
- 修改 Game Layout vendoring、scene-layout、游戏 app、依赖、lockfile 或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T10:17:07Z
HEAD: 206d0269b2273032a39bb719e01c3e1a8c9a8b21
branch: detached HEAD
git status --short --untracked-files=all: clean
```

执行时重新核对基线并保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取的规则、模板和文档：

```text
AGENTS.md
docs/agent-rules/editor-artifacts.md
docs/agent-rules/shared-game-runtime.md
tasks/templates/task-plan.md
apps/popupeditor/README.md
packages/rendercore/README.md
packages/vnicore/docs/usage-zh.md
docs/popup-manifest.md
```

真实输入基线：

- `/Users/zerro/Downloads/award-celebration-popup (2).zip` 大小 `9,761,153` bytes，SHA-256 为 `372874982de48438f6f03e4d8995133cd2070a8aec39816195ab1aa17bcaeeff`。
- ZIP 有 47 个 entry：根 manifest、asset map 和 45 个 content-addressed payload，无包裹目录或额外文件。
- 三档 `countDurationSeconds` 与 VNI `stage.duration` 都是 `5.6`。
- bigwin/superwin 的 loop 为 `0.4..4.6`，megawin 为 `0.4..4.7`；request end 后仍有 `1.0s/0.9s` authored tail。

当前实现结论：

- `PopupLayer` 的 VNI playback 只有 segmented；parser 和 Editor 固定要求三个分段字段。
- `award-player.ts` 固定 segmented `play()`，跨档/dismiss 通过 `requestSegmentedPlaybackEnd()` 播放 tail；根因已确认。
- VNI 完整 timeline 已存在但默认 `loop=true`；once 必须显式 `setLoop(false)`。
- timeline 终点会采样 `stage.duration`；particle completion 不隐藏或销毁 display tree，已有最后一帧保持基础。
- Popup tier 只在 `drainEnding()`、`complete()` 或 immediate cleanup 隐藏 container；completion 不移除 layer。
- Editor 固定展示三段字段；typed layer 已通过 parser/ZIP 往返，不需新增 ZIP 旁路。
- 现有测试只保护 segmented，缺 once 的 strict schema、transport、last-frame 和 round-trip 覆盖。

不需要审计完整 Git 历史；真实 ZIP、当前调用链和 vnicore public transport 已足以确认根因。

## 4. 需求解释与技术决策

### 需求解释

- 固定三段已确认是 Popup manifest/runtime 合同，不是 VNI project 多出动画。
- 当前 `5.6s` count/timeline 在 `0.4..4.6/4.7` 循环，end 请求才播放剩余 tail。
- 新配置属于每个 VNI Popup layer，不改变其它 kind，也不默认迁移旧资源。
- once 不在 count/transition/dismiss 另起 end；完整 authored timeline 和正常 particle drain 保留。
- 动画短于 count 时冻结 authored 最后采样；completion 不等于删除，tier/dismiss 才能隐藏。

### 关键决策

1. **在现有 Popup v1 VNI playback 上增加 strict discriminated union**

   ```ts
   type PopupVniPlayback =
     | {
         readonly mode: "segmented";
         readonly loopStartTime: number;
         readonly loopEndTime: number;
         readonly keepParticlesAlive: boolean;
       }
     | {
         readonly mode: "once";
       };
   ```

   once 不携带无效的 loop 字段；segmented 结构和旧包保持不变。新建 VNI layer 默认值仍
   保持当前 segmented，不对既有工作流做隐式迁移。

2. **once 精确映射到 vnicore 的 non-loop timeline**
   - `enter()` 重置 completion，调用 `setLoop(false)` 后播放 timeline；segmented 分支保持当前 API。
   - once 的 `requestEnd()` 不 seek、截断、重播或调用 segmented API；自然 completion 驱动 `isEndComplete()`，immediate cleanup 仍由上层负责。

3. **金额时长与 VNI 总时长保持两个显式合同**
   - once 时长来自 `project.stage.duration`，count 来自 `countDurationSeconds`；不复制、clamp 或强制相等，Editor 同时显示。
   - count 更长时，completion 不改变 `container.visible`，终点采样保留到跨档/dismiss。
   - count 更短或提前 advance 时，once 作为 ending tier 完整播放并 drain；只有 `dismissImmediately()` 立即清理。
   - 指定回归包两者本来就都是 `5.6s`，人工验收必须证明该实际同步用例。

4. **Editor 明确选择并输出 canonical mode**
   - VNI card 增加“分段循环 / 完整单次”；once 只显示 `0..duration`，不渲染 loop 表单。
   - segmented -> once 明确提示分段字段会移除；切回使用现有 visible 初值并要求校验，不保存隐藏 production 表。
   - 所有变化走 store transaction；diagnostics 阻止非法 preview/export，不自动换 mode。

5. **保持 Popup tier 状态机和静态 segment 语义**
   - `PopupSegment`、image visibility、snapshot 和 tier 编排不增加另一套 state；once 的 `applySegment()` 无动作。
   - once 只受 `enter()`、自然 completion、ending drain 和 destroy 控制；preview 与游戏共用 rendercore player。

## 5. 职责与合同

- **vnicore**：拥有 timeline、loop、particle drain、completion 和 destroy；只调用现有 API。
- **rendercore types/parser/resource**：拥有 mode union、字段白名单和 prepared project 交叉校验。
- **rendercore award player**：拥有 transport、tier transition、last-frame hold、ending drain 和 cleanup。
- **Popup Editor**：拥有选择、表单、summary、diagnostics 和 ZIP 往返，不复制 transport。
- **失败策略**：unknown mode、mode-specific 字段/区间、资源 mismatch 和 prepare/import/export 失败显式报错并保持 project。
- **禁止行为**：不以末尾分段点冒充 once，不猜 mode、不加 timer、不 seek 冒充完成、不在 completion 隐藏 layer、不吞 particle drain或复制状态机。

## 6. 文件范围

### 预计新增

```text
tasks/149-popupeditor-vni-once-playback-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/popup/types.ts
packages/rendercore/src/popup/manifest.ts
packages/rendercore/src/popup/package-resource.ts
packages/rendercore/src/popup/award-player.ts
packages/rendercore/tests/popup/fixtures.ts
packages/rendercore/tests/popup/manifest.test.ts
packages/rendercore/tests/popup/package-resource.test.ts
packages/rendercore/tests/popup/award-player.test.ts
packages/rendercore/README.md
apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/tests/project.test.ts
apps/popupeditor/tests/app-shell.test.ts
apps/popupeditor/README.md
docs/popup-manifest.md
```

若现有 select/card 样式不能清楚展示 mode-specific 表单，可最小修改
`apps/popupeditor/src/styles.css`；不为本任务整体改版。

### 原则上不应修改

```text
packages/vnicore/**
packages/rendercore/src/win-amount/**
packages/rendercore/src/scene-layout/**
apps/popupeditor/src/io/resource-import.ts
apps/popupeditor/src/io/popup-zip.ts
apps/gamelayouteditor/**
apps/gamelayoutpkgcli/**
apps/game002/**
apps/game003/**
assets/**
docs/agent-rules/**
AGENTS.md
pnpm-lock.yaml
```

若执行时发现 timeline once 必须修改 vnicore public API，先用最小复现说明缺口；不得在
popup runtime 访问 private transport、增加 timer 或扩大到跨 renderer 实现。

## 7. 实施步骤

1. **确认执行基线与真实输入**
   - 重查 HEAD/status、任务 149、两份领域规则和 Popup/vnicore 当前 public contract。
   - 按 SHA-256 确认 ZIP，复核三档 manifest 与 VNI duration；不修改或提交该文件。

2. **扩展并严格解析 VNI playback contract**
   - 在 `types.ts` 提取/接入 segmented-or-once union。
   - parser 按 mode 使用互斥白名单并冻结对象；segmented 校验区间，once 只允许 `mode`。
   - fixture/parser 测试覆盖旧 segmented、once、unknown mode、错误字段和旧包兼容。

3. **接入 package prepare 和 once runtime**
   - `validateAnimationBindings()` 只在 segmented 验证 loop end；once 不读取分段字段。
   - 默认 VNI runtime 按 mode 选择 transport；once 关闭 loop，segmented 保持当前行为。
   - 两种 mode 的 end、completion、re-enter、transition、drain 和 destroy 共用 ownership。

4. **增加 runtime 和资源回归**
   - 观察 transport：once 每次 enter 只启动一次 non-loop timeline，end 不调用 segmented API。
   - 覆盖动画较短时 completion 后仍显示终点，直到跨档/dismiss 才隐藏。
   - 覆盖动画较长、提前 advance、awaiting-dismiss、drain、restart、immediate cleanup、destroy 和 segmented 兼容。
   - resource 测试覆盖 once 无 loop points、segmented 越界和 prepare rollback。

5. **接入 Popup Editor 配置**
   - model helper 以判别 union 原子切换 VNI playback；新 layer 默认继续 segmented。
   - VNI card 增加 mode select；segmented 显示三段字段，once 只显示完整 timeline summary。
   - 模式切换后立即重跑 project diagnostics；once manifest 不保留 stale loop fields。

6. **保护 preview、导入和 ZIP 往返**
   - project/UI 测试覆盖选择 once、表单显隐、canonical manifest、切回 segmented、
     旧 segmented Popup 导入和错误配置 diagnostics。
   - 正式 exporter/importer 证明 once 精确往返，不增加 app 私有 schema/metadata。
   - production preview 继续调用 rendercore player，UI fake 不替代 runtime 行为。

7. **文档、真实验收与收尾**
   - 更新 Popup manifest、rendercore Popup API 和 Popup Editor README，说明两种 mode、
     once 时长来源、默认值、粒子 drain 与点击/跨档行为。
   - 运行第 8 节 L2 命令；在真实浏览器导入指定 ZIP、切换三档 VNI 为 once、播放并
     round-trip。
   - 检查目标 diff和旧字段残留，生成任务 149 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- parser 测试必须断言 mode-specific exact keys，不能通过放宽 unknown-key 校验接受 once。
- runtime 测试观察真实 transport 调用和 completion/ending 状态，不用 elapsed fake
  直接把 once 标为 complete。
- last-frame 测试必须区分“transport complete”和“tier hidden”：前者不得修改
  `container.visible`，后者只由跨档/dismiss/immediate cleanup 触发。
- segmented 既有 start/loop/end、request end 和 particle keep-alive 测试继续保护兼容。
- Editor 测试经过 select/change/preview/export；manifest snapshot 必须证明 once 不残留
  loop fields。
- fake runtime 只能证明编排；“5.6s 后没有尾段”必须由真实 VNI/Pixi 浏览器验收。

### 验收级别

`L2`。任务扩展 `@slotclientengine/rendercore/popup` public manifest/type contract，并由
Popup Editor 直接消费，同时改变 VNI layer playback lifecycle。无需修改 vnicore API、
根工具链、lockfile 或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor build
pnpm --filter @slotclientengine/rendercore --filter popupeditor lint
pnpm --filter @slotclientengine/rendercore --filter popupeditor format:check
git diff --check
```

失败时先缩小到 `popup/manifest`、`popup/package-resource`、`popup/award-player` 或
`popupeditor` 对应单测，不立即运行根级全仓命令。

### 人工验收

1. 使用 Node 24 启动 `pnpm --filter popupeditor dev`，在真实浏览器打开 Popup Editor。
2. 导入 SHA-256 为
   `372874982de48438f6f03e4d8995133cd2070a8aec39816195ab1aa17bcaeeff`
   的 `/Users/zerro/Downloads/award-celebration-popup (2).zip`。
3. 确认初始 bigwin/superwin/megawin 都显示 segmented，时间分别为
   `0–0.4 / 0.4–4.6 / 4.6–5.6`、`0–0.4 / 0.4–4.6 / 4.6–5.6` 和
   `0–0.4 / 0.4–4.7 / 4.7–5.6`。
4. 将三档 VNI layer 显式改为“完整单次”，保持 tier count 和 VNI stage 均为 `5.6s`；
   分别播放能停留在 bigwin、superwin、megawin 的输入，并覆盖自动跨档和 dismiss。
5. 确认每档只播放 `0..5.6s` 一次，5.6 秒后无 timeline 回绕、无另起 end 段；允许
   authored 粒子按 runtime contract drain，金额、点击和关闭状态正常。
6. 另将一个档位的 `countDurationSeconds` 临时改为大于 `5.6s`（例如 `7s`），确认
   `5.6..7s` 非粒子画面稳定保持 authored 最后一帧、不消失也不重播；到 `7s` 跨档或
   dismiss 后才隐藏该 tier。该临时值只用于验收，不覆盖原下载 ZIP。
7. 导出 Popup ZIP 后重新导入，确认三档仍为 once、manifest 无 loop fields，再次 preview
   行为一致；不覆盖原下载 ZIP，不提交临时导出物。

### 独立验收建议

`必须`。涉及跨包 public schema、真实 VNI playback lifecycle 和正式 Popup ZIP。
独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor test
pnpm --filter @slotclientengine/rendercore --filter popupeditor typecheck
git diff --check
```

另使用指定 SHA-256 的真实 ZIP 做一次 bigwin 和跨档播放、dismiss、ZIP round-trip，不重复
其它命令。

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时才运行 `CI=true pnpm install --frozen-lockfile`。
- 下载失败后才设置仓库代理并重试；本任务的真实 ZIP 已在本地，不需要网络。
- 不新增 package、不修改版本或 lockfile；实现复用现有 rendercore/vnicore 依赖。

## 10. 生成物、文档与规则

- 不修改 YAML、VNI project schema 或生成物；Popup ZIP/map 仍由正式 exporter 生成，
  禁止手改 content-addressed payload。
- `docs/popup-manifest.md` 增加 VNI segmented/once union、字段白名单和生命周期说明。
- `packages/rendercore/README.md` 与 `apps/popupeditor/README.md` 更新最小 public workflow。
- 当前领域规则已把 popup schema/runtime、点击/end drain 和 Editor 职责放在正确 owner；
  新 mode 不改变职责边界，因此不修改 `AGENTS.md` 或 `docs/agent-rules/**`。
- 下载 ZIP 只作为人工回归输入，其 hash 和结果进入执行报告，不复制到仓库资源。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/149-popupeditor-vni-once-playback-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录：

1. 最终实现与实际修改文件；
2. once/segmented 合同和任何计划偏差；
3. 实际验收命令及结果；
4. 指定 ZIP 的 SHA-256、三档真实浏览器结果和 round-trip；
5. 未完成人工验收、剩余风险或未完成项。

不收集无关 coverage 历史、整仓统计或 profiler 数据。

## 12. 风险、假设与待确认

### 风险

- VNI timeline 默认 loop 为 true；遗漏显式关闭会把“尾段”变成整段重播，必须有 transport
  调用断言和真实播放回归。
- once 在提前 advance/dismiss 时自然完成，可能短暂与下一档重叠；这是完整单次语义，
  不能偷偷截断，人工验收需确认产品效果。
- last-frame hold 只保留 VNI 在 `stage.duration` 的实际采样结果；若美术在终点把全部
  非粒子 layer authored 为 invisible，runtime 不应伪造前一帧或静态图来保持可见。
- timeline 终点后 live particle 可能继续 drain；若用户把任何残余粒子都解释为“额外动画”，
  需要另行确认资源粒子生命周期，不能把它误修成 segmented tail。
- 新 once 包需要包含本任务能力的 rendercore 版本；旧 strict runtime 会拒绝未知 mode，
  不应静默改读为 segmented。

### 假设

- 用户要求的是每个 VNI layer 可选的完整单次 transport，不要求把所有 Popup/VNI 默认值
  从 segmented 改为 once。
- 指定 ZIP 三档都应配置 once，并以原有 `5.6s` count/stage 时长验证；原 ZIP 本身保持不变。
- once 动画必须完整播放，普通 advance/dismiss 不截断；只有现有
  `dismissImmediately()` 可立即清理。
- 动画先完成时保持 authored 终点采样，不在 completion 时移除；金额阶段或 Popup 生命周期
  才决定最终隐藏。
- VNI authored 粒子正常 drain 不等同于再次播放 end timeline。

### 待确认

无。固定三段配置、真实包时长、尾段区间和可复用的 non-loop timeline API 均已从当前仓库
和下载文件确认。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] public API、schema、职责和资源生命周期符合计划。
- [ ] segmented/once parser、runtime、Editor 和 ZIP round-trip 测试已覆盖。
- [ ] 指定 L2 自动化验收已通过。
- [ ] 自动化与真实 5.6s 浏览器验收已明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对 Git 基线、工作区和指定 ZIP SHA-256；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. 重大范围扩张或需要修改 vnicore 时先停止说明；
6. 只运行计划规定的 L2 验收；
7. 完成后生成执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
