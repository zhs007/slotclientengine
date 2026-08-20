# 232 feature-bar-conveyor-presentation 任务计划

## 1. 目标与完成定义

### 目标

为通用 runtime 补齐两块可复用能力，并给 Minecart2 提供不直接改外部仓库的手工接入说明：

1. `packages/logiccore` 可按 step 与 exact 组件名读取服务器已解码的
   `sgc7pb.FeatureBar2Data`；
2. `packages/rendercore` 的 Game Layout production runtime 可通过任务 228 的
   `gamelayout:/` 地址取得 authored Spine node、程序图片资源，播放 exact Spine 动画、等待 once 完成、
   把 caller-owned `RenderObject` 绑定到 exact slot，并订阅 committed layout variant 变化。

Minecart2 将据此把 `bg-bar.features` 的 `normal/up/wild` 映射到 `f-coin/f-up/f-jk`，反向放入横版
`conveyor-1` 或竖版 `conveyor-2` 的五个 slot；spin 时播放 Start，完成后切 Idle，服务器响应到达后直接采用
新 `features`。

### 完成定义

- [x] `GameLogic` 与 `GameLogicStep` 都可按 exact 组件名返回冻结的 `FeatureBar2Data`；未触发返回
      `undefined`，触发但数据结构或 protobuf type 不符时抛 `LogicParseError`。
- [x] logiccore 只校验通用协议 shape，不硬编码 `bg-bar`、五格、feature 枚举、队列移位或图片语义。
- [x] Game Layout authored loop Spine capability可播放 exact animation、选择 once/loop、等待完成、stop/abort，
      并在 supersede、destroy 时拒绝未完成等待。
- [x] caller-owned、detached 图片 `RenderObject` 可批量绑定到 authored Spine exact slots；预检失败不半提交，
      detach/destroy/runtime destroy 后无 stale attachment 或 ownership 泄漏。
- [x] `gamelayout:/event/variant-changed` 只在 package runtime 成功提交不同 `variantId` 后派发一次，事件携带
      previous/current variant；首次 apply、同 variant resize、失败 apply 不派发。
- [x] 任务 228 的 node/resource 地址、现有兼容方法、默认 authored animation、mode/variant visibility 与其它游戏
      行为保持不变。
- [x] 新增 Minecart2 手工更新文档，精确覆盖初始化、spin、响应、横竖屏切换、race、cleanup 与实际资源名；
      不直接修改 `/Users/zerro/gitee.com/piximinecart2`。
- [x] shared package 使用自包含 fixtures 自动验收；Minecart2 当前真实 package 由用户按文档人工验收。

## 2. 范围

### 包含

- logiccore 的通用 `FeatureBar2Data` readonly type、parser/query、root export、测试和使用文档。
- rendercore Scene Layout authored loop Spine 的 exact animation playback 与 slot attachment capability。
- task 228 runtime address catalog 的 package-level variant change event及其 bind/wait 生命周期。
- gameframeworks facade 对新增 logic/render public contract 的 re-export，不复制实现。
- shared runtime/address 文档、最小领域规则更新、Minecart2 task 232 手工迁移文档与执行报告。
- 外部 Minecart2 当前源码、manifest 和解包 Spine JSON只作为规划与人工验收证据读取。

### 不包含

- 不修改 `/Users/zerro/gitee.com/piximinecart2/**`、`apps/game003v2/**`、`assets/minecart2/**` 或任一生产美术。
- 不把 `bg-bar`、`normal/up/wild`、`f-coin/f-up/f-jk`、conveyor node/slot/animation 名写入 shared package。
- 不修改 Scene Layout manifest version/schema，不新增 animation/slot alias 表或第二份资源清单。
- 不解码 protobuf binary Any；本任务只消费 GMI 中已展开为 JSON object 且带 exact `@type` 的组件。
- 不读取 `playerState.public.json` 恢复 feature bar；首次无本轮 `bg-bar` 时的五个 `normal` 是 Minecart2
  显式初始化规则。
- 不校验相邻两次服务器 `features` 是否精确“移除旧 index 0、补充新 index 4”，也不使用 `curFeature`
  反推或修补 `features`。
- 不重构 round operation plan、reel spin、win/popup、mode transition、Editor 或资源生成器。
- 不新增依赖，不修改 lockfile、workspace 配置或根工具链。

## 3. 制定计划时的基线

