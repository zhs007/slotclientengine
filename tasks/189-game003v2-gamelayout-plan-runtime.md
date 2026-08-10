# 189 game003v2-gamelayout-plan-runtime 任务计划

## 1. 目标与完成定义

### 目标

新增 `apps/game003v2`，把现有 game003 收敛为类似仓库最新精简实现的 Scene Layout package
consumer：回合先由 logiccore 编译成完整 immutable `SlotOperationPlanV2`，再由 rendercore 按 operation
执行标准转轮、Symbols、中奖、CO overlay 与 Popup；app 只保留 game003 component/value/amount policy 和
少量 function 注入，不复制 shared parser、reel、symbol、popup、ticker 或 operation coordinator。

同时把只读输入 `/Users/zerro/Downloads/minecart2/layout10.zip` 先经过 `gamelayoutpkgcli` quality 80
优化，再完整替换正式 `assets/minecart2`。game003v2 的全部美术、layout、公开轮带、Symbols、
Popup 和程序资源只能来自该优化 ZIP 的解包目录。

### 完成定义

- [ ] `apps/game003v2` 可用现有 game003 live URL 合同启动，99% 准备唯一 package/session owner，100%
      后创建 framework/Pixi；BaseGame 5×5 standard reel、横竖屏 layout、CO 金额、`bg-wins` 首轮/lingering、
      award popup 和金额格式保持可观察一致。
- [ ] 每个 response 在任何权威画面 mutation 前完整编译、finalize 并 deep-freeze 一份
      `SlotOperationPlanV2`；component selection、scene/result/otherScene/value closure 和 final snapshot
      由 logiccore 证明，app 不手写 operation envelope/index/freeze 或执行期补 plan。
- [ ] framework 发出 spin request 后立即启动无 target 的本地公开轮带 continuous spin；response 前不读取
      scene/randomNumbers，response 的第一项 landing operation 落停同一 transaction，失败/destroy exactly-once
      cancel，不出现“等消息后才开始转”、二次起转或 server reel 推断。
- [ ] rendercore 拥有 standard reel continuous start/settle/cancel、Scene Layout runtime、operation coordinator、
      symbol/win/popup 播放和 cleanup；game003v2 只注入纯业务 resolver/validator/formatter/function。
- [ ] `layout10.zip` 原文件不修改；优化输出以 staging + 完整替换方式接收到
      `assets/minecart2`，同步 `assets/minecart2.assets-groups.json` 与两个 game app 的正式生成物。
- [ ] game003v2 runtime/build 不比较 assets map 的 `sha256`、`byteLength`、content-addressed filename，
      不扫描 orphan、不预检整包资源齐全性；只把 map 当 logical key→安全 physical path 路由。
- [ ] game003v2 active source、测试和构建只允许读取新 `assets/minecart2` mapped package；不读取、import、
      copy 或 fallback 到 `assets/game003`、历史 Minecart2 payload、game003 app 内资源表或 Downloads ZIP。
- [ ] 若实际 loading/render请求缺少资源、typed binding、state/animation或runtime object access，原位报错并
      向用户列出缺失项；不得提前全包校验，也不得用旧资源、placeholder、路径猜测或静默跳过。
- [ ] 自动化验收与真实浏览器验收完成；执行报告区分自动结果、资源缺口和用户尚未完成的视觉验收。

## 2. 范围

### 包含

- 新建 `apps/game003v2` 的 package、loading/launch、strict config、round compiler、thin adapter、tests、
  generated physical URL map、README 和 static release checker。
- `layout10.zip` 的只读输入确认、gamelayoutpkgcli 优化、asset-groups、staging 解包、
  `assets/minecart2` 完整替换；旧目录内容因完整替换自然移除，不做 orphan 扫描。
- logiccore strict selector/generator/finalizer 的 game003 组合；仅在现有通用合同不足时补最小纯函数或
  compiler callback，callback 只作为编译输入，不进入 plain-data plan。
