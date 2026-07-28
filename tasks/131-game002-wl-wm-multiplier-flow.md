# 131 game002-wl-wm-multiplier-flow 任务计划

## 1. 目标与完成定义

### 目标

把服务器新增的 WL/WM 倍数和 WM 转 CN 流程接入 `apps/game002`，并把用户提供的 Symbols、ImgNumber、Scene Layout 三份 ZIP 按正式编辑器合同重新配对。
最终 game002 只支持 `skin=2`，从更新后的 `assets/crave` 取得 layout、symbols、Spine、ImgNumber、公开本地轮带和 popup。

中奖前顺序固定为：WM appear/整盘落地 -> 上一步 `bg-incwl` 的 WL Start（若有）
-> `Mult_Start` -> WL 更新并进入 `Mult_Idle` -> `Mult_End` -> `Change` ->
原位置原子替换 CN -> 现有中奖/cascade。

### 完成定义

- [x] 三份 `/Users/zerro/Downloads/crave-*.zip` 原始输入保持不变；输出新的 paired Symbols ZIP 和 updated Scene Layout ZIP，并记录名称、大小和 SHA-256。
- [x] WL、WM 倍数使用 `crave-wl-num.zip` 的唯一 ImgNumber 闭包；显示文本使用
      app-owned `x${value}` formatter，绑定供应资源中的 exact Spine slot
      `Mult`，不使用字体、CN digits、完整数值图片或 slot/path fallback。
- [x] `bg-genwilds`/`bg-setwm` 的 component-scoped `otherScene` 分别提供 WL/WM
      倍数；各 multiplier component 只读取当前目标 symbol cell，非目标 cell
      保留给服务器其它用途；目标数值、矩阵、symbol、component 在画面 mutation
      前严格校验。
- [x] step 触发 `bg-genwm` 时，initial spin 和 refill 都以其唯一 `scene` 为最终
      落定盘面，原 `bg-spin/bg-refill` scene 仅作为生成前输入。
- [x] 有 WM 时，`bg-updwl` 的 `otherScene` 必须把每个 WL 更新为 `旧 WL + 本批全部 WM 倍数之和`；没有 WL 时仍处理 WM，只不要求 `bg-updwl`。不得由客户端随机或用结果金额反推。
- [x] `bg-incwl` 在中奖 step 权威地把参与中奖的 WL 加一；表现延迟到下一次
      refill 全部落定后、当前 WM 生效前，更新文本并播放 WL Start once。
- [x] `bg-wm2cn` 的 scene 只允许把本批 WM 原位置改为 CN，其它 code/位置保持不变；
      `bg-genwmcn` 的 `otherScene` 必须为每个新 CN 提供 positive safe integer，
      其它位置保留给服务器用途。
- [x] 所有 WM 同批执行 `Mult_Start -> Mult_Idle -> Mult_End -> Change`；
      `Mult_Idle` 等待一个真实 loop boundary，其余动画等待真实 once completion。
      `Change` 完成边界才原子提交 WM -> CN，随后才允许 `bg-win`。
- [x] WL/WM 倍数随 occurrence 的 dropdown/refill 搬运；WL 更新、WM 转 CN 和新 CN
      value commit 不重建无关 symbol、不重置无关 Spine timeline、不闪空。
- [x] 无 WM 且无延迟 `bg-incwl` 时不制造空阶段；现有 spin/期待/cascade/CN/金额/popup 行为不变。
- [x] URL 只接受显式 `skin=2`；`skin=1`、缺失、重复、`01`、`3|4|5` 和未知值
      显式失败。`apps/game002` 不再装配 legacy skin1 background/symbol/win-amount
      runtime。
- [x] Symbols Editor 能导入、查看、修改、导出并重导新的 Symbols ZIP；Game Layout Editor 能导入和使用该 Symbols ZIP，并能导入、查看、修改、导出和重导新的 Game Layout ZIP，编辑往返不丢 manifest、dependency、state、binding 或资源。
- [x] 新 `assets/crave`、generated imports、dist closure 通过 checker，无 orphan、
      Downloads 路径或第二份表；完成 L2 自动化，交付用户浏览器验收入口、fixture、
      检查清单和 UTC 中文报告，不代替用户宣称浏览器通过。

## 2. 范围

### 包含

