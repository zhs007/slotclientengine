# game003 spine symbol refresh 任务计划

## 1. 任务目标

本任务优化 `game003-s1` 的 symbol 资源接入：美术已更新 `assets/game003-s1` 下的 Spine 资源，本任务只处理“以前已经属于 game003-s1 可展示 symbol，且这次已有 Spine 资源更新”的部分；新出现但还不属于当前主转轮可展示集合的资源先不接入。

核心目标：

- 把当前主转轮旧 symbol 中已经切成 Spine 的资源全部接入：当前盘点应覆盖 `WL,H1,H2,H3,H4,H5,CL,SC`。
- 保留当前主转轮可展示集合边界：`WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC`。本任务不把新增资源 `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 加入主转轮、不改 gameconfig、不改 live 协议。
- `normal` / `appear` / `win` 都遵循同一个 Spine 状态原则：如果某个 symbol 是 Spine symbol，且 skeleton 里没有某个状态对应的动画，就说明没有这个状态；运行时默认退回这个 symbol 的 `normal`，不能退回通用 `builtin` appear/win 动画。
- 对已经声明的 Spine 动画继续 fail-fast：manifest 写了某个 `animationName`，skeleton 里必须真实存在且大小写完全一致；缺 skeleton、缺 atlas、缺 texture、atlas page 不匹配、glob 为空、生成物不同步都必须显式失败。
- 同步更新 `assets/game003-s1/symbol-state-textures.manifest.json`、`apps/game003` YAML/loading/generated config、`apps/symbolsviewer`、`packages/rendercore` 通用 symbol resolver、测试、README 和必要的 `agents.md` 规则。

本计划必须能独立落地，不依赖任何聊天上下文。执行者只需要阅读本文件，即可完成实现、测试、验收、协作规则判断和最终任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/82-game003-spine-symbol-refresh-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/82-game003-spine-symbol-refresh-260704-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/minecart2
```

基础工具链：

- Node.js：`>=24.0.0`
- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 构建编排：`turbo`
- 前端构建：`vite`
- 测试框架：`vitest`
- lint：`eslint`
- format：`prettier`

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short --untracked-files=all
git diff --stat
```

当前已观察到资源改动：

```text
M  assets/game003-s1/WL.json
M  assets/game003-s1/H1.json
M  assets/game003-s1/H2.json
M  assets/game003-s1/H3.json
M  assets/game003-s1/H4.json
M  assets/game003-s1/H5.json
M  assets/game003-s1/Symbol.atlas
M  assets/game003-s1/Symbol.png
?? assets/game003-s1/BN.json
?? assets/game003-s1/CL.json
?? assets/game003-s1/CN.json
?? assets/game003-s1/ES.json
?? assets/game003-s1/MP2.json
?? assets/game003-s1/RS.json
?? assets/game003-s1/Reel_NearWin.json
?? assets/game003-s1/SC.json
?? assets/game003-s1/UP.json
?? assets/game003-s1/UPCN.json
```

这些美术资源是本任务输入，不要为了测试、格式化、减少冲突或临时通过校验去改写 skeleton JSON / atlas / PNG 的内容。需要修改的是接入配置、manifest、运行时通用逻辑、测试和文档。

如果依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

本任务原则上不需要新增第三方依赖。若确实新增或调整依赖，必须执行：

```bash
pnpm install
```

并在任务报告中记录 `pnpm-lock.yaml` 是否变化。依赖安装失败时用上面的代理环境变量重试。

如果 `pnpm --filter ...` 在非 TTY 环境出现 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，先用同一命令加 `CI=true` 重试，例如：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter game003 test
```

如果是测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

本任务要求显式失败，不做不必要的兜底。有些逻辑 bug 越早暴露越好。只有本文明确规定的“Spine symbol 缺失某状态时退回 normal”属于产品合同；它不能吞掉资源缺失、拼写错误、大小写错误、YAML glob 错误或生成物不同步。

`apps/game003/src/generated/game-static.generated.ts` 和 `apps/game003/src/generated/game-loading.generated.ts` 由 `apps/buildgamestatic` 生成，禁止手改；修改 YAML 或 generator 后必须同步执行生成和 `--check` 校验。

