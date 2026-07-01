# rendercore win amount animation 任务计划

## 1. 任务目标

本任务为 `packages/rendercore` 增加通用的中奖金额动画能力，并把它接入 `apps/game003`，使 `game003` 在玩家中奖后能看到金额从 0 递增到本轮中奖金额，并在达到 big / super / mega 阈值时播放对应 VNI 动画。

本计划是完整可执行版本，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成资源接入、rendercore 实现、game003 集成、测试验收、协作规则同步和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/68-rendercore-win-amount-animation-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/68-rendercore-win-amount-animation-260701-123456.md
```

## 2. 仓库和环境约束

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

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方 npm 依赖。`packages/rendercore` 当前已经依赖 `@slotclientengine/vnicore` 和 `pixi.js`。如果执行时确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的隐藏兜底。有些逻辑 bug 越早暴露越好。

`game-static.generated.ts` 和 `game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 或 generator 后必须同步执行生成和 `--check` 校验。

## 3. 必须实现的行为契约

### 3.1 金额来源和单位

中奖动画使用服务器整数金额，不直接使用已经格式化过的字符串。

输入来源：

- 本轮下注：优先使用 `logic.getBet()`，它来自 framework 创建 logic 时注入的当前 `SlotGameBetOption.bet`。
- 本轮中奖：使用 `logic.getTotalWin()`，它来自 spin result 的 `totalwin`，并已由 `packages/gameframeworks/src/logic-result.ts` 校验和 logic meta 一致。
- 金额显示：使用 app 显式传入的 formatter，`game003` 当前为美元，默认 `100 -> 1.00 USD`。

`packages/rendercore` 不能硬编码 USD、`100`、`game003`、GMI 字段名、`bg-wins` 或 Ways 规则。rendercore 只处理：

- raw bet amount
- raw win amount
- formatter
- 阈值倍率
- Pixi/VNI 资源和播放配置

`apps/game003` 负责把当前的 `formatServerUsdAmount(...)` 复用给框架 UI 和中奖金额动画，避免框架 HUD 与动画数字格式不一致。

金额校验规则：

- `winAmountRaw` 必须是 finite number，且 `>= 0`。
- `betAmountRaw` 必须是 finite positive number。
- 当 `winAmountRaw > 0` 且 `betAmountRaw <= 0` 时必须显式失败。
- 倍率比较必须基于 raw integer / raw amount：`winAmountRaw / betAmountRaw`。不要先除以 `amountScale` 再用浮点金额做阈值判断。
- 不允许对非法金额静默 clamp、改成 0、改成 1 或跳过动画。

### 3.2 五个阶段和三类资源

`winAmountRaw === 0` 是零中奖特殊值：本轮不创建中奖金额动画，不残留 overlay，不计入下面五个播放阶段。

用户需求中的“四个部分，五个阶段”在本任务中按下面规则落地：

1. `0 < winAmountRaw <= betAmountRaw`：小额阶段，数字在主轮盘区底部居中，从 `0` 快速递增到中奖金额。默认时长 `1.5s`。
2. `betAmountRaw < winAmountRaw < 15 * betAmountRaw`：先经过小额阶段，从 `0` 到 `betAmountRaw`；然后切到主轮盘区中心，数字变大，从 `betAmountRaw` 递增到最终中奖金额。默认时长 `3s`。
3. `15 * betAmountRaw <= winAmountRaw < 30 * betAmountRaw`：金额递增到 `15x` 时启动 `bigwin` VNI 动画，数字继续递增。
4. `30 * betAmountRaw <= winAmountRaw < 50 * betAmountRaw`：金额递增到 `30x` 时切换到 `superwin` VNI 动画，数字继续递增。
5. `winAmountRaw >= 50 * betAmountRaw`：金额递增到 `50x` 时切换到 `megawin` VNI 动画，数字继续递增。

边界值按“到达阈值即进入更高阶段”处理：

- `15x` 进入 big win。
- `30x` 进入 super win。
- `50x` 进入 mega win。

big / super / mega 的动画都是三段式 VNI 播放：

- start 段：从 `0` 播到 `loopStartTime`。
- loop 段：从 `loopStartTime` 循环或停留到 `loopEndTime`。
- end 段：调用 `requestSegmentedPlaybackEnd()` 后，从 `loopEndTime` 播到配置的 `durationSeconds`，并等待粒子排空。

三段时间必须来自配置，不能写死在 rendercore 里。`keepParticlesAlive` 也必须是配置项，默认 `true`。

big / super / mega 第一版统一使用 `5s` 的有效播放长度：

