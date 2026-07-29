# 135 game002-co-collection-flow 任务计划

## 1. 目标与完成定义

### 目标

在任务 132 的 WL/WM/CM 中奖前转换基础上，接入服务器新增的 CO 收集玩法，重新配对正式 Symbols/Scene Layout 资源并只交付 `skin=2`。客户端必须让 CO 随 initial spin 或 refill 直接落定，而不是在 WM/CM 后凭空变出；只有当前 `bg-win` 没有中奖结果且 `bg-triggerco` 命中 CO 时，才执行：

```text
CO Feature once + 被拉取 source symbol Feature1 once（同时）
-> source symbol Feature2 once + 从 source 移到 target
-> source 原格变 BN、target 接收 source symbol/value、CO 变为同种 symbol
-> bg-win2
-> 中奖位置正常 remove + bg-bn 位置 release-only remove
-> 现有 dropdown/refill/cascade
```

### 完成定义

- [ ] `/Users/zerro/Downloads/crave-symbols-fixed.zip` 与 `crave-wl-num.zip` 经 Symbols Editor 正式模型确定性配对，完整保留任务 131/132 的 WL/WM/CM/CN 配置，并新增 CO 收集所需 exact state。
- [ ] CO 使用 exact `Feature` once；可被拉取的 symbol 使用 exact `Feature1/Feature2` once。CN 四档通过 active Spine 绑定同名动画，缺任一 resource/state/animation 显式失败。
- [ ] `/Users/zerro/Downloads/crave-v2.zip` 用任务 135 Symbols 替换 `game002-s3` dependency，经 Game Layout Editor 导出/重导后完整更新 `assets/crave` 与 generated imports。
- [ ] initial spin/refill 的动画前落定盘面已经包含 `bg-genco` 新 CO；已有 WL/WM/CM 动画仍按原顺序执行，CO 不在 transform 末尾突然 replacement。
- [ ] `bg-win` 有实际 result 时先完整处理现有中奖/remove/cascade，即使盘面有 CO 也不启动 CO；`bg-win` 无 result 时严格经过 `bg-triggerco`，只有存在 CO collection 才要求 `bg-co/bg-win2/bg-bn/bg-remove`。
- [ ] `bg-co.pos` 按 `-1` 分段，每段含 `4..8` 个 `srcX,srcY,targetX,targetY` 四元组；支持多个 CO，严格验证 segment、CO、source、8 邻域 target、选中 symbol、scene、otherScene 和 result 一致性。
- [ ] CO 与所有 source 的第一阶段同时开始；全部真实 once completion 后，source 播放 Feature2 并连同 image-string/value presentation 移到 target。全部移动完成才原子提交 scene/value/occurrence identity。
- [ ] source cell 原子变为真实 display symbol `BN`，target 接收对应 source 的 symbol 和 otherScene value，CO cell 变为同一选中 symbol；`bg-co.scene/otherScene` 是权威终态。
- [ ] `bg-win2` 使用既有 manifest-driven win/金额逻辑；`bg-bn` 不伪造正金额组，在中奖 remove 完成边界作为 release-only positions 一并清除。
- [ ] 无 CO、CO 未触发、普通 `bg-win`、WM/CM-only、期待、CN collect/summary、popup、next-spin cleanup 和 destroy trace 无回归。
- [ ] 删除仅属于旧 `skin=1` 的 `assets/game002-s1/**` 与 `assets/symbols001/**`，确认没有 consumer；不误删 skin2 extension 使用的 `assets/game002-s3/**`。
- [ ] 完成 L2 自动化并生成 UTC 报告；浏览器/真实视觉验收由用户执行，执行会话只交付入口和清单，不代为标记通过。

## 2. 范围

### 包含

