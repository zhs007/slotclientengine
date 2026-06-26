# game002 url skin selection 执行报告

## 1. 实现摘要

已按 `tasks/57-game002-url-skin-selection.md` 执行，为 `apps/game002` 增加 URL query 必需参数 `skin`：

- `skin=2` 使用 `assets/game002/bgfull.jpg`、`assets/symbols002`、`assets/symbols002/symbol-state-textures.manifest.json`。
- `skin=3` 使用 `assets/game003/bg.jpg`、`assets/symbols003`、`assets/symbols003/symbol-state-textures.manifest.json`。
- 两套皮肤继续共用 `assets/gamecfg002/gameconfig.json`、同一个 URL 传入的 `serverUrl` 和 `gamecode`。
- `skin` 不进入 live 协议字段，不改变 token、businessid、clienttype、jurisdiction、language、下注参数、spin request 或 collect 流程。
- 未新增 `apps/game003`，未新增 `assets/gamecfg003`，未使用动态字符串拼 Vite 资源路径。
- `skin=3` 不借用 `symbols002` 图片，不生成 placeholder，不把缺图 symbol 静默渲染为空。
- 260626 follow-up：按用户要求，把“每格本地轮带窗口偏移”算法实现放在 `packages/rendercore`；`game002` 使用 rendercore 的 `createGridCellReelOffsetMatrix(...)` 配置同列每往下一格额外偏移 `16`，让同列 9 个格子的滚动窗口更分散，最终 scene 仍严格等于服务器目标 scene。

## 2. 改动文件清单

- `apps/game002/src/skin-id.ts`：新增 skin id 类型、支持值和合法值解析。
- `apps/game002/src/skin-config.ts`：新增两套皮肤的静态资源配置、背景 import 和 symbol glob。
- `apps/game002/src/framework-config.ts` / `apps/game002/src/env.ts`：URL query 和 framework config 增加 `skin`。
- `apps/game002/src/main.ts`：根据 `config.skin` 获取 skin 配置并传入 adapter。
- `apps/game002/src/game-adapter.ts`：从 skin 配置加载背景、manifest 和 symbol modules。
- `apps/game002/src/game-layout.ts` / `apps/game002/src/game-demo.ts`：增加当前 skin 可贴图 symbol 集合校验，防止缺图 code 被 rendercore registry 静默当 empty；接入 rendercore per-cell reel offset 矩阵。
- `apps/game002/scripts/verify-static-dist.mjs`：release 检查扩展为同时校验两套背景和两套 symbol 资源，并按图片尺寸区分同名 PNG。
- `apps/game002/README.md`：补充必需 `skin` 参数、两套资源映射、失败规则和第三套缺资源边界。
- `apps/game002/tests/*`：补充 URL、资源、adapter、runtime、framework flow 和 source boundary 测试。
- `packages/rendercore/src/reel/grid-cell-reel-offsets.ts`：新增通用 grid-cell per-cell offset 矩阵生成和校验。
- `packages/rendercore/src/reel/grid-cell-spin-plan.ts` / `render-grid-cell-reel-set.ts` / `types.ts` / `index.ts`：grid-cell plan 和 reset 接受 `cellReelOffsets`，默认不传时保持旧行为。
- `packages/rendercore/tests/reel/*` / `packages/rendercore/README.md`：补充 offset 行为、失败规则和文档。

## 3. URL query 合同

`skin` 是必需参数，只接受字符串 `2` 或 `3`：

- 缺少 `skin`：失败。
- `skin` 为空或只有空白：失败。
- 重复 `skin`：失败。
- `skin=02`、`skin=game002`、`skin=game003`、`skin=1`、`skin=4`：失败。

`skin` 只决定前端资源。测试已覆盖 `skin=3` 时 `live.gamecode` 仍来自 URL `gamecode`，`spinRequest` 仍是 `{ bet, lines, times, autonums }`。

## 4. 资源映射

| skin | 背景 | symbol 目录 | manifest | runtime config |
| --- | --- | --- | --- | --- |
| `2` | `assets/game002/bgfull.jpg` | `assets/symbols002/*.png` | `assets/symbols002/symbol-state-textures.manifest.json` | `assets/gamecfg002/gameconfig.json` |
| `3` | `assets/game003/bg.jpg` | `assets/symbols003/*.png` | `assets/symbols003/symbol-state-textures.manifest.json` | `assets/gamecfg002/gameconfig.json` |

