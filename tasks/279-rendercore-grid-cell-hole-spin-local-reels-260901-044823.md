# 279 rendercore-grid-cell-hole-spin-local-reels 执行报告

UTC：2026-09-01T04:48:23Z

## 最终实现

- 根因确认：`RenderGridCellReelSet` 在 target-aware 与 continuous 的 hole start boundary 先调用
  `RenderReel.resetToY()`；该方法只读取 reel constructor 的默认 `LogicReels`，因此 settled `-1` 被提前换成错误
  code，并作为 current endpoint 写入随后使用 `localReels` 的临时 strip。
- 修复：两条 start 路径不再预先 reset hole，直接让 `RenderReel.start()` / `startContinuous()` 从既有 empty
  visible window建立本轮 strip；调用成功后再把 cell 标记为 active/occupied。
- public API、Scene Layout input、manifest、schema、Crave adapter、依赖和 lockfile 均未修改。服务器 scene 仍只覆盖
  final target，过程 code只来自本轮 selected公开轮带，current settled hole 保留为outgoing endpoint。
- 新增回归覆盖 full target-aware、selective、targetless continuous、response-before-staggered-start 和
  `spinMainReelToScene({ localReels })` 真实入口；测试使用与constructor reels可区分的per-spin reels，并检查start
  boundary的visible hole和buffer code来源。

## 实际修改文件

slotclientengine：

```text
packages/rendercore/src/reel/render-grid-cell-reel-set.ts
packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
packages/rendercore/tests/scene-layout/package-runtime.test.ts
packages/rendercore/README.md
docs/agent-rules/shared-game-runtime.md
tasks/279-rendercore-grid-cell-hole-spin-local-reels.md
tasks/279-rendercore-grid-cell-hole-spin-local-reels-260901-044823.md
```

pixicrave：

```text
/Users/zerro/gitee.com/pixicrave/packages/rendercore/src/reel/render-grid-cell-reel-set.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/reel/grid-cell-continuous-spin.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/tests/scene-layout/package-runtime.test.ts
/Users/zerro/gitee.com/pixicrave/packages/rendercore/README.md
/Users/zerro/gitee.com/pixicrave/docs/agent-rules/shared-game-runtime.md
```

同步方式：source 与两个lower-level test在同步后保持byte parity；Scene Layout test、README和shared rule因两仓已有
合法drift，仅应用任务279的新增case/合同hunk。未复制整个RenderCore目录，未修改Crave app。

## 验收结果

通过：

```text
engine RenderCore 定向 Vitest：3 files，77 tests passed
engine @slotclientengine/rendercore typecheck：passed
engine changed-file Prettier check：passed
engine git diff --check：passed

pixicrave RenderCore 定向 Vitest：3 files，77 tests passed
pixicrave crave build：passed
pixicrave changed-file Prettier check：passed
pixicrave git diff --check：passed
```

Crave build 保留既有warning：`bonus_active.png`在build时不解析、main chunk超过2000 kB；build本身成功。

未通过但确认非本任务引入：

```text
pnpm --dir /Users/zerro/gitee.com/pixicrave --filter @slotclientengine/rendercore typecheck
```

该命令被既有测试 `render-reel-set.test.ts`、`spin-plan.test.ts`、`symbol/catalog.test.ts` 对已不存在的
`assets/gamecfg/game2.json` import 阻断。任务279新增测试已由外部Vitest成功编译执行，production RenderCore又由
Crave build中的`tsconfig.build.json`成功编译；未扩围修改旧fixture。

环境偏差：engine首次`CI=true pnpm install --frozen-lockfile`因现有`pnpm-lock.yaml`缺少
`@typescript-eslint/eslint-plugin`解析项失败。随后使用`--no-frozen-lockfile --lockfile=false`安装声明依赖；
`pnpm-lock.yaml`未修改，本地`node_modules`被ignore。

## 未完成人工验收

按用户要求，浏览器验收由用户执行。待覆盖：

1. FreeGame direct `spinMainReelToScene({ localReels })` 从BN/hole起转，current gap随轴向离开且无Base默认轮带图标闪现；
2. targetless response分别早于/晚于hole staggered start，过程local reel与最终server target连续；
3. 普通occupied、selective refill、final hole和quick-stop无held、clip、dimming、Nearwin残留。

## 剩余风险与状态

- 自动测试证明start boundary、per-spin reel来源、最终target及两仓同步合同；真实Pixi裁切和BN/gap观感仍需上述浏览器验收。
- 两仓均保持未提交工作区修改；未commit、push或创建PR。
