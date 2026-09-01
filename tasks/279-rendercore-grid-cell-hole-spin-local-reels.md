# 279 rendercore-grid-cell-hole-spin-local-reels 任务计划

## 1. 目标与完成定义

### 目标

修正 RenderCore legacy grid-cell 主轮从稳定 hole（scene code `-1`，业务资源中通常对应空图标 `BN`）起转时的
错误初始化。`spinMainReelToScene()` 或 continuous start/settle 使用本次显式 `localReels` 时，当前位置的 hole
必须作为当前临时 strip 的出发端点随轴向运动离开窗口，后续过程图标只来自本次选定的公开本地轮带；省略
`localReels` 时同样使用 active Symbols binding 的默认公开轮带。不得在 start boundary 先移除 hole、用构造时默认
轮带预填图标，或让服务器 target scene 充当过程轮带。

engine 修复和定向测试通过后，把本任务涉及的 `@slotclientengine/rendercore` 最小差异同步到独立
`/Users/zerro/gitee.com/pixicrave` workspace，并验证 Crave 实际 consumer；不在 Crave app 增加绕过 shared bug 的
预填、scene reset 或轮带复制逻辑。

### 完成定义

- [ ] target-aware full/selective grid-cell spin 从 settled `-1` 起转时，start edge 不调用默认轮带 reset 来替换当前
      hole；hole 保留在 outgoing strip 中并按与其它 occurrence 相同的方向、速度和 clip 运动离开。
- [ ] 显式传入 `localReels` 后，除 outgoing settled endpoint 与最终 authoritative target window 外，滚动过程中的
      code 全部来自该数组；构造时默认 `LogicReels` 中独有的 code 不得闪现或进入临时 strip。
- [ ] 未传 `localReels` 时复用 active Symbols binding 的公开 reel set，hole 起转语义与显式覆盖一致。
- [ ] targetless continuous 从 hole 起转，以及 response 在 staggered cell 尚未 start 时转入 target-aware 的路径遵守
      同一合同；不重新引入提前 prefill。
- [ ] occupied settled cell、held/selective 未选格、最终 target 为 hole、presentation value、landing state/appear、
      immediate stop、dimming/effect 与 landing edge 行为保持不变。
- [ ] `SceneLayoutPackageRuntime.spinMainReelToScene()` 的 public 类型和调用方式不变；不新增 schema、manifest、配置字段、
      依赖或 lockfile 变化。
- [ ] engine 与 pixicrave 的相关 RenderCore source/test 合同同步，定向自动化、Crave build、人工视觉验收和 UTC 中文
      执行报告完成。

## 2. 范围

### 包含

- `RenderGridCellReelSet` target-aware 与 targetless continuous 的 empty-cell start boundary。
- `RenderReel.start()` / `startContinuous()` 既有 current-window overlay 与 per-spin `options.reels` ownership 的正确复用。
- lower-level grid-cell tests、Scene Layout `spinMainReelToScene()` 集成回归和最小 README/领域规则澄清。
- engine 完成后的 task-scoped RenderCore patch 同步，以及 pixicrave RenderCore/Crave consumer 验收。
- full、selective、continuous、response-before-start 四种会从 settled hole 进入 rolling 的路径。

### 不包含

- 不改变 `-1` 是 settled/grid-cell 唯一 hole marker 的合同，也不把业务 `BN` code 改写进 scene、target 或 public API。
- 不让 configured empty symbol 创建完整 `SymbolPlayer`、滚动 texture、placeholder 或伪造可见资源；“转下去”由临时
  strip 中 hole/gap 的物理位置连续性表达。
