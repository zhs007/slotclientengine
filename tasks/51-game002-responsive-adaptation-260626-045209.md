# 51-game002-responsive-adaptation 执行报告

- 报告时间：260626-045209 UTC
- 计划文件：tasks/51-game002-responsive-adaptation.md
- 执行结论：完成；仓库级 `pnpm` 命令受当前 Codex runtime pnpm install 确认阻塞，局部等价验收和浏览器验收已通过。

## 实施范围

- `packages/rendercore`：新增 `viewport` helper、子路径 export、README 和单测。
- `packages/uiframeworks`：新增 fixed/focus frame policy、viewport snapshot、resize 派发、frame top-left transform、README 和 DOM/layout 测试。
- `packages/gameframeworks`：透传 frame policy，给 adapter mount context 提供 `getViewport()` / `onViewportChange()`，listener 异常进入 error 路径，README 和测试已同步。
- `apps/game002`：运行时背景切到 `bgfull.jpg`，art 坐标改为 `2000 x 2000`，旧 `1125 x 2000` board 映射到 art 坐标，Pixi stage 增加 world container 并在 resize 时只 resize renderer / 移动 world。
- 文档：`packages/rendercore/README.md`、`packages/uiframeworks/README.md`、`packages/gameframeworks/README.md`、`apps/game002/README.md` 已同步。
- 协作规则：`agents.md` 已新增 rendercore viewport 与 uiframeworks frame policy 归属规则；`AGENTS.md` 是同 inode 硬链接，内容同步。

## 关键实现说明

- `bgfull.jpg` 已作为运行时背景，尺寸由 `sips` 和 `apps/game002/tests/assets.test.ts` 锁定为 `2000 x 2000`；旧 `bg.jpg` 保留为 `1125 x 2000` 参考素材。
- `GAME002_REFERENCE_VISIBLE_RECT_IN_ART = x=437.5,y=0,width=1125,height=2000`，旧 board `x=200,y=330,width=720,height=1080` 映射为 art board `x=637.5,y=330,width=720,height=1080`。
- `rendercore` 的 `calculateFocusedArtViewport()` 输出 `visibleRect`、`worldOffset`、`focusRectInViewport`，并对非法 viewport、focus、margin 显式失败。
- `uiframeworks` 的 focus frame policy 负责 canvas cap、CSS scale、黑边居中和 resize 通知；默认 fixed policy 保持兼容。
- `gameframeworks` 只透传纯配置和 viewport snapshot，不改变 live/spin/presenting/collect/money 语义。
- `game002` adapter 初始化 Pixi backing size 来自 `context.getViewport().frameDesignSize`，后续 resize 只调用 `renderer.resize()` 并设置 world container position。
- 回归修复：adapter 对单帧 Pixi `deltaMS` 做 `1/30s` 上限保护，避免 resize / tab 恢复后的超大帧一次性跳过任务50的 grid-cell reels 滚动表现；无 live `defaultScene` 的首局 spin 在拿到真实目标 scene 后立即显示 reels 并播放，不再等最终结算后才显示。
- 合同修订：live 前端不拿服务器真实轮带；`game002` spin 仍使用本地 `reels-001` 滚动，服务器本轮最终 scene 只叠加到临时 spin strip 的落点窗口。目标 scene 无法在本地轮带反查连续 stop y 时，不再失败；未知 symbol code / 缺失资源仍显式失败。

## 验收记录

资源确认：

- `git status --short --untracked-files=all`：执行前确认已有 `assets/game002/bg.jpg` 修改、`assets/game002/bgfull.jpg` 和任务计划未跟踪。
- `sips -g pixelWidth -g pixelHeight assets/game002/bg.jpg`：`1125 x 2000`。
- `sips -g pixelWidth -g pixelHeight assets/game002/bgfull.jpg`：`2000 x 2000`。

局部等价命令全部通过：

- rendercore：`eslint .`、`prettier --check .`、`vitest run --coverage`、`tsc -p tsconfig.json --noEmit`、`tsc -p tsconfig.build.json`。
- uiframeworks：`eslint .`、`prettier --check .`、`vitest run --coverage`、`tsc -p tsconfig.json --noEmit`、`vite build`、`tsc -p tsconfig.build.json --emitDeclarationOnly`。
- gameframeworks：`eslint .`、`prettier --check .`、`vitest run --coverage`、`tsc -p tsconfig.json --noEmit`、`vite build`、`tsc -p tsconfig.build.json --emitDeclarationOnly`。
- game002：`eslint .`、`prettier --check .`、`vitest run --coverage`、`tsc -p tsconfig.json --noEmit`、`vite build`。