- Symbols Editor 支持新 Symbols ZIP 的完整导入、查看、修改、导出和重导，并配对 WL/WM ImgNumber 与 WM 新状态。
- Game Layout Editor 支持导入和使用新 Symbols ZIP；支持新 Game Layout ZIP 的完整导入、查看、修改、导出和重导，并将 paired Symbols 应用于两个 mode。
- 用新 layout ZIP 更新 `assets/crave` 和 generated imports。
- game002 的 component profile、server matrix 解析、不可变 multiplier/transform
  plan、中奖前 WM orchestration、目标 runtime 和 strict cleanup。
- logiccore/rendercore 的中性 settled-transform public contract，以及 grid-cell
  symbol 的 in-place value/text/state/swap 能力。
- Symbols manifest/Editor 对一个 ImgNumber logical node 跨多个 exact Spine state
  target 的 strict 支持；旧单 target package 保持可读。
- skin2-only loading、测试和最小文档/规则更新。

### 不包含

- 不支持/修复 `skin=1`，也不删除其它 consumer 仍使用的 `assets/game002-s3`。
- 不改服务器协议/真实轮带/RNG/bet/paytable/免费游戏 mode resolver。
- 不把 `bg-genwilds/bg-setwm/bg-updwl/bg-wm2cn/bg-genwmcn`、`WL/WM/CN`
  写进 logiccore/rendercore/gameframeworks。
- 不用 `bgcoinweight`、CN value candidates 或固定 `[1]` 猜 WL/WM 倍数。
- 不覆盖原 ZIP，不手改 map、content-addressed payload 或 generated TypeScript。
- 不顺手重构 Leo UI、loading 99%/100%、popup、Nearwin timing 或 win carousel。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T08:15:29Z
HEAD: abedbf0c67bac430d78e8109aaa0c8a3b942bbb4
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 已读取根 `AGENTS.md` 及 `game002`、shared runtime、loading、scene-layout、editor-artifacts 领域规则；相关目录没有更深层 `AGENTS.md`。
- 输入 SHA-256：`crave-symbols-fixed.zip` `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835`；
  `crave-v2.zip` `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`；`crave-wl-num.zip` `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487`。

- `crave-v2.zip` 两个 control file 与当前 `assets/crave` byte-equal；SHA-256 为
  `fdc639cf37f09d22e38c050f4d75ea4b135008d08600d090ada16639ee3059c1`
  和
  `c99a9299575bb44927d3229cefc532efdbfacb2e99310d711bfacb65c38ea810`。
- `crave-v2.zip` 已 vendor fixed Symbols 的现有逻辑资源；缺口是 WL/WM ImgNumber
  binding 和 WM 新 semantic states。
- `crave-wl-num.zip` 是 image-string v1，glyph 为 `0..9,x`、`lineHeight=64`、
  digit advance `64`；其 manifest 与 CN 同名不同内容，必须显式分配唯一 key。
- 供应的 `WL.json` 与 `WM.json` 都存在 exact slot `Mult`，未发现 `Multi`；`WM.json` exact animations 为 `Start, Idle, End, Feature, Mult_Start, Mult_Idle, Mult_End, Change`。
- 当前 symbol manifest 只声明 WM `appear/dropdown/normal/remove`，且 WL/WM 都没有
  ImgNumber node。当前 game002 round profile 只认识 `bg-gencoins/bg-win/...`。
- `SlotRoundExecutionPlan`/coordinator 当前只有 initial、win、dropdown、refill；
  无法把 WM 数据/视觉转换放在 settled 与 win 之间。`RenderGridCellReelSet` 可请求
  visible state，但没有原子改 value/text/code 的公共 transaction。
- 当前 `imageStringNodes[]` 每个 node 只允许一个 `{state,slot}` target；这会让同一
  WM 数字在 `Mult_*`/`Change` state 切换时被 detach。

## 4. 需求解释与技术决策

### 需求解释

- “slot 是 Multi”按供应 Spine 的权威 metadata 解释为 multiplier attach slot；
  实际 exact 名称是 `Mult`。实现必须使用 `Mult`，不能为 `Multi` 加 alias。
- “先处理 WM，再处理中奖”是 round 的强顺序合同，不是 app 内任意延时。每次
  initial 或 cascade refill 完成且下一步存在 win 时，先执行对应 settled-transform；
  transform complete 后 coordinator 才能进入 win。