- `0s -> 1s`：start 段。
- `1s -> 4s`：loop 段。
- `4s -> 5s`：end 段。

`megawin` 源 VNI 项目当前可能是 `10s` 动画，但本任务只使用前 `5s`。运行时必须按 `durationSeconds: 5` 截断有效时长，不能播放到 `10s` 后再结束，也不能在 game003 里用私有定时器销毁 VNI 节点。

推荐第一版默认配置：

```text
minorCountDurationSeconds: 1.5
majorCountDurationSeconds: 3
thresholdMultipliers: 15 / 30 / 50
bigwin.durationSeconds: 5
bigwin.loopStartTime: 1
bigwin.loopEndTime: 4
superwin.durationSeconds: 5
superwin.loopStartTime: 1
superwin.loopEndTime: 4
megawin.durationSeconds: 5
megawin.loopStartTime: 1
megawin.loopEndTime: 4
keepParticlesAlive: true
```

执行时必须读取实际 VNI project 的 `stage.duration` 并校验：

```text
0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration
```

`durationSeconds` 必须显式配置。尤其是 `megawin`：即使源 project 的 `stage.duration` 是 `10`，配置也必须保持 `5`，并由 rendercore / vnicore 播放合同保证只消费前 `5s`。

## 4. 当前实现事实

执行本计划时必须重新盘点，以实际代码为准。当前已观察到的相关事实如下。

### 4.1 当前中奖 symbol 播放

`apps/game003/src/game-adapter.ts` 当前 `playSpin(logic)` 流程：

1. 读取 `logic.getStep(0).getScene(0)` 作为目标 scene。
2. 调用 `createGame003WinSymbolSequence(logic, targetScene)` 解析 `bg-wins`。
3. 调用 `runtime.spinToScene(targetScene, "spin main scene")`。
4. ticker 中等待 `runtime.update(deltaSeconds)` 完成 spin。
5. 校验 `runtime.getVisualSnapshot()` 与 target scene 一致。
6. 如果有 win symbol queue，则逐组请求 `runtime.requestVisibleSymbolStates(group.positions, "win")`。
7. 所有 win symbol group 播放完后才 resolve `playSpin()`。

本任务必须保留这个合同。中奖金额动画应接在 spin 落停之后，并和已有 win symbol sequence 一起纳入 `playSpin()` 的完成条件。不能让 framework 在金额动画未完成时进入 collect / idle。

### 4.2 当前金额格式化

`apps/game003/src/money.ts` 当前有：

```ts
export const SERVER_USD_AMOUNT_SCALE = 100;

export function formatServerUsdAmount(amount: number): string {
  // 100 -> "$1.00"
}
```

`apps/game003/src/game-entry.ts` 已把 `formatServerUsdAmount` 传给 `createSlotGameFramework({ formatMoney })`。但这只影响 framework UI，当前 game003 Pixi 画面内没有中奖金额动画。

本任务需要让 game003 的中奖金额动画使用同一个 formatter。

### 4.3 当前 VNI 能力

`packages/vnicore` 已支持三段式 segmented playback：

```ts
player.play({
  mode: "segmented",
  loopStart: { unit: "time", at: loopStartTime },
  loopEnd: { unit: "time", at: loopEndTime },
  keepParticlesAlive,
});

player.requestSegmentedPlaybackEnd();
player.getPlaybackState();
player.onPlaybackComplete(listener);
player.update(deltaSeconds);
```

粒子语义属于 `packages/vnicore`，不要在 game003 或 rendercore 里复制粒子状态机。

`packages/rendercore/src/symbol/vni-animation.ts` 已经把 VNI 用于 symbol win 动画，但它只支持 manifest 的一次性 `range` 播放。big / super / mega 金额动画是金额 overlay，不是 symbol state animation，不能塞进 `symbol-state-textures.manifest.json` 的现有 symbol 动画配置。

### 4.4 当前 game003 资源和 YAML

`apps/game003/config/game-static.yaml` 是 game003 静态配置源。当前已经包含：

- live 固定服务器和 gamecode。
- reel 参数。
- loading resources。
- skin=1 的 symbol manifest / VNI symbol glob。
- art orientation-focus 配置。
- `mainreelbg` / conveyor / reel area 坐标。

