# 132 game002-cm-cn-multiplier-flow 任务计划

## 1. 目标与完成定义

### 目标

在任务 131 已完成的 WL/WM settled-transform 基础上接入服务器新增的 CM 倍数流程，并按正式编辑器合同重新生成 Symbols ZIP、Scene Layout ZIP 和 `skin=2` 的 `assets/crave`。

每个 spin/refill 的中奖前顺序固定为：

```text
全部 symbol 落定
-> 任务 131 的延迟 WL Start / WM multiplier / WM -> CN（若有）
-> CM Feature1
-> 当时全部 CN 同时 Feature_Change 并提交 bg-updcn value
-> CM Change
-> CM 原位置替换为带 bg-gencmcn value 的 CN
-> 现有中奖/cascade
```

### 完成定义

- [ ] `/Users/zerro/Downloads/crave-symbols-fixed.zip` 与 `crave-wl-num.zip` 经 Symbols Editor 正式模型配对，生成任务 132 Symbols ZIP；WL/WM 的任务 131 配置完整保留，CM 复用同一 ImgNumber dependency。
- [ ] CM 倍数文本使用 app-owned `x${value}` formatter，并绑定供应 CM Spine 的
      exact slot `Mult`；不增加 `Multi` alias、字体 fallback 或第二份 glyph 资源。
- [ ] CM manifest 显式提供 `appear -> Start once`、`feature1 -> Feature1 once`、`change -> Change once`；CN 四档 active Spine 统一提供 `featureChange -> Feature_Change once`。
- [ ] `bg-gencm.scene` 是 spin/refill 的最高优先级落定盘面；不存在时依次使用
      `bg-genwm.scene` 和 `bg-spin/bg-refill.scene`，initial 与 refill 规则一致。
- [ ] 每个 initial/refill settled step 最多出现一个 CM；出现时从
      `bg-setcm.otherScene` 当前唯一 CM cell 读取 positive safe integer，非目标 cell
      保留给服务器其它用途，不要求为零；多个 CM 必须显式失败。
- [ ] WM 全流程先完成并提交中间 CN，再处理 CM；`bg-updcn.otherScene` 权威更新
      当时全部 CN（包括本批 WM 新转成的 CN），并严格校验已确认的倍数算术。
- [ ] `bg-cm2cn.scene` 只把本批 CM 原位置改为 CN，其它位置/code 不变；
      `bg-gencmcn.otherScene` 为每个新 CN 提供 positive safe integer。
- [ ] CM 落下时正常播放 appear；等待整盘落定及 WM 完成后，该 CM 播放 Feature1，随后当时全部 CN 并行播放 Feature_Change 并同时变值，再播放 CM Change；Change 真实 once completion 后原子提交 CM -> CN，才允许 `bg-win`。
- [ ] 无 CM 时任务 131 的 WL/WM、spin、期待、cascade、CN collect/summary、
      popup 和 cleanup 行为及 trace 不变，不制造空 CM 阶段。
- [ ] `/Users/zerro/Downloads/crave-v2.zip` 用任务 132 paired Symbols 更新并经
      Game Layout Editor 导出/重导；BaseGame、FreeGame 都绑定同一新 Symbols。
- [ ] 用任务 132 layout 输出完整更新 `assets/crave` 和 generated imports；只支持
      `skin=2`，不恢复、不修复也不打包 `skin=1`。
- [ ] 完成 L2 定向自动化，提供两个编辑器与 game002 的用户浏览器验收入口、fixture
      和清单，并生成 UTC 中文执行报告；未经用户反馈不宣称浏览器验收通过。

## 2. 范围

### 包含

- Symbols Editor authoring：从原始 Symbols ZIP 重放任务 131 的 WL/WM 配置，再增加 CM ImgNumber/state 与 CN `Feature_Change` state，完成 edit/export/reimport 探针。
- Game Layout Editor authoring：导入任务 132 Symbols，替换 `game002-s3` dependency，保持两个 mode、main reel、popup、background 和 geometry。
- `assets/crave` mapped package、generated Vite imports、game002 资源闭包与 skin2-only
  release。
