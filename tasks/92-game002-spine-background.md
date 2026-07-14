# game002 Spine background 任务计划

## 1. 任务目标

本任务把 `apps/game002` 当前的静态背景 `assets/game002-s3/bg.jpg` 替换为美术新提供的 Spine 背景，并把“背景资源解析、完整 art/重点区域适配、背景状态循环、场景切换动画和生命周期”封装为 `packages/rendercore` 的可复用能力。

仓库根目录固定为：

```text
/Users/zerro/github.com/slotclientengine
```

本计划是完整执行合同，不能依赖聊天记录、旧任务文档或口头说明。执行者只阅读本文件，即可完成资源盘点、rendercore 通用实现、game002 配置接入、旧背景删除、测试、静态发布验收、文档/协作规则同步和最终中文任务报告。

最终合同如下：

- 任务目标是 `apps/game002` 当前唯一的 `assets/game002-s3` 资源集。需求中出现的“game003-s3”按当前仓库实际目录判定为笔误；不得因此修改 `apps/game003` 或 `assets/game003-s1`。
- 删除 `assets/game002-s3/bg.jpg`，game002 不再 import、loading 或打包该静态图片。
- 当前普通游戏背景使用 `assets/game002-s3/BG.json` 中的 `BG` 动画，并持续循环；第一版逻辑状态命名为 `BaseGame`。
- 同一个 skeleton 中的 `FG` 是 `FreeGame` 稳态动画；`BG_FG` 是 `BaseGame -> FreeGame` 的一次性切换动画；`FG_BG` 是 `FreeGame -> BaseGame` 的一次性切换动画。
- 本任务必须把上述两个稳态和两个有向切换完整配置、解析和测试好，但不猜测尚未定义的服务端 GMI/free-game 触发字段。game002 第一版只初始化并持续播放 `BaseGame`；以后业务接入只调用 rendercore public API 切换状态，不重写背景播放器。
- 背景完整 art 坐标仍为 `2000 x 2000`；重点区域仍为 `{ x: 577.5, y: 270, width: 840, height: 1200 }`；适配仍使用 rendercore 的 `maximized-focus` 方案。不得更改 board、focus、viewport 公式、DOM frame policy 或 portrait/square/wide 行为。
- 新增 `assets/game002-s3/background.manifest.json`，作为 Spine 背景 resource、art size、focus、适配模式、逻辑状态、初始状态和有向切换的唯一配置来源。game002 不再维护第二份背景路径、尺寸、focus 或动画名表。
- `packages/rendercore` 新增通用 background manifest parser/resource resolver/Spine player/state machine；game002 只导入 manifest 和精确 Vite modules，再配置/调用 rendercore public API。
- rendercore 的背景 Spine 实现必须复用当前官方 `@esotericsoftware/spine-pixi-v8` 4.3 runtime 和共享的底层 atlas/skeleton/player 能力；不得在 background 与 symbol 两处复制官方 runtime adapter、版本判断或 atlas 解析器。
- 配置缺失、未知字段、非法尺寸、focus 越界、Spine 版本不匹配、atlas page 缺失/多余、texture 缺失、animation 不存在、非法状态、重复/缺失切换、并发切换、destroy 后调用都必须尽早显式失败，不增加静态图、首帧、默认动画、自动猜状态或跨资源 fallback。
- 如果是测试导致奇怪写法，应修改测试，不削弱 production 合同，不为了旧测试继续保留 `bg.jpg`、app 私有播放器或隐式状态切换。

任务完成后必须新增中文任务报告：

```text
tasks/92-game002-spine-background-[utctime].md
```

