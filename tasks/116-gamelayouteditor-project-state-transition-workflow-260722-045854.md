# 任务 116 执行报告：Game Layout Editor Project、State 与 Transition Workflow

## 1. 执行现场

- 报告时间：2026-07-22 04:58:54 UTC
- 执行时段：2026-07-22 04:33–04:58 UTC
- repository：`/Users/zerro/github.com/slotclientengine`
- branch：`main`
- 起止 HEAD：`5bfd27ca2b6e394160912b42bc2c47fa30775542`（本任务未提交，HEAD 未变化）
- Node.js：`v24.14.0`（通过 `nvm use 24`）
- pnpm：`10.0.0`
- 开始工作区：仅有用户提供的 untracked 计划文件 `tasks/116-gamelayouteditor-project-state-transition-workflow.md`
- 结束工作区：保留上述计划文件，并新增/修改本报告第 2 节所列任务文件；未 reset、stash、clean 或覆盖其它用户修改。

## 2. 实际修改

- `apps/gamelayouteditor/src/ui/app-shell.ts`
  - 新建项目 dialog 改为 strict select，并处理每次打开重置、禁用创建、取消和确认。
  - 状态 mutation 改为 transaction 成功后再提交 session selection 并重绘。
  - 新增自动 prepare controller：以 project/preview revision、stable source、selected target、edge kind 和递增 token 保护竞态；同一 runtime 内串行 prepare，preview replacement 后启用新的 generation。
  - preview toolbar 与 Transition Inspector 共用同一个同步 `requestGameMode()` 入口。
  - target/project/preview/destroy 失效旧 prepare；尚未开始的已准备 owner 会被取消。
- `apps/gamelayouteditor/src/ui/state-manager-dialog.ts`
  - 新增纯状态管理视图，按 declaration order 输出完整 mode list、initial、selection、背景 readiness 和禁用原因。
- `apps/gamelayouteditor/src/ui/ui-session.ts`
  - 新增不进入 project/manifest/ZIP 的 `PreviewTransitionUiState` strict union。
- `apps/gamelayouteditor/src/ui/transitions-workspace.ts`
  - 移除手动 prepare/cancel/play 产品控件，保留统一“切换到该状态”。
  - 增加中文 preparing/ready/starting/before-switch/after-switch/complete/error 文案；MP4 输出有限 media time、duration 和 fade，缺值显示“等待首帧”。
- `apps/gamelayouteditor/src/styles.css`
  - 增加状态列表、badge、readiness、feedback 和 preview transition status 的必要样式，复用现有色彩与表单控件。
- `apps/gamelayouteditor/README.md`
  - 更新 automatic prepare、single prepared target、trusted-click、media readiness、浏览器缓存和 production iOS 前后台恢复边界。
- `agents.md`
  - 按任务第 10 节更新长期规则：editor 自动准备精确直接边，Spine/MP4 共用单一动作和中文阶段提示，audible play 仍由真实点击同步触发。
- `apps/gamelayouteditor/tests/app-shell.test.ts`
  - 覆盖新建 select、状态 mutation、直接边缺失、Spine 自动准备/完成、MP4 pending prepare 失效、trusted-click 同步调用、play rejection rollback 和 destroy stale completion。
- `apps/gamelayouteditor/tests/state-manager-dialog.test.ts`
  - 新增状态列表、initial、readiness、selection fallback 和禁删原因纯视图测试。
- `apps/gamelayouteditor/tests/transitions-workspace.test.ts`
  - 更新单一转场动作断言，并覆盖中文 MP4 timeline/fade/等待首帧文案。

`packages/rendercore` 未修改；scene-layout v1 schema、owned MP4 path、strict directed edge、media-time fadeStart、blackout 和 runtime player 所有权合同保持不变。

## 3. 新建项目最终行为

- dialog 只有 `data-new-project-mode` 一个 select，选项固定为空、`maximized-focus`、`orientation-focus`。
- 每次打开都重置为空，创建按钮 disabled；change 只改变按钮状态。
- 取消、dialog cancel/Esc 不修改项目；确认只创建所选模式一次。
- 新项目默认 mode id 仍为 `BaseGame`。

## 4. 状态列表与 mutation 顺序

- dialog 直接读取 `project.gameModes.modes`，按声明顺序显示全部状态。
- readiness 只检查当前 adaptation 的每个 active variant 是否绑定到仍存在的 background node；symbols/popup 为空不影响 readiness。
- 新建与重命名使用独立输入；失败保留输入与 selection，显示 command 原始错误，不修名、不追加 `-2`。
- `runTransaction()` 返回 boolean。只有 command 成功后才更新 `#selectedGameMode`，随后重绘顶部 selector、workspace 和仍保持打开的 dialog，避免同步 store emit 使用旧 selection。
- 新建后立即选中新状态；重命名后 selection 跟随；设置 initial 后 badge 立即移动；删除后明确选择仍存在的 initial。
- 唯一 mode 或当前 initial mode 的删除按钮 disabled，原因在 dialog 内可见。

