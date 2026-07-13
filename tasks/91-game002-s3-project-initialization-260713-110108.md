# 91 game002-s3 project initialization 执行报告

## 1. 结论

任务 91 的代码、资源、自动化测试、静态发布检查、文档和仓库协作规则已经按计划落地。`apps/game002` 现在只接受 `skin=1` 并映射 `assets/game002-s3`；13 个主 symbol、Spine 4.3、gameloading 99%/100% 生命周期、单 live session、rendercore win-amount player 和 symbolsviewer 入口已形成闭包。

目标包门禁全部通过。全仓 `lint`、`typecheck`、`build` 通过；全仓 `test` 唯一失败来源是计划已明确的 `assets/game003-s1` Spine 4.2.43 与共享 rendercore 只接受 4.3.x 的版本门禁。本任务没有恢复 4.2/3.8 fallback，也没有运行 `game003 release:check`。

浏览器、真实 token/WebSocket 和视觉验收未执行，按用户要求留给用户完成，不能记为已通过。

## 2. Git 基线与用户资源保护

- 执行前分支：`main`。
- 执行前 HEAD：`c4435db68754f8b4057bb27f337e5889cf7cdde9`。
- 刷新远端并检查差异后执行 `git pull --ff-only origin main`。
- 同步后 HEAD：`ce14f60b1d11c0210b1dfddd5926562332c093e4`，提交说明为 `feat: enhance texture loading to handle transparent types and update tests; refactor anieditorv5viewer to use deterministic zip fixtures`。
- fast-forward 前后均保留 `assets/game002-s3` 中用户提供的 modified/untracked PNG、Spine JSON、atlas 和 texture；未 stash、未 reset、未清理 untracked、未手改 skeleton JSON。
- 本次没有执行 `git add`、commit 或 push，工作树仍保留全部任务改动和用户输入资源。

## 3. 资源与 manifest

### 3.1 主 symbol 集

最终 manifest key 顺序固定为：

```text
WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN
```

13 个 symbol 均有 normal、spinBlur、disabled，且 `scale: 1`。`emptySymbols=[]`，`BN` 使用真实 `BN.png`，不再作为透明空图或缺图兜底。

最终三态尺寸：

| symbol                     | normal / spinBlur / disabled |
| -------------------------- | ---------------------------- |
| WL,H1,H2,L1,L2,L3,L4,WM,BN | 130 x 130                    |
| AF,CM,CO                   | 170 x 170                    |
| CN                         | 200 x 200                    |

实际更新了 AF、CM、CO、H1、H2、L1、L2、L3、L4、WL、WM 的两张派生图；新增 BN 的 spinBlur、disabled；CN 的已有三态经最终生成比对保持一致。重新以已存在 manifest 为种子运行 generator 后，输出的 26 张派生图和 manifest 与工作区逐文件一致，证明 animation 元数据不会被重生成丢失。

明确排除主 manifest、runtime glob、loading glob 和 viewer glob 的资源：`CN_1..CN_4`、`Nearwin1..Nearwin3`、`WM_Fx`、`bg.jpg`、`Symbol.png`。

### 3.2 Spine 4.3

rendercore 依赖和 lockfile 实际解析版本：

```text
@esotericsoftware/spine-pixi-v8 4.3.10
```

rendercore 只接受 `4.3.x` skeleton；删除了 `spine38-runtime.ts`、对应测试和 3.8/4.2 分支，官方 4.3 runtime 使用 `skeleton.setupPose()`。4.2、3.8、未知版本和 malformed version 均显式失败。

主 skeleton 与 manifest 映射：

| symbol               | normal                    | appear     | win      |
| -------------------- | ------------------------- | ---------- | -------- |
| WL,H1,H2,L1,L2,L3,L4 | Idle loop                 | Start once | Win once |
| WM,CM,CO,AF          | Idle loop                 | Start once | 未声明   |
| BN                   | Idle loop                 | 未声明     | 未声明   |
| CN                   | 无同名 skeleton，静态贴图 | 未声明     | 未声明   |

12 个主 skeleton 都声明 Spine 4.3.23，atlas page 为 `Symbol.png`；自动化资源脚本逐项确认 manifest animation name 在 skeleton 中真实存在且大小写一致。

### 3.3 临时 win-amount