## 3. 当前实现事实

执行本计划时必须重新盘点，不要只信任本节快照。

### 3.1 关键文件

game003 资源和静态配置：

```text
assets/game003-s1/symbol-state-textures.manifest.json
assets/game003-s1/WL.json
assets/game003-s1/H1.json
assets/game003-s1/H2.json
assets/game003-s1/H3.json
assets/game003-s1/H4.json
assets/game003-s1/H5.json
assets/game003-s1/CL.json
assets/game003-s1/SC.json
assets/game003-s1/Symbol.atlas
assets/game003-s1/Symbol.png
apps/game003/config/game-static.yaml
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
apps/game003/src/assets.ts
apps/game003/src/skin-config.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/scripts/verify-static-dist.mjs
apps/game003/README.md
```

symbolsviewer：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/src/symbol-assets.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

rendercore symbol 动画：

```text
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/render-symbol.ts
packages/rendercore/src/symbol/state-machine.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/package.json
packages/rendercore/scripts/generate-symbol-state-textures.mjs
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/tests/symbol/state-texture-generator.test.ts
packages/rendercore/tests/symbol/animation-resolver.test.ts
packages/rendercore/README.md
pnpm-lock.yaml
```

buildgamestatic：

```text
apps/buildgamestatic/src/types.ts
apps/buildgamestatic/src/yaml-loader.ts
apps/buildgamestatic/src/generator.ts
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
```

game003 测试：

```text
apps/game003/tests/assets.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
```

协作规则：

```text
agents.md
```

### 3.2 当前资源盘点

执行时先运行：

```bash
node -e 'const fs=require("fs"); const path="assets/game003-s1"; const files=fs.readdirSync(path); const manifest=JSON.parse(fs.readFileSync(`${path}/symbol-state-textures.manifest.json`,"utf8")); const display=Object.keys(manifest.symbols); const jsons=files.filter(f=>f.endsWith(".json")&&!f.endsWith("-wins.json")&&f!=="symbol-state-textures.manifest.json"&&f!=="bg-bar-symbol-state-textures.manifest.json").sort(); console.log("manifest symbols:", display.join(",")); console.log("spine jsons:", jsons.join(",")); console.log("intersection:", jsons.map(f=>f.slice(0,-5)).filter(s=>display.includes(s)).join(",")); console.log("new/out-of-scope:", jsons.map(f=>f.slice(0,-5)).filter(s=>!display.includes(s)).join(",")); for (const f of jsons) { const j=JSON.parse(fs.readFileSync(`${path}/${f}`,"utf8")); const animations=Object.keys(j.animations||{}).sort(); console.log(`${f}: spine=${j.skeleton?.spine||"?"} size=${j.skeleton?.width||"?"}x${j.skeleton?.height||"?"} animations=${animations.join(",")}`); }'
```

当前观察到的结果：

```text
manifest symbols: WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
spine jsons: BN.json,CL.json,CN.json,ES.json,H1.json,H2.json,H3.json,H4.json,H5.json,MP2.json,RS.json,Reel_NearWin.json,SC.json,UP.json,UPCN.json,WL.json
intersection: CL,H1,H2,H3,H4,H5,SC,WL
new/out-of-scope: BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN
BN.json: spine=3.8.99 animations=Collect,Idle,Loop,Start
CL.json: spine=3.8.99 animations=Collect_End,Collect_Loop,Collect_Start,Idle,Loop,Start,Win
CN.json: spine=3.8.99 animations=Collect1,Collect2,End,Feature,Idle,Loop,Start,Win
ES.json: spine=3.8.99 animations=Idle
H1.json: spine=3.8.99 animations=Feature,Feature_Change,Feature_End,Feature_Idle,Idle,Loop,Start,Win
H2.json: spine=3.8.99 animations=Idle,Win
H3.json: spine=3.8.99 animations=Idle,Win
H4.json: spine=3.8.99 animations=Idle,Win
H5.json: spine=3.8.99 animations=Idle,Win
MP2.json: spine=3.8.99 animations=Idle
RS.json: spine=3.8.99 animations=Idle
Reel_NearWin.json: spine=3.8.99 animations=Loop
SC.json: spine=3.8.99 animations=Idle,Loop,Nearwin,Start,Win
UP.json: spine=3.8.99 animations=Idle
UPCN.json: spine=3.8.99 animations=Idle
WL.json: spine=3.8.99 animations=Feature,Feature_Change,Feature_End,Feature_Idle,Idle,Loop,Win,start
```

