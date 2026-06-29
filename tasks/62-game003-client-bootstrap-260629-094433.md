# 62 game003 client bootstrap 执行报告

生成时间：2026-06-29 09:44:33 UTC

## 1. 结论

已按 `tasks/62-game003-client-bootstrap.md` 初始化 `apps/game003`，生成 `assets/gamecfg003/gameconfig.json`、`assets/game003-s1` symbol 状态图和 manifest，并补齐普通 reel 目标可见窗口注入、横竖屏 art viewport、game003 app、README、`agents.md` 和验收测试。

浏览器验收时发现第一版竖屏 resize 会触发 `viewportSize must not exceed artSize.`，已修复为 `uiframeworks` / `gameframeworks` 通用 `orientation-focus` frame policy：横版和竖版分别提交不同 canvas 逻辑上限，避免横版 focus 宽度撑爆竖版 art。

## 2. 变更文件

新增：

- `apps/game003/**`
- `assets/game003-s1/**`
- `assets/gamecfg003/bg-reel01.xlsx`
- `assets/gamecfg003/paytable.xlsx`
- `assets/gamecfg003/gameconfig.json`
- `packages/rendercore/src/viewport/responsive-art-viewport.ts`
- `packages/rendercore/tests/viewport/responsive-art-viewport.test.ts`
- `tasks/62-game003-client-bootstrap.md`
- `tasks/62-game003-client-bootstrap-260629-094433.md`

修改：

- `agents.md`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `packages/rendercore/README.md`
- `packages/rendercore/src/reel/render-reel-set.ts`
- `packages/rendercore/src/reel/types.ts`
- `packages/rendercore/src/viewport/index.ts`
- `packages/rendercore/tests/reel/render-reel-set.test.ts`
- `packages/uiframeworks/README.md`
- `packages/uiframeworks/src/layout.ts`
- `packages/uiframeworks/src/types.ts`
- `packages/uiframeworks/tests/layout.test.ts`
- `packages/gameframeworks/README.md`
- `packages/gameframeworks/src/types.ts`

`pnpm-workspace.yaml` 增加 `onlyBuiltDependencies` 允许 `esbuild` 和 `sharp` build，`pnpm-lock.yaml` 因新增 `apps/game003` workspace package 和安装确认发生变化。

## 3. 资源生成和审计

生成 game config：

```bash
CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg003/paytable.xlsx --reel assets/gamecfg003/bg-reel01.xlsx --out assets/gamecfg003/gameconfig.json
```

结果摘要：

- `paytable symbols: 27`
- `reels.bg-reel01` 存在，`reelCount=5`
- reel 长度：`320,270,270,270,270`
- 公开轮带出现 code：`0,1,2,3,4,5,6,7,8,9,10,11,12,22`
- symbol code：`WL=0,H1=1,H2=2,H3=3,H4=4,H5=5,L1=6,L2=7,L3=8,L4=9,L5=10,CO=11,CL=12,BN=13,MT=14,JP1=15,JP2=16,JP3=17,JP4=18,CO1=19,CO2=20,CO3=21,SC=22,MT2=23,MT3=24,MT5=25,BO=26`

规范化 `H1.jpg` 到 `H5.jpg`：

```bash
CI=true pnpm --dir packages/rendercore exec node --input-type=module -e '...sharp(...).png().toFile(...)'
```

尺寸复核：

- `H1.png` 到 `H5.png` 均为 `172 x 130`
- `bg1.jpg=2000 x 2000`
- `bg2.jpg=1174 x 2000`
- `mainreelbg.png=1130 x 824`
- `conveyor1.png=284 x 775`
- `conveyor2.png=934 x 227`

生成 symbol 状态图：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

manifest 摘要：

- `version=1`
- `states=spinBlur,disabled`
- symbols：`CL,CO,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,SC,WL`
- 每个 symbol 均有 `normal`、`spinBlur`、`disabled`
- 每个 symbol `scale=1`
- `H1` 到 `H5` 的 `normal` 均引用 `./H*.png`
- 背景、主转轮框、传送带未进入 symbol manifest

## 4. Layout 和职责边界

game003 最终 focus region：

- 横版 art：`2000 x 2000`
- 横版 focus：`{ x: 288, y: 588, width: 1424, height: 824 }`
- 竖版 art：`1174 x 2000`
- 竖版 focus：`{ x: 22, y: 469.5, width: 1130, height: 1061 }`

