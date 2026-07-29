# 133 game003-minecart2-skin-runtime-parity 任务计划

## 1. 目标与完成定义

### 目标

为 `apps/game003` 增加严格的 `skin=2`。直接使用
`/Users/zerro/Downloads/minecart2.optimized.zip`，完整解压到
`assets/minecart2`，按 game002 skin2 的发布方式把 mapped folder 作为正式
scene-layout 输入；运行时不读取 ZIP。

保留当前 `skin=1`，只作为功能和效果对齐基线。后续视觉、布局与 presentation
只维护 skin2。两个 skin 共用 game003 业务编排；通用 package、reel、popup 和
Spine 兼容能力留在 rendercore，游戏 component 和效果选择留在 app。

### 完成定义

- [x] URL 严格支持显式 `skin=1|2`，缺失、重复、空值和未知值显式失败。
- [x] skin1 仍使用现有资源和旧 bg-bar/矿车效果。
- [x] skin2 使用 `assets/minecart2` 的 layout、Symbols package、公开本地轮带、
      横竖屏 placement 和 popup 美术，不读取 skin1 presentation 资源。
- [x] skin2 不创建旧矿车动画或动态传送带 Symbols，也不增加相关等待时间。
- [x] main reel、CO overlay、bg-wins、金额点击和 cleanup 继续由同一 game003
      adapter 驱动。
- [x] game003 永久不显示 `$` 或其它货币符号，服务器 cents 仍显示两位小数。
- [x] ZIP 的 popup amountFormat 只作编辑器预览；runtime 注入 game-owned formatter，
      为后续多币种保留游戏层入口。
- [x] mapped folder、生成 URL 表和 dist closure 通过 checker；浏览器验收由用户执行。

## 2. 范围

### 包含

- 精确解压优化 ZIP 到 `assets/minecart2`。
- game003 双 skin query、active-skin loading、99% prepare、frame、adapter、测试、
  README 和 release checker。
- rendercore scene-layout popup formatter 注入、主转轮 geometry facade，以及
  全部 editor-owned Spine consumer 的 mapped texture key 正确显式绑定。
- static winAmount 的固定 currency/locale 元数据改为可选，game003 不再生成固定币种。
- 相关 generated URL 表和任务执行报告。

### 不包含

- 不修改 ZIP 内 popup 配置，不从它推断货币或服务器金额单位。
- 不实现 skin2 第二套传送带 Symbols 或新版矿车美术动画。
- 不删除 skin1，不把 skin2 设为默认值。
- 不修改服务器协议、真实轮带边界、gamecode、下注或 CO raw amount 合同。
- 不新增路径猜测、node alias、placeholder、skin1 fallback 或第二套业务状态机。

## 3. 制定计划时的基线

```text
UTC: 2026-07-28T08:44:12Z
HEAD: abedbf0c67bac430d78e8109aaa0c8a3b942bbb4
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/game003.md`、
  `shared-game-runtime.md`、`loading-ui.md`、`scene-layout.md` 和
  `editor-artifacts.md`。
- ZIP SHA-256：
  `698c2608bde01b2358ae9e41a70777a471f5e2a3d6d18b754e36b66352a16b78`。
- layout/map SHA-256：
  `dbc5bb0cf91c8b50d3b893b1979be663ba7716ddac8ab466a051d9cbb97a63a4` /
  `65d86f7a98b9b01f1fbac19b7f7c5b29e86a6797de208b68c8b2614fdd2de4e9`。
- 输入是 scene-layout v1 / editor-assets v1 mapped package，主转轮为 `5x5`
  standard reel，reel set 为 `bg-reel01`。
- package popup 声明的整数格式只用于编辑器预览，不是 runtime 金额合同。
- rendercore 已有 strict mapped package runtime、standard reel、popup、viewport 和
  resource ownership；不另建 parser 或状态机。

## 4. 需求解释与技术决策

### 需求解释

- “直接用优化包”表示 ZIP 原样解压为正式 mapped folder，生成器精确引用其中的
  physical files；不是重新导出或只挑选图片。
- “发布流程和 game002 skin2 一致”表示构建时把解压后的内容寻址资源纳入 dist，
  runtime 只消费已加载 bytes，不读取 ZIP。
- skin1 是行为基线，不是 skin2 的资源 fallback。
- skin2 缺少的旧传送带/矿车效果是显式能力差异，不以空 timer 模拟。

### 关键决策

1. **active-skin loading**：main 先严格解析 skin；skin1 加载 generated legacy
   resources，skin2 加载 mapped folder 精确 URL 表，两者只加载一个 runtime module。