本任务范围由 `intersection` 决定。若执行时美术又加入新旧交集，必须在报告中写明重新盘点后的范围；若新增资源仍不在 manifest symbols 中，继续列为暂不处理。

### 3.3 当前 manifest 和 runtime 状态

当前 `assets/game003-s1/symbol-state-textures.manifest.json` 已支持：

- `WL,H1,H2,H3,H4,H5.normal`：Spine `Idle`。
- `WL.appear`：Spine `start`。
- `H1.appear`：Spine `Start`。
- `WL,H1,H2,H3,H4,H5.win`：Spine `Win`。
- `H2,H3,H4,H5.appear`：当前是 `kind: "static"`，需要按本任务原则调整为“无 `Start/start` 时默认退回 normal”，不要再维护这种伪状态。
- `CL,SC`：当前还是通用 `builtin` appear/win，需要改为 manifest 驱动的 Spine 状态。
- `CO`：当前没有 Spine JSON，保持当前合同。
- `L1-L5.win`：继续使用 VNI `*-wins.json`，不在本任务改成 Spine。

当前 `packages/rendercore/src/symbol/vni-animation.ts` 的 `createSymbolManifestAnimationResolver(...)` 会按顺序尝试：

1. requested state texture，例如 `spinBlur` / `disabled`。
2. Spine resource。
3. VNI resource。
4. manifest `builtin` / `static`。
5. fallback resolver。

这意味着“Spine symbol 缺状态退回 normal”不能只删掉 `appear`/`win` manifest 条目，否则 once 状态可能落到默认 resolver 并失败，或者被误改回通用 builtin 动画。需要在 rendercore 增加明确、受限、可测试的通用语义。

当前新资源还有一个硬前置风险：`WL/H1-H5/CL/SC` 的 skeleton 版本是 `spine=3.8.99`，而当前 `packages/rendercore` 使用 `@esotericsoftware/spine-pixi-v8@4.3.9`。二次审计时运行：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
```

当前失败信息包含：

```text
Symbol "WL" normal Spine skeleton failed to parse: Invalid timeline type for a slot: undefined (undefined).
Symbol "H1" normal Spine skeleton failed to parse: Invalid timeline type for a slot: undefined (undefined).
```

这说明本任务不能只改 manifest/YAML。必须先解决 Spine 3.8.99 skeleton 解析/播放兼容性，或明确阻塞并要求资源重新导出为当前 runtime 支持的版本。不能把解析失败当成测试问题，也不能用 builtin/static/default fallback 遮掉。

## 4. 边界和非目标

- 不把 `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 接入 `game003` 主转轮、不加入 display symbols、不加入 gameconfig、不加入 loading 主转轮 symbol 组；这些新增资源只在报告里登记为暂不处理。
- 不改变 `game003` 固定 live server、`gamecode=EfedJuHEaydXNghnmO9KI`、URL query 合同、服务器协议、服务器真实轮带边界或本地公开轮带渲染规则。
- 不改 `bg-bar` 的 `normal|wild|up` 合同，不把 `UP.json` 当作当前 bg-bar 的 `up.png` 替代品。
- 不改矿车互动、中奖金额动画、`bg-wins` 中奖顺序、win amount formatter 或 game003 layout。
- 不在 `apps/game003` 或 `apps/symbolsviewer` 写 `if symbol === "CL"` / `if symbol === "SC"` / `if animationName === "Start"` 这类专属运行时代码。
- 不在共享包硬编码 `game003`、`CL`、`SC`、`WL` 等业务语义；共享包只能实现 manifest 驱动的通用 Spine 状态和 normal fallback 规则。
- 不扩展共享 symbol 生成器去解析 Spine atlas、从 atlas 抽 PNG、支持 JPG normal 运行时或自动猜测动画名。
- 不使用宽泛 `assets/game003-s1/*.json` 作为 Spine skeleton glob，避免混入 VNI project、win-amount project 或暂不处理的新资源。
- 不把 manifest 中声明的资源缺失、动画大小写错误、glob 空匹配、atlas page 错误吞掉；这些都必须显式失败。

