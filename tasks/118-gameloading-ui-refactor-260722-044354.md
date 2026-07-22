# Task 118 执行报告：gameloading 控制层与 Loading UI 彻底解耦

## 1. 结论

Task 118 的代码实现、自动化测试、静态边界、构建和 release 检查已经完成并全部通过。最终浏览器人工视觉验收按任务委托留给用户执行，见第 9 节。

最终职责为：

```text
@slotclientengine/gameloading
  controller / resource loader / progress / 99%-100% / abort / UI contract

@slotclientengine/gameloading-ui-simple
  通用简单 DOM UI

@slotclientengine/gameloading-ui-leo
  Leo 原生 DOM/CSS UI + 4 个精确资产
```

game002 注入 Leo UI，game003 注入 simple UI。没有引入 React、Zustand、eventcore、`game-leo-frameworks`、`ui-leo-frameworks`、`netcore2`、Wildsheep、platform switch 或 test 分支 framework 集成。

## 2. 基线

- 执行环境：Node `v24.14.0`，通过 `nvm use 24`。
- 工作区开始时无用户改动。
- 工作区为 detached HEAD；`HEAD`、`main`、`origin/main` 均为 `5bfd27ca2b6e394160912b42bc2c47fa30775542`（`5bfd27c Merge branch 'main' of github.com:zhs007/slotclientengine`）。
- `codex/task-118-loading-ui` 已被另一个 worktree 占用，本 worktree保持 Codex 提供的 detached HEAD，没有移动或覆盖其它 worktree 的分支。
- Leo 参考分支精确为 `test d6969f20ba5721914659dca52c0fd48955ca3edb`，只读取参考 component/CSS 并迁移 4 个资产；没有 merge 或 cherry-pick test 提交。

重构前基线：

- gameloading：3 files / 11 tests 通过。
- game002：18 files / 95 tests 通过。
- game003：27 files / 135 tests 通过。
- game002 / game003 build 均通过。

## 3. Controller 与 UI contract

`@slotclientengine/gameloading` 新增并导出：

- `GameLoadingUiPhase`
- `GameLoadingUiSnapshot`
- `GameLoadingUiCreateContext`
- `GameLoadingUi`
- `GameLoadingUiFactory`

controller 不再 import 或创建具体 DOM UI，`src/dom.ts` 已删除。第一帧同步发布冻结的 `loading-resources/0%` snapshot；资源阶段只发布 `0..99%`；资源完成发布 `preparing/99%`，并同时等待业务 `onBeforeComplete()` 和 UI `readyToComplete`；二者成功后发布 `entering-game/100%`，enter 成功后才执行 `playExit -> destroy -> root.hidden=true`。

错误合同固定为：resource、prepare、visual gate、enter、exit 任一失败时，abort 同实例 signal、保持 root 可见、发布保留当前进度的 error snapshot、调用 `onError` 恰好一次，并让 `start()` reject 同一个规范化 `Error`。app 的 fire-and-forget 调用显式处理 rejection，避免 unhandled rejection。

controller 拥有实例级 `AbortController`。resource、prepare、enter context 使用同一个 signal；fetch、image 和 style 默认 loader 响应 abort；destroy 幂等并立即停止调度、snapshot 和后续业务阶段。

## 4. UI packages

### 4.1 Simple UI

原 `gameloading/src/dom.ts` 的视觉职责迁移到 `@slotclientengine/gameloading-ui-simple`。保留深色 shell、Loading label、progress bar、百分比、Loading/Preparing/Ready/Error 状态和 `role=alert / aria-live=polite` error。每个实例拥有独立 style selector，destroy 幂等，不提供视觉等待 gate。

### 4.2 Leo UI

`@slotclientengine/gameloading-ui-leo` 使用原生 DOM/CSS：

- 同步创建黑色 shell 和 logo 首帧；
- GIF preload load/error/5000ms timeout 后开始默认 3200ms intro gate；
- GIF 装饰加载失败只保留 logo fallback，不阻断业务；
- intro 完成后显示 `a2/a3`，由纯 progress 函数驱动径向/横向 reveal；
- progress clamp 到 `0..100`，NaN/Infinity 不生成非法 CSS；
- enter 成功后默认保留 100ms 最终帧并淡出；
- error 保持背景与当前 art 可见并显示可访问错误；
- destroy 清理 timer、preload handler、style 和 DOM。

生产默认值为 `introDurationMs=3200`、`gifLoadTimeoutMs=5000`、`exitDurationMs=100`；测试可注入短时长，非法负数或非有限值显式失败。

## 5. Leo 精确资产

来源提交：`test d6969f20ba5721914659dca52c0fd48955ca3edb`。

