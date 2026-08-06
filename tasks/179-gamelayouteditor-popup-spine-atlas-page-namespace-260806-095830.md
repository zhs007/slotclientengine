# 179 Game Layout Editor Popup Spine atlas page namespace 执行报告

## 结果

代码、文档和定向自动化验收已完成；真实浏览器验收按用户要求交由用户执行。

Popup package 的 flatten/namespace 现在只改物理 filename key 和 manifest path value，不再改写
Spine atlas 文本中的 page logical name。以 `fg` 为例，texture bytes 仍物化为
`pkg-2-fg-BG.png`、`pkg-2-fg-BG_2.png` 等独立 key，但 atlas page 与 `textures` key 继续保持
`BG.png`、`BG_2.png`，因此仍满足 strict exact page closure。

Popup 导入还会在 namespace 前比较 Popup 与 Layout 自有 Spine 的 atlas/texture filename：同名但完整
SHA-256 不同时，导入审查列出双方 resource、filename 与 hash。用户取消时不提交 dependency；确认时保留
Layout 现有资源，并继续把 Popup 作为独立 package 导入。该流程不自动覆盖、改名或检查 skeleton JSON
是否兼容另一组 atlas/texture。

## 主要修改

- `packages/rendercore/src/popup/package-resource.ts`
  - 移除 flatten 与 namespace 对 atlas page 文本的 filename mapping。
  - 保留既有 manifest Spine skeleton/atlas/texture path value mapping，以及 texture logical page key。
- `apps/gamelayouteditor/src/io/imported-popup-package.ts`
  - 从 namespace 前的已验证 Popup closure 收集 Spine atlas/texture 与完整 SHA-256。
  - 新增与 Layout-owned Spine assets 的同名、同 kind、不同 hash 冲突比较。
- `apps/gamelayouteditor/src/ui/app-shell.ts`
  - Popup dependency 提交前执行冲突审查。
  - 冲突提示提供取消整次导入和明确继续隔离导入两种结果；取消路径不修改 store。
- 测试覆盖多页 Spine namespace、转换后 production prepare、真实 mismatch 仍拒绝、相同 bytes 不提示、
  不同 bytes 提示，以及取消/继续导入行为。
- 同步 Game Layout Editor README 与 `editor-artifacts.md` 稳定合同。

## 自动化验收

通过：

- RenderCore 定向测试：1 test file，9 tests。
- Game Layout Editor 定向测试：4 test files，67 tests。
- RenderCore typecheck：通过。
- Game Layout Editor typecheck：通过。
- RenderCore 与 Game Layout Editor 修改文件定向 ESLint：通过。
- 修改文件 Prettier：通过。
- `git diff --check`：通过。

依赖使用 `CI=true pnpm install --frozen-lockfile` 安装，Node 使用桌面运行时提供的 Node 24；
`pnpm-lock.yaml` 未修改。未运行整仓验收。

## 范围与偏差

- 未修改 Spine strict runtime validator；真实 atlas/texture page mismatch 仍显式失败。
- 未修改 Popup Editor schema、导出格式、Scene Layout transition schema 或 Popup 播放时序。
- 未复制 `layout3.zip`、`fg-popup.zip` 到仓库；自动测试使用最小多页 Spine fixture。
- 为满足 `ImportedPopupPackage` 新增的导入审查元数据，补充了既有 command test fixture；无生产模型或
  layout manifest 字段变化。

## 浏览器反馈跟进

用户在浏览器复验时发现转场 Popup 进入 loop 后，点击预览 Canvas 不会播放 end，转场因此无法继续。
已把 pointer 处理补到 RenderCore Scene Layout package runtime 的共享 Popup presentation：

- active transition prelude 或 award celebration 时，以当前 viewport 作为 Pixi hit area 接收
  `pointerdown`；idle 后立即恢复 `eventMode=none`，不拦截普通画面点击。
- transition prelude 点击锁存普通 Spine Popup 的 end 请求；Popup complete 后继续原 none/Spine
  transition。
- video prelude complete 后保持 active pointer layer，第二次 trusted pointer 同步启动等待中的视频。
- award celebration 的 Canvas pointer 复用既有 advance 状态机。

跟进验收通过 RenderCore 3 个定向 test files、25 tests，以及 RenderCore typecheck 与定向 ESLint。
Editor 不新增按钮或私有点击阶段判断；预览 Canvas 与游戏 consumer 共用 RenderCore interaction。

## 浏览器验收交接

请在浏览器按以下步骤复验：

1. 打开 `/Users/zerro/Downloads/crave/layout3.zip`。
2. 导入 `/Users/zerro/Downloads/crave/fg-popup.zip`。
3. 若出现同名不同 SHA-256 审查，先验证“取消”后 Popup 未进入 dependency library；再重新导入并确认继续。
4. 在 `BG -> FG` 转场选择 `fg`，确认不再出现 `Spine atlas page contract changed`。
5. 触发转场，确认 Popup 仍完整执行 start→loop→end 后再继续原转场。

## 基线

- HEAD：`d89fcf33d4e1e07debfe187d0479c7ddb1f13ed3`
- UTC：`2026-08-06T09:58:30Z`
- detached worktree；未 commit、未 push。
