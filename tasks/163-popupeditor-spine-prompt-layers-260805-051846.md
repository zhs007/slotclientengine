# 163 Popup Editor Spine 提示文字与叠加层执行报告

## 结果

任务已完成代码与 L2 自动化验收。普通 Spine Popup v1 现在可选声明单行 `prompt` 与有序 `overlays`：游戏可调用 `SpinePopupPlayer.start(translatedText?)` 传入已翻译字符串，省略时使用 package 默认文案；文字使用 package-owned 字体并按配置区域等比缩小，不换行，进入 end 时隐藏。

overlay 支持 image、official Spine 与 runtime VNI，可配置位置、缩放、旋转、order，以及各自的 segment/playback。旧的无 prompt、无 overlay Spine Popup 仍保持合法，原 start → loop → end 点击边界不变。

Popup Editor 已支持 WOFF2/WOFF/TTF/OTF 导入、prompt/overlay 编辑和临时预览文案。Game Layout Editor 将内部配置保持只读，只增加临时预览字符串并继续 vendor 完整 Popup closure。CLI 透传字体且只结构化改写 typed 引用；gameframeworks 通过既有 facade 暴露更新后的 public player 类型。

## 主要修改

- `packages/rendercore/src/popup/*`：扩展 strict manifest/resource union，新增 FontFace hash/ref-count owner、单行区域 fit、image/Spine/VNI overlay runtime，并接入 Spine Popup player。
- `apps/popupeditor/*`：字体发现与 magic 校验、prompt draft/UI/ZIP round-trip、三类 overlay authoring、默认与临时预览文案。
- `apps/gamelayouteditor/*`：新 Popup 的字体 media type、只读提示文案预览、production ZIP vendoring/reimport。
- `packages/editorresource`：四种字体 media type/扩展名合同；相同字体 bytes 保留不同 logical key，但 map 指向同一 SHA-256 payload。
- `apps/gamelayoutpkgcli`：Popup font typed rewrite、root/reference 与 fixture media parity。
- Popup/Scene Layout 文档、相关 README 和三份领域规则已同步。

## 资源与生命周期

- 字体在加载前校验扩展名与 WOFF2/WOFF/TrueType/OpenType signature。
- runtime 对完整 bytes 求 SHA-256，以 digest + format 复用同一个并发 FontFace Promise；最后一个 package owner destroy 后从 `document.fonts` 移除。
- family chain 为 package family + `sans-serif`；不扫描 glyph、不实现语言分支，缺 glyph 时交给浏览器正常 fallback。字体本身加载失败仍显式失败。
- prompt 与 overlay order 全局唯一，主 Spine 固定为底层；主 Spine completion 仍是 Popup complete 的唯一权威。
- `assets.map.json` 的字体去重测试证明两个 logical WOFF2 key 使用相同 hash/path，物理 payload 仅一份。

## 自动化验收

以下计划指定命令均通过：

- 六个目标 package `test`：通过。
  - editorresource：2 files、38 tests。
  - rendercore：84 files、662 tests；全局 branch coverage 80.05%，popup branch coverage 80.94%。
  - Popup Editor：4 files、21 tests。
  - Game Layout Editor：22 files、173 tests。
  - Game Layout Package CLI：6 files、19 tests。
  - gameframeworks：13 files、87 tests。
- 六个目标 package `typecheck`：通过。
- 六个目标 package `build`：通过；Vite 仅报告既有大 chunk/dynamic import warning。
- 六个目标 package `format:check`：通过。
- `git diff --check`：通过。

## 浏览器验收（待用户验收）

用户明确负责浏览器验收，因此下列项目未以 fake metrics、单测或 build 冒充已通过：

1. Popup Editor 导入 task 161 Spine、真实 WOFF2 和背景图，分别播放默认/长临时文案，确认单行居中、不越区，图片 rotation 正确。
2. 完整检查 image、Spine、VNI overlay 的 start/loop/end 与点击收尾顺序，以及 prompt 进入 end 时隐藏。
3. 用字体未覆盖字符确认浏览器本地 glyph fallback；导入破损字体确认原子失败。
4. Popup ZIP 导出/重导确认字体、默认文案、区域、overlay、transform/playback 与 bytes 无损；旧 task 161 ZIP 继续无 prompt 正常播放。
5. Game Layout Editor 导入两个共享相同字体 bytes 的 Popup，验证默认/临时文案、最终 map 同 hash/path、物理字体 payload 一份及重导播放。

## 偏差与剩余风险

- 自动化使用注入字体 loader 与文字 metrics，不能证明不同浏览器/平台的真实像素和 fallback 字体选择；这部分保留为上述用户验收。
- 未增加 i18n、字体子集化/转码、glyph 检测、多行、手工字号、stroke/shadow 或游戏业务触发，符合计划非目标。
- 构建产物 chunk size warning 为既有项目警告，本任务未扩大构建配置范围。

基线 HEAD：`38ccd2a4f5c2aa864fa8b30c53c3f5d91835dc01`（detached worktree）。未 commit、未 push。