`assets/game003-s1/win-amount` 已整目录复制到 `assets/game002-s3/win-amount`。最终 `diff -qr` 无差异；三个 project 引用的图片集合与目标 assets 目录完全一致，无缺失、重复 loading URL 或 orphan 文件。

`win-amount.manifest.json` 仍是 bigwin/superwin/megawin project、asset glob 和 `2.9 / 1 / 2.5` segmented timing 的唯一资源来源。game002 只传 formatter、金额、阈值和布局给 rendercore player，没有复制金额动画状态机。

## 4. game002 实现

- `skin-id.ts` 只接受精确字符串 `1`；`2|3|4|5`、空值、alias 全部显式失败。
- `skin-config.ts` 只 import `assets/game002-s3`、`assets/gamecfg002/gameconfig.json` 和精确的 13 PNG/12 skeleton glob；旧五皮肤资源不再进入 bundle。
- app 删除了私有 manifest parser，统一使用 rendercore 的 manifest、scale、renderPriority 和 animation resolver。
- grid-cell runtime 继续使用本地公开 `reels-001`、`6 x 9`/54-cell reel 和服务器目标 scene 临时可见窗口叠加，不读取服务器真实轮带。
- layout 固定使用完整 `2000 x 2000` art；board 为 `637.5,330,720,1080`，唯一 focus 在 board 四边各扩 `60`，为 `577.5,270,840,1200`。单背景走 rendercore `maximized-focus` policy：先完整且最大化 focus，再按页面宽高比反推背景 viewport，focus 外仍在 art 内的背景继续显示；game003 双背景继续独立走 YAML `orientation-focus`。
- `main.ts` 先创建独立 loading host；99% 调用 `prepareGame002At99()` 完成 query 校验和 `prepareSlotGameLiveSession()`，100% 才调用 `enterGame002()` 创建 framework/Pixi，并把同一 session 传入 framework。
- 进入失败时销毁 framework 或 disconnect 尚未交接的 prepared session；beforeunload/destroy 路径有测试。
- 主转轮完成并校验最终 scene 后才启动正中奖金额动画；minor/major/tier counting 阻塞 `playSpin()`，进入 `awaiting-dismiss` 后 resolve。canvas 点击只转发 `requestAdvance()`；下一 spin 先 `dismissImmediately()`。
- `release:check` 已重写为单 s3 合同，检查相对 URL、敏感默认值、13 组三态 PNG、12 skeleton、atlas/texture、两个 manifest、三个 VNI project、所有实际 win-amount 图片内容和旧 skin bundle 引用。

## 5. symbolsviewer 与文档

- Set selector 新增 `game002-s3`，使用精确 13 PNG/12 skeleton closure。
- manifest 未声明的 appear/win 会在 viewer state 广播时回到 normal，不伪造 builtin/static 状态，也不把 normal Spine 冒充自定义状态。
- `game003-s1` resolver 改为惰性创建，使 viewer 构建和 game002-s3 预览可用；真正选择 game003 Spine 状态时仍因 4.2.43 明确失败，不隐藏已知不兼容。
- `apps/game002/README.md` 和 `apps/symbolsviewer/README.md` 已重写为当前合同。
- `AGENTS.md` / `agents.md` 在当前大小写不敏感工作区指向同一协作规则文件；`cmp -s AGENTS.md agents.md` 返回 0，内容写清单 skin、BN 真实贴图、精确 glob、loading、Spine 4.3 和临时 win-amount 边界。

## 6. 自动化验收证据

### 6.1 资源与发布门禁

通过：

- generator 临时目录与工作区逐文件 `cmp`；
- `diff -qr assets/game003-s1/win-amount assets/game002-s3/win-amount`；
- 计划资源脚本在 rendercore 包作用域运行，输出 `game002-s3 resource closure OK`；
- `CI=true pnpm --filter game002 release:check`，输出 `game002 static dist check passed.`；
- 边界 grep 未发现 production 旧 skin import、app/viewer 对 Spine 包的直接依赖或 game002-s3 宽泛 glob；测试中对旧 skin 字符串的命中仅用于显式拒绝断言。