`apps/buildgamestatic` 当前 schema 不包含 win amount animation 配置；如果本任务把 big / super / mega 资源和时间配置放进 YAML，就必须同步扩展：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/*
packages/gameframeworks/src/static-config/types.ts
packages/gameframeworks/src/static-config/validate.ts
packages/gameframeworks/src/static-config/index.ts
packages/gameframeworks/tests/static-config.test.ts
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

## 5. 资源接入计划

### 5.1 资源目标路径

把 `docs/anieditor5/export` 下的 big / super / mega VNI 项目复制到 game003-s1 静态资源目录：

```text
assets/game003-s1/win-amount/bigwin.json
assets/game003-s1/win-amount/superwin.json
assets/game003-s1/win-amount/megawin.json
assets/game003-s1/win-amount/assets/*.png
```

新增目录时如果目录为空需要 `.keepme`；本任务目录会放实际资源，不需要 `.keepme`。不要把资源复制到 `assets/game003-s1/assets/`，该目录当前属于 symbol VNI 动画，混入金额动画资源会增加 basename 冲突风险。

### 5.2 只复制被三个项目实际引用的图片

源项目：

```text
docs/anieditor5/export/bigwin.json
docs/anieditor5/export/superwin.json
docs/anieditor5/export/megawin.json
```

源图片目录：

```text
docs/anieditor5/export/assets
```

bigwin 需要复制：

```text
bigwin_asset_image_mqgf7e6h_g.png
image_asset_image_mqgg2jz6_a.png
effect3_asset_image_mqgihw37_p.png
big_asset_image_mqgir7t1_u.png
bigwin_asset_image_mqgix37g_13.png
2_asset_image_mqgl9o49_3.png
image_asset_image_mqgmcogx_3.png
2_asset_image_mqgmd9ai_4.png
2_asset_image_mqgmdln6_5.png
```

superwin 需要复制：

```text
super_asset_image_mqgmihl5_7.png
super_win_asset_image_mqgmin3j_9.png
superwin_asset_image_mqgmiqo0_b.png
effect4_asset_image_mqgmjujq_d.png
2_asset_image_mqgmk7jx_f.png
image_asset_image_mqgmko6a_h.png
image_asset_image_mqgmkqkl_j.png
image_asset_image_mqgmksgb_l.png
image_asset_image_mqgn4aqi_1q.png
```

megawin 需要复制：

```text
effect2_asset_image_mq6j09f0_k.png
effect1_asset_image_mq6m8cly_4.png
image_asset_image_mqasjj80_3.png
image_asset_image_mqgi7fip_h.png
mega_asset_image_mqgn7a26_1t.png
win_asset_image_mqgn7cd4_1v.png
2_asset_image_mqgn8wz3_27.png
image_asset_image_mqgnayb6_2a.png
image_asset_image_mqgng0kv_2j.png
```

复制后必须校验三个 JSON 的 `project.assets[].path` 都能在新目录的 `assets/` 下找到同名文件。不要把 `docs/anieditor5/export/assets` 整目录全部复制进 game003。

示例资源复制命令：

```bash
mkdir -p assets/game003-s1/win-amount/assets
cp docs/anieditor5/export/{bigwin,superwin,megawin}.json assets/game003-s1/win-amount/
cp docs/anieditor5/export/assets/{bigwin_asset_image_mqgf7e6h_g.png,image_asset_image_mqgg2jz6_a.png,effect3_asset_image_mqgihw37_p.png,big_asset_image_mqgir7t1_u.png,bigwin_asset_image_mqgix37g_13.png,2_asset_image_mqgl9o49_3.png,image_asset_image_mqgmcogx_3.png,2_asset_image_mqgmd9ai_4.png,2_asset_image_mqgmdln6_5.png,super_asset_image_mqgmihl5_7.png,super_win_asset_image_mqgmin3j_9.png,superwin_asset_image_mqgmiqo0_b.png,effect4_asset_image_mqgmjujq_d.png,2_asset_image_mqgmk7jx_f.png,image_asset_image_mqgmko6a_h.png,image_asset_image_mqgmkqkl_j.png,image_asset_image_mqgmksgb_l.png,image_asset_image_mqgn4aqi_1q.png,effect2_asset_image_mq6j09f0_k.png,effect1_asset_image_mq6m8cly_4.png,image_asset_image_mqasjj80_3.png,image_asset_image_mqgi7fip_h.png,mega_asset_image_mqgn7a26_1t.png,win_asset_image_mqgn7cd4_1v.png,2_asset_image_mqgn8wz3_27.png,image_asset_image_mqgnayb6_2a.png,image_asset_image_mqgng0kv_2j.png} assets/game003-s1/win-amount/assets/
```

如果执行环境的 shell 对长 brace 命令不友好，可以分三次复制，但最终资源清单必须完全一致。

## 6. 静态配置计划

### 6.1 YAML 新增配置

在 `apps/game003/config/game-static.yaml` 的 `skins."1"` 下新增 `winAmount` 配置。示例结构如下，字段名可以在实现中微调，但必须保持语义完整，并同步类型、校验、生成文件和测试：

```yaml
    # 中奖金额动画。金额输入仍来自 live/GMI 的服务器整数，amountScale 只用于显示格式。
    # big/super/mega VNI project 是 2000x2000 stage，overlayRect 坐标相对于当前 orientation 的完整 art。
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
        minorOffset:
          x: 0
          y: -28
        majorOffset:
          x: 0
          y: 0
      animations:
        projectGlob: assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json
        assetGlob: assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}
        tiers:
          - id: bigwin
            thresholdMultiplier: 15
            project: ./bigwin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
          - id: superwin
            thresholdMultiplier: 30
            project: ./superwin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
          - id: megawin
            thresholdMultiplier: 50
            project: ./megawin.json
            durationSeconds: 5
            loopStartTime: 1
            loopEndTime: 4
            keepParticlesAlive: true
```

YAML 注释必须保留中文，说明字段用途、坐标基准和修改边界。注释只给人看，不能作为构建逻辑依据。

### 6.2 Loading 新增资源

在 `loading.resources` 增加金额动画资源：

```yaml
    - id: game003-win-amount-vni-projects
      glob: assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json
      weight: 3
    - id: game003-win-amount-vni-assets
      glob: assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}
      weight: 8
```

不要用 `assets/game003-s1/**/*.png`、`assets/game003-s1/*.png` 或其它宽泛 glob。loading glob 必须能由生成器 fail-fast 校验空匹配、重复 id 和重复 URL。

### 6.3 buildgamestatic / static-config 扩展

需要同步扩展以下文件：

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
```

校验要求：

- `amountScale` 必须是 finite positive number。
- `minorCountDurationSeconds`、`majorCountDurationSeconds` 必须是 finite positive number。
- `thresholds` 必须满足 `minorMultiplier > 0`、`bigMultiplier > minorMultiplier`、`superMultiplier > bigMultiplier`、`megaMultiplier > superMultiplier`。
- `animations.tiers` 必须非空，id 不重复，thresholdMultiplier 严格递增。
- `animations.projectGlob` 必须是当前资源目录下的 JSON glob，不能递归，不能宽泛到仓库根。
- `animations.assetGlob` 只能匹配 `png/jpg/jpeg/webp`，不能递归，不能宽泛到仓库根。
- `tier.project` 必须是 `./filename.json` 形式，不能包含 `../` 或反斜杠。
- `durationSeconds` 必须是 finite positive number；`loopStartTime`、`loopEndTime` 必须是 finite non-negative number；运行时还要用实际 project duration 校验 `0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration`。
- bigwin、superwin、megawin 第一版都必须配置 `durationSeconds: 5`、`loopStartTime: 1`、`loopEndTime: 4`；其中 megawin 即使源资源总长为 `10s`，也只能使用前 `5s`。
- `keepParticlesAlive` 必须是 boolean，缺省时由 YAML loader 显式补 `true` 或由 rendercore 默认 `true`，不能在 game003 里临时兜底。
- text style 的颜色、字号、stroke 必须有限且可渲染；非法颜色不能默默改成白色。

生成文件要求：

- `apps/game003/src/generated/game-static.generated.ts` 需要导出 `winAmount` 配置和对应的 `import.meta.glob` modules。
- `apps/game003/src/generated/game-loading.generated.ts` 需要包含新增 loading 资源。
- 生成文件仍必须通过 `assertSlotGameStaticConfig(GAME003_STATIC_CONFIG)`。

## 7. rendercore 实现计划

### 7.1 新增模块和导出

新增通用模块：

```text
packages/rendercore/src/win-amount/index.ts
packages/rendercore/src/win-amount/types.ts
packages/rendercore/src/win-amount/win-amount-player.ts
packages/rendercore/src/win-amount/win-amount-stage.ts
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/win-amount-player.test.ts
packages/rendercore/tests/win-amount/vni-tier-effect.test.ts
```

同步导出：

```text
packages/rendercore/src/index.ts
packages/rendercore/package.json
```

建议增加 subpath export：

```json
"./win-amount": {
  "types": "./dist/win-amount/index.d.ts",
  "import": "./dist/win-amount/index.js"
}
```

### 7.2 rendercore API 形态

rendercore 应提供类似下面的通用能力，实际命名可调整，但必须保持边界：

```ts
export interface WinAmountAnimationInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}

export interface WinAmountAnimationConfig {
  readonly formatter: (amountRaw: number) => string;
  readonly minorCountDurationSeconds: number;
  readonly majorCountDurationSeconds: number;
  readonly thresholdMultipliers: {
    readonly minor: number;
    readonly big: number;
    readonly super: number;
    readonly mega: number;
  };
  readonly layout: WinAmountAnimationLayout;
  readonly textStyle: WinAmountAnimationTextStyle;
  readonly tiers: readonly WinAmountAnimationTier[];
}

export interface WinAmountAnimationPlayer {
  readonly container: Container;
  start(input: WinAmountAnimationInput): void;
  update(deltaSeconds: number): WinAmountAnimationUpdateResult;
  applyLayout(layout: WinAmountAnimationLayout): void;
  isPlaying(): boolean;
  destroy(): void;
}
```

rendercore 内部可以使用 Pixi `Container` / `Text` / `TextStyle` 和 `@slotclientengine/vnicore/pixi` 的 `VNIPlayer`。不要创建独立 `PIXI.Application`、独立 canvas、DOM 节点或 RAF。所有 VNI player 都必须：

```ts
autoTick: false
parent: tierContainer
```

并由 game runtime ticker 通过 `update(deltaSeconds)` 驱动。

### 7.3 播放状态机

状态机必须覆盖：

- idle
- minor-counting
- major-counting
- tier-start-loop-ending
- completing
- complete

最低要求：

- `start()` 期间如果已有动画在播，必须显式失败，或者提供明确的 `stopAndStart()` API。不要在 `start()` 内静默中断上一轮。
- `winAmountRaw === 0` 可以立即完成，但必须清空已有显示层。
- `0 < winAmountRaw <= betAmountRaw` 只跑小额数字阶段。
- `winAmountRaw > betAmountRaw` 必须先跑小额阶段到 `betAmountRaw`，再切换大号数字。
- 阈值跨越应按当前显示金额判断，触发 big / super / mega。
- 阶段切换时当前 tier 的 VNI 必须调用 `requestSegmentedPlaybackEnd()`，不能直接 destroy 粒子。
- 如果下一 tier 已启动，允许上一 tier 的 end 段和粒子排空短暂并存，但必须由 rendercore 管理，不要由 game003 操作 VNI 私有 display tree。
- 最终金额到达后，当前 tier 必须进入 end 段并等 `onPlaybackComplete` 后才整体完成。
- `update(deltaSeconds)` 必须校验 delta 为 finite non-negative number。
- formatter 抛错或返回空字符串时必须显式失败。

### 7.4 VNI 资源解析

新增 rendercore helper，把 Vite modules 和 VNI project 配置解析为 tier resource：

- project modules 使用 `Record<string, unknown>`。
- asset modules 使用 `Record<string, string>`。
- project key 使用 `./bigwin.json` 这类 manifest path。
- asset URL 使用 `createAssetUrlManifest(...)` / `resolveProjectAssetUrls(...)`。
- 必须检测 asset module basename 重复，避免 URL 被后来的同名文件覆盖。
- 每个 tier project 必须存在，且 `assertVNIProject(project)` 通过。
- 每个 project 的 `assets[]` 必须全部能 resolve。
- 每个 tier 必须读取配置的 `durationSeconds`，校验 `durationSeconds <= project.stage.duration`。如果 `durationSeconds` 小于源 project 的 `stage.duration`，rendercore 必须克隆出运行时 VNI project 并把 clone 的 `stage.duration` 改为 `durationSeconds`，不能 mutate import 进来的原始 JSON。
- `megawin` 的源 project 当前可能是 `10s`，但运行时 clone 必须使用 `stage.duration = 5`，确保 segmented end 段在 `5s` 完成。
- `stage.backgroundColor` 只是 schema 元数据，不绘制背景，不改透明策略。

注意：`packages/vnicore/src/core/asset-manifest.ts` 当前按 basename 生成 `assets/filename` key。金额动画资源放在独立 `assets/game003-s1/win-amount/assets` 目录，就是为了避免和 symbol VNI assets 混用。

### 7.5 布局和文字

rendercore 只提供通用布局能力，不写 game003 专属坐标。

建议布局输入包含：

- 小额数字位置：主轮盘区底部居中。
- 大额数字位置：主轮盘区中心。
- VNI tier stage rect：当前 art 或 focus 区域上的 overlay rect。
- 文本层 z-order：金额数字在 VNI tier 之上。

`game003` 负责从 `createGame003Layout()` 的 `sceneParts.reelArea`、`focusRegion` 或 YAML 配置换算出这些 rect / anchor。rendercore 不能知道 `mainreelbg`、`conveyor1`、`conveyor2`、`bg-wins`。

## 8. game003 集成计划

### 8.1 新增 game003 配置适配

新增或扩展文件：

```text
apps/game003/src/win-amount-config.ts
apps/game003/src/money.ts
apps/game003/src/game-layout.ts
apps/game003/src/game-adapter.ts
apps/game003/tests/win-amount-config.test.ts
apps/game003/tests/money.test.ts
apps/game003/tests/game-adapter.test.ts
apps/game003/tests/game-layout.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
```

`win-amount-config.ts` 负责：

- 从 `GAME003_STATIC_CONFIG.skins["1"].winAmount` 读取配置。
- 通过 rendercore helper 创建 tier resources。
- 复用 `formatServerUsdAmount` 作为 formatter。
- 把 `layout.sceneParts.reelArea` 映射成小额底部和大额中心位置。
- 把当前 orientation 的 art size / focus region 传给 rendercore overlay。

`money.ts` 需要保留现有 `formatServerUsdAmount(...)`，可补充测试：

- `0 -> "$0.00"`
- `100 -> "$1.00"`
- `12345 -> "$123.45"`
- 非 finite 显式失败

不要在 game003 里维护第二套金额 formatter。

### 8.2 adapter 接线

`apps/game003/src/game-adapter.ts` 需要：

- mount 时创建 `winAmountLayer`，添加到 `worldLayer`，层级应在 `runtime.mainReelsLayer` 之上。
- 创建 rendercore `WinAmountAnimationPlayer`。
- `#applyViewport(...)` 时同步调用 `winAmountPlayer.applyLayout(...)`，确保横竖屏切换后位置正确。
- `playSpin(logic)` 中读取：
  - `logic.getBet()`
  - `logic.getTotalWin()`
- spin 完成并校验 target scene 后，如果 `logic.getTotalWin() > 0`，启动中奖金额动画。
- 现有 win symbol sequence 和金额动画应共同决定 `playSpin()` 完成：
  - 没有 symbol win 但有金额 win：金额动画播完后 resolve。
  - 有 symbol win 但金额为 0：按现有 symbol queue 播完 resolve；这种数据若不合理可以在 game003 层显式失败，但不要用 totalwin 伪造 symbol queue。
  - 两者都有：二者都完成才 resolve。
- destroy 时销毁 win amount player，停止未完成 Promise，并移除 ticker/viewport listener。

不要把中奖金额动画挂到 DOM overlay。它是 Pixi 游戏画面的一部分。

### 8.3 loading-first 合同

`game003` 当前必须先走 `packages/gameloading`：

- live 初始化在 loading `99%` 回调中完成。
- `100%` 后才创建 framework / Pixi 游戏画面。

本任务新增的 big / super / mega 资源必须通过 `game-loading.generated.ts` 纳入 loading。不要在 loading 前创建 `VNIPlayer`，也不要为了预加载而创建隐藏 canvas 或第二个 Pixi app。

## 9. 测试计划

### 9.1 rendercore 测试

新增或扩展：

```text
packages/rendercore/tests/win-amount/win-amount-player.test.ts
packages/rendercore/tests/win-amount/vni-tier-effect.test.ts
packages/rendercore/tests/index.test.ts 或现有 export 测试
```

必须覆盖：

- `winAmountRaw === 0` 不显示并立即完成。
- `0 < win <= bet` 只小额底部数字，默认 `1.5s` 到达目标。
- `bet < win < 15x` 先小额，再大号中心数字，默认 `3s` 到达目标。
- `15x` 正好触发 bigwin。
- `30x` 正好切换 superwin。
- `50x` 正好切换 megawin。
- 超过 `50x` 时 mega 继续 loop，金额继续递增到最终值。
- tier 切换调用上一 tier 的 `requestSegmentedPlaybackEnd()`，不直接 destroy。
- `keepParticlesAlive` 传给 VNI segmented playback。
- VNI `onPlaybackComplete` 后才认为 tier 完成。
- bigwin / superwin / megawin 的默认三段时间都是 `0 -> 1s` start、`1s -> 4s` loop、`4s -> 5s` end。
- fake VNI 中构造 `megawin.project.stage.duration = 10`，配置 `durationSeconds = 5`，断言 rendercore 只播放到 `5s` 完成，不等待 `10s`。
- invalid bet / win / delta / thresholds / loop times / formatter 显式失败。
- 缺 project、缺 asset、asset basename 重复显式失败。
- `destroy()` 可重复调用，不泄漏 player。

VNI player 可用 fake factory 测试，不要求 unit test 启动真实 Pixi renderer。

### 9.2 buildgamestatic 和 static-config 测试

必须覆盖：

- YAML 能解析 `winAmount`。
- 生成文件包含 winAmount 配置、project modules、asset modules。
- `--check` 能发现 generated 文件不同步。
- loading generated 包含新增 `game003-win-amount-vni-projects` 和 `game003-win-amount-vni-assets`。
- 非法 threshold、非法 duration、非法 loop time、非法 glob、空 loading glob、重复 tier id 显式失败。
- `durationSeconds > project.stage.duration` 显式失败；`megawin` 源资源 `10s` 搭配配置 `5s` 必须通过。
- `assertSlotGameStaticConfig(...)` 校验 winAmount。

### 9.3 game003 测试

必须覆盖：

- `money.test.ts` 覆盖 100 -> 1.00 USD 的转换。
- `win-amount-config.test.ts` 覆盖 YAML -> rendercore config 映射、VNI project/assets resolve、横竖屏 layout anchor。
- `game-adapter.test.ts` 使用 fake win amount player 验证：
  - spin 完成后才启动金额动画。
  - 金额动画收到 `logic.getBet()` 和 `logic.getTotalWin()`。
  - 只有金额动画时，动画完成后才 resolve。
  - symbol queue 和金额动画同时存在时，两者都完成才 resolve。
  - adapter destroy 会 reject pending animation 并销毁金额 player。
  - viewport change 会同步更新金额动画 layout。
- `loading-resources.test.ts` 覆盖新增 loading 资源 id、URL 去重、glob 非空。
- `source-boundary.test.ts` 覆盖：
  - `apps/game003/src` 不直接 import `@slotclientengine/logiccore`。
  - `apps/game003/src` 不直接 import `@slotclientengine/vnicore/pixi`；VNI 播放由 rendercore 封装。
  - shared packages 不出现 `bg-wins`、`game003`、`WaysTriggerData`、`WL` 的硬编码金额动画逻辑。

如果某个测试逼迫生产代码写奇怪兜底，修改测试或测试 helper，不要削弱生产合同。

## 10. 文档和协作规则同步

必须更新：

```text
packages/rendercore/README.md
apps/game003/README.md
```

建议更新内容：

- rendercore 新增 win amount animation API。
- raw amount / formatter / threshold multiplier 的合同。
- VNI segmented playback 的配置入口。
- game003 的 `100 -> $1.00` 显示规则。
- game003 big/super/mega 资源路径和 loading 资源归属。

本任务会形成新的长期协作边界，因此需要同步更新根目录：

```text
agents.md
```

建议新增规则：

```text
- `packages/rendercore` 拥有通用中奖金额动画、金额递增、big/super/mega 阈值切换和 VNI segmented tier 播放；游戏 app 只能传入 raw bet/win、formatter、layout anchor 和资源配置，不要在 app 内复制金额动画状态机或 VNI 粒子/三段播放生命周期。
- `game003` 的金额显示当前按服务器整数 `100 -> $1.00` 转换；框架 UI 和 Pixi 中奖金额动画必须复用同一套 formatter，不要在动画里直接渲染服务器整数。
- `game003` 的 big/super/mega 金额动画资源属于 `assets/game003-s1/win-amount` 和 YAML/loading 配置，不要混入 symbol VNI manifest 或 `assets/game003-s1/assets`。
```

如果实现时发现该规则不需要写入，必须在任务报告中说明原因。

## 11. 验收命令

执行前：

```bash
git status --short --untracked-files=all
git diff --stat
```

资源清单检查：

```bash
find assets/game003-s1/win-amount -maxdepth 2 -type f | sort
find assets/game003-s1/win-amount -name .DS_Store -print
```

如果第二条输出新目录下的 `.DS_Store`，必须删除新引入的 `.DS_Store`。不要顺手改动无关目录里的历史 `.DS_Store`，除非任务明确纳入清理。

静态配置生成：

```bash
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
```

单包测试和类型：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter buildgamestatic test
pnpm --filter buildgamestatic typecheck
pnpm --filter game003 test
pnpm --filter game003 typecheck
pnpm --filter game003 lint
pnpm --filter game003 format:check
```

发布面检查：

```bash
pnpm --filter game003 release:check
```

边界 grep：

```bash
rg -n '@slotclientengine/logiccore' apps/game003/src
rg -n '@slotclientengine/vnicore' apps/game003/src
rg -n 'bg-wins|WaysTriggerData|game003|WL' packages/rendercore/src packages/vnicore/src packages/gameframeworks/src packages/logiccore/src
rg -n 'USD|SERVER_USD_AMOUNT_SCALE|formatServerUsdAmount' packages/rendercore/src
rg -n 'win-amount|bigwin|superwin|megawin' apps/game003/src/generated apps/game003/config assets/game003-s1/win-amount
git diff --check
```

预期：

- 前两个 grep 在 `apps/game003/src` 中应无输出，退出码为 1 属于通过。
- shared package grep 不应出现生产代码硬编码 `bg-wins`、`game003`、Ways 或 WL 语义；如果测试文件命中，要在报告里单独说明。
- rendercore 不应出现 USD 或 game003 金额 scale。

如果根级 `pnpm test` / `pnpm typecheck` / `pnpm format:check` 因无关历史问题失败，不能把失败算作本任务通过；必须在报告中列出任务范围内命令结果和根级无关 blocker 的准确错误。

## 12. 浏览器验收

本任务最终要求 `game003` 能看到效果。非浏览器验收通过后，执行浏览器验收：

```bash
pnpm --filter game003 dev -- --host 127.0.0.1
```

使用真实 game003 live 参数打开页面。URL 中仍禁止 `serverUrl`，旧链接携带 `serverUrl` 必须显式失败。验收者需要提供有效 `token`、`businessid`、`clienttype`、`jurisdiction`、`language` 等 live 参数。

人工检查项：

- 首屏先显示 loading。
- loading 到 `99%` 时才初始化 live。
- `100%` 后才进入游戏画面。
- spin 落停后，如果本轮 `totalwin > 0`：
  - 小额数字从主轮盘区底部居中开始。
  - 大于 1x 后数字切到主轮盘区中心并变大。
  - 到 15x 显示 bigwin。
  - 到 30x 切到 superwin。
  - 到 50x 切到 megawin。
  - 数字显示为 `$x.xx`，不是服务器整数。
  - 动画期间没有第二个 canvas、没有隐藏 DOM overlay、没有双 WebSocket。
  - 播放完成后 framework 才进入 collect / idle。

如果 live 环境没有可控的大额中奖样本，必须在任务报告中说明浏览器只能完成普通 win 或 no-win 验收；big/super/mega 的阈值切换必须由自动化 fake VNI / fake runtime 测试覆盖。不要为了验收提交 dev-only query、mock live、固定中奖或隐藏 fallback。

## 13. 二次遗漏检查

提交报告前必须做一遍遗漏检查，并把结果写入任务报告：

- 目标文件是否都在计划范围内，是否误改无关模块。
- `assets/game003-s1/win-amount` 是否只包含本任务需要的 JSON 和图片。
- JSON 引用的 asset 是否全部存在。
- YAML、generated TS、static-config types/validate、buildgamestatic tests 是否同步。
- `game-loading.generated.ts` 是否包含金额动画资源，且 loading glob 非空。
- `game-static.generated.ts` 是否包含金额动画配置和 VNI modules。
- rendercore 是否没有 USD、game003、GMI、bg-wins、Ways/WL 专属逻辑。
- game003 是否没有直接操作 VNIPlayer 或 VNI 私有 display tree。
- game003 是否复用同一个 formatter 显示 framework HUD 和 Pixi 中奖金额。
- `playSpin()` 是否等待金额动画和现有 symbol win sequence 都完成。
- `destroy()` / viewport change / repeated spin / zero win / invalid data 是否都有测试。
- `agents.md` 是否按长期规则更新，或报告中说明未更新原因。
- `git diff --check` 是否通过。

## 14. 任务报告要求

完成实现后新增：

```text
tasks/68-rendercore-win-amount-animation-[utctime].md
```

报告必须用中文，至少包含：

- 任务目标回顾。
- 实际改动文件清单。
- 资源复制清单和来源。
- 金额单位和 formatter 合同。
- 阈值和阶段实现说明。
- rendercore / game003 / vnicore 的边界说明。
- `agents.md` 是否更新及原因。
- 执行过的命令、结果、失败重试和未执行原因。
- 浏览器验收结果；如果无法触发 big/super/mega live 样本，写清自动化覆盖证据和剩余人工验收项。
- 二次遗漏检查结论。

报告不能只写“已完成”。必须能让后续维护者知道真实验证面和剩余风险。