仓库级命令：

- `git diff --check`：通过。
- `node_modules/.bin/turbo run lint`：未进入本任务代码验收，失败于 Codex runtime pnpm 在 changed packages 内执行 `pnpm run lint` 时触发 `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]`。
- `pnpm lint`、`pnpm test`、`pnpm typecheck`、`pnpm build`：均在进入脚本前触发同一 pnpm install 确认阻塞，未执行实际 repo 脚本。

## 浏览器验收

- dev server：`node_modules/.bin/vite --host 127.0.0.1 --port 5206`；sandbox 下 `listen EPERM`，提权后启动成功。
- URL：`http://127.0.0.1:5206/`。
- 初始加载：第一屏为游戏 canvas，title 为 `game002`，live 连接成功后 HUD 为 `Ready`，console error/warn 为空。
- asset inventory：观察到 `assets/game002/bgfull.jpg?import&url`，未观察到旧 `bg.jpg`。

Viewport 结果：

- `390 x 844`：frame 约 `924.171 x 2000`，canvas backing `924 x 2000`，CSS rect `390 x 844`，HUD Ready。
- `1125 x 2000`：frame/canvas backing `1125 x 2000`，portrait 合同成立。
- `1200 x 1200`：frame/canvas backing `1200 x 1200`，square 不使用完整 `2000 x 2000`。
- `1920 x 1080`：frame backing `2000 x 1200`，CSS rect `1800 x 1080`，offsetX `60`。
- `3000 x 1200`：frame/canvas backing `2000 x 1200`，CSS rect left `500`，左右黑边居中。
- `3000 x 3000`：frame/canvas backing `1200 x 1200`，CSS scale `2.5`，未超过 `2000 x 2000`。
- 点击 Spin：进入 `presenting`，spin 按钮禁用；随后回到 `idle` / `Ready`，console error/warn 为空。

## 任务50回归补充

- 修复 `apps/game002/src/game-adapter.ts`：ticker 推进 runtime 前先限幅到 `1/30s`，保护每个可见帧仍能看到 54 个 grid-cell reels 的启动、滚动、暗度跟随和停靠过程。
- 修复 `apps/game002/src/game-demo.ts`：没有 live `defaultScene` 时，idle 初始化仍 hidden；但第一次真实 live spin target 已返回后，reels 层立即可见并播放到该目标 scene，不使用本地默认 scene 冒充初始化。
- 新增/更新测试：`apps/game002/tests/game-adapter.test.ts` 锁定大 `deltaMS` 不会跳过任务50动画；`apps/game002/tests/game-demo.test.ts` 锁定首局无 default scene 时真实 spin 期间 `spinBlur` 可见。
- 浏览器补充验收：`http://127.0.0.1:5207/` 等到 `Presenting` 后，对 board 区域 `423,36,432x648` 连续截图采样；本轮静态前哈希为 `e44e93eea8ddfa3e`，spin 期间出现 `6` 个不同哈希，最终回到 `Ready`，app console error/warn 为空。

## 任务50 resize 和动态 mask 补充

- 根因：grid-cell runtime 原先让每个 `cell root` 使用自己的子 `Graphics` 作为 mask。这个自遮罩结构在 Pixi `renderer.resize()` 后容易让停止态静态 symbol 的 mask transform/build 状态不稳定；下一次 spin 会重新启用 reel 内部 mask 并刷新 slot，所以看起来“一 spin 又好了”。
- 修复 `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`：每个 cell 改为 `root -> [clipMask, clipContent] -> reel`，root 只负责格子定位，不再自己 mask 自己；`clipContent.mask = clipMask` 只在该 cell 滚动期间启用，单个 cell 落地后立即关闭外层 mask。
- 白边修复：`clipMask` 是白色 `Graphics`，关闭 mask 后如果仍可见，会作为普通白块被渲染。现在 `clipMask.visible` 与启用状态绑定，初始/落地/完成态都隐藏，只在该 cell 正在滚动且作为 mask 使用时显示。
- 落地暗度处理：cell 落地后把 dimming strip 折叠到当前 cell 内淡出，避免 mask 关闭后暗度方块串到邻格，同时保持 `adapter.playSpin` 等暗度淡出完成后才 resolve。
- 新增/更新测试：`packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts` 锁定初始/完成态不挂外层 mask、滚动期启用 mask、落地后单格移除 mask。
- 浏览器补充验收：reload 新代码后，先 spin 到 `Ready`，再依次切换 `1000x700`、`3000x3000`、`390x844`、`1600x900`、`844x390`；每个尺寸 canvas backing / CSS rect 合同正常，HUD 保持 `Ready`，app console error/warn 为空。
- 单格滚动回归验收：`1200x1200` 下对 board 内 `240x240` 小区域采样，spin 前哈希 `8ceca17ea802157b`，Presenting 期间出现新哈希 `424fd26e85973e82`，证明滚动视觉恢复；最终回到 `Ready`，app console error/warn 为空。
- 边转边 resize 验收：Presenting 期间依次切换 `1000x700`、`390x844`、`1600x900`；canvas backing / CSS rect 随 viewport 更新，最终回到 `Ready`，app console error/warn 为空。