## 5. 转场准备与 trusted click

- selected preview target 是唯一 prepare 目标；只准备精确的 `<stable source> → <selected target>` 直接边。
- target 等于 source 时不准备；缺边显示明确中文诊断；preview/edge 不完整时保留 strict 原始错误。
- prepare identity 同时包含 preview generation、project revision、source、target 和 kind。target 变化时旧 token 失效；同 runtime 的后继 prepare 串行，preview rebuild 使用新 generation，不被旧 pending prepare 阻塞。
- prepare 成功后严格核对 runtime snapshot 的 stable source、`preparedTargetMode` 与 `transitionKind`，匹配后才进入 ready 并启用按钮。
- toolbar 和 Inspector 的 click listener 都直接调用同一个非 async `requestPreviewMode()`；该方法在任何 await/microtask/timer 之前同步取得 `preview.requestGameMode()` 返回的 Promise。
- MP4 原生 `play()` Promise pending 时 UI 仅显示 starting，runtime 仍保持 stable source；reject 时显示原始错误，并由 runtime 释放 prepared owner，不静音、不瞬切、不自动播放。
- active transition 只按 runtime snapshot/rAF 更新 before-switch、after-switch、media time 和 fade；不使用 UI timer 假完成。

## 6. MP4 “已下载 / media ready / scene ready”定义

- 已下载：layout ZIP/CDN 中精确 owned MP4 bytes 已取得。
- media ready：浏览器已创建并配置 video element，设置 URL/`preload=auto`，等待 readiness，并用真实 metadata 校验 duration、尺寸和 fade 边界，同时创建 Pixi video presentation。
- scene ready：目标 mode 的 reel/catalog/scene owner 和相应请求输入已完整准备。
- editor 的 ready 同时要求 media ready 与 target scene ready；浏览器是否继续保留整段 HTTP/media/GPU cache 不属于此状态，也不作永久承诺。

## 7. 自动验收

实施前基线：

- `pnpm --filter gamelayouteditor test`：18 files / 138 tests passed。
- `pnpm --filter gamelayouteditor typecheck`：passed。
- `pnpm --filter gamelayouteditor lint`：passed。

最终结果：

- `pnpm --filter gamelayouteditor test`：19 files / 143 tests passed。
- `pnpm --filter gamelayouteditor typecheck`：passed。
- `pnpm --filter gamelayouteditor lint`：passed。
- `pnpm --filter gamelayouteditor build`：passed；仅保留既有的大 chunk warning。
- `pnpm --filter gamelayouteditor format:check`：passed。
- `git diff --check`：passed。

由于未修改 `packages/rendercore`，未追加运行 rendercore 全套命令；gamelayouteditor typecheck/build 的 `prepare:deps` 已成功构建 rendercore 及其依赖。

## 8. 浏览器与真机验收状态

按用户要求，最终浏览器验收由用户执行，本次没有启动浏览器，也没有把 DOM/fake runtime 自动测试写成真实浏览器通过。

- Spine：自动测试已覆盖 automatic prepare、单一同步点击、before-switch、after-switch、complete 和 Inspector lock；真实 Pixi/Spine 浏览器播放待用户验收。
- 带声音 MP4：自动测试已覆盖 preparing/ready、pending target change、stale cancel、同步 click request、play rejection 保持来源和 destroy 后不回写；真实音画、fadeStart、contain/black fill 待用户验收。
- iOS Safari：连续两次播放、切后台/回前台、`play()` rejection 和“点按继续”入口均未执行，必须由真机记录。当前 editor 没有复制 runtime resume API；这是 production follow-up 证据采集项。

## 9. 已知限制与后续工作

- 自动 prepare 只拥有一个精确 target owner，不并行预热多个完整 scene。
- 多目标 media-only pool、persistent media element、内存预算、淘汰与 iOS resume API 不属于任务 116。
- 复用已成功启动的 media element 只能提高连续播放可靠性，不能替代每次 `play()` Promise 的错误处理。
- 浏览器手工验收完成前，不宣称所有浏览器、带声音 MP4 或 iOS 真机已通过。

## 10. 结束工作区状态

任务修改与新增文件均未提交；原始计划文件继续保持 untracked。最终 `git status --short` 应包含本报告、两个新增 UI/test 文件、计划文件及第 2 节列出的 tracked 修改。
