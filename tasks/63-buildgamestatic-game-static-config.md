# buildgamestatic game static config 任务计划

## 1. 任务目标

本任务初始化 `apps/buildgamestatic` 构建期工具，并把 `game003` 中适合给美术、外部配置人员或发布流程修改的静态配置迁移到 YAML。构建时由 `apps/buildgamestatic` 把 YAML 编译成 TypeScript 静态配置模块，`apps/game003` 直接通过变量导入使用，最终随 Vite 一起打包进静态游戏包体。

本任务必须同时完成三层工作：

- `packages/gameframeworks`：提供游戏静态配置的核心类型、运行期校验、通用 helper 和导出入口。
- `apps/buildgamestatic`：新增 CLI，把 YAML 静态配置编译为确定性的 `.generated.ts` 文件，并支持校验生成物是否同步。
- `apps/game003`：新增 `config/game-static.yaml`，生成 `src/generated/game-static.generated.ts`，并把当前散落在 `framework-config.ts`、`skin-config.ts`、`game-layout.ts`、`game-demo.ts`、`game-adapter.ts`、`main.ts` 中的合适静态配置改为从生成模块读取。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、文档同步、协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/63-buildgamestatic-game-static-config-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/63-buildgamestatic-game-static-config-260630-123456.md
```

## 2. 当前仓库事实

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- VS Code 调试运行 TypeScript：`ts-node`

如果依赖安装或下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game003 test
CI=true pnpm --filter buildgamestatic test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

## 3. 静态配置范围判定

不是所有配置都放到 YAML。本任务只把“美术可能会改，或外部希望修改但不应该改 TypeScript 代码”的静态配置放入 YAML。

### 3.1 必须进入 YAML 的配置

`game003` 当前应迁入 YAML 的配置包括：

- 游戏静态身份：
  - `gameId`
  - `brandLabel`
  - 固定 live `gamecode`
  - 固定 live `servaddr` / `serverUrl`
- skin 静态表：
  - 支持的 skin id
  - skin label
  - 每套 skin 的资源路径
- game config 引用：
  - `assets/gamecfg003/gameconfig.json` 的路径
  - 只引用生成后的 `gameconfig.json`，不要把完整 paytable / reel 内容复制进 YAML
- symbol 资源引用：
  - `assets/game003-s1/symbol-state-textures.manifest.json`
  - `assets/game003-s1/*.png` 的 Vite glob
  - 可选的显式空图标列表或服务器映射边界
  - 可展示 symbol 集合默认以 manifest 的 `symbols` key 为准，不在 YAML 维护第二份列表
- 转轮方式：
  - `kind: normal`
  - `reelsName: bg-reel01`
  - `reelCount: 5`
  - `visibleRows: 5`
  - 方向、最小滚动圈数、时长、速度、启动/停止延迟等表现参数
- 背景适配方案：
  - `mode: orientation-focus`
  - 横版 / 竖版 art variant
  - 每个 variant 的背景图片、art size、focus rect、frame policy 所需 focus size / margin
- `game003` 专属画面布局：
  - `mainreelbg.png` 路径和尺寸
  - `conveyor1.png` / `conveyor2.png` 路径和尺寸
  - `scenePartGap: 10`
  - 横版传送带在主转轮左侧、底部对齐
  - 竖版传送带在主转轮上方、居中
  - 主转轮窗口在 `mainreelbg.png` 内的 `{ x, y, width, height }`

### 3.2 不应该进入 YAML 的配置

以下内容不能放进 YAML：

- 真实 live token、一次性登录链接、密钥、cookie。
- `businessid`、`clienttype`、`jurisdiction`、`language`、`requestTimeoutMs` 等运行期 URL 输入。
- 玩家本次下注、自动次数等会随入口、玩家或运营流程变化的运行期输入；可以保留在 URL query 中。
- 服务器真实轮带。live slot 前端不能读取、缓存或泄露服务器真实轮带。
- `assets/gamecfg003/gameconfig.json` 里的完整 reel / paytable 数据；这些仍由 `apps/gengameconfig` 从 Excel 生成。
- symbol 的显示 `scale` 第二份表；当前 `assets/game003-s1/symbol-state-textures.manifest.json` 每个可展示 symbol 已显式 `scale: 1`，`game003` 应继续从 manifest 读取。
- Pixi 生命周期、动画状态机、reel 调度、临时目标窗口注入算法、DOM frame resize 算法。
- 为了兼容坏配置而添加的隐藏 fallback、自动猜测或静默忽略逻辑。

## 4. 目标文件结构

新增：

```text
apps/buildgamestatic/
apps/buildgamestatic/package.json
apps/buildgamestatic/tsconfig.json
apps/buildgamestatic/tsconfig.eslint.json
apps/buildgamestatic/vitest.config.ts
apps/buildgamestatic/eslint.config.cjs
apps/buildgamestatic/README.md
apps/buildgamestatic/src/index.ts
apps/buildgamestatic/src/cli.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/src/path-utils.ts
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/tests/cli.test.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/tests/static-config.test.ts
```

修改：

```text
package.json
pnpm-lock.yaml
packages/gameframeworks/package.json
packages/gameframeworks/README.md
packages/gameframeworks/src/index.ts
packages/gameframeworks/src/static-config/index.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/frame-policy.ts
packages/gameframeworks/tests/static-config.test.ts
packages/gameframeworks/tests/exports.test.ts
apps/game003/package.json
apps/game003/README.md
apps/game003/src/framework-config.ts
apps/game003/src/env.ts
apps/game003/src/skin-id.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-layout.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/src/main.ts
apps/game003/scripts/verify-static-dist.mjs
apps/game003/tests/*.test.ts
agents.md
```

如果执行时发现 `src/generated` 或 `config` 是空目录，必须放置 `.keepme`；但本任务会直接写入 YAML 和生成 TS，通常不需要 `.keepme`。

## 5. 设计合同

### 5.1 source of truth

- 手工编辑源是 `apps/game003/config/game-static.yaml`。
- YAML 必须带中文注释，面向美术/配置人员解释每个大块和容易改错的字段。
- YAML 注释只用于人工理解，不能作为程序语义；`apps/buildgamestatic` 只能读取 YAML 数据字段，不能依赖注释内容。
- 生成文件是 `apps/game003/src/generated/game-static.generated.ts`。
- `game-static.generated.ts` 初次实现时必须提交到 git，方便 TypeScript import、代码评审和 IDE 跳转；但文件头必须写清楚“由 buildgamestatic 生成，禁止手改”。
- `apps/game003` 的 `build`、`dev`、`test`、`typecheck`、`release:check` 必须自动刷新或校验生成文件，不能依赖执行者手动先跑一次生成命令。
- 生成输出必须确定性：同一 YAML、同一仓库路径、同一工具版本生成的 TS 内容完全一致，不包含时间戳、绝对路径或随机排序。

### 5.2 YAML 路径规则

- YAML 中的资源路径统一写成相对仓库根目录的路径，例如：

```yaml
gameConfig: assets/gamecfg003/gameconfig.json
```

- `apps/buildgamestatic` 根据 `--root` 或当前 repo root 解析这些路径，并在生成 TS 时转换为相对 `apps/game003/src/generated/game-static.generated.ts` 的 import 路径。
- 生成 TS 中的图片 import 必须保留 Vite query：

```ts
import landscapeBackgroundUrl from "../../../../assets/game003-s1/bg1.jpg?url";
```

- 生成 TS 中的 symbol PNG 集合必须使用静态字面量 glob，确保 Vite 能分析：

```ts
const symbolModules = import.meta.glob("../../../../assets/game003-s1/*.png", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;
```

### 5.3 gameframeworks 核心职责

`packages/gameframeworks` 负责浏览器安全、与具体游戏无关的静态配置类型和 helper，不依赖 YAML 解析库，不读取文件系统，不知道 `game003` 的图片名。

建议新增导出入口：

```text
@slotclientengine/gameframeworks/static-config
```

建议核心类型：

```ts
export interface SlotGameStaticConfig {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly brandLabel: string;
  readonly live: SlotGameStaticLiveConfig;
  readonly supportedSkins: readonly string[];
  readonly gameConfig: unknown;
  readonly skins: Readonly<Record<string, SlotGameStaticSkinConfig>>;
  readonly reel: SlotGameStaticReelConfig;
}

export interface SlotGameStaticLiveConfig {
  readonly serverUrl: string;
  readonly gamecode: string;
  readonly rejectQueryParams: readonly string[];
}

export type SlotGameStaticReelConfig =
  | SlotGameStaticNormalReelConfig
  | SlotGameStaticGridCellReelConfig;
```

第一版 `game003` 只实现并使用 `kind: "normal"`，但类型上可以预留 `grid-cell`，不得把 grid-cell 具体算法塞进 `game003`。

建议 helper：

- `assertSlotGameStaticConfig(config)`：校验 schema、skin、live server、frame policy、reel config、资源对象基本形态。
- `getSlotGameStaticSkin(config, skinId)`：找不到 skin 时显式失败。
- `createSlotGameFramePolicyFromStaticConfig(config, skinId)`：从静态配置创建 `SlotGameFramePolicy`。
- `parseSlotGameStaticSkinId(config, value)`：根据静态配置校验 URL 中的 skin。
- `assertNoRejectedQueryParams(params, config.live.rejectQueryParams)`：用于拒绝 `serverUrl` 等旧 query。

所有 helper 必须 fail-fast：缺字段、未知字段、非法数字、空字符串、重复 skin、非法 URL、focus rect 越界、reel 尺寸不一致都直接抛错。

### 5.4 buildgamestatic 职责

`apps/buildgamestatic` 是 Node CLI，负责 YAML -> TS：

- 读取 YAML。
- 严格校验 YAML schema，未知字段报错。
- 校验引用文件存在。
- 校验图片 / JSON / manifest 路径扩展名符合配置含义。
- 生成 import 语句和 `GAME003_STATIC_CONFIG`。
- 支持 `--check`，用于比较磁盘生成文件是否与当前 YAML 同步。
- 不复制资源文件，不修改图片，不生成 symbol 状态图，不生成 `gameconfig.json`。

建议 CLI：

```bash
CI=true pnpm --filter buildgamestatic dev -- \
  --input apps/game003/config/game-static.yaml \
  --out apps/game003/src/generated/game-static.generated.ts \
  --game game003
```

校验生成物同步：

```bash
CI=true pnpm --filter buildgamestatic dev -- \
  --input apps/game003/config/game-static.yaml \
  --out apps/game003/src/generated/game-static.generated.ts \
  --game game003 \
  --check
```

`--check` 失败时只报差异原因，不自动覆盖文件。

### 5.5 game003 URL 合同

`gamecode` 和 `serverUrl` 移入 YAML 后，`game003` 仍必须保持显式边界：

- URL query 中继续禁止 `serverUrl`，出现即显式失败。
- `gamecode` 可以不再作为必填 query；如果旧链接继续携带 `gamecode`，必须与 YAML 中固定值完全一致，否则显式失败。
- `skin` 仍是 live 入口必填 query，并按 YAML `supportedSkins` 校验；当前第一版只接受 `skin=1`。
- `token`、`businessid`、`clienttype`、`jurisdiction`、`language`、`bet`、`lines`、`times`、`autonums`、`requestTimeoutMs` 仍从 URL query 读取。
- token 中包含 `+`、`&`、`=` 等字符时仍要求调用方使用 `encodeURIComponent()`，错误信息不能泄露真实 token。

## 6. game003 YAML 草案

实现时可按实际类型名微调，但必须保留同等信息量和失败边界。

```yaml
# 配置版本。后续 schema 变化时递增，当前只支持 1。
schemaVersion: 1

# 游戏静态身份。brandLabel 会显示在框架 UI 上。
gameId: game003
brandLabel: game003

# 固定 live 连接信息。serverUrl 不允许被 URL query 覆盖。
live:
  serverUrl: wss://gameserv.rgstest.slammerstudios.com/
  gamecode: EfedJuHEaydXNghnmO9KI
  # 旧链接如果继续携带这些参数，初始化必须显式失败。
  rejectQueryParams:
    - serverUrl

# 当前第一版只支持 skin=1。
supportedSkins:
  - "1"

# 由 apps/gengameconfig 从 Excel 生成的逻辑配置，只在这里引用，不复制内容。
gameConfig: assets/gamecfg003/gameconfig.json

# 主转轮表现参数。kind=normal 表示使用 rendercore 普通转轮。
reel:
  kind: normal
  reelsName: bg-reel01
  reelCount: 5
  visibleRows: 5
  direction: forward
  minimumSpinCycles: 8
  baseDurationMs: 1300
  speedSymbolsPerSecond: 44
  startDelayMs: 80
  stopDelayMs: 120

# 每套皮肤的资源和布局配置。新增皮肤时在这里追加，不要改 game002。
skins:
  "1":
    label: skin 1
    # symbol 集合和缩放以 manifest 为准，YAML 不维护第二份 scale 表。
    symbols:
      manifest: assets/game003-s1/symbol-state-textures.manifest.json
      pngGlob: assets/game003-s1/*.png
      emptySymbols: []
      requireExplicitScale: true
      requiredStates:
        - spinBlur
        - disabled
    # 横竖屏 art 适配。focusRect 坐标相对于对应背景完整 art。
    art:
      mode: orientation-focus
      scenePartGap: 10
      variants:
        landscape:
          # 横版背景和重点区域。
          background:
            path: assets/game003-s1/bg1.jpg
            width: 2000
            height: 2000
          focusRect:
            x: 288
            y: 588
            width: 1424
            height: 824
          frameFocusRect:
            width: 1424
            height: 1061
          conveyor:
            path: assets/game003-s1/conveyor1.png
            width: 284
            height: 775
            placement: left-bottom-of-main-reel
        portrait:
          # 竖版背景和重点区域。
          background:
            path: assets/game003-s1/bg2.jpg
            width: 1174
            height: 2000
          focusRect:
            x: 22
            y: 469.5
            width: 1130
            height: 1061
          frameFocusRect:
            width: 1130
            height: 1061
          minFocusMargin:
            left: 22
            right: 22
          conveyor:
            path: assets/game003-s1/conveyor2.png
            width: 934
            height: 227
            placement: top-center-of-main-reel
      # 主转轮框资源，位置组合属于 game003 专属布局。
      mainReelBackground:
        path: assets/game003-s1/mainreelbg.png
        width: 1130
        height: 824
      # 主转轮窗口坐标相对于 mainreelbg.png。
      reelWindowInMainReelBackground:
        x: 135
        y: 87
        width: 860
        height: 650
```

说明：

- `placement` 是 `game003` 专属布局配置，不进入 `rendercore`。
- `orientation-focus` 是通用适配方案，`gameframeworks` / `uiframeworks` 仍只处理 DOM frame；art 裁切和映射继续由 `rendercore` 承担。
- `symbol-state-textures.manifest.json` 仍是 symbol 集合和 scale 的权威来源。
- `gameConfig` 只引用生成好的 `gameconfig.json`，不把 Excel 或 JSON 内容嵌入 YAML。

## 7. 实施步骤

### 7.1 盘点和锁定当前行为

执行：

```bash
git status --short --untracked-files=all
git diff --stat
```

复核当前文件：

```text
apps/game003/src/framework-config.ts
apps/game003/src/skin-id.ts
apps/game003/src/skin-config.ts
apps/game003/src/game-layout.ts
apps/game003/src/game-demo.ts
apps/game003/src/game-adapter.ts
apps/game003/src/main.ts
apps/game003/tests/framework-config.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/game-demo.test.ts
apps/game003/scripts/verify-static-dist.mjs
packages/gameframeworks/src/types.ts
packages/gameframeworks/src/index.ts
```

先记录当前硬编码值，不要边想边改，避免漏迁：

- `GAME003_GAMECODE`
- `GAME003_LIVE_SERVER_URL`
- `GAME003_SUPPORTED_SKINS`
- 背景、主转轮框、传送带、manifest、gameconfig import 路径
- `GAME003_REELS_NAME`
- `GAME003_REEL_COUNT`
- `GAME003_VISIBLE_ROWS`
- art size
- `focusRegion`
- frame policy
- `GAME003_REEL_WINDOW_IN_MAIN_REEL_BG`
- reel timing

### 7.2 实现 gameframeworks 静态配置核心

在 `packages/gameframeworks/src/static-config/` 新增类型和 helper。

验收要求：

- 不引入 `yaml`、`fs`、`path` 等 Node-only 依赖到 `gameframeworks` 浏览器入口。
- 新增 `@slotclientengine/gameframeworks/static-config` package export，`packages/gameframeworks/tests/exports.test.ts` 覆盖。
- `assertSlotGameStaticConfig` 对非法配置显式抛错，不补默认值。
- `createSlotGameFramePolicyFromStaticConfig` 能生成现有 `game003` 等价的 `orientation-focus` frame policy。
- `parseSlotGameStaticSkinId` 根据配置中的 skin 表校验，不再 hard-code `"1"`。

测试建议：

- 缺少 `landscape` / `portrait` variant 失败。
- `serverUrl` 非 `ws://` / `wss://` 失败。
- `gamecode` 为空失败。
- `focusRect` 超出 art size 失败。
- `reelWindow` 宽度不能整除 reelCount 失败。
- `normal` reel 的 `reelCount` / `visibleRows` 非正整数失败。

### 7.3 初始化 apps/buildgamestatic

新增 workspace app `apps/buildgamestatic`。

建议 `package.json`：

```json
{
  "name": "buildgamestatic",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "bin": {
    "buildgamestatic": "dist/index.js"
  },
  "scripts": {
    "prepare:deps": "pnpm --filter @slotclientengine/gameframeworks build",
    "build": "pnpm run prepare:deps && tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "pnpm run prepare:deps && node --loader ts-node/esm src/index.ts",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "pnpm lint && pnpm test && pnpm typecheck && pnpm build"
  },
  "dependencies": {
    "@slotclientengine/gameframeworks": "workspace:*",
    "yaml": "^2.4.2"
  }
}
```

如果实现中发现 `node --loader ts-node/esm` 与当前工具链不稳定，可以改为先 `build` 再 `node dist/index.js` 的流程，但必须保持脚本和报告说明一致。

`apps/buildgamestatic` 如果从 `@slotclientengine/gameframeworks/static-config` 导入类型或 helper，必须在 `dev`、`typecheck`、`build` 前先构建 `@slotclientengine/gameframeworks`。不要通过复制 `gameframeworks` 的校验逻辑来绕开构建顺序。

CLI 参数：

- `--input <yaml-file>`：必填，只接受 `.yaml` 或 `.yml`。
- `--out <ts-file>`：必填，只接受 `.ts`。
- `--game <game-id>`：必填，当前用于生成稳定 export 名、错误信息和注释。
- `--root <repo-root>`：可选；默认从当前命令所在 repo root 解析。
- `--check`：可选，只比较不写文件。

CLI 失败必须设置 `process.exitCode = 1`，并输出清晰中文错误。错误信息不得吞掉真实异常，也不得输出 token、密钥或完整外部链接。

### 7.4 生成 TypeScript 模块

生成文件路径：

```text
apps/game003/src/generated/game-static.generated.ts
```

生成内容必须包括：

- `GAME003_STATIC_CONFIG`
- `GAME003_STATIC_SKIN_MODULES` 或等价结构
- game config JSON import
- symbol manifest JSON import
- 图片 URL import
- symbol PNG `import.meta.glob`

生成文件必须使用 `as const` / `Object.freeze` 保持只读语义，并通过 `assertSlotGameStaticConfig(...)` 做启动期校验。

生成文件禁止包含：

- 绝对路径。
- 当前时间。
- 用户名。
- token。
- `serverUrl` query 示例。
- 从 YAML 自动猜出来但 YAML 未声明的行为配置。

### 7.5 集成 game003

修改 `apps/game003`：

- `src/framework-config.ts`
  - 从 `GAME003_STATIC_CONFIG.live` 读取固定 `serverUrl` 和 `gamecode`。
  - `serverUrl` query 继续显式失败。
  - `gamecode` query 不再必填；若提供则必须等于静态配置值。
  - 保留 token 和其它运行期 query 校验。
- `src/skin-id.ts`
  - 使用生成配置的 `supportedSkins` 校验。
  - 当前仍只接受 `skin=1`，但不 hard-code 错误文本。
- `src/skin-config.ts`
  - 从生成配置读取背景 URL、传送带 URL、manifest、symbol modules、label、empty symbols。
  - 可展示 symbols 从 manifest key 派生，除非 manifest 与 YAML 明确边界冲突。
- `src/game-layout.ts`
  - 从生成配置读取 art size、focus rect、frame policy、main reel background、conveyor、gap、reel window。
  - 保留 `game003` 专属 placement 计算在 app 内。
  - 不把 `mainreelbg/conveyor` 的游戏特殊布局上移到 `rendercore`。
- `src/game-demo.ts`
  - 从生成配置读取 reel kind、reelsName、visibleRows、timing。
  - 第一版只允许 `kind: "normal"`；若 YAML 改为未知 kind，显式失败。
- `src/game-adapter.ts`
  - 从生成配置读取 raw game config 和静态贴图预期尺寸。
  - 仍由 `rendercore` / `gameframeworks` 处理通用算法，app 只做配置和调用。
- `src/main.ts`
  - 从生成配置读取 `brandLabel`、`framePolicy`、design size。

修改 `apps/game003/package.json`：

```json
{
  "scripts": {
    "generate:static-config": "pnpm --dir ../.. --filter buildgamestatic dev -- --input apps/game003/config/game-static.yaml --out apps/game003/src/generated/game-static.generated.ts --game game003",
    "check:static-config": "pnpm --dir ../.. --filter buildgamestatic dev -- --input apps/game003/config/game-static.yaml --out apps/game003/src/generated/game-static.generated.ts --game game003 --check"
  }
}
```

并把 `generate:static-config` 串入 `build`、`dev`、`test`、`typecheck`、`release:check`。`release:check` 还必须运行 `check:static-config`，防止 YAML 和生成 TS 漂移。

`dev` 第一版只要求启动前生成一次静态配置；如果开发期间修改 YAML，需要重新执行 `generate:static-config` 或重启 dev server。除非任务执行时明确新增 watcher，否则不要在本任务里引入额外 watch 依赖。

### 7.6 更新 release check

扩展 `apps/game003/scripts/verify-static-dist.mjs`：

- 检查 `apps/game003/config/game-static.yaml` 存在。
- 检查生成 TS 与 YAML 同步；可通过调用 `pnpm --filter game003 check:static-config` 或复用 `buildgamestatic --check`。
- dist 中仍必须包含：
  - `bg1-*.jpg`
  - `bg2-*.jpg`
  - `mainreelbg-*.png`
  - `conveyor1-*.png`
  - `conveyor2-*.png`
  - 所有 manifest symbol 的 normal / `spinBlur` / `disabled` PNG
- dist 中不能包含：
  - `VITE_GAME003_`
  - `import.meta.env`
  - `example.test`
  - `SECRET`
  - `H1.jpg` 到 `H5.jpg` 的运行时引用
  - `serverUrl=` 示例 query

因为 `dist/` 被 `.gitignore` 忽略，任何构建产物扫描都必须使用 `rg --no-ignore` 或 Node 脚本直接遍历 `dist/`。

### 7.7 更新文档和协作规则

更新 `apps/game003/README.md`：

- 说明 `config/game-static.yaml` 是静态配置源。
- 说明 YAML 必须保留中文注释，方便美术/配置人员直接编辑；注释不参与程序语义。
- 说明 `src/generated/game-static.generated.ts` 是生成文件，不手改。
- 说明如何修改 YAML 后生成、校验、发布。
- 明确 `gameConfig` 只是引用 `assets/gamecfg003/gameconfig.json`，Excel -> JSON 仍由 `gengameconfig` 负责。
- 明确 symbol scale 仍由 manifest 负责。
- 更新 URL 示例：`serverUrl` 不允许，`gamecode` 可省略或必须匹配静态值。

更新 `packages/gameframeworks/README.md`：

- 增加静态配置类型和 `static-config` export 的使用说明。
- 说明 `gameframeworks` 不解析 YAML，只提供浏览器安全类型和校验。

更新 `apps/buildgamestatic/README.md`：

- 写清 CLI 参数、路径规则、`--check`、失败策略、示例命令。

更新 `agents.md`：

- 新增规则：游戏静态 YAML 只承载美术/发布可改的静态配置，不承载 token、服务器真实轮带或运行期玩家输入。
- 新增规则：游戏静态 YAML 应保留中文注释，解释字段用途和坐标基准；注释只给人看，不作为构建逻辑依据。
- 新增规则：`game-static.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 后必须同步生成和校验。
- 新增规则：`game003` 的 symbol scale 仍以 manifest 为准，不在 YAML 或 app 内维护第二份 scale 表。

## 8. 测试计划

### 8.1 gameframeworks

新增并运行：

```bash
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks build
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
```

必须覆盖：

- 静态配置合法样例通过。
- 缺 `schemaVersion`、未知字段、非法 URL、非法 skin、非法 rect、非法 reel 配置失败。
- `orientation-focus` frame policy 与当前 `game003` 行为一致。
- `static-config` export 可从构建产物导入。

### 8.2 buildgamestatic

新增并运行：

```bash
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter buildgamestatic format:check
```

必须覆盖：

- CLI 缺参数、重复参数、未知参数、扩展名错误均失败。
- YAML 未知字段失败。
- 引用文件不存在失败。
- 生成 TS import 路径是相对路径，不含绝对路径。
- `--check` 在生成物一致时通过，不一致时失败且不写文件。
- 生成内容稳定排序，重复运行无 diff。

### 8.3 game003

新增并运行：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 build
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter game003 format:check
```

必须覆盖：

- `parseGame003QueryConfig` 不再要求 `gamecode` 必填；如果 query 提供错误 `gamecode`，显式失败。
- query 中提供 `serverUrl` 仍显式失败。
- `skin=1` 来自 YAML 支持列表，`skin=2` 失败。
- frame policy 与当前 `createGame003FramePolicy()` 的输出等价。
- 横版 / 竖版布局数值与当前行为等价：
  - 横版 focus `{ x: 288, y: 588, width: 1424, height: 824 }`
  - 竖版 focus `{ x: 22, y: 469.5, width: 1130, height: 1061 }`
  - 主转轮窗口 `{ x: 135, y: 87, width: 860, height: 650 }`
  - cell `172 x 130`
- `reel.kind = normal` 时仍使用普通 `RenderReelSet` 和本地公开轮带。
- symbol manifest 的 `scale=1` 仍被读取并校验；YAML 不提供第二份 scale。
- dist 产物仍通过当前静态发布检查。

### 8.4 仓库卫生

最终执行：

```bash
git diff --check
git status --short --untracked-files=all
```

如果新增依赖，必须执行：

```bash
pnpm install
```

并在报告中说明 `pnpm-lock.yaml` 变化。若下载失败，使用本计划第 2 节代理后重试。

## 9. 验收标准

任务完成必须满足：

- `apps/buildgamestatic` 存在，能从 YAML 生成 TypeScript。
- `packages/gameframeworks` 提供静态配置核心类型和 helper，且不引入 Node-only 或 YAML 依赖到浏览器入口。
- `apps/game003/config/game-static.yaml` 是 `game003` 静态配置源。
- `apps/game003/config/game-static.yaml` 含中文注释，能让美术/配置人员理解字段用途、坐标基准和修改边界。
- `apps/game003/src/generated/game-static.generated.ts` 由工具生成，内容确定性，无绝对路径、无 token、无时间戳。
- `game003` 的当前视觉和运行合同不因迁移而变化。
- `serverUrl` query 仍显式失败。
- `gamecode` 固定来自 YAML；旧 query 若传入错误值必须显式失败。
- `skin` 校验来自 YAML 支持列表，当前仍只支持 `skin=1`。
- `game003` 仍使用 `assets/gamecfg003/gameconfig.json` 的本地公开轮带；服务器目标 scene 仍只叠加进本轮临时可见窗口。
- symbol scale 仍来自 `symbol-state-textures.manifest.json`，YAML 不维护第二份 scale。
- 没有不必要的兜底或静默忽略。
- 所有第 8 节命令通过，或者报告中明确记录与本任务无关的既有失败，并提供任务相关 package-local 命令已通过的证据。
- `agents.md` 已同步静态 YAML / 生成 TS / symbol scale 边界。
- 新增中文任务报告符合 `tasks/63-buildgamestatic-game-static-config-[utctime].md` 命名。

## 10. 非目标

本任务不做：

- 不改 `game002`。
- 不新增 `game004`。
- 不把 `game003-s1` 做成 `game002` 新皮肤。
- 不改 live server 协议。
- 不让 URL query 覆盖 YAML 中固定的 `serverUrl`。
- 不把服务器真实轮带放到 YAML、TS 或打包产物。
- 不扩展运行时去支持 JPG symbol 普通态。
- 不把 `mainreelbg/conveyor` 专属布局上移到 `rendercore`。
- 不把 `assets/gamecfg003/gameconfig.json` 的完整内容复制进 YAML。
- 不为了测试方便修改生产逻辑或添加隐藏 fallback。

## 11. 第二遍遗漏检查

提交报告前按以下清单复查：

- 目标树：`apps/buildgamestatic`、`packages/gameframeworks/src/static-config`、`apps/game003/config`、`apps/game003/src/generated` 文件齐全。
- package：新增 package 已进入 workspace，`pnpm-lock.yaml` 与依赖变化一致。
- schema：YAML 未知字段、缺字段、非法路径、非法 URL、非法数字都会失败。
- 注释：YAML 保留中文注释，但构建工具不依赖注释语义。
- 生成：`generate:static-config` 重复运行无 diff，`check:static-config` 能抓住手改生成文件。
- 路径：生成 TS 中 import 全部为相对路径，Vite `?url` 和 `import.meta.glob` 可被静态分析。
- live：`serverUrl` query 失败，`gamecode` query 错误失败，token 不泄露。
- gamecfg：YAML 只引用 `gameconfig.json`，没有复制 reel/paytable。
- symbols：manifest 是 symbol 集合和 scale 权威来源，背景/传送带没有进 symbol catalog。
- reel：普通 reel、本地公开轮带、临时目标窗口合同未被破坏。
- 适配：横竖屏 art variant、focus rect、frame policy 与现有 `game003` 数值一致。
- 文档：`apps/game003/README.md`、`packages/gameframeworks/README.md`、`apps/buildgamestatic/README.md`、`agents.md` 已同步。
- 产物：`dist/`、`coverage/`、`.turbo/`、`node_modules/` 没有被提交。
- 报告：中文报告写明改了什么、跑了什么命令、是否新增依赖、是否有未解决风险。