2. **完整 package runtime**：skin2 的背景、节点、reel、symbol 和 popup 由
   `SceneLayoutPackageRuntime` 拥有，app 只做业务 target 适配。
3. **一个业务 adapter**：mount 和 viewport 按 presentation kind 分支，spin、CO、
   bg-wins、amount 和 cleanup 状态机保持一份。
4. **formatter 分层**：rendercore popup 接收通用 formatter；game003 注入无货币符号、
   cents 两位小数的 formatter，不改 package manifest。
5. **优化 Spine 显式绑定**：manifest texture key 经 assets.map 解析为 physical
   hash 文件；单页 atlas page 绑定这张已解析纹理，不比较两者 basename。
6. **生命周期**：99% 阶段并行准备 live session 和 package resource，失败/abort
   回滚；enter 后 owner 随 framework 销毁。

## 5. 职责与合同

- **rendercore**：scene-layout package、mapped resource、Pixi/Spine/VNI、standard
  reel、popup formatter seam、geometry snapshot、viewport 与 destroy。
- **game003**：skin 选择、component、CO、bg-wins、金额语义、skin1 旧效果和 skin2
  disabled capability。
- **资源数据**：layout/map/Symbols/popup/geometry 只来自 `assets/minecart2`；
  generated TS 只保存精确 Vite URL，不复制业务表。
- **金额**：服务器 amount 除以 100 并保留两位小数；CO otherScene 继续显示 raw
  positive integer。任何游戏金额都不附带货币符号。
- **失败策略**：未知 skin、缺 mapped file、hash/size drift、非法 geometry、缺失
  Spine texture key 或 destroyed owner 均显式失败。

## 6. 文件范围

### 预计新增

```text
assets/minecart2/**
apps/game003/src/generated/minecart2-layout-resources.generated.ts
apps/game003/src/scene-layout-presentation.ts
apps/game003/tests/minecart2-skin.test.ts
apps/game003/tests/scene-layout-adapter.test.ts
tasks/133-game003-minecart2-skin-runtime-parity-<utctime>.md
```

### 预计修改

```text
apps/game003/{package.json,README.md}
apps/game003/scripts/verify-static-dist.mjs
apps/game003/src/{main,loading-resources,game-entry,skin-id,skin-config}.ts
apps/game003/src/{game-adapter,money,win-amount-config}.ts
apps/game003/tests/**
apps/buildgamestatic/{src,tests}/**
packages/gameframeworks/{src/static-config,tests}/**
packages/rendercore/src/{background,popup,reel,scene-layout,spine,symbol,symbol-value-presentation}/**
packages/rendercore/tests/{background,popup,reel,scene-layout,symbol,symbol-value-presentation}/**
docs/agent-rules/game003.md
```

### 原则上不应修改

```text
assets/game003-s1/**
assets/gamecfg003/**
apps/{gamelayouteditor,gamelayoutpkgcli,gameviewer}/**
packages/{logiccore,netcore,uiframeworks}/**
pnpm-lock.yaml
AGENTS.md
```

## 7. 实施步骤

1. **锁定输入与基线**
   - 记录 HEAD/status 和 ZIP/layout/map hash。
   - 确认 package 的 schema、5x5 reel、公开轮带、popup 与横竖屏 frame 合同。

2. **接收正式 mapped folder**
   - 将优化 ZIP 完整解压到 `assets/minecart2`，不修改 payload。
   - 用 scene-layout generator 生成精确 Vite URL 表并执行 `--check`。

3. **实现通用缺口**
   - popup player/runtime 增加可选 amount formatter 注入，默认预览行为不变。
   - package runtime 暴露主转轮可见 geometry snapshot。
   - 审计 background、symbol、symbol introspection、grid-cell effect 和
     symbol-value Spine consumer；移除 atlas page 与显式 texture key/path 的错误
     basename 校验和推导。资源存在、显式 page/key closure、map/hash/size、skeleton
     和 animation 仍严格验证。

4. **接入 game003 skin2**
   - 增加 strict skin parser 与 active-skin loading。
   - 99% prepare 从 loaded bytes 创建 package resource，并与 live session 共用
     abort/rollback 边界。
   - 创建 package-backed reel/popup presentation，接到现有 adapter。
   - skin2 跳过 bg-bar plan、旧矿车 construction/update/wait；skin1 路径保持。

5. **统一金额合同**
   - formatter 改为无货币符号、两位小数。
   - static winAmount 的 currency/locale 变为兼容性可选字段；game003 YAML/生成物
     不再声明固定币种。
   - HUD、result overlay、skin1 win amount 和 skin2 package popup 共用 formatter。

