# buildgamestatic

`apps/buildgamestatic` 是构建期工具，用于把游戏静态 YAML 编译成 Vite 可打包的 TypeScript 模块。它只处理美术、发布或配置人员可改的静态配置，不复制资源、不生成 symbol 状态图，也不生成 `gameconfig.json`。

## 路径规则

YAML 中的资源路径统一写仓库根目录相对路径，例如：

```yaml
gameConfig: assets/gamecfg003/gameconfig.json
```

生成 TS 时会把这些路径转换成相对生成文件的 import 路径。图片 import 会保留 `?url`，symbol PNG 集合和 loading glob 资源会生成静态字面量 `import.meta.glob(...)`，确保 Vite 能分析和打包。

## CLI

生成：

```bash
CI=true pnpm --filter buildgamestatic dev -- --input apps/game003/config/game-static.yaml --out apps/game003/src/generated/game-static.generated.ts --loading-out apps/game003/src/generated/game-loading.generated.ts --game game003
```

只校验同步、不写文件：

```bash
CI=true pnpm --filter buildgamestatic dev -- --input apps/game003/config/game-static.yaml --out apps/game003/src/generated/game-static.generated.ts --loading-out apps/game003/src/generated/game-loading.generated.ts --game game003 --check
```

参数：

- `--input <yaml-file>`：必填，只接受 `.yaml` / `.yml`。
- `--out <ts-file>`：必填，只接受 `.ts`。
- `--loading-out <ts-file>`：可选，只接受 `.ts`；当 YAML 存在 `loading.resources` 时必填，并同步生成轻量 loading 资源模块。
- `--game <game-id>`：必填，必须与 YAML `gameId` 一致。
- `--root <repo-root>`：可选，默认从当前目录向上查找仓库根。
- `--check`：可选，只比较生成内容与磁盘文件是否一致，不覆盖输出。

## 失败策略

- YAML 未知字段、缺字段、重复 skin、非法 URL、非法数字、非法路径或引用文件不存在都会显式失败。
- `gameConfig` 只引用已生成的 JSON，不把 Excel、reel 或 paytable 内容复制进 YAML。
- `symbol-state-textures.manifest.json` 仍是 symbol 集合和 scale 的权威来源。
- `orientation-focus` art variant 必须声明 `focusRect`、`frameFocusRect` 和 `mainReelBackgroundPositionInFocusRect`；如果声明 `conveyor`，必须使用 `positionInFocusRect`，旧 `placement` 字段会按未知字段失败。
- `mainReelBackgroundPositionInFocusRect` 和 `conveyor.positionInFocusRect` 是相对 `focusRect` 左上角的偏移，允许负数用于向上或向左微调；映射后的 `rect + size` 必须仍位于背景 art 内。
- `reelAreaInMainReelBackground` 是相对 `mainReelBackground` 左上角的转轮内容区配置，YAML 必须显式声明 `x/y/reelCount/reelGap/cellWidth/cellHeight`；`reelCount` 必须与顶层 `reel.reelCount` 一致，生成物中的 `width` 等于 `reelCount * cellWidth + reelGap` 总和，`height` 等于 `visibleRows * cellHeight`。
- `loading.resources` 如果存在，id 必须唯一，path / glob 必须二选一，weight 必须是有限正数；宽泛 `*.png` loading glob 会显式失败。
- 生成内容确定性，不包含时间戳、绝对路径、用户名或 token。
- `game-static.generated.ts` 和 `game-loading.generated.ts` 是生成物；修改 YAML 后必须重新生成并使用 `--check` 校验同步。