背景验收结果：

```text
assets/game002/bgfull.jpg  2000 x 2000
assets/game003/bg.jpg      2000 x 2000
```

manifest 验收结果：

```text
symbols002 1 spinBlur,disabled WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF
symbols003 1 spinBlur,disabled WL,H1,H2,L1,L2,L3,L4,CN,CO
```

gamecfg002 验收结果：

```text
WL=0,H1=1,H2=2,L1=3,L2=4,L3=5,L4=6,WM=7,CN=8,CM=9,CO=10,AF=11,BN=12
reels-001
0,1,2,3,4,5,6,8
```

## 5. 第三套缺资源边界

第三套当前不会收到缺资源 symbol 数据；如果未来服务端开始下发 `WM`、`CM`、`AF`、`BN`，必须先补齐 `assets/symbols003` 普通图、`spinBlur`、`disabled`、manifest、测试和 README。

当前实现保留 fail-fast：`skin=3` scene 出现 `WM` / `CM` / `AF` 时，`game002` 会在 scene 校验中显式失败，错误包含 scene label、坐标、code、symbol 和 skin label，例如 `symbol code 7 (WM) is missing assets for skin 3`。`BN` 仍是显式 empty symbol。

## 6. agents.md 判断

本任务是否更新 agents.md：否。

原因：本次新增的是 `packages/rendercore` 内的可复用 grid-cell reel 参数能力，并由 `apps/game002` 配置调用；这符合既有 agents 规则“rendercore 拥有通用 grid-cell reel 算法，游戏 app 只能配置和调用”，未新增长期协作规则。仓库内 `AGENTS.md` 和 `agents.md` 已用 `cmp -s AGENTS.md agents.md` 确认为一致。

## 7. 执行命令和结果

现状和资源盘点：

```bash
git status --short --untracked-files=all
git diff --stat
find assets/game002 assets/game003 assets/symbols002 assets/symbols003 -maxdepth 1 -type f -print | sort
sips -g pixelWidth -g pixelHeight assets/game002/bg.jpg assets/game002/bgfull.jpg assets/game003/bg.jpg
node -e 'const cfg=require("./assets/gamecfg002/gameconfig.json"); console.log(Object.entries(cfg.symbolCodes).map(([k,v])=>`${k}=${v}`).join(",")); console.log(Object.keys(cfg.reels).join(",")); console.log([...new Set(cfg.reels["reels-001"].flat())].sort((a,b)=>a-b).join(","));'
node -e 'for (const dir of ["symbols002","symbols003"]) { const m=require(`./assets/${dir}/symbol-state-textures.manifest.json`); console.log(dir, m.version, m.states.join(","), Object.keys(m.symbols).join(",")); }'
```

结果：通过，资源、背景尺寸、manifest 和 gamecfg002 与任务合同一致。

自动化验收：

```bash
env CI=true pnpm --filter game002 format:check
env CI=true pnpm --filter game002 lint
env CI=true pnpm --filter game002 typecheck
env CI=true pnpm --filter game002 test
env CI=true pnpm --filter game002 build
env CI=true pnpm --filter game002 release:check
env CI=true pnpm --filter @slotclientengine/rendercore format:check
env CI=true pnpm --filter @slotclientengine/rendercore lint
env CI=true pnpm --filter @slotclientengine/rendercore typecheck
env CI=true pnpm --filter @slotclientengine/rendercore test
env CI=true pnpm --filter @slotclientengine/rendercore build
git diff --check
```

结果：全部通过。

说明：第一次直接执行 `pnpm --filter game002 test` 被 pnpm 非 TTY modules purge 确认拦截，随后按 CI 环境方式使用 `env CI=true` 重跑通过。

二次遗漏检查：

```bash
find apps -maxdepth 1 -type d -name 'game003' -print
find assets -maxdepth 1 -type d -name 'gamecfg003' -print
rg -n "createGame002Adapter\\(\\)|symbols\\$|symbols\\$\\{|gamecfg003|apps/game003|assets/game002/bg\\.jpg\\?url|assets/symbols002.*symbols003|symbols003.*symbols002|skin\\s*===|skin\\s*==" apps/game002/src apps/game002/tests apps/game002/scripts apps/game002/README.md
cmp -s AGENTS.md agents.md
```

