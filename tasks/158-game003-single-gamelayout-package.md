# 158 game003-single-gamelayout-package 任务计划

## 1. 目标与完成定义

### 目标

让 `apps/game003` 像任务 155 完成后的 game002 一样，只消费一个由
Game Layout Editor 导出的 production mapped package。使用
`/Users/zerro/Downloads/minecart2/new-layout-layout (6) (1).zip` 更新正式
`assets/minecart2`，删除 legacy skin 与 `assets/game003-s1`，并暂时移除动态传送带、
bg-bar presentation 和矿车互动，等待后续 ZIP 资源合同完整后再单独接回。

### 完成定义

- [x] game003 只支持现有 production URL 的 `skin=2`，`skin=1` 和其它值严格失败；不存在
      legacy/package 双 presentation 分支或从新包回退旧资源的路径。
- [x] loading、99% prepare、framework/Pixi enter、主转轮、Symbols、背景、Popup 和 viewport
      全部使用同一个 `assets/minecart2` mapped package owner。
- [x] 新 ZIP 经 production optimizer/checker 处理后完整替换 `assets/minecart2`，同步
      asset-groups、generated Vite URL map 和 release checker；不手改 content-addressed payload。
- [x] `assets/game003-s1` 的 127 个 tracked 文件全部删除，目录不存在；当前 apps、packages、
      docs/agent-rules 不再直接 import、glob、读取或要求该目录路径。
- [x] 动态传送带/bg-bar Symbols、FeatureBar2 presentation plan、矿车 construction/update/wait/
      cleanup 全部从 game003 production flow 移除；服务端即使仍返回 `bg-bar` component，也只作为
      未消费的通用 round 数据存在，不增加画面或完成等待条件。
- [x] CO overlay、`bg-wins` 首轮/lingering、中奖金额 popup、无货币符号的两位小数 formatter、
      live session 单连接和本地公开轮带边界保持不变。
- [x] SymbolsViewer、PopupEditor、SymbolsEditor、Game Layout Editor 与 rendercore 中仍直接读取
      legacy 目录的生产 fixture 改为从 Minecart2 map/manifest 的精确闭包取值，或删除已经失效的
      一次性入口。
- [x] 自动化 L2 验收通过；真实浏览器视觉与交互验收明确由用户执行，执行会话不启动浏览器。

## 2. 范围

### 包含

- 新 Minecart2 ZIP 的完整性、schema、map、hash/size/orphan 校验，quality 80 WebP 优化和正式
  mapped folder/asset-groups 接收。
- game003 单 skin、单 package loading 与 prepare/commit/rollback/destroy 生命周期。
- 从 package manifest/symbol package 取得 art/focus/reel geometry、`bg-reel01`、game config、
  Symbols、BaseGame popup 和 presentation surface。
- 将仍需 app ownership 的 live、reel timing、win-symbol loop 与 CO overlay 配置收敛到一个严格、
  versioned、无美术路径的 game003 runtime manifest。
- 删除 legacy art/symbol/win-amount loading、旧静态 layout、动态 bg-bar、矿车互动及其专属测试。
- 迁移仍在执行的 editor/viewer/shared tests 与文档，不让删除目录破坏其它 package 验收。
- game003 release/source-boundary checker、README、game003 领域规则和 UTC 中文执行报告。

### 不包含

- 不实现新版传送带、矿车动画、payload、轨道、FeatureBar2 presentation 或 package 静态节点驱动；
  后续资源齐备后另立任务并定义 typed contract。
- 不因 ZIP 已包含 FreeGame、BonusGame 和视频转场而新增 game003 业务 mode 切换；本任务只保证这些
  authored 资源被 package 严格接收且不被 app 复制，现有 BaseGame round 行为不扩张。
- 不修改 server protocol、gamecode、下注、CO raw integer、bg-wins 金额语义或服务器 scene 边界。
- 不删除 `assets/gamecfg003`，不把 token、cookie、服务器真实轮带或本轮数据写入 package/config。
- 不把 ZIP 内 Symbols package identity `game003-s1` 当成仓库目录依赖而擅自重命名；删除目标是
  `assets/game003-s1` 目录和路径 consumer，package 内 identity 仍以编辑器导出为权威。