- rendercore standard reel continuous transaction、Scene Layout public object/resource access 和通用 operation
  handler function contract 的最小补齐；app 不直接读取 package raw file。
- gameframeworks 已有 request-dispatched `startSpinPresentation/cancelSpinPresentation` hook 的接入和回归。
- `apps/game003` 作为同一正式资源目录的直接 consumer，仅同步资源生成物/断言并做回归，不顺手重构旧 app。
- package/logic/render/resource boundary tests、README、最小领域规则、lockfile 和 UTC 中文执行报告。

### 不包含

- 不从 `assets/game003`、当前 `assets/minecart2`、`apps/game003` generated table 或其它 app 复制任何资源；
  不让 game003v2 runtime 直接读取 Downloads ZIP。
- 不恢复传送带、动态 feature bar、矿车互动或尚无业务合同的 FreeGame/BonusGame live mode 编排。
- 不改变 server protocol、gamecode、下注、CO raw integer、`bg-wins` 金额语义或服务器 scene 边界。
- 不把 game003 component/symbol/animation 名硬编码进 logiccore/rendercore，不把 renderer/player/function 放进 plan。
- 不为减行数合并 owner、制造 opaque “执行整轮” operation、复制第二套 ticker/coordinator，或保留旧/new
  adapter fallback。
- 不覆盖 Downloads 源 ZIP，不手改 content-addressed payload、assets map 或 generated TypeScript。
- 不把本任务扩大为现有 `apps/game003` 重写、全仓 operation plan 迁移或 game002 再重构。

## 3. 制定计划时的基线

```text
UTC: 2026-08-10T04:40:22Z
HEAD: 2edb004eb2b6a66addaf5e6f240269854f763fbe
branch: (detached HEAD)
git status --short --untracked-files=all: clean
```

实际读取：

```text
AGENTS.md; tasks/templates/task-plan.md
docs/agent-rules/{game002,game003,shared-game-runtime,loading-ui,scene-layout,editor-artifacts}.md
tasks/{130-gamelayoutpkgcli-asset-optimization,133-game003-minecart2-skin-runtime-parity,
158-game003-single-gamelayout-package,173-slot-operation-plan-refactor,
178-slot-operation-effect-composition-refactor,183-game002-runtime-plan-consolidation,
186-game002v2-spin-default-scene-presentation,187-game002v2-runtime-timing-and-spin-parity,
188-game002v2-first-paint-preroll-spin}.md
apps/{game002,game002v2,game003}/**; packages/{logiccore,rendercore,gameframeworks}/**
apps/gamelayoutpkgcli/{README.md,package.json,src/**,tests/**}
```

相关目录没有更深层 `AGENTS.md`。当前结论：

- 仓库不存在 `apps/game002v3` 或任何 `game002v3` symbol；可用的两个参考分别是
  `apps/game002` 的 `SlotOperationPlanV2 + rendercore coordinator`，以及任务 186--188 后
  `apps/game002v2` 的精简 Scene Layout/continuous spin 接线。本计划将用户所说 “参考 game002v3”
  解释为合并参考这两条最新能力，不引用不存在的目录。
- game003 当前 app source 共约 2,671 行，主要复杂度位于 `game-adapter.ts`（470 行）和
  `scene-layout-presentation.ts`（335 行）：app 自建 reel facade、spin plan、ticker pending phase、CO overlay、
  carousel 和 popup glue；`playSpin()` 只读取 step 0 的首个 scene，不先编译 immutable round plan。
- logiccore 已有 strict server view/selectors、operation generators、`finalizeSlotOperationPlanV2()` 和
  `compileConfiguredSlotRoundOperationPlanV2()`；rendercore 已有实例 coordinator/registry。game003v2 应先复用，
  不照搬 `apps/game002/src/game002-operation-compiler.ts` 当前手工 envelope/final 组装。
