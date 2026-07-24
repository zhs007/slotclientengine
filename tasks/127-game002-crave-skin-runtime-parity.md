# 127 game002-crave-skin-runtime-parity 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/game002` 增加严格的 `skin=2`，把 `gamelayouteditor` 导出的
`assets/crave` production scene-layout package 作为该 skin 的场景、背景、几何、
symbols、公开本地轮带和 award popup 唯一来源。

`skin=2` 必须继续执行 game002 已有的完整业务与表现流程，不能因为 Game Viewer
当前只接入了部分细节而退化成 Game Viewer 的简化效果。任务同时完成职责拆分：

- rendercore 拥有 scene-layout package 装配、通用 grid-cell/cascade/Spine/
  image-string/popup 执行机制与生命周期；
- game002 保留 component、WL/CN、金额、期待触发和业务 presentation policy；
- Game Viewer 继续消费同一套 rendercore 通用机制，但不会成为 game002 的业务配置源。

### 完成定义

- [ ] URL `skin=1` 保持当前 `assets/game002-s3` 行为；`skin=2` 严格映射
      `assets/crave`；缺失、重复、`01`、`3|4|5` 和未知值继续显式失败。
- [ ] `skin=2` 从 `layout.manifest.json`、`assets.map.json` 和内容寻址 payload
      构造完整 scene-layout package，不复制背景、几何、symbol、reel、popup 表。
- [ ] `skin=2` 与 `skin=1` 在相同 round fixture 下具有一致的 game002 业务阶段、
      落地顺序、期待 gate、cascade、CN continuity/collect、summary、金额边界和
      cleanup；只有 skin manifest 明确声明的资源差异允许不同。
- [ ] Crave CN 使用其 symbols manifest 声明的 `image-string`/ImgNumber、
      `slot: "coin"` 和 package 内 glyph 闭包；不回退 skin1 binding、完整数值图片、
      字体或 fixture glyph。
- [ ] 普通 initial spin、Nearwin1/2、期待 cascade refill、WL no-remove/no-drop、
      CN sequential collect、global amount/popup 和下一 spin cleanup 全部在 skin2 可用。
- [ ] 通用实现不硬编码 `game002`、`crave`、`bg-*`、`WL` 或 `CN`；game002
      app 不复制 scene-layout/reel/popup 内部状态机或直接操作其 display tree。
- [ ] `assets/crave` 成为受 checker 保护的正式资源交付物；map/hash/闭包/orphan
      漂移在测试或 build check 中失败。