- Symbols Editor task135 authoring：重放任务 131/132 配置，增加 CO `feature`、可拉取 symbol `feature1/feature2`，验证 edit/export/reimport 和 exact closure。
- Game Layout Editor task135 authoring：替换两个 mode 共用的 Symbols dependency，保持 background、popup、main reel、geometry、placement 和 mode binding。
- `assets/crave` mapped package、generated Vite imports 和 game002 skin2 release。
- logiccore 中性 immutable settled relocation 与 release-only remove plan contract；profile 只保存通用 role，不认识 CO、BN 或 `bg-*`。
- rendercore grid-cell 跨格 transfer transaction、mask/z-order、value continuity、atomic commit/rollback/destroy 和 release-only boundary。
- game002 component gating、`bg-co.pos`/scene/otherScene/result 编译、WM/CM 后 CO 状态机、`bg-win2/bg-bn` cascade、金额和 parity。
- 删除已无 consumer 的 game002 skin1 资源，更新直接相关测试、README、动画时序和最小领域规则。

### 不包含

- 不修改服务器协议、RNG、真实轮带、bet/paytable、免费游戏 mode resolver。
- 不支持或恢复 `skin=1`，不增加 alias/default；`assets/game002-s3` 仍是 Nearwin/reel/win-amount 等 skin2 app extension，不是可选择的 skin3。
- 不把 `bg-triggerco/bg-co/bg-win2/bg-bn`、CO/BN、Feature 动画名或 candidate symbol 写入 shared package。
- 不用 app-owned Pixi tween、复制 display tree、CSS overlay、静态 delay 或 `applyScene()` 全盘重建来实现拉取。
- 不让 `bg-bn` 参与金额、summary、carousel 或正中奖校验。
- 不覆盖 Downloads 原 ZIP，不手改内容寻址 payload、map 或 generated TypeScript。
- 不删除 `assets/game002-s2`、`assets/game002-s3`、`assets/symbols002/003` 或其它未证明属于 skin1 的 fixture/extension。
- 不调整 WM/CM、Nearwin、fall、loading 99%/100%、popup 或 Leo UI 时序。

## 3. 制定计划时的基线

```text
UTC: 2026-07-29T06:33:38Z
HEAD: 75fa30bc0f47b6f3d0b389f66ce3fd3d414d4f93
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/game002.md`、`shared-game-runtime.md`、`loading-ui.md`、
  `editor-artifacts.md`、`scene-layout.md`，以及任务 132 计划/报告；相关实现目录没有
  更深层 `AGENTS.md`。
- Downloads 输入 SHA-256 与任务 132 相同，执行时仍从原始输入重放，不把
  `assets/crave` 或 task132 输出当编辑源：
  - `crave-symbols-fixed.zip`：
    `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835`
  - `crave-v2.zip`：
    `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`
  - `crave-wl-num.zip`：
    `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487`
- 当前 `assets/crave` roots：
  - `layout.manifest.json`：
    `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09`
  - `assets.map.json`：
    `fb3033c7a2245c78d66d076285db2a8bb523597fc86f900f142995ae95318065`
- 当前 task132 Symbols 已有共享 multiplier ImgNumber、WM 四段、CM `feature1/change` 和 CN `featureChange`；CO 只有 `normal/dropdown/appear/remove`，候选尚未映射 `feature1/feature2`。
- 供应 exact 动画：CO `Feature`；`WL,H1,H2,L1,L2,L3,L4` 和 `CN_1..CN_4` 均有 `Feature1,Feature2`；WM/CM 在 settled 后转 CN，AF/BN/CO 不具备这对 source 动画。
- `createGame002WlWmMultiplierCompiler` 当前按 `bg-gencm > bg-genwm > bg-spin/refill` 构造盘面，再把 `bg-genco` 新 CO 作为末尾无动画 replacement；本任务须反转该表现边界并保留 final scene strict validation。
- round profile/cascade sequence 目前只编译 `bg-win`；logiccore remove 只由正金额 group 推导，rendercore remove 只接受有动画的 primary positions，无法表达零金额 `bg-bn` release-only holes。
- settled transform 目前只能同位置 replacement，grid-cell runtime 也只有 replacement transaction，不能表达 source occurrence identity/value 跨格 transfer；这是真实 shared public contract 缺口。
- `assets/game002-s1/**` 与 `assets/symbols001/**` 共 29 个文件且已无源码 consumer；`assets/game002-s3/**` 仍被多个直接 consumer 使用，不能随 skin1 删除。