- gameframeworks 已按 request dispatch → optional synchronous start hook → response parse → `playSpin()` 排序，
  并要求 start/cancel 成对；无需为预转再造 framework wrapper。
- `RenderReel` 有 standard continuous primitive，但 `SceneLayoutPackageRuntime.startMainReelContinuousSpin()`
  当前硬限制 `grid-cell`；game003 使用 `standard bg-reel01`，这是本任务已确认的 rendercore 能力缺口。
- 当前 `assets/minecart2` 有 152 logical files/148 disk files；`apps/game003` 的 generated URL map 与它绑定。
  `layout10.zip` 为 24 MiB、189 ZIP entries、207 logical files，CRC 正常，SHA-256 为
  `5ab872fb5ea12404c6aba7b550023dbc530d6adf367a31023db803ca8965335a`；manifest/map SHA-256 分别为
  `eadb92157ea31ac97b284bb4f7f2382c5b2983f2484610ddbcafd5339bb37565`、
  `e37bde3474344e9f6bf313c7930c170ccb87e0b5191f3c7460e4bfcea8a6a818`。
- 新 manifest 是 scene-layout v1、orientation-focus、5×5 standard `bg-reel01`，initial mode `BaseGame`，
  symbol package id 从当前 `game003-s1` 变为 `minecart2`，42 个 nodes，并声明 BaseGame/FreeGame/BonusGame、
  两段 video transition。identity 变化必须由 binding 动态解析，app/test 不锁旧 id。

## 4. 需求解释与技术决策

### 需求解释

- “减少 game003 代码量”指新增独立精简 app 并把通用过程放回 owner，不用删除功能或把代码搬成 app helper
  制造表面减行。旧 `apps/game003` 暂保留用于 parity/回归。
- “游戏逻辑是 plan”指 server response 先被编译为 plain immutable V2 operation plan；plan 表达权威 scene/value
  output 和有业务证据的 presentation，不包含 Pixi、player、callback、mutable state 或文件路径。
- “需要传 function 就补”指 compiler/renderer 可以接收 game-owned resolver/validator/formatter/predicate，shared
  过程负责调用顺序、校验和 lifecycle；function 不写入 manifest/plan，也不让 shared 层知道 game003 名称。
- “只能依赖 layout10 解压目录”按优化后 ZIP 的完整解包目录 `assets/minecart2` 解释；业务常量和 server
  component 名不是资源，但任何图片、字体、Spine/VNI、Popup、game config、reel 或 layout 均必须来自该目录。

### 关键决策

1. **资源只在实际消费点失败。** 先优化/stage并完整接收新包；game003v2不做hash/size/path-name/orphan或
   全资源closure预检。loading/runtime按map路由实际引用，manifest/parser/decoder/player在真实缺失点直接报错；
   执行报告汇总缺失项并通知用户，不检查旧目录“补齐”。
2. **logiccore finalize，game003v2 排业务顺序。** app compiler 用 strict selector + generator 生成 ordered drafts，
   由 logiccore finalizer统一 id/index/effect/source/snapshot closure/freeze；CO otherScene、bg-wins resolver 等业务
   function 由 app 注入纯 compiler helper。若通用 helper缺少 callback，补 logiccore 中性 API，不复制 validation。
3. **rendercore 执行，app 只组合 target。** standard continuous spin、target injection、symbol state batch、carousel、
   popup、delay/frame wait 和 cleanup 都由 rendercore public API/handler拥有；game003v2 registration 只选择 operation
   kind 对应的中性 handler并传 resolver/function，不直接碰内部 display tree。
4. **扩展同一 continuous contract。** 把 Scene Layout continuous API 从 grid-cell-only 扩至 standard reel set，
   保持 request 后 start、local strip、target只在 settle注入、方向/速度连续、cancel/destroy幂等；grid-cell
   game002v2行为与类型保持不变，不新增 kind alias或第二套 transaction。