- game002 component profile、scene precedence、CM value hydration、WM 后 CM 的 immutable transform 编译、presentation metadata 和真实动画 completion orchestration。
- 现有 generic settled-transform、prepared visible replacement、active Spine value
  presentation 和 cleanup/rollback 合同的直接复用。
- 直接保护上述合同的 app/editor 测试、README、动画时序文档和最小 game002 领域规则。

### 不包含

- 不支持 `skin=1`，不恢复 legacy skin selector，也不修改 `assets/game002-s2` 或
  `assets/game002-s3` 作为 production 来源。
- 不改服务器协议、RNG、真实轮带、bet/paytable、免费游戏 mode resolver。
- 不把 `bg-gencm/bg-setcm/bg-updcn/bg-cm2cn/bg-gencmcn`、CM/CN 或具体动画名写入
  logiccore、rendercore、gameframeworks。
- 不从金额、候选值、其它 component cell 或客户端随机推导 CM/CN 正式值。
- 不覆盖三个 Downloads ZIP，不手改 content-addressed payload、assets map 或
  generated TypeScript。
- 不顺手调整任务 131 的动画节奏、Nearwin、win carousel、loading 99%/100%、
  popup 或 Leo UI。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T13:10:52Z
HEAD: 1dbef313d7007d6d66a5f6f424d6cbf14a24f500
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 131 计划与执行报告；因本会话只新增任务计划文档，按根规则未加载领域规则。执行会话必须读取 `docs/agent-rules/game002.md`、`shared-game-runtime.md`、`loading-ui.md`、`editor-artifacts.md` 和 `scene-layout.md`；相关实现目录没有更深层 `AGENTS.md`。
- 输入 SHA-256：
  - `crave-symbols-fixed.zip`：
    `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835`
  - `crave-v2.zip`：
    `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`
  - `crave-wl-num.zip`：
    `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487`
- 三个输入与任务 131 记录的 hash 相同；任务 132 必须从这些原始输入确定性重放
  WL/WM 与 CM authoring，不能把已映射的 `assets/crave` 当作编辑源。
- 当前 `assets/crave` roots 为：
  - `layout.manifest.json`
    `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09`
  - `assets.map.json`
    `b9add092508be43c29c751eb7d01e0a233385a1dbb85b659e673d6bbd2bf79bd`
- 当前 task131 Symbols 已有 WL/WM 共用的 `wl-wm-multiplier.image-string.manifest.json`、WM `multStart/multIdle/multEnd/change` 和 multi-target node；CM 仍只有 `normal/dropdown/appear/remove`，CN 尚无 `featureChange` semantic state。
- 供应 CM Spine 版本为 4.3.23，exact animations 为
  `Change,End,Feature1,Feature2,Idle,Start`，exact multiplier slot 为 `Mult`；
  没有 `Multi`。四个 `CN_1..4` 都包含 exact `Feature_Change`。
- `createGame002WlWmMultiplierCompiler` 当前只解析
  `bg-genwilds/bg-genwm/bg-setwm/bg-updwl/bg-wm2cn/bg-genwmcn`；
  `Game002RoundTarget` 只有 WL Start 与 WM 四段状态机。
- logiccore 当前会在 settled 后、win 前生成一个中性 immutable transform step；rendercore 已提供真实 once/loop completion counter 和 prepared occurrence replacement。CM 可作为该 transform 内的第二个 game-owned presentation stage，默认不需要扩大 shared public API。

## 4. 需求解释与技术决策

### 需求解释

- 用户所说“slot 是 Multi”解释为 multiplier 文本挂点；供应 ZIP 中可执行的
  exact slot 是 `Mult`。manifest 和 runtime 使用 `Mult`，未知 `Multi` 不做 alias。
- `bg-gencm > bg-genwm > bg-spin/bg-refill` 是严格互斥的 scene 选择优先级，不合并
  scene；被较高优先级覆盖的 component scene 不作为最终盘面。
- “先 WM、再 CM、再中奖”适用于 initial spin 和每次 cascade refill。WM 的
  Change 完成并提交中间 CN 后，CM 才进入 Feature1；CM 全部完成后才生成 win step。
- `bg-updcn` 作用于 WM 处理后的中间盘面，因此既包含落定时已有 CN，也包含本批
  WM 新转成的 CN；本批 CM 自己尚未变成 CN，不参加本次 `bg-updcn`。