主转轮窗口：

- `GAME003_REEL_WINDOW_IN_MAIN_REEL_BG = { x: 135, y: 87, width: 860, height: 650 }`
- 5 列 x 5 行，单格 `172 x 130`

rendercore 新增：

- `calculateResponsiveArtViewport(...)`
- `ResponsiveArtVariantId`
- `ResponsiveArtVariant`
- `ResponsiveArtViewport`
- 普通 `RenderReelSet.spin(plan, { targetVisibleScene })`
- `RenderReelSet.resetToVisibleScene(...)`

职责边界：

- `rendercore` 只处理通用 art variant 选择、focus viewport 映射和普通 reel 临时目标窗口注入。
- `apps/game003` 保留 `mainreelbg`、`conveyor1`、`conveyor2` 的组合、间距、层级和转轮窗口校准。
- `uiframeworks` / `gameframeworks` 已新增 `orientation-focus` frame policy，只负责 DOM frame 和 canvas 逻辑尺寸，不包含 game003 图片名、reel、symbol 或 live 逻辑。

game003 frame policy：

- 横版 variant：`maxDesignSize={ width: 2000, height: 2000 }`，frame focus size `{ width: 1424, height: 1061 }`
- 竖版 variant：`maxDesignSize={ width: 1174, height: 2000 }`，frame focus size `{ width: 1130, height: 1061 }`，左右 margin `22`

## 5. URL 示例

```text
http://127.0.0.1:5208/?skin=1&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=EfedJuHEaydXNghnmO9KI&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
```

真实 token、一次性启动链接和可用密钥未写入代码或报告。

## 6. 验收命令

通过：

- `pnpm install --no-frozen-lockfile`
- `CI=true pnpm --filter gengameconfig dev -- --paytable assets/gamecfg003/paytable.xlsx --reel assets/gamecfg003/bg-reel01.xlsx --out assets/gamecfg003/gameconfig.json`
- `CI=true pnpm --filter gengameconfig lint`
- `CI=true pnpm --filter gengameconfig test`
- `CI=true pnpm --filter gengameconfig typecheck`
- `CI=true pnpm --filter gengameconfig build`
- `CI=true pnpm --filter @slotclientengine/rendercore lint`
- `CI=true pnpm --filter @slotclientengine/rendercore test`
- `CI=true pnpm --filter @slotclientengine/rendercore typecheck`
- `CI=true pnpm --filter @slotclientengine/rendercore build`
- `CI=true pnpm --filter @slotclientengine/rendercore format:check`
- `CI=true pnpm --filter @slotclientengine/uiframeworks lint`
- `CI=true pnpm --filter @slotclientengine/uiframeworks test`
- `CI=true pnpm --filter @slotclientengine/uiframeworks typecheck`
- `CI=true pnpm --filter @slotclientengine/uiframeworks build`
- `CI=true pnpm --filter @slotclientengine/uiframeworks format:check`
- `CI=true pnpm --filter @slotclientengine/gameframeworks lint`
- `CI=true pnpm --filter @slotclientengine/gameframeworks test`
- `CI=true pnpm --filter @slotclientengine/gameframeworks typecheck`
- `CI=true pnpm --filter @slotclientengine/gameframeworks build`
- `CI=true pnpm --filter @slotclientengine/gameframeworks format:check`
- `CI=true pnpm --filter game003 lint`
- `CI=true pnpm --filter game003 test`
- `CI=true pnpm --filter game003 typecheck`
- `CI=true pnpm --filter game003 build`
- `CI=true pnpm --filter game003 release:check`
- `CI=true pnpm --filter game003 format:check`
- `git diff --check`

`game003 release:check` 结果：`game003 static dist check passed.`

失败但判定为无关既有格式问题：

```bash
CI=true pnpm format:check
```

当前 root `format:check` 最早失败在无关包格式问题，输出包含：