5. **只通过 typed runtime object 取 package 内容。** 优先使用 `resource.manifest`、initial Symbol package resource、
   `gameConfig`、runtime snapshot/geometry/popup handle；只有已有 typed manifest binding 但 rendercore未公开对象时才补
   只读严格接口。若文件未被 typed binding 声明，应让用户补 ZIP，而不是增加 raw path reader。
6. **完整替换而非合并。** optimizer 输出到唯一 `/private/tmp/task189-*` 路径；解包到 staging 后替换
   `assets/minecart2`，旧目录仅作为 Git 可恢复基线，不把旧 payload 合入新目录。更新 asset-groups 和 generator。

## 5. 职责与合同

- **layout10 optimized package**：全部 art/layout/node/mode/reel/public strip/Symbols/Popup/typed runtime resource 的
  唯一资源 owner；logical key 只经 map 路由到安全 physical path。
- **logiccore**：strict server selection、scene/result/otherScene/value parsing、operation draft/generator、finalizer 和
  immutable final closure；不认识 game003 component、CO、symbol 名、amount 或 renderer。
- **rendercore**：standard/grid-cell continuous transaction、Scene Layout resource/runtime、operation coordinator、
  reel/symbol/carousel/popup presentation、frame wait 与 cleanup；不解析 game003 业务公式。
- **gameframeworks**：request-dispatched hook、session/logic parse/framework state；不读取 target 或 reel。
- **game003v2**：component role、coin/win resolver、formatter、operation显式顺序和 shared function注入；不拥有
  package bytes 表、reel/player/ticker状态机或手工 plan可信化。
- **生命周期**：optimizer pair output原子；package prepare/commit/rollback/destroy明确；continuous transaction和
  coordinator在 error/next-spin/destroy清理一次，已完成 operation不倒放，未提交 target不泄漏。
- **失败策略**：unknown/missing component data、非法 matrix/value/result、实际读取时缺资源/binding/state/handler、
  重复settle、target提前出现、plan final mismatch和destroy全部显式失败；assets不做hash/size/orphan/完整性预检，
  禁止fallback/placeholder/guess/skip。

## 6. 文件范围

### 预计新增

```text
apps/game003v2/{package.json,index.html,README.md,vite.config.ts,tsconfig*.json,eslint.config.cjs}
apps/game003v2/config/game-runtime.manifest.json
apps/game003v2/scripts/verify-static-dist.mjs
apps/game003v2/src/{main,launch,loading-resources,resource,round-compiler,round-adapter,business-policy,money}.ts
apps/game003v2/tests/{launch,resource,round-compiler,round-adapter,source-boundary}.test.ts
tasks/189-game003v2-gamelayout-plan-runtime-<utctime>.md
```

### 预计修改

```text
assets/minecart2/**
assets/minecart2.assets-groups.json
apps/game003/src/generated/minecart2-layout-resources.generated.ts
apps/game003/tests/{minecart2-skin,loading-flow,source-boundary}.test.ts
packages/rendercore/src/reel/{render-reel-set,types,index}.ts
packages/rendercore/src/scene-layout/{package-runtime,types,index}.ts
packages/rendercore/src/slot-operation/{profile-round-handlers,types,index}.ts  # 仅缺少中性 function 合同时
packages/rendercore/tests/reel/render-reel-set.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/tests/slot-operation/profile-round-handlers.test.ts
packages/{rendercore,logiccore,gameframeworks}/README.md                 # 仅实际 public contract 变化者
packages/logiccore/src/slot-operation/{server-view,effect-generators,v2-finalizer,index}.ts # 仅审计证明缺口时
packages/logiccore/tests/slot-operation/**                              # 与实际新增合同对应
docs/agent-rules/{game003,shared-game-runtime}.md
AGENTS.md
pnpm-lock.yaml
```

### 原则上不应修改

