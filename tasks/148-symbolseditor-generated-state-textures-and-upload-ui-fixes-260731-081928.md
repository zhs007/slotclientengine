# 任务 148：Symbols Editor 状态贴图生成与上传/滚动修复执行报告

## 结果

任务已完成。Symbols Editor 仍是无服务器纯前端页面；每个 symbol 仅在可用的 direct
normal image 页面显示“生成模糊图”和“生成 disable 图”两个独立按钮。生成、目标 state
“上传并使用”和 ZIP 导出共用既有 filename-key 事务与正式资源 closure，没有新增后端、
远程处理、依赖或 lockfile 修改。

## 实现

- `rendercore` 新增 versioned 单一 preset 与浏览器安全的 RGBA transform；现有
  Node/Sharp 生成器读取同一 preset。模糊为 `3 × 21` vertical box blur，disabled 为
  Rec.709 grayscale 后乘 `0.72` brightness，均保留尺寸与 alpha。
- Symbols Editor 用浏览器原生解码、Canvas/OffscreenCanvas 和 PNG 编码，只处理当前
  symbol 的一个目标 state。layered、Spine/VNI、tiered、空引用和无效图片会明确禁用。
- 生成或手传成功后以 review 返回的 resolved key 原子绑定目标 state；同一 state
  后一次成功操作生效，失败、取消或 stale 请求不会覆盖已有结果。
- Picker 的目标 state 上传改为“上传并使用”；普通上传仍只入库。所有普通资源来源复用
  prepare/review/commit coordinator，并在每次打开 file input 前清空旧值。
- state 导航保存并恢复双轴滚动位置；用户选择、新增、删除或切换 symbol 后，选中 state
  使用 nearest visibility 回到可见区域。
- 新增生成、事务、ZIP closure/reimport、上传顺序和 UI 滚动回归测试，并同步 README
  与领域规则。

## 自动验收

- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- rendercore 定向 Vitest：2 个 test files、14 个 tests，通过。
- `pnpm --filter symbolseditor typecheck`：通过。
- Symbols Editor 定向 Vitest：5 个 test files、40 个 tests，通过。
- `pnpm --filter symbolseditor build`：通过；仅有既有的单 chunk 大于 500 kB 提示。
- `git diff --check`：通过。

测试覆盖两个按钮互不连带、preset 像素语义与 alpha、生成/手传顺序、resolved key
绑定、rollback/stale、状态滚动、ZIP exact closure 及导出后重导。

## 真实浏览器验收

在 Chromium 中载入公开 gameconfig 和本地 `H1.png`，完成 normal 绑定后：

1. 单独点击“生成模糊图”，只新增并绑定 `H1.spinBlur.png`。
2. 单独点击“生成 disable 图”，新增并绑定 `H1.disabled.png`。
3. 在 disabled Picker 中上传 `H2.png`，立即改为该资源；返回 normal 再次生成
   disabled 后，绑定恢复为后一次生成的 `H1.disabled.png`。
4. 在 normal、spinBlur、disabled 间切换，选中项始终滚动到状态条可见区域；实测
   normal 被选中后 `scrollLeft` 回到 `0`。
5. 浏览器预览成功显示生成后的灰度资源，页面操作未使用网络上传或远程图片处理。

## 边界

- 不批量生成全部 symbols，不从 layered、Spine/VNI 帧或 value tier 推导图片。
- 生成按钮只存在于 normal 状态；用户仍可在 spinBlur/disabled state 中上传自制图片。
- 无引用的旧 bytes 保留在编辑草稿中，由 production ZIP exact closure 自动排除。