- 不修改服务器 scene、randomNumbers、stop 推导或公开轮带配置；服务器 scene 仍只覆盖最终可见落点。
- 不修改 standard reel、CellSpin、cascade/dropdown/remove、Nearwin、quick-stop、feature/win 或 Crave round 数据逻辑。
- 不统一 engine 与 pixicrave 的全部 RenderCore drift，不复制整个 `packages/rendercore`，不覆盖 pixicrave 独有代码。
- 不修改 production assets、Symbols/Layout ZIP、YAML、生成物、root tooling 或其它 engine packages。
- 不 commit、不 push、不建 PR；用户只要求计划和后续实现/同步，未授权版本库提交。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T04:34:50Z

slotclientengine HEAD: ee2f0d1c442daa118b1c5cdc2085bd5f9a181cda
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

pixicrave HEAD: 1864ad2dc215fd06f808a5877e120eee0fbdadfd
pixicrave branch: master
pixicrave git status --short --untracked-files=all: clean
```

已读取：

- 两仓根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `docs/agent-rules/shared-game-runtime.md`
- `docs/agent-rules/scene-layout.md`
- `tasks/263-pixicrave-grid-cell-immediate-spin-stop.md` 及执行报告（仅核对跨仓最小同步方式）
- engine/pixicrave 的 RenderCore reel、Scene Layout runtime/test，以及 pixicrave Crave local-reel 调用点

目标目录没有补充 `AGENTS.md`。

当前结论：

- `SceneLayoutPackageRuntime.spinMainReelToSceneInternal()` 已把显式 `localReels` 构造成名为
  `scene-layout-local-spin` 的 `LogicReelsModel`，并通过 `RenderGridCellReelSet.spin(..., { reels })` 传入；facade 的
  数据选择和 strict validation 入口不是缺口。
- `RenderGridCellReelSet.spin()` 把本次 reels 保存到 `#spinReels`。但 `updateCell()` 遇到 `!cell.occupied` 时先调用
  `cell.reel.resetToY(planCell.axisPlan.startY)`；`resetToY()` 只读取 `RenderReel` 构造时的 `#reels`，立即丢弃 settled
  `-1`，随后 `RenderReel.start()` 又把这个错误预填 code 当成 `currentVisibleSymbols` 写入临时 strip。
- `startContinuous()` 的 per-spin reels 同样已保存在 active transaction，但 continuous start edge 也先执行
  `resetToY(localPhaseY/currentY)`，因此显式 local phase 仍会从构造时默认轮带物化错误的 initial code，再由
  `RenderReel.startContinuous({ reels: active.reels })` 锁进 `initialCodes`。
- `RenderReel.start()` 本身会用当前 visible scene 作为 temporary strip 的 outgoing endpoint，再从
  `options.reels` 填充过程 code并叠加 target endpoint；`startContinuous()` 也会锁存当前 visible endpoint，已有原子
  primitive 足以保留 settled hole，不需要新增 API 或 app 预填。
- 现有 continuous 测试只使用与 constructor 相同的 basic reels，并仅断言 hole cell 变为 active，未证明 hole 的
  outgoing 连续性或 custom per-spin reels 不受默认 reels 污染；target-aware hole 测试也只检查最终 scene。
- pixicrave 的 `render-grid-cell-reel-set.ts`、`render-reel.ts`、相关 lower-level tests 与 engine 当前 byte parity；
  `package-runtime.test.ts`、RenderCore README 和 shared rule 存在合法 drift，必须只应用本任务 hunk。
- Crave 在 FreeGame targetless start、response settle和后续 direct target-aware spin 都显式传
  `FREE_GAME_LOCAL_REELS`；app 已正确提供数据，无需修改 `round-adapter.ts`。

## 4. 需求解释与技术决策

### 需求解释

1. “空图标/BN 应该转下去”解释为当前 settled hole 是本次滚动 strip 的真实 outgoing endpoint：起转第一帧保持原位置，
   随 reel 位移离开 clip，轮带后续 code 再进入；不是在起转调用栈里直接换成另一个 symbol。
2. “最开始还有不是这个轮子上的图标”指过程 strip 被 constructor/default reels 污染。修正后显式 `localReels` 是该次
   spin 唯一过程轮带；只有转前已结算的 current endpoint 和服务器授权的 final endpoint可不属于它。
