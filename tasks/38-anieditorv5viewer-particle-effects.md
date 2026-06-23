# anieditorv5viewer particle effects 任务计划

## 1. 任务目标

更新现有 Vite + TypeScript + Pixi.js viewer：

```text
/Users/zerro/github.com/slotclientengine/apps/anieditorv5viewer
```

让它跟上 `docs/anieditor5/src` 当前编辑器代码和 `docs/anieditor5/export` 当前导出数据，重点支持新版粒子和弹性动画：

- 新增内置单文件 VNI/V5G 导出：
  - `docs/anieditor5/export/2x.json`
  - `docs/anieditor5/export/5x.json`
  - `docs/anieditor5/export/10x.json`
  - `docs/anieditor5/export/respin.json`
  - `docs/anieditor5/export/scatter1.json`
  - `docs/anieditor5/export/scatter2.json`
  - `docs/anieditor5/export/multipay.json`
- 继续支持已有导出：
  - `docs/anieditor5/export/project.json`
  - `docs/anieditor5/export/bigwin.json`
  - `docs/anieditor5/export/megawin.json`
  - `docs/anieditor5/export/superwin.json`
  - `docs/anieditor5/export2/manifest.json`
  - `docs/anieditor5/export2/edit_full/project.json`
  - `docs/anieditor5/export2/runtime_50/project.json`