- 不保留 legacy alias、双 skin compatibility、placeholder、猜测 logical key、basename fallback、
  宽泛 glob 或静默效果降级。
- 不修改历史 `tasks/*.md` 中的事实记录，不覆盖 Downloads 原 ZIP，不修改 lockfile。

## 3. 制定计划时的基线

```text
UTC: 2026-08-04T02:01:02Z
HEAD: ab9cec204ea8d525f371ccceb659d65b2b2a91d3
branch: (detached HEAD)
git status --short --untracked-files=all:
<clean>
```

- 本规划会话读取了根 `AGENTS.md`、`tasks/templates/task-plan.md`、任务 155 的计划与报告、
  任务 133 的计划与报告，以及 `docs/agent-rules/game003.md`、
  `shared-game-runtime.md`、`loading-ui.md`；相关目录没有更深层 `AGENTS.md`。
- 输入 ZIP 为 18,727,657 bytes，SHA-256
  `0720e2bcd6aacb7448219e53743be18c65ae1a55d4f20bec9f26fc48100a7b09`；
  `unzip -t` 无错误。输入 `layout.manifest.json` SHA-256 为
  `87c4746b135bec79a90f8030515a8b96eba5c687a14f71ac5bec9ffc93459555`，
  `assets.map.json` SHA-256 为
  `1742b48e22640545e0adab73d05c493d3dba6af6416437b20ab2b7f29b155854`。
- 输入是 `scene-layout` v1 / `editor-assets` v1，map 有 152 个 logical files，ZIP 共 149 entries；
  manifest 明确声明 top-left 坐标、orientation-focus 横竖版、`5 x 5` main reel、cell
  `172 x 130`、column gap `6`、standard `bg-reel01` Symbols 和 award popup。
- 新包包含 BaseGame、FreeGame、BonusGame、两段视频转场和更多 authored nodes；初始 mode 为
  BaseGame。Symbols package 的稳定 id 仍是 `game003-s1`，其 game config、symbol manifest、
  Spine/VNI/image-string 闭包都在包内，不需要仓库 legacy 目录。
- 当前正式 `assets/minecart2` 来自任务 133：138 files、142 logical entries；game003 已有可运行的
  skin2 package path，但 loading 仍与 legacy skin1 并存，且 `skin-config.ts`、adapter、静态 YAML、
  generated files、release checker 和大量测试仍保留旧分支。
- 当前 `assets/game003-s1` 有 127 个 tracked files。game003 的背景、主框、传送带、矿车、
  Symbols、VNI/Spine、旧 win-amount 均仍由该目录生成/import；动态 bg-bar/矿车仅在 skin1 创建，
  skin2 已明确不创建、不等待，因此删除功能不会改变当前 skin2 round semantics。
- `apps/symbolsviewer`、`popupeditor`、`symbolseditor`、`gamelayouteditor` 和
  `packages/rendercore` 的若干当前测试/脚本仍直接读 legacy bytes；任务 155 已为 Crave 建立
  mapped fixture 迁移范式，本任务需要对 Minecart2 做同类收尾。

## 4. 需求解释与技术决策

### 需求解释

- “彻底改成 gamelayouteditor 导出的文件”表示 production runtime 美术只由
  `layout.manifest.json + assets.map.json + mapped payload` 拥有；app 不再维护第二套背景、Symbols、
  Popup、转场或资源路径表。
- “彻底移除对 game003-s1 的依赖”按仓库目录/路径依赖解释：目录删除且当前代码、测试、README、
  checker 不再读取它。ZIP 内 package id 是 versioned data identity，不是磁盘目录，不做静默改名。
- “传送带、矿车功能先移除”包括 parser 到 presentation 的整条 app feature 链，而不只是隐藏容器；
  round 不等待空 timer，也不为未来资源保留 dormant runtime。
- 现有合法 skin2 链接继续可用；删除 skin1 后仍保留显式 `skin=2`，与任务 155 后 game002 的单 skin
  URL 合同一致，避免本任务顺带改变外部启动参数。

### 关键决策

1. **单 package / 单 skin。** `Game003SkinConfig` 只保留 scene-layout 形态，skin parser 只接受
   `2`；adapter、loading 和 frame 不再按 presentation kind 分支。