- 多枚 WM 同批处理。每个 WL 的增量是本批所有 WM 倍数的 safe-integer sum；所有
  WM 动画同阶段并行，稳定顺序只用于验证和 snapshot，不串行延长视觉时间。
- `bg-updwl` 和 `bg-genwmcn` 是服务器权威结果；客户端校验用户说明的算术/转换，
  但不自行生成正式值。各 component 只读取目标 symbol cell。
- `x` glyph 明确属于该 multiplier ImgNumber，默认 formatter 为 `x${value}`。
  数值必须为十进制 positive safe integer；不做千分位、金额或本地化格式。
- WM appear 沿用 `Start`；等待整盘使用现有 spin/fall completion，不加 timer。

### 关键决策

1. **先 author Symbols，再 author Layout，再更新 repo assets。** Symbols Editor
   拥有 symbol/ImgNumber，Game Layout Editor 拥有 dependency/layout ZIP；不 patch
   nested JSON 或 map/hash。
2. **一个 multiplier ImgNumber node 拥有多个显式 state targets。**
   扩展 manifest/parser/editor/controller，使一个 logical node 可列出多个唯一
   `{state,slot}` target；runtime 只把同一 renderer attach 到当前 state 的 target。
   这保证文本与 renderer identity 跨 `Idle/Mult_*/Change` 连续，不为每个 state
   复制 glyph renderer 或 app-side node 表。
3. **服务器 multiplier 数据由 game002 编译成 immutable typed extension。**
   game002 解释 component 名和 WL/WM/CN 算术；logiccore 只接受中性的
   settled-transform snapshot/occurrence change，重新校验 input/output continuity
   后放入完整 round plan。所有 steps 仍在任何 renderer mutation 前编译。
4. **coordinator 增加中性 transform phase/capability。**
   transform 是显式 execution step，不藏进 `isInitialSpinComplete()` 或
   `isRefillComplete()`；无 transform 的现有 consumer trace 不变。
5. **WM -> CN 使用 rendercore 原子 visible-occurrence replacement。**
   先 prepare 新 CN player/value，`Change` once 完成后一次 commit code/value/display；
   失败 rollback 保留原 WM，不能用全盘 `applyScene()` 重建无关 symbols。
6. **skin=2 成为唯一 production config。**
   删除 game002 内 skin1 union/legacy factories/loading selection；`assets/crave`
   及明确的 game-owned Nearwin presentation extension继续各自拥有资源，不把
   Nearwin 伪装成 layout closure。

## 5. 职责与合同

- **logiccore**：中性 immutable transform step、occurrence id/code/value continuity、
  完整 plan/capability 校验；不知道具体 component、symbol 或动画名。
- **rendercore**：multi-target ImgNumber node、visible state completion、prepared
  occurrence replacement、commit/rollback/release 和 coordinator transform phase。
- **gameframeworks**：只 re-export 中性 contract。
- **game002**：component profile、matrix semantics、WL 加法、WM 批次、动画 state
  mapping、`x${value}` formatter、transform target orchestration。
- **编辑器**：Symbols Editor 拥有 paired manifest/dependency/state/slot/closure；
  Layout Editor 拥有两个 mode binding 和 mapped ZIP，不保存 server flow。
- **生命周期**：ZIP import/replace/export、runtime prepare、transform prepare、
  Change-boundary commit、rollback、cleanup、next-spin 和 destroy 都有单一 owner；
  late async CN init 不得在 cleanup 后提交。
- **失败策略**：缺 component/basic data/scene/otherScene、重复引用、非法矩阵、
  arithmetic overflow/mismatch、未知 state/slot/glyph/code、动画 completion 错误、
  package hash/orphan 漂移均在最早合法边界显式失败。
- **禁止行为**：不猜路径/slot/value，不维护第二份 animation/resource/state 表，
  不从 server scene 推导真实轮带，不以静态 timer 冒充 Spine completion。

## 6. 文件范围

### 预计新增

```text
apps/game002/src/wl-wm-multiplier-plan.ts
apps/game002/src/wl-wm-multiplier-player.ts
apps/game002/tests/wl-wm-multiplier-{plan,player}.test.ts
packages/{logiccore,rendercore}/tests/**transform*.test.ts
```

### 预计修改

