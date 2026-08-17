# Task 223：外部 Crave 游戏音频迁移

本文面向本仓库之外的 Crave 游戏源码。Task 223 不修改仓库内的 `assets/crave`，也没有直接写入外部源码；以下步骤需要在外部 Crave 项目中手动执行。

## 迁移前提

1. 先更新 Crave 使用的 slotclientengine packages，使其包含 Scene Layout v4、Popup v7、Symbol v3 和新的 gameframeworks 音频 facade。
2. 用新版 Game Layout Editor 打开旧 layout ZIP；合法 v1–v3 会升级为 v4，默认没有 BGM/effect，因此旧游戏行为不变。
3. Popup/Symbol package 如需音效，分别用新版 Popup Editor/Symbols Editor 打开并重新导出。不要在 nested package 中手写 `award.coin` 一类全局名。

## 配置步骤

1. 在 Popup Editor 或 Symbols Editor 中导入音效，以 local name 配置 once/loop、delay 和 BGM keep/duck/pause，再把 cue 绑定到具体 tier/segment/state。
2. 在 Game Layout Editor 中重新导入新版 nested ZIP，并使用稳定 binding id。`coin` 位于 `award` binding 下时，runtime route 自动成为 `award.coin`。
3. 在 Game Layout Editor 中导入 BGM，并按 mode 显式选择。BGM 可空、恒 loop；Splash 通常保持空。为切歌配置 fade-out/fade-in，避免硬切。
4. 仅当 Crave 代码需要主动播放/停止 effect 时，将 route 加入 `programmaticEffects`，并改用 Scene Layout/gameframeworks facade：`playEffect(route)`、`stopEffect(route)`。不要直接传 URL 或访问 `@pixi/sound` 全局对象。
5. 在用户点击 spin/primary action 的同步调用链中调用 `unlockAudio()`；将平台 mute 状态持续传入 `setAudioMuted()`；在每帧继续调用 Scene Layout runtime 的 `update(deltaSeconds)`。
6. 用新版 `gamelayoutpkgcli` 重新优化 production ZIP，并发布更新后的 asset-groups 文件。确认 `audio:scene-layout` 不在 `initialAssets`。

## 手工验收

- 首屏进度和 `99%/100%` gate 不等待音频；首次真实手势后才允许发声。
- 每个配置 BGM 的 mode 循环播放；相同曲目不重启，不同曲目渐隐/渐现；未配置的 mode 保持无 BGM。
- Popup/Symbol cue 在动画语义起点之后按 delay 发声，重复预览不留下旧 cue。
- loop effect 可用完整 route 停止；stop 同时取消尚未开始的 delay。
- duck/pause effect 结束、停止、切状态或销毁后，BGM 都能恢复。
- 页面退出并销毁 runtime 后无残余声音、定时任务或晚到播放。