## 4. 需求解释与技术决策

### 需求解释

- 用 `bg-genco` 找出新增 CO 并 overlay 到 WM/CM 动画前 settled scene；spin/refill 落点已是 CO，WM/CM 仍从动画前 code 开始，`bg-genco` 继续作为最终权威。
- `bg-win` 是否中奖只按实际 `usedResults` 判断，不按 component presence、step cash、truthy 字段或 `historyComponentsEx`。
- 无 `bg-win` result 必须触发 `bg-triggerco`；无 CO 时 CO-only components 缺失，有 CO 才接受完整 `bg-co/bg-win2/bg-bn/bg-remove`。
- 每个 `bg-co.pos` segment 对应一个 CO，所有 target 必须唯一落在其八邻域；映射不唯一、非 4..8 个四元组、坏分隔、重复/越界/重叠均失败。
- source 先在原格播放 Feature1，再播放 Feature2 并移动；CO Feature 与全部 source Feature1 同边界并行，等待全部真实 once 后开始第二阶段。
- segment 的 source code 必须相同，`bg-co.scene` 的 target/CO 与 `bg-win2.result.symbol` 必须同 code；win2 可含原本邻接同 code 格，但必须精确来自服务器结果。
- task135 manifest 给 `WL,H1,H2,L1,L2,L3,L4,CN` 配置 Feature1/2；runtime 仍按 server code 和 active capability 验证，未知或 policy 冲突显式失败。
- `bg-co.otherScene` 随 occurrence 转移 value：target 接收 source value，source BN 的 `-1` 规范化为 `null`，未变化格保持一致，CO 的 value 也只取权威矩阵。
- 多 CO 作为一个原子 batch：两阶段各自并行，全部 transfer 完成才整体 commit；segment 顺序只用于稳定编译、日志和测试。

### 关键决策

1. **CO 在动画前落定。** 合成 WM/CM 动画前盘面后只 overlay `bg-genco` 新 CO；WM/CM 完成后比对权威 final scene，不再末尾替换 CO。
2. **扩展中性 immutable relocation。** logiccore 保存 source->target identity transfer、被覆盖 occurrence、source replacement 和 final code/value；旧同位置 transform trace 不变。
3. **rendercore 拥有 transfer transaction。** 在 board mask 内移动含 Spine/value wrapper 的完整 occurrence，以 Feature2 真实 once 时长驱动 center-to-center motion；prepare 不 mutation，整批 commit，失败/cleanup/destroy rollback ownership/z-order/mask。
4. **BN 是 release-only。** strict profile 增加通用 supplemental result role；logiccore 只用它推导 holes/release ids，rendercore 在正常 remove 完成边界释放，不解析金额或生成 carousel group。
5. **复用 coordinator。** win 顺序为 `bg-win,bg-win2`，合法 step 只有一方产生 groups；CO 是 settled-transform 的 game-owned stage，完成后自然进入 win2/cascade。
6. **从原始 ZIP 重放。** task135 Symbols 重放 task131/132 后加 CO states，Layout 从原始 `crave-v2.zip` 替换 dependency；两者均做可逆 edit/export/reimport。

## 5. 职责与合同

- **logiccore**：拥有 strict profile、relocation/replace/release-only immutable plan、identity 和 cascade continuity；不认识业务名称。
- **rendercore**：拥有 grid-cell transfer layer、mask、geometry、official completion、motion、transaction/destroy 和 release-only boundary。
- **gameframeworks**：只 re-export 新中性 types/API；不增加 game002 分支。
- **game002 compiler/target**：编译业务 gating、segment、scene/value/result 并冻结 batch；先 WL/WM/CM 后 CO transaction，不直接访问 Pixi child/container。
- **Editors**：分别拥有 state/dependency closure 与 layout binding/mapped ZIP，不保存服务器玩法表。
- **生命周期**：整轮 preflight，collection 整批 commit；compile/prepare/update failure、next-spin、fatal、destroy rollback 未提交事务，late completion 不提交。
- **失败策略**：部分 component、坏坐标/映射/邻域、scene/value/result 漂移、unknown capability、unsafe value、collision、hash/orphan 和 skin1 残留均失败。
- **禁止行为**：不猜 source/target/value/path，不用 clone sprite 或 timer 冒充 transfer/completion，不保留第二份业务表。