```text
assets/crave/**
apps/game002/{package.json,README.md,scripts/**,docs/**}
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/{skin-id,skin-config,loading-resources,game-adapter}.ts
apps/game002/src/{cascade-config,cascade-sequence,game-demo}.ts
apps/game002/tests/**
apps/symbolseditor/src/{model,ui,io}/**
apps/symbolseditor/tests/**
apps/gamelayouteditor/src/**
apps/gamelayouteditor/tests/{imported-symbol-package,zip-io,production-reel-preview}.test.ts
packages/logiccore/src/{slot-round-flow,slot-round-plan}.ts
packages/rendercore/src/{symbol,symbol-image-string,reel,slot-round}/**
packages/rendercore/tests/{symbol,symbol-image-string,reel,slot-round}/**
packages/gameframeworks/{src,tests}/**
docs/agent-rules/{game002,shared-game-runtime,editor-artifacts}.md
```

### 原则上不应修改

```text
assets/game002-s3/**
assets/gamecfg002/gameconfig.json
apps/game003/**
packages/{netcore,uiframeworks,gameloading*,gamelayoutpkgcli}/**
pnpm-lock.yaml
```

Game Layout Editor 的 model/IO/UI/preview 兼容修改属于本任务；仍以最小改动复用现有 dependency replace/export workflow。
若需改变 Scene Layout schema、root toolchain 或 lockfile，必须先停止说明。

## 7. 实施步骤

1. **确认执行基线与真实 round fixture**
   - 重核 HEAD/status/三份输入 hash；保存原 `assets/crave` root hashes。
   - 增加脱敏 fixture 覆盖多 WL/WM、已有 CN、六个新 component 和随后 `bg-win`，
     用纯 parser 锁定 component index、x-major 6x9、加法、转换和零值。

2. **扩展 multi-target ImgNumber node 合同**
   - 将单 `target` 演进为严格、非空、无重复的 state target 集合；旧单 target 输入
     规范化为冻结单元素集合，导出使用一个 canonical 形态。
   - parser 验证 exact state/slot；controller 每次只 attach 当前 state 的 target。
   - Symbols Editor 增加 target transaction 和可见编辑 UI；dependency/state 变更全量复验并回滚，导入后能查看/修改 target、state、slot、dependency 和资源。

3. **配对并导出 Symbols ZIP**
   - 导入 `crave-symbols-fixed.zip` 和 `crave-wl-num.zip`；为新 dependency 显式分配
     唯一 filename keys，保留 Crave CN dependency。
   - WL 的 `multiplier` node 覆盖显示倍数的 states，统一 `Mult` slot 与已验 transform。
   - WM 新增 `multStart/multIdle/multEnd/change` semantic states，分别绑定 exact
     `Mult_Start/Mult_Idle/Mult_End/Change`；同一 multiplier node 覆盖 normal、
     dropdown、appear 和四个新 state。
   - 在 Symbols Editor 修改一个可逆字段，导出/重导验证修改持久化、manifest/closure deterministic，恢复正式值后导出交付物；不覆盖原 ZIP。

4. **完成 Layout Editor 往返、替换 dependency 并更新 assets**
   - Game Layout Editor 导入新 Symbols ZIP，能查看其资源/state/ImgNumber targets，并在 reel preview 实际使用；导入 `crave-v2.zip` 后完整恢复可编辑项目。
   - 用 paired package 显式替换 `game002-s3` dependency；BaseGame/FreeGame 均保持
     package id、main reel、`reels-001`、grid-cell binding 和 placement。
   - 查看并修改一个可逆 layout/binding 字段，导出/重导验证修改持久化；恢复正式值后导出 updated ZIP，复验 layout/background/popup/symbol closure。
   - 用导出物完整替换 `assets/crave` mapped folder，删除只属于旧 map 的 payload，
     再运行正式 generator；禁止合并两个 map 或保留 orphan。

5. **编译 WL/WM server 数据与 transform plan**
   - 扩展 game002 strict component profile，逐 component 读取最多一份 otherScene。
   - 生成前值、WL 更新值、WM replacement、新 CN 值和最终 snapshot；验证 sum、
     安全整数、非目标 cell 和 occurrence continuity。
   - 将 game-owned extension交给 logiccore 生成中性 immutable transform steps；
     plan preflight 证明 win group 基于 WM->CN 后 snapshot，而非旧 WM scene。