```text
assets/game003/**
apps/game003/src/**  # generated URL map 除外
apps/game002*/**
packages/{netcore,uiframeworks,gameloading*,vnicore}/**
package.json
```

若实际资源读取错误要求新增 manifest schema、恢复暂停功能、改变 server protocol，或用户所指 game002v3 是仓库外
另一实现，必须先说明并重新确认，不得在执行中猜测。

## 7. 实施步骤

1. **确认基线与资源输入**
   - 重核 HEAD/status、ZIP hash/CRC、Node 24、`cwebp` 和 CLI 当前参数；输出使用新的 task189临时路径。
   - 构建并执行gamelayoutpkgcli quality 80；CLI内部按自身production ZIP合同工作，但不把其integrity结果
     复制成game003v2 runtime/build gate，也不为app新增二次validator。
2. **stage并接收新 Minecart2**
   - 解包optimized ZIP到staging，不覆盖工作目录；仅检查解包目标安全、control files可用于正式接线，
     不比较assets hash/byteSize/content-addressed filename，不扫描orphan或预读全部资源。
   - 完整替换`assets/minecart2`并同步asset-groups；不保留旧payload。随后由实际loading/render路径自然发现
     缺失资源，原位错误汇总到执行报告并通知用户。
   - game003v2由Vite原样提供`assets/minecart2` public目录并使用rendercore URL loader，不生成逐文件
     TypeScript绑定；旧game003继续运行其正式generator/`--check`。
3. **固定 logic plan 合同**
   - 用 tests先刻画 bg spin、zero/one/multi bg-wins、可省略/单份 CO otherScene、amount优先级、invalid data、
     source evidence、operation顺序、final snapshot和 deep freeze。
   - 组合 logiccore现有 selector/generator/finalizer；只在无法用纯业务调用点表达时补中性 callback/helper。
     编译必须在 coordinator启动和任何画面 mutation前完成，失败不启动/落停 server target。
4. **补 standard continuous rendercore transaction**
   - 在 `RenderReelSet` 与 Scene Layout package runtime接通 standard start/settle/cancel，复用各 `RenderReel`
     continuous primitive、manifest profile和local strips；覆盖 delayed/immediate response、方向/速度连续、
     minimum travel、重复操作、cancel、failure和destroy。
   - grid-cell原 API/测试保持，standard input不接受 grid-cell-only positions/dimming字段；用 discriminated typed
     contract避免运行时忽略无效字段。
5. **建立通用 operation presentation 接线**
   - 复用 coordinator/registry和 rendercore players，把 landing、win carousel、CO apply、award start/lingering/
     cleanup表达为明确 operations/handlers；必要时扩展 handler factory接收中性 function target。
   - handler在实际 mutation前只核对相关 `context.input/output` continuity；失败 fail-stop并取消 pending playback，
     app不复制 wait loop或直接操作 child display tree。
6. **创建精简 game003v2 consumer**
   - 接入 loading 99%/100%、frame policy、package owner、live session与 framework；package identity、geometry、
     Symbols和Popup均动态取新 package typed binding，不硬编码 `game003-s1`/`minecart2` id。
   - `startSpinPresentation()`只启动 targetless standard rolling；`playSpin()`先编译plan，再由第一 landing settle
     transaction并执行余下operations；cancel/destroy统一清理。
   - source-boundary测试禁止 `assets/game003`、跨 app import、raw file/path guess、Math.random作server替代、
     app-owned `createReelSpinPlan`、复制 coordinator/ticker phase状态机和手工 plan envelope。
7. **回归、文档和报告**
   - 复验现有 game003仍能消费替换后的 package；新 id/node数量不能写入 app业务表。
   - README记录资源更新、plan/continuous时序、缺资源处理和浏览器复测；只更新稳定领域 ownership规则。
   - 运行 L3验收并生成 UTC报告，列 optimizer输入/输出信息、实际资源缺失错误、API偏差、自动结果与人工验收。