`utctime` 必须使用 UTC 年月日时分秒：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/92-game002-spine-background-260714-181300.md
```

## 2. 已确认的当前实现和资源事实

以下事实来自制定本计划时的实际 checkout；执行时仍必须重新运行第 5 节盘点命令，不能只引用本节快照。

### 2.1 Git 工作区和用户输入

制定计划时：

```text
branch: main
HEAD: 63fb9ad
```

工作区已经存在用户输入或相邻文档改动：

```text
M  packages/rendercore/README.md
?? assets/game002-s3/BG.atlas
?? assets/game002-s3/BG.json
?? assets/game002-s3/BG.png
?? assets/game002-s3/BG_2.png ... BG_8.png
?? assets/game002-s3/Reel_CO_CM.json
?? assets/game002-s3/Special Feature.atlas
?? assets/game002-s3/Special Feature.png
?? docs/background-adaptation.md
```

其中 `BG.*` 是本任务背景输入；`Reel_CO_CM.json` 和 `Special Feature.*` 不是本任务背景闭包。不得执行 `git reset --hard`、`git checkout --`、自动 stash、清理 untracked 或批量格式化美术 JSON；不得把无关的新资源顺带接入、删除或修改。

`docs/background-adaptation.md` 和 `packages/rendercore/README.md` 的现有改动与本任务的适配说明相关，实施时应在保留已有内容的基础上补充 Spine 背景说明，不能覆盖用户改动。

### 2.2 新 Spine 背景资源

当前背景资源闭包：

```text
assets/game002-s3/BG.json
assets/game002-s3/BG.atlas
assets/game002-s3/BG.png
assets/game002-s3/BG_2.png
assets/game002-s3/BG_3.png
assets/game002-s3/BG_4.png
assets/game002-s3/BG_5.png
assets/game002-s3/BG_6.png
assets/game002-s3/BG_7.png
assets/game002-s3/BG_8.png
```

已确认 skeleton metadata：

```text
spine: 4.3.23
skeleton bounds: x=-1872.233, y=-1006.915, width=3744.3176, height=2371.955
```

已确认动画：

| Spine animation | 语义                        | 末帧时间 | 播放方式 |
| --------------- | --------------------------- | -------- | -------- |
| `BG`            | `BaseGame` 稳态             | 15s      | loop     |
| `FG`            | `FreeGame` 稳态             | 15s      | loop     |
| `BG_FG`         | `BaseGame -> FreeGame` 切换 | 1.6s     | once     |
| `FG_BG`         | `FreeGame -> BaseGame` 切换 | 1.6s     | once     |

`BG.atlas` 是 8-page atlas，page 名必须精确为：

```text
BG.png,BG_2.png,BG_3.png,BG_4.png,BG_5.png,BG_6.png,BG_7.png,BG_8.png
```

atlas 声明的 page 尺寸为：

```text
BG.png   2000 x 2000
BG_2.png 2000 x 2000
BG_3.png 1991 x 2000
BG_4.png 1746 x 2000
BG_5.png 1996 x 1963
BG_6.png 1520 x 1579
BG_7.png 1150 x 1670
BG_8.png 1000 x 1000
```

这些 `.png` 文件当前实际是 WebP 编码内容。它们是美术提交的 atlas page，文件名与 `BG.atlas` 一致；本任务不得擅自重命名、转码或修改 atlas 来迁就基于扩展名的测试。资源测试应验证“浏览器/Pixi 可解码、atlas page 与 URL 一一闭合”，而不是错误要求 PNG magic bytes。

背景主 mesh 使用以 skeleton 原点为中心的 `-1000..1000` 坐标。manifest 第一版必须显式配置 art-space transform：

```text
x=1000, y=1000, scale=1
```

使 Spine 原点映射到 `2000 x 2000` art 的中心。skeleton metadata bounds 明显大于 art，不能用 skeleton bounds 推导 art size 或 focus；rendercore player 必须以 manifest art rect 作为背景显示/裁切合同，避免动画外溢改变现有适配边界。

### 2.3 game002 当前静态背景链路

当前主要文件：

```text
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-layout.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-entry.ts
apps/game002/tests/assets.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/README.md
```

当前链路是：

```text
skin-config.ts import bg.jpg?url
  -> loading-resources.ts 把 game002-bg 加入 99% 前资源闭包
  -> game-adapter.ts 用 Assets.load() 得到 Texture
  -> 创建 Sprite 并作为 worldLayer 第一个 child
  -> worldLayer 使用 createGame002Layout() 的 worldOffset
