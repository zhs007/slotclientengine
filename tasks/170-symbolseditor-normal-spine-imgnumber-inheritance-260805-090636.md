# 任务 170 执行报告

UTC：2026-08-05T09:06:36Z

## 结果

- Symbols manifest 新增 shared Normal contract：命名 ImgNumber 使用一个 `spineSlot`，`targets[]` 只表达 non-Spine exact overlay state；value ImgNumber 使用 `tierResources[]` 逐档只保存 JSON，其余 slot/anchor/transform/color/special 配置共享。
- legacy `target`/`targets`、旧 per-tier `text.tiers[]` 与旧顶层 `specialValueImages` 继续解析、物化、编辑和导出；shared/legacy 混写严格失败，正式 `assets/crave` 未修改。
- 命名 ImgNumber 在 Spine、top-level overlay、hidden 间复用同一 renderer/container；同 player、同 shared slot 的 Spine state 切换不再 detach/attach。
- value ImgNumber 使用稳定外层 container；同档改值只调用 `setText()`，跨档替换内部 resource profile但保持外层 object identity，切换前先完成 value/glyph/special closure 校验。
- Symbols Editor 新建配置只显示每档 JSON selector和一张 Normal 共享卡；旧 divergent 数据继续显示 legacy per-tier/逐 state 表单。
- package closure、mapped materializer、Vite generator、Picker/reference graph、ZIP round-trip及文档/领域规则均已同步。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore --filter symbolseditor --filter game002 typecheck`：通过。
- rendercore：87 files，686 tests 通过。
- symbolseditor：10 files，74 tests 通过。
- game002：26 files，190 tests 通过。
- `pnpm --filter symbolseditor build`：通过；仅有既存的大 chunk warning。
- `git diff --check`：通过。
- `assets/**`、`pnpm-lock.yaml` 与 game002 generated resources：无 diff。

## 兼容与实现说明

- legacy exact Spine targets 不会自动扩展到未列出的 state；旧 Crave package仍按原 coverage运行。
- shared slot 会在所有实际 top-level Spine state及所有 value tiers的 skeleton上严格校验；缺 slot直接失败。
- non-Spine 未命中 state只设置同一 instance为 `visible=false`、`renderable=false`，不创建 state副本。
- 跨 value tier 时稳定的是对 Spine 暴露的外层 ImgNumber container；内部 glyph/special children按目标 resource profile重建并由资源池复用纹理。

## 待用户浏览器验收

按用户要求，本次未启动浏览器。待人工确认：

1. 普通 Spine symbol只出现 Normal ImgNumber配置，appear/win/feature的显隐和运动服从 Spine animation。
2. 多档位只逐档选择 ImgNumber JSON，共享 Normal slot/样式，跨 threshold时无重复可见 instance。
3. `spinBlur`、`disabled` 等非 Spine exact target在 direct/hidden间正确切换；旧 Crave ZIP导入、编辑、导出行为不变。