结果：未发现 `apps/game003` 或 `assets/gamecfg003`；未发现无参 `createGame002Adapter()`、动态拼 symbol 路径、运行时旧 portrait 背景 import 或 symbols002/symbols003 混借；`AGENTS.md` 和 `agents.md` 一致。

## 8. 浏览器验收

真实浏览器验收未由 Codex 执行。原因：用户明确说明“浏览器验收我来做”。本报告不声明真实 live spin 浏览器验收已通过。

建议用户浏览器验收 URL 使用脱敏形式：

```text
http://127.0.0.1:5206/?skin=2&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=<redacted>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
http://127.0.0.1:5206/?skin=3&serverUrl=wss%3A%2F%2Fexample.test%2F&gamecode=GAME_CODE&token=<redacted>&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=30&times=1&autonums=-1&requestTimeoutMs=30000
```

## 9. 最终工作区摘要

`git status --short --untracked-files=all`：

```text
 M apps/game002/README.md
 M apps/game002/scripts/verify-static-dist.mjs
 M apps/game002/src/env.ts
 M apps/game002/src/framework-config.ts
 M apps/game002/src/game-adapter.ts
 M apps/game002/src/game-demo.ts
 M apps/game002/src/game-layout.ts
 M apps/game002/src/main.ts
 M apps/game002/tests/assets.test.ts
 M apps/game002/tests/env.test.ts
 M apps/game002/tests/framework-flow.test.ts
 M apps/game002/tests/game-adapter.test.ts
 M apps/game002/tests/game-demo.test.ts
 M apps/game002/tests/source-boundary.test.ts
 M packages/rendercore/README.md
 M packages/rendercore/src/reel/grid-cell-spin-plan.ts
 M packages/rendercore/src/reel/index.ts
 M packages/rendercore/src/reel/render-grid-cell-reel-set.ts
 M packages/rendercore/src/reel/types.ts
 M packages/rendercore/tests/reel/grid-cell-spin-plan.test.ts
 M packages/rendercore/tests/reel/render-grid-cell-reel-set.test.ts
?? apps/game002/src/skin-config.ts
?? apps/game002/src/skin-id.ts
?? packages/rendercore/src/reel/grid-cell-reel-offsets.ts
?? tasks/57-game002-url-skin-selection-260626-112043.md
?? tasks/57-game002-url-skin-selection.md
```

`git diff --stat`：

```text
 apps/game002/README.md                             |  41 ++++--
 apps/game002/scripts/verify-static-dist.mjs        | 151 ++++++++++++++++++---
 apps/game002/src/env.ts                            |   5 +
 apps/game002/src/framework-config.ts               |   6 +
 apps/game002/src/game-adapter.ts                   |  47 ++++---
 apps/game002/src/game-demo.ts                      |  29 +++-
 apps/game002/src/game-layout.ts                    |   7 +
 apps/game002/src/main.ts                           |   4 +-
 apps/game002/tests/assets.test.ts                  | 117 ++++++++++++++--
 apps/game002/tests/env.test.ts                     |  39 ++++++
 apps/game002/tests/framework-flow.test.ts          |  12 +-
 apps/game002/tests/game-adapter.test.ts            |  29 ++--
 apps/game002/tests/game-demo.test.ts               | 110 +++++++++++++--
 apps/game002/tests/source-boundary.test.ts         |  13 +-
 packages/rendercore/README.md                      |  13 +-
 .../rendercore/src/reel/grid-cell-spin-plan.ts     |  15 +-
 packages/rendercore/src/reel/index.ts              |   1 +
 .../src/reel/render-grid-cell-reel-set.ts          |  18 ++-
 packages/rendercore/src/reel/types.ts              |  11 ++
 .../tests/reel/grid-cell-spin-plan.test.ts         |  75 ++++++++++
 .../tests/reel/render-grid-cell-reel-set.test.ts   |  40 +++++-
 21 files changed, 693 insertions(+), 90 deletions(-)
```

注：`git diff --stat` 不包含未跟踪的新文件；新文件见上方 `git status`。
