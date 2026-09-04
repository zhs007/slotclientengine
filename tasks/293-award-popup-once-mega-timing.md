# 293 award-popup-once-mega-timing 任务计划

## 1. 目标与完成定义

### 目标

为获奖庆祝 Popup 增加 Mega VNI `once` 专属的末档金额计时，以及项目级最终金额停留时长。
分段 VNI 的 start/loop/end 和既有计数曲线保持不变；只在 Mega 使用 once 且本轮最终到达 Mega 时，
用最终中奖额减去 Mega 阈值所得的增量拟合有效动画时长，并保证计数速度不低于进入 Mega 时的速度。

### 完成定义

- [ ] Popup Editor 可以配置、预览、导入和导出获奖档 VNI 的 `once`，保留 `segmented` 能力。
- [ ] 仅 Mega once 使用新计数算法；Base、Standard、Big、Super 计数及分段 Mega 计数保持现状。
- [ ] 项目配置显示并保存秒数；Mega once 有效计数时长默认 `Mega VNI 总时长 × 0.66`。
- [ ] Mega 不是 once 时，无需配置 once 有效计数时长，已有合法值不参与播放决策。
- [ ] 最终金额停留时长对两种模式都有效；默认分段模式取 Mega end 时长，once 取 Mega 总时长的 `0.33`。
- [ ] 最终金额、最低停留时间和动画 completion 共同决定关闭；保持自动关闭、FIFO 和 round completion 合同。
- [ ] 新旧 manifest、ZIP 往返、定向测试与真实浏览器视觉验收完成，README 与冲突领域规则同步。

## 2. 范围

### 包含

- `packages/rendercore` 的 Popup versioned data contract、资源准备、金额算法、player 和直接 Scene Layout 集成验证。
- `apps/popupeditor` 的项目配置、award VNI 模式选择、默认秒数计算、资源变更事务及 ZIP 导入导出。
- 当前 Popup manifest 的可选字段扩展、加载默认值和 typed manifest 重写保真；Game Layout 只消费共享能力，不增加配置副本。

### 不包含

- 把 Big/Super once 改为按自身动画时长拟合；修改中奖阈值、下注/中奖额来源或前序档位速度。
- 修改 VNI 底层 timeline/粒子算法、Spine 动画速度、音频 authoring、普通 Spine/single-state Popup 行为。
- 修改具体游戏美术、批量重导 `assets/`、升级 Popup/Scene Layout 格式版本、工具链或 lockfile。
- 本规划会话实施代码、安装依赖、运行重型测试或生成执行报告。

## 3. 制定计划时的基线

```text
UTC: 2026-09-04T04:45:32Z
HEAD: b74f179c140c6810bc3c4d2f4e27d4a5dd10f5c7
branch: detached HEAD（git branch --show-current 为空）
git status --short --untracked-files=all: 空，工作区干净
```

执行时重新检查工作区，保留其间产生的用户修改。