## 8. 测试与验收

### 测试原则

- logiccore测试使用中性 component/symbol fixture；game003名称只在 app compiler tests出现。
- rendercore测试使用 package内最小自包含fixture，不读取`assets/minecart2`；game app resource/release tests只证明
  实际引用可加载与缺失时报错，不做hash/byteSize/orphan或全包完整性断言。
- deferred response证明 request → continuous start → response → plan compile → settle顺序，不用 sleep近似网络。
- 测试 target在settle前不可见、local公开轮带不被server scene改写、invalid plan不做权威 mutation、cleanup无泄漏。
- fake Pixi只证明合同；真实WebP/Spine/VNI/video、横竖屏、连续运动和交互必须浏览器验收。

### 验收级别

`L3`。新增 workspace app会新增 `pnpm-lock.yaml` importer，并同时修改正式 ZIP交付、logic/render public contract和
多个直接 consumer；按仓库规则需要整仓 typecheck/lint/test/build/format，不以“定向已过”代替发布级回归。

### 执行会话必须运行

```bash
pnpm --filter gamelayoutpkgcli build && pnpm --filter gamelayoutpkgcli start -- --input /Users/zerro/Downloads/minecart2/layout10.zip --output /private/tmp/task189-minecart2.optimized.zip --assets-json /private/tmp/task189-minecart2.assets-groups.json --quality 80
pnpm --filter game003 check:resources
pnpm --filter @slotclientengine/logiccore --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter game003v2 --filter game003 test
pnpm typecheck && pnpm lint
pnpm test && pnpm build && pnpm format:check
git diff --check && ! rg -n 'assets/game003|apps/game003/src/generated|game003-s1/' apps/game003v2 --glob '!**/dist/**'
```

第一条只生成临时输出，不直接覆盖资源；staging接收在实施步骤中执行。若临时路径存在，使用新的显式
task189路径，不覆盖旧证据。根命令失败先最小化到本任务 package/consumer，不修改生产代码迎合过时测试。

### 人工验收

1. 合法 live URL分别在横/竖屏启动：loading 99/100边界、背景、42-node layout、5×5 reel、Symbols、Popup
   placement正确，无旧 Minecart2或 `assets/game003`画面闪现。
2. 用延迟网络观察点击后 response pending期间已开始滚动；response到达后方向/速度连续落停，无停顿、跳回或
   二次起转。DevTools确认response前无scene/randomNumbers/reel payload输入。
3. 覆盖无奖、普通奖、CO、多个 `bg-wins` group和award popup点击/下一spin cleanup；金额、首轮完成边界和lingering
   与现有game003一致，error/destroy后ticker/player/continuous transaction归零。
4. 美术抽查quality 80 WebP透明边缘、渐变、文字、细线；确认两段video能被严格prepare，但不要求新增live mode flow。

### 独立验收建议

`必须`。涉及正式ZIP、lockfile、logic/render public contract、response前异步transaction和resource ownership。
独立复验重点：

```bash
pnpm --filter @slotclientengine/rendercore exec vitest run tests/reel/render-reel-set.test.ts tests/scene-layout/package-runtime.test.ts
pnpm --filter @slotclientengine/logiccore --filter game003v2 test
pnpm --filter game003v2 release:check
```

## 9. 环境与依赖

