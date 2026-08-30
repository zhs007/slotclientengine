# 269 gamelayouteditor-orientation-layer-placements 执行报告

## 执行基线

```text
UTC: 2026-08-30T05:28:27Z
HEAD: 5a9eafc39f292d716dd0580913985776110bea73
branch: (detached HEAD)
```

执行前只有任务计划为未跟踪文件；未修改 lockfile、根工具链、assets 或外部游戏仓库。

## 最终实现

- Scene Layout latest 升级为 v6，新增 strict parser、v1–v5→v6 upgrader 与 runtime allocation v2。旧单背景普通图层的
  `default` placement 深复制到 `landscape` / `portrait`，旧双背景方向可见性保持；原生 v6 普通图层拒绝 `default` 和未知 key，
  allocation 漂移显式失败。
- runtime snapshot 分离 geometry `variantId` 与页面方向 `orientationVariantId`。背景、reel、Popup、transition 继续使用 geometry
  variant；普通图层使用页面方向。单背景横竖 resize 和正方形连续性会更新 placement/visibility，不重建稳定 player；旧 v1
  direct runtime 仍优先使用原 `default`。
- Game Layout Editor 的普通图层创建、重绑、Inspector、隐藏恢复、坐标原点转换、selection outline 和 production preview 均统一为
  横版/竖版数据；导入 v1–v6 后维护 canonical v6，manifest preview 与 production ZIP 只导出 v6。
- Gamelayout package CLI 已支持 v6 的 typed audio/event-audio path rewrite，并保持 v6 allocation/placement；RenderCore、Editor、CLI
  README 和三个领域规则已同步。

主要新增文件：

```text
packages/rendercore/src/scene-layout/manifest-v6.ts
packages/rendercore/tests/scene-layout/manifest-v6.test.ts
```

其余修改集中在 RenderCore Scene Layout data/core、Gamelayout Editor model/UI/preview/ZIP、Gamelayout package CLI 和直接相关测试/文档。

## 关键决策与计划偏差

- v6 materialized v1-compatible runtime view 允许普通图层携带 L/P placement；公开旧 v1 strict parser 不放宽。底层 runtime 对拥有
  `default` 的旧普通图层继续取 `default`，没有 `default` 的 canonical v6 view 才取页面方向。
- package resource 对 v2–v6 source 使用内部 runtime parser，以保证旧 v2–v5 经 latest upgrader 后可直接运行，不要求 Editor 重导。
- 未发生 schema 范围扩张、依赖新增或生成物手改。按用户要求未执行浏览器人工验收。

## 自动化验收

以下计划规定命令均通过：

```text
RenderCore 指定 Scene Layout tests: 5 files / 47 tests passed
Gamelayout Editor 指定 tests: 5 files / 100 tests passed
Gamelayout package CLI 指定 tests: 2 files / 15 tests passed
RenderCore + Editor + CLI + Gameframeworks + Gameviewer + Gameviewer2 typecheck: passed
RenderCore build: passed
git diff --check: passed
```

额外验收：

```text
Gamelayout Editor ui-session/app-shell: 2 files / 38 tests passed
RenderCore package runtime 的 variant event、legacy v1、layout-only 定向子集: 3 tests passed
Prettier（新增 v6 文件和任务文档）: passed
```

探索性运行完整 `package-runtime.test.ts` 时，已有 standard/grid-cell reel parent 层级断言失败；失败断言与本任务未修改的
camera/layout/reel attachment 代码相冲突，计划指定 suite、相关 variant/legacy 子集、联合 typecheck 与 build 均通过，本任务未扩大到
修正该相邻测试。

## 未完成的人工验收

浏览器验收由用户执行，尚未完成：

1. 单背景普通图层以明显不同 L/P placement 连续切换横屏、竖屏、正方形，确认背景不变、图层方向生效且动画不重播。
2. 分别隐藏/恢复两侧并切 mode，确认 exact 恢复且另一侧不变；双背景 workflow 保持。
3. 导入旧单背景 v1/v5 与旧双背景 ZIP，确认迁移结果；导出 v6 后重导不再迁移。

## 剩余风险

- 真实浏览器下 Pixi/Spine/VNI 连续 resize 的视觉连续性和生产 ZIP 手工往返仍待上述人工验收。
- 未发现其它实现阻塞项。