## 6. 文件范围

### 预计新增

```text
apps/symbolseditor/scripts/build-task135-symbols.ts
apps/gamelayouteditor/scripts/build-task135-layout.ts
apps/game002/src/co-collection-plan.ts
apps/game002/tests/co-collection-plan.test.ts
packages/rendercore/src/reel/grid-cell-symbol-transfer.ts
packages/rendercore/tests/reel/grid-cell-symbol-transfer.test.ts
tasks/artifacts/135/game002-s3-symbols-task135.zip
tasks/artifacts/135/crave-layout-task135.zip
tasks/135-game002-co-collection-flow-<utctime>.md
```

### 预计修改

```text
assets/crave/**
apps/{symbolseditor,gamelayouteditor}/package.json
packages/logiccore/src/{slot-round-flow,slot-round-plan,index}.ts
packages/logiccore/tests/{slot-round-flow,slot-round-plan}.test.ts
packages/rendercore/src/reel/{render-grid-cell-reel-set,types,index}.ts
packages/rendercore/src/symbol-cascade/**
packages/rendercore/tests/{slot-round,symbol-cascade}/**
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/{cascade-config,cascade-sequence,wl-wm-multiplier-plan}.ts
apps/game002/src/{game-adapter,game-demo}.ts
apps/game002/tests/{cascade-sequence,wl-wm-multiplier-plan}.test.ts
apps/game002/tests/{game002-round-transform,game-adapter}.test.ts
apps/game002/{README.md,docs/animation-flow-and-timing.md}
docs/agent-rules/{game002,shared-game-runtime}.md
```

### 预计删除

```text
assets/game002-s1/**
assets/symbols001/**
```

### 原则上不应修改

```text
assets/game002-s2/**
assets/game002-s3/**
assets/symbols002/**
assets/symbols003/**
assets/gamecfg002/gameconfig.json
apps/game003/**
packages/{netcore,uiframeworks,gameloading*}/**
pnpm-lock.yaml
```

若真实实现要求改变 transform/coordinator 以外的 shared public API、删除更多 legacy
assets 或修改 lockfile，必须先说明原因和直接 consumer，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线与建立最小协议 fixture**
   - 重核 HEAD/status、三个输入 ZIP、`assets/crave` roots 和 task132 parity。
   - 从用户样例提炼脱敏 constructed fixture：单 CO、4 个 transfer、`bg-win2` 普通
     symbol group、4 个 BN、remove/dropdown；另建多 CO、CN value transfer 和
     `bg-win` 优先 fixture，不把整份会话 payload 复制为 runtime contract。

2. **扩展 logiccore 中性计划**
   - 在 strict cascade profile 增加唯一的 release-only result component list，更新
     parser/catalog/duplicate role validation。
   - 扩展 settled transform draft/plan，表达同批 source->target identity relocation、
     target overwrite、source replacement 和 final snapshot；冻结所有坐标与数组。
   - compile win/remove 时把 release-only positions 加入 derived holes/release ids，
     但不加入 amount/groups；覆盖 collision、no-op、越界、重复、旧 consumer parity。

3. **实现 rendercore transfer/release transaction**
   - 新建 generic prepared transfer batch，preflight source/target/state/geometry 和
     ownership，prepare 阶段不改变宿主。
   - 开始后把 source occurrence 完整 presentation 提升到 board transfer layer，
     保持 mask/renderPriority/value renderer；按每个 Feature2 真实 duration 移到 target。
   - 全部完成原子提交 transfer/replacement，失败/rollback/destroy 恢复 source/target；
     release-only positions 在普通 win remove 全部完成后无动画释放。