- 使用 Node.js 24和仓库pnpm；shell无Node时执行 `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；新增game003v2 importer后用pnpm正式更新lockfile，
  不手改。只有下载失败后才设置仓库代理重试。
- gamelayoutpkgcli要求可执行 `cwebp -version`；缺失时显式报告，不伪造optimized ZIP。
- 除现有workspace依赖外不新增第三方依赖；若必须新增，先说明用途、替代方案和lockfile影响。

## 10. 生成物、文档与规则

- optimizer生成optimized ZIP、asset-groups、content-addressed payload和map；generator生成两个app的URL map，均禁止手改。
- 实际资源读取失败时在执行报告列出logical key、owner/用途和原始错误；不另建全包audit或把逐文件清单写进规则。
- 更新game003v2 README；实际 public API变化才更新 logiccore/rendercore/gameframeworks README。
- 根`AGENTS.md`记录全仓production美术目录的files/bytes权威、map仅路由、runtime/build不做integrity gate；
  `game003.md`记录v2单package/plan/continuous/缺资源fail规则；`shared-game-runtime.md`仅记录standard continuous
  通用ownership。现有loading规则若合同未变不修改。

## 11. 执行报告

规划时不生成报告。完成后创建：

```text
tasks/189-game003v2-gamelayout-plan-runtime-<utctime>.md
```

UTC用 `date -u +%y%m%d-%H%M%S`。报告记录实际文件/API、optimizer输入输出信息、实际缺失资源、计划偏差、
自动命令、浏览器结果/未完成项和剩余风险；不收集无关coverage历史矩阵。

## 12. 风险、假设与待确认

### 风险

- layout10 package identity/nodes/closure已变化；实际loading/render可能暴露缺Popup state、animation、typed
  resource或standard continuous所需能力。此类问题直接报错并给用户缺失清单，不能以旧包补齐。
- standard continuous从单 `RenderReel`提升到reel set时，响应早于全部轴启动、immediate settle、长pending和低FPS
  容易产生速度/phase不连续，必须用fake clock与真实浏览器双重验证。
- L3整仓验收可能暴露仍错误依赖资源hash/size的current consumer fixture；删除该runtime/build integrity期待，
  只保留实际引用、schema/parser/decoder失败，不恢复旧identity/path。
- optimizer是有损WebP；实际decoder可读取不能代替人工画质验收。

### 假设

- 用户所说“game002v3”是对当前仓库最新 plan实现与精简v2能力的统称；仓库没有可读取的v3目录。
- game003v2首期保持当前规则中的BaseGame业务边界；包内FreeGame/BonusGame资源存在不自动启用mode flow。
- `SlotGameLiveSession.spin()`返回Promise的调用点继续作为仓库可证明的request-dispatched边界。

### 待确认

- 若用户实际拥有仓库外或尚未合入的 `game002v3`，执行前需要提供路径/分支；否则按本计划的双参考基线实施。
- 实际资源缺失时待用户补回layout ZIP后重新从步骤1开始；不接受散落旧资源补丁。

## 13. 完成清单

- [ ] optimized layout10是game003v2唯一资源来源，旧资源/跨appfallback搜索为零。
- [ ] game003v2没有assets integrity/closure预校验；实际缺失已原位报错并向用户提交精确清单。
- [ ] round在mutation前完成logiccore V2 finalization，app无手工可信化/执行期补plan。
- [ ] standard continuous start/settle/cancel与grid-cell回归、server数据边界、cleanup合同通过。
- [ ] game003v2保持BaseGame spin、CO、bg-wins、Popup和loading行为，app职责显著收敛。
- [ ] assets、asset-groups、generated maps、lockfile、README和最小领域规则同步。
- [ ] L3自动验收与人工验收已明确记录，UTC中文报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和本计划列出的六份领域规则，核对HEAD/status/ZIP hash；
2. 严格按“优化 → staging → 完整接收 → 实际消费”顺序，不先写依赖旧资源的app代码；
3. 不添加assets hash/byteSize/orphan/closure预校验；实际消费缺资源立即输出清单并通知用户，禁止访问
   `assets/game003`或混入旧Minecart2；
4. 先以测试固定plan与standard continuous边界，再实现shared owner，最后接thin app；
5. public API或文件范围仅允许本计划描述的中性最小扩张，schema/server/mode-flow扩张先停止说明；
6. 运行规定L3命令和真实浏览器验收，生成UTC报告；除非用户明确要求，不commit、不push、不创建PR。