## 5. 实现方案

### 5.1 重新盘点资源并锁定范围

1. 运行第 3.2 节的 Node 盘点命令。
2. 确认本任务实际处理集合为当前主转轮 manifest symbols 和 Spine JSON 的交集。
3. 当前预期处理集合：

```text
WL,H1,H2,H3,H4,H5,CL,SC
```

4. 当前预期暂不处理集合：

```text
BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN
```

5. 若 `intersection` 与上述不一致，按新盘点结果执行，但必须遵守：
   - 只处理已经在 `symbol-state-textures.manifest.json` 的主转轮旧 symbol。
   - 新资源不自动变成 game003 symbol。
   - 变更原因和最终集合写入任务报告。

### 5.2 先解决 Spine 3.8.99 兼容性硬门槛

在接入 `CL/SC` 或修改缺状态 fallback 前，必须先让 rendercore 能解析并播放当前范围内的 Spine skeleton：

```text
WL,H1,H2,H3,H4,H5,CL,SC
```

执行步骤：

1. 运行 `CI=true pnpm --filter @slotclientengine/rendercore test`，确认当前是否仍出现 `Invalid timeline type for a slot`。
2. 如果仍失败，先判断是运行时版本不兼容还是资源损坏：
   - 用第 3.2 节盘点命令确认 skeleton `spine` 版本和动画名。
   - 检查 `Symbol.atlas` page 是否仍为 `Symbol.png`。
   - 不要手工改写 skeleton JSON 来迎合 parser。
3. 必须选择一个可验收方案：
   - 资源方案：由美术/资源流程重新导出为当前 `@esotericsoftware/spine-pixi-v8` 可解析的版本，替换输入资源后重新跑测试。
   - 代码方案：在 `packages/rendercore` 内引入或实现支持 Spine `3.8.99` 且能与 Pixi v8 显示树协作的 Spine adapter；依旧通过 `RendercoreSpineSymbolPlayer` / `SpineSymbolAni` 抽象对外，不让 `apps/game003` 或 `apps/symbolsviewer` 直接依赖 Spine runtime。
4. 若采用代码方案，需要同步：

```text
packages/rendercore/package.json
pnpm-lock.yaml
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/README.md
agents.md
```

5. 兼容性验收必须覆盖：
   - `createSymbolSpineAnimationResourcesFromManifest(...)` 能解析当前 `WL,H1,H2,H3,H4,H5,CL,SC` skeleton。
   - exact animation name 校验仍有效：写错大小写仍会失败。
   - atlas page 必须匹配 `Symbol.png`。
   - runtime player 能初始化、播放 `Idle` / `Start` / `start` / `Win`，并按 once/static 合同返回状态。

如果资源无法重导出，且没有经过测试证明的 Spine 3.8.99 runtime adapter，本任务必须阻塞并在任务报告中写清原因。不能继续通过删除 manifest animation 或改测试来假装完成。

### 5.3 收紧 rendercore 的 Spine 缺状态退回 normal 合同

在 `packages/rendercore` 中实现通用规则：

- 当某个 symbol 的 manifest 声明了 `normal.kind: "spine"`，且 `normal` Spine resource 成功注册时，它被视为 Spine symbol。
- 对这个 Spine symbol，如果 `appear` 或 `win` 没有在 manifest 中声明动画 resource，则运行时显示该 symbol 的 `normal` Spine 动画。
- 这个 fallback 必须保持当前 requested state 的 playback 合同：
  - `appear` / `win` 仍是 once state，需要给状态机一个完成信号，不能让 `playSpin()` 或 win loop 卡住。
  - 显示内容不能调用 `createAppearSymbolAni(...)` 或 `createWinSymbolAni(...)`，不能出现通用缩放 appear 或 win shine。
  - 推荐实现一个内部 `SpineNormalFallbackAni` 或同等 helper：复用 normal Spine resource 播放 `Idle`，但按当前 once state 的最小 duration 报告 `onceCompleted`，完成后状态机会回到 normal。