计划原样在仓库根运行 `node --input-type=module` 时，因 pnpm strict dependency 无法从根包解析仅属于 rendercore 的 `sharp`，得到 `ERR_MODULE_NOT_FOUND`。随后用相同检查体从 `@slotclientengine/rendercore` 包作用域运行，并只把资源相对路径改为 `../../assets/game002-s3`，全部检查通过。一次漏加 `CI=true` 的重试出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，按仓库约定补上 `CI=true` 后通过；没有改 pnpm 全局配置或 Go cache。

### 6.2 目标包门禁

以下命令全部通过：

```text
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter @slotclientengine/gameloading test
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check
CI=true pnpm --filter symbolsviewer format:check
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

关键测试统计：

- rendercore：29 files / 196 tests passed；总覆盖率 statements 89.56%、branches 80.68%、functions 94.76%、lines 89.56%。
- game002：14 files / 63 tests passed；总覆盖率 statements 87.89%、branches 81.02%、functions 86.48%、lines 88.03%。
- symbolsviewer：2 files / 17 tests passed。
- gameloading：3 files / 11 tests passed。
- gameframeworks：9 files / 33 tests passed。
- uiframeworks：9 files / 52 tests passed。

### 6.3 全仓门禁

```text
CI=true pnpm lint       PASS，23/23 packages
CI=true pnpm typecheck  PASS，23/23 packages
CI=true pnpm build      PASS，23/23 packages
CI=true pnpm test       FAIL，仅 game003 Spine 4.2 已知例外
git diff --check        PASS
cmp -s AGENTS.md agents.md  PASS
```

为精确归因，另运行 `CI=true pnpm --filter game003 test`：

- 结果：12 test files failed、16 passed；4 tests failed、74 passed。
- 11 个 suite 在 import/初始化阶段失败，另有 `loading-flow.test.ts` 4 项失败。
- 共同根因均为：`Symbol "WL" normal Spine skeleton version is invalid: Unsupported Spine skeleton version "4.2.43"; supported version is 4.3.x.`
- 首个校验栈：`packages/rendercore/src/symbol/manifest.ts:1082` -> `createSymbolManifestAnimationResolver` -> `apps/game003/src/skin-config.ts:126`。
- 未发现第二类失败。本任务没有为使全仓 test 变绿而恢复 4.2 fallback，也没有声称 game003 可发布。

## 7. 二次遗漏审计

- 检查了 app 的 query、framework flow、loading host、prepared session 交接、destroy、resize、pointer、zero win、正中奖、invalid bet/win 和 collect 边界。
- 检查了 manifest parser、官方 Spine parser、runtime player cache/once completion、atlas page、animation exact name 和非法版本测试。
- 检查了 game runtime、symbolsviewer、loading 和 dist 四个独立消费者的资源 glob；均只接入 13 个 display PNG 和 12 个主 skeleton。
- 检查了 generator 保留 animation metadata、BN 实图、CN 无默认 skeleton、排除 feature/effect JSON 和 win-amount assets 全闭包。
- 检查了 README、协作规则、lockfile、format、lint、coverage、typecheck、build、release 和全仓命令。
- 未修改 game003 资源、live server、gamecode、spin request、collect 协议、服务器轮带边界或共享 YAML schema。

## 8. 用户浏览器验收清单（未执行）

启动：

```bash
pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206 --strictPort
```

请由用户使用真实参数验收：

1. 99% 前只有 loading、无 game canvas；100% 后进入游戏，Network 只有一条 live WebSocket。
2. `skin=1` 使用 game002-s3；`skin=2|3|4|5` 和携带 `serverUrl` 的旧链接显示明确错误。
3. 13 个 symbol（包括 BN）normal 清晰，spinBlur/disabled 与 130/170/200 尺寸对齐。
4. symbolsviewer 中 game002-s3 的 Idle/Start/Win 正常，未声明状态不伪造；game003-s1 的 4.2 状态按当前合同显式失败。
5. 6 x 9 grid-cell reel、本地公开轮带、dimming、stop 时序和最终服务器 scene 正确。
6. 普通中奖及 big/super/mega 临时 VNI 可显示；点击推进、awaiting-dismiss、下一 spin 清理和 collect 边界正确。
7. portrait、near-square、square、ultra-wide 的背景、唯一 focus 和 board 对齐正确；focus 完整且按 contain 最大化，页面剩余范围优先显示 art 内背景，完整 6 x 9 区域不得被裁切。
8. 控制台无 404、Spine parser warning、重复连接或未处理 Promise。

浏览器验收完成前，任务的“人工视觉/真实 live”项状态保持待用户验收。

## 9. 浏览器反馈后的最终适配修正

浏览器反馈确认，单背景适配不应增加独立 DOM `frameFocusRect` 或固定 HUD 安全高度。最终合同只使用一个 art-space focus rect，并由 rendercore 最大化它在当前页面中的显示：

- game002：单张 `2000 x 2000` 背景；board 为 `637.5,330,720,1080`，focus 在四边各扩 `60` 后为 `577.5,270,840,1200`；使用 `maximized-focus` policy，先完整且最大化 focus，再用页面比例反推可见背景范围。
- game003：横竖两张背景，继续由 YAML 配置 landscape / portrait variant，并使用 `orientation-focus` policy。

通用计算新增在 rendercore；uiframeworks/gameframeworks 只透传并消费 rendercore resolver，game002 app 不复制算法。最终算法覆盖 `390 x 844`、`1430 x 1464`、`1200 x 1200`、`1920 x 1080` 页面映射：先用 focus contain scale，再按页面比例展示尽可能多的背景，仅在超过完整 art 时封顶。完整 6 x 9 board 始终位于 focus 内。最终浏览器视觉验收仍由用户执行。

后续 `1430 x 1464` 近正方形截图暴露了旧方向分支的边界：因为页面高度仅比宽度多 `34`，旧逻辑却立即进入 portrait 分支并把 viewport 锁为 `840 x 1200`，导致左右可展示的背景被主动裁掉并形成大黑边。最终实现删除该横竖方向锁定，改为 `focusScale=min(pageWidth/focusWidth,pageHeight/focusHeight)`，再以 `pageSize/focusScale` 反推背景 viewport；该截图尺寸下 viewport 约为 `1172.13 x 1200`，能够铺满页面且显示两侧背景。

修正后的自动化验收结果：

```text
CI=true pnpm --filter game002 test          通过，14 个文件、63 个测试
CI=true pnpm --filter game002 lint          通过
CI=true pnpm --filter game002 typecheck     通过
CI=true pnpm --filter game002 build         通过
CI=true pnpm --filter game002 release:check 通过
CI=true pnpm --filter game002 format:check  通过
CI=true pnpm --filter @slotclientengine/rendercore test/typecheck/lint/format:check  通过，29 个文件、196 个测试
CI=true pnpm --filter @slotclientengine/uiframeworks test/typecheck/lint/format:check  通过，9 个文件、52 个测试
CI=true pnpm --filter @slotclientengine/gameframeworks test/typecheck/lint/format:check  通过，9 个文件、33 个测试
git diff --check                            通过
```

Vite 仍只报告既有的单 chunk 大于 500 kB warning，不影响构建或静态发布检查。第一次运行格式命令时没有给该条命令设置 `CI=true`，触发 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`；按仓库约定补上 `CI=true` 后通过。新增手机页面 case 的第一次断言只差一个浮点末位，测试改为 `toBeCloseTo(..., 10)`，没有调整 production 配置或降低 6 x 9 安全区验收。

后续用户再次启动 dev 入口时发现 loading 位于页面顶部。对照 game003 后确认 `game002` 初始化遗漏了 loading/game host 的全页尺寸样式：gameloading 自身使用 `height: 100%` 居中，但父级 `.game002-loading-host` 原本只有内容高度。现已补齐 `.game002-loading-host,.game002-game-host { width: 100%; height: 100%; }` 和 hidden host 规则，并增加源码级回归测试；这也保证 framework 创建时从 game host 获得稳定的页面高度，而不是依赖空 host 的 window fallback。

用户随后在 live spin 验收中发现实际请求的 `lines=10`，而 game002 合同应固定为 `30`。根因是 framework config 原样透传 URL `lines`，因此沿用 game003 的 `lines=10` 链接会发送错误请求。现新增 `GAME002_LINES=30`，query 仍要求显式提供 `lines`，但非 `30` 会在 loading 99% 配置解析阶段明确失败；bet option 与 spin request 只可能得到已校验的 `30`，不做静默覆盖。
