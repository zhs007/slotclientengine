# game002 Spine background 任务报告

## 1. 结论

任务 92 的代码、资源配置、单元测试、目标包门禁、静态发布检查、文档和协作规则已经落地。

最终实现达到以下合同：

- `assets/game002-s3/background.manifest.json` 是 game002 背景 art、focus、适配模式、Spine 资源、初始状态和有向切换的唯一配置源。
- game002 已删除 `assets/game002-s3/bg.jpg`，source、loading、构建产物检查和当前文档不再保留旧静态背景入口或 fallback。
- rendercore 新增通用 background manifest parser、resource resolver、Spine player 和状态机，并与 symbol Spine 共用官方 4.3 runtime 底层。
- 当前 app 只初始化 `BaseGame -> BG loop`；`FreeGame -> FG loop`、`BG_FG`、`FG_BG` 已配置并由 rendercore 单测覆盖，但没有猜测服务端 FreeGame 触发字段。
- game002、rendercore、symbolsviewer 的目标包门禁全部通过；全仓 lint、typecheck、build 通过。
- 全仓 format 仍被仓库内既有、非任务文件阻塞；全仓 test 在当前受限执行环境先被 netcore mock WebSocket 监听权限阻塞，单独复核还确认 game003 保持既有 Spine 4.2.43 明确失败。两类失败均未通过 skip、fallback 或放宽版本校验掩盖。

唯一未完成项是用户明确接手的真实 live 浏览器与视觉验收。本文第 11 节列出验收清单，当前状态不得解释为浏览器已经通过。

## 2. Git 基线与用户输入保护

执行前后均保持：

```text
branch: main
HEAD: 63fb9ad
```

执行前已有且被保留的用户输入：

```text
M  packages/rendercore/README.md
?? assets/game002-s3/BG.atlas
?? assets/game002-s3/BG.json
?? assets/game002-s3/BG.png ... BG_8.png
?? assets/game002-s3/Reel_CO_CM.json
?? assets/game002-s3/Special Feature.atlas
?? assets/game002-s3/Special Feature.png
?? docs/background-adaptation.md
?? tasks/92-game002-spine-background.md
```

实施在保留 `packages/rendercore/README.md` 和 `docs/background-adaptation.md` 既有内容的基础上补充说明。没有 reset、checkout、stash 或清理用户 untracked 文件。

以下相邻资源未修改、未接入背景闭包：

```text
assets/game002-s3/Reel_CO_CM.json
assets/game002-s3/Special Feature.atlas
assets/game002-s3/Special Feature.png
```

`git diff --quiet -- apps/game003 assets/game003-s1` 为 PASS，确认本任务未修改 game003。

## 3. Background manifest 与资源事实

新增 manifest 的核心合同：

```text
version: 1
kind: spine
artSize: 2000 x 2000
adaptation: maximized-focus
focusRect: x=577.5, y=270, width=840, height=1200
transform: x=1000, y=1000, scale=1
initialState: BaseGame
BaseGame: BG loop
FreeGame: FG loop
BaseGame -> FreeGame: BG_FG once
FreeGame -> BaseGame: FG_BG once
```

资源闭包精确为：

```text
BG.json
BG.atlas
BG.png
BG_2.png
BG_3.png
BG_4.png
BG_5.png
BG_6.png
BG_7.png
BG_8.png
```

重新读取资源确认 skeleton 为 Spine `4.3.23`，四个真实 animation 为 `BG`、`FG`、`BG_FG`、`FG_BG`，真实时长分别为 `15s`、`15s`、`1.6s`、`1.6s`。时长没有写入 manifest 或 app 第二份表，player 以 runtime completion 完成 transition。

8 个 `.png` 文件实际为 WebP bytes；测试使用真实 decoder 验证尺寸，没有转码或修改美术输入。atlas page 与 manifest texture key 精确闭合。

补充发现：`BG.png` 与 `BG_2.png` 的 SHA-256 同为：

```text
f94e7ed7c72d513377a8d23cc3cebb12daa8be770a48da42934538d1305823fa
```

Vite/Rollup 会按相同内容合并物理 hashed asset。app 因此在导入后的 URL 上追加稳定的 `spineAtlasPage` query，使 8 个 atlas page 在 loading 和 Pixi cache 中仍保持 8 个唯一逻辑 URL；rendercore 继续严格拒绝重复 raw URL。release check 按 source bytes 分组验证：非重复页各有一个物理 hashed asset，字节相同的 `BG.png/BG_2.png` 组必须且只能对应一个相同字节的物理 asset，同时 8 个逻辑 page 均有唯一 query。没有修改或伪造美术字节来绕过 bundler 去重。

