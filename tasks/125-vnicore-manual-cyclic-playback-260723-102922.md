# Task 125 执行报告：vnicore 手工阶段编排与连续周期选择播放

## 结论

任务125的代码、自动化测试、类型检查、lint、构建、格式检查、真实 Bamboo ZIP core 数学验收、文档和示例已完成。按用户要求，本次没有代替用户执行最终浏览器人工验收；因此 desktop/窄屏实际像素尺寸、真实画面观感、20 轮浏览器资源观察仍标记为待用户验收，未虚报为已完成。

## 基线与环境

- UTC 报告时间：`2026-07-23 10:29:22`
- 基线 commit：`ed084a2061b6a4f66123750657afc3c4a61359cf`
- 基线显示：`ed084a2 (HEAD, main) Implement new feature for user authentication and improve error handling`
- 初始 worktree：detached HEAD，`git status --short --untracked-files=all` 为空；没有用户未提交修改需要避让。
- Node：`v24.14.0`
- pnpm：`10.0.0`
- 执行了 `pnpm install --frozen-lockfile`；首次 sandbox 网络访问返回 `EPERM`，批准联网后从现有 store 完成安装。
- 未使用代理。
- `pnpm-lock.yaml` 未变化。

## 真实样本复核

- 文件：`/Users/zerro/Downloads/bamboo4 (pixi).zip`
- SHA-256：`8ba263e5823209c65bd23d0500b29f24364dbaeedb2db584d7a67a2285dcb44e`
- schema：`VNI_0.103`
- profile/project：`runtime_100/runtime_100/bamboo4.json`
- stage：`2000 x 2000`，duration `10s`
- animation：`layer_image_mrtos52v_5/anim_module_mrtosrk3_6`
- type：`card_carousel_3d`
- carrier：`13`
- authored target：`0`

真实 ZIP JSON 通过已构建的 `assertVNIProject()`、`prepareCardCarousel3D()` 与 dynamic resolve public core 执行。证据：

| continuous 秒数 | continuous unwrapped turns | final turns | target | alignment error turns |
| --------------: | -------------------------: | ----------: | -----: | --------------------: |
|               0 |                       0.15 |           6 |      0 |                     0 |
|             1.5 |                       0.30 |           7 |      0 |                     0 |
|             4.5 |                       0.60 |           7 |      0 |                     0 |
|              10 |                       1.15 |           7 |      0 |                     0 |

慢速时长改变真实路径但不改变 authored target，最终 modulo 对齐误差为 0。

## 实际实现

### Core 数学

新增 `packages/vnicore/src/core/cyclic-selection.ts`：

- 使用 unwrapped turns 累计 continuous phase，不按 `demoIdleDuration` 回绕。
- direction-aware modulo。
- 固定 carrier offset。
- dynamic resolve plan。
- stop overshoot/easing。
- exact carrier alignment。
- finite、carrier count/index、rounds 和状态严格校验。

`card-carousel-3d.ts` 保留原 `sampleCardCarousel3D()` legacy wrapper，并增加 controlled motion、continuous motion、从真实 rotation 建立 resolve plan、按 ending elapsed 采样 fast/stop/hold。原 full-demo 测试保持通过。

### Pixi card runtime

`card-carousel-3d-renderer.ts` 改为严格 per-carrier texture binding：

- carrier container、slice sprite、sample/draw-order buffer identity 保持稳定。
- replacement 只更新目标 carrier 的 texture info 和既有 sprite texture。
- renderer 以真实 `visible` sample 判断 safe replacement。
- slice texture view 使用 refcount；归零立即 destroy，renderer destroy 后 cache 为空。
- project/host source texture 均不由 vnicore destroy。
- image legacy 仍映射同一 texture；sequence legacy 仍按 modulo。

### Public manual transport

新增 `packages/vnicore/src/pixi/manual-playback.ts`，`VNIPlayer.createManualPlaybackSession()` 暴露：

- awaitable/cancellable `playRange()`。
- `holdTimeline()` / 显式 `release()`。
- host-delta `advanceFor()`，不使用 timer。
- `listAnimations({ capability })` 与稳定 ref。
- `getAnimation(ref)` / `requireCyclicSelection()`。
- manual state snapshot。

同一 player 最多一个 active session。session active 时 legacy `play/restart/seek/playRange/requestSegmentedPlaybackEnd` 冲突显式失败。operation cancel、session/player destroy 使用 `VNIPlaybackCancelledError` reject。`autoTick:false` 仍只由宿主 `update(deltaSeconds)` 推进；hold + continuous 在 `autoTick:true` 下继续请求 ticker。

### Cyclic capability / transaction

`card_carousel_3d` 明确声明：

- `continuous-phase`
- `replaceable-carriers`
- `cyclic-selection`

controller 支持：

- exact-count、non-empty unique key initial binding。
- project asset / host texture。
- authored descriptor/items/selection 显式预览合同。
- `idle` continuous phase。
- existing item 直接选择。
- same-key/different-visual 与新 item safe replacement transaction。
- visible carrier deferred，几何不可能隐藏时立即失败。
- selection committed 后才能 resolve。
- clear/destroy rollback authored texture 与拒绝 pending transaction。

### Viewer

`apps/anieditorv5viewer` 只通过 public session/capability/descriptor 编排：