2. **package 是唯一美术与 reel 数据 owner。** 使用 package 内 raw game config、Symbols、geometry、
   background、transition、Popup；generated TS 只保存 physical Vite URL，不复制 logical 资源表。
3. **业务配置与美术配置分离。** 删除为 legacy art 设计的 `game-static.yaml`/generated config，新增
   game003-owned versioned runtime manifest，仅保存 live endpoint、brand、reel timing、win-symbol
   loop 和 CO overlay；严格 parser 拒绝未知/缺失字段。Popup thresholds/timing/placement 继续只来自包。
4. **删除 feature，不保留 no-op facade。** 删除 bg-bar/minecart config、layout、runtime、sequence 与
   pending completion flags；服务端 component 由通用 logic 数据层保留但 game003 不查询。
5. **输入先优化再 vendor。** Downloads ZIP 只读，经 gamelayoutpkgcli quality 80 生成 verified
   optimized ZIP 与 asset-groups，再完整替换 `assets/minecart2`；不混用旧、新 payload。
6. **fixture 按 manifest 追踪。** editor/viewer/shared consumer 从 Minecart2 map 和 nested typed
   manifest 精确解析资源，不按旧 basename 或 content hash 猜用途；已无长期价值且只生成旧包的
   task114/task152 一次性脚本及 package script 入口删除。
7. **浏览器验收由用户负责。** 执行会话只交付自动化证据和可运行构建，不启动 dev server/浏览器，
   不把 happy-dom、fake Pixi 或编译结果写成视觉通过。

## 5. 职责与合同

- **Minecart2 mapped package**：背景、authored nodes、mode/transition、main reel geometry、Symbols、
  公开轮带输入、Popup 和全部 typed resource closure 的唯一美术合同。
- **rendercore/gameframeworks**：解析/校验 mapped package，拥有 Pixi/Spine/VNI、reel、popup、
  presentation surface、viewport 和 resource destroy；本任务原则上不新增 game003 专属 shared API。
- **game003 runtime manifest**：只拥有 live 固定入口、reel 播放参数、component/formatter/style 等
  app business policy；不得出现 package logical/physical path、node 表或 symbol 资源表。
- **game003 app**：拥有 component name、CO/bg-wins amount resolver、formatter、completion boundary 和
  package consumer 接线；不再拥有 legacy display tree、bg-bar 或 minecart 状态机。
- **资源生命周期**：loading 取得 package bytes；99% 与唯一 live session 在同一 abort/rollback 边界
  prepare；100% 后 framework/Pixi 复用 owner；任一失败和 destroy 均释放 package/session，不留下半挂载。
- **失败策略**：非法 skin、缺 map/file、hash/size/orphan drift、非法 5x5 geometry、缺 initial Symbols/
  Popup、错误 reel set、无效 config 或 destroyed owner 均显式失败。
- **禁止行为**：不复制资源表，不按首项/basename/hash 猜 key，不回退 legacy，不保留 hidden timer、
  placeholder 或只为旧测试存在的 compatibility branch。

## 6. 文件范围

### 预计新增

```text
assets/minecart2.assets-groups.json
apps/game003/config/game-runtime.manifest.json
apps/game003/src/runtime-config.ts
tasks/158-game003-single-gamelayout-package-<utctime>.md
```

### 预计修改

```text
assets/minecart2/**
apps/game003/{package.json,README.md}
apps/game003/scripts/verify-static-dist.mjs
apps/game003/src/{main,loading-resources,game-entry,skin-id,skin-config}.ts
apps/game003/src/{framework-config,game-adapter,game-demo,scene-layout-presentation}.ts
apps/game003/src/generated/minecart2-layout-resources.generated.ts
apps/game003/tests/**
apps/buildgamestatic/{README.md,src/yaml-loader.ts,tests/**}
apps/gamelayouteditor/{package.json,tests/production-reel-preview.test.ts}
apps/popupeditor/tests/resource-import.test.ts
apps/symbolseditor/{package.json,tests/**}
apps/symbolsviewer/{README.md,src/symbol-set-config.ts,tests/**}
packages/rendercore/tests/{popup,symbol,win-amount}/**
docs/agent-rules/game003.md
```

### 预计删除