- 如果 manifest 明确写了 `appear` / `win` Spine spec，则必须校验对应 skeleton animation 存在；缺失时 fail-fast，不能自动退回 normal。
- 如果 normal Spine resource 本身缺失、atlas 缺失、texture 缺失、atlas page 错误、`Idle` 不存在，必须 fail-fast。
- 如果非 Spine symbol 缺少 `appear` / `win`，保持现有行为，不新增宽泛 fallback。

建议修改文件：

```text
packages/rendercore/src/symbol/ani.ts
packages/rendercore/src/symbol/vni-animation.ts
packages/rendercore/src/symbol/spine-animation.ts
packages/rendercore/src/symbol/types.ts
packages/rendercore/src/symbol/index.ts
```

建议测试：

```text
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/tests/symbol/manifest.test.ts
packages/rendercore/tests/symbol/animation-resolver.test.ts
```

测试必须覆盖：

- `normal` 是 Spine，`appear` 缺失时返回 normal Spine 显示，不创建 builtin/static appear 效果，并能按 once 完成。
- `normal` 是 Spine，`win` 缺失时返回 normal Spine 显示，不创建 builtin win shine，并能按 once 完成。
- manifest 写了 `appear: { kind: "spine", animationName: "Start" }` 但 skeleton 没有 `Start` 时抛错。
- `spinBlur` / `disabled` 仍优先走 requested state texture，不误走 Spine normal fallback。
- 非 Spine symbol 不受该规则影响。

### 5.4 更新 game003-s1 manifest

修改：

```text
assets/game003-s1/symbol-state-textures.manifest.json
```

目标规则：

- `WL,H1,H2,H3,H4,H5,CL,SC.normal` 都是 Spine `Idle`，`loop: true`。
- `WL.appear` 使用 skeleton 中真实存在的 lowercase `start`。
- `H1.appear`、`CL.appear`、`SC.appear` 使用 skeleton 中真实存在的 `Start`。
- `H2,H3,H4,H5.appear` 不再写 `kind: "static"`；它们 skeleton 没有 `Start/start`，因此让 rendercore 的 Spine normal fallback 生效。
- `WL,H1,H2,H3,H4,H5,CL,SC.win` 使用 skeleton 中真实存在的 `Win`，`loop: false`。
- `CO` 没有当前 Spine JSON，保持现有 builtin 合同。
- `L1-L5` 继续保留 `win.kind: "vni"` 和 `appear.kind: "static"`，不被本任务改成 Spine。
- 每个可展示 symbol 仍必须显式 `scale: 1`。