- 服务器保证每个 settled step 最多一个 CM；`bg-updcn` 的每个目标 CN 必须等于
  WM 后中间值乘该唯一 CM 倍数。initial spin 与任意 cascade refill 使用完全相同的
  CM component、算术与表现合同。
- CN 值在请求所有 CN 的 `featureChange` state 时原子切换到服务器权威值；CM 的 Change completion 才提交 CM -> 新 CN。动画开始/完成都以 runtime counter，不使用 timer。
- CM appear 使用已有落点状态流程：CM 自己落定时播放 `Start`，无需等全盘；Feature1
  必须等全盘和 WM 阶段完成。
- 唯一 CM 与所有受影响 CN 的 Feature_Change 按既定阶段推进；CN 之间并行。稳定位置
  顺序只用于 plan、准备、rollback 和测试。

### 关键决策

1. **从原始 ZIP 重放完整 Symbols authoring。**
   任务 132 脚本先重建任务 131 的 WL/WM states/node，再加 CM/CN；不依赖手改 manifest 或上一次未跟踪 artifact，保证新 Symbols ZIP 可独立复现。
2. **复用唯一 multiplier ImgNumber dependency。**
   `crave-wl-num.zip` 在一个 Symbols package 中只安装一次；WL、WM、CM 分别拥有 logical node，但引用同一 resource closure。保留现有 dependency id，避免只为命名产生全包 hash churn。
3. **CM 继续使用 task131 的单一 generic settled-transform。**
   logiccore plan 保存 settled input 到 CM 完成后的 final output；game002-owned presentation batch 额外保存 WM 后中间 snapshot、CM multiplier、CN 更新和两类 replacement。shared 层不认识业务 phase。
   initial/refill 共用这一 compiler/target，不增加 refill 专属状态机。
4. **两段提交均有明确边界。**
   WM Change 后只提交已准备的 WM -> 中间 CN；CM Change 后提交 CM -> CN，并确认
   全盘与 plan final snapshot 一致。任何阶段失败都由 round cleanup 释放尚未提交项，
   已开始表现不能遗留半提交宿主状态。
5. **`bg-*` 是服务器权威，客户端负责 strict consistency。**
   `bg-updcn`、`bg-cm2cn`、`bg-gencmcn` 决定正式结果；客户端校验矩阵、目标位置、
   value 和算术，不随机生成、不从最终 win amount 反推。
6. **编辑器只增加 task132 authoring，不预设编辑器核心改动。**
   现有 custom state、activeSpine、multi-target 和 dependency replace 已覆盖需求；
   只有测试证明 round-trip 有真实缺口时才最小修改 editor model/IO/UI。

## 5. 职责与合同

- **game002 plan compiler**：认识 component/symbol、scene precedence、WM 中间结果、
  CM multiplier、CN 算术和最终 transform draft；所有数据在 renderer mutation 前
  编译并冻结。
- **game002 presentation target**：按 batch 执行 WL/WM 后 CM 状态机，准备/提交两类
  replacement、更新 CN value/text/tier，并检查真实动画边界。
- **logiccore/rendercore/gameframeworks**：继续只拥有中性 plan、coordinator、
  occurrence/value transaction 和 renderer capability；默认不改 public contract。
- **Symbols Editor**：拥有 CM/CN state、exact animation/slot、ImgNumber dependency
  和 package closure；导出 canonical ZIP。
- **Game Layout Editor**：拥有 paired Symbols dependency、两个 mode binding 和
  mapped layout ZIP；不保存服务器流程。
- **生命周期**：preflight 准备所有资源和 replacement；WM/CM 各自在真实 Change 边界 commit；未提交项在 compile/execution failure、next-spin、destroy 时 rollback/destroy；late async prepare 不得在 cleanup 后提交。
- **失败策略**：缺/重复 component scene、矩阵错位、未知 symbol/state/slot/glyph、
  非正或溢出 value、算术不符、scene precedence 漂移、非目标 code 改动、ZIP
  hash/orphan 漂移均显式失败。