```text
assets/game003-s1/**
apps/game003/config/game-static.yaml
apps/game003/src/generated/{game-loading,game-static}.generated.ts
apps/game003/src/{assets,bg-bar-layout,bg-bar-runtime,bg-bar-sequence}.ts
apps/game003/src/{minecart-interaction-config,minecart-interaction-layout,minecart-interaction-runtime}.ts
apps/game003/src/{generated-loading-url,game-layout,symbol-animation-config,win-amount-config}.ts
apps/game003/tests/{bg-bar-layout,bg-bar-runtime,bg-bar-sequence}.test.ts
apps/game003/tests/{minecart-interaction-config,minecart-interaction-layout,minecart-interaction-runtime}.test.ts
apps/gamelayouteditor/scripts/build-task114-acceptance.ts
apps/symbolseditor/scripts/build-task152-game003-symbols.mjs
```

### 原则上不应修改

```text
assets/gamecfg003/**
packages/{logiccore,netcore,uiframeworks,gameloading*}/**
packages/rendercore/src/**
packages/gameframeworks/src/**
pnpm-lock.yaml
AGENTS.md
```

若真实新包暴露 shared parser/runtime 缺口，先最小复现并说明 public API 扩张原因；不得在 app 复制
parser 或修改计划来事后合理化。

## 7. 实施步骤

1. **确认执行基线与输入**
   - 重新核对 HEAD/status、ZIP bytes/hash/CRC、manifest/map hash 和当前规则。
   - 用正式 parser/checker 确认 initial mode、5x5 geometry、`bg-reel01`、Symbols、Popup、mode/
     transition 与 exact closure；仓库变化或 ZIP 变化超出小幅适配时先停止说明。

2. **生成并接收正式 Minecart2 package**
   - 构建 gamelayoutpkgcli，以 quality 80 生成临时 optimized ZIP 和 asset-groups；复验 map path、
     media type、hash、byteLength、manifest nested closure、orphan、Spine/VNI/image-string 与 ZIP limits。
   - 从 verified optimized ZIP 完整替换 `assets/minecart2`，删除旧 orphan，提交对应
     `assets/minecart2.assets-groups.json`；Downloads 原 ZIP 保持不变。
   - 重新生成 `minecart2-layout-resources.generated.ts` 并运行 `--check`。

3. **收敛 game003 配置、skin 与 loading**
   - 将 app-owned live/reel/business 字段迁入 strict v1 runtime manifest；移除 legacy art、symbols、
     win-amount、featureBars 和 minecart YAML/generated 输入。
   - `skin-id.ts` 只接受 `2`；loading 只创建 Minecart2 mapped resources 加一个 runtime module，不再
     import `game-loading.generated.ts` 或选择 legacy closure。
   - 99% prepare 从 loaded bytes 创建一个 `SceneLayoutPackageResource`，校验 initial mode/Symbols/
     Popup/5x5 standard `bg-reel01`，与 live session 共同处理 abort、rollback 和 destroy。

4. **把 adapter 收敛到 package presentation**
   - 删除 legacy mount、静态 texture/symbol loader、world sprite、旧 art mapping 和 presentation-kind
     分支；frame/design size/focus/reel placement只读 package manifest/public surface。
   - 保留 main reel、本地公开轮带、target scene、CO overlay、bg-wins carousel、popup formatter、
     click advance、resize 与 cleanup；删除所有 bg-bar/minecart construction、tick、pending flag、
     completion gate 和 resource lookup。
   - 测试服务端仍携带 `bg-bar` component 时 spin 与无该 component 时具有相同 presentation/
     completion 轨迹，证明移除的是功能链而不是用空等待模拟。

5. **迁移其它 current consumer/fixture**
   - SymbolsViewer 保留 package identity `game003-s1` 的预览项，但从 Minecart2 map/nested Symbols
     manifest 构造 modules；删除独立 `game003-bg-bar` set。
   - PopupEditor、SymbolsEditor、Game Layout Editor、rendercore fixture 按 map + typed manifest
     提取需要的真实 VNI/Spine/image-string bytes；不复制一套 renamed legacy asset 目录。
   - 删除 task114/task152 旧包构建入口；buildgamestatic 中仅作为 generic example/test fixture 的
     legacy 路径改为中性 test path，shared schema 行为不变。