6. **测试、发布与文档**
   - 用真实 `assets/minecart2` 测试 package preparation。
   - release checker 验证 map 的 hash/size/exact closure 和全部 mapped files 进入 dist。
   - 更新 README、game003 领域规则和生成物。
   - 运行 L2 定向验收，浏览器验收留给用户，生成 UTC 中文执行报告。

## 8. 测试与验收

### 测试原则

- shared tests 只保护通用 API/optimizer 合同，不写 game003 node/component。
- app tests 使用真实 mapped folder，保护 active loading、无 legacy factory、formatter、
  ownership 和 strict failure。
- fake Pixi 只证明解析/编排；真实布局、Spine/VNI 和视觉节奏由用户浏览器验收。

### 验收级别

`L2`。任务修改 rendercore public seam、正式 mapped 交付物和直接 consumer game003，
但范围可界定，不运行整仓 L3。

### 执行会话必须运行

```bash
pnpm --filter buildgamestatic --filter @slotclientengine/gameframeworks --filter @slotclientengine/rendercore --filter game003 typecheck
pnpm --filter buildgamestatic --filter @slotclientengine/gameframeworks --filter @slotclientengine/rendercore --filter game003 test
pnpm --filter game003 check:resources
pnpm --filter game003 release:check
pnpm --filter game003 lint
git diff --check
```

### 人工验收

- 用户在浏览器分别验收 skin1/skin2 横竖屏和 resize。
- skin2 核对 package layout、5x5 reel、CO、bg-wins、popup、金额点击和 cleanup。
- skin2 不应出现旧动态传送带图标或矿车互动；package 静态节点可以显示但不运动。
- 金额覆盖小数与 tier 边界，任何位置都不得出现货币符号。

### 独立验收建议

`必须`：复验真实 mapped folder、formatter 覆盖、skin2 无 legacy factory，以及
prepare/destroy。最多复跑：

```bash
pnpm --filter @slotclientengine/rendercore --filter game003 test
pnpm --filter game003 release:check
git diff --check
```

## 9. 环境与依赖

- 使用仓库要求的 Node 24 和 pnpm；当前 shell 通过 workspace runtime 提供 Node。
- 缺依赖时运行 `CI=true pnpm install --frozen-lockfile`。
- 不新增依赖，不修改 lockfile。

## 10. 生成物、文档与规则

- `minecart2-layout-resources.generated.ts` 只由
  `generate-scene-layout-vite-resources.mjs` 更新并执行 `--check`。
- `assets/minecart2` 必须等于优化 ZIP 的完整解压内容，禁止手改。
- README 记录双 skin、active loading、无货币符号和资源更新 workflow。
- `docs/agent-rules/game003.md` 记录稳定的双 skin 与 presentation ownership 边界。

## 11. 执行报告

执行完成后创建：

```text
tasks/133-game003-minecart2-skin-runtime-parity-<utctime>.md
```

记录最终实现、ZIP/hash、计划偏差、验收结果、用户负责的浏览器验收和剩余风险。

## 12. 风险、假设与待确认

### 风险

- package 的 Pixi/Spine/VNI 真实渲染仍需浏览器确认。
- popup 当前预览 amountFormat 与未来多币种业务必须持续分层。
- skin2 后续新增动态传送带 Symbols/矿车动画时需要新的明确资源合同。

### 假设

- skin2 继续使用现有 gamecode、5x5 server scene、`bg-reel01` 和 component 语义。
- package 中的静态 image-string/jackpot 节点本任务不新增 live resolver。

### 待确认

无。浏览器验收由用户执行。

## 13. 完成清单

- [x] 双 skin strict loading 与 skin1 baseline 成立。
- [x] skin2 完整消费 `assets/minecart2`，runtime 不读取 ZIP且无 skin1 fallback。
- [x] main reel/CO/bg-wins/popup 接入，skin2 无旧传送带 Symbols/矿车动画。
- [x] 金额无货币符号且小数逻辑保持。
- [x] shared/game 职责、resource lifecycle、checker 和生成物正确。
- [x] L2 自动化通过，浏览器验收明确交给用户。
- [x] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根规则、计划列出的领域规则和本计划；
2. 核对 Git/ZIP/hash 后按步骤实现；
3. public API 或资源范围明显扩大时先说明；
4. 只运行本计划 L2 验收，不冒充浏览器验收；
5. 完成后生成报告；
6. 未获要求不 commit、不 push、不创建 PR。