3. “不管有没有轮子数据”覆盖两个合法来源：显式 raw `localReels` 覆盖，或省略后从 active Symbols binding 的
   game config取得默认公开轮带；两者使用同一个 start primitive和hole语义。
4. response 早于 staggered hole start 时，未启动格仍保持 settled hole。到其真实 start boundary 后才建立
   target-aware strip；不能因 settle 已到达而提前 reset或直接显示 target。
5. configured empty code（例如本地轮带里的 `BN` code）继续由 registry 解析为 lightweight empty rolling slot；本任务
   不把它与 scene hole `-1` 混为同一个数据 code，也不恢复空图资源。

### 关键决策

1. **去掉 grid-cell 对 hole 的 constructor-reel prefill，复用现有 RenderReel endpoint overlay。**
   - target-aware start 直接以当前 `resetToScene()` 已建立的 `[-1]` visible window调用 `RenderReel.start()`。
   - continuous start 直接调用 `RenderReel.startContinuous()`，让它把当前 `-1` 锁存在 selected local phase 的
     `initialCodes`，相邻 symbol 从 `active.reels` 读取。
   - `resetToY()` 仍保留给 constructor/显式 phase reset，不再作为“让空格可 spin”的隐式填充手段。
2. **每次 spin 的 reels 是唯一过程 source。**
   - target-aware 只用 `#spinReels ?? #reels`；continuous 只用 `active.reels`。不得在 hole 分支提前访问另一个 reels owner。
   - final target仍由现有 temporary strip target overlay提交，不能要求 target能在公开轮带反查。
3. **不扩 public API。**
   - 不给 `spinMainReelToScene()` 增字段，不给 `RenderReel.resetToY()` 增 fallback/optional reels，也不让 app 传当前 BN。
   - 修复属于 `RenderGridCellReelSet` 内部 start orchestration；Scene Layout只补真实入口回归测试。
4. **occupied 标志只在 atomic start成功后进入 active语义。**
   - hole在 waiting 时仍是 settled empty；`RenderReel.start/startContinuous` 成功后再让cell进入 spinning/active。
   - start失败继续按既有 strict error传播，不以默认轮带、首项或 placeholder重试，也不留下假 occupied snapshot。
5. **engine diff是外部同步依据。**
   - 先完成engine源码、测试和文档并验收，再按实际 touched hunk同步pixicrave。
   - byte-parity文件可同步完整任务后版本；已有drift的test/README/rule只应用上下文patch并分别验证，不整目录覆盖。

## 5. 职责与合同

- **Scene Layout façade**：选择 active binding/default reels或构造显式 local reels，验证scene/phase/value/state并创建plan；
  不预填 hole、不操作单格 display。
- **RenderGridCellReelSet**：拥有 stagger、cell activity、`#spinReels`、hole-to-active start和occupied/phase edge；两种
  spin模式必须共享“当前endpoint + selected per-spin reels”的合同。
- **RenderReel**：拥有单轴 temporary strip、current/target overlay、轻量rolling slot、clip与landing prepare；不解释
  BN业务名或server scene来源。
- **Crave app**：只选择FreeGame公开轮带并传入现有API；不复制reel状态机，不用`resetReelScene()`或替换symbol修观感。
- **数据/API**：scene hole保持`-1/null`；raw `localReels`保持x-first symbol code数组；`SceneLayoutMainReelSpinInput`、
  `GridCellReelSpinPlan`和manifest均不变。
- **资源生命周期**：settled empty handle在start后变stale遵守既有spin ownership；rolling阶段不创建完整SymbolPlayer，
  landing仍只prepare最终occurrence。held格和未到start boundary的格保持原owner。
- **失败策略**：非法local reels长度/code/value、unknown symbol、错误phase和并发spin在现有消费边界显式失败；禁止fallback
  到constructor reels。