6. **删除 legacy 目录并加边界保护**
   - 在全部 consumer 迁移且定向测试通过后删除 `assets/game003-s1` 全目录。
   - release checker 验证 Minecart2 control/map/payload exact closure、dist 内容与 source hash/size；
     source-boundary 测试禁止 legacy path、legacy presentation 和 bg-bar/minecart runtime 回流。
   - 搜索时允许历史 `tasks/` 和 package manifest 内稳定 identity，禁止 active 代码/文档中的目录路径。

7. **文档、规则与收尾**
   - README 更新单 skin=2、单 package、资源更新 workflow、已移除 feature 和用户浏览器验收项。
   - game003 领域规则删除双 skin/legacy bg-bar/minecart/win-amount 资源合同，记录单 package 与功能暂缺
     的稳定边界；不把 ZIP 的逐文件清单或 hash 写入长期规则。
   - 运行 L2 验收，记录输入/优化输出 hash、实际文件范围、自动化结果和未完成浏览器验收，生成
     UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- package 测试使用真实 optimized `assets/minecart2`，证明 manifest/map/hash/size/closure 与 prepare/
  destroy，不通过手造 legacy modules 冒充 production package。
- game003 覆盖 skin=2 正常路径、skin1/未知值严格失败、99% abort/rollback、100% owner 复用、
  main reel/CO/bg-wins/popup/resize/destroy，以及含 `bg-bar` GMI 时无 feature presentation/wait。
- editor/viewer fixture 通过 typed manifest 引用定位内容；content-addressed filename 变化不应要求
  修改第二份业务路径表。
- 已删除功能的测试应删除或改成 source-boundary/absence 测试，不为旧行为保留 production code。
- fake runtime 只证明资源与编排合同；真实画面、Spine/VNI、视频、横竖版与交互由用户浏览器验收。

### 验收级别

`L2`。任务替换正式 ZIP/mapped assets，改动 game003 resource ownership，并迁移多个 editor/viewer/
rendercore 直接 consumer；范围仍可由这些 package 界定，不改根工具链、shared public API 或 lockfile，
不升级 L3。

### 执行会话必须运行

```bash
pnpm --filter gamelayoutpkgcli build && pnpm --filter gamelayoutpkgcli start -- --input '/Users/zerro/Downloads/minecart2/new-layout-layout (6) (1).zip' --output /private/tmp/task158-minecart2.optimized.zip --assets-json /private/tmp/task158-minecart2.assets-groups.json --quality 80
pnpm --filter game003 --filter buildgamestatic --filter gamelayouteditor --filter popupeditor --filter symbolseditor --filter symbolsviewer --filter @slotclientengine/rendercore typecheck
pnpm --filter game003 --filter buildgamestatic --filter gamelayouteditor --filter popupeditor --filter symbolseditor --filter symbolsviewer --filter @slotclientengine/rendercore test
pnpm --filter game003 check:resources && pnpm --filter game003 release:check
test ! -e assets/game003-s1 && ! rg -n 'assets/game003-s1|game003-s1/' apps packages docs/agent-rules --glob '!**/dist/**'
git diff --check
```

若 optimizer 临时输出已存在，执行时使用新的显式 task158 临时路径，不覆盖旧证据。失败先缩小到单
package/单测试；不恢复 legacy 入口来通过旧断言。

### 人工验收

由用户在浏览器执行，执行会话不启动浏览器：

1. 用合法 `skin=2` live URL 验收横屏、竖屏和 resize：新 BaseGame 背景/authored nodes、5x5 reel、
   Symbols、层级和 clipping 正确，无 legacy 画面闪现。
2. 验收 normal spin、CO overlay、bg-wins 首轮/lingering、中奖 popup 点击推进/关闭和下一轮 cleanup；
   金额始终无货币符号且保留两位小数。
3. 用仍返回 `bg-bar` 的 round 确认没有动态传送带 Symbols、矿车、payload 或额外等待；销毁/重进无
   残留 canvas、player 或报错。
4. 若手工触发/预览 package mode，检查 FreeGame/BonusGame 背景和两段视频资源能严格 prepare；
   这不是本任务新增 live mode 切换的通过条件。

### 独立验收建议

`必须`。任务涉及正式 ZIP、mapped closure、跨 app fixture 和 resource ownership。独立复验重点为：

