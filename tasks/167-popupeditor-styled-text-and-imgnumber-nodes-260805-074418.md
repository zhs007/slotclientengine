# 167 Popup Editor 系统文字与 ImgNumber 节点执行报告

## 结果

任务 167 已完成代码、自动化验收与文档更新。浏览器视觉验收按用户要求由用户执行，本报告不把该项标记为已通过。

执行基线：

```text
UTC: 2026-08-05T07:44:18Z
HEAD: 4e9705610c2fe17a1987b3d490b15a27a71325dd
branch: detached HEAD
```

## 实现

- Popup v1 增加命名 `text` 与 manual `image-string` layer/overlay；award 每档继续严格要求一个 `win-amount`，普通 Spine 禁止金额 binding。
- 系统文字保存 package font、单行默认 string、字号、字距、纯色/线性渐变、描边、投影、anchor、rotation、segment 与 `-180..180` 度弧排。直排使用整行 Pixi Text；曲排按 Unicode grapheme 和字体测量 advance 排布，沿切线旋转，并以共享 global gradient 保持跨 glyph 连续。
- 新增稳定 string-node registry。两类 player 都公开 `textNodes`、`imageStringNodes`、`getTextNode(name | index)` 与 `getImageStringNode(name | index)`；handle 支持原子 `setText()` / `resetText()`、持久 override、销毁保护和 strict selector。
- award 同名节点按 base→standard→bigwin→superwin→megawin 首次出现确定 index，并在 active tier 切换时重绑 variant；`win-amount` override 不停止 raw 计数，reset 恢复当前 formatter，snapshot string 与显示一致。
- legacy `spine.prompt` 保持 `start(text?)` 行为，并以保留名 `prompt` 进入 text-node API。
- Popup Editor 可在 award tier 和 Spine overlay 添加系统文字/额外 ImgNumber，编辑全部基础效果与可见 segment；侧栏可按 name 或 kind 内零基 index 临时 set/reset production preview string。
- Popup package resource closure、typed namespace rewrite、Scene Layout/runtime facade、Game Layout Editor、CLI 与 gameframeworks 继续透传新节点；未修改 lockfile、游戏资产或根工具链。

## 测试与验收

以下 L2 命令全部通过：

```text
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks test
  rendercore: 87 files / 677 tests
  popupeditor: 4 files / 21 tests
  gamelayouteditor: 22 files / 173 tests
  gamelayoutpkgcli: 6 files / 20 tests
  gameframeworks: 13 files / 87 tests

pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks build
pnpm --filter @slotclientengine/rendercore --filter popupeditor --filter gamelayouteditor --filter gamelayoutpkgcli --filter @slotclientengine/gameframeworks format:check
git diff --check
```

Build 仅保留仓库既有的大 chunk / ineffective dynamic import 警告，没有构建失败。

新增和扩展的测试覆盖 strict manifest/style、manual ImgNumber、legacy prompt、name/index registry、override/reset、跨 tier variant、formatter snapshot、错误资源/挂载、grapheme 弧排、原子更新、Popup Editor authoring/preview 与 Scene Layout fake public API parity。

## 文档

已更新：

- `docs/popup-manifest.md`
- `apps/popupeditor/README.md`
- `packages/rendercore/README.md`
- `docs/agent-rules/editor-artifacts.md`
- `docs/agent-rules/shared-game-runtime.md`
- `docs/agent-rules/scene-layout.md`

## 偏差与待验收

- CLI 的 typed Popup reference rewriter 原先只改写 Spine 主资源，未同步 prompt font 和 overlay resource；本任务已修正，并用 award/Spine 的 text 与 manual ImgNumber fixture 证明 resource id 改写时 name、style/default string 保持。Game Layout Editor 与 gameframeworks production source 无需修改，也没有新增旁路资源表。
- 浏览器验收未执行。需由用户用真实字体、ImgNumber、Spine/VNI 检查正/零/负弧度、渐变连续性、描边/投影、长短及中英文 string、跨档 variant、win-amount override/reset、导出重导和旧 Popup 兼容。
- 曲排按 grapheme 分 Text，复杂 joining script 不保证具备直排整行 shaping 的连写能力；直排路径仍保留整行 Text。