## 任务50 live 临时融合轮带补充

- 根因：live 服务器返回的最终 scene 可能无法在本地 `assets/gamecfg002/gameconfig.json` 的 `reels-001` 反查出连续 stop y。此前代码把这个当成 `No stop y candidate` fatal error，导致页面停在 error；但前端本来不应拿服务器真实轮带。
- 修复 `apps/game002/src/game-demo.ts`：目标 scene 先校验 symbol code 是否存在于本地 paytable；若本地轮带能反查 stop y，则继续使用；若某列不能反查，则使用当前本地列位置作为该列本轮停靠锚点，并通过 `targetVisibleSymbols` 把服务器目标窗口叠加进 rendercore 临时 spin strip。
- 新增/更新测试：`apps/game002/tests/game-demo.test.ts` 锁定“合法目标窗口不在本地轮带中”仍能 spin 并最终显示服务器 scene；未知 symbol code 仍显式失败。
- 文档同步：`agents.md`、`packages/logiccore/README.md`、`packages/rendercore/README.md`、`apps/game002/README.md` 和 `tasks/50-game002-grid-cell-reels.md` 已写入“本地公开轮带 + 服务器本轮落点窗口”的临时融合轮带合同。
- 本地浏览器辅助观察：重启干净 dev server `http://127.0.0.1:5208/` 后，点击 Spin 从 `Ready` 进入 `Presenting` 并回到 `Ready`；期间切换 `1000x700`、`390x844`、`1200x1200`。board 区域停止前哈希 `07926df1f531198d`，停止后哈希 `bfbc9f420dd46e8b`，停止后 whiteRatio `0.0004`、nearWhiteRatio `0.0016`；spin 小区域出现 `3` 个不同哈希。dev server 终端无新错误；浏览器日志 API 仍回放旧 `5207` 历史错误，未出现新的 `5208` app error。最终浏览器验收按用户最新指示交由用户处理。

## agents.md

已更新 `agents.md`，新增：

- `packages/rendercore` 拥有 art-size、focus-rect、visible-viewport 适配算法。
- `packages/uiframeworks` 拥有 DOM frame、canvas 逻辑尺寸上限、黑边居中和 resize 适配。
- live slot 前端使用本地公开轮带滚动，只把服务器本轮最终窗口叠加进临时轮带；不要改用、缓存或泄露服务器真实轮带。

`AGENTS.md` 与 `agents.md` 是同 inode 文件，内容同步。

## pnpm-lock.yaml

`pnpm-lock.yaml` 未变化；本任务未新增 npm 依赖，未执行会修改依赖图的安装命令。

## 风险与后续

- 当前环境的 `pnpm` 指向 Codex runtime wrapper，会在执行脚本前尝试 install 并因 no TTY 阻塞；本任务通过包内已安装二进制完成等价验收。真实 CI 或用户本机正常 pnpm 环境仍应可执行计划中的 `pnpm --filter ...` 命令。
- `assets/game002/bg.jpg` 是执行前已有用户素材修改，本任务未回滚；运行时已经切换到 `bgfull.jpg`。

## 最终状态

- `git diff --check` 通过。
- `git status --short --untracked-files=all` 摘要：本任务修改 `agents.md`、四个包/app 源码测试文档；新增 `assets/game002/bgfull.jpg`、`packages/rendercore/src/viewport/*`、`packages/rendercore/tests/viewport/focused-art-viewport.test.ts`、本报告；保留执行前已有 `assets/game002/bg.jpg` 修改和未跟踪计划文件。