- **禁止行为**：app预填、默认首项、轮带猜测、服务器stop反推、第二份业务轮带、完整空SymbolPlayer、整包覆盖外部drift。

## 6. 文件范围

### 预计新增

```text
tasks/279-rendercore-grid-cell-hole-spin-local-reels-<utctime>.md
```

### 预计修改

```text
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md

/Users/zerro/gitee.com/pixicrave/packages/rendercore/src/reel/render-grid-cell-reel-set.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/scene-layout/package-runtime.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/README.md
/Users/zerro/gitee.com/pixicrave/docs/agent-rules/shared-game-runtime.md
```

若 lower-level assertions 能清楚放入现有两个 reel test 文件，不新增专用 test file。若无需改变 public API，
`scene-layout/package-runtime.ts`、`types.ts` 和 Crave app source 均不应修改。

### 原则上不应修改

```text
packages/rendercore/src/reel/render-reel.ts
packages/rendercore/src/scene-layout/{package-runtime,types}.ts
packages/{logiccore,gameframeworks,bridgecore,uiframeworks}/**
apps/**
assets/**

/Users/zerro/gitee.com/pixicrave/apps/crave/**
/Users/zerro/gitee.com/pixicrave/packages/{logiccore,gameframeworks,bridgecore,uiframeworks}/**
/Users/zerro/gitee.com/pixicrave/assets/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
AGENTS.md
```

若实现必须改变 `RenderReel` public primitive、Scene Layout input类型、Crave业务轮带或manifest，属于明显扩围，先停止并
说明当前primitive为何不能表达“current endpoint + per-spin reels”，不得修改计划来事后合理化。

## 7. 实施步骤

1. **重核双仓基线并固定失败用例**
   - 重读本计划和两份领域规则，确认两仓status、关键文件parity及pixicrave既有drift。
   - 在engine先写target-aware、continuous和Scene Layout失败测试，使用constructor reels与per-spin reels互斥的code
     序列，使任何默认轮带污染都可观察；同时保留一个settled `-1` cell。
2. **修正target-aware hole start**
   - 调整`RenderGridCellReelSet.updateCell()`：不再对hole调用`resetToY()`；直接让`RenderReel.start()`从当前empty
     window建立temporary strip，并只传本轮`#spinReels ?? #reels`。
   - start成功后更新occupied/phase/lifecycle；waiting、held、landing target、dimming和effect时间线不改。
3. **修正continuous与early-response start**
   - 调整continuous start edge，移除对constructor reels的hole materialization；把current empty endpoint、选定
     `localPhaseY`和`active.reels`交给`RenderReel.startContinuous()`。
   - 验证直接continuous、settle前已start、response早于start三种路径；后两者不得重复起转或丢失remaining cadence。
4. **补齐回归测试与合同文档**
   - lower-level测试逐边界断言：start前hole不变、start后outgoing gap连续移动、后续非target code仅来自per-spin
     reels、最终scene/value正确、held格identity不变。
   - `package-runtime.test.ts` 从`spinMainReelToScene({ localReels })`真实入口覆盖initial hole和custom reels，并补省略
     localReels的default path；不以只检查`options.reels`参数替代可观察strip断言。
   - README/shared rule明确outgoing hole、per-spin reel唯一来源及configured empty code与`-1`边界。
5. **engine定向验收**
   - 运行RenderCore定向tests/typecheck和diff检查；失败先缩小到单cell/start boundary，不扫描整仓。
   - 检查engine最终diff只包含计划文件、RenderCore实现/测试和最小文档规则，不生成或stage `dist`。
6. **最小同步到pixicrave**
   - 以engine最终task diff为输入同步source/test合同；对byte-parity文件保持同步后parity，对已有drift文件只应用新增
     case/段落，保留外部独有内容。
   - 不修改Crave adapter；运行外部RenderCore测试/typecheck和Crave build，确认workspace实际引用同步后的包。