6. **接入 generic transform presentation**
   - coordinator 在 initial/refill settled 后执行 transform step，完成后才进入 win。
   - game002 按真实 once/loop completion 批量推进；在 `Mult_Idle` 开始更新 WL，
     在 `Change` completion commit prepared CN。
   - refill/dropdown 搬运 multiplier occurrence；新 WM settled 后先写入权威 text，
     再启动 batch。无 WM step 立即完成 transform。

7. **收口 skin2-only 与生命周期**
   - `skin-id` 只接受 `"2"`；移除 app 内 legacy skin1 config、loading 和 visual
     fixture分支，保持 99% prepare/100% mount/single session。
   - cleanup/destroy 取消 transform并释放 prepared CN/ImgNumber，不影响下一 spin。
   - release checker 只要求 skin2 closure，不允许 Downloads/legacy app 引用。

8. **测试、文档和交付**
   - shared 层测试使用中性 A/B symbol/component；game002 测试覆盖 exact `bg-*`。
   - 两个编辑器用自动化覆盖 import -> view model -> edit -> export -> reimport；Layout Editor 另覆盖导入 Symbols、绑定两个 mode 和真实 preview resolver。
   - 更新 README、动画时序和领域规则，记录 `Mult`、skin2-only 和 WM-before-win。
   - 完成自动化，准备用户浏览器验收入口、fixture 和清单；生成任务 131 UTC 中文
     执行报告并记录两个输出 ZIP hash 及用户已反馈的验收结果。

## 8. 测试与验收

### 测试原则

- constructed fixture 保护结构错误，脱敏 fixture 保护 server index；fake animation
  不能冒充真实 Spine completion。
- 覆盖无 WM、单/多 WM、多 WL、已有 CN、cascade refill WM、无 win、期待激活、
  overflow、矩阵错位、缺 component、重复 otherScene、非法值和 destroy 中断。
- 资源测试覆盖 CN 不被覆盖、multi-target、`x0..9`、ZIP/map/orphan 和旧兼容。
- 对 scene/code/value/text/player identity 做 snapshot；不以固定 sleep 或像素相等
  代替状态/完成边界。

### 验收级别

`L2`。任务修改 logiccore/rendercore public plan 与 symbol contract、正式 Symbols/
Scene Layout ZIP、generated imports 和 game002 直接 consumer；范围可由六个直接
package/app 界定，不涉及根工具链或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter symbolseditor --filter gamelayouteditor --filter game002 typecheck
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter symbolseditor --filter gamelayouteditor --filter game002 test
pnpm --filter symbolseditor --filter gamelayouteditor build
pnpm --filter game002 check:crave-layout-resources
pnpm --filter game002 release:check
git diff --check
```

### 用户浏览器验收（由用户执行）

执行方负责提供可启动的两个编辑器和 game002、确定性 fixture、操作步骤与结果记录位置；以下项目由用户在浏览器验收。
用户未反馈前报告标记为“待用户验收”，不得写成“已通过”。

- Symbols Editor：导入新 Symbols ZIP，查看并修改后导出、重导；预览 WL 与 WM 的
  `normal/appear/dropdown/Mult_Start/