4. **配对 task135 Symbols 和 Layout**
   - 从原始 Symbols + ImgNumber 重放 WL/WM/CM/CN task132 authoring。
   - 增加 `feature/feature2` definitions；CO `feature -> Feature`，普通候选
     `feature1/feature2 -> Feature1/Feature2`，CN 使用 active Spine 四档。
   - 导出/reimport `game002-s3-symbols-task135.zip`；用它替换原始 Layout 两个 mode
     dependency，导出/reimport `crave-layout-task135.zip`。
   - 用 Layout 输出完整替换 `assets/crave`、清理旧 map orphan、运行正式 generator，
     记录 ZIP/root manifest size 与 SHA-256。

5. **编译 game002 CO settled/collection batch**
   - `resolveSettledScene` 让新增 CO 在 spin/refill 目标盘面直接落定；WM/CM 输入和
     `bg-genco` final parity 同时成立。
   - 新 helper 严格解析 `bg-triggerco/bg-co/bg-win2/bg-bn` 和 `bg-co.pos` segment，
     编译 CO mapping、relocations、BN/target/CO output 与 value transfer。
   - 强制 `bg-win` result 优先、无 win trigger、完整/缺失 component 集合、多 CO
     disjoint、4..8 transfers、八邻域、result symbol/positions 和 remove scene 合同。

6. **接入 presentation 与 cascade**
   - 目标 preflight 所有 CO/source state 和 prepared transfer；先完成 WL/WM/CM。
   - 同时请求全部 CO `feature` 与 source `feature1`；全部 once 完成后请求 source
     `feature2` 并启动 generic move；全部完成才 commit collection。
   - 将 wins 顺序扩展为 `bg-win,bg-win2`，把 `bg-bn` 映射到 release-only positions；
     更新 app cascade sequence、amount/cumulative/parity/resource validation。
   - 确认 win2 后现有 remove/dropdown/refill、CN collect、WL held policy和 summary
     均由 manifest/profile 驱动，不复制第二套流程。

7. **删除 skin1、文档与收尾**
   - 删除两个已确认无 consumer 的 skin1 目录；搜索源码、脚本、package、dist checker
     中残留引用，合法 `skin=1` query rejection 测试继续保留。
   - 更新 README、动画时序、game002/shared 领域规则；生成 UTC 中文报告并列出未完成
     的浏览器/live 验收。

## 8. 测试与验收

### 测试原则

- 覆盖 normal win 优先、无 win/无 CO、单/多 CO、4/8 transfers、CN/WL value
  transfer、已有邻接同 symbol、source/target collision、非法分隔/邻域/scene/value/
  result/component、prepare/update/commit failure、cleanup/destroy。
- 用 occurrence id、scene/value、requested/resolved state、completion counter、
  geometry、owner、commit/release trace 断言；fake runtime 不冒充浏览器真实视觉。
- 资源覆盖 exact animation、CN 四 tier、task132 nodes、唯一 multiplier dependency、
  两 mode binding、map/hash/path/orphan 和 skin1 absence。

### 验收级别