7. **人工验收与报告**
   - 在Crave真实FreeGame local reels场景观察direct target-aware及continuous/early-response：BN/hole自然出轴，无默认
     reel图标闪现，target正常landing。
   - 生成engine UTC中文报告，记录两仓实际文件、同步方式/parity、自动化、人工结果、偏差和剩余风险；两仓保持未提交
     workspace diff供用户审查。

## 8. 测试与验收

### 测试原则

- 使用self-contained 1×1或2×3 registry/reels，不读取Crave production assets；constructor reels和per-spin reels必须有
  可区分code，避免错误路径碰巧得到相同图标而假通过。
- 测试采样start boundary和至少一个尚未进入target overlay的rolling位置，分别断言outgoing hole与local strip来源；
  最终scene断言不能替代过程断言。
- target-aware覆盖full与selective hole；continuous覆盖直接start和response-before-staggered-start。已有普通occupied、
  final hole、landing appear和immediate stop测试继续回归。
- 不用mock app预填或把`resetToY()`调用次数作为唯一成功标准；主要断言visible slot/code/position和final snapshot。
- shared测试不硬编码`BN`业务code；用`-1`表示scene hole，用中性configured empty code验证轮带空项时保留轻量语义。

### 验收级别

`L2`。RenderCore public签名不变，但修正共享reel可观察行为，并把实现同步到独立workspace的直接consumer；需要验证
engine producer、pixicrave副本和Crave bundle。未改schema、生成器、root工具链、lockfile或release，不升级L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/reel/grid-cell-continuous-spin.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/reel/grid-cell-continuous-spin.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore typecheck
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter crave build
git diff --check
git -C /Users/zerro/gitee.com/pixicrave diff --check
```

超过6条是因为必须分别证明engine producer、外部RenderCore同步副本和Crave直接consumer；不运行两仓根级全量
typecheck/test/build。若现有大测试文件出现无关基线失败，先用新增exact case最小复现并记录，不删除或放宽断言。

### 人工验收

1. Crave FreeGame稳定盘面包含一个或多个BN/hole时触发后续direct `spinMainReelToScene({ localReels })`：每格按stagger
   起转，原hole随轴向离开，不在start edge直接跳成图标；随后只出现`FREE_GAME_LOCAL_REELS`允许的过程内容。
2. 从同样盘面启动targetless预转，并分别让response在该格start之前/之后到达：hole离开、local reel过程、最终server
   target和landing appear都连续，无默认Base reel图标闪现或二次起转。
3. 复验普通occupied格、selective refill hole、最终target hole和quick-stop：held格不动，最终scene/value正确，无clip、
   dimming、Nearwin或控制台错误残留。记录低速/逐帧观察结果；自动测试不能冒充该视觉验收。

### 独立验收建议

`建议`。不涉及credential、安全、schema、ZIP或新资源owner，但涉及shared rolling ownership和外部consumer同步。建议独立
复验custom reels污染和early-response两个高风险点，并运行：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/reel/grid-cell-continuous-spin.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore exec vitest run tests/reel/render-grid-cell-reel-set.test.ts tests/reel/grid-cell-continuous-spin.test.ts tests/scene-layout/package-runtime.test.ts
```

## 9. 环境与依赖

- 使用两仓要求的Node.js 24与pnpm；shell没有Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时在对应workspace使用`CI=true pnpm install --frozen-lockfile`；只有实际下载失败后才按仓库约定设置代理重试。
- 复用现有Pixi、LogicReels、Vitest与test helpers；不新增/升级依赖，不修改两仓lockfile。
- pixicrave现有`dist/`、`node_modules/`不是同步输入或交付物，不删除、不stage、不用于证明source parity。

## 10. 生成物、文档与规则

- 本任务无YAML、manifest、schema或生成TypeScript变化，不运行生成器；build产物不手改、不纳入同步。
- `packages/rendercore/README.md`补充legacy grid-cell hole起转：current hole先作为outgoing endpoint，过程内容读取本轮
  selected reels，final target单独覆盖。