```

当前 adapter ticker 只在 reel spin 或 win-amount 播放时推进相关 runtime；Spine 背景接入后必须在 mounted 且未 destroy 的每个 ticker tick 都推进背景，不得因“当前没有 spin”而暂停 `BG`。

当前 layout 合同：

```text
artSize:    2000 x 2000
boardFrame: x=637.5, y=330, width=720, height=1080
focusRect:  x=577.5, y=270, width=840, height=1200
policy:     maximized-focus
```

上述数值和算法必须保持不变，但 art/focus/policy 的配置源要迁到背景 manifest；board/reel layout 仍属于 game002，不放入通用背景 manifest。

### 2.4 rendercore 当前 Spine 和 viewport 能力

当前相关文件：

```text
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/spine-version.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/viewport/focused-art-viewport.ts
packages/rendercore/src/index.ts
packages/rendercore/package.json
packages/rendercore/tests/symbol/*spine*
packages/rendercore/tests/viewport/focused-art-viewport.test.ts
packages/rendercore/README.md
docs/background-adaptation.md
```

当前事实：

- `@esotericsoftware/spine-pixi-v8` 实际锁定为 `4.3.10`，rendercore 只接受 skeleton `4.3.x`。
- symbol Spine adapter 已有官方 `TextureAtlas`、`AtlasAttachmentLoader`、`SkeletonJson`、`Spine` 创建、手动 update、once completion、reset 和 destroy 语义。
- symbol adapter 当前只支持单 atlas page；新背景是 8 pages，不能直接伪装成 symbol animation resource。
- `calculateFocusedArtViewport()`、`createMaximizedFocusedArtViewportPolicy()`、`mapArtRectToViewport()` 已经拥有现有适配算法；本任务复用这些 API，不重写公式。
- rendercore 当前没有通用背景 manifest、背景状态机或背景播放器入口。

## 3. 工具链和执行原则

- Node.js：`>=24.0.0`
- pnpm：`>=10.0.0`
- monorepo：pnpm workspace + turbo
- 构建：TypeScript + Vite
- 测试：Vitest
- lint：ESLint
- format：Prettier

本任务原则上不需要新增 npm 依赖。若现有依赖未安装，先运行：

```bash
pnpm install
```

只有在依赖下载真实失败后，才设置代理并重试原命令：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

不得在没有下载失败时修改 npm/pnpm 全局配置。

非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 时，用相同命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter game002 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的 production 行为。特别禁止为旧测试继续保留 `bg.jpg`、在 app 内复制 Spine player、把缺 transition 当 no-op、捕获 parser 错误后静默显示首帧，或把 unknown state 自动改为 `BaseGame`。

## 4. 范围和非目标

### 4.1 必须检查或修改的实现面

```text
assets/game002-s3/background.manifest.json                  # 新增
assets/game002-s3/BG.json                                   # 只读美术输入
assets/game002-s3/BG.atlas                                  # 只读美术输入
assets/game002-s3/BG.png ... BG_8.png                       # 只读美术输入
assets/game002-s3/bg.jpg                                    # 删除

packages/rendercore/package.json                            # 新增 ./background export
packages/rendercore/src/background/*                        # 新增通用实现
packages/rendercore/src/spine/* 或等价内部目录              # 按需抽取共享底层
packages/rendercore/src/symbol/spine-animation.ts            # 复用共享底层，行为不得回归
packages/rendercore/src/index.ts
packages/rendercore/tests/background/*                      # 新增
packages/rendercore/tests/symbol/*spine*                    # 共享底层回归
packages/rendercore/README.md

apps/game002/src/background-config.ts                       # 建议新增
apps/game002/src/skin-config.ts
apps/game002/src/loading-resources.ts
apps/game002/src/game-layout.ts
apps/game002/src/game-adapter.ts
apps/game002/src/game-demo.ts                               # 默认 layout 调用点审计
apps/game002/src/game-entry.ts                              # frame policy 配置源审计
apps/game002/tests/assets.test.ts
apps/game002/tests/loading-resources.test.ts
apps/game002/tests/game-layout.test.ts
apps/game002/tests/game-adapter.test.ts
apps/game002/tests/game-demo.test.ts
apps/game002/tests/framework-flow.test.ts
apps/game002/tests/source-boundary.test.ts
apps/game002/scripts/verify-static-dist.mjs
apps/game002/vite.config.ts                                 # ./background 源码 alias
apps/game002/README.md

docs/background-adaptation.md
agents.md
tasks/92-game002-spine-background-[utctime].md               # 完成后新增
```

文件名可按现有代码组织微调，但职责和验收面不能缩减。`dist/`、`coverage/` 是生成物，不手改、不提交。

### 4.2 明确非目标

- 不修改 `apps/game003`、`assets/game003-s1` 或 game003 的 4.2 非发布现状。
- 不接入 `Reel_CO_CM.json`、`Special Feature.*`、`CN_1..CN_4`、`Nearwin*`、`WM_Fx` 或其它新 feature 资源。
- 不猜测 GMI 中哪个字段代表进入/退出 FreeGame；不在 `applyInitialState()`、`playSpin()` 或 collect 中根据名字、step 数、win 金额、symbol 或 component 做启发式切换。
- 不新增 debug query、production 按钮、DOM control 或 app 私有 public API 来强制切背景。
- 不改变 game002 的 `6 x 9` grid-cell reel、board 坐标、focus 坐标、`maximized-focus` 公式、win-amount、live server、`lines=30`、query、single prepared session、local public reel 或服务器 scene 临时叠加合同。
- 不把 game002 的 board/reel/game-state 业务写进 rendercore background 包；rendercore 只认识通用 state id 和有向 transition。
- 不把背景 metadata 塞入 `symbol-state-textures.manifest.json`；背景和 symbol manifest 是不同领域、不同 parser。
- 不扩展 `apps/buildgamestatic` 或 game003 YAML schema。game002 当前使用 typed app config + 独立背景 manifest，本任务不制造无消费者的通用 YAML 功能。
- 不新增静态图片 fallback、placeholder、首帧截图或旧 `bg.jpg` 兼容入口。

## 5. 实施前盘点

### 5.1 环境、基线和用户资源保护

```bash
cd /Users/zerro/github.com/slotclientengine
node --version
pnpm --version
git branch --show-current
git log -3 --oneline
git status --short --untracked-files=all
git diff --stat
git diff -- packages/rendercore/README.md
```

必须确认：

- Node/pnpm 满足版本要求；
- `BG.json`、`BG.atlas`、8 个 atlas page 完整存在；
- `Reel_CO_CM.json`、`Special Feature.*` 等无关资源不会被修改；
- `packages/rendercore/README.md`、`docs/background-adaptation.md` 的已有内容被保留；
- 不覆盖用户其它工作区改动。

### 5.2 只读资源闭包检查

```bash
jq '{skeleton: .skeleton, animations: (.animations | keys)}' assets/game002-s3/BG.json
awk 'BEGIN{page=""} /^[^[:space:]].*\.png$/{page=$0; next} /^size:/{print page "\t" $0}' assets/game002-s3/BG.atlas
file assets/game002-s3/BG*.png assets/game002-s3/bg.jpg
du -h assets/game002-s3/BG.json assets/game002-s3/BG.atlas assets/game002-s3/BG*.png assets/game002-s3/bg.jpg
```

再用只读脚本或正式测试确认四个 animation 的真实 duration，不能把本计划中的快照当硬编码时间表。manifest 只声明 animation name 和状态关系；duration 由 skeleton/runtime 读取，不在 manifest 或 app 中维护第二份 `15/1.6` 时间表。

如果 skeleton 版本、动画名、atlas pages 或主 mesh 坐标与第 2 节不一致，应立即停止并记录资源差异，不能用 alias、大小写修正、缺页忽略或默认动画继续实现。

## 6. 背景 manifest 合同

### 6.1 文件和建议 schema

新增：

```text
assets/game002-s3/background.manifest.json
```

version 1 的目标内容应表达以下合同；字段名如因现有命名规范微调，必须保持语义和严格校验一致：

```json
{
  "version": 1,
  "kind": "spine",
  "artSize": { "width": 2000, "height": 2000 },
  "adaptation": {
    "mode": "maximized-focus",
    "focusRect": { "x": 577.5, "y": 270, "width": 840, "height": 1200 }
  },
  "resource": {
    "skeleton": "./BG.json",
    "atlas": "./BG.atlas",
    "textures": {
      "BG.png": "./BG.png",
      "BG_2.png": "./BG_2.png",
      "BG_3.png": "./BG_3.png",
      "BG_4.png": "./BG_4.png",
      "BG_5.png": "./BG_5.png",
      "BG_6.png": "./BG_6.png",
      "BG_7.png": "./BG_7.png",
      "BG_8.png": "./BG_8.png"
    },
    "transform": { "x": 1000, "y": 1000, "scale": 1 }
  },
  "initialState": "BaseGame",
  "states": {
    "BaseGame": { "animation": "BG" },
    "FreeGame": { "animation": "FG" }
  },
  "transitions": [
    {
      "from": "BaseGame",
      "to": "FreeGame",
      "animation": "BG_FG"
    },
    {
      "from": "FreeGame",
      "to": "BaseGame",
      "animation": "FG_BG"
    }
  ]
}
```

稳态固定 loop、transition 固定 once，应由 schema 语义决定；不额外配置可互相矛盾的 `loop` 布尔值。切换完成后 player 自动开始目标 state 的 loop animation。

### 6.2 parser 必须显式校验

`packages/rendercore/src/background/manifest.ts`（或等价文件）至少校验：

- 顶层和所有嵌套对象只接受已知字段；unknown field 失败。
- `version` 精确为 `1`，`kind` 精确为 `spine`。
- `artSize`、`focusRect`、transform 均为 finite number；尺寸/scale 为正，坐标合法，focus 完整位于 art 内。
- `adaptation.mode` 第一版只接受 `maximized-focus`；不能把未知 mode 回落到它。
- skeleton/atlas/texture path 是非空相对路径，不接受 URL、绝对路径、`..` 逃逸或重复 path。
- texture map 的 key 是 atlas page 的真实名字，value 是资源相对路径；key/value 均唯一。
- `initialState` 必须存在于 `states`；state id 和 animation name 非空且唯一。
- transition 的 `from/to` 都存在，不能 self-transition，同一有向 pair 只能有一条，animation name 非空。
- 本次 manifest 的两个非初始 state/双向切换形成完整闭包；通用 parser 不必强制任意 N 状态全连接，但请求不存在的 direct transition 必须失败，不能自动找多跳路径。
- skeleton 必须为受支持的 Spine `4.3.x`；四个配置 animation 必须在 skeleton 中真实存在且大小写一致。
- atlas page 集合与 texture map 必须完全相等；缺页、多余 page、同一 URL 对多个 page、atlas region/skeleton attachment 不可解析都失败。

解析结果和 nested records 应冻结或以只读结构返回，避免 app 在 runtime 改 manifest。

### 6.3 配置单一来源

game002 必须从 parsed manifest 派生：

```text
artSize
focusRect
maximized-focus policy
Spine resource paths/module closure
initialState
state animation map
transition animation map
background root transform
```

允许为了现有调用方保留 `GAME002_ART_SIZE`、`GAME002_FOCUS_REGION` 之类导出名，但值必须直接引用 parsed manifest，不得重新手写相同数字。`GAME002_BOARD_FRAME`、cell/reel timing 等仍保留在 `game-layout.ts`，不能移入背景 manifest。

## 7. rendercore 通用实现

### 7.1 新增 background public surface

建议新增：

```text
packages/rendercore/src/background/index.ts
packages/rendercore/src/background/types.ts
packages/rendercore/src/background/errors.ts
packages/rendercore/src/background/manifest.ts
packages/rendercore/src/background/spine-background-player.ts
packages/rendercore/tests/background/manifest.test.ts
packages/rendercore/tests/background/spine-background-player.test.ts
```

并同步：

```text
packages/rendercore/src/index.ts
packages/rendercore/package.json exports["./background"]
apps/game002/vite.config.ts 中的 @slotclientengine/rendercore/background alias
```

建议 public API 至少包含：

```ts
parseSpineBackgroundManifest(manifest: unknown)

createSpineBackgroundResource({
  manifest,
  skeletonModules,
  atlasModules,
  textureModules,
})

createSpineBackgroundPlayer({ resource })
```

player 至少提供：

```ts
interface SpineBackgroundPlayer {
  readonly container: Container;
  init(): Promise<void>;
  update(deltaSeconds: number): void;
  requestState(state: string): Promise<void>;
  getSnapshot(): {
    stableState: string;
    targetState: string | null;
    phase: "stable" | "transitioning";
  };
  destroy(): void;
}
```

实际命名可按 rendercore 风格调整，但 app 不得需要访问 `Spine`、track、skeleton、atlas page、内部 container children 或 private state 才能使用背景。

### 7.2 抽取共享 Spine 底层，避免两套 runtime adapter

`packages/rendercore/src/symbol/spine-animation.ts` 已有官方 4.3 runtime 初始化和手动 update。实施时应把确实共用的底层能力抽到 rendercore 内部目录，例如：

```text
packages/rendercore/src/spine/version.ts
packages/rendercore/src/spine/atlas.ts
packages/rendercore/src/spine/player.ts
```

要求：

- symbol 和 background 共用同一版本判断、TextureAtlas/SkeletonJson 构建、animation exact-name 查找、manual update、reset、completion 和 destroy 基础逻辑。
- 共享 atlas helper 支持显式多 page texture map；symbol 的单 page contract 继续由 symbol resource validator 限制，不能因为 background 支持多 page 就放宽现有 symbol manifest 的错误检查。
- 不改变现有 `RenderSymbol` player cache、normal/appear/win、once completion 或 transform 语义。
- app 仍不得直接依赖/import `@esotericsoftware/spine-pixi-v8` 或 rendercore 私有路径。
- 3.8/4.2/未知版本仍显式失败，不恢复旧 adapter 或版本 fallback。

### 7.3 背景 player 状态机

初始化：

```text
init()
  -> 加载并绑定 8 个 atlas page texture
  -> 创建一个 Spine instance（autoUpdate=false）
  -> 应用 manifest transform
  -> 建立 2000 x 2000 art clip/mask
  -> 播放 initialState=BaseGame 对应 BG loop
```

状态请求：

```text
stable BaseGame + requestState(FreeGame)
  -> 播放 BG_FG once
  -> update() 驱动到 completion
  -> 播放 FG loop
  -> stableState=FreeGame
  -> request Promise resolve

stable FreeGame + requestState(BaseGame)
  -> 播放 FG_BG once
  -> completion 后播放 BG loop
  -> stableState=BaseGame
```

明确行为：

- 请求当前 stable state：不重播、不闪烁，返回已完成 Promise。
- unknown state：同步或 Promise 明确失败，错误含 state id。
- 缺少 direct transition：失败，不直接切目标 loop，不 BFS、多跳或 fade fallback。
- transition 进行中再次请求：显式失败，不覆盖、不排队、不静默忽略。
- transition 只有 runtime completion 事件可完成；不能在 app 中硬编码 1.6 秒计时。
- transition 完成的同一 update 内切到目标 loop，避免一帧 setup pose/透明空白。
- `deltaSeconds` 必须 finite 且 `>=0`；非法 delta 失败。
- `init()` 重复、init 前 update/request、destroy 后调用都失败或按明确幂等 destroy 合同处理；不能出现半初始化 player。
- destroy 时清理 listener/track、mask、Spine instance、texture/player 引用，并 reject 尚未完成的 transition Promise。
- 背景只有一个 Spine instance；稳态/transition 只切 animation，不销毁重建 skeleton。

### 7.4 art 坐标、裁切和适配边界

background player 的 `container` 使用完整 art 坐标；manifest transform 把 skeleton 中心原点放到 `(1000,1000)`。player 只负责：

- Spine display tree；
- art rect clip/mask；
- 状态播放。

已有 viewport 算法仍负责：

- 根据 `artSize/focusRect/viewportSize` 计算 `visibleRect`；
- 计算 `worldOffset`；
- portrait/square/wide 页面映射；
- art 边界钳制。

game002 仍把背景 container、reel layer、win-amount layer 放在同一个 art `worldLayer`，统一应用 `worldOffset`。禁止只移动背景、对 Spine bounds 做 contain/cover、根据 skeleton bounds 缩放、用 canvas/CSS 二次适配，或把 VNI stage-size 规则套到 Spine 背景。

## 8. game002 接入

### 8.1 背景配置模块

建议新增 `apps/game002/src/background-config.ts`，职责仅为：

- import `background.manifest.json`；
- 精确 import `BG.json`、`BG.atlas?raw`；
- 使用 brace glob 或显式 map import `BG.png..BG_8.png?url`；
- 调用 rendercore parser/resource resolver；
- 导出冻结的 game002 background resource/config。

禁止：

```text
assets/game002-s3/*.json
assets/game002-s3/*.png
assets/game002-s3/**
```

这类宽泛 glob 会误接入 symbol、CN、effect、win-amount 和无关 feature 资源。

`Game002SkinConfig` 应从 `backgroundUrl/backgroundLabel` 改为 background resource/config。symbol Spine module maps 保持原样，不能与 `BG.*` 合并成一张模糊表。

### 8.2 layout/frame policy 保持行为不变

调整 `game-layout.ts` 和 `game-entry.ts`：

- art size/focus/policy 从 parsed background manifest 派生；
- board/cell/reel 坐标仍由 game002 layout 配置拥有；
- `createGame002Layout()` 继续调用 rendercore 现有 viewport/mapping API；
- `createGame002FramePolicy()` 继续产出 `maximized-focus`；
- `game-demo.ts`、`framework-flow.test.ts`、`win-amount-config.ts` 等现有默认 layout/backgroundFrame 调用点全部继续从同一份 parsed config 得到 art/focus，不能只改 adapter 主入口；
- `GAME002_REFERENCE_SIZE`、board、phone/near-square/square/wide 的预期结果不变；
- focus 必须继续完整包含 board，测试保留四边各 60 的合同。

不要为了减少参数而让 layout 隐式 import mutable singleton，也不要重新复制 `visibleRect/worldOffset` 公式。

### 8.3 adapter 生命周期

把静态 texture/sprite 路径替换为 rendercore background player：

```text
mount
  -> 创建 Pixi Application
  -> 创建/初始化 background player
  -> 创建 reels/win-amount
  -> worldLayer.addChild(background.container, reels, winAmount)
  -> 注册 ticker/viewport listener
```

要求：

- background 永远是 art world 最底层，reels 和 win-amount z-order 不变。
- player `init()` 失败时 mount 必须回滚已创建的 Application/container；不能留下 canvas、ticker 或 listener。
- ticker 每帧先用现有 normalized/capped delta 推进 background，再推进 reel/win-amount；即使没有 spin 也必须推进 `BG`。
- 背景更新错误沿用 adapter 的 fail-fast 路径：停止 ticker、reject 当前 pending spin；没有 pending spin 时也必须报告错误，不能永久停在坏帧而不提示。
- viewport change 仍只 resize renderer 和设置整个 `worldLayer.position=worldOffset`；不对 background 做额外 scale/position。
- destroy 必须移除 ticker/listener，destroy background player，再 destroy Pixi app；重复 destroy 不泄漏。
- 为 adapter 测试注入 typed background player factory/fake player；不要为方便测试暴露 production 私有 Spine 对象。

当前 app 不调用 `requestState("FreeGame")`。未来 GMI 触发合同明确后，再在 app 层调用该 public API；该未来工作不能成为本任务不配置/不测试 transition 的理由。

### 8.4 gameloading 闭包

修改 `apps/game002/src/loading-resources.ts`：

- 删除 `game002-bg` 对 `bg.jpg` 的 import/resource；
- 增加 background manifest、`BG.json`、`BG.atlas` 和 8 个 atlas page URL；
- resource id 稳定且唯一，例如：

```text
game002-background-manifest
game002-background-spine-skeleton
game002-background-spine-atlas
game002-background-spine-textures:BG.png
...
game002-background-spine-textures:BG_8.png
```

- 8 个 texture 使用精确 module map；总 weight 可延续旧背景权重语义并按文件均摊，但不能因多个 page 把 loading 百分比重复放大 8 倍。
- background 资源仍在 99% 回调之前全部加载；100% 后才创建 framework/Pixi，prepared live session 仍只创建一次。
- loading closure 不包含 `bg.jpg`、`Reel_CO_CM.json`、`Special Feature.*` 或其它背景 manifest 未引用资源。

### 8.5 删除旧背景

只有在源码、测试、README、loading 和 release check 全部切换后，才删除：

```text
assets/game002-s3/bg.jpg
```

随后执行边界搜索，除历史任务计划/报告中的事实记录外，production 和当前文档不能继续声明 game002 使用 `bg.jpg`。不要回写历史 `tasks/91-*`；历史报告保持当时事实。

## 9. 测试和静态发布检查

### 9.1 rendercore manifest/resource 测试

至少覆盖：

- 当前 `background.manifest.json` 成功解析，art/focus/transform/state/transition 精确；
- unknown fields、错误 version/kind/mode、NaN/Infinity/零负尺寸、focus 越界失败；
- 非法/逃逸/重复 resource path 失败；
- initial state 缺失、unknown state、duplicate state/pair、self-transition、unknown from/to 失败；
- Spine 4.3.23 和四个 exact animation 成功；4.2/3.8/未知版本失败；animation 大小写或缺失失败；
- 8 个 atlas page 与 texture map 精确闭合；缺一页、多一页、重复 URL、page 名错误、malformed atlas/skeleton 失败；
- `.png` 文件是 WebP bytes 不应被错误的 PNG signature 测试拒绝，实际 Pixi texture load/decoder 合同应有可执行验证。

测试 fixture 优先使用小型 test-local fixture；若必须使用当前美术作为集成 fixture，只能只读引用或字节一致复制，不能改美术源来满足测试。

### 9.2 rendercore player/state-machine 测试

用 fake low-level Spine player 精确覆盖：

- init 只创建一个 player，播放 `BG` loop；
- idle update 持续转发 delta；
- BaseGame -> BG_FG once -> FG loop -> Promise resolve；
- FreeGame -> FG_BG once -> BG loop；
- same-state no-op 不重播；
- unknown state、missing direct transition、transition 中二次请求失败；
- once 未 complete 时不提前切稳态；complete 同 tick 切目标 loop；
- invalid delta、init 前/重复 init、destroy 后调用失败；
- destroy 清理 player/mask/listener，并 reject pending transition；
- art clip 为 `0,0,2000,2000`，transform 为 `1000,1000,1`；skeleton bounds 不会替代 art size。

共享底层改动还必须运行现有 symbol Spine tests，确认单 page、cache、state switch、once completion、destroy 和错误语义无回归。

### 9.3 game002 测试

更新或新增测试，至少覆盖：

- skin=1 只有 background manifest/resource，不再暴露 `backgroundUrl` 或 `bg.jpg`；
- art/focus/policy 从 manifest 派生，数值和现有 portrait/square/wide 预期不变；
- adapter mount 顺序为 background、reels、win-amount；background init 失败完整回滚；
- 无 spin 时 ticker 仍更新 background；spin/win-amount 时三者使用同一 normalized delta；
- resize 只改 renderer/worldOffset，不二次缩放背景；
- background update 抛错时 fail-fast；destroy 清理 background player；
- loading ids/URLs 唯一，精确包含 manifest + skeleton + atlas + 8 pages，不含 `bg.jpg` 和无关资源；
- source-boundary 确认 app 不 import Spine runtime、无宽泛 glob、无 app 私有 animation name/state table、无静态 fallback；
- `vite.config.ts` 对 `@slotclientengine/rendercore/background` 的 source alias 位于 rendercore 根 alias 之前，dev/test 不会误解析到尚未构建或错误入口；
- `BaseGame/FreeGame/BG/FG/BG_FG/FG_BG` 的映射只存在于 background manifest 和对应断言/fixture，不在 game runtime 写第二份 production table。

### 9.4 release check

更新 `apps/game002/scripts/verify-static-dist.mjs`：

- source contract 检查 `background.manifest.json`、`BG.json`、`BG.atlas` 和 8 pages；
- 解析 manifest 和 atlas，确认 resource/state/transition 闭包；
- dist 中 background manifest、skeleton、atlas、8 pages 各且仅一个 hashed asset；
- 以源文件 bytes 对比 dist asset，避免把 WebP-in-`.png` 错判成真正 PNG；
- dist/source 都不得存在或引用 `bg.jpg`；
- 继续保留 symbol、win-amount、旧 skin、敏感值、相对 URL 等既有门禁。

不得把 release check 简化成“bundle 中出现 BG 字符串”。

## 10. 文档和协作规则同步

### 10.1 game002 README

更新 `apps/game002/README.md`：

- 背景资源改为 `background.manifest.json + BG.json/BG.atlas/BG*.png`；
- 当前普通态播放 `BaseGame -> BG loop`；
- 配置包含 `FreeGame`、`BG_FG`、`FG_BG`，但尚未接入业务触发；
- art/focus/maximized-focus 行为不变；
- parser/player/state machine 在 rendercore，app 只配置；
- loading/release check 新闭包；
- 删除 `bg.jpg` 陈述和静态 fallback 暗示。

### 10.2 rendercore 和背景适配文档

在保留现有用户改动基础上更新：

```text
packages/rendercore/README.md
docs/background-adaptation.md
```

写清：

- “背景表现来源”可以是静态 texture 或 manifest-driven Spine player；
- “背景适配”仍由 artSize/focusRect/viewport policy 决定，不能从 texture 尺寸或 Spine skeleton bounds 推导；
- state/transition 不改变 art/focus/viewport；
- 多页 atlas、逻辑状态和有向切换的 manifest 合同；
- app 只在业务语义明确后 request state，不在 rendercore 写 game002/free-game 规则。

### 10.3 agents.md / AGENTS.md

本任务改变了长期资源路径和共享 ownership，必须更新受跟踪的 `agents.md`（当前大小写不敏感工作区中的 `AGENTS.md` 指向同一规则文件）：

- 把 `game002 -> assets/game002-s3/bg.jpg` 改为 `background.manifest.json + BG Spine resource`；
- 写清当前 `BaseGame/FreeGame` 和双向 transition 映射；
- 写清 rendercore 拥有 background manifest/parser/player/state machine/art clip/viewport 适配；
- 写清 game002 只配置并在未来业务触发明确后调用，不得复制或猜测；
- 继续保留 Spine 4.3、single skin、loading、focus、symbol、win-amount 和 fail-fast 规则。

同步后检查：

```bash
cmp -s AGENTS.md agents.md
```

## 11. 自动化验收命令

所有命令从仓库根目录执行。先运行目标包，失败时定位真实 production/test 问题，不得用 fallback 降级。

### 11.1 边界和资源检查

```bash
test ! -e assets/game002-s3/bg.jpg
test -e assets/game002-s3/background.manifest.json

rg -n 'assets/game002-s3/bg\.jpg|game002-s3/bg\.jpg|backgroundUrl|createPositionedSprite' \
  apps/game002 packages/rendercore docs agents.md

rg -n 'game002-s3/(\*|\*\*)|@esotericsoftware/spine-pixi-v8' \
  apps/game002/src apps/game002/tests

rg -n 'Reel_CO_CM|Special Feature|CN_[1-4]|Nearwin[1-3]|WM_Fx' \
  apps/game002/src/background-config.ts apps/game002/src/loading-resources.ts \
  assets/game002-s3/background.manifest.json
```

预期：

- 第一条 `rg` 对 production/current docs 无旧静态背景引用；历史 `tasks/91-*` 不在搜索范围，不回写。
- app 不直接 import Spine runtime；若测试只是在断言禁止依赖，需要人工判读。
- background closure 不接入无关 resource。

### 11.2 目标包门禁

```bash
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore build

CI=true pnpm --filter game002 format:check
CI=true pnpm --filter game002 lint
CI=true pnpm --filter game002 test
CI=true pnpm --filter game002 typecheck
CI=true pnpm --filter game002 build
CI=true pnpm --filter game002 release:check

CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer build
```

`symbolsviewer` 不接入背景，但 rendercore Spine 底层重构会影响其 symbol consumer，因此必须作为邻接回归面验收。

### 11.3 全仓门禁

```bash
CI=true pnpm format:check
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm build
CI=true pnpm test
git diff --check
cmp -s AGENTS.md agents.md
git status --short --untracked-files=all
```

当前基线已知 `game003-s1` 是 Spine 4.2.43，而共享 rendercore 明确只支持 4.3.x；任务 91 报告记录全仓 `pnpm test` 会因此失败。执行本任务仍必须运行全仓 test 并精确归因：

- 如果失败仍且仅为该既有 4.2 gate，在任务报告记录命令、首个错误、受影响 suite 和“本任务未恢复 4.2 fallback”；目标包门禁必须全部通过。
- 如果出现 background、game002、rendercore symbol、symbolsviewer 或其它新失败，必须修复后才能完成。
- 不得删除/skip 测试、恢复 4.2 runtime、放宽版本 parser 或把失败标成通过。

## 12. 浏览器和视觉验收

启动：

```bash
CI=true pnpm --filter game002 dev -- --host 127.0.0.1 --port 5206 --strictPort
```

使用真实、URL 编码且不写入仓库/报告的 query 参数访问：

```text
http://127.0.0.1:5206/?skin=1&token=<真实值>&gamecode=<真实值>&businessid=<真实值>&clienttype=<真实值>&jurisdiction=<真实值>&language=<真实值>&bet=<真实值>&lines=30&times=<真实值>&autonums=<真实值>&requestTimeoutMs=<真实值>
```

必须验收：

1. 99% 前只有 loading；Network 中 background manifest、BG skeleton、atlas 和 8 pages 全部成功，无 `bg.jpg` 请求；100% 后只有一个 live WebSocket。
2. 进入游戏即播放 `BG`，画面不是 setup pose/空白/静态首帧；无 spin 时环境动画仍持续，spin、中奖金额播放和 resize 时也不暂停。
3. Spine 背景中心、board 和旧 `2000 x 2000` art 坐标对齐；没有整体偏移 1000、上下翻转、二次缩放或 skeleton bounds 导致的 layout 漂移。
4. `390 x 844`、`1430 x 1464`、`1200 x 1200`、`1920 x 1080` 下 focus/board 与任务 91 的 `maximized-focus` 行为一致；focus 外 art 仍按现有算法显示，art 外动画内容被正确裁切。
5. reel、symbol、win-amount、HUD z-order 不变；背景不能遮住主转轮或金额。
6. 控制台无 atlas page、texture decode、Spine parser、重复 listener、未处理 Promise、404 或旧背景 warning。
7. old skin、非法 query、资源/manifest 错误仍显式失败，不回落静态背景。

当前 game002 没有 FreeGame 业务触发，因此浏览器不通过伪造 GMI/debug query 验收两个 transition；双向切换由 rendercore unit tests 严格验收。以后真实触发接入时再增加 live transition 视觉验收。

如果执行环境没有真实 token/业务参数，报告必须把“真实 live/浏览器视觉验收”列为待用户验收，不能声称已通过；自动化、构建和静态发布门禁仍必须完成。

## 13. 完成标准

以下项目全部满足，任务才可结束：

- `background.manifest.json` 是 art/focus/policy/resource/state/transition 的唯一配置源。
- rendercore background parser/resource resolver/player/state machine 使用官方 Spine 4.3，支持当前 8-page atlas，并复用 symbol 的共享底层而非复制 adapter。
- `BaseGame=BG`、`FreeGame=FG`、`BaseGame->FreeGame=BG_FG`、`FreeGame->BaseGame=FG_BG` 精确且 fail-fast。
- game002 当前只初始化/循环 BaseGame，不猜测未来 FreeGame 业务触发。
- `bg.jpg` 已删除，source/loading/dist/README/current rules 无旧引用和 fallback。
- art `2000 x 2000`、focus、board、`maximized-focus` 算法和 portrait/square/wide 行为无变化。
- background 每帧更新，mount/error/resize/destroy 生命周期完整；reel/win-amount/live/session 合同无回归。
- manifest、player、game002 adapter/loading/layout/source-boundary/release check 测试覆盖正反向合同。
- rendercore、game002、symbolsviewer 目标包 format/lint/test/typecheck/build/release 命令全部通过。
- 全仓门禁已执行；任何失败均精确归因且没有用 fallback/skip 掩盖。
- `apps/game002/README.md`、`packages/rendercore/README.md`、`docs/background-adaptation.md`、`agents.md` 已同步。
- `git diff --check` 和 `cmp -s AGENTS.md agents.md` 通过，用户无关改动/资源保持完整。
- 已按第 14 节创建中文任务报告。

## 14. 最终任务报告

生成 UTC 文件名：

```bash
utctime=$(date -u +%y%m%d-%H%M%S)
report="tasks/92-game002-spine-background-${utctime}.md"
```

报告必须用中文，至少包含：

1. 结论和未完成项；
2. 执行前后 Git 基线、保留的用户改动和未触碰的无关资源；
3. 最终 background manifest schema、art/focus/transform、8-page 资源闭包；
4. rendercore public API、共享 Spine 底层和 symbol 回归说明；
5. BaseGame/FreeGame 稳态、双向 transition、并发/错误/destroy 语义；
6. game002 adapter/ticker/viewport/loading/release 接入和 `bg.jpg` 删除证据；
7. 修改、新增、删除文件清单；
8. 每条自动化命令及 PASS/FAIL、测试数量/覆盖率、全仓失败精确归因；
9. README、背景适配文档和 agents 规则同步情况；
10. 浏览器尺寸、视觉、Network、console 和 single WebSocket 验收结果；没有真实参数时明确列为待用户验收；
11. 明确声明未猜测 FreeGame 的服务端触发规则、未接入无关资源、未增加 fallback、未修改 game003。

报告不得包含真实 token、cookie、完整业务 URL 或其它敏感信息。

## 15. 二次遗漏审计清单

提交报告前再逐项检查，不能只依赖第一次实现：

- **资源**：manifest、BG skeleton、atlas、8 pages 精确闭合；WebP-in-`.png` 未被错误转码；`bg.jpg` 删除；无关 feature 资源未接入。
- **schema**：unknown field、路径、数值、focus、state、transition、版本、animation、atlas pages 均 fail-fast；无默认/首帧 fallback。
- **共享实现**：background 与 symbol 共用官方 Spine 底层；symbol 单页/cache/once/destroy 没有被多页支持破坏。
- **状态机**：initial loop、双向 once、same-state、unknown、missing edge、并发请求、completion、destroy pending 全覆盖。
- **适配**：art/focus/policy 来自 manifest；board 仍在 app；现有 viewport 公式和四类尺寸回归。
- **app 生命周期**：loading 99%/100%、mount rollback、idle ticker、spin ticker、resize、z-order、error、destroy、single session。
- **发布**：source boundary、精确 glob、dist hashed assets、byte closure、旧背景/旧 skin/敏感值检查。
- **邻接消费者**：rendercore symbol 和 symbolsviewer 通过；game003 已知版本失败没有被扩大或用 fallback 隐藏。
- **文档规则**：game002/rendercore README、背景适配文档、agents、报告命名和 UTC 时间齐全。
- **工作区**：未回滚用户改动，未修改 `Reel_CO_CM.json`/`Special Feature.*`，`git diff --check` 通过。