```bash
pnpm --filter @slotclientengine/rendercore --filter game003 test
pnpm --filter game003 release:check
test ! -e assets/game003-s1 && ! rg -n 'assets/game003-s1|game003-s1/' apps packages docs/agent-rules --glob '!**/dist/**'
```

浏览器验收仍由用户完成，不要求独立验收者重复视觉步骤。

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm。shell 没有 Node 时：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时运行 `CI=true pnpm install --frozen-lockfile`；不切换 npm/yarn。
- optimizer 使用本机 `cwebp`，quality 80；只有实际下载失败才设置仓库约定代理。本任务不新增依赖，
  不修改 lockfile。

## 10. 生成物、文档与规则

- `assets/minecart2` 只由 verified optimized ZIP 完整展开；map、nested manifest 和 hashed payload
  禁止手改。
- `assets/minecart2.assets-groups.json` 与 optimized ZIP 同次生成并复验，不作为 runtime 必需的第二份
  资源表。
- `minecart2-layout-resources.generated.ts` 只由 scene-layout Vite resource generator 更新并
  执行 `--check`；旧 game-static/loading generated 文件删除，不留手写替代生成物。
- README 记录单包和后续重新接入传送带/矿车所需的新资源合同；领域规则只保存稳定 ownership/
  capability 边界，不记录本次 hash 和文件清单。

## 11. 执行报告

执行完成后创建：

```text
tasks/158-game003-single-gamelayout-package-<utctime>.md
```

UTC：

```bash
date -u +%y%m%d-%H%M%S
```

报告简要记录最终实现、输入与 optimized ZIP/layout/map/asset-groups hash、实际删除/迁移文件、计划
偏差、自动化结果、用户负责的浏览器验收和剩余风险；不收集无关全仓 coverage 或历史矩阵。

## 12. 风险、假设与待确认

### 风险

- 新包新增模式、视频、authored image-string 节点且布局与旧 package 不同，自动化只能证明 strict
  resource/runtime 合同，最终视觉仍依赖用户浏览器验收。
- 删除 legacy fixture 会触及多个 editor/viewer 测试；迁移必须按 manifest closure，不能把旧目录
  复制到新测试目录形成隐藏的第二份生产素材。
- 后续传送带/矿车资源到齐后，需要以当时 ZIP 的明确 node/runtime resource/animation contract 重新
  设计；本任务不预留猜测字段。

### 假设

- production 启动继续使用显式 `skin=2`、当前 live server/gamecode、`5 x 5` server scene、
  `bg-reel01` 和现有 CO/bg-wins 业务语义。
- ZIP 中 package id `game003-s1` 是美术侧稳定 identity，允许保留；它不授权恢复同名仓库目录。
- package popup 继续由 game003 注入 `formatServerAmount`，ZIP 的 `amountFormat` 只作 editor/default
  preview，不改变服务器 cents 语义。

### 待确认

无。浏览器验收已由用户明确承担。

## 13. 完成清单

- [x] 单 skin=2、单 Minecart2 package 目标和非目标已满足。
- [x] `assets/game003-s1`、legacy consumer 和 bg-bar/矿车功能链已删除，无隐藏 fallback/no-op timer。
- [x] 新 mapped package、asset-groups、generated URL map 和 release closure 一致。
- [x] CO/bg-wins/popup/live/reel 行为与 server 数据边界保持。
- [x] editor/viewer/shared fixtures 已迁移，不存在第二份 legacy production asset tree。
- [x] 指定 L2 自动化验收已通过，用户浏览器验收明确未代做。
- [x] README、game003 领域规则和 UTC 中文执行报告已同步。

## 14. 执行会话交接

执行会话应：

1. 读取根规则、本计划列出的领域规则和本计划；
2. 核对 Git/ZIP/hash 后按步骤实现，不重新制定另一套双 skin 方案；
3. 小幅适配当前代码或 optimized 输出时在报告记录；
4. shared public API、lockfile 或资源合同明显扩张时先停止说明；
5. 只运行计划规定的 L2 验收，不启动浏览器、不冒充视觉验收；
6. 完成后生成 UTC 中文执行报告；
7. 除非用户明确要求，不 commit、不 push、不创建 PR。