- **禁止行为**：不维护第二份资源/动画/component 表，不猜路径/slot/value，不用
  静态 delay 冒充 completion，不以全盘 `applyScene()` 重建无关 occurrence。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/scripts/build-task132-symbols.ts
apps/gamelayouteditor/scripts/build-task132-layout.ts
tasks/artifacts/132/game002-s3-symbols-task132.zip
tasks/artifacts/132/crave-layout-task132.zip
```

### 预计修改

```text
assets/crave/**
apps/symbolseditor/package.json
apps/gamelayouteditor/package.json
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/{cascade-config,cascade-sequence,wl-wm-multiplier-plan}.ts
apps/game002/src/{game-adapter,game-demo}.ts
apps/game002/tests/{cascade-sequence,wl-wm-multiplier-plan}.test.ts
apps/game002/tests/{game002-round-transform,game-adapter,bootstrap-flow}.test.ts
apps/game002/{README.md,docs/animation-flow-and-timing.md}
docs/agent-rules/game002.md
tasks/132-game002-cm-cn-multiplier-flow-<utctime>.md
```

若 editor round-trip 测试暴露真实缺口，才增加 `apps/symbolseditor/src|tests` 或
`apps/gamelayouteditor/src|tests` 的最小改动，并在报告说明。

### 原则上不应修改

```text
assets/game002-s2/**
assets/game002-s3/**
assets/gamecfg002/gameconfig.json
apps/game003/**
packages/{logiccore,rendercore,gameframeworks,netcore,uiframeworks,gameloading*}/**
apps/gamelayoutpkgcli/**
pnpm-lock.yaml
```

若现有中性 transform 或 activeSpine public API 被证明确实无法表达两阶段 transaction，必须先说明 public API 扩展理由并将验收扩大到直接 consumer，不能把 game002 语义下沉。

## 7. 实施步骤

1. **确认执行基线与协议 fixture**
   - 重核 HEAD/status、三个输入 ZIP hash、当前 `assets/crave` roots 和任务 131 行为。
   - 增加 initial 与 refill constructed fixture：step 含 WL、WM、已有 CN、唯一 CM、
     五个 CM component 和 `bg-win`；锁定 x-major 6x9 matrix、component scope、
     唯一 CM 及目标 cell。

2. **配对并导出任务 132 Symbols ZIP**
   - 导入原始 `crave-symbols-fixed.zip` 与 `crave-wl-num.zip`，确定性重放任务 131
     WL/WM authoring。
   - 为 CM 增加 `feature1/change` semantic state，分别绑定 exact `Feature1/Change` once；CM multiplier node 覆盖 `normal/dropdown/appear/feature1/change` 的 exact `Mult`。
   - 为 CN 增加 `featureChange` once，并用 `activeSpine/Feature_Change` 统一绑定四档。
   - 执行可逆 edit -> export -> reimport 探针，恢复正式值后导出
     `game002-s3-symbols-task132.zip`；验证 dependency 只安装一次、CN 原 ImgNumber
     不变、closure deterministic，不覆盖输入 ZIP。

3. **更新 layout ZIP 与 skin2 assets**
   - Game Layout Editor 导入任务 132 Symbols 和原始 `crave-v2.zip`，显式替换 `game002-s3` dependency；BaseGame/FreeGame 均保持 package、main reel、`reels-001`、grid-cell binding、placement、background 和 popup。
   - 执行可逆 layout edit/export/reimport 探针，恢复正式值后导出
     `crave-layout-task132.zip`。
   - 用输出完整替换 `assets/crave` mapped folder，移除旧 map 专属 orphan，再运行
     正式 generator；记录两个 ZIP 与两个 root manifest 的 size/SHA-256。

4. **扩展 scene 与 value 编译**
   - 在 app-owned component profile 增加
     `gencm/setcm/updcn/cm2cn/gencmcn`。
   - `resolveSettledScene` 和 cascade parity 同步实现
     `gencm > genwm > spin/refill`；每个触发 component 必须 exact one scene。
   - 将 CM code 加入 auxiliary value symbol；从 `bg-setcm.otherScene` 只 hydrate
     唯一 CM 目标 cell，保留其它 cell 数据；0 个 CM 不进入 CM 阶段，超过 1 个失败。

5. **编译 WM 后 CM 的 immutable final transform**
   - 复用任务 131 先算并校验 WL/WM，构造 WM -> CN 的权威中间 scene/value。
   - 在中间盘面枚举全部 CN，校验每个 `bg-updcn` 值等于中间 CN 值乘唯一 CM 倍数；
     验证 `bg-cm2cn` 只转换该 CM，`bg-gencmcn` 只为新 CN 提供合法值。
   - transform draft 直接描述 settled input 到 CM 完成后的 final output；presentation batch 冻结 WM 中间值、CN 更新、CM 位置/倍数和最终 replacement 数据。
   - 无 CM 时严格要求 CM-only components 不触发，并保持任务 131 draft/trace；
     有 CM 但无 WM、无既有 CN 或无 win 时仍按合法最小阶段执行。

6. **接入 CM presentation**
   - preflight 检查所有 CM `feature1/change`、所有中间 CN `featureChange` capability，
     并 prepare WM/CM 两组 replacement。
   - 先运行并完成现有 WL/WM 状态机；WM Change completion 提交中间 CN。
   - 批量请求 CM `feature1` 并等待真实 once；随后一次提交全部 CN value/text/tier，
     批量请求 `featureChange` 并等待真实 once。
   - 批量请求 CM `change`，真实 once completion 后原子 commit CM -> CN；校验 final
     visual snapshot 后完成 settled-transform，coordinator 才进入 win。
   - cleanup/destroy 对未提交 replacement rollback/destroy，清除 counters/batch，
     不重置无关 symbol timeline。

7. **测试、文档与交付**
   - compiler 覆盖 scene precedence、CM hydration、WM 后 CN 参与乘法、CM-only、
     无 CM parity、矩阵/算术/overflow/partial component strict failure。
   - target 覆盖 exact event trace、批量同步、真实 once boundary、两阶段 commit、
     prepare failure、执行中 cleanup/destroy 和无空阶段。
   - 两个 authoring 脚本覆盖 import/view/edit/export/reimport 与 package/map/orphan；
     game002 覆盖 initial/refill、期待路径和 release closure。
   - 更新 README、动画时序和最小 game002 规则；提供浏览器 fixture/清单，生成任务
     132 UTC 中文报告。

## 8. 测试与验收

### 测试原则

- constructed fixture 保护结构，若取得脱敏 live payload 再增加协议 fixture；fake
  animation 只验证状态机，不能冒充真实 Spine completion 或浏览器视觉。
- 覆盖 initial/refill 的唯一 CM、拒绝多个 CM、单/多 CN、WM 新 CN、CM-only、
  WM-only、无 win、no-op、safe-integer overflow、缺/重复 component、matrix 错位
  和 cleanup。
- 资源测试覆盖 exact `Mult`、CM node targets、四档 `Feature_Change`、唯一 ImgNumber、
  BaseGame/FreeGame binding、map/hash/path/orphan 和 skin2-only。
- 以 occurrence id、scene、value、text、state completion counter 和 commit trace
  断言；不用 sleep 或像素相等代替合同。

### 验收级别

`L2`。任务更新正式 Symbols/Scene Layout ZIP、mapped assets、generated imports 和
game002 直接 consumer；现有 shared public API 原则上不变，范围可由三个 app 界定，
不涉及根工具链、lockfile 或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor --filter gamelayouteditor --filter game002 typecheck
pnpm --filter symbolseditor --filter gamelayouteditor --filter game002 test
pnpm --filter symbolseditor --filter gamelayouteditor build
pnpm --filter game002 check:crave-layout-resources
pnpm --filter game002 release:check
git diff --check
```

如实际修改 shared public API，以上前两条必须加入对应 shared package 和直接
consumer；这属于已说明的验收升级，不运行无关整仓命令。

### 用户浏览器验收（由用户执行）

- Symbols Editor：导入 task132 Symbols ZIP，查看/修改/导出/重导；预览 CM
  `appear/feature1/change` 与 `xN` exact `Mult`，预览四档 CN `featureChange`；
  WL/WM/CN 原配置无回归。
- Game Layout Editor：导入 task132 Symbols 与 Layout ZIP，检查两个 mode binding、
  reel preview、geometry、background、popup，完成修改/导出/重导。
- game002 `skin=2`：fixture 观察 CM 落点 Start 不阻塞其它落点；整盘和 WM 完成后
  CM Feature1、所有中间 CN 同时 Feature_Change/变值、CM Change、原位置新 CN，
  然后才中奖；分别验收 initial spin 出 CM 和 cascade refill 出 CM。
- 复验 WM-only、期待、cascade、CN collect/summary、popup、resize、next-spin、
  execution failure、destroy 和 console；有 live credential 时记录 live smoke。

用户未反馈前执行报告标记“待用户验收”，不能把自动化或 fake runtime 写成浏览器通过。

### 独立验收建议

`必须`。涉及服务器 otherScene 算术边界、正式 ZIP/map/generated 交付物、两阶段
prepare/commit/rollback/destroy。独立复验重点：

1. shared package 无 game002 component/symbol/animation hardcode；
2. scene 优先级与 WM -> CM -> win 顺序在 initial/refill 一致；
3. paired ZIP 只有一个 multiplier ImgNumber，layout closure 无 orphan，失败/cleanup
   不留下半提交盘面。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 未启用 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- 只有实际下载失败后才设置仓库约定代理并重试原命令。
- 预计不新增依赖、不修改 `pnpm-lock.yaml`；若确需新增必须先说明原因和直接影响。

## 10. 生成物、文档与规则

- Symbols/Layout ZIP 必须由 task132 authoring 脚本输出；mapped assets 由 Layout
  Editor export 更新，generated TypeScript 由正式 generator 更新，均禁止手改。
- 报告记录三个输入 ZIP、两个输出 ZIP、`layout.manifest.json`、`assets.map.json`
  的 byte length 与 SHA-256，并证明 Downloads 输入未变。
- 更新 `apps/game002/README.md` 和动画时序；只在 CM-after-WM-before-win 成为稳定
  领域合同处最小更新 `docs/agent-rules/game002.md`，不把资源清单复制到根规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/132-game002-cm-cn-multiplier-flow-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录实现、实际文件、计划偏差、ZIP
hash、验收命令与结果、待用户浏览器项目、剩余风险；不收集无关整仓统计。

## 12. 风险、假设与待确认

### 风险

- 尚无包含五个新 CM component 的脱敏 live round；constructed fixture 不能证明真实
  payload 的 component index/shape。
- WM 中间 CN 的 value/tier 在 CN Feature_Change 前发生切换，需真实 Spine 验证跨档
  activeSpine 不闪空、不重置无关 timeline。
- 两阶段 commit 中途失败必须由 cleanup 收口；不能把已提交 WM 回滚成与服务器 final
  plan 不一致的伪状态后继续运行。

### 假设

- `bg-updcn` 的目标集合是 WM 处理后的全部 CN，不包含尚未由 CM 转成的 CN。
- `bg-gencmcn` 是 CM 转出的新 CN 初始值，不再参加同一批 `bg-updcn`。
- 服务器确认每个 settled step 最多一个 CM；refill 可以通过 `bg-gencm` 生成 CM。
- Downloads 三个 ZIP 是本任务权威输入，执行开始前若 hash 改变必须重新审计并更新计划
  偏差，不能静默沿用本基线结论。

### 待确认

无。

## 13. 完成清单

- [ ] Symbols、Layout、skin2 assets 和 CM runtime 目标均完成，非目标未进入。
- [ ] scene precedence、WM -> CM -> win、CN/CM value 与动画边界符合计划。
- [ ] public API、职责、strict failure 和两阶段资源生命周期符合合同。
- [ ] 两个 ZIP、mapped assets、generated imports、测试、README 和规则已同步。
- [ ] L2 指定自动化通过；升级项已说明并验证直接 consumer。
- [ ] 自动化、fake runtime、浏览器和 live smoke 的结论明确区分。
- [ ] UTC 中文执行报告含 hashes、偏差、待验收和剩余风险。

## 14. 执行会话交接

执行会话应先读取本计划和所列领域规则，重核工作区与输入 hash，再按第 7 节顺序完成 Symbols 配对 -> Layout 更新 -> skin2 assets -> 编译/表现 -> 定向验收；不得以 fallback、猜测或放宽校验掩盖协议错误。