- `packages/pixiani/src/ani/index.ts`
- `packages/pixiani/src/core/index.ts`
- `packages/pixiani/src/index.ts`
- `packages/pixiani/src/layout.ts`
- `packages/pixiani/tests/layout.test.ts`
- `packages/pixiani/tsconfig.build.json`
- `packages/pixiani/tsconfig.eslint.json`
- `apps/gameclientcli/src/gameplay-stats.ts`
- `apps/gameclientcli/tests/fixtures/logic-gmi.ts`
- `apps/gameclientcli/tests/gameplay-stats.test.ts`
- `apps/spine2pixiani-demo/eslint.config.cjs`
- `apps/spine2pixiani-demo/index.html`
- `apps/spine2pixiani-demo/package.json`
- `apps/spine2pixiani-demo/README.md`
- `apps/spine2pixiani-demo/src/ani/cabin/*`
- `apps/spine2pixiani-demo/src/core/*`
- `apps/spine2pixiani-demo/src/data/*`
- `apps/spine2victoryani-demo/eslint.config.cjs`
- `apps/spine2victoryani-demo/index.html`
- `apps/spine2victoryani-demo/package.json`
- `apps/spine2victoryani-demo/public/exported/*`
- `apps/spine2victoryani-demo/README.md`
- `apps/spine2victoryani-demo/src/ani/cabin/*`
- `apps/spine2victoryani-demo/src/config/*`
- `apps/spine2victoryani-demo/src/core/*`
- `apps/spine2victoryani-demo/src/data/*`

受任务影响的 `game003`、`rendercore`、`uiframeworks`、`gameframeworks` 已直接补跑 `format:check` 并通过；未修改上述无关格式文件。

## 7. 浏览器验收

启动：

```bash
CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5208 --strictPort
```

缺参访问：

- URL：`http://127.0.0.1:5208/`
- 页面正文：`skin query parameter is required.`
- canvas 数量：`0`
- console 有对应显式配置错误，符合 fail-fast 入口。

带完整参数但无真实 live：

- 使用 `token=TOKEN`
- 使用本机不可用 `serverUrl=ws://127.0.0.1:9/`，避免外部域名解析影响本地验收。
- 页面加载出 game003 UI 和 1 个 Pixi canvas。
- 横版 viewport `1280 x 720`：canvas `1886 x 1061`
- 竖版 viewport `390 x 844`：canvas `1174 x 2000`
- 竖屏切换后不再出现 `viewportSize must not exceed artSize.`
- 页面状态显示预期 WebSocket 失败：`netcore logger.error: WebSocket error observed: {"isTrusted":true}`

当前没有可用真实 live token / live server，因此未执行真实 enter game、spin、collect 浏览器流程；该流程由 `apps/game003/tests/framework-flow.test.ts` 的 mock client 覆盖。

## 8. 未解决风险

- 主转轮窗口 `{ x: 135, y: 87, width: 860, height: 650 }` 是第一版人工校准值，仍建议产品/美术做视觉确认。
- 当前 `H1.jpg` 到 `H5.jpg` 保留为美术输入源，但运行时、manifest、asset map、build bundle 和测试均使用规范化后的 PNG。
- `symbolsviewer` 接入是计划中的建议项，本次未接入；game003 自身测试已覆盖 manifest normal/state/scale、背景不进入 symbol map 和 PNG 普通态加载。
- 真实 live 浏览器验收需要可用 token 和 server。
- root `format:check` 仍有无关包既有格式失败，未在本任务中修改。

## 9. 最终 git status 摘要

已修改 tracked 文件：

- `agents.md`
- `packages/gameframeworks/README.md`
- `packages/gameframeworks/src/types.ts`
- `packages/rendercore/README.md`
- `packages/rendercore/src/reel/render-reel-set.ts`
- `packages/rendercore/src/reel/types.ts`
- `packages/rendercore/src/viewport/index.ts`
- `packages/rendercore/tests/reel/render-reel-set.test.ts`
- `packages/uiframeworks/README.md`
- `packages/uiframeworks/src/layout.ts`
- `packages/uiframeworks/src/types.ts`
- `packages/uiframeworks/tests/layout.test.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`

新增 untracked 任务交付物：

- `apps/game003/**`
- `assets/game003-s1/**`
- `assets/gamecfg003/**`
- `packages/rendercore/src/viewport/responsive-art-viewport.ts`
- `packages/rendercore/tests/viewport/responsive-art-viewport.test.ts`
- `tasks/62-game003-client-bootstrap.md`
- `tasks/62-game003-client-bootstrap-260629-094433.md`

未见 `.DS_Store`、`dist/`、`coverage/`、`node_modules/` 等生成物进入 git status。
