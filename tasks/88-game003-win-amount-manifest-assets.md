# game003 win amount manifest assets 任务计划

## 1. 任务目标

本任务处理 `game003-s1` 的两类资源更新，并把 game003 中奖金额动画资源从 YAML 内手写 tier 配置，迁移为 rendercore 可解析的 manifest 驱动配置。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成资源盘点、状态贴图生成、manifest schema 设计、rendercore / buildgamestatic / game003 接入、测试验收、协作规则同步判断和最终任务报告。

核心目标：

- `assets/game003-s1` 的主转轮基础 PNG 已更新，且 `H1-H5.jpg` 已删除；必须重新生成对应 display symbols 的 `spinBlur` / `disabled` PNG，并确认 runtime 不再引用 `H1-H5.jpg`。
- `assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json` 和 `assets/game003-s1/win-amount/assets/` 已更新；必须验证 JSON 内 `assets[].path` 全部指向当前存在的新资源，不能残留已删除旧资源。
- 新 win-amount VNI 项目当前 `stage.duration` 为 `2.9s`，三段式播放边界改为 `loopStartTime = 1s`、`loopEndTime = 2.5s`，即 `0s -> 1s` start、`1s -> 2.5s` loop、`2.5s -> 2.9s` end。
- 新增 `assets/game003-s1/win-amount/win-amount.manifest.json` 作为 win-amount tier 资源和播放时间的唯一静态来源；后续调整 big / super / mega 的 VNI JSON、asset 列表或三段式时间时优先改这个 manifest。
- `packages/rendercore` 拥有 win-amount manifest schema、parser、模块资源解析、fail-fast 校验和 VNI tier 创建逻辑；`apps/game003` 只传入 manifest、Vite modules、金额 formatter、布局和 app 层阈值/接入，不复制 parser 或资源解析逻辑。
- 保留当前 game003 金额语义：服务器整数 `100 -> $1.00`，`formatServerUsdAmount(...)` 仍由 `apps/game003/src/money.ts` 统一提供；rendercore 不硬编码 USD、game003、bg-wins、GMI 或 Ways 规则。
- 本任务要求显式失败，不做不必要兜底。缺 manifest、缺项目 JSON、缺 asset、非法时间、重复 id、YAML/generated 不同步、旧 JPG 引用、dist 缺资源，都必须尽早报错。

任务完成后必须新增中文任务报告：

```text
tasks/88-game003-win-amount-manifest-assets-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/88-game003-win-amount-manifest-assets-260709-181300.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
git diff --name-status -- assets/game003-s1 apps/game003 packages/rendercore apps/buildgamestatic packages/gameframeworks apps/symbolsviewer
```

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。依赖安装失败时用上面的代理环境变量重试。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

`apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML、manifest path、buildgamestatic 或 loading 资源后必须同步执行生成和 `--check` 校验。

## 3. 当前已观察到的输入变更

执行时必须重新盘点，不要只信任本节快照。

当前 `git status --short` 已观察到：

```text
M  assets/game003-s1/WL.png
M  assets/game003-s1/H1.png
M  assets/game003-s1/H2.png
M  assets/game003-s1/H3.png
M  assets/game003-s1/H4.png
M  assets/game003-s1/H5.png
M  assets/game003-s1/CO.png
M  assets/game003-s1/CL.png
M  assets/game003-s1/SC.png
D  assets/game003-s1/H1.jpg
D  assets/game003-s1/H2.jpg
D  assets/game003-s1/H3.jpg
D  assets/game003-s1/H4.jpg
D  assets/game003-s1/H5.jpg
M  assets/game003-s1/win-amount/bigwin.json
M  assets/game003-s1/win-amount/superwin.json
M  assets/game003-s1/win-amount/megawin.json
D  assets/game003-s1/win-amount/assets/<旧资源若干>.png
?? assets/game003-s1/win-amount/assets/<新资源若干>.png
```

当前 `assets/game003-s1/win-amount/*.json` 盘点结果：

```text
bigwin:   stage 900 x 1600, duration 2.9, assets 7
superwin: stage 900 x 1600, duration 2.9, assets 10
megawin:  stage 900 x 1600, duration 2.9, assets 9
```

当前 display symbols 仍应是：

```text
WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
```

当前 `assets/game003-s1/symbol-state-textures.manifest.json` 已经包含：

- `scale: 1`，所有 game003-s1 可展示 symbol 都必须显式有 scale。
- `renderPriority: 1` 只给 `WL`、`CL`、`SC`。
- `WL,H1,H2,H3,H4,H5,CL,SC` 的 Spine `normal` / `win`。
- `WL,H1,CL,SC` 的 Spine `appear`。
- `H2-H5` 没有 `appear`，运行时按已建立合同退回该 symbol 自身 normal Spine 展示。
- `L1-L5.win` 仍是 VNI `*-wins.json`，不属于本任务迁移范围。
- `CO.appear` / `CO.win` 仍是 builtin，除非本次另有明确资源，不要改。

## 4. 必须重新盘点的命令

### 4.1 display symbol 和 JPG 删除

```bash
node -e 'const fs=require("fs"); const p="assets/game003-s1"; const symbols=["WL","H1","H2","H3","H4","H5","L1","L2","L3","L4","L5","CO","CL","SC"]; for (const s of symbols) { const files=[`${s}.png`,`${s}.spinBlur.png`,`${s}.disabled.png`,`${s}.jpg`].filter(f=>fs.existsSync(`${p}/${f}`)); console.log(s, files.join(",")); } const jpgs=fs.readdirSync(p).filter(f=>/^H[1-5]\.jpe?g$/i.test(f)); if (jpgs.length) throw new Error(`runtime symbol JPGs still exist: ${jpgs.join(",")}`);'
```

验收要求：

- `H1-H5.jpg` / `H1-H5.jpeg` 不存在。
- 每个 display symbol 都有 `normal PNG`、`spinBlur PNG`、`disabled PNG`。
- `bg1.jpg` / `bg2.jpg` 是背景图，不属于 symbol JPG 删除范围。

### 4.2 win-amount JSON 和 asset 引用

```bash
node -e 'const fs=require("fs"); const path=require("path"); const root="assets/game003-s1/win-amount"; const all=new Set(); for (const name of ["bigwin","superwin","megawin"]) { const file=`${root}/${name}.json`; const json=JSON.parse(fs.readFileSync(file,"utf8")); console.log(`${name}: stage=${json.stage?.width}x${json.stage?.height} duration=${json.stage?.duration} assets=${json.assets?.length}`); if (json.stage?.duration !== 2.9) throw new Error(`${name} stage.duration must be 2.9`); const seen=new Set(); for (const asset of json.assets ?? []) { if (typeof asset.path !== "string" || !asset.path.startsWith("assets/")) throw new Error(`${name} bad asset path ${asset.path}`); const filename=path.basename(asset.path); if (seen.has(filename)) throw new Error(`${name} duplicate asset basename ${filename}`); if (all.has(filename)) throw new Error(`duplicate asset basename across win-amount tiers ${filename}`); seen.add(filename); all.add(filename); const full=`${root}/${asset.path}`; if (!fs.existsSync(full)) throw new Error(`${name} references missing asset ${asset.path}`); } }'
```

验收要求：

- 三个 project 都是 `duration = 2.9`。
- `assets[].path` 全部存在于 `assets/game003-s1/win-amount/assets/`。
- 没有引用 `mq...` 旧文件名的已删除资源。
- 同一个 project 内 asset basename 不重复；所有 project 共同喂给 rendercore 时也不能发生 basename 冲突。

### 4.3 现有代码引用检查

```bash
rg -n "H[1-5]\\.jpe?g|durationSeconds:\\s*5|loopEndTime:\\s*4|MIN_WIN_AMOUNT_TIER_DURATION_SECONDS|win-amount/\\{bigwin,superwin,megawin\\}\\.json|game003-win-amount-vni|normal:\\s*[\"']\\./H1\\.jpg" apps packages assets/game003-s1 tasks/88-game003-win-amount-manifest-assets.md
```

这个命令会命中旧实现和本计划文本。执行实现时需要判断每个命中是否仍合理；最终生产代码、生成物、测试期望和协作规则不应再把 game003 win-amount 三段式写死为 `durationSeconds: 5` / `loopEndTime: 4`。

当前已知需要被这条搜索推动修改的文件至少包括：

```text
apps/game003/README.md
apps/game003/tests/assets.test.ts
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/index.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/README.md
```

`apps/game003/tests/assets.test.ts` 里当前有 `normal: "./H1.jpg"` 漂移反例，必须改成符合新合同的 PNG 反例或删除 JPG 语义；不要为了保留旧测试而恢复 JPG 输入支持。`apps/game003/README.md` 当前也描述了 `H1.jpg` 到 `H5.jpg` 是原始输入，必须改成“这些 JPG 已删除，主转轮普通态只接受 PNG”。

## 5. 资源状态贴图生成

主转轮基础 PNG 已更新，必须重新生成 `spinBlur` / `disabled`。使用现有 rendercore 生成器：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

生成后必须检查：

```bash
git diff --name-status -- assets/game003-s1
git diff -- assets/game003-s1/symbol-state-textures.manifest.json
```

验收要求：

- `WL,H1,H2,H3,H4,H5,CO,CL,SC` 的 `*.spinBlur.png` / `*.disabled.png` 出现在 diff 中，且由基础 PNG 更新导致。
- 若 `L1-L5` 未变，通常不应有无意义二进制 churn；如果生成器重写但内容 hash 相同，报告里说明。
- `symbol-state-textures.manifest.json` 保留所有手写元数据：`animations`、`renderPriority`、`scale`、`states`、`settings`。
- manifest 的 symbol 顺序和 display set 仍是 `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`。
- 不把 `bg1/bg2/mainreelbg/conveyor/minecart/wild/up` 或 `win-amount/assets/*` 误纳入主转轮 symbol catalog。

如果 generator 因测试或未知字段失败，优先修 generator/parser/test 的真实合同，不要手改 generated manifest 绕过。

## 6. 新 win-amount manifest 合同

新增文件：

```text
assets/game003-s1/win-amount/win-amount.manifest.json
```

推荐 schema：

```json
{
  "version": 1,
  "kind": "vni-win-amount-tiers",
  "projectGlob": "./{bigwin,superwin,megawin}.json",
  "assetGlob": "./assets/*.{png,jpg,jpeg,webp}",
  "tiers": [
    {
      "id": "bigwin",
      "thresholdMultiplier": 15,
      "project": "./bigwin.json",
      "playback": {
        "mode": "segmented",
        "durationSeconds": 2.9,
        "loopStartTime": 1,
        "loopEndTime": 2.5,
        "keepParticlesAlive": true
      }
    },
    {
      "id": "superwin",
      "thresholdMultiplier": 30,
      "project": "./superwin.json",
      "playback": {
        "mode": "segmented",
        "durationSeconds": 2.9,
        "loopStartTime": 1,
        "loopEndTime": 2.5,
        "keepParticlesAlive": true
      }
    },
    {
      "id": "megawin",
      "thresholdMultiplier": 50,
      "project": "./megawin.json",
      "playback": {
        "mode": "segmented",
        "durationSeconds": 2.9,
        "loopStartTime": 1,
        "loopEndTime": 2.5,
        "keepParticlesAlive": true
      }
    }
  ]
}
```

字段规则：

- `version` 第一版固定为 `1`。
- `kind` 固定为 `vni-win-amount-tiers`，用于避免误读其它 manifest。
- `projectGlob` / `assetGlob` 是 manifest 文件所在目录的相对路径，只允许 `./` 开头，不允许 `../`，不允许递归 `**`。
- `projectGlob` 第一版必须只匹配 `bigwin.json`、`superwin.json`、`megawin.json`，不能宽泛到 `./*.json` 后混入 manifest 自己或其它 JSON。
- `assetGlob` 第一版保留 `png/jpg/jpeg/webp` 扩展兼容，但当前新增资源实际应全是 PNG。若执行时确认 win-amount assets 已彻底没有 JPG，可在报告中建议后续把 glob 收窄到 `./assets/*.png`；不要在本任务里破坏现有 VNI 资源兼容，除非所有校验和加载链路一起调整。
- `tiers[].id` 必须唯一且非空；第一版固定为 `bigwin,superwin,megawin`。
- `thresholdMultiplier` 必须 finite positive，且 tier 顺序严格递增。
- `project` 必须是 manifest 目录下的 `./*.json`，并且必须被 `projectGlob` 覆盖。
- `playback.mode` 固定为 `segmented`。
- `durationSeconds` / `loopStartTime` / `loopEndTime` 必须 finite，满足 `0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration`。
- game003 当前必须使用 `durationSeconds = 2.9`、`loopStartTime = 1`、`loopEndTime = 2.5`。不要继续保留旧的 `durationSeconds = 5` / `loopEndTime = 4`。
- `keepParticlesAlive` 必须显式 boolean。第一版继续为 `true`。

rendercore 只理解通用 tier 资源和播放配置，不理解 `game003` 的组件名、服务器协议、金额单位或 layout。`thresholdMultiplier` 是通用金额 tier 切换门槛，不允许在 rendercore 写死 big/super/mega 的具体数字。

## 7. 实施步骤

### 7.1 rendercore manifest parser

新增或扩展文件：

```text
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/src/win-amount/index.ts
packages/rendercore/README.md
packages/rendercore/tests/win-amount/vni-tier-effect.test.ts
packages/rendercore/tests/win-amount/win-amount-manifest.test.ts
packages/rendercore/tests/win-amount/win-amount-player.test.ts
```

建议 API：

```ts
parseWinAmountAnimationManifest(manifest: unknown): ParsedWinAmountAnimationManifest

createWinAmountAnimationTiersFromManifestModules({
  manifest,
  projectModules,
  assetModules,
}): readonly WinAmountAnimationTier[]
```

实现要求：

- Parser 使用白名单字段，遇到未知字段显式失败。
- Parser 不读取文件系统；文件存在性和 module resolve 由 `createWinAmountAnimationTiersFromManifestModules(...)` 校验。
- 保留现有 `createWinAmountAnimationTiersFromModules(...)` 作为低层 helper 或迁移期兼容时，不能继续把 game003 默认 5 秒藏在旧调用里；game003 必须走 manifest API。
- 移除 `durationSeconds >= 5` 的硬编码限制，改成 `durationSeconds > 0` 且 `loopEndTime <= durationSeconds <= project.stage.duration`。
- `DefaultWinAmountAnimationPlayer.validateConfig(...)` 也要移除 tier duration 至少 5 秒的限制，否则新 `2.9s` 配置会在 player 创建时失败。
- `cloneProjectWithDuration(...)` 仍然用于把 VNI project 的有效 `stage.duration` 改成 manifest 的 `durationSeconds`，但不能突变 import 进来的原始 JSON。
- `assertUniqueAssetBasenames(...)` 保留，避免 Vite module map 中不同目录同名图片被静默覆盖。
- 测试必须覆盖：合法 manifest、未知字段失败、重复 tier id 失败、非法时间失败、`loopEndTime > durationSeconds` 失败、`durationSeconds > project.stage.duration` 失败、缺 project 失败、缺 asset 失败、2.9 秒 tier 可被 player 接受。

### 7.2 buildgamestatic 和 static-config 类型迁移

修改文件：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/buildgamestatic/tests/generator.test.ts
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/index.ts
packages/gameframeworks/tests/static-config.test.ts
apps/game003/src/generated-loading-url.ts
```

目标 YAML 形态：

```yaml
winAmount:
  amountScale: 100
  currency: USD
  locale: en-US
  minorCountDurationSeconds: 1.5
  majorCountDurationSeconds: 3
  thresholds:
    minorMultiplier: 1
    bigMultiplier: 15
    superMultiplier: 30
    megaMultiplier: 50
  text:
    minorFontSize: 54
    majorFontSize: 118
    fill: "#fff7d6"
    stroke: "#5a2500"
    strokeWidth: 8
  layout:
    minorAnchor: reel-area-bottom-center
    majorAnchor: reel-area-center
    minorOffset: { x: 0, y: -28 }
    majorOffset: { x: 0, y: 0 }
  animations:
    manifest: assets/game003-s1/win-amount/win-amount.manifest.json
```

生成后的 static config 应包含：

- `winAmount.animations.manifest`：manifest JSON module。
- `winAmount.animations.projectModules`：由 manifest `projectGlob` 派生的 `import.meta.glob(...)`。
- `winAmount.animations.assetModules`：由 manifest `assetGlob` 派生的 `import.meta.glob(..., { query: "?url", import: "default" })`。

实现要求：

- `yaml-loader` 必须读取 manifest 文件，校验路径存在、schema 基础字段、`projectGlob` / `assetGlob` 安全性、tier project 被 project glob 覆盖、project stage duration 足够。
- `generator` 负责为 manifest、project glob、asset glob 输出确定性 import / module names。
- `packages/gameframeworks/static-config` 的 validate 要校验 generated runtime config 的 `manifest`、`projectModules`、`assetModules` 都存在，不能只验证 module map。
- 如果 `SlotGameStaticWinAmountAnimations` / `SlotGameStaticWinAmountTier` 的 public 类型形态改变，必须同步 `packages/gameframeworks/src/static-config/index.ts` 的导出，避免包内类型可用但 public static-config 入口漂移。
- YAML 不再维护 `projectGlob` / `assetGlob` / `tiers` 第二份表，避免后续 JSON 更新后漏同步。
- loading 生成链路不能让 win-amount project/asset glob 变成未校验的第二份事实。首选方案是 `apps/buildgamestatic` 从 `winAmount.animations.manifest` 派生 `game003-win-amount-manifest`、`game003-win-amount-vni-projects`、`game003-win-amount-vni-assets` 的 generated loading resources；如果第一版仍保留 `loading.resources` 里的显式 win-amount path/glob，则 `yaml-loader` 必须校验这些 loading resource 与 manifest 的 `projectGlob` / `assetGlob` 完全一致，测试必须覆盖不一致时显式失败。
- `apps/game003/src/generated-loading-url.ts` 继续只查询 generated loading resource；不能在 app 层手写 win-amount manifest 或 project/asset 路径兜底。
- 如果测试 fixture 因旧 schema 失败，修改 fixture 和测试合同，不要在生产代码里兼容旧 YAML 形态作为隐藏 fallback。

### 7.3 game003 接入

修改文件：

```text
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/win-amount-config.ts
apps/game003/tests/win-amount-config.test.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/src/generated-loading-url.ts
apps/game003/README.md
apps/game003/scripts/verify-static-dist.mjs
```

实现要求：

- `createGame003WinAmountAnimationConfig(...)` 改为调用 rendercore 的 manifest API：

```ts
createWinAmountAnimationTiersFromManifestModules({
  manifest: winAmount.animations.manifest,
  projectModules: winAmount.animations.projectModules,
  assetModules: winAmount.animations.assetModules,
})
```

- `winAmount.amountScale` 仍然必须等于 `SERVER_USD_AMOUNT_SCALE`。
- `formatServerUsdAmount(...)` 仍然是 Pixi win amount 与 framework HUD 的统一 formatter。
- `thresholds.big/super/mega` 与 manifest tiers 的 `thresholdMultiplier` 必须一致；如果不一致，game003 config 创建时显式失败，避免 YAML 和 manifest 形成两套规则。
- `loading` 资源应包含下列资源；这些资源应由 manifest 派生，或由 `yaml-loader` 明确校验与 manifest 一致：
  - `game003-win-amount-manifest`：`assets/game003-s1/win-amount/win-amount.manifest.json`
  - `game003-win-amount-vni-projects`：`assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json`
  - `game003-win-amount-vni-assets`：`assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}` 或经确认收窄后的 glob。
- `loading-resources.test.ts` 不要只检查某个旧 prefix，例如 `mega_asset`；应从 manifest/project JSON 反查实际 asset basename，确保所有被引用资源都在 loading URL 列表中。
- `static-config.test.ts` 也要从 manifest/project JSON 反查 loading 资源，不要继续写死旧资源名前缀。
- `assets.test.ts` 要更新 JPG 漂移反例，确认 manifest `normal` 必须是 `./H1.png` 而不是 `./H1.jpg`，但测试输入本身不应再暗示 JPG 是合法原始输入。
- `verify-static-dist.mjs` 增加 win-amount manifest、三个 project JSON 和 `assets[].path` 所有资源的 dist hash 校验；不要只校验 main symbols 和 Spine 资源。
- `verify-static-dist.mjs` 保留旧 JPG symbol runtime reference 检查，并覆盖 dist 内 `H1-H5.jpg` 字符串。
- `packages/rendercore/README.md` 要更新 win-amount 示例，从 `createWinAmountAnimationTiersFromModules(...)` 手传 `tierConfigs` 改为 manifest API，明确 `durationSeconds` 可以小于 5，只要满足 manifest/project 的时间校验。
- README 更新为 manifest 驱动说明：win-amount tier 资源和播放时间来自 `assets/game003-s1/win-amount/win-amount.manifest.json`，game003 只配置金额格式、布局和 app 接入。

### 7.4 资源生成与 generated 文件同步

执行：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
pnpm --filter game003 run generate:static-config
pnpm --filter game003 run check:static-config
```

验收要求：

- `apps/game003/src/generated/game-static.generated.ts` 和 `game-loading.generated.ts` 由命令生成，不手改。
- generated static config 中不再出现 `durationSeconds: 5` / `loopEndTime: 4` 的 game003 win-amount tier 配置。
- generated static config 中出现 `win-amount.manifest.json` import 或等价 manifest module。
- generated loading config 包含 win-amount manifest、三个 project JSON、新 assets。

### 7.5 agents.md 同步

本任务会改变长期协作规则，因此实现完成时需要同步更新仓库实际存在的小写文件：

```text
agents.md
```

建议新增或修改规则：

- `assets/game003-s1/win-amount/win-amount.manifest.json` 是 game003 win-amount big/super/mega tier 资源、VNI project、asset glob 和 segmented 播放时间的来源；不要在 YAML、game003 runtime 或测试里维护第二份 tier 时间表。
- 当前 game003 win-amount 三段式为 `durationSeconds=2.9`、`loopStartTime=1`、`loopEndTime=2.5`，即 `0..1` start、`1..2.5` loop、`2.5..2.9` end。
- win-amount manifest parser / tier resource resolver 属于 `packages/rendercore`，game app 只传 manifest、Vite modules、formatter 和布局。
- `H1-H5.jpg` 已从 `game003-s1` symbol 基础资源中删除；主转轮 normal symbol 只使用 PNG，状态贴图由 rendercore generator 生成。

如果执行时确认 `agents.md` 已有等价规则，报告中说明“无需更新”并引用现有条目；不要重复堆叠矛盾规则。

## 8. 测试与验收命令

按顺序执行。若某一步失败，先修复真实问题，再继续；不要跳过失败命令写报告。

```bash
git status --short --untracked-files=all
node -e 'const fs=require("fs"); const p="assets/game003-s1"; const jpgs=fs.readdirSync(p).filter(f=>/^H[1-5]\.jpe?g$/i.test(f)); if (jpgs.length) throw new Error(`runtime symbol JPGs still exist: ${jpgs.join(",")}`); console.log("game003 symbol jpg removal ok");'
node -e 'const fs=require("fs"); const path=require("path"); const root="assets/game003-s1/win-amount"; const all=new Set(); for (const name of ["bigwin","superwin","megawin"]) { const json=JSON.parse(fs.readFileSync(`${root}/${name}.json`,"utf8")); if (json.stage?.duration !== 2.9) throw new Error(`${name} duration ${json.stage?.duration}`); for (const asset of json.assets ?? []) { const filename=path.basename(asset.path); if (all.has(filename)) throw new Error(`duplicate asset basename across win-amount tiers ${filename}`); all.add(filename); const full=`${root}/${asset.path}`; if (!fs.existsSync(full)) throw new Error(`${name} missing ${asset.path}`); } } console.log("game003 win amount assets ok");'
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter buildgamestatic test
pnpm --filter buildgamestatic typecheck
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter game003 run generate:static-config
pnpm --filter game003 run check:static-config
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 release:check
pnpm --filter symbolsviewer test
pnpm --filter symbolsviewer typecheck
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

如果耗时或环境限制导致不能跑完整 root 命令，最低必须跑：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter buildgamestatic test
pnpm --filter game003 test
pnpm --filter game003 release:check
git diff --check
```

报告中必须明确列出哪些命令已跑、哪些没跑、失败原因和后续手动验收项。

## 9. 二次遗漏审计清单

实现结束前必须再检查一遍，不能只跑测试。

资源和 manifest：

- `assets/game003-s1/H1-H5.jpg` 已删除，代码、生成物、dist 不引用。
- `WL,H1,H2,H3,H4,H5,CO,CL,SC` 的 `spinBlur` / `disabled` 已随基础 PNG 重新生成。
- `symbol-state-textures.manifest.json` 没丢 `animations`、`renderPriority`、`scale`。
- `win-amount.manifest.json` 与三个 VNI project 的 stage duration / asset paths 一致。
- win-amount JSON 不引用已删除旧 assets。

代码边界：

- rendercore 拥有 manifest parser 和 tier module resolver。
- rendercore README 暴露的用法与 public `win-amount` export 同步，不继续展示旧的 YAML/tierConfigs 手配方式作为推荐入口。
- game003 没有复制 win-amount manifest schema、asset resolver、VNI segmented 资源解析。
- buildgamestatic 只负责读取静态 YAML/manifest 并生成 deterministic TS，不硬编码 game003 专属 tier 名称。
- gameframeworks 只校验通用 static config 形态，不硬编码 `bigwin/superwin/megawin` 资源路径，且 `static-config/index.ts` 导出的 public 类型与新 shape 一致。
- symbolsviewer 不需要接入 win-amount manifest；若只改主转轮 symbol state textures，确保 symbolsviewer game003-s1 set 仍能正常解析 manifest。

验收面：

- `apps/game003/scripts/verify-static-dist.mjs` 覆盖 win-amount manifest、project JSON 和所有 referenced assets。
- `apps/game003/tests/loading-resources.test.ts` 从 manifest/project 反查资源，不写旧文件名前缀。
- `apps/game003/tests/static-config.test.ts` 从 manifest/project 反查 win-amount loading 资源，不写旧文件名前缀。
- `apps/game003/tests/assets.test.ts` 不再包含 `normal: "./H1.jpg"` 这类让 JPG 看起来仍是合法普通态的 fixture。
- `apps/game003/tests/win-amount-config.test.ts` 验证 `durationSeconds=2.9`、`loopStartTime=1`、`loopEndTime=2.5`。
- `packages/rendercore/tests/win-amount/*` 覆盖 2.9 秒 tier，且不再要求至少 5 秒。
- `apps/buildgamestatic/tests/*` 覆盖 YAML 只配置 `animations.manifest` 的新形态。
- 若 loading win-amount 资源不是自动从 manifest 派生，`apps/buildgamestatic/tests/*` 必须覆盖 loading glob 与 manifest glob 不一致时显式失败。
- `agents.md` 已同步或报告中说明无需同步。

搜索命令：

```bash
rg -n "H[1-5]\\.jpe?g|normal:\\s*[\"']\\./H1\\.jpg|durationSeconds:\\s*5|loopEndTime:\\s*4|MIN_WIN_AMOUNT_TIER_DURATION_SECONDS|winAmount\\.animations\\.tiers|projectGlob: assets/game003-s1/win-amount|assetGlob: assets/game003-s1/win-amount" apps packages assets/game003-s1 agents.md
rg -n "win-amount\\.manifest|createWinAmountAnimationTiersFromManifestModules|parseWinAmountAnimationManifest|game003-win-amount-manifest" apps packages assets/game003-s1 agents.md
```

第一条命令如果仍有命中，必须逐项解释：是旧任务文档、测试反例，还是应该修的生产代码。

## 10. 任务报告要求

完成后新增：

```text
tasks/88-game003-win-amount-manifest-assets-[utctime].md
```

报告必须包含：

- 本次最终资源盘点：基础 PNG/JPG 状态、win-amount project duration、asset 数量。
- 新增/修改文件列表，区分资源生成、manifest、rendercore、buildgamestatic、game003、tests、docs、agents。
- 关键合同说明：win-amount manifest path、三段式 `1s/2.5s/2.9s`、显式失败规则、YAML 不再维护第二份 tier 时间表。
- 执行过的命令和结果，包含失败重试记录。
- 如果使用代理或 `CI=true`，写明原因。
- 如果未跑完整 root `lint/typecheck/build`，写明未跑原因和风险。
- 浏览器验收如由用户执行，报告中只写“手动浏览器验收待用户执行”，不要冒充完成。
- `agents.md` 是否同步更新，以及同步的规则摘要。

## 11. 非目标

- 不改 live server、`gamecode`、URL query 合同或服务器协议。
- 不把 `game003-s1` 做成 `game002` 的新 skin。
- 不把 win-amount manifest 扩展成通用 symbol manifest，也不把 symbol `L1-L5-wins` 迁移进本次 win-amount manifest。
- 不在 rendercore 硬编码 `game003`、`bg-wins`、`bigwin/superwin/megawin` 的具体业务含义。
- 不新增对主转轮 normal JPG symbol 的 runtime 支持；主转轮 symbol 基础图继续只使用 PNG。
- 不用延长 reel spin 时间、修改 minecart/bg-bar 节奏来掩盖 win-amount 播放时间变化。