## 4. rendercore 通用实现

新增 public surface：

```text
@slotclientengine/rendercore/background
parseSpineBackgroundManifest()
createSpineBackgroundResource()
createSpineBackgroundPlayer()
```

player public 合同包含：

```text
container
init()
update(deltaSeconds)
requestState(state)
getSnapshot()
destroy()
```

manifest/parser/resource resolver 显式校验：

- 顶层及嵌套 unknown field；
- version、kind、adaptation mode；
- finite/正数尺寸、transform 和完整位于 art 内的 focus；
- 非空相对路径、禁止 URL/绝对路径/`..` 逃逸、路径和 URL 唯一性；
- initial state、state、direct transition、self transition、重复有向边；
- Spine 4.3.x、exact animation name；
- atlas page 与 texture map 完整闭包、malformed skeleton/atlas 和 attachment 解析。

解析结果使用只读/冻结结构，app 不能在 runtime 改写合同。

共享底层新增于 `packages/rendercore/src/spine/`。symbol 和 background 共用版本校验、`TextureAtlas`、`AtlasAttachmentLoader`、`SkeletonJson`、官方 `Spine` 实例、manual update、animation exact-name、completion 和 destroy。background 可传多页 texture map；symbol 的既有单页资源校验没有放宽。

背景 player：

- 只创建一个官方 Spine instance，切状态只切 animation；
- 初始播放 `BG` loop；
- `BG_FG`/`FG_BG` 只在 completion 后切目标 loop，并在同一个 update 中完成；
- same-state 为不重播的已完成请求；
- unknown state、missing direct edge、并发 transition、非法 delta、错误生命周期均显式失败；
- destroy 会 reject pending transition，释放 listener、track、Spine、mask 和 container；
- Graphics mask 固定裁切 `0,0,2000,2000`，不使用 skeleton bounds 推导 art 或 focus。

## 5. game002 接入

`apps/game002/src/background-config.ts` 精确导入 manifest、BG skeleton、atlas raw 和 `BG.png..BG_8.png` 的 brace glob，未使用宽泛资源 glob，也未直接 import Spine runtime。

art/focus/policy 从 parsed manifest 派生；board frame、6 x 9 reel、cell、timing 仍由 game002 layout 拥有。原有四类 viewport 计算测试保持通过，board 继续位于 focus 内且四边各扩大 60。

adapter 已用 background player 替换静态 `Assets.load + Sprite`：

- mount 先创建并初始化背景 player，再完成 world layer 组合；
- child 顺序保持 background、reels、win-amount；
- init 失败回滚 canvas/application/container；
- mounted 后每个 ticker tick 都先用同一个 normalized/capped delta 更新背景，idle 时也不暂停；
- update 错误停止 ticker并报告，即使没有 pending spin 也不会静默；
- viewport resize 仍只更新 renderer 和整个 `worldLayer.position`，背景没有二次 scale/position；
- destroy 移除 listener/ticker，销毁背景 player，再销毁 Pixi app；测试显式断言正常和失败路径均释放背景。

没有在 `applyInitialState()`、`playSpin()`、collect、step、symbol 或 win amount 上推测 FreeGame 状态。

## 6. Loading 与静态发布闭包

loading 已删除 `game002-bg`/`bg.jpg`，增加：

```text
game002-background-manifest
game002-background-spine-skeleton
game002-background-spine-atlas
game002-background-spine-textures:BG.png ... BG_8.png
```

资源 id 和逻辑 URL 唯一；8 页纹理继续位于 99% 前闭包，总权重按旧背景语义均摊。100% 后创建 framework/Pixi、复用 prepared session、单 WebSocket 的既有流程未改变。

`verify-static-dist.mjs` 现在验证 source/dist manifest、skeleton、atlas、8-page 逻辑闭包、源字节/构建字节、状态映射、Spine 版本、animation、旧背景不存在、symbol/win-amount/旧 skin/敏感值等既有门禁。

## 7. 修改文件清单

新增：

