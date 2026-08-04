# game003

`apps/game003` 是只消费 Game Layout Editor 正式包的 live slot 客户端。当前仅支持显式 `skin=2`，资源唯一来源是 `assets/minecart2`；仓库不再保留旧皮肤目录，也不提供资源或功能回退。

## 资源与生成物

- 运行配置：`apps/game003/config/game-runtime.manifest.json`
- Scene Layout package：`assets/minecart2/layout.manifest.json`、`assets/minecart2/assets.map.json` 和映射 payload
- 优化器资源分组：`assets/minecart2.assets-groups.json`
- Vite 资源生成物：`apps/game003/src/generated/minecart2-layout-resources.generated.ts`

内部 symbol package id 仍可为 `game003-s1`；它只是 ZIP 中的稳定 package identity，不代表仓库目录或可选皮肤。布局、横竖屏 adaptation、公开轮带、symbol manifest、Spine/VNI 资源和 award-celebration popup 都从 Minecart2 package 闭包读取。

替换资源包后执行：

```bash
CI=true pnpm --filter gamelayoutpkgcli build
CI=true pnpm --filter gamelayoutpkgcli dev -- optimize --input <layout.zip> --output <optimized.zip> --quality 80 --assets-groups-output assets/minecart2.assets-groups.json
CI=true pnpm --filter game003 generate:minecart2-layout-resources
CI=true pnpm --filter game003 check:minecart2-layout-resources
```

优化 ZIP 必须完整展开到 `assets/minecart2`，不得挑文件覆盖。`assets.map.json` 是 logical path 到内容寻址 payload 的唯一映射，生成的 TypeScript 文件禁止手改。

## 当前功能边界

- 主转轮使用 package 的 `BaseGame`、`bg-reel01` 和 5×5 geometry。
- `bg-wins` symbol 中奖轮播、`bg-gencoins`/CO 金币金额覆盖仍由 app 的严格 typed extension 处理。
- 金额显示使用 `formatServerAmount(...)`，服务器整数按 cents 解释且不显示货币符号；package popup 仍由 game-owned formatter 注入。
- 传送带、动态 `bg-bar` 和矿车互动暂不提供。即使 package 中存在相关静态节点或逐步补充的资源，app 也不解析服务器 feature bar、不创建相关 runtime、不把它们加入 spin 等待条件。
- package 已包含 BaseGame/FreeGame/BonusGame 资源和 transition 视频；当前任务不新增业务 mode-switch 编排。

## Loading 顺序

`src/main.ts` 只加载 simple loading UI 和 package physical resources。资源到 99% 后动态导入游戏 runtime，`prepareGame003At99()` 解析 query、准备 Minecart2 resource ownership，并完成 live `connect + enterGame`；到 100% 后 `enterGame003()` 才创建 framework 和 Pixi presentation。

## Live URL

必需参数：

```text
skin=2
token=<token>
businessid=<business id>
clienttype=<client type>
jurisdiction=<jurisdiction>
language=<language>
bet=5
lines=10
times=1
autonums=-1
requestTimeoutMs=30000
```

`gamecode` 可省略；提供时必须等于固定配置。`serverUrl` query 参数显式失败。

## 验收

```bash
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 check:resources
CI=true pnpm --filter game003 release:check
```

浏览器人工验收需检查横竖屏 loading、默认画面、spin 落停、CO 金额、中奖轮播和 award popup。本任务的浏览器验收由用户执行。