- 新增支持 layer animation：
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- 保留已支持的 `particles`、`particle_twinkle`、`scale_in`、`scale_out`、`pop`、`blink` 等播放能力。
- 保留 `export2` 缩小资源能力：`runtime_50` 文件像素可为 50%，但播放逻辑尺寸仍按原始设计尺寸显示。
- 缺失资源、未知动画、未知 easing、未知 blend mode、非法 JSON、缺失必须参数、贴图尺寸不匹配都必须显式失败，不允许静默跳过、占位渲染或不必要兜底。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成差异确认、资源同步、viewer 更新、测试、浏览器验收和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/38-anieditorv5viewer-particle-effects-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/38-anieditorv5viewer-particle-effects-260623-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml` 已包含 `apps/*` 和 `packages/*`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`
- 新增空目录必须放 `.keepme`

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增 npm 依赖。如果确实新增依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。若 `pnpm install` 下载失败，再使用上面的代理环境变量重试。

根协作规则文件当前同时存在：

```text
AGENTS.md
agents.md
```

如果本任务只更新 `apps/anieditorv5viewer`、任务文件、README 和内置资源，通常不需要同步更新协作规则。如果执行中新增或改变仓库协作规则、目录规范、基础脚本或通用执行约定，必须同时更新 `AGENTS.md` 和 `agents.md`，并在任务报告中说明原因。

## 3. 当前输入状态

执行前必须重新确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
git diff -- docs/anieditor5/src/animation_presets.ts docs/anieditor5/src/constants.ts docs/anieditor5/src/main.ts docs/anieditor5/src/pixi_stage.ts docs/anieditor5/src/types.ts docs/anieditor5/src/workspace_storage.ts
```

当前已观察到的输入状态：

```text
M docs/anieditor5/src/animation_presets.ts
M docs/anieditor5/src/constants.ts
M docs/anieditor5/src/main.ts
M docs/anieditor5/src/pixi_stage.ts
M docs/anieditor5/src/types.ts
M docs/anieditor5/src/workspace_storage.ts
?? docs/anieditor5/export/10x.json
?? docs/anieditor5/export/2x.json
?? docs/anieditor5/export/5x.json
?? docs/anieditor5/export/multipay.json
?? docs/anieditor5/export/respin.json
?? docs/anieditor5/export/scatter1.json
?? docs/anieditor5/export/scatter2.json
?? docs/anieditor5/export/assets/*
```

已观察到的关键源码变化：

- `docs/anieditor5/src/constants.ts` 当前 `VNI_VERSION = "VNI_0.010"`。
- `docs/anieditor5/src/types.ts` 新增合法动画类型：
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- `docs/anieditor5/src/animation_presets.ts` 新增对应 preset、默认参数和采样逻辑。
- `docs/anieditor5/src/pixi_stage.ts` 新增编辑器预览侧的 `drawParticleWall`、`drawParticleCombo`，并让 `particle_combo` 可在 `sourceOpacity = 0` 时隐藏原图层但继续显示粒子。
- `docs/anieditor5/src/workspace_storage.ts` 的 IndexedDB 超时/跳过已存在资源变化不是 viewer 播放核心，不要误搬进 viewer。
- `docs/anieditor5/src/pixi_stage.ts` 的 `getParticleParam` 兼容数字字符串是编辑器 UI 预览侧容错；viewer 校验层仍应坚持导出 JSON numeric param 必须是 number，不要照搬这个字符串兜底。

执行时用下面命令重新生成导出摘要，并把结果写入任务报告：

```bash
node -e 'const fs=require("fs"); const path=require("path"); const dir="docs/anieditor5/export"; const files=fs.readdirSync(dir).filter(f=>f.endsWith(".json")).sort(); const allAssets=new Set(); for (const f of files){ const j=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8")); const typeCounts={}; const paramKeys={}; for (const l of j.layers||[]){ for (const a of l.animations||[]){ typeCounts[a.type]=(typeCounts[a.type]||0)+1; paramKeys[a.type]=Array.from(new Set([...(paramKeys[a.type]||[]), ...Object.keys(a.params||{})])).sort(); } } for (const a of j.assets||[]) allAssets.add(a.path); console.log(JSON.stringify({file:f,name:j.name,schemaVersion:j.schemaVersion,editor:j.editor,layers:(j.layers||[]).length,assets:(j.assets||[]).length,particles:(j.particles||[]).length,animationTypes:typeCounts,paramKeys},null,2)); } console.log("uniqueAssets", allAssets.size);'
```

当前已观察到的导出事实：

| JSON | name | schema/editor | 重点动画 |
| --- | --- | --- | --- |
| `project.json` | `胜利测试` | `V5G_0.0014` / `victory_editor_v5_g` | `scale_up`, `fade`, `rotate`, `move`, `scale_down` |
| `bigwin.json` | `bigwin` | `V5G_0.0043` / `victory_editor_v5_g` | `particles`, `particle_twinkle`, `pulse`, `shake`, `slide_in` |
| `megawin.json` | `megawin` | `V5G_0.0014` / `victory_editor_v5_g` | `particles`, `particle_twinkle`, `move`, `shake`, `pulse` |
| `superwin.json` | `superwin` | `V5G_0.0051` / `victory_editor_v5_g` | `particles`, `particle_twinkle`, `scale_up`, `move` |
| `2x.json` | `2x` | `VNI_0.003` / `VNI` | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `5x.json` | `5x` | `VNI_0.003` / `VNI` | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `10x.json` | `10x` | `VNI_0.003` / `VNI` | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `respin.json` | `respin` | `VNI_0.003` / `VNI` | `pop`, `blink`, `scale_out`, `particle_twinkle` |
| `scatter1.json` | `SCATTER1` | `VNI_0.010` / `VNI` | `squash_stretch`, `particles`, `pop`, `blink`, `scale_out` |
| `scatter2.json` | `SCATTER2` | `VNI_0.010` / `VNI` | `squash_stretch`, `particles`, `pop`, `blink`, `scale_out` |
| `multipay.json` | `MultiPay` | `VNI_0.010` / `VNI` | `particle_wall`, `particle_combo`, `blink`, `scale_up` |

当前 `docs/anieditor5/export/*.json` 合计引用约 60 个唯一 `asset.path`。执行时必须以实际命令输出为准；如果数量变化，在任务报告中记录最新值。

## 4. 必须保持的运行时契约

### 4.1 schema/editor 契约

viewer 必须继续接受：

- `schemaVersion` 为 `V5G_0.x`
- `schemaVersion` 为 `VNI_0.x`
- `editor.name` 为 `victory_editor_v5_g`
- `editor.name` 为 `VNI`

不要把校验硬编码成只接受当前最新 `VNI_0.010`。如果未来出现非 `V5G_0.x` / `VNI_0.x` schema，必须显式失败。

### 4.2 export2 缩放资源契约

必须保留任务 33 已有能力：

- `docs/anieditor5/export2/manifest.json` 是 bundle 入口。
- `edit_full` 是 100% 原图 profile。
- `runtime_50` 是运行发布 profile，文件像素约 50%，但逻辑尺寸仍按 JSON 的 `asset.width` / `asset.height` 显示。
- `asset.fileWidth` / `asset.fileHeight` / `asset.fileScale` 必须全部存在或全部不存在。
- 若三者全部不存在，按原图资源处理。
- 若三者全部存在，真实贴图尺寸必须等于 `fileWidth` / `fileHeight`。
- 不要用 `width * fileScale` 的浮点结果直接判定文件尺寸；以 `fileWidth` / `fileHeight` 为准。
- `manifest` entry 与 project `exportProfile` 的 `id`、`purpose`、`assetScale` 必须一致。
- profile-scoped asset manifest 不能退回到全局 `asset.path -> url`，否则 `edit_full` 与 `runtime_50` 同名资源会互相污染。

### 4.3 粒子契约

新版粒子仍是 layer animation，不是顶层 `project.particles`。当前所有导出 JSON 的顶层 `particles` 数组为空。

必须支持：

- `particles`：旧粒子爆发。
- `particle_twinkle`：旧随机闪烁粒子。
- `particle_wall`：持续粒子幕墙，使用当前图层图片作为粒子纹理。
- `particle_combo`：三段组合粒子，使用当前图层图片作为粒子纹理。

`particle_combo` 的特殊点必须单独处理：

- `sourceOpacity` 控制原图层自身透明度。
- 当 `sourceOpacity = 0` 时，原图层应隐藏，但粒子仍要显示。
- 现有 viewer 不能把粒子激活逻辑简单绑定到 `sampled.opacity > 0`，否则 `multipay.json` 会无法显示 `particle_combo` 粒子。
- `particle_combo` 粒子 alpha 应参考 layer 原始可见性/基础透明度和动画参数，而不是被 `sourceOpacity` 或普通图层显示透明度误杀。
- active particle 不应自动让原图层消失；原图层是否显示应由普通动画采样结果决定，只有 `particle_combo sourceOpacity` 这类明确动画语义可以改变原图层透明度。
- 粒子层级应匹配编辑器预览：每个 image layer 的粒子应处在该图层之后、后续图层之前，不能简单把所有粒子放到一个永远盖在全部内容之上的全局顶层。

粒子时间边界必须保持清楚：

- 普通 layer animation 在 `time >= start + duration` 时可采样为 `progress = 1`，让结束状态稳定。
- 粒子 animation 在 `time < start` 或 `time >= start + duration` 时应返回无粒子。
- 粒子 animation 在 `progress <= 0` 时应返回无粒子，避免 0 秒首帧漏出。

### 4.4 fail-fast 契约

不允许：

- 忽略未知 animation type。
- 忽略未知 easing。
- 忽略未知 blend mode。
- 缺少资源时渲染占位图。
- 缺少必须 numeric param 时使用默认值继续播放。
- 把导出 JSON 里的 numeric param 字符串当数字解析后继续播放。
- 贴图尺寸不匹配时继续播放。
- 为了测试通过在生产逻辑里写奇怪分支。
- 用宽泛兜底掩盖导出 JSON 或 runtime 的真实 bug。

允许：

- 对已经定义为可选的 boolean 参数使用导出契约默认值，例如 `fadeOut` 缺省可视为 `true`。
- 对粒子数量、速度、尺寸等已存在的 numeric param 做范围 clamp，防止极端值炸掉浏览器；但 param 缺失仍要显式失败。

如果测试导致一些奇怪写法，修改测试，不要改不该改的生产逻辑。

## 5. 实施范围

本任务要做：

- 同步 `apps/anieditorv5viewer/src/assets` 内置 JSON 和图片资源。
- 更新 `apps/anieditorv5viewer/src/config/bundled-projects.ts` 的项目列表。
- 更新 `apps/anieditorv5viewer/src/v5g/types.ts` 的动画类型。
- 更新 `apps/anieditorv5viewer/src/runtime/validation.ts` 的合法动画和必须参数校验。
- 更新 `apps/anieditorv5viewer/src/runtime/animation-sampler.ts` 的 `squash_stretch` 和 `particle_combo` source opacity 采样。
- 更新 `apps/anieditorv5viewer/src/runtime/project-sampler.ts`，拆开原图层显示和粒子显示。
- 更新 `apps/anieditorv5viewer/src/runtime/particle-sampler.ts`，新增 `particle_wall` / `particle_combo` 确定性采样。
- 确认 `apps/anieditorv5viewer/src/runtime/v5g-player.ts` 能用同一套粒子 sprite 输出渲染新粒子。
- 更新 `apps/anieditorv5viewer/tests/runtime/*.test.ts`。
- 更新 `apps/anieditorv5viewer/README.md`。
- 写中文任务报告。

本任务不要做：

- 不要修改 `docs/anieditor5/src/**`，除非发现明确编辑器导出 bug 直接阻塞 viewer 验收；如果修改，必须在报告中说明原因、影响和验证。
- 不要新增 Cocos Creator app。
- 不要把 viewer runtime 抽成 `packages/anieditorv5runtime-cc` 的共享依赖。
- 不要改变 `packages/gameframeworks`、`packages/rendercore` 等无关包。
- 不要回滚用户已有的 `docs/anieditor5/src` 和 `docs/anieditor5/export` 改动。

## 6. 具体执行步骤

### 6.1 预检

在仓库根目录执行：

```bash
pwd
node --version
pnpm --version
git status --short
git diff --stat
```

确认当前目录为：

```text
/Users/zerro/github.com/slotclientengine
```

如果 `node_modules` 缺失或依赖不完整，先执行：

```bash
pnpm install
```

若下载失败，先设置代理再重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

### 6.2 源码差异审计

必须阅读并对照以下文件，不要只看导出 JSON：

```text
docs/anieditor5/src/types.ts
docs/anieditor5/src/animation_presets.ts
docs/anieditor5/src/pixi_stage.ts
docs/anieditor5/src/constants.ts
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
```

需要从编辑器源码确认并移植的语义：

- `particle_wall` 参数、clamp 范围、位置/速度/生命周期/缩放/淡出计算。
- `particle_combo` 参数、轨迹模式、拖尾、消失模式、`sourceOpacity` 原图层透明度控制。
- `squash_stretch` 位移和挤压/拉伸采样。
- `particle_combo` 的 `targetY` 在 Pixi 坐标里的方向处理，编辑器当前逻辑为 `targetOffsetY = -targetY`。
- `particle_combo` 的轨迹点采样函数 `sampleParticleComboPoint`、`quadraticPoint`、`easeOutQuad`、`easeInOutQuad`、`lerpNumber`。
- `particle_wall` 当前使用 `seededRandom(animation.seed, index, 101..105)`；`particle_combo` 当前使用 `seededRandom(animation.seed, index, 301..305)`。移植时保持 salt 不变，确保确定性输出可对齐。
- `particle_combo` 默认 easing 为 `easeInOutQuad`。
- `particle_wall` 默认 easing 为 `linear`。
- `squash_stretch` 默认 easing 为 `easeOutQuad`。

viewer 可以参考并移植必要逻辑，但不要从 `docs/anieditor5/src/**` 直接 runtime import。viewer 必须继续独立构建和测试。

### 6.3 资源同步

保留现有资源结构，并新增新的单文件项目 JSON：

```text
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/projects/bigwin.json
apps/anieditorv5viewer/src/assets/projects/megawin.json
apps/anieditorv5viewer/src/assets/projects/superwin.json
apps/anieditorv5viewer/src/assets/projects/2x.json
apps/anieditorv5viewer/src/assets/projects/5x.json
apps/anieditorv5viewer/src/assets/projects/10x.json
apps/anieditorv5viewer/src/assets/projects/respin.json
apps/anieditorv5viewer/src/assets/projects/scatter1.json
apps/anieditorv5viewer/src/assets/projects/scatter2.json
apps/anieditorv5viewer/src/assets/projects/multipay.json
apps/anieditorv5viewer/src/assets/assets/*
apps/anieditorv5viewer/src/assets/export2/manifest.json
apps/anieditorv5viewer/src/assets/export2/edit_full/project.json
apps/anieditorv5viewer/src/assets/export2/edit_full/assets/*
apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json
apps/anieditorv5viewer/src/assets/export2/runtime_50/assets/*
```

推荐同步命令：

```bash
mkdir -p apps/anieditorv5viewer/src/assets/projects
cp docs/anieditor5/export/project.json apps/anieditorv5viewer/src/assets/project.json
cp docs/anieditor5/export/bigwin.json apps/anieditorv5viewer/src/assets/projects/bigwin.json
cp docs/anieditor5/export/megawin.json apps/anieditorv5viewer/src/assets/projects/megawin.json
cp docs/anieditor5/export/superwin.json apps/anieditorv5viewer/src/assets/projects/superwin.json
cp docs/anieditor5/export/2x.json apps/anieditorv5viewer/src/assets/projects/2x.json
cp docs/anieditor5/export/5x.json apps/anieditorv5viewer/src/assets/projects/5x.json
cp docs/anieditor5/export/10x.json apps/anieditorv5viewer/src/assets/projects/10x.json
cp docs/anieditor5/export/respin.json apps/anieditorv5viewer/src/assets/projects/respin.json
cp docs/anieditor5/export/scatter1.json apps/anieditorv5viewer/src/assets/projects/scatter1.json
cp docs/anieditor5/export/scatter2.json apps/anieditorv5viewer/src/assets/projects/scatter2.json
cp docs/anieditor5/export/multipay.json apps/anieditorv5viewer/src/assets/projects/multipay.json
rsync -a --delete --exclude '.DS_Store' docs/anieditor5/export/assets/ apps/anieditorv5viewer/src/assets/assets/
rsync -a --delete --exclude '.DS_Store' docs/anieditor5/export2/ apps/anieditorv5viewer/src/assets/export2/
```

资源同步后执行：

```bash
find apps/anieditorv5viewer/src/assets -name '.DS_Store' -print
find apps/anieditorv5viewer/src/assets -maxdepth 4 -type f | sort
```

`find ... -name '.DS_Store' -print` 应无输出。不要把 `.DS_Store` 复制进 viewer 资源。

确认 `apps/anieditorv5viewer/.prettierignore` 仍包含：

```text
src/assets
```

避免复制来的 JSON/PNG 被 app-local `format:check` 当成手写源码格式化。

### 6.4 资源完整性审计

同步后必须执行资源引用审计：

```bash
node -e 'const fs=require("fs"); const path=require("path"); const files=["apps/anieditorv5viewer/src/assets/project.json",...fs.readdirSync("apps/anieditorv5viewer/src/assets/projects").filter(f=>f.endsWith(".json")).map(f=>"apps/anieditorv5viewer/src/assets/projects/"+f),"apps/anieditorv5viewer/src/assets/export2/edit_full/project.json","apps/anieditorv5viewer/src/assets/export2/runtime_50/project.json"]; const missing=[]; const refs=new Set(); for (const file of files){ const json=JSON.parse(fs.readFileSync(file,"utf8")); for (const asset of json.assets||[]){ refs.add(asset.path); const root=file.includes("/export2/edit_full/")?"apps/anieditorv5viewer/src/assets/export2/edit_full":file.includes("/export2/runtime_50/")?"apps/anieditorv5viewer/src/assets/export2/runtime_50":"apps/anieditorv5viewer/src/assets"; const target=path.join(root,asset.path); if (!fs.existsSync(target)) missing.push(file+" -> "+asset.path); } } if (missing.length) throw new Error("missing assets:\n"+missing.join("\n")); console.log("all referenced assets exist", refs.size);'
```

如果审计失败，优先修资源同步或路径配置，不要在 runtime 里写路径猜测兜底。

### 6.5 多项目配置和 UI

更新：

```text
apps/anieditorv5viewer/src/config/bundled-projects.ts
```

新增导入：

```ts
import twoXData from "../assets/projects/2x.json";
import fiveXData from "../assets/projects/5x.json";
import tenXData from "../assets/projects/10x.json";
import respinData from "../assets/projects/respin.json";
import scatter1Data from "../assets/projects/scatter1.json";
import scatter2Data from "../assets/projects/scatter2.json";
import multipayData from "../assets/projects/multipay.json";
```

更新 `BundledProjectId`，至少包含：

```text
project
bigwin
megawin
superwin
2x
5x
10x
respin
scatter1
scatter2
multipay
bigwin-edit-full
bigwin-runtime-50
```

更新 `bundledProjectDefinitions`：

- 旧 `docs/anieditor5/export/*.json` 和新 `2x/5x/10x/respin/scatter1/scatter2/multipay` 都使用：
  - `bundleId: "legacy"` 或更名为 `"single-export"` 均可，但必须在 UI/诊断中清楚。
  - `profileId: "legacy_full"` 或 `"single_full"`。
  - `purpose: "legacy"`。
  - `assetScale: 1`。
  - `assetUrlManifest: bundledAssetUrlManifest`。
- `export2` 两个 profile 继续使用 profile-scoped manifest：
  - `export2EditFullAssetUrlManifest`
  - `export2Runtime50AssetUrlManifest`

如果重命名 `bundleId` / `profileId`，必须同步更新测试和 README，并在报告中说明。

确认 UI selector 能显示所有项目，`apps/anieditorv5viewer/src/ui/controls.ts` 的 summary 至少能看出：

- source path
- schemaVersion
- profile
- purpose
- assetScale
- layer count
- asset count
- animation type summary

### 6.6 类型和校验

更新：

```text
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/validation.ts
```

`V5GAnimationType` 和 `SUPPORTED_ANIMATION_TYPES` 必须新增：

```text
particle_wall
particle_combo
squash_stretch
```

`PARTICLE_ANIMATION_TYPES` 必须包含：

```text
particles
particle_twinkle
particle_wall
particle_combo
```

`DEFAULT_EASING_BY_TYPE` 必须新增：

```text
particle_wall -> linear
particle_combo -> easeInOutQuad
squash_stretch -> easeOutQuad
```

`REQUIRED_NUMERIC_PARAMS` 必须新增：

```text
particle_wall:
  emitterWidth
  direction
  spreadAngle
  speed
  lifetimeMin
  lifetimeMax
  spawnRate
  size
  gravity
  startScaleMin
  startScaleMax
  endScaleMin
  endScaleMax

particle_combo:
  count
  size
  sourceOpacity
  spawnMode
  spawnRadius
  spawnRatio
  targetX
  targetY
  travelMode
  curve
  orbitRadius
  orbitTurns
  orbitSpeed
  orbitRatio
  staggerRatio
  trailCount
  trailSpacing
  trailFade
  vanishMode
  vanishRatio
  flashScale
  flashIntensity

squash_stretch:
  squashAngle
  squashAmount
  decayOscillateCount
  fromX
  fromY
  toX
  toY
```

`OPTIONAL_BOOLEAN_PARAMS` 必须新增：

```text
particle_wall:
  fadeOut
```

校验层必须继续显式拒绝：

- top-level `project.particles` 非空。
- group layer。
- non-null `parentId`。
- non-empty keyframes。
- unsupported schema/editor。
- partial file metadata。
- profile mismatch。

### 6.7 普通动画采样

更新：

```text
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
```

新增 `sampleSquashStretch`，语义从 `docs/anieditor5/src/animation_presets.ts` 移植：

- `fromX/fromY -> toX/toY` 按 eased progress 插值并叠加到 transform。
- `squashAngle` 表示挤压方向角度。
- `squashAmount <= 0.001` 时只做位移。
- `decayOscillateCount <= 0` 时使用单次 overshoot。
- `decayOscillateCount > 0` 时使用指数衰减振荡。
- `squashFactor` clamp 到 `[0.11, 3]`。
- 按 force axis 做 squash/stretch，最终乘到 `scaleX/scaleY`。

新增 `particle_combo` 对源图层的采样：

- 在 `sampleLayerAnimationsAtTime` 中，`particle_combo` 不应只是 no-op。
- 它应把 `result.opacity` 设置为 `base.opacity * sourceOpacity`。
- `sourceOpacity` 必须是校验过的 numeric param。
- 这个 opacity 只控制原图层自身，不代表粒子是否显示。

`particle_wall`、`particles`、`particle_twinkle` 不改变普通 transform/opacity，继续由 particle sampler 绘制。

### 6.8 粒子采样和渲染

更新：

```text
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
```

目标：

- 粒子采样保持纯函数和确定性，便于 Vitest 覆盖。
- `v5g-player.ts` 只负责把 `ParticleSpriteSample` 变成 Pixi Sprite，不把粒子数学散落在渲染类里。
- 每次 `seek()` 先清理旧粒子，再绘制当前时间的粒子，避免残留。
- 保留 `progress <= 0` 抑制，确保 0 秒首帧不漏出粒子。
- 粒子绘制要保留 layer 顺序。推荐从单个全局 `particleRoot` 调整为 per-layer particle container：创建 image layer display 后紧跟一个同层级 particle container，这样该图层粒子位于自身图层之后、后续图层之前。若采用其他实现，必须用测试或浏览器截图证明层级与编辑器预览一致。
- `V5GPlayer.updateDiagnostics()` 应新增粒子诊断字段，例如 `data-v5g-particle-sprites`，记录当前帧粒子 sprite 数量；项目切换和 destroy 时必须清理该 dataset。

`project-sampler.ts` 必须拆开这些概念：

- 原图层是否可见。
- 原图层是否应该渲染。
- 粒子是否处于活动时间段。
- 粒子渲染需要的 opacity。
- layer 原始/base opacity 与普通动画采样后的 image opacity。

现有逻辑类似：

```text
hasActiveParticleAnimation = opacity > 0 && hasActiveParticleAnimation(layer, time)
```

这对 `particle_combo` 不够。必须改成能覆盖：

- `particle_combo sourceOpacity = 0` 时：
  - 原图层 `renderImageDisplay = false`
  - `hasActiveParticleAnimation = true`
  - `sampleParticleSpritesForLayer(...)` 在动画中段能返回粒子
- `particle_combo sourceOpacity > 0` 时：
  - 原图层按 `base.opacity * sourceOpacity` 显示
  - 粒子继续按 base opacity 与粒子动画自身 alpha 显示
- 非 combo 粒子在 layer 自身不可见或有效 opacity 为 0 时仍不应乱显示。

可以采用以下方案之一：

- 在 `SampledLayerState` 增加 `baseOpacity` / `imageOpacity` / `particleOpacity` / `renderParticleDisplay` 之类字段。
- 或在 `particle-sampler.ts` 中根据 `layer` 和 `animation.type` 识别 `particle_combo`，不要只依赖 `sampledLayer.opacity`。

无论采用哪种方案，测试必须覆盖 `sourceOpacity = 0` 但粒子显示的场景。

`particle-sampler.ts` 新增：

- `sampleParticleWall`
- `sampleParticleCombo`
- 必要的辅助函数，例如 `sampleParticleComboPoint`

移植 `particle_wall` 时保持编辑器语义：

- `emitterWidth` 沿发射方向垂线展开。
- `direction` 为角度，`0=右`、`90=下`、`180=左`、`270=上`。
- `spreadAngle` 在方向两侧随机偏移。
- 每颗粒子有独立 `lifetimeMin/lifetimeMax`。
- `spawnRate` 决定总生成数量。
- `totalSpawnCount = Math.floor(elapsed * spawnRate)`，`elapsed = progress * duration`。
- `gravity` 影响 y 位移。
- `startScaleMin/Max` 到 `endScaleMin/Max` 按 local age 插值。
- `fadeOut` 默认为 true。

移植 `particle_combo` 时保持编辑器语义：

- `spawnMode`：`0=范围随机`，`1=中心发散`。
- `travelMode`：`0=直线`，`1=曲线`，`2=绕圈后飞`。
- `vanishMode`：`0=淡出`，`1=亮一下`，`2=放大淡出`。
- `targetX/targetY` 是相对发射点的目标偏移，Pixi y 方向按编辑器逻辑处理为 `targetOffsetY = -targetY`。
- `trailCount/trailSpacing/trailFade` 生成拖尾。
- `staggerRatio` 控制粒子错峰。
- `sourceOpacity` 不参与粒子 sprite alpha，只控制原图层自身。
- `travelStart = spawnRatio`。
- `vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio)`。
- `travelMode = 1` 时使用二次贝塞尔 `quadraticPoint`，控制点在起终点中点沿垂线偏移 `curve`。
- `travelMode = 2` 时先按 `orbitRatio / orbitSpeed` 进行绕圈，再从绕圈终点飞向目标。
- `vanishMode = 1` 是闪亮消失，`vanishMode = 2` 是放大淡出，否则普通淡出。

### 6.9 README 更新

更新：

```text
apps/anieditorv5viewer/README.md
```

README 必须包含：

- 新增 bundled projects 列表。
- 新增支持的 animation types：
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- `particle_combo sourceOpacity` 的特殊语义。
- fail-fast unsupported 列表。
- 验证命令。

不要在 README 里写和代码不一致的兜底承诺。

## 7. 测试要求

更新或新增测试：

```text
apps/anieditorv5viewer/tests/runtime/validation.test.ts
apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
```

必须覆盖：

- 所有 bundled project 都能 `assertV5GProject` + `validateV5GProject`。
- `multipay.json` 能通过校验，且包含 `particle_wall` / `particle_combo`。
- `scatter1.json` / `scatter2.json` 能通过校验，且包含 `squash_stretch`。
- 缺失 `particle_wall` 必须 numeric param 时显式失败。
- 缺失 `particle_combo` 必须 numeric param 时显式失败。
- 缺失 `squash_stretch` 必须 numeric param 时显式失败。
- `particle_wall` 在相同 seed/time/texture size 下输出稳定。
- `particle_combo` 在相同 seed/time/texture size 下输出稳定。
- `particle_combo sourceOpacity=0` 时原图层隐藏但粒子仍输出。
- `particle_combo sourceOpacity>0` 时原图层按 source opacity 显示，粒子仍输出。
- `particle_wall` / `particle_combo` 在 50% texture size 下仍按目标粒子大小显示，不能因为贴图文件缩小导致视觉尺寸缩小一半。
- per-layer particle container 或等价实现能保持粒子层级顺序，不能让早期图层粒子无条件覆盖所有后续图层。
- `V5GPlayer` 当前帧粒子数量诊断可更新和清理，例如 `data-v5g-particle-sprites`。
- `progress <= 0` 时粒子输出为空。
- `time >= animation.end` 时粒子输出为空或符合既有边界契约。
- 普通非粒子动画在 `time >= animation.end` 时仍能保留结束态，例如 fade end、scale end。
- 缩小资源 `runtime_50` 继续按真实 `fileWidth/fileHeight` 校验。
- 资源 manifest 缺失时仍显式失败。

如果测试因为旧假设不再符合真实导出语义而失败，修改测试；不要为了旧测试在生产逻辑里加奇怪分支。

## 8. 验收命令

在仓库根目录执行：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

如果执行 `pnpm --filter anieditorv5viewer test` 产生 coverage 文件，这是正常测试产物；不要把 coverage 当成本任务源代码改动。

如需确认根级任务没有被破坏，可补充执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

如果根级命令因无关包失败，必须在报告中写明失败包、失败原因、与本任务是否相关。

## 9. 浏览器验收

启动 viewer：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

如果 5175 被占用，换用 5176 或更高端口，并在报告中记录实际端口。

浏览器验收必须覆盖项目 selector 中的全部项目：

```text
project
bigwin
megawin
superwin
2x
5x
10x
respin
scatter1
scatter2
multipay
bigwin-edit-full
bigwin-runtime-50
```

每个项目至少检查：

- canvas 能创建，页面没有 fatal error。
- selector 切换后旧 player 被销毁，旧 canvas/dataset 不残留。
- `data-v5g-project-id` 与当前项目一致。
- `data-vni-bundle-id`、`data-vni-profile-id`、`data-vni-asset-scale` 与当前配置一致。
- 粒子项目在动画中段的 `data-v5g-particle-sprites` 大于 0；非粒子时应为 0 或不存在但不能残留旧项目数值。
- 播放、暂停、Restart、Loop、timeline seek 正常。
- 动画中段 `data-v5g-non-background-samples` 或视觉画面证明不是空白。
- `bigwin-runtime-50` 与 `bigwin-edit-full` 构图尺寸一致，不能因为 50% 图片变小。
- `multipay` 在 `particle_wall` / `particle_combo` 活动时间段能看到粒子。
- `multipay` 的 `particle_combo` 需要在接近 0 秒后的中段验收，例如 `0.5s`；0 秒首帧应为空，不能误判为没实现。
- `scatter1` / `scatter2` 能看到 `squash_stretch` 相关的弹性变化。
- 0 秒首帧不应出现由 `progress <= 0` 粒子泄漏导致的可见粒子。

建议记录至少这些浏览器证据到任务报告：

- `multipay` 中段截图或文字描述。
- `scatter1` 或 `scatter2` 中段截图或文字描述。
- `bigwin-edit-full` 与 `bigwin-runtime-50` 的 dataset 对比。
- 如果使用 Playwright，记录关键断言和截图路径。

## 10. 任务报告要求

完成后新增：

```text
tasks/38-anieditorv5viewer-particle-effects-[utctime].md
```

报告必须使用中文，至少包含：

- 任务目标回顾。
- 实际修改文件清单。
- 资源同步结果：
  - 新增/更新的 JSON。
  - `docs/anieditor5/export/assets` 同步到 viewer 的结果。
  - `export2` 是否重新同步。
  - 是否发现 `.DS_Store`。
- 新增 animation type 支持说明：
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- fail-fast 行为说明：
  - 缺失资源。
  - 缺失必须参数。
  - unknown type/easing/blend mode。
  - 贴图尺寸不匹配。
- 测试命令和结果。
- 浏览器验收过程和结果。
- 是否更新 `AGENTS.md` / `agents.md`；如果未更新，说明原因是未改变仓库协作规则。
- 是否新增依赖、`pnpm-lock.yaml` 是否变化。
- 遗留问题或明确无遗留。

报告文件名必须用 UTC 时间，不要用本地时间。

## 11. 二次遗漏检查

交付前必须做一遍二次检查：

```bash
git status --short
git diff --stat
find apps/anieditorv5viewer/src/assets -name '.DS_Store' -print
find tasks -maxdepth 1 -type f -name '38-anieditorv5viewer-particle-effects*.md' | sort
```

检查清单：

- `tasks/38-anieditorv5viewer-particle-effects.md` 本计划存在。
- `tasks/38-anieditorv5viewer-particle-effects-[utctime].md` 报告存在。
- 新增 JSON 全部进入 viewer 资源目录。
- 新增图片资源没有漏、没有 stale 旧图造成路径误判。
- `apps/anieditorv5viewer/src/config/bundled-projects.ts` 的 import 和 `BundledProjectId` 一致。
- `apps/anieditorv5viewer/src/runtime/asset-manifest.ts` 没有破坏 export2 profile-scoped manifest。
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts` 不再用 `sampled.opacity > 0` 误杀 `particle_combo` 粒子。
- `apps/anieditorv5viewer/src/runtime/project-sampler.ts` 不再用 active particle 这个事实自动隐藏所有原图层；原图层显示必须来自普通采样结果和 `sourceOpacity` 语义。
- `apps/anieditorv5viewer/src/runtime/particle-sampler.ts` 的新粒子输出确定性测试已覆盖。
- `apps/anieditorv5viewer/src/runtime/v5g-player.ts` 的粒子绘制层级、粒子数量诊断和 destroy 清理已覆盖。
- `apps/anieditorv5viewer/src/runtime/validation.ts` 没有为缺失 numeric param 增加默认兜底。
- `apps/anieditorv5viewer/src/runtime/validation.ts` 没有把 numeric string 当数字接受。
- `apps/anieditorv5viewer/README.md` 与代码实际支持范围一致。
- `AGENTS.md` 和 `agents.md` 如有一处更新，另一处也同步更新。
- 没有无关文件被顺手重构或格式化。

只有完成上述检查，并在任务报告中记录结果，才算本任务完成。