`L2`。任务修改 logiccore/rendercore public contract、正式 Symbols/Layout ZIP、
mapped assets、generated imports和直接 game002 consumer；范围可由两个 shared package、
两个 editor 和 game002 界定，不改根工具链/lockfile，不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter symbolseditor build:task135 && pnpm --filter gamelayouteditor build:task135
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter symbolseditor --filter gamelayouteditor --filter game002 typecheck
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter symbolseditor --filter gamelayouteditor --filter game002 test
pnpm --filter symbolseditor --filter gamelayouteditor build
pnpm --filter game002 check:crave-layout-resources && pnpm --filter game002 release:check
git diff --check
```

### 用户浏览器验收（由用户执行）

- Symbols Editor：导入 task135 Symbols，预览 CO Feature、候选 Feature1/Feature2、
  CN 各 tier 和 task132 WL/WM/CM states，再做 edit/export/reimport。
- Game Layout Editor：导入 task135 Symbols/Layout，检查 BaseGame/FreeGame 同一
  dependency、reel/background/popup/geometry 和 edit/export/reimport。
- game002 `skin=2`：验证 CO 随 spin/refill 落定；普通 win 时 CO 不触发；无 win 时
  CO+source 第一阶段同时播放，source 第二阶段边播边移，随后 win2、BN+win remove、
  dropdown/refill。
- 复验多 CO、CN value 跟随、WM/CM 后 CO、期待、resize、next-spin、failure cleanup、
  destroy、console 和 live server payload。

### 独立验收建议

`必须`。涉及跨包 public contract、正式 ZIP/mapped assets、跨 display owner 的异步
transaction 与 destroy。独立复验重点：

```bash
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter game002 test
pnpm --filter game002 release:check
git diff --check
```

## 9. 环境与依赖

- 使用 Node 24 和 pnpm；缺环境时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失才运行 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败才设置仓库模板中的本地代理并重试原命令。
- 本任务预期不新增依赖、不改 lockfile；Pixi/Spine/fflate/ts-node 使用现有版本。

## 10. 生成物、文档与规则

- task135 authoring 脚本生成两个 ZIP；Layout 输出完整更新 `assets/crave`，再由
  `generate:crave-layout-resources` 更新 generated TypeScript，禁止手改。
- 报告记录输入/输出 ZIP、`layout.manifest.json`、`assets.map.json` 的 byte length、
  SHA-256、map/orphan parity 和删除的 skin1 文件数。
- 更新 game002 README/animation flow；shared generic relocation/release-only 边界
  更新 `shared-game-runtime.md`，CO 业务合同更新 `game002.md`，不改根 `AGENTS.md`。

## 11. 执行报告

执行完成后创建：

```text
tasks/135-game002-co-collection-flow-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录最终实现、实际文件、public contract、
计划偏差、ZIP/hash、验收结果、未完成人工/live 项和剩余风险。

## 12. 风险、假设与待确认

### 风险

- 用户样例证明单 CO/4 transfer，但真实多 CO collision/order 尚无 live 证据；实现必须
  strict disjoint，不能用最后写入获胜。
- 跨 reel cell reparent 可能破坏 mask、renderPriority、Spine/value wrapper 或 destroy
  ownership；必须以真实 Pixi/browser 验收补足 fake runtime。
- 选中 CN/WL 时 value/held/remove policy 比普通 symbol 更复杂；若服务器返回与当前
  profile 冲突的明确语义，应停止并更新合同，不静默降级。
- 删除 skin1 资源不可由编译成功单独证明安全；需同时用全仓引用搜索和 release closure
  证明没有 consumer。

### 假设

- `bg-co.pos` 每段对应一个 CO，所有 target 均为该 CO 八邻域；多段互不覆盖。
- 同一 segment 的 source symbol 相同，CO 和 target 最终变为该 symbol；
  `bg-win2.result.symbol` 是相同 code。
- CO Feature 与 source Feature1 并行，多 CO segments 并行，整个 collection batch
  原子提交。
- `bg-bn` 只描述本次 source 变成的 BN，金额为 0，不需要自身 remove animation。

### 待确认

无。若 live payload 推翻以上协议假设，执行会话应以 strict fixture 失败并报告，不添加
fallback 或猜测兼容。

## 13. 完成清单

- [ ] 目标和非目标已满足。
- [ ] CO 落定、win gating、collection、win2、BN remove 和 cascade 顺序正确。
- [ ] relocation/release-only public contract 保持中性，旧 consumer trace 不变。
- [ ] transfer prepare/commit/rollback/cleanup/destroy ownership 已覆盖。
- [ ] task135 Symbols/Layout、`assets/crave`、generated imports 和 hash 已同步。
- [ ] skin1 资源已删除且没有 consumer 残留。
- [ ] 指定 L2 自动化已通过，人工验收状态单独记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的五份领域规则和本计划；
2. 核对 Git、输入 ZIP 和 `assets/crave` 基线；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前实现时在报告记录；
5. public API、删除范围或协议假设重大变化时先停止说明；
6. 只运行计划规定的 L2 验收；
7. 完成后生成执行报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
