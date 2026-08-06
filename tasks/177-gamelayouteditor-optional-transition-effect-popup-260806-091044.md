# 177 Game Layout Editor 可选转场效果与通用转场 Popup 执行报告

## 结果

任务已完成代码、文档与 L2 自动化验收。Scene Layout 有向转场现在使用 strict 三分支 union：

- `overlay: { kind: "none" }`：显式无效果，完整准备目标 scene 后直接原子切换状态；
- official Spine overlay：继续在 exact event occurrence 切换状态；
- MP4 video blackout：继续在 media-time `fadeStart` 切换状态。

三种效果都可为 exact edge 独立选择一个普通 Spine `preludePopup`，也可明确选择“无”。切换效果类型
会保留 Popup binding/order/placement，只清理效果分支自身字段。Popup 完整执行 start→loop→end 后再继续
效果；带 Popup 的视频进入 `awaiting-video-start`，由第二次真实用户手势调用
`startPendingGameModeVideo()` 同步启动，不预播、不静音降级、不与 Popup end 并行。

## 主要修改

- `packages/rendercore/scene-layout`
  - public transition union 新增 explicit none；`preludePopup` 提升为三分支公共字段。
  - strict parser 拒绝 none 携带 resource/animation/placement 等混合字段；video 现在允许普通 Spine Popup。
  - resource/files/CDN loader 对 none 不读取或创建伪资源。
  - package runtime 复用统一 target prepare/commit 和 Popup lifecycle；snapshot 新增 `transitionKind=none`
    与 `transitionPhase=awaiting-video-start`；presentation surface 转发 pending video start API。
- `apps/gamelayouteditor`
  - Inspector 提供无效果、Spine、黑场视频三选一，并在公共区域提供 Popup 的“无”与 exact binding。
  - draft、资源引用、导出、mapped ZIP 重导与 preview 支持 none；效果切换保留 Popup。
  - video Popup 完成后按钮变为“开始视频转场”，真实 click 直接调用 production runtime API。
- `apps/gamelayoutpkgcli`
  - none transition group 的 effect closure 为空，但仍合并可选 Popup exact closure。
  - typed reference rewrite 原样保留 none，不猜测资源路径。
- 同步 scene-layout manifest 文档、Editor/rendercore/CLI README 与两份领域规则。

## 自动化验收

通过：

- 四目标 typecheck：rendercore、gamelayouteditor、gamelayoutpkgcli、game002。
- rendercore：89 test files、709 tests；branch coverage 80.06%。
- Game Layout Editor：23 test files、182 tests；新增最终 round-trip 断言后定向 validation 26 tests 通过。
- Game Layout Package CLI：6 test files、21 tests。
- 三目标 build：通过；Editor 仅报告既有 dynamic-import 与大 chunk warning。
- 三目标 lint：通过。
- 三目标 format:check：通过。
- `git diff --check`：通过。

依赖按 `CI=true pnpm install --frozen-lockfile` 安装；`pnpm-lock.yaml` 未变化。Node 使用仓库已有
`v24.14.0`。

## 计划偏差与范围

- `EditorGameModeTransitionBaseDraft.preludePopupId` 保持 optional，仅用于兼容已有 in-memory fixture；
  Editor 新建/重导仍物化 `null`，production manifest 的缺省字段仍明确表示不弹 Popup。
- 无效果没有 art-space placement，因此 `coordinate-origin.ts` 现有 Spine-only转换已经正确，不需修改。
- public surface 通过向后兼容的新增方法完成，game002 源码无需修改；其 typecheck 已证明直接 consumer
  继续兼容。
- 未修改 Popup Editor、Popup package schema、production assets、游戏业务配置、lockfile 或根工具链。

## 人工验收交接

本会话未把 happy-dom/fake player/构建当作真实浏览器媒体验收。仍建议在浏览器确认：

1. 三种效果分别配置“无 Popup”与普通 Spine Popup，导出/重导后类型与 exact edge binding 不漂移。
2. none 无 Popup 直接原子切换；none+Popup 保持 source 到完整 end，再一次提交目标状态。
3. Spine+Popup 在 complete 后启动 overlay；video+Popup 在 complete 后显示“开始视频转场”，第二次点击
   能在真实设备有声播放并按 media time fade/switch。
4. 清空 Popup 后完全不弹；在三种效果间切换仍保留已选 Popup/order/placement。

## 基线

- HEAD：`351bc96a4226fc0d47f47f9051ef7a2413a81442`
- UTC：`2026-08-06T09:10:44Z`
- detached worktree；未 commit、未 push。
