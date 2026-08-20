# 233 gamelayouteditor-programmatic-popup-imgnumber 执行报告

## 结果

任务 233 已完成。Game Layout Editor 现在允许未被 Scene、mode 或 transition 直接引用的 ImgNumber 与三类 Popup
显式进入 production；Editor 只为实际导出的 owner 显示由任务 228 shared formatter 生成的 canonical 地址。
RenderCore Scene Layout package runtime 新增统一 Popup open/close/session，并以一个 active slot 排斥程序 Popup、
mode award 与 transition prelude 的叠加。

执行基线：

```text
UTC report: 2026-08-20T09:26:44Z
HEAD: babcb8643cc642af02968e6216a181f240dae4a0
branch: detached HEAD
```

## 已实现

- ImgNumber 继续使用现有 `runtimeResources` typed binding；绑定程序键后，资源详情显示并复制
  `gamelayout:/resource/image-string/<key>`，未绑定时不显示不存在的程序工厂地址。
- Popup authoring draft 从仅 Spine/single-state 的独立注册改为三类型通用 `programmaticPopupIds`。没有直接引用的
  award-celebration、Spine、single-state 都可显式保留到顶层 `popups`，导出重导后确定性恢复。
- Scene Layout parser 不再把未被 gameModes 引用的顶层 award Popup 判为 orphan；顶层 `popups` 自身成为程序可达目录，
  未进入该目录的 dependency 仍严格不可访问。没有新增 schema 字段或 manifest version。
- `SceneLayoutPackageRuntime` 与 presentation surface 新增 `openPopup()`、`closePopup()`、
  `getActivePopupAddress()`；gameframeworks re-export typed request/session/options。
- open 通过 exact `gamelayout:/popup/<id>` resolver、binding type 与 typed input 做 mutation 前校验。任一 Popup active
  时第二次 open、mode award 或 transition prelude 显式失败，不替换、不排队、不叠加。
- 正常 close 会锁存到各类型正式 dismiss/end 完成；immediate close 用于明确取消/cleanup。session 的 `finished`
  在正常/立即关闭时 resolve、runtime destroy 时 reject。每个 binding 继续复用 init 时创建的唯一 package-owned player。
- Editor Popup preview、主交互、立即关闭、active 状态和地址显示改走统一合同；Popup root/deep、transition 与程序资源
  共用 address markup/copy helper，不再手拼地址。
- README、manifest/runtime address 文档与三个领域规则已同步；Game Layout Editor README 和 runtime address 文档均给出
  ImgNumber + Popup 的操作与代码例子。

## 与计划的实现差异

- Popup coordinator 直接并入 `package-runtime.ts`，没有新增 `popup-coordinator.ts`。三类 player 仍共享同一 active 账本、
  completion waiter 与 closing latch，没有复制三套协调状态。
- 为兼容已有 editor/diagnostic seam，raw `get*Popup()` 暂未硬删，已标记 deprecated；仓库内新的 preview 和 production
  facade 均使用统一 open/close。
- `package-runtime-mode` 的 transition event 断言改为验证正整数 sequence，而不是写死 `1`；runtime address sequence
  是同一 resolver 内的全局 FIFO，初始化音频 lifecycle 可能先占用序号。

## 自动验收

```text
PASS  pnpm --filter @slotclientengine/rendercore exec vitest run
      tests/scene-layout/manifest.test.ts
      tests/scene-layout/package-runtime.test.ts
      tests/scene-layout/package-runtime-mode.test.ts
      tests/scene-layout/presentation-surface.test.ts
      tests/scene-layout/runtime-address.test.ts
      5 files, 70 tests passed

PASS  pnpm --filter gamelayouteditor exec vitest run
      tests/game-mode-commands.test.ts tests/popup-package.test.ts
      tests/validation.test.ts tests/zip-io.test.ts
      tests/ui-markup.test.ts tests/app-shell.test.ts
      6 files, 108 tests passed

PASS  pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/exports.test.ts
      1 file, 1 test passed

PASS  typecheck: @slotclientengine/rendercore, @slotclientengine/gameframeworks,
      gamelayouteditor, game002v2, game003v2

PASS  pnpm --filter @slotclientengine/rendercore --filter @slotclientengine/gameframeworks
      --filter gamelayouteditor build

PASS  git diff --check
```

`gamelayouteditor` build 保留既有 dynamic-import 与大 chunk warning，但构建成功。执行前按仓库规则使用
`CI=true pnpm install --frozen-lockfile` 恢复依赖；`pnpm-lock.yaml` 和 workspace 配置未修改。

## 待用户完成的浏览器例子

1. 导入一个 ImgNumber ZIP，在资源行填写程序键 `win-amount`，点击“设为程序资源”，展开详情复制
   `gamelayout:/resource/image-string/win-amount`。
2. 导入一个没有绑定 mode/transition 的 Popup ZIP，在 Popup 工作区点击“设为程序 Popup”，确认出现
   `gamelayout:/popup/<popup-id>`；点击“打开 Popup”后状态区显示同一地址。
3. Popup active 时再次点击打开，应明确报 active 冲突；点击“立即清理”后，用同一地址再次打开应成功且不叠层。
4. 导出并重新导入 ZIP，确认 ImgNumber 程序键、Popup 程序用途、placement/order 和两类地址保持。

浏览器真实渲染与交互验收按用户约定未由本执行会话代跑。