已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`；相关领域合同为
`docs/agent-rules/shared-game-runtime.md` 的 Presentation、
`docs/agent-rules/editor-artifacts.md` 的 Popup Editor，以及 `docs/agent-rules/scene-layout.md`。
本任务路径下未发现额外子目录 `AGENTS.md`。

当前实现与缺口：

- `packages/rendercore/src/popup/data/normalize.ts`：`LATEST_POPUP_MANIFEST_VERSION = 9`；支持的历史版本先 strict parse 再统一升级。
- `packages/rendercore/src/popup/data/types.ts` / `data/manifest.ts`：award 配置已有各档 `countDurationSeconds`，没有本任务两个项目时长。
- `packages/rendercore/src/popup/award-amount-motion.ts`：`createAwardAmountMotionPlan()` 按 canonical span 生成连续加速轨迹，最后统一 terminal brake；没有 Mega once 分支。
- `packages/rendercore/src/popup/award-player.ts`：`start()` 对小额直接 final/end，对大额从 Standard 的下注额开始；`finishAtFinalAmount()` 立即进入 `dismissing`。
- 同文件 `requestAdvance()` 支持跳到下一个非最终阈值或 braking tail；`update()` 在动画全部 drain 后关闭，没有最低停留计时。
- `packages/rendercore/src/popup/vni-playback.ts`：once 使用 timeline 非循环播放；结束请求只作用于 segmented，once 可以自然播完。
- `packages/rendercore/src/popup/core/types.ts`：prepared VNI 已含 `project`，总时长来自 `project.stage.duration`；无需另建资源时长表。
- `apps/popupeditor/src/model/project.ts`：`projectToManifest()` 明确拒绝 award once；`PopupEditorProject` 固定 v9。
- `apps/popupeditor/src/ui/app-shell.ts`：`vniPlaybackMarkup()` 只提供分段编辑，once 被显示为不支持；项目页没有本任务配置。
- `apps/popupeditor/src/io/popup-zip.ts`：负责 manifest 与项目往返；加载补齐的秒数和用户覆盖值必须在此保真。
- `packages/rendercore/src/scene-layout/package-runtime.ts`：`playAwardCelebrationForCurrentMode()` 等待共享 player；FIFO 不允许提前启动下一项。
- 测试主要位于 `packages/rendercore/tests/popup/`、`packages/rendercore/tests/scene-layout/` 和 `apps/popupeditor/tests/`。

## 4. 需求解释与技术决策

### 已确认需求

用户已明确确认：

1. 新拟合逻辑只适用于 Mega；最终落在 Big/Super 时，其计数保持现状。
2. 配置项显示并保存秒数；`0.66`、`0.33` 仅用于计算默认值，不是新增比例字段。
3. `0.66` 和 `0.33` 使用给定小数，不替换为精确的 `2/3`、`1/3`，不强制两者合计等于动画总时长。
4. 不升级 manifest 版本；两个字段可选，加载时根据实际动画补齐缺省值，已配置值优先。
5. Mega 提前完成计数后，最终展示等待配置停留与 Mega 动画剩余时长中的较长者。

### 项目配置与时长来源

在 award 项目页增加下列语义，字段名可按现有命名习惯小幅调整：

| 配置                             | 单位与约束             | 默认与生效条件                                        |
| -------------------------------- | ---------------------- | ----------------------------------------------------- |
| `onceMegaCountDurationSeconds`   | 有限数，严格大于 0，秒 | Mega once 时默认 `0.66 × T`；其他模式忽略合法存量值   |
| `finalAmountHoldDurationSeconds` | 有限数，大于等于 0，秒 | Mega once 默认 `0.33 × T`；分段默认 `T - loopEndTime` |

其中 `T` 来自 Mega VNI 的 `project.stage.duration`，不是 tier 的 `countDurationSeconds`，也不是 loopEndTime。
两个配置属于整个 award 项目，不放在单档 duration 输入或 preview-only 控件中。

- 界面显示实际秒数及默认来源，允许覆盖和恢复默认；合法 override 持久化为秒数，不能把用户输入的 `0.66` 秒当比例解释。
- 源 manifest 字段缺省时，在资源加载完成、实例开始播放前计算并补齐有效配置；保留原输入不可变，返回规范化的秒数。
  已配置值优先，不能把 `0` 秒停留当成缺省；预览、导出和 runtime 使用同一个默认值解析合同。
- 导出保存当前有效秒数，重开后视为明确配置，不再次覆盖；项目可提供“恢复默认”操作按当前资源重新计算。
  资源替换或分段边界变更不悄悄重写已有秒数；新项目尚未具备资源时不编造默认值，资源合法后再补齐。
- Mega 非 once 时隐藏或禁用 once 字段，但保留合法存量值；“忽略”不允许非法类型、NaN 或未知字段绕过 strict schema。
- 时长只读取 Mega 直接拥有的 VNI typed layer，不穿透 Popup Object，也不添加项目级资源选择配置。
  单 VNI 直接采用该资源；多 VNI 的默认聚合采用明确的完成边界：全部为 once 时取总时长最大值作为 T；
  存在 segmented 时不启用 Mega once 拟合，默认停留取各 VNI 末尾展示默认值的最大值
  （segmented 为各自 `duration - loopEndTime`，once 为各自 `duration × 0.33`）。
  这是多图层的统一聚合规则，不按文件名或首项挑选某个隐藏主动画；运行时仍等待全部必要动画完成。
- 没有 Mega VNI 的项目不启用 once 拟合，缺省停留补为 0，保持原有实际末档 end/drain；显式停留仍生效，不伪造 VNI 时长。
- 资源缺失、坏 duration 或分段边界非法属于错误，不能借上述无 VNI 规则降级；资源覆盖失败保持旧项目。

### Mega once 金额拟合

以自然进入 Mega 的时刻作为这段计数和 Mega once 动画的共同起点：

```text
M = betAmountRaw × Mega thresholdMultiplier
F = final winAmountRaw
D = F - M
v0 = 前序金额曲线在进入 Mega 边界的连续瞬时速度
Tgoal = 配置解析出的 onceMegaCountDurationSeconds
```

- 仅在最终档为 Mega、Mega VNI 满足上述 once 条件且 `D > 0` 时替换 Mega 数字段；前序曲线与跨档提交保持不变。
- 不允许为了延长到 Tgoal 而降低已经达到的速度；优先速度下限，其次尽可能贴合目标时间。
- 使用可解析的连续速度曲线：`t = min(Tgoal, D / v0)`（`v0 = 0` 时取 Tgoal），
  `a = 2 × (D - v0 × t) / t²`，`amount(s) = M + v0 × s + 0.5 × a × s²`，`0 ≤ s ≤ t`。
  浮点误差只允许在已证明非负的边界做数值容差处理，不能掩盖非法配置。
- 当 `D / Tgoal >= v0`，通过非负加速度在目标时间到达；否则保持 v0 提前到达，不能先降速再提速。
- Mega once 分支不使用会降至零速的旧 terminal brake；数字精确提交 F 后停止计数，进入最终金额展示。
  速度下限约束到达 F 之前的连续轨迹，不要求整数显示每帧差值都非零，也不要求到达后继续增长。
- `D = 0` 时自然进入 Mega 后直接提交最终金额和停留，不除零、不制造额外滚动；前序算法保持其现有边界语义。
- `amountDurationScale` 继续只影响数字：先将 Tgoal 按本次 scale 换算为有效计数目标，并用同次 scale 下的入档速度拟合；
  不缩放 VNI 或最终停留秒数。scale 为 1 时严格对应项目默认动画占比。

示例：`D=600`、`Tgoal=6` 秒、`v0=200/秒` 时，保持速度并在 3 秒到达；不能降为 100/秒来撑满 6 秒。
`D=1200`、`Tgoal=6` 秒、`v0=100/秒` 时，可连续加速至 300/秒，6 秒到达。

### 最终金额停留与关闭

- 项目级停留配置在实际中奖额到达最终值时生效，涵盖 Base/Standard/Big/Super/Mega；前四档只增加停留约束，不改计数算法。
- 默认时长按 Mega VNI 派生；实际结束时仍等待本轮最后实际显示档位的动画，不强制显示未达到的 Mega。
- 最终金额提交后立即进入既有 `dismissing`；新增 owner-local elapsed/remaining，不新增需要用户再点击的 final-hold phase。
- **停留计时与退场并行**：segmented 当即请求 end，once 从当前位置继续播完，不能重播或跳至末帧。
- 只有“停留时间已满”和“全部必要动画 end/once drain 完成”同时满足才关闭。
  自然播放的最终可见时长为 `max(配置停留时长, 剩余动画完成时间)`，不是停留后再完整播一次 end。
- 用户明确确认的例子：Mega 剩余 4 秒而配置停留 2 秒，等待 4 秒；Mega 剩余 2 秒而配置停留 4 秒，也等待 4 秒。
- 分段默认取 Mega end 时长时，Mega 的既有视觉节奏不变；停留设置为 0 也不会截断动画。
- 动画先完成但停留未满时保留最终金额及合适的 authored 完成画面；不能提前隐藏金额、移除 backdrop 或 resolve session。
- 大 delta 跨越 final 时，只将到达 final 后的剩余时间计入停留，不能把整帧时长重复消费。
- `requestDismiss()` 先提交 F 并进入相同的停留/end 合同；`dismissImmediately()`、取消、销毁仍可立即清理。
- 普通点击保持前序跳档行为；Mega once 无后续档时跳至 F 并启动上述收尾，不倒退金额、不重播 once、也不恢复旧 braking tail。
  已在收尾时的普通点击不跳过最低停留；FIFO 下一项和 `playSpin()` 必须等待全部完成。

## 5. 职责与合同

- **Data**：在当前 award 项目合同中增加两个可选秒数字段，更新 strict parser 的允许字段和类型；
  `LATEST_POPUP_MANIFEST_VERSION`、Editor `formatVersion` 仍为 9，不增加 v10 类型或迁移链。
- **加载补齐**：源 manifest 先严格解析，继续复用现有历史版本到 v9 的 normalization；实际 VNI 元数据准备完成后，
  统一计算缺省秒数并补入有效配置。Data 层没有资源时不猜 duration，资源层不修改调用者的原始 manifest。
- **历史兼容**：没有新字段的已有包仍能加载并自动取得上述默认值；eligible Mega once 自动使用新拟合，
  不要求重新导出、手工启用或额外 feature flag。新增停留可能改变旧包结束时刻，这是本任务要求的默认行为。
- **Core**：从已 prepare 的 exact VNI 资源解析时长，拥有唯一金额轨迹和最低停留计时；不让 Editor/game 计算并逐帧驱动金额。
- **Editor**：只拥有 draft、合法模式切换、项目表单和 IO；once/segmented 字段互斥，切换不会残留非法 playback 参数。
- **Scene Layout**：继续复用同一 player 与 completion，不缓存第二份秒数，不改变队列、输入和 ownership。
- **非 award 类型**：普通 Spine/single-state 与 Popup Object 不增加这两个字段，不改变其格式和行为。
- **失败与生命周期**：非有限时长、坏分段边界、非有限 motion 在可见播放前显式失败；失败、重播、取消、销毁清空新增计时状态。
- **时钟**：只使用宿主 manual update；无 setTimeout、RAF、额外 ticker、动画倍速变更或 raw display tree 操作。

## 6. 文件范围

### 预计新增

```text
packages/rendercore/src/popup/award-timing.ts
packages/rendercore/tests/popup/award-timing.test.ts
tasks/293-award-popup-once-mega-timing-<utctime>.md
```

`award-timing.ts` 只承载资源元数据到有效秒数的唯一解析；若现有 core 模块足以容纳，可不新增独立文件。

### 预计修改

```text
packages/rendercore/src/popup/data/{types,manifest,normalize,index,state-visibility}.ts
packages/rendercore/src/popup/core/{types,index,package-resource}.ts
packages/rendercore/src/popup/{award-amount-motion,award-player,package-resource}.ts
packages/rendercore/tests/popup/{manifest,package-resource,award-amount-motion,award-player,public-boundary}.test.ts
packages/rendercore/tests/popup/fixtures.ts
packages/rendercore/tests/scene-layout/{package-runtime,configured-round-adapter}.test.ts
apps/popupeditor/src/model/project.ts
apps/popupeditor/src/ui/app-shell.ts
apps/popupeditor/src/io/popup-zip.ts
apps/popupeditor/tests/{project,app-shell,preview}.test.ts
apps/popupeditor/README.md
packages/rendercore/README.md
docs/agent-rules/{editor-artifacts,shared-game-runtime}.md
```

`apps/gamelayoutpkgcli/src/reference-rewriter.ts` 和 Game Layout 的 typed Popup 消费点仅在可选字段传播或重写保真确需时适配，
并补对应定向测试；不扩大为 Layout 配置 UI 或另一套时长算法。

### 原则上不应修改

```text
packages/{vnicore,logiccore,audiocore}/**
apps/{gameviewer,gameviewer2}/**
assets/**
package.json
pnpm-lock.yaml
AGENTS.md
```

## 7. 实施步骤

1. **确认基线与兼容路径**：重新核对规则、HEAD 和工作区；锁定两个可选字段、缺省补齐、显式值优先和多图层聚合合同。
2. **实现数据与加载时长解析**：在现有版本增加可选字段，从 prepared metadata 补齐缺省秒数；证明旧包无需重导即可加载并应用默认行为。
3. **实现 Mega once 拟合**：在 amount motion 中仅替换 eligible Mega 段，验证解析公式、速度连续性、提前完成和零增量边界。
4. **实现最终停留**：在共享 player 的 `dismissing` 中并行消费停留与动画 completion，处理点击、自然到达和 large delta；保持同步金额提交。
5. **接入 Popup Editor**：开放 award once 模式，项目页增加两个秒数配置；完成默认值、恢复默认、模式切换、覆盖及 ZIP 往返。
6. **验证直接 consumer**：确认预览和游戏使用同一 runtime，新的最低停留不会导致 session 提前完成；typed manifest 重写保留 timing 配置。
7. **文档和收尾**：更新 README 与被本需求替代的领域条款，执行 L2 定向验收和浏览器观察，生成 UTC 中文报告。

## 8. 测试与验收

### 关键测试

- 数据：版本号保持 9，合法秒数、加载补齐、显式值优先、零停留、无效 duration、多 VNI 聚合、segmented 忽略合法 once 值、历史包缺省行为。
- 计数：自然到达 Mega once，目标平均速度高于/等于/低于 v0；金额不倒退、速度连续且不低于 v0、最终 raw 值精确。
- 边界：恰好 Mega 阈值、阈值加 1、大额、前档 duration 为 0、非 1 amount scale、不同帧切片；数值溢出明确失败。
- 不变性：Base/Standard/Big/Super 计数、分段 Mega 计数和终点 braking、前序点击跳档保持现有合同。
- 关闭：hold 为 0/短于/等于/长于 end 或 once 剩余时长；动画提前结束、点击提前到达、连续重播和长帧跨 final。
- 生命周期：自然完成、requestDismiss、immediate dismiss、queued cancel、destroy；不串前一次计时、金额或 formatter，队列和 round 不提前 resolve。
- Editor：once 可新建/切换/导出；秒数只在项目配置持久化，资源变更不覆盖已有秒数，恢复默认重新计算；失败保留旧项目。
- ZIP：当前 v9 导出重导、历史缺字段包加载、typed reference rewrite 后字段与行为保真；无需提交真实游戏美术作为测试 fixture。

### 验收级别与命令

实施使用 `L2`，因为改动跨 rendercore/Popup Editor 的正式 schema、ZIP 和直接 consumer。规划会话仅做 L0 文档检查。
执行环境先按第 9 节启用 Node 24，运行以下六条命令；不默认执行根级全仓验收：

```bash
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/popup tests/scene-layout/package-runtime.test.ts tests/scene-layout/configured-round-adapter.test.ts
pnpm --filter popupeditor exec vitest run tests/project.test.ts tests/app-shell.test.ts tests/preview.test.ts
pnpm --filter popupeditor build
git diff --name-only -z --diff-filter=ACM -- '*.ts' '*.md' '*.css' '*.json' | xargs -0 pnpm exec prettier --check --ignore-unknown
git diff --check
```

- 格式命令只在变更均属于本任务时直接使用；存在用户修改时改为本任务精确文件清单，并加入新增未跟踪文件。
- typecheck/build 中 package 自带的 prepare:deps 属于必要依赖编译，不额外扩展全仓测试。
- 若确实修改 CLI 或 Layout Editor 实现，追加受影响现有测试文件的精确 `vitest run` 命令，并记录触发原因；不直接运行其全量测试。

### 人工验收

1. 在 Popup Editor 使用真实 VNI，分别验证 Mega segmented 与 once；设置项目秒数、保存重开，确认默认值来自实际资源。
2. 用不同中奖额覆盖能够拟合和必须提前结束两种情况；观察 Mega 入档金额同步、无降速、最终停留和动画完整收尾。
3. 检查 final 在 Big/Super、小额 Base、恰好 Mega 阈值、点击提前完成、重播，以及停留比动画短/长的情况。
4. 在 Scene Layout 消费一次导出的 Popup，确认 canvas 输入、backdrop 和下一条 FIFO 请求在完整停留结束后才交接。
   浏览器视觉结论不能由 mock player、单测或 build 替代；资源不足时如实记录未完成项。

### 独立验收建议

`建议`：复核可选字段/加载补齐、速度下限和 completion/清理三处；不涉及 credential 或服务器数据边界。
优先复验 `tests/popup/award-amount-motion.test.ts`、`tests/popup/award-player.test.ts` 和 `apps/popupeditor/tests/project.test.ts`，
不重复整套验收，不要求规划会话启动子代理。

## 9. 环境与依赖

- Node.js 24 与 pnpm；当前 shell 无可直接执行的 node，已有 `/Users/zerro/.nvm/versions/node/v24.14.0`。
- 执行时可使用 `source /Users/zerro/.nvm/nvm.sh` 后 `nvm use 24`，不切换 npm/yarn。
- 不新增依赖；只有实施时依赖缺失才执行 `CI=true pnpm install --frozen-lockfile`。
- 下载实际失败后才设置仓库约定代理重试；不为规划安装依赖或修改 lockfile。

## 10. 生成物、文档与规则

- Popup manifest/ZIP 由正式 Editor export 路径生成，不手改生产资源、dist 或生成 TypeScript。
- 本任务无预定 YAML 修改或批量资源生成；发生正式生成物变化时运行其现有 checker，并记录精确命令。
- 更新 Popup Editor/rendercore README，说明仅 Mega once 拟合、缺省加载补齐、秒数保存、速度优先和自动停留。
- 更新 `editor-artifacts.md` 中禁止 award once 的条款，以及 `shared-game-runtime.md` 中统一 terminal braking/关闭条件的相关条款。
  用户本任务明确授权这些行为变化，旧条款不构成再次请求权限的理由；分段流程与共享 ownership 继续保留。
- 不将配置值、资源时长和任务证据追加到根 `AGENTS.md`。

## 11. 执行报告

规划不生成报告。实施完成后创建 `tasks/293-award-popup-once-mega-timing-<utctime>.md`，
时间使用 `date -u +%y%m%d-%H%M%S`。简要记录实现、实际文件、合同偏差、验收命令与结果、浏览器证据和剩余事项。

## 12. 风险、假设与待确认

### 风险

- 速度下限和目标时长可能不能同时满足：按用户要求优先速度，实际计数可以短于 0.66 动画时长。
- once 剩余动画可能超过配置停留，尤其点击提前到达时；自动关闭必须等待动画完成，不能把最低停留误当强制截断期限。
- 多个 Mega VNI 或混合播放模式必须按明确聚合规则处理，不能按首项决定一次性/分段模式。
- 不升级版本仍需更新 strict parser 的可选字段白名单；旧版工具未更新时可能拒绝含新字段的 ZIP，不能假称旧二进制能读取新字段。

### 本计划采用的解释

- 项目停留对每次最终金额展示生效，默认按 Mega 来源计算；Big/Super 的“保持现状”指计数而非禁止新增停留约束。
- 停留是与 end/once 剩余动画并行的最短展示时间，避免分段默认额外等待一遍 end。
- 没有 Mega VNI 的历史项目无需补造资源；有 Mega VNI 但没有秒数的项目加载时自动补齐并生效。
- 多 VNI 聚合为本计划的实现决策；无需用户新增资源选择字段。

### 待确认

无阻塞项；仅 Mega、配置保存秒数、不升级版本且加载补齐，以及停留/剩余动画取较长者均已获用户明确确认。
其余按上述解释实施，若用户另行纠正则同步调整计划。

## 13. 完成清单

- [ ] Mega once 拟合与速度下限、其他计数不变性满足。
- [ ] 项目秒数配置、自动默认、once 条件生效和 ZIP 往返满足。
- [ ] 最终停留、动画 drain、点击、FIFO、round completion 和 cleanup 满足。
- [ ] manifest 版本不变，缺字段包加载补齐，已有值优先，实际变更未越界或偏差已报告。
- [ ] 定向自动化、真实浏览器验收、README 与领域规则同步完成。
- [ ] UTC 中文执行报告已生成，未完成项如实列出。

## 14. 执行会话交接

1. 读取根 `AGENTS.md`、本计划与第 3 节列出的相关领域规则；重核 Git 基线，保留用户修改。
2. 按已确认的 Mega-only、秒数配置和本文算法/停留合同实施，不把拟合扩展到 Big/Super。
3. 小幅适配记录于报告；明显扩大 API、依赖、资源或职责范围时先说明证据，不改计划事后合理化。
4. 只运行规定的 L2 验收；完成后生成报告，区分自动化结果与实际浏览器观察。
5. 除非用户另有明确要求，不 commit、不 push、不创建 PR。