```text
apps/game002/src/background-config.ts
assets/game002-s3/background.manifest.json
packages/rendercore/src/background/errors.ts
packages/rendercore/src/background/index.ts
packages/rendercore/src/background/manifest.ts
packages/rendercore/src/background/spine-background-player.ts
packages/rendercore/src/background/types.ts
packages/rendercore/src/spine/runtime-player.ts
packages/rendercore/src/spine/version.ts
packages/rendercore/tests/background/manifest.test.ts
packages/rendercore/tests/background/runtime-player.test.ts
packages/rendercore/tests/background/spine-background-player.test.ts
tasks/92-game002-spine-background-260714-044009.md
```

修改：

```text
agents.md
apps/game002/README.md
apps/game002/scripts/verify-static-dist.mjs
apps/game002/src/game-adapter.ts
apps/game002/src/game-layout.ts
apps/game002/src/loading-resources.ts
apps/game002/src/skin-config.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/vite.config.ts
packages/rendercore/README.md
packages/rendercore/package.json
packages/rendercore/src/index.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/spine-version.ts
```

删除：

```text
assets/game002-s3/bg.jpg
```

美术提供的 `BG.*` 资源仍是用户 untracked 输入，本任务只读使用；无关的 `Reel_CO_CM.json` 与 `Special Feature.*` 未纳入上述任务修改清单。

## 8. 目标包自动化验收

以下命令最终均为 PASS：

| 命令                                                              | 结果                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CI=true pnpm --filter @slotclientengine/rendercore format:check` | PASS                                                                                                                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore lint`         | PASS                                                                                                                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore test`         | PASS，32 files / 223 tests；总覆盖率 statements 89.68%、branches 80.82%、functions 94.62%、lines 89.67%；background statements 92.70%、branches 84.42% |
| `CI=true pnpm --filter @slotclientengine/rendercore typecheck`    | PASS                                                                                                                                                   |
| `CI=true pnpm --filter @slotclientengine/rendercore build`        | PASS                                                                                                                                                   |
| `CI=true pnpm --filter game002 format:check`                      | PASS                                                                                                                                                   |
| `CI=true pnpm --filter game002 lint`                              | PASS                                                                                                                                                   |
| `CI=true pnpm --filter game002 test`                              | PASS，14 files / 66 tests；总覆盖率 statements 89.08%、branches 83.33%、functions 87.61%、lines 89.21%                                                 |
| `CI=true pnpm --filter game002 typecheck`                         | PASS                                                                                                                                                   |
| `CI=true pnpm --filter game002 build`                             | PASS                                                                                                                                                   |
| `CI=true pnpm --filter game002 release:check`                     | PASS，输出 `game002 static dist check passed.`                                                                                                         |
| `CI=true pnpm --filter symbolsviewer test`                        | PASS，2 files / 17 tests；总覆盖率 statements 93.05%、branches 78.78%、functions 100%、lines 92.95%                                                    |
| `CI=true pnpm --filter symbolsviewer typecheck`                   | PASS                                                                                                                                                   |
| `CI=true pnpm --filter symbolsviewer build`                       | PASS                                                                                                                                                   |

非 TTY 环境的首次 pnpm 检查触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，按任务合同使用同一命令加 `CI=true` 重试，没有修改 pnpm 配置或 Go/cache 设置。

## 9. 全仓验收与精确归因

| 命令                                                                         | 结果                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI=true pnpm format:check`                                                  | FAIL，首个失败为既有 `apps/gengameconfig` 7 个文件；同时输出还列出 `uiframeworksviewer` 6 个文件及旧 demo/export 文件。game002 目标 format 门禁独立 PASS，本任务未批量格式化无关包。                                                                                                                 |
| `CI=true pnpm lint`                                                          | PASS，23/23 packages                                                                                                                                                                                                                                                                                 |
| `CI=true pnpm typecheck`                                                     | 最终 PASS，23/23 packages。首次并发执行曾因 package dist declaration 竞争失败；`pnpm exec turbo run typecheck --concurrency=1` PASS 后，精确根命令复跑 PASS。                                                                                                                                        |
| `CI=true pnpm build`                                                         | PASS，23/23 packages                                                                                                                                                                                                                                                                                 |
| `CI=true pnpm test`                                                          | FAIL。`@slotclientengine/netcore/tests/main-adv.test.ts` 的 beforeEach 创建 `WebSocketServer` 时被当前 sandbox 拒绝监听 `0.0.0.0`，错误为 `listen EPERM: operation not permitted 0.0.0.0`，7 个用例均等待 hook 10 秒后失败。确认失败并出现 Turbo error 后进程仍未自行退出，手动终止，最终 exit 130。 |
| `CI=true pnpm --dir packages/netcore exec vitest run tests/main-adv.test.ts` | FAIL，独立复现同一 `listen EPERM`，1 file / 7 tests / 7 unhandled errors，证明不是 task 92 background 回归。                                                                                                                                                                                         |
| `CI=true pnpm --filter game003 test`                                         | FAIL，既有 `assets/game003-s1` skeleton 为 Spine `4.2.43`，rendercore 只允许 `4.3.x`；12 suites failed、16 passed，4 tests failed、74 passed。未恢复 4.2 fallback。                                                                                                                                  |
| `git diff --check`                                                           | PASS                                                                                                                                                                                                                                                                                                 |
| `cmp -s AGENTS.md agents.md`                                                 | PASS                                                                                                                                                                                                                                                                                                 |