- [ ] 完成定向自动化验收、真实 Pixi/Spine 浏览器视觉验收，并生成 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/game002` 的 skin 解析、精确 loading、99% prepare、runtime composition、
  frame policy、测试、README 和视觉验收入口。
- `assets/crave` 解压 production package 的正式接入和完整性检查。
- rendercore 的通用 scene-layout folder/module 输入、resource owner、共享
  grid-cell presentation capability、configured round adapter 和 popup lifecycle。
- 下沉 `game-demo.ts` 中可复用的 reel/effect/mask/phase/landing/cascade mechanics；
  保留 app policy，避免第二套 skin2 状态机。
- Game Viewer/gameframeworks 作为直接 consumer 的兼容回归验证；仅在共享 public
  contract 确有必要时调整薄适配或测试。
- 与新稳定职责边界直接相关的最小 README 和领域规则更新。

### 不包含

- 不修改、重新导出或反向写回 `gamelayouteditor`；`assets/crave` 视为 editor
  正式输出，不手改其中 hash payload 或 manifest。
- 不把 game002 业务 component、symbol 名或 server amount 语义写进 rendercore、
  gameframeworks 或 Game Viewer 默认配置。
- 不让 game002 直接调用 Game Viewer UI/project draft，也不以 Game Viewer 当前视觉
  作为验收基准。
- 不实现尚无 resolver 的 BaseGame/FreeGame 自动切换、免费游戏、bonus、购买功能。
- 不删除 `skin=1`，不在本任务直接把 `skin=2` 改名为默认 skin，也不提前删除
  `assets/game002-s3`。
- 不顺手重构 Leo UI、platform bootstrap、live server URL、下注协议或 loading UI。
- 不增加缺资源 fallback、路径猜测、首项默认值、静默 alias、完整图片与
  image-string 互转。

## 3. 制定计划时的基线

```text
UTC: 2026-07-24T03:18:57Z
HEAD: f8720ec5498caf0320f7f017ac49cf8d6fab38b0
branch: main
git status --short --untracked-files=all:
?? assets/crave/ (121 files)
```

- `assets/crave` 是用户本轮提供的相关 untracked 输入，执行时必须保留并纳入任务，
  不得 reset、clean、覆盖或由旧 ZIP 替换。
- 计划读取了根 `AGENTS.md`、`docs/agent-rules/game002.md`、
  `shared-game-runtime.md`、`loading-ui.md`、`scene-layout.md` 和
  `editor-artifacts.md`；相关目录没有更深层 `AGENTS.md`。
- `assets/crave` 总 payload 为 `13,324,796` bytes；`layout.manifest.json` SHA-256
  是 `fdc639cf37f09d22e38c050f4d75ea4b135008d08600d090ada16639ee3059c1`，
  `assets.map.json` 是
  `c99a9299575bb44927d3229cefc532efdbfacb2e99310d711bfacb65c38ea810`。

- layout 是 scene-layout v1：`2000x2000` art、`840x1200 @ (580,277)` focus、
  `6x9`、`120x120` cell、BaseGame/FreeGame、双向 Spine transition、
  `game002-s3` grid-cell symbols binding 和 `bigwin2` popup。
- `assets/crave/assets.map.json` 有 124 个 filename key；重复内容共用物理 payload，
  不能用“文件数量等于 key 数量”代替 map/hash/closure 校验。
- Crave symbols package 的 CN 是 tiered Spine + `image-string`，绑定真实
  `slot: "coin"`；当前 HEAD 的 skin1 CN 也已经是 `image-string`，但绑定
  `slot: "Num"` 且 dependency path 不同。实现必须逐 skin 消费 manifest，不能因
  两者类型同名而复用 skin1 binding。
- Crave package 不包含 `assets/game002-s3/reel.manifest.json`、Nearwin1/2 或
  旧 `win-amount` package；这些属于 game002 presentation extension，不得伪装成
  layout package 自带资源。
- `skin-id.ts` 当前只接受 `"1"`；skin config、loading、generated imports、dist
  checker 和测试都固定指向 `assets/game002-s3`。
- `apps/game002/src/game-adapter.ts` 已使用 rendercore
  `createSlotRoundCoordinator`，但仍自行装配 background、`Game002ReelRuntime`、
  symbol cascade 和 win amount；`game-demo.ts` 仍拥有大量通用 grid-cell
  presentation mechanics。
- rendercore package resource 已支持 mapped URL/ZIP/bytes 与严格闭包；
  package runtime 已拥有 layout、reel、symbol、popup 和 mode runtime。
- `packages/rendercore/src/scene-layout/configured-round-adapter.ts` 与
  `packages/gameframeworks/src/scene-layout-template/index.ts` 是 Game Viewer
  production round 路径，但当前 profile 没有 game002 的全部期待与专属细节。
- `tasks/123-*` 与 `tasks/124-*` 已完成通用 template、immutable execution plan
  和 coordinator 基础；任务 127 应扩展现有 seam，不另建第三套 adapter/compiler。

## 4. 需求解释与技术决策

### 需求解释

- “效果与 game002 一致”指同一 game002 round 在两个 skin 上保持业务阶段、状态
  转换、timing、遮罩、dimming、动画语义和 cleanup 一致；Crave package 明确改变的
  图像、Spine 数据、ImgNumber slot、popup layer/threshold/placement 属于允许的
  skin-owned 视觉差异。
- `skin=2` 使用完整 scene-layout package，而不是只替换 symbols 或 background。
  layout 中的 geometry、focus、mode binding 和 package placement 必须真正进入
  production runtime。
- Game Viewer 的欠缺细节不能通过复制 game002 业务规则到共享包解决。共享层提供
  capability 与可注入 policy；game002 注入自己的明确规则，Game Viewer 只在配置
  显式声明相同能力时使用。
- 当前没有证据支持自动驱动 FreeGame transition，因此 skin2 首轮保持 manifest
  `initialMode=BaseGame`；未来 mode resolver 是独立任务。

### 关键决策

1. **Skin2 使用 scene-layout package resource，不物化旧资源表。** rendercore 保持
   map/hash/symbol/popup 的唯一 owner；app 只保存 package handle、业务 profile 和
   typed extension。

2. **先抽共享 presentation surface，再接 skin2。** 从 `game-demo.ts`/scene-layout
   adapter 提取 rendercore-owned target，统一 init、spin、state、fall、effect、
   update、popup 和 destroy；两个 skin 走同一 game-owned target，不复制
   `CraveGame002Adapter`。

3. **业务 trigger 与通用机制分开。** rendercore 接受 typed landing、bright/dim、
   effect、timing、persistence 和 cleanup policy；WL/CN、component 和金额解释由
   game002 提供。

4. **Crave ImgNumber 完全 manifest-driven。** skin2 从 package resource 取得
   tier/slot/glyph/renderer，禁止注入 skin1 generated module；app 只传 occurrence value。

5. **按 active skin 精确 loading。** 先用共享 strict parser 选择资源，完整
   readiness/session 仍并行；mapped folder 使用生成的精确 Vite import map，不用宽泛
   glob，也不同时下载两个 skin。

6. **Popup/旧 win-amount 走统一 capability。** skin1 保留现有 package，skin2
   使用 layout popup；rendercore 统一 update/advance/cleanup/destroy，game002 决定
   请求边界；不把 Crave `15/25/50` 改为 skin1 `15/30/50`。

7. **Nearwin 不是 layout fallback。** 现有 reel manifest/effect 是显式 game002
   extension，须有可审计 owner/binding。若迁移至 `assets/game002-presentation`，
   必须通过正式 manifest/generator 同步 skin1，不复制 timing 表。

## 5. 职责与合同

- **模块职责**：rendercore 拥有 mapped package、Pixi/Spine/image-string/popup/reel、
  occurrence/effect/mask/phase/movement 和 transaction；gameframeworks 拥有
  session/UI facade；game002 拥有 component/symbol/amount/anticipation policy；
  Game Viewer 只拥有配置器与 launch payload。
- **数据/API**：保留现有 strict scene-layout/editor-assets/symbols/popup version；
  新 extension 使用 strict versioned union。shared API 只接收中性 id、predicate、
  capability handle 和 immutable profile，未知 kind/state/effect/version 在 mutation 前失败。
- **生命周期**：loading 取得 active skin bytes；99% prepare 校验并创建 resource；
  enter 后 ownership 交给 runtime。任一步失败回滚 package、Object URL、player/popup/
  effect/value 和 live/platform owner；destroy 幂等，late init 不得复活资源。
- **禁止行为**：不维护第二份 map/catalog/reel/geometry/tier/threshold，不猜文件名，
  不因 Viewer 可运行而跳过 game002 校验，不读取 server reel/randomNumbers。

## 6. 文件范围

### 预计新增

```text
apps/game002/src/generated/crave-layout-resources.generated.ts
apps/game002/src/scene-layout-skin.ts
apps/game002/tests/crave-skin.test.ts
packages/rendercore/scripts/generate-scene-layout-vite-resources.mjs
packages/rendercore/src/scene-layout/<shared-presentation-surface>.ts
packages/rendercore/tests/scene-layout/<shared-presentation-surface>.test.ts
assets/game002-presentation/**   # 仅在 Nearwin owner 需脱离 skin1 时
```

### 预计修改

```text
assets/crave/**                                  # 纳入交付，原则上不改内容
apps/game002/package.json
apps/game002/src/{skin-id,loading-resources,game-entry,skin-config}.ts
apps/game002/src/{game-adapter,game-demo,game-layout,win-amount-config}.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/tests/**
apps/game002/{README.md,docs/animation-flow-and-timing.md}
packages/rendercore/src/scene-layout/{index,package-resource,package-runtime,configured-round-adapter,types}.ts
packages/rendercore/src/{reel,slot-round}/**
packages/rendercore/tests/{scene-layout,reel,slot-round}/**
packages/rendercore/README.md
packages/gameframeworks/tests/scene-layout-template.test.ts
apps/gameviewer/tests/**
docs/agent-rules/{game002,shared-game-runtime,scene-layout}.md
```

### 原则上不应修改

```text
apps/gamelayouteditor/**
packages/{logiccore,netcore,uiframeworks}/**
apps/game003/**
assets/gamecfg002/gameconfig.json
pnpm-lock.yaml
```

修改 logiccore schema、editor export 或 root toolchain 属于范围扩张，须先停止说明。

## 7. 实施步骤

1. **锁定 parity 基线与资源闭包**
   - 重新记录 HEAD/status/hash；验证 `assets/crave` 的 map、每个 payload SHA-256、
     duplicate content、orphan、layout/symbol/popup 闭包。
   - 用现有 game002 fixtures 建立 parity matrix：zero-win、普通/多 cascade、
     protected WL、CN continuity/collect、期待 initial/refill、summary、amount/popup、
     next spin、fatal/destroy。
   - 重构前保存可比较的阶段/调用/状态 snapshot。

2. **建立精确 mapped-folder 构建输入**
   - 新增通用 generator，从 `layout.manifest.json` + `assets.map.json` 生成唯一 physical
     payload 的静态 Vite URL imports 和 canonical path map。
   - package scripts 提供 generate/`--check`；只 loading active skin 并保留 raw bytes。
   - 99% 从 loaded bytes prepare package，不重复 fetch，不提前创建 Pixi。

3. **下沉共享 grid-cell/scene-layout presentation**
   - 从 `game-demo.ts` 和 configured adapter 抽取中性的 reel presentation surface，
     复用现有 `RenderGridCellReelSet`、scene-layout package runtime 与 coordinator。
   - surface 提供 scene/phase/spin/state/fall/effect/mask/popup/update/cleanup capability；
     期待调度只接受 app policy，不知道 WL/CN。
   - Viewer adapter 组合该 surface，保持现有 V1/V2 profile/readiness。

4. **重组 game002 的业务 policy**
   - 将 component、WL/CN、value/amount、anticipation、summary/collect 和 formatter
     收口为 game-owned immutable config。
   - `Game002RoundTarget` 同时消费 skin1 与 skin2 surface；删除已下沉的 Pixi/reel
     复制逻辑，保留业务编排和 strict prevalidation。
   - 现有 reel manifest/Nearwin resources 作为明确 extension 绑定到两个 skin；
     缺 effect 或 capability 时在 initial mutation 前失败。

5. **接入 skin2 scene-layout 与 ImgNumber**
   - 扩展 skin union/prepare result，持有 package owner、active symbol、frame 与 popup。
   - skin2 initial scene 使用 manifest `BaseGame` binding；background/reel placement/
     focus 由 package runtime 派生，不再经过 skin1 hardcode。
   - CN 使用 Crave tier/`coin`/glyph，覆盖完整 activeSpine/value continuity。
   - popup 接到原有完成边界，播放时持续 update，下一 spin cleanup 不阻塞。

6. **完成 transaction、loading 与 release contract**
   - 覆盖 skin selection、abort/late prepare、mount/runtime/popup/effect failure 和 destroy。
   - 更新 dist checker，证明 skin2 的 root/map/精确 payload 全部交付，skin1 仍可用，
     bundle 不引用 Downloads 或 server authoring JSON。
   - 确认 token、cookie、server authoring repository 和 server reel 未进入资源包、
     日志或静态 dist。

7. **测试、文档与人工验收**
   - 将通用 mechanics 测试迁到 rendercore；game002 保留 policy 和双 skin parity
     integration tests；Game Viewer 复验共享 adapter 无回归。
   - 更新 README、animation guide 和领域规则；用真实 renderer + 忠实 fixture 做双
     skin 验收，live smoke 另验真实 session。
   - 生成任务 127 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- 以重构前 skin1 characterization 和用户合同为基准，不为旧测试保留错误架构。
- shared tests 不出现业务常量；app integration tests 使用真实 fixture。
- 覆盖 normal path、strict failure、prepare/commit/rollback、late async 和 destroy。
- 资源美术不做跨 skin 像素相等；比较 trace、geometry、state/timing/alpha、identity
  和 cleanup。

### 验收级别

`L2`。原因是任务修改 rendercore public seam、scene-layout 正式资源装配、generated
imports、game002 直接 consumer，并要求 Game Viewer/gameframeworks 兼容；范围可由
四个直接 package 界定，不需要根级 L3。

### 执行会话必须运行

```bash
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gameviewer --filter game002 typecheck
pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks --filter gameviewer --filter game002 test
pnpm --filter game002 check:crave-layout-resources
pnpm --filter game002 release:check
pnpm --filter gameviewer build
git diff --check
```

其中 `check:crave-layout-resources` 为本任务新增/确定的 checker 名；若按仓库命名规范
选择等价名称，报告必须记录最终命令。失败时先在目标 package 最小化，不扩大到整仓。

### 人工验收

- 用真实 game002 页面分别运行 `skin=1`、`skin=2`，在 portrait、wide、resize 后核对
  focus、background clip、6x9 board、mask、symbol placement 和 popup placement。
- 用固定忠实 fixture 覆盖：普通 spin、第二枚 WL 期待、Nearwin1 cadence、普通 refill
  激活 gate、Nearwin2 sweep/selective refill、WL hold、CN ImgNumber/value carry/
  sequential collect、summary、global amount/popup、下一 spin cleanup。
- 对 skin2 检查 CN 的 1/2/3/4 位值、tier 边界 `10/100/1000`、slot color/transform，
  并确认没有完整图片/字体 fallback、console error、闪空或 timeline reset。
- 用真实 live credential 做至少一次 connect/spin/collect/destroy smoke；若随机 round
  未覆盖全部场景，只能记录已覆盖项，不能宣称全视觉场景 live 通过。

### 独立验收建议

`必须`。涉及跨包 public contract、正式 scene-layout/map/generated 交付物、
resource ownership、异步 transaction 和 destroy。独立验收重点：

1. rendercore 无 game002/Crave hardcode，Game Viewer 没有行为回归；
2. skin2 严格闭包和 ImgNumber binding 没有 skin1 fallback；
3. 双 skin parity fixture 与真实浏览器 Nearwin/CN/popup lifecycle。

独立复验最多运行：

```bash
pnpm --filter @slotclientengine/rendercore --filter game002 test
pnpm --filter game002 release:check
pnpm --filter game002 check:crave-layout-resources
```

## 9. 环境与依赖

- 使用 Node 24 和仓库 pnpm；缺环境时运行
  `source /Users/zerro/.nvm/nvm.sh && nvm use 24`。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- 预期不新增依赖或 lockfile；仅在下载真实失败后按仓库约定设置代理重试。

## 10. 生成物、文档与规则

- `crave-layout-resources.generated.ts` 只能由通用 generator 更新，并运行 `--check`；
  禁止手改 import/hash/path。
- `assets/crave` 是 editor export，禁止为迎合 runtime 手改；若 checker 揭示包错误，
  应回到 editor 重导并重新记录 root hash。
- 更新 `apps/game002/README.md` 的 URL、loading、skin/resource、ImgNumber 和人工验收
  说明；更新 animation guide 的双 skin source routing。
- 更新 `game002.md`：从“只支持 skin1”改为 strict `skin=1|2` 和共享行为/允许差异。
- 更新 `shared-game-runtime.md`、`scene-layout.md`：记录可复用 presentation surface、
  app policy 注入和 mapped-folder build input 的稳定职责。
- 不把 121 文件清单、当前 hash、popup threshold 表或任务证据写入根 `AGENTS.md`。

## 11. 执行报告

规划时不生成报告。执行后用 `date -u +%y%m%d-%H%M%S` 创建
`tasks/127-game002-crave-skin-runtime-parity-<utctime>.md`，简记实现/文件、public
contract、资源 hash、计划偏差、六条命令、浏览器/live 覆盖和剩余风险。

## 12. 风险、假设与待确认

### 风险

- Crave 的 Spine/CN slot/popup threshold 与 skin1 不同，不能把 parity 误写为资源相等。
- Nearwin 不在 layout closure；隐式依赖 skin1 会阻碍 skin2 成为主版本。
- player identity/mask/effect/value/destroy 重构必须真实视觉验收，fake 不能证明无闪烁。
- skin 选择过晚会双下载，过早且 parser 不一致会形成双合同；须共享 strict parser。
- live 随机无法覆盖全部场景，须保留忠实 fixture 的真实 renderer 验收。

### 假设

- `assets/crave` 当前 121 个文件就是用户指定的 skin2 正式输入，执行前 root hash 未变。
- 本任务只要求保留 manifest `initialMode`；不要求根据 server state 自动切 FreeGame。
- 既有 live URL、`lines=30`、Leo UI 和 platform/session contract 不变。

### 待确认

无。若执行时 `assets/crave` 被重新导出、要求 skin2 立即成为默认、或要求自动 FreeGame
transition，均属于输入/范围变化，应先停止并说明。

## 13. 完成清单

- [ ] `skin=1|2` 严格选择和非目标失败行为已满足。
- [ ] skin2 完整消费 scene-layout/symbol/ImgNumber/popup package，无第二份资源表。
- [ ] game002 全部现有业务与表现细节已接入 skin2，允许差异仅来自正式 manifest。
- [ ] shared mechanics 与 game-owned policy 边界清晰，Game Viewer 直接 consumer 无回归。
- [ ] prepare/commit/rollback/destroy 和 active-skin loading 已验证。
- [ ] generator/checker、dist、README、animation guide 和领域规则已同步。
- [ ] L2 自动化和真实浏览器人工验收已区分并记录。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划列出的五份领域规则和本计划；
2. 核对 HEAD、用户 `assets/crave` 输入、root hash 与工作区；
3. 先完成 skin1 characterization/资源 checker，再重构 shared surface；
4. 按“rendercore mechanics / game002 policy / scene package data”边界实现；
5. 小幅适配在报告记录，重大 API/schema/editor 扩张先停止说明；
6. 只做计划内 L2/浏览器验收并生成报告；除非用户要求，不 commit/push/建 PR。