Mult_Idle/Mult_End/Change`，确认同一 `xN` 位于 exact `Mult` slot，跨 state
  不重置、不重叠、不闪空；CN 数字保持原样。
- Game Layout Editor：导入新 Symbols ZIP 并用于 reel；导入 updated layout ZIP，
  查看、修改、导出、重导后 BaseGame/FreeGame 都显示新 Symbols package，
  geometry、background、popup 和公开 reel 无漂移。
- game002 真实 renderer：用固定 fixture观察 WM appear 后等待全盘、四段 WM 动画、
  全 WL 同时加值、Change 后原位置 CN、新 CN number、再中奖；多 WM 同步。
- 复验 cascade/期待/CN collect/summary/popup/cleanup/resize/destroy；console 干净。
- 有 live credential 时至少完成一次 skin2 connect/spin/destroy。随机结果未覆盖
  WM 链时，只记录 smoke，不宣称 WM live 视觉通过。

### 独立验收建议

`必须`；自动化复验由执行方完成，浏览器判定仍由用户完成。涉及跨包 public contract、正式 ZIP/map/generated 交付物、异步
prepare/commit/rollback/destroy 和 server otherScene 业务边界。独立复验重点：

1. shared code 无 game002 component/symbol/animation hardcode；
2. paired ZIP 不覆盖 CN dependency，updated layout exact closure 无 orphan；
3. WM transform complete 严格早于 win，失败/cleanup 不留下半转换画面。

独立复验最多运行：

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter game002 test
pnpm --filter game002 check:crave-layout-resources
pnpm --filter game002 release:check
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；shell 未配置时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 缺依赖时使用 `CI=true pnpm install --frozen-lockfile`。
- 预期不新增依赖、不改 lockfile；只有实际下载失败后才设置代理重试。
- 浏览器导出到 Downloads 时使用新文件名；若目标已存在，再分配新名称，不覆盖。

## 10. 生成物、文档与规则

- 两份 ZIP 由正式编辑器导出并记录 SHA-256；repo 只提交通过 exact checker 的
  `assets/crave`。
- `crave-layout-resources.generated.ts` 只由
  `generate-scene-layout-vite-resources.mjs` 更新并运行 `--check`。
- 更新 game002 README/animation guide；更新 `game002.md` 的 skin2-only 和
  WL/WM/WM->CN合同、`shared-game-runtime.md` 的中性 transform ownership、
  `editor-artifacts.md` 的 multi-target node contract。
- 不把 ZIP hash、animation 清单或任务证据追加到根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行后创建
`tasks/131-game002-wl-wm-multiplier-flow-<utctime>.md`，UTC 使用
`date -u +%y%m%d-%H%M%S`。报告简要记录最终实现、实际文件、两个输出
ZIP 和 `assets/crave` root hash、计划偏差、验收结果、未完成 live 项和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 当前无真实新 component fixture，constructed fixture 可能漏掉 index/delta 差异。
- multi-target/swap ownership 不清会造成 renderer 重复、timeline reset 或 late commit。
- `assets/crave` 全量替换时，旧 orphan 或 generated 漂移会分裂 dev/release 行为。
- 多 WM sum 或 WL update 接近 `Number.MAX_SAFE_INTEGER` 时必须在 mutation 前失败。
- 浏览器验收由用户执行；交付时可能处于待验收，不能把自动化通过等同视觉通过。

### 假设

- 新 component 仍使用当前 protocol 的 x-major 6x9 `SceneMatrix/OtherSceneMatrix`。
- 一步内所有 WM 构成一个 batch，每个 WL 增加该 batch 全部 WM 倍数之和。
- `bg-genwmcn` 只读取本批新 CN 位置；其它 cell 保留给服务器用途。已有 CN value
  由原 occurrence/现有 `bg-gencoins` 路径保留。
- `Mult_Idle` 播放一个真实 loop 后进入 `Mult_End`；没有额外固定 hold。
- multiplier 文本为 `x${value}`，slot 的权威 exact spelling 为 `Mult`。

### 待确认

- 执行自动化完成前需要取得至少一份包含新 component 链的脱敏真实 round payload；
  若真实 payload 与上述矩阵零值或 component index 假设不同，先停止并更新需求合同，
  不增加宽松兼容分支。

## 13. 完成清单

- [x] 原始 ZIP 未覆盖，paired/updated ZIP 与 hash 已交付；skin2-only 合同已满足。
- [x] 两个编辑器的导入、查看、修改、导出、重导合同已有自动化证据。
- [x] server 数据预编译严格校验；WM/WL/CN/win 顺序符合计划。
- [x] public API、resource ownership、rollback、cleanup、destroy 符合计划。
- [x] `assets/crave`、generated imports、测试、README 和领域规则已同步。
- [x] 自动化已完成，用户浏览器验收入口/清单和 UTC 中文报告已生成。
- [ ] 用户浏览器验收结果待用户执行后回填。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对 Git/ZIP hash，并取得或确认真实新逻辑 fixture；
3. 先完成 Symbols 配对，再更新 Layout ZIP，再更新 repo assets，最后接 runtime；
4. 按计划实现，不重新建立 app 私有 Pixi/Spine/ZIP 状态机；
5. 小幅适配写入报告；重大 schema/范围扩张先停止说明；
6. 运行 L2 自动化，交付浏览器入口/fixture/清单；仅记录用户反馈的浏览器结果；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
