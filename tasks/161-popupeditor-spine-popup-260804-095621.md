# 161 Popup Editor 普通 Spine 弹窗执行报告

## 结果

任务已完成代码与自动化验收。Popup v1 现在是 strict `award-celebration | spine` 联合合同；普通 Spine 弹窗由 rendercore 统一执行 `start → loop → end`，点击请求可提前锁存，但只在完整 loop 边界后进入 end。旧获奖庆祝合同和播放器保持独立。

Popup Editor 可导入一组 skeleton JSON、共享 atlas 与 PNG，选择普通 Spine 类型、资源和三个大小写精确动画，预览并导出/重导入自包含 ZIP。Game Layout Editor 导入普通 Spine Popup 后默认不注册；显式注册后才进入 Scene Layout manifest、preview 和 production ZIP。CLI 使用独立 `spine-popup` 资源组，gameframeworks 暴露 typed Spine Popup API。

未修改 `assets/minecart2`、game003 业务触发或外部下载资源。

## 主要修改

- `packages/rendercore/src/popup/*`：manifest 联合类型、strict parser、资源闭包、动画校验和新的 `SpinePopupPlayer`。
- `packages/rendercore/src/scene-layout/*`：`spine` binding、package type parity、runtime/presentation accessor、placement/update/destroy。
- `apps/popupeditor/*`：项目类型切换、Spine 资源与动画选择、预览、ZIP round-trip、共享 atlas 导入测试。
- `apps/gamelayouteditor/*`：dependency type、显式注册、placement、预览控制、ZIP vendoring 与重导入恢复。
- `apps/gamelayoutpkgcli/*`：Spine Popup reference rewrite 和 `spine-popup` asset group。
- `packages/gameframeworks/src/index.ts`：普通 Spine Popup public facade。
- README、Popup/Scene Layout schema 文档及三份领域规则已同步。

## 真实输入核对

下载目录包含 Spine 4.3.23 的 `BonusGame.json`、`Compliment.json`、`FreeGames.json`；三份 skeleton 都声明 `Start/Loop/End`，并共享 `Pop_ups.atlas` 与 `Pop_ups.png`。

```text
93302826da048ff358fb20bdbfa1a73f05b1f9af7e2718e81135d3f03dcd8a20  BonusGame.json
82e9776a2f6883e3cb0fbeb824ef8e9420adfaf7704fa4a01ed8683bd2248526  Compliment.json
ea5d3b308650e504b4316938190bfb010518d387dbd8608ca0b725c0a15db462  FreeGames.json
1ab8d757c4714b3833e3297586e7503ed0cf5b1a7df350cbb725944d4ed450ea  Pop_ups.atlas
86dccbfee71da1d6038cbcfe993b9410245a86a1dfd9fa6b870b08285f1bce39  Pop_ups.png
```

## 自动化验收

- 五个目标 package `typecheck`：通过。
- 五个目标 package `build`：通过；Vite 仅报告既有大 chunk warning。
- rendercore：81 files、644 tests 通过，branch coverage 80.15%。
- Popup Editor：4 files、20 tests 通过。
- Game Layout Editor：22 files、171 tests 通过。
- Game Layout Package CLI：6 files、19 tests 通过。
- gameframeworks：13 files、87 tests 通过。
- 五个目标 package `format:check`：通过。
- `git diff --check`：通过。

首次联合测试发现两条旧测试未同步现有合同：placement 断言遗漏 `rotation/center`，Popup mock 缺少新增 discriminator。只更新测试数据/期望后，相关 package 全量测试通过，未为此修改生产行为。

## 计划偏差与剩余验收

- 实现未加入 game003 触发或 production assets，符合计划非目标。
- 用户明确表示浏览器验收由用户执行，因此本报告不把 fake runtime、build 或单测记作真实视觉验收。
- 仍需人工确认：真实五文件一次导入得到三个 Spine root；循环中段及 start 阶段点击都在正确 loop 边界进入 End；两个 Popup ZIP 和注册后的 Layout ZIP 导出/重导入无损；未注册 Popup 不进入 Layout ZIP。

HEAD：`e5c7e11f0ffeb649159352f77e46365e77147937`（detached worktree）。未 commit、未 push。
