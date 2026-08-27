# 255 minecart2-bo-collection-target-offset 任务计划

## 1. 目标与完成定义

### 目标

在 `/Users/zerro/gitee.com/piximinecart2` 中微调任务 248 已实现的 BO collection 表现：全部 BO 仍沿现有
cubic curve 飞向主转轮顶部水平中心，但最终目标点在原“转轮区顶部中心”基础上沿本地 Y 轴向上移动精确
117 个游戏逻辑像素，抵达后再按现有流程消失。

本任务只改变 Minecart2 的业务目标坐标。现有 RenderCore anchor、presentation motion 和 owned clone 生命周期已能
表达该变化，因此不修改 LogicCore、RenderCore 或 slotclientengine 的共享实现，也不执行跨仓 package 同步。

### 完成定义

- [ ] `collectionTarget()` 的水平位置仍是 5×5 主转轮首行最左、最右 cell center 的中点；垂直位置严格等于现有
      转轮顶部边界位置再减 117 个本地逻辑像素。
- [ ] 所有 BO clone 使用同一个新目标 anchor，cubic path 的最终 `end` 与 `context.move(...).to` 精确一致；不是增加
      一段二次上移动画，也不是使用 CSS/device pixel 偏移。
- [ ] BO 到达新目标后仍由现有 `area.present()` ownership 清理并消失，随后播放 exact `reel-collect/0_Squib`、
      恢复 authored node 默认 loop，并原子提交 BO 原格为 `-1/-1` hole。
- [ ] `collect_start -> collect_idle`、原 BO 隐藏、0.32 秒时长、curve lift、easing、并行飞行、operation 顺序、
      abort/failure cleanup 和后续 mode transition 全部保持不变。
- [ ] 117 像素只在 Minecart2 versioned runtime config 中保存一份并严格解析；不把游戏调参写进 shared package。
- [ ] 定向自动化、构建和真实浏览器视觉验收完成后生成 UTC 中文执行报告。

## 2. 范围

### 包含

- Minecart2 runtime config 增加 BO 目标上移量，并升级私有 config version。
- `apps/minecart2/src/round-adapter.ts#collectionTarget()` 消费该配置，基于原目标点计算新 anchor。
- BO collection 单测更新目标坐标与 path endpoint 断言，并保护其余调用顺序和参数不变。
- Minecart2 README 更新 BO 最终目标的精确语义。
- 浏览器中用真实 layout、横竖屏适配和至少一个含 BO 回合检查视觉落点。

### 不包含

- 不修改 BO 触发条件、server component 解析、round compiler、operation payload/output 或 `-1/-1` hole 规则。
- 不修改 BO 的 symbol state、clone/mount/hide/destroy、Squib、恢复 idle、award、win 或 mode transition 时序。
- 不修改飞行 duration、curve kind/control-point公式、curve lift、easing、并发方式或新增第二段 motion。
- 不修改 Scene Layout/Symbol package、资源、delivery manifest、生成物、公开轮带、音频或动画名。
- 不修改 `apps/game003v2`，也不将 Minecart2 本次调参反向同步为基线游戏行为。
- 不新增依赖，不修改 package/workspace/lockfile，不做相邻重构或格式化无关文件。

## 3. 制定计划时的基线

```text
UTC: 2026-08-27T04:12:07Z
slotclientengine HEAD: e0aa0195edf03cd43aa54c6885dfb09b31ec0795
slotclientengine branch: detached HEAD
slotclientengine git status --short --untracked-files=all: clean

piximinecart2 HEAD: dc3a79c7bd83d30f63c466db215b47d501e8b151
piximinecart2 branch: rgs
piximinecart2 git status --short --untracked-files=all: clean
```

- 已读取两仓根 `AGENTS.md`、`tasks/templates/task-plan.md`，以及 slotclientengine 中作为当前领域合同来源的
  `docs/agent-rules/{game003,shared-game-runtime,loading-ui}.md`；目标 app、LogicCore 与 RenderCore 下没有补充
  `AGENTS.md`。piximinecart2 没有自己的 `docs/agent-rules/` 副本。