全仓 test 的第一个阻塞从任务计划预期的 game003 4.2 gate 提前变成执行环境禁止 netcore mock server 监听；因此另行运行 game003 test，保留并精确记录既有 4.2 gate。目标包测试均不需要监听端口且全部通过。

## 10. 边界、遗漏和文档审计

边界命令结果：

```text
test ! -e assets/game002-s3/bg.jpg                                      PASS
test -e assets/game002-s3/background.manifest.json                     PASS
旧 bg.jpg/backgroundUrl/createPositionedSprite production 搜索         0 matches / PASS
game002 app 宽泛 glob 或直接 Spine runtime 搜索                        0 matches / PASS
背景闭包接入 Reel_CO_CM/Special Feature/CN/Nearwin/WM_Fx 搜索           0 matches / PASS
状态/动画 production 映射搜索                                          只命中 background.manifest.json / PASS
git diff --quiet -- apps/game003 assets/game003-s1                     PASS
git diff --check                                                       PASS
cmp -s AGENTS.md agents.md                                             PASS
```

二次遗漏审计确认：

- manifest/parser/resource/player 的正反向合同覆盖 unknown field、路径、数值、focus、版本、animation、page、state、transition、并发和 destroy；
- symbol 继续保持单页、cache、once、state switch 和 destroy 行为，rendercore 与 symbolsviewer 回归通过；
- art/focus/policy 由 manifest 派生，board 仍在 app，四类 viewport 预期未变；
- adapter 覆盖 mount rollback、idle/spin delta、z-order、resize、error、normal destroy 和 pending destroy；
- loading、source boundary 和 release check 均不包含旧背景或无关 feature；
- game003、旧 skin、live server、lines=30、prepared session、local public reel 和 win-amount 合同未修改。

已同步：

```text
apps/game002/README.md
packages/rendercore/README.md
docs/background-adaptation.md
agents.md / AGENTS.md
```

## 11. 待用户执行的浏览器验收

未启动 dev server、未使用真实 token/业务参数，也未代替用户执行视觉验收。请按任务计划启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206 --strictPort
```

使用真实且 URL 编码的业务参数验收，敏感值不要写入仓库或反馈报告。需要逐项确认：

1. 99% 前只有 loading；Network 中 manifest、skeleton、atlas、8 个逻辑 page 均成功，无 `bg.jpg`；100% 后只有一个 WebSocket。
2. 进入游戏立即循环 `BG`，idle、spin、中奖金额播放和 resize 时环境动画均持续。
3. 背景中心、board 和 `2000 x 2000` art 对齐，无 1000 偏移、翻转、二次缩放或 skeleton bounds 漂移。
4. `390 x 844`、`1430 x 1464`、`1200 x 1200`、`1920 x 1080` 下 focus/board 与任务 91 一致，art 外内容被 mask 裁切。
5. 背景始终位于 reels、symbols、win amount、HUD 下方。
6. console 无 atlas page、WebP decode、Spine parser、重复 listener、未处理 Promise、404 或旧背景 warning。
7. old skin、非法 query、资源/manifest 错误仍显式失败，不回落静态背景。

当前 app 没有 FreeGame 业务触发；浏览器验收不应伪造 GMI/debug query。双向 transition 已由 rendercore 单测验收。

## 12. 明确未做事项

- 未猜测或接入 FreeGame 的服务端触发规则。
- 未接入 `Reel_CO_CM.json`、`Special Feature.*`、CN、Nearwin、WM_Fx 等无关资源。
- 未增加静态图、首帧、默认 animation、unknown state、missing transition 或跨版本 fallback。
- 未恢复 Spine 4.2/3.8 runtime 或手写 adapter。
- 未修改 game003 或其资源。
- 未提交 dist、coverage、浏览器截图、token、cookie 或完整业务 URL。