修改后用 parser 验证，不允许靠人工猜测：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
```

如果需要重新生成 state texture manifest，命令必须保留完整 symbol 列表和 scale：

```bash
CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
```

生成器会重写 manifest，执行后必须确认 `animations` 没有丢失，尤其是 `CL/SC` Spine 配置和 `H2-H5` 缺 `appear` 的合同没有被误恢复成 static。

### 5.5 更新 YAML、loading 和 generated TS

修改：

```text
apps/game003/config/game-static.yaml
```

目标：

- `loading.resources` 中 `game003-symbol-spine-skeletons` 的 glob 从：

```text
assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json
```

更新为：

```text
assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json
```

- `skins."1".symbols.spineSkeletonGlob` 同步更新为同一 brace glob。
- YAML 注释同步说明：只纳入当前主转轮已存在且本次 Spine 化的 symbol；新增资源不要用宽泛 glob 接入。
- 不改 `pngGlob`、`vniProjectGlob`、`vniAssetGlob`、`spineAtlasGlob`、`spineTextureGlob` 的边界，除非资源盘点显示确实需要。

修改 YAML 后必须生成：

```bash
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
```

生成物只允许由命令更新：

```text
apps/game003/src/generated/game-static.generated.ts
apps/game003/src/generated/game-loading.generated.ts
```

同步更新测试中对 skeleton glob、generated module keys、loading resource ids 的断言：

```text
apps/buildgamestatic/tests/generator.test.ts
apps/buildgamestatic/tests/yaml-loader.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/loading-resources.test.ts
```

### 5.6 更新 symbolsviewer

修改：

```text
apps/symbolsviewer/src/symbol-set-config.ts
apps/symbolsviewer/tests/symbol-set-config.test.ts
apps/symbolsviewer/README.md
```

目标：

- `game003S1SpineSkeletonModules` 的 glob 加入 `CL,SC`，仍使用 brace glob，不使用 `*.json`。
- viewer 继续只传 manifest、VNI modules、Spine skeleton modules、atlas raw modules 和 texture URL modules 给 rendercore。
- viewer 测试覆盖：
  - `CL/SC.normal` 和 `CL/SC.win` 是 Spine。
  - `CL/SC.appear` 是 Spine `Start`。
  - `H2-H5.appear` 不再是 static/builtin，而是走 Spine normal fallback，且不会创建通用 appear 效果。
  - 暂不处理的新资源不出现在 display symbols 中。

### 5.7 更新 game003 runtime 接入和测试

修改或确认：

```text
apps/game003/src/skin-config.ts
apps/game003/src/assets.ts
apps/game003/src/symbol-animation-config.ts
apps/game003/tests/assets.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/tests/symbol-animation-config.test.ts
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/source-boundary.test.ts
apps/game003/scripts/verify-static-dist.mjs
```

目标：

- `skin.displaySymbols` 仍从 manifest 派生，包含 `CL,SC`，不包含 `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN`。
- `apps/game003/src/assets.ts` 的 `GAME003_DISPLAY_SYMBOLS`、`apps/game003/src/game-demo.ts` 的默认 skin/runtime 配置、测试 fixture 都必须与 manifest display symbols 边界一致；runtime loader 继续优先使用 `skin.displaySymbols`，不要让硬编码常量成为新的 source of truth。
- `symbolAnimationResolver` 继续走 `createSymbolManifestAnimationResolver(...)`，不写 app 层 symbol 分支。
- `CL/SC` 的 Spine skeleton modules 出现在 generated static config 中。
- `H2-H5.appear` 测试断言改为 normal fallback 合同，不再要求 `kind: "static"`。
- `spinBlur` / `disabled` 对所有 display symbols 仍由 PNG state textures 驱动；请求 `spinBlur` / `disabled` 时不要走 Spine normal fallback。
- `L1-L5` 的 VNI win 资源和 `CO` builtin 合同保持原样。
- `apps/game003/scripts/verify-static-dist.mjs` 是 `release:check` 的真实验收面，必须同步更新：
  - dist hash 校验要覆盖 `WL,H1,H2,H3,H4,H5,CL,SC` 的 Spine skeleton JSON、`Symbol.atlas`、`Symbol.png`，不能只校验 normal / spinBlur / disabled PNG。
  - `createDistAssetHashMap(...)` 如需校验 atlas，必须把 `.atlas` 纳入 hash 文件类型。
  - `verifySourceManifest(...)` 要检查 `CL/SC` 已是 Spine、`H2-H5.appear` 不再是 `static` / `builtin`，并确认暂不处理的新资源没有进入 manifest symbols。
  - 继续保留 JPG symbol runtime 引用、敏感字符串、generated config sync、入口 chunk 轻量化等现有发布检查。
- `apps/game003/tests/source-boundary.test.ts` 或等价边界测试要补充：game003 源码不能直接导入 Spine runtime 包，不能使用宽泛 `assets/game003-s1/*.json`，不能在 app 层硬编码 `CL/SC` 播放逻辑或暂不处理的新 symbol 列表作为 runtime display set。

### 5.8 更新文档和协作规则

需要同步检查并更新：

```text
apps/game003/README.md
apps/symbolsviewer/README.md
packages/rendercore/README.md
agents.md
```

必须更新的规则点：

- `assets/game003-s1/{WL,H1,H2,H3,H4,H5,CL,SC}.json`、`Symbol.atlas`、`Symbol.png` 是 manifest 驱动的 Spine symbol 动画资源。
- Spine symbol 的 `normal` 使用 `Idle`；`appear` / `win` 只有 skeleton 中存在对应 exact animation 时才声明。
- Spine symbol 缺少某状态动画时默认退回 normal，不能退回通用 builtin/default 动画实现。
- 新增或调整 Spine symbol 动画时必须同步 manifest、YAML Spine glob、loading 资源、generated TS、symbolsviewer 预览、game runtime resolver 和测试。
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 这类新增资源不能被宽泛 glob 或 viewer/runtime fallback 悄悄接入。

如果检查后发现 `packages/rendercore/README.md` 已经只描述通用能力且不需要列举 game003 资源，可以不改，但任务报告必须写明检查结论。

## 6. 验收命令

执行顺序建议如下。若某一步失败，先判断是否是预期的严格合同失败；不要用隐藏 fallback 绕过。

### 6.1 资源和边界盘点

```bash
git status --short --untracked-files=all
git diff --stat
node -e 'const fs=require("fs"); const path="assets/game003-s1"; const files=fs.readdirSync(path); const manifest=JSON.parse(fs.readFileSync(`${path}/symbol-state-textures.manifest.json`,"utf8")); const display=Object.keys(manifest.symbols); const jsons=files.filter(f=>f.endsWith(".json")&&!f.endsWith("-wins.json")&&f!=="symbol-state-textures.manifest.json"&&f!=="bg-bar-symbol-state-textures.manifest.json").sort(); console.log("manifest symbols:", display.join(",")); console.log("spine jsons:", jsons.join(",")); console.log("intersection:", jsons.map(f=>f.slice(0,-5)).filter(s=>display.includes(s)).join(",")); console.log("new/out-of-scope:", jsons.map(f=>f.slice(0,-5)).filter(s=>!display.includes(s)).join(",")); for (const f of jsons) { const j=JSON.parse(fs.readFileSync(`${path}/${f}`,"utf8")); const animations=Object.keys(j.animations||{}).sort(); console.log(`${f}: spine=${j.skeleton?.spine||"?"} size=${j.skeleton?.width||"?"}x${j.skeleton?.height||"?"} animations=${animations.join(",")}`); }'
```

### 6.2 生成物同步

```bash
pnpm --filter game003 generate:static-config
pnpm --filter game003 check:static-config
```

### 6.3 单包测试

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter game003 test
```

### 6.4 类型、lint、build、发布检查

```bash
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
```

### 6.5 格式和遗漏检查

```bash
pnpm --filter @slotclientengine/rendercore format:check
pnpm --filter buildgamestatic format:check
pnpm --filter symbolsviewer format:check
pnpm --filter game003 format:check
git diff --check
```

### 6.6 边界 grep

```bash
rg -n "assets/game003-s1/\\*.json|game003-s1/\\{WL,H1,H2,H3,H4,H5\\}\\.json|(H2|H3|H4|H5).*(static|builtin|静态)|(static|builtin|静态).*(H2|H3|H4|H5)" apps packages assets README.md agents.md
rg -n "\\b(BN|CN|ES|MP2|RS|Reel_NearWin|UP|UPCN)\\b" apps/game003 apps/symbolsviewer assets/game003-s1/symbol-state-textures.manifest.json
```

第一条命令如果命中旧文案或旧断言，必须修正。第二条命令在当前搜索范围内不应命中暂不处理的新资源；如果执行者额外扩展搜索到 `tasks/`，任务计划和任务报告中的范围说明可以命中，但生产代码、manifest、YAML 主转轮配置、generated TS 的 display symbols 中不应出现暂不处理的新资源。

## 7. 验收标准

任务完成必须同时满足：

- `assets/game003-s1/symbol-state-textures.manifest.json` 中 `WL,H1,H2,H3,H4,H5,CL,SC` 的 `normal` / 可用 `appear` / 可用 `win` 均由 Spine manifest 驱动。
- `H2,H3,H4,H5.appear` 不再依赖 `static` 或 builtin 伪状态；运行时通过 rendercore 的 Spine normal fallback 显示 normal，并能按 once 状态完成。
- `CL/SC` 从原 builtin appear/win 改为 Spine `Idle` / `Start` / `Win`。
- `CO`、`L1-L5` 合同不被误改：`CO` 保持现状，`L1-L5.win` 仍是 VNI。
- 当前 `spine=3.8.99` skeleton 能被 rendercore 解析和播放；若不能，任务以明确阻塞结束，不允许用 fallback 伪装完成。
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 不出现在 game003 主转轮 display symbols、YAML spine glob、loading 主转轮 spine skeleton 组、symbolsviewer game003-s1 display set 或 runtime resolver 专属代码中。
- `apps/game003/config/game-static.yaml`、`game-static.generated.ts`、`game-loading.generated.ts` 同步，`check:static-config` 通过。
- `apps/symbolsviewer` 能通过同一 rendercore resolver 预览 `game003-s1`，没有 app 层 symbol 专属动画分支。
- `apps/game003/scripts/verify-static-dist.mjs` 能在 `release:check` 中校验 Spine skeleton JSON、`Symbol.atlas` 和 `Symbol.png` 已进入 dist，并校验 source manifest 的 Spine 状态合同。
- 所有第 6 节验收命令通过；如有失败，任务报告必须写清失败命令、失败原因、是否为无关历史问题，以及本任务范围内为什么可以交付或为什么不能交付。
- `agents.md` 已按需要更新；若无需更新，报告中写明已检查且无需更新的理由。

## 8. 第二遍遗漏检查

交付前必须做一次真实遗漏审计，不要只看测试是否绿。

检查清单：

- 资源范围：重新跑第 3.2 节盘点命令，确认处理集合、暂不处理集合和报告一致。
- Spine 兼容性：确认 `CI=true pnpm --filter @slotclientengine/rendercore test` 不再出现 `Invalid timeline type for a slot`；如果通过资源重导出解决，报告要写清资源版本变化；如果通过代码 adapter 解决，报告要写清依赖和锁文件变化。
- Manifest：检查 `normal/appear/win` 是否按 skeleton 中真实 animation name 声明，大小写准确；缺状态是否真的没有写伪 `static` / `builtin`。
- YAML/loading：确认 skeleton brace glob 只包含本任务范围，不是宽泛 `*.json`。
- Generated：确认两个 generated TS 来自命令，不是手改；`check:static-config` 通过。
- Release：确认 `verify-static-dist.mjs` 的 dist hash 校验和 source manifest 校验覆盖本次 Spine 资源和状态合同。
- Runtime：确认 normal fallback 只适用于 `normal.kind: "spine"` 的 symbol，且不会吞掉 manifest 明确声明的错误资源。
- Tests：确认是改测试表达新合同，不是改生产逻辑迎合旧测试。
- Docs：确认 README 和 `agents.md` 没有继续写 `H2-H5 appear static`、`{WL,H1,H2,H3,H4,H5}.json` 这类旧规则。
- Boundary grep：确认新增资源没有被宽泛 glob 或 display set 悄悄纳入。
- Report：确认任务报告使用 UTC 文件名，写清命令结果和残留风险。

## 9. 任务报告要求

完成后新增：

```text
tasks/82-game003-spine-symbol-refresh-[utctime].md
```

报告必须包含：

- 本次最终处理的 Spine symbol 集合。
- 本次明确暂不处理的新资源集合。
- 修改文件列表和每类修改目的。
- manifest 中每个处理 symbol 的 `normal` / `appear` / `win` 状态结果，尤其说明缺失状态如何退回 normal。
- Spine 3.8.99 兼容性处理结论：资源重导出、代码 adapter、或阻塞原因。
- YAML/loading/generated TS 同步情况。
- `verify-static-dist.mjs` / `release:check` 发布验收面同步情况。
- `agents.md` 是否更新及原因。
- 第 6 节每条验收命令的结果；失败项必须写原因和处置。
- 是否新增依赖、是否执行 `pnpm install`、`pnpm-lock.yaml` 是否变化。
- 第二遍遗漏检查结论。