- 任务 248 的当前基线由 piximinecart2 commit `799a38a` 引入，且为当前 HEAD 的 ancestor。当前入口为
  `/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts#playBoCollection()`：它调用
  `collectionTarget()`，在 top layer resolve source/target anchors，并把同一 target 同时传给 motion `to` 与
  `boCurve()`。
- `collectionTarget()` 当前以首行左右 cell center 算 `x`，以 `left.y - cellHeight / 2` 算原顶部边界 `y`；测试
  fixture 的 cell 为 100×100，因此当前期望目标为 `{x:250,y:0}`。本任务后的同 fixture 目标应为
  `{x:250,y:-117}`。
- `boCurve()` 当前只以 source、最终 target 和 cell height 生成单段 cubic path；控制点公式会自然使用新的 target，
  最后一段 `end` 即 target，无需修改 RenderCore motion API。
- `/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json` 当前为 version 4；
  `boCollection` 已是 duration、curve lift 与 easing 的唯一调参来源，`src/config.ts` 负责同步 strict 解析。
- 当前 BO 正常路径在 `area.present()` resolve 时销毁 mounted owned clones，然后才播放 Squib并提交 holes；失败路径恢复
  尚未提交的原 BO，现有 ownership 足以满足本任务，不存在 LogicCore/RenderCore 能力缺口。
- slotclientengine 的 `apps/game003v2` 尚无该 BO collection app 实现；piximinecart2 的 RenderCore source 仅有既存
  standard-reel `-1` hole差异，与目标偏移无关。本任务不借机同步或覆盖任何 shared drift。

## 4. 需求解释与技术决策

### 需求解释

1. “顶部中心位置再上移117像素”按用户补充“就是目标点上移117像素”解释为：直接把原最终 anchor 的本地
   `y` 减 117；不是先飞到旧点，再追加向上 117 的第二段动画。
2. “像素”指 RenderCore/ReelArea 使用的游戏逻辑坐标单位。浏览器缩放、device pixel ratio 和横竖屏 viewport
   只改变最终显示缩放，不改变 authored/local 117 单位。
3. “别的逻辑都不变”包括飞行曲线类型与公式不变；控制点数值因最终 target 改变而随公式自然变化，不视为另行调参。
4. 到达后的“消失”继续使用 presentation scope 对 mounted owned clone 的既有 cleanup边界，不新增 opacity、visible
   或延迟步骤。

### 关键决策

1. **新增 `boCollection.targetOffsetUpPixels: 117`，而非在源码散落魔法数。**
   - 字段名用正数表达“向上”，`collectionTarget()` 在 top-left/Pixi 本地坐标中执行减法，避免负配置的方向歧义。
   - config version 从 4 升为 5，parser 用 exact finite 117 校验，旧/未知 version 显式失败，不增加默认值或兼容 fallback。
2. **只调整 app-owned target anchor。**
   - `ReelArea.getAnchor()`、layer-local `resolveAnchor()` 和 `PresentationScope.move()` 已提供需要的通用合同；117 是游戏
     专属表现参数，不应扩展 shared public API或写入 RenderCore。
   - LogicCore operation 只负责 BO positions/final holes，不拥有表现坐标，因此不修改。
3. **以一个 anchor 同时驱动 `to` 与 path endpoint。**
   - 保持 motion preflight和终点一致，不缓存 world point，不向 app 开放 raw Matrix/Container。
   - 测试除断言 `to={250,-117}` 外，还应断言 cubic最后一个 segment的 `end` 同值，防止只移动 anchor却保留旧路径终点。
4. **保持现有生命周期与时序，不添加过渡补丁。**
   - clone仍在到达后随 presentation scope销毁，Squib和hole commit仍在其后；不新增 timer、RAF、第二个 clone或静默 fallback。

## 5. 职责与合同

- **LogicCore/operation compiler**：继续拥有 immutable BO positions、final scene/value holes和执行顺序；本任务不修改。
- **RenderCore**：继续拥有 opaque anchor换算、manual-clock cubic motion、presentation cleanup与盘面 mutation；本任务不修改。
- **Minecart2 config**：拥有 exact 117 逻辑像素业务调参和 config version；缺字段、错误 version、非目标值显式失败。
- **Minecart2 adapter**：从主转轮稳定 cell anchors算原顶部中心，再应用唯一 config offset；不读取 visual bounds、CSS坐标或
  raw display tree。