| 文件           | 字节数 | SHA-256                                                            |
| -------------- | -----: | ------------------------------------------------------------------ |
| `loading2.gif` | 435117 | `eea8144f8ba2ca5916bc2bc6d5ed2e7ec302d4b877cd25c69e5c95019c2b50e0` |
| `logo_1.webp`  |   2760 | `5b209e5a7f7815c8e159f44153b39b77c7b5f379e082199dbe4ff3f15be4c1ff` |
| `a2.webp`      |   9602 | `dbb01e50703cbb7cec82bb4ebd961aeddb34f09d5aa262b197d6025f19391e52` |
| `a3.webp`      |   5656 | `f8a1d3db7f83e78c5d6150f17caec394b7cbd51938e4d5b2cbdf461b6fdbf9ff` |

source/package asset closure 精确为以上 4 文件。game002 Vite dist 也输出 4 个独立 hashed asset；`loading2.gif` 没有内联进 JS，logo 和两个 progress webp 当前也均为独立请求。game003 dist 不包含这些 Leo 资产。

## 6. App 接入

game002：

- 增加 `@slotclientengine/gameloading-ui-leo` workspace dependency；
- `main.ts` 注入 `createLeoGameLoadingUi()`；
- 保持 loading resource closure、99% query/live prepare、100% framework/Pixi enter 和 prepared session 复用不变；
- 删除 `onEnterGame` 内的 `loading.destroy()` / `loadingHost.remove()`；
- enter 失败仍隐藏并清空 gameHost；
- beforeunload 同时 destroy controller 和 entered game。

game003：

- 增加 `@slotclientengine/gameloading-ui-simple` workspace dependency；
- `main.ts` 注入 `createSimpleGameLoadingUi()`；
- 保持现有 99%/100%、live、layout、bg-bar、minecart 和正式游戏行为不变；
- 不包含 Leo/Wildsheep/platform switch。

## 7. 自动化验收

以下目标均独立执行并通过 `format:check / lint / typecheck / test / build`：

| 目标                  |             测试结果 | Statements | Branches |
| --------------------- | -------------------: | ---------: | -------: |
| gameloading           |   3 files / 19 tests |     91.66% |   85.15% |
| gameloading-ui-simple |    3 files / 5 tests |     98.33% |   92.30% |
| gameloading-ui-leo    |   4 files / 20 tests |     94.57% |   81.39% |
| game002               |  18 files / 97 tests |     86.34% |   80.33% |
| game003               | 27 files / 136 tests |     92.52% |   83.68% |

额外通过：

- `pnpm --filter game002 release:check`，包含 generated closure check、build、Leo 四资产精确闭包和 initial entry 禁止依赖检查、static dist check。
- `pnpm --filter game003 release:check`，包含 static config check、build、Leo 资产排除和 initial entry 禁止依赖检查、static dist check。
- `git diff --check`。
- 两个 UI package `dependencies` 均为空。
- UI source/build JS 无 `@slotclientengine/gameloading` runtime import，只有 `.d.ts` type-only import。
- UI/controller source 和 game002 initial entry 无 React、Zustand、eventcore、test framework、netcore2、Pixi/Spine runtime、WebSocket 或 framework entry 标识。
- game003 initial entry 无 Leo/Wildsheep/Pixi/framework/network 标识。
- gameloading dist 不含 simple/Leo DOM/CSS 或旧 `createGameLoadingDom`。

## 8. 产物体积

package dist 为 tsc ESM 输出，以下 gzip 为逐 JS 文件 gzip 后合计；CSS 在 UI JS style module 内，不另产 CSS 文件。

| 产物            |  raw JS | gzip JS |
| --------------- | ------: | ------: |
| gameloading     | 15576 B |  3903 B |
| simple UI       |  4141 B |  1421 B |
| Leo UI          |  9033 B |  2925 B |
| Leo `styles.js` |  1395 B |   624 B |

均低于任务中的建议目标。game002 initial entry 从基线 `176000 B / 32450 B gzip` 变为 `180822 B / 33656 B gzip`；game003 initial entry 从 `26389 B / 7570 B gzip` 变为 `28745 B / 8220 B gzip`。两个 initial entry 的正式游戏 runtime 仍通过动态 import 进入独立 `game-entry` chunk。

## 9. 浏览器人工验收（留给用户）

自动化与静态验收已完成，以下最终视觉项目未由执行者代跑：

1. game002 正常网络：首帧立即黑底 + logo，GIF intro 后切换到 a2/a3 progress，100% 后淡出进入游戏。
2. game002 慢网络：intro gate 可先结束，但 live/resource 未完成前不得显示 100% 或退场。
3. game002 GIF 请求失败/超时：保留基础视觉并继续；不得白屏或永久卡住。
4. game002 query/live/enter 错误：loading 保持可见，error 文案可读，gameHost 不留下半挂载画面。
5. game002 横屏、竖屏和 resize：loading 全屏覆盖、居中、无点击穿透。
6. game003：simple UI 正常显示，99% prepare / 100% enter 顺序与正式游戏行为不变。

## 10. 非目标确认

未实现 Wildsheep、平台运行时切换、React HUD、Leo framework、netcore2、stateData bridge、玩法/round 状态机、rendercore/Pixi/Spine/VNI 修改或远程 loading 配置。