```text
UTC: 2026-08-20T06:04:51Z
HEAD: e9120f4b4c9c4d6eb0bf99dbddec11755ce536ee
branch: detached HEAD
git status --short --untracked-files=all: clean
external piximinecart2 HEAD: 19dfc7a24d4bd60293d474b28bd08b1b9c85ce5c
external piximinecart2 branch: master
external piximinecart2 status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`tasks/templates/task-plan.md`、
  `docs/agent-rules/{shared-game-runtime,scene-layout,game003}.md`；目标 package/app 没有补充 `AGENTS.md`。
- task 228 已完成 `SceneLayoutPackageRuntime.addresses`，当前可用：
  - authored node：`gamelayout:/node/<exact-id>`，返回 borrowed `SceneLayoutRenderObject`；
  - runtime image：`gamelayout:/resource/image/<exact-key>`，factory 返回 caller-owned `RenderObject`；
  - event：`bind/wait` 已有 sequence、AbortSignal 和 destroy cleanup。
- `LogicComponent.raw` 已保留并冻结未建模字段，但类型为 `unknown`；当前只有 scene/otherScene/result 的按组件名
  query，没有 `FeatureBar2Data` 的 typed query。
- `SceneLayoutSpineLoopRenderObject.play()` 当前只能重播 manifest default animation，返回 `void`；不能请求另一
  exact animation、等待 once 完成、stop，也不能把 opaque `RenderObject` 绑定到 authored node 的 Spine slot。
- program Spine `RenderObject` 已有 `play(name, { loop, signal })` 和 owned-to-owned exact slot attachment；该
  代码可复用 official player 的 completion/slot owner，但不能把 authored borrowed node伪装成 owned object。
- package runtime 当前没有 variant change address event。游戏 mount context 已有 viewport listener，但它只通知
  frame resize；task 232 需要在 `runtime.applyViewport()` 完成 layout variant commit 后通知程序对象迁移。
- 外部 `apps/minecart2/src/round-adapter.ts` 仍基本沿用 `game003v2`：viewport callback 调用
  `runtime.applyViewport()`，`startSpinPresentation()` 启动预转，`playSpin(logic)` 编译并执行响应 plan，适合在这些
  三个边界组合 feature bar controller，不需改 shared reel coordinator。
- 用户给出的 `bg-bar` 样本 exact `@type` 为
  `type.googleapis.com/sgc7pb.FeatureBar2Data`，含 `features/usedFeatures/cacheFeatures/curFeature`；样本
  `features` 为 `normal,normal,wild,normal,up`。
- 外部 `layout.manifest.json` 已声明 `conveyor-1` 仅 landscape、`conveyor-2` 仅 portrait，且 runtime
  resources `f-coin/f-jk/f-up` 都是 172×130 image。
- 解包 Spine 权威事实：
  - `conveyor_1.json` 有 `Conveyor1_Start`、`Conveyor1_Idle`；
  - `conveyor_2.json` 有 `Conveyor2_Start`、`Conveyor2_Idle`；
  - 两份 skeleton 的目标 slot 都是 exact 小写 `conveyor1_0`…`conveyor1_4`。当前竖版 slot **不是**
    `Conveyor2_*`/`conveyor2_*`，接入不得猜 alias；若美术未来改名，应同步修改手工文档中的 exact 配置。

## 4. 需求解释与技术决策

### 需求解释

1. `features` 是未来五个玩法，`curFeature` 是本轮触发玩法；本任务画面只渲染服务器 `features`，但 typed
   query 完整保留 `curFeature/usedFeatures/cacheFeatures` 供业务读取。
2. 显示映射固定属于 Minecart2：`normal → f-coin`、`up → f-up`、`wild → f-jk`。
3. 数据 index `i` 显示在 slot `4 - i`：index 0→`conveyor1_4`，…，index 4→`conveyor1_0`。
4. 首次进入没有 spin component 数据时，Minecart2 显式建立 `[normal × 5]`；这不是 logiccore fallback。
5. spin 请求开始时，用当前 authoritative queue 的 snapshot 启动 active conveyor Start once。若动画先完成且响应
   未到，临时显示 `[old[1], old[2], old[3], old[4], normal]` 并切 Idle loop。
6. spin GMI 到达时，不比较新旧 queue、`curFeature` 或 player state；立即以当前 step exact `bg-bar.features`
   覆盖显示。若 Start 尚未完成，可让其完成，但完成 continuation 只能切 Idle，不能再用旧 snapshot 覆盖服务器数据。
7. variant 变化时停止旧 Start、使当前 spin epoch只完成一次：已有服务器数据用服务器 queue，否则用上述临时
   shift；随后把同一批 caller-owned images 移到新 active conveyor slots并播放对应 Idle loop。
8. `features` 非五项或包含未映射 value 时无需推断/补齐；Minecart2 exact slot/resource lookup直接抛错并暴露
   服务器或业务配置问题。

### 关键决策

1. **新增 schema-specific、name-parameterized logic query**：`FeatureBar2Data` 是通用 server component
   schema，component name仍由 consumer传入；logiccore不维护业务注册表。
2. **只做 shape strictness**：要求 exact protobuf type、字符串数组和字符串 `curFeature`，并冻结输出；不要求
   五项、不限制 feature 字符串枚举、不证明跨 spin 关系，避免 shared code解释 Minecart2 语义。
3. **扩展 authored loop Spine 的 opaque capability**：新增 exact animation await/stop 与 batch slot binding，
   继续由 Scene Layout owner持有 player/placement/destroy，游戏不接触 Pixi Container 或 official Spine实例。
4. **batch attachment先完整预检再提交**：检查 node kind/playback、slot exact存在、child为 caller-owned且 detached、
   child/slot不重复；失败保持原 attachment。它比 app 循环操作内部 display tree更符合 ownership/rollback合同。
5. **沿用 task 228 地址，不新增 manifest字段**：node与三种 image都由 address resolve；只新增全局
   `gamelayout:/event/variant-changed` event descriptor。事件源是 committed Scene Layout snapshot，不是 raw window
   resize，避免 frame事件与实际 variant状态分叉。
6. **Minecart2 预创建 occurrence-owned image pool**：初始化时为 5 个显示位置各创建三种 image（15 个 stable
   `RenderObject`），spin/方向切换只切 attachment，不在响应热路径异步加载。每个 mutable occurrence不共享；
   texture bytes仍由 rendercore加载缓存复用。
7. **不把 feature bar塞入 `SlotOperationPlanV2`**：它是 response-owned continuous UI state，不改变 reel scene
   output；Minecart2 在 `playSpin(logic)` 收到响应时直接提交 bar数据，既满足“直接刷新”也不让 renderer认识业务。

## 5. 职责与合同

- **logiccore**：按 exact name选择已触发 component，解析/freeze通用 FeatureBar2 JSON shape；不解释业务值。
- **rendercore Scene Layout**：拥有 authored player、manual ticker、completion、slot exact preflight、attachment
  transaction、variant commit event与destroy cleanup。
- **gameframeworks**：只 re-export logic/render types/functions，Minecart2继续只依赖 facade + rendercore production
  Scene Layout入口，不直接依赖 uiframeworks/netcore/logiccore内部文件。
- **Minecart2**：拥有 component 名、feature→resource map、node/animation/slot exact配置、五格队列、spin epoch/race、
  初始 normal、错误边界和何时刷新画面。
- **资源生命周期**：authored conveyor是 borrowed且不可 destroy；15 个 image是 caller-owned；attachment handle不转移
  child ownership。切 variant先提交新 batch再释放旧关系，adapter destroy顺序为取消 playback/wait → unsubscribe →
  detach → destroy image objects → package runtime destroy。
- **失败策略**：missing/wrong component type、非法 field、unknown address/kind、非 Spine node、未知 animation/slot、
  重复/已挂载 child、destroy/stale调用全部显式失败；不使用 default animation、首项、文件名或 normal静默兜底。
- **禁止行为**：不公开 raw player/Container，不扫描 skeleton猜业务映射，不把实际 Minecart2资源名写进 shared tests，
  不复制 official update/completion listener，不从 `curFeature` 修复服务器 `features`。

## 6. 文件范围

### 预计新增

```text
packages/logiccore/src/feature-bar2.ts
packages/logiccore/tests/feature-bar2.test.ts
docs/minecart2-task232-feature-bar-conveyor-update.md
tasks/232-feature-bar-conveyor-presentation-<utctime>.md
```

### 预计修改

```text
packages/logiccore/src/{types,game-logic,index}.ts
packages/logiccore/{README.md,docs/usage-en.md}
packages/rendercore/src/presentation/{render-object,spine-slot-attachment}.ts
packages/rendercore/src/scene-layout/{types,runtime,package-runtime}.ts
packages/rendercore/src/scene-layout/core/runtime-address.ts
packages/rendercore/tests/scene-layout/{runtime,runtime-address,package-runtime}.test.ts
packages/gameframeworks/src/{index,types}.ts
packages/gameframeworks/README.md
docs/gamelayout-runtime-addresses.md
docs/agent-rules/{shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
/Users/zerro/gitee.com/piximinecart2/**
apps/game003v2/**
assets/**
apps/gamelayouteditor/**
packages/{uiframeworks,netcore,audiocore}/**
packages/rendercore/src/{reel,symbol,popup}/**
{AGENTS.md,package.json,pnpm-workspace.yaml,pnpm-lock.yaml}
```

执行时若需修改 Scene Layout schema/version、生产资源、游戏 app、root工具链，或让 shared package硬编码 feature/
conveyor语义，必须先停止并说明范围扩张。

## 7. 实施步骤

1. **确认执行基线**
   - 重核主仓 HEAD/status、task 228 address API、logic component raw shape和外部 Minecart2 exact资源事实。
   - 若 external manifest/skeleton/component样本已改变，先更新证据与手工配置，不猜兼容 alias。
2. **实现 FeatureBar2 typed query**
   - 在 `feature-bar2.ts` 实现 exact type/shape parser与冻结；在 `GameLogicStep/GameLogic` 增加按 name对称方法。
   - 测试正常数据、未触发、错误 type/field、immutability和不限制业务 feature/cardinality。
3. **实现 authored Spine presentation capability**
   - 为非 state-machine Spine node增加 exact `playAnimation`/`stopAnimation` await contract，复用唯一 runtime
     `update()` completion drain；supersede/abort/stop/destroy明确 reject。
   - 增加 batch exact slot attachment；prepare全部 binding后一次 commit，失败 rollback，detach/destroy幂等。
   - 保留现有 `play()` default行为，state-machine node不允许绕过 `requestState()`。
4. **接入 variant global event与 facade**
   - 在 task 228 catalog为 orientation-focus package加入 `gamelayout:/event/variant-changed`。
   - package runtime比较 committed snapshot，在真实 variant change后按既有 dispatcher派发一次；同 variant/首次/
     失败不派发，destroy清理 waiter/listener。
   - gameframeworks re-export新增 logic、Spine capability、attachment/event类型。
5. **编写 Minecart2 手工更新文档**
   - 给出 `apps/minecart2/src/round-adapter.ts` 与建议新增 `feature-bar-conveyor.ts` 的最小修改清单/代码骨架。
   - 使用 node/resource/event canonical地址；建立15个 occurrence-owned image、actual slot配置、初始 normal、反向
     index映射、Start/Idle、response race、variant rebind和destroy顺序。
   - 明确 `conveyor-2` 动画用 `Conveyor2_*`，但当前 slots仍用 exact `conveyor1_*`；文档不要求用户改 assets。
6. **测试、文档与收尾**
   - 更新 shared runtime/address README与最小领域规则，使用包内 fixture保护 public contract。
   - 运行 L2 定向验收；生成 UTC执行报告，Minecart2浏览器人工项标记为待用户完成。

## 8. 测试与验收

### 测试原则

- logic fixture只表达 generic `FeatureBar2Data`，不含 `bg-bar` 或 Minecart2图片/动画语义。
- render fixture用自包含最小 Spine adapter/skeleton能力，覆盖 exact animation、once/loop、supersede、abort、stop、
  batch attachment commit/rollback、variant event和destroy。
- 测试不读取 `/Users/zerro/gitee.com/piximinecart2/assets/**`；真实美术只做人工验收。

### 验收级别

`L2`：新增 logiccore 与 rendercore public API，并由 gameframeworks facade和外部 consumer直接消费；同时涉及
awaitable Spine lifecycle、attachment ownership和跨方向 commit event。无需 L3，因为不改 schema、生成物、lockfile、
root工具链或仓库游戏 app。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/logiccore typecheck
pnpm --filter @slotclientengine/logiccore exec vitest run tests/feature-bar2.test.ts tests/game-logic.test.ts
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime.test.ts tests/scene-layout/runtime-address.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/gameframeworks typecheck
git diff --check
```

### 人工验收

用户按迁移文档同步 packages并修改 Minecart2 后，在真实浏览器/美术包验证：

1. 横版初始五个 `f-coin`，`features=[normal,normal,wild,normal,up]` 时 slot 4→0 显示
   `f-coin,f-coin,f-jk,f-coin,f-up`。
2. spin Start自然完成、响应早于完成、响应晚于完成三种时序都不会被旧 queue continuation覆盖，最终与最新
   `bg-bar.features` 一致且 Idle循环。
3. Start中与 Idle中各切一次横竖屏；旧 animation彻底停止、图片只绑定到当前 conveyor、无重复/丢失，竖版使用
   `Conveyor2_*` + 当前实际 `conveyor1_*` slots。
4. 连续多次 spin、resize、错误响应和退出重进，无 rejected Promise泄漏、stale attachment或重复事件。

### 独立验收建议

`必须`：涉及跨包 public contract、awaitable animation和 caller-owned attachment生命周期。独立复验高风险点：

```bash
pnpm --filter @slotclientengine/logiccore exec vitest run tests/feature-bar2.test.ts
pnpm --filter @slotclientengine/rendercore exec vitest run tests/scene-layout/runtime.test.ts tests/scene-layout/runtime-address.test.ts
pnpm --filter @slotclientengine/gameframeworks typecheck
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 与 pnpm；shell缺 Node时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有实际下载失败后设置仓库约定代理并重试。
- 本任务不新增依赖，不修改 lockfile，不在外部 Minecart2仓库运行写入式安装/生成命令。

## 10. 生成物、文档与规则

- 本任务不改 YAML、manifest或生成物，因此无 generator/parity输出。
- 更新 logiccore/gameframeworks README、`docs/gamelayout-runtime-addresses.md` 与 Minecart2迁移文档。
- `shared-game-runtime.md` 固定 authored Spine opaque animation/slot ownership；`scene-layout.md` 固定 committed
  variant event语义。`game003.md` 继续描述仓库 `apps/game003v2` 未启用传送带，不因外部 Minecart2手工接入而改写。
- 精确 Minecart2组件、图片、动画和slot名只保存在 task 232迁移文档，不进入根 `AGENTS.md` 或 shared规则。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/232-feature-bar-conveyor-presentation-<utctime>.md
```

报告记录实际 API/文件、偏差、六条定向命令结果、未完成浏览器验收和剩余资源/race风险。

## 12. 风险、假设与待确认

### 风险

- 当前竖版 skeleton slot仍命名 `conveyor1_*`，与动画前缀不一致；未来美术重导若改名，strict lookup会失败，
  需更新外部 manifest/package与迁移配置，不能在 shared runtime加 alias。
- 真实 Spine duration、slot transform、图片视觉中心和低 FPS completion只能由用户在真实浏览器验收。
- response与Start completion/variant change可能同一帧交错；Minecart2必须以 spin epoch/generation保证 authoritative
  response不被旧 continuation覆盖。
- 15个 image occurrence增加少量 display对象；texture应复用，但 destroy与attachment次序错误仍可能泄漏，需定向
  lifecycle test与人工重复进出验证。

### 假设

- 服务器继续以内联 JSON object提供 exact `sgc7pb.FeatureBar2Data`，而不是 binary Any。
- 每次 Minecart2 spin响应的目标 step为 index 0，且触发 exact `bg-bar`；缺失时应显式失败。
- `startSpinPresentation()` 与 `playSpin(logic)` 保持当前 framework请求/响应顺序，runtime ticker持续推进。

### 待确认

无。资源命名、现有入口和接口缺口均已从当前仓库与只读外部项目确认。

## 13. 完成清单

- [x] 目标、非目标与不修改 external约束已满足。
- [x] logiccore只解析通用协议，Minecart2业务名/映射未进入 shared package。
- [x] task 228地址、animation await、batch attachment、variant event与cleanup符合计划。
- [x] server response优先级和三类 race不会提交 stale queue。
- [x] shared fixtures、README、领域规则和 facade已同步。
- [x] 六条自动化验收通过，Minecart2人工验收明确交接。
- [x] UTC中文执行报告已生成。

## 14. 执行会话交接

执行会话应先重读本计划与三份领域规则，重核 task 228当前 API和工作区；只修改主
`slotclientengine` 工作树。完成 shared packages与文档后停在可供用户手工同步的状态，不向
`/Users/zerro/gitee.com/piximinecart2` 写文件、不替用户运行外部生成器或提交代码。