- **资源生命周期**：original是borrowed symbol，clone是当前 presentation owned object；到达、失败、abort和未挂载清理继续
  复用既有 exactly-once destroy/restore边界。
- **禁止行为**：不在测试或 README 另建可执行参数表，不把 117 写进 shared包，不猜 viewport scale，不新增旧 config
  alias/default，不改变 server或resource合同。

## 6. 文件范围

### 预计新增

```text
tasks/255-minecart2-bo-collection-target-offset-<utctime>.md
```

### 预计修改

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/config.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

若现有测试结构需要直接验证 config strict failure，可新增
`/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/config.test.ts`，但不得为此导出仅供测试的 production parser。

### 原则上不应修改

```text
packages/{logiccore,rendercore}/**
apps/game003v2/**
docs/agent-rules/**
/Users/zerro/gitee.com/piximinecart2/packages/{logiccore,rendercore}/**
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-compiler.ts
/Users/zerro/gitee.com/piximinecart2/assets/**
AGENTS.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

执行时若发现必须扩展 LogicCore/RenderCore，先停止并说明实际 shared 缺口；获得继续方向后，必须先在 slotclientengine
实现、定向验证，再仅同步实际变更文件到 piximinecart2，不能先改外部 package或复制一套游戏私有 shared逻辑。

## 7. 实施步骤

1. **重核双仓基线与任务 248 行为**
   - 核对两仓 HEAD/status、本计划和领域规则；保留执行时出现的用户无关修改。
   - 重读当前 `playBoCollection()`、`collectionTarget()`、config v4和定向测试，确认没有新 shared API缺口或后续
     任务对 BO 终点的并发修改。
2. **升级 Minecart2 私有 runtime config**
   - 把 config version 升为 5，在 `boCollection` 增加唯一 `targetOffsetUpPixels: 117`。
   - `src/config.ts` 同步只接受 version 5，并对该字段做 exact finite 117 校验；不提供缺省值、v4升级器或 alias。
3. **应用新的 BO 最终 anchor**
   - 在 `collectionTarget()` 保留现有 X和cellHeight推导，只把原顶部边界 Y 减去解析后的
     `GAME003V2_CONFIG.boCollection.targetOffsetUpPixels`。
   - 保持返回同一个 opaque anchor给 `context.move().to` 和 `boCurve()`；不修改 curve、duration、easing、cleanup、Squib
     或 mutation代码。
4. **更新定向测试与说明**
   - 将 BO fixture目标从 `{250,0}` 更新为 `{250,-117}`，并增加 path最后 `end` 与新 target一致的断言。
   - 保留并复验 state、clone、hide、duration、easing、Squib、hole commit和failure restore断言；README改为“顶部中心上方
     117逻辑像素”，不复制配置表。
5. **验收与收尾**
   - 运行 Minecart2 定向 test、typecheck、build和两仓 diff检查；失败先最小化复现，不升级为整仓扫描。
   - 在真实浏览器用含 BO 的回合检查横竖屏最终落点、消失和后续Squib/hole流程；生成UTC中文报告，记录人工验收是否完成。

## 8. 测试与验收

### 测试原则

- 使用现有可控 ReelArea/layer anchor fixture，不用 wall-clock sleep或复制 RenderCore motion实现。
- 正常路径精确保护新终点、path end、0.32秒、cubic/easing、Squib和hole commit；failure测试继续保护原 BO恢复且不提交。
- 不扩张到与目标坐标无关的 compiler、feature bar、anticipation、popup或shared package全量测试。

### 验收级别

`L1`：只修改 Minecart2 单 app的私有versioned runtime config、目标坐标与直接测试，不改变 shared public API、正式资源、
生成器、lockfile或直接依赖合同。视觉坐标必须另做真实浏览器人工验收，但不因此升级整仓L3。

### 执行会话必须运行

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-adapter.test.ts
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
git diff --check
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
```

`typecheck`验证config字段与consumer，`build`验证同步后的JSON import及真实Vite consumer；不运行根级lint/test/build。

### 人工验收