`intro → hold/continuous → advanceFor（0 秒跳过）→ authored selection → release → resolve → ending`

Viewer 不读取 `card_carousel_3d.params`，不提供确认结果、结束循环、target 或 selected item 输入。重复自动预览、普通 Play/Restart/Seek/segmented、ZIP/profile 切换和 `beforeunload` 都会取消并 destroy 旧 manual session。

控制区改为四个 Tab：

- 项目
- 播放
- 组间插入
- 文字替换

具备 `tablist/tab/tabpanel`、稳定 id、`aria-selected/controls/labelledby`、roving `tabIndex`、ArrowLeft/ArrowRight 循环、Home/End。加载成功自动切到“播放”；Tab 切换不销毁 preview。desktop controls 为 `max-height:min(38vh,360px)`，窄屏为 `min(46vh,420px)`，active panel 内滚动。

## 修改文件

新增：

- `packages/vnicore/src/core/cyclic-selection.ts`
- `packages/vnicore/src/pixi/manual-playback.ts`
- `packages/vnicore/tests/core/cyclic-selection.test.ts`
- `packages/vnicore/examples/manual-cyclic-playback.ts`
- 本报告

修改：

- `packages/vnicore/src/core/card-carousel-3d.ts`
- `packages/vnicore/src/core/index.ts`
- `packages/vnicore/src/pixi/card-carousel-3d-renderer.ts`
- `packages/vnicore/src/pixi/vni-player.ts`
- `packages/vnicore/src/pixi/index.ts`
- `packages/vnicore/tests/pixi/vni-player.test.ts`
- `packages/vnicore/README.md`
- `packages/vnicore/docs/api-zh.md`
- `packages/vnicore/docs/usage-zh.md`
- `packages/vnicore/docs/usage-en.md`
- `packages/vnicore/examples/README.md`
- `apps/anieditorv5viewer/src/main.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- `apps/anieditorv5viewer/src/styles.css`
- `apps/anieditorv5viewer/tests/main.test.ts`
- `apps/anieditorv5viewer/README.md`
- `agents.md`

没有修改 editor、VNI schema/version、Bamboo ZIP、Cocos runtime、rendercore production 代码或 `pnpm-lock.yaml`。

## 自动化验收

全部通过：

- `CI=true pnpm --filter @slotclientengine/vnicore typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore lint`
- `CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck`
- `CI=true pnpm --filter @slotclientengine/vnicore test`
  - 17 files，230 tests。
  - statements 90.61%，branches 81.09%，functions 96.65%，lines 91.81%。
- `CI=true pnpm --filter @slotclientengine/vnicore build`
- `CI=true pnpm --filter @slotclientengine/vnicore format:check`
- `CI=true pnpm --filter anieditorv5viewer typecheck`
- `CI=true pnpm --filter anieditorv5viewer lint`
- `CI=true pnpm --filter anieditorv5viewer test`
  - 2 files，31 tests。
- `CI=true pnpm --filter anieditorv5viewer build`
- `CI=true pnpm --filter anieditorv5viewer format:check`
- `CI=true pnpm --filter @slotclientengine/rendercore typecheck`
- `CI=true pnpm --filter @slotclientengine/rendercore test`
  - 71 files，518 tests。
- `CI=true pnpm --filter @slotclientengine/rendercore build`
- `git diff --check`

测试覆盖：

- 1 小时 continuous 数值稳定。
- direction `1|-1`、13 个 target、rounds、exact alignment。
- 0/1.5/4.5/10 秒 authored stop。
- 4.5 秒路径真实多于 1.5 秒且不回绕。
- manual transport ownership、operation completion/cancel。
- host-driven update。
- project/host texture。
- visible replacement deferred 到 hidden。
- source texture ownership、slice cache refcount/清空。
- 300 帧 display tree identity。
- legacy full-demo/segmented/particle consumer 回归。
- Viewer public 调用顺序、0 秒跳过 advance、非法上限、重复生命周期。
- 四 Tab role/ARIA/hidden/键盘/加载切换/播放不中断。

## `agents.md`

已更新。原因是本任务形成了长期职责边界：manual staged transport、cyclic phase、固定 carrier、安全 replacement、slice view 与 dynamic alignment 属于 vnicore；app/viewer 只能通过 public capability/descriptor 编排，且 `VNIPlayer` 仍不拥有 renderer/canvas/DOM。

## 待用户浏览器人工验收

按用户要求，最终浏览器验收由用户执行。尚未记录，因此以下完成定义不能标记为浏览器已通过：

- 真实 ZIP `runtime_100` 画面加载。
- 0/1.5/4.5/10 秒最终视觉 carrier 一致。
- intro 单次、长 idle 无拉回、末尾 `7.15..8.1` 光效相对 ending 正常。
- 不可见边界换图无闪换。
- 连续 20 轮 container/sprite/texture view 无增长。
- destroy 后 RAF/Promise/display 无残留。
- desktop/窄屏实际 stage/control 像素尺寸和截图。
- 键盘切 Tab 且正在播放 preview 不被中断。

建议用户验收后把浏览器版本、viewport、stage/control 实测尺寸、最终 carrier 和截图补入本报告；在此之前，任务状态应表述为“实现与自动化验收完成，浏览器人工验收待用户完成”。
