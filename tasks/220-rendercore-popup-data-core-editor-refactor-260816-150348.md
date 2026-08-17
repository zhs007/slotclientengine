# Task 220 RenderCore Popup data/core/editor 重构执行报告

## 基线与范围

- UTC：2026-08-16T15:03:48Z
- HEAD：`b612e524a9f4bcbc838069ce25e3c1c7fb28a23c`
- 按 L2 修改 RenderCore Popup public contract、Scene Layout、gameframeworks、Popup Editor、Game Layout
  Editor 与 gamelayoutpkgcli。
- 未修改 Crave 源码、资源或配置；手工同步说明见
  `docs/crave-task220-popup-layer-migration.md`。

## 完成结果

- package public export 只保留 `popup/data`、`popup/core`、`popup/editor`；移除旧 `popup` export 与
  rendercore root Popup wildcard。
- data 独立拥有 v1–v6 authored types、strict parser、纯 attachment/path/closure、amount/visibility 与
  `loadPopupManifest()`。默认入口先 strict source validate，再规范化并复验为 latest v6，返回
  `sourceVersion`；v1–v6 表驱动测试和未知 v7 失败已覆盖。
- core public allowlist 收紧为 resolved-resource prepare、award/Spine Runtime、command/query/string handle、
  viewport/input binding 与生命周期类型；不导出 mapped package、editor snapshot、presentation/attachment/
  text/font raw helper、Application、RAF 或 editor workspace。
- editor 组合 data/core，拥有 mapped package resolve、flatten、namespace、URL loader、standalone prepare
  validation、font validation与同 Core snapshot player wrapper。
- Scene Layout/gameframeworks 迁移到 data/core；Popup Editor 与 Game Layout Editor 的 standalone IO 使用
  editor；Game Layout Editor 画面仍只由 Scene Layout runtime/inspector 拥有；CLI 只使用 data。
- 仓库 TypeScript/JavaScript consumer 已无旧 `@slotclientengine/rendercore/popup` import。

## Runtime 性能与内存

- `update()` 继续返回 void，不在 ticker 构造 snapshot；完整 snapshot 只由 editor wrapper按需生成。
- tier/layer/order/variant/string/attachment runtime 在 init 阶段建立有限 Map/数组并在 replay 复用；稳定帧
  不重新扫描或排序 manifest。
- 缓存最后 automatic amount；整数金额不变时不再调用 formatter、string registry 或 amount renderer。
- animated loop-ready 检查改为单次无分配循环；ending tier drain 改为数组原地压缩，不再逐帧创建
  `filter`/remaining 数组。
- 新增 `benchmark:popup` 与结构测试。当前 Node 观测值：100,000 个稳定 `update(0)` 用时 7.658 ms，
  formatter 0 次、amount commit 0 次、layer 创建 0 次（init 后）；约 13.06M updates/s。该 wall-clock
  仅为本机观测，不作为跨机器 gate；浏览器 Performance/Memory 仍由人工验收。
- resolved resource 保持全失败 rollback、owned Texture/font/Object URL/nested ImgNumber 释放与幂等
  destroy；core 不接触 assets-map/editor workspace。

## 自动验收

- 5 个直接 package/app typecheck：通过（rendercore、gameframeworks、popupeditor、gamelayouteditor、
  gamelayoutpkgcli）。
- RenderCore Popup + Scene Layout 定向测试：18 files / 189 tests 通过。
- Popup Editor 本任务相关 app-shell/preview/project：3 files / 26 tests 通过。
- Game Layout Editor 除已知 production fixture 用例外：23 files / 194 tests 通过；完整测试为
  195/197，通过项之外的 2 项在读取测试数据时失败：Crave 缺
  `symbol-state-textures.manifest.json`、Minecart2 缺 `gameconfig.json`，未进入本任务代码路径。
- Popup Editor 完整测试为 30/34；4 项共同因既有 Minecart2 fixture map 缺
  `big_win0721.json` 在读取测试数据时失败，未进入本任务代码路径。该基线也见 task 191/195/207
  报告。
- gamelayoutpkgcli：6 files / 25 tests 通过。
- rendercore、popupeditor、gamelayouteditor build：通过；仅保留既有 Vite chunk size / dynamic import
  warning。
- `git diff --check`：通过；未修改 lockfile、production assets 或 Crave。

## 人工验收与未完成项

- 按用户要求未代替用户执行浏览器验收。Popup Editor v1–v6 导入/播放/导出、Game Layout Editor
  standalone dependency/Scene Layout preview，以及连续 50 次 rebuild/replay/destroy 的 Performance、
  Memory 与视觉复验由用户完成。
- 无 schema/wire 版本变化；latest 仍为 v6。未知未来版本继续显式失败。