1. 在真实Minecart2页面触发至少一个含 BO 的回合；确认全部 BO仍并行沿原快速curve飞行，最终中心 X不偏移，Y落点相对
   任务248旧顶部中心精确向上117个游戏逻辑像素，并在抵达后消失。
2. 确认 clone消失后仍只播放一次 exact `0_Squib`，原BO位置成为holes，后续round/BonusGame transition正常推进；无双影、
   闪回、残留或额外停顿。
3. 横屏和竖屏各检查一次，确认117是随游戏画面一起缩放的local offset，而不是CSS/device pixel造成不同相对位置。

### 独立验收建议

`不需要`：不涉及跨包public contract、credential/server数据边界、新资源ownership、异步transaction设计、正式schema、
ZIP、生成物或release。执行者仍必须完成上述视觉验收；若交由用户完成，报告明确标为待验，不以单测代替。

## 9. 环境与依赖

- Node.js使用仓库要求的Node 24。当前shell缺少Node时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 统一使用该环境的Node和pnpm，不切换npm/yarn，不强制改变版本。
- 依赖缺失时才运行：

  ```bash
  CI=true pnpm --dir /Users/zerro/gitee.com/piximinecart2 install --frozen-lockfile
  ```

- 只有下载实际失败后才设置仓库约定代理并重试原命令。本任务不新增依赖、不修改lockfile。

## 10. 生成物、文档与规则

- `game-runtime.manifest.json` 是手写的Minecart2私有versioned runtime config，不是生成物；修改后由strict parser、
  typecheck和build验证，不运行无关asset generator。
- 不修改Scene Layout ZIP、delivery manifest、asset map、YAML或生成TypeScript文件，因此无生成物/parity checker。
- 更新Minecart2 README中任务248的目标描述；职责/public workflow没有变化，不更新根或领域 `AGENTS.md`/规则。
- 没有shared文件变化，不执行slotclientengine到piximinecart2的package同步；若实际出现shared缺口，按第6节先停下说明。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/255-minecart2-bo-collection-target-offset-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现/文件、config v5字段、计划偏差、自动化命令结果、浏览器横竖屏结果、剩余风险和未完成项；
不收集无关coverage、历史矩阵、整仓统计或profiler数据。

## 12. 风险、假设与待确认

### 风险

- 自动化可证明local target由0变为-117及path一致，但不能证明真实美术中视觉位置合适；必须用真实layout人工确认。
- 如果执行前 config version 已因其它任务升级或 BO代码有新改动，应小幅顺延version/合并字段并在报告记录；不得覆盖新配置。
- 目标上移后可能落到当前viewport可见范围之外；这应由真实画面如实呈现，不能用clamp/fallback悄悄改变117。

### 假设

- 用户要求的117是游戏逻辑像素，且“目标点上移”是单一最终target平移；用户已明确不是新增第二段动画。
- 任务248现有顶部中心定义 `left.y - cellHeight / 2` 保持权威，水平中心和全部生命周期不重算。

### 待确认

无。

## 13. 完成清单

- [ ] 新终点为原顶部中心的本地Y减117，水平中心不变。
- [ ] 其它BO collection逻辑、配置和生命周期均未改变。
- [ ] 实际修改未超范围，或偏差已在报告说明。
- [ ] 未修改或复制LogicCore/RenderCore；若发现shared缺口已按双仓顺序处理并说明。
- [ ] 定向test、typecheck、build和diff检查通过。
- [ ] 浏览器横竖屏验收与自动化结果明确区分。
- [ ] README已同步，未误改资源、生成物、依赖或规则。
- [ ] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取两仓根 `AGENTS.md`、本计划列出的领域规则和本计划；
2. 核对两仓Git基线与工作区，保留用户已有和无关修改；
3. 按计划只修改piximinecart2 Minecart2 app，不重新制定另一套方案；
4. 小幅适配当前实现或config version时在报告记录；
5. 需要shared改动或其它重大扩围时先停止说明，并严格遵循“slotclientengine先改/验，再同步”的顺序；
6. 只运行计划规定的L1验收，人工验收不能由单测代替；
7. 完成后生成UTC中文执行报告；
8. 除非用户明确要求，不commit、不push、不创建PR。