- `docs/agent-rules/shared-game-runtime.md`把已有“hole可直接进入spin并从公开轮带物化”澄清为不得先用constructor
  reels覆盖current hole；这是稳定跨consumer边界，因此engine与pixicrave都同步最小规则hunk。
- 根`AGENTS.md`、scene-layout schema文档和Crave README不变；没有新的仓库级职责或app workflow。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/279-rendercore-grid-cell-hole-spin-local-reels-<utctime>.md
```

UTC使用`date -u +%y%m%d-%H%M%S`。报告简要记录根因、最终start合同、engine/pixicrave实际修改文件、byte-parity与
context patch清单、自动化/人工验收、未完成项和剩余风险；不收集无关coverage、全仓统计、完整历史矩阵或profiler。

## 12. 风险、假设与待确认

### 风险

- `occupied`当前同时参与settled occurrence可用性和active cell推进；若只删除`resetToY()`却不调整成功后的phase/flag顺序，
  可能导致hole不update、snapshot错误或start失败后留下假occupied。
- temporary strip包含两个合法的非local endpoint（current settled与final target）。测试若笼统要求“所有code都在
  localReels”会错误拒绝协议；必须只审计中间rolling区间。
- continuous local phase改变symbolY基准；如果current hole没有锁存在该次phase对应的initial endpoint，首帧仍可能跳位，
  或response settle时重新读取constructor reels。
- configured empty code可能没有纹理，肉眼只看到gap；人工验收需通过相邻图标/格底的连续位移判断“转下去”，不能要求
  RenderCore恢复被合同禁止的BN完整资源。
- pixicrave README/rule/test存在合法drift；整文件覆盖会带入无关engine能力或删除外部适配，必须按task hunk同步。

### 假设

- 用户描述的“空图标BN”在Scene Layout settled scene中规范化为`-1`，而显式`localReels`仍保存game config symbol code。
- 期望是保留当前位置hole的运动连续性，而不是让空图标创建可见贴图/Spine player。
- engine是共享实现权威，pixicrave继续使用workspace-local复制的`@slotclientengine/rendercore`，本任务不改为外部包依赖。
- 当前两仓clean基线在执行前若改变，执行者会保留用户修改并重新判断task hunk是否仍可安全应用。

### 待确认

无。若人工证据表明用户要求的是“BN必须显示一张可见纹理并旋转”，将与当前configured empty/hole资源合同不同，属于新的
资源与SymbolPlayer需求，应先停止并确认，不在本bug修复中暗自恢复空图资源。

## 13. 完成清单

- [ ] target-aware与continuous从hole起转都保留outgoing endpoint连续性。
- [ ] 显式/默认公开轮带均无constructor-reel过程污染，final target仍精确提交。
- [ ] full/selective、early-response、held、final hole、value/state/appear和immediate stop无回归。
- [ ] public API、schema、manifest、依赖和Crave业务代码未扩张。
- [ ] engine与pixicrave最小RenderCore差异已同步并记录parity/drift处理。
- [ ] 指定L2自动化和Crave人工视觉验收已完成并明确区分。
- [ ] UTC中文执行报告已生成，两仓未擅自commit/push。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根`AGENTS.md`、本计划、两仓`shared-game-runtime.md`及engine`scene-layout.md`；
2. 核对双仓HEAD/status和关键文件drift，先固定custom reels与settled hole失败测试；
3. 按“target-aware start → continuous/early-response → Scene Layout integration → 文档规则”顺序修engine；
4. engine定向验收通过后，只把本任务实际RenderCore hunk同步到pixicrave，不改Crave app workaround；
5. 对已有drift文件做上下文适配并在报告列明，重大API/资源/manifest扩张时先停止说明；
6. 只运行计划规定的L2命令，完成Crave人工视觉验收后生成UTC报告；
7. 除非用户另行明确要求，不commit、不push、不创建PR。
