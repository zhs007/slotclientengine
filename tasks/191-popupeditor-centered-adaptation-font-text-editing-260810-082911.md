# 191 Popup Editor 居中适配与字体文字编辑执行报告

## 结果

任务于 `2026-08-10T08:29:11Z` 完成代码与自动化验收。按用户约定，真实浏览器验收留给用户执行。

- Popup v2 的 focus visible rect 改为等比 contain 到目标 viewport，并把多余空间对称分配；`1080x1920 -> 1920x1080`、`2000x2000` 均有精确矩阵测试。
- authored 中心 `(0,0)`、focus guide 与 host placement 共用一套 production transform；全屏 backdrop 继续独立覆盖 viewport。
- Preview canvas 改为透明并由宿主提供 preview-only 渐变参照底；该背景不进入 project、manifest、资源闭包或 runtime。
- 删除 Popup Editor 的 prompt preview、文字节点 kind/name/index、Set/Reset，以及对应 `PopupPreview` session API；Spine Play 只调用 production `start()`。
- 新 v2 authoring 删除“启用提示”，统一为命名的“字体文字”层。v1 prompt 保持原版本 round-trip；旧 v2 prompt 导入或 v1 显式升级时迁移为 `name=prompt` 的 text overlay，名称/order 冲突时原子失败。
- 字体文字可在系统字体与已导入 font resource 之间明确选择；缺失或错误类型的显式资源严格失败，不静默降级。
- 文字颜色提供原生色板与同字段 string 输入；Curved Text 提供开关和 `-180..180` 角度输入，继续复用 rendercore grapheme 弧排。
- 标量输入不再重绘整个 inspector；自动 preview rebuild 不抢焦点，失败只更新 diagnostics 并保留当前 canvas。prepare 失败会释放临时 player/resource。
- rendercore 既有 exact-name `getTextNode(name).setText()/resetText()` 合同继续作为游戏绑定入口，不复制第二套 registry。

## 主要文件

- `packages/rendercore/src/popup/presentation.ts`：centered-contain focus 到 viewport 矩阵。
- `packages/rendercore/src/viewport/focused-art-viewport.ts`：接近 art 上界的浮点投影收敛，避免严格边界误判。
- `apps/popupeditor/src/model/project.ts`、`src/io/popup-zip.ts`：canonical v2 prompt 禁止导出与 legacy prompt 结构化迁移。
- `apps/popupeditor/src/ui/app-shell.ts`：字体文字、font selector、颜色、Curved Text 与不重绘的标量事务。
- `apps/popupeditor/src/preview/popup-preview.ts`、`src/styles.css`：移除临时文字覆盖、渐变参照底与失败资源回收。
- `docs/popup-manifest.md`、相关 README 和领域规则：记录 centered-contain、字体文字与 legacy 边界。

## 验收证据

通过：

```text
@slotclientengine/rendercore targeted
  2 files / 21 tests passed
@slotclientengine/rendercore full
  93 files / 775 tests passed
popupeditor targeted
  3 files / 22 tests passed
@slotclientengine/rendercore typecheck
popupeditor typecheck
@slotclientengine/rendercore lint
popupeditor lint
popupeditor build
git diff --check
```

Popup Editor 全量测试为 `26/30` 通过；4 项失败都在 `tests/resource-import.test.ts`，共同原因是当前 fixture map 不包含 `Minecart2` 的 `big_win0721.json`，失败发生在测试数据读取阶段，未进入本次修改路径。

Game Layout Editor 的 Popup package/ZIP 定向测试为 `25/26` 通过；唯一失败发生在既有 multi-page Spine fixture prepare，fixture 请求的 `start` animation 不存在。该失败先于 popup presentation，并与本次 centered-contain、文字 UI 和 prompt 迁移无关。

Popup Editor production build 通过，仅有既有的主 chunk 大于 500 kB warning。

## 浏览器待验

由用户执行以下真实浏览器验收：

- 默认 `1080x1920` focus 在 `1920x1080` 中完整可见并水平/垂直居中。
- `2000x2000` 与自定义 viewport 的留边对称，中心十字、focus guide 和内容位置一致。
- 渐变底经过 50% 黑色 backdrop 后仍能辨认全 viewport 覆盖与透明度。
- 播放中的黑色/非黑色 preview 下连续编辑字号、描边、阴影、颜色、字体、文案和弧度，不丢焦点、不重置输入。
- 实际字体文件选择、切回系统字体、exact-name 游戏文字覆盖，以及 legacy prompt 样本迁移结果。

未修改 `assets/**`、workspace 依赖或 lockfile。
