# anieditorv5runtime-cc special blend modes 任务计划

## 1. 任务目标

更新 Cocos Creator runtime：

```text
/Users/zerro/github.com/slotclientengine/packages/anieditorv5runtime-cc
```

把当前已经解析但统一按 `normal` 渲染的 V5G/VNI blend mode，改成真实支持特殊混合效果。

必须支持的 blend mode：

- `normal`
- `add`
- `screen`
- `multiply`
- `lighten`

当前实现曾经因为 Cocos Creator 对部分 Sprite blend factor 支持不稳定，采取了保守策略：保留数据里的 `blendMode` 字段，但 `add`、`screen`、`multiply`、`lighten` 全部按 `normal` 渲染。这个策略已经不能满足新动画效果，本任务要把它替换为真实渲染支持。

如果真实 Cocos Creator 3.8.6 能通过 Sprite / Material blend state 覆盖实现这些混合方式，优先使用该路线。如果最后验证只能通过自定义 shader / Effect 才能正确实现，则必须补 shader / Effect，并且仍然要支持 standalone 交付版。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成现状确认、实现、测试、standalone 交付、文档同步、协作规则同步判断和任务报告。

任务完成后必须新增中文任务报告：

```text
tasks/42-anieditorv5runtime-cc-special-blend-modes-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/42-anieditorv5runtime-cc-special-blend-modes-260623-123456.md
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

执行前必须确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
```

当前仓库根目录只有：

```text
agents.md
```

如果本任务只更新 `packages/anieditorv5runtime-cc`、相关测试、README、standalone 文件、standalone zip 和任务报告，通常不需要同步更新 `agents.md`。如果实现阶段改变了仓库协作规则、目录规范、根级脚本或长期执行约定，必须同步更新 `agents.md`，并在任务报告中说明原因。

## 3. 当前实现事实

执行时必须重新阅读当前实现，以实际代码为准。当前已经观察到的相关事实如下。

核心路径：

```text
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/README.md
```

当前 blend mode 事实：

- `V5GBlendMode` 已定义为 `"normal" | "add" | "screen" | "multiply" | "lighten"`。
- `validateCocosV5GProject(...)` 会接受这些已知 blend mode，未知 blend mode 会失败。
- `src/cocos/blend-mode.ts` 当前只有 `SupportedCocosBlendMode = "normal"`。
- `getCocosBlendModeConfig(...)` 当前不看传入值，始终返回 `{ mode: "normal" }`。
- `src/cocos/cocos-node-driver.ts` 当前 `applyBlendMode(node, _config)` 只确认节点上有 `Sprite`，不会写 Sprite blend factor、Material、Effect 或 shader。
- `standalone/anieditorv5runtime-cc.ts` 内部有同样的 blend no-op 逻辑。
- `tests/cocos/blend-mode.test.ts` 当前把“所有已知 blend mode 都归一为 normal”当成正确行为；本任务必须改掉这类测试，不要为了测试继续保留错误生产语义。
- `README.md` 当前写明 Cocos adapter 不读取或写入 Sprite blend factor / material / effect，所有已知 blend mode 实际按 normal 渲染；任务完成后必须同步更新。

当前 runtime 边界：

- `src/cocos/cocos-node-driver.ts` 可以 runtime import `"cc"`。
- `src/cocos/types.ts` 可以保留 type-only `"cc"` import。
- `src/core/*`、`src/cocos/player.ts`、`src/index.ts` 不应 runtime import `"cc"`。
- package 根入口不要 runtime re-export 真实 Cocos driver 或依赖真实 `"cc"` 的 factory；真实 Cocos driver 留在 `./cocos` 子入口或 standalone 文件里。
- standalone runtime `standalone/anieditorv5runtime-cc.ts` 可以 import Cocos Creator 内置 `"cc"`，但不能 import 仓库源码、Node、DOM、Pixi 或 package 路径。
- standalone runtime 需要保持 ES2015 兼容，特别是不能出现 `.includes(...)`。
- `scripts/check-standalone.mjs` 是 standalone 边界守卫。新增 standalone public API 或新增 standalone 交付文件时必须同步更新检查脚本。

当前 standalone 交付事实：

- 主要交付面仍是 `standalone/anieditorv5runtime-cc.ts`。
- `standalone/V5GPreview.example.ts` 是宿主 Cocos Component 示例，不是 runtime 必需入口。
- 如果本任务不需要 shader / Effect 资产，standalone zip 应继续只包含 runtime TS 和示例 TS。
- 如果本任务确认必须使用 shader / Effect 资产，允许突破“只有单 TS 文件”的旧交付范围，但必须把 standalone 版做成自包含交付：runtime TS、示例 TS、Effect/shader 资产和绑定说明都必须进入 standalone 交付范围，并且缺少资产时要显式失败，不能静默回退到 normal。

## 4. 行为契约

### 4.1 blend mode 语义

必须继续支持并正确渲染：

- `normal`：保持 Cocos Sprite 默认 alpha blending 行为。
- `add`：源图叠加到目标图上，亮部应明显增亮，不能和 `normal` 截图一致。
- `screen`：按 screen 类混合语义增亮，效果应区别于 `add` 和 `normal`。
- `multiply`：按 multiply 类混合语义压暗，效果应区别于 `normal`。
- `lighten`：按 lighten/max 类混合语义取亮部，效果应区别于 `screen`、`add` 和 `normal`。

必须保持显式失败：

- 未知 blend mode 继续在校验阶段失败。
- 已知非 `normal` blend mode 不能因为 Cocos 某个 API 不存在就静默按 `normal` 渲染。
- 如果某条渲染路线需要额外 Material / Effect / shader 资产，而宿主没有提供或 runtime 无法创建，必须在 `init()` 或 `applyBlendMode(...)` 阶段抛出包含 blend mode 和缺失原因的错误。
- 不允许 catch Cocos blend/material/shader 错误后吞掉并继续渲染。

### 4.2 Cocos 能力探测和路线选择

实现前必须先确认 Cocos Creator 3.8.6 的真实可用 API，不要只根据 shim 或 fake 测试猜测。

探测顺序：

1. 检查真实 Cocos Creator 3.8.6 类型和最小项目中 Sprite / Material / Pass 是否可稳定设置 blend state。
2. 尝试在最小场景中创建两个重叠 Sprite，分别应用 `normal`、`add`、`screen`、`multiply`、`lighten`，用截图或肉眼确认每种模式和 normal 不同。
3. 如果原生 Sprite / Material blend state 能覆盖全部模式，采用原生 Material/blend-state 路线。
4. 如果只能覆盖一部分模式，例如 `add` 可以但 `multiply` / `lighten` 不行，必须选择一个统一、可维护的实现策略。允许混合策略，但测试和 README 必须说清楚每种模式用哪条路线。
5. 如果只能靠 shader / Effect，必须实现 shader / Effect，并同步 standalone 交付。

探测结论必须写入任务报告，至少包括：

- 使用的 Cocos Creator 版本。
- 验证的最小场景或宿主项目路径。
- 每个 blend mode 的实现路线。
- 是否使用 shader / Effect。
- 如果真实 Cocos 编辑器无法在当前环境运行，必须说明未运行原因，并保留 monorepo 内可自动化的 fake/unit 验收结果。

跨机器探针交接要求：

- 如果执行者本机或用户当前机器没有 Cocos Creator 3.8.6 环境，不能把真实探针伪装成已完成。
- 执行者必须在任务报告中写一段“给用户换机执行的 Cocos 探针说明”，让用户可以复制到另一台有 Cocos Creator 3.8.6 的机器上执行。
- 探针说明必须包含：
  - 需要复制的文件清单，例如 standalone runtime、示例 Component、shader / Effect 资产、测试图片或最小 project JSON。
  - 在 Cocos Creator 3.8.6 里创建或打开项目、放置文件、绑定 SpriteFrame / Effect / Material 的具体步骤。
  - 五种模式的判定表：`normal`、`add`、`screen`、`multiply`、`lighten`。
  - 每种模式的预期现象：非 `normal` 必须和 `normal` 截图不同，且不能报错。
  - 需要用户回传的证据：Cocos Creator 版本号、控制台错误截图或文本、五种模式截图、最终判定表。
- 如果换机探针显示某个非 `normal` 模式和 `normal` 视觉一致，或控制台报 Material / Effect / shader 错误，则判定该路线失败，必须回到实现阶段修正，不能在报告里写完成。
- 如果换机探针还没有执行，任务报告最多只能写“monorepo 自动化验收通过，真实 Cocos Creator 验收待用户换机执行”，不能写“真实 Cocos 验收通过”。

### 4.3 standalone 契约

standalone 版是本任务的硬验收面。模块化源码通过不代表完成。

必须同步更新：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/tests/standalone/*
```

如果不需要 shader / Effect：

- `standalone/anieditorv5runtime-cc.ts` 仍应只 import `"cc"`。
- `standalone.zip` 内容应只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

如果需要 shader / Effect：

- 必须新增 standalone 可复制资产，例如：

```text
packages/anieditorv5runtime-cc/standalone/effects/v5g-blend.effect
```

实际文件名以实现为准，但必须在 README 和报告里写清楚。

- `standalone/V5GPreview.example.ts` 必须展示宿主如何把 Effect / Material / shader 资产绑定给 runtime，或如何放置到 Cocos 项目资源目录。
- runtime 不能调用 `resources.load()`，不能读取 JSON / manifest，不能猜测资源路径。
- 如果 shader 资产缺失，非 `normal` blend mode 必须显式失败。
- `standalone.zip` 必须包含所有 standalone 必需文件。
- `scripts/check-standalone.mjs` 必须检查 zip/文件清单，不允许遗漏 shader 资产或出现 `__MACOSX`、`._*` 等 macOS 元数据。

### 4.4 不允许的做法

不允许：

- 继续把 `add`、`screen`、`multiply`、`lighten` 当成 `normal`。
- 为了让旧测试通过而保留错误生产语义。
- 在 `src/core/*` 引入 Cocos、DOM、Pixi、Node 或 shader 平台细节。
- 在 package 根入口引入真实 `"cc"` runtime import。
- 在 standalone runtime 引入相对源码 import、workspace import、Node、DOM、Pixi、`JsonAsset`、`resources.load()` 或 `.includes(...)`。
- 新增 hidden fallback、placeholder 贴图、自动猜路径、自动降级 normal。
- 把 fake `cc` 的能力当成真实 Cocos 能力。fake 只用于测试记录行为，真实可用性以 Cocos Creator 3.8.6 探测为准。

## 5. 目标文件和改动范围

优先改动这些文件：

```text
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/README.md
```

如果使用 shader / Effect，可能新增：

```text
packages/anieditorv5runtime-cc/standalone/effects/
packages/anieditorv5runtime-cc/src/cocos/effects/
packages/anieditorv5runtime-cc/tests/cocos/fixtures/
```

新增空目录必须放 `.keepme`。如果目录里有真实文件，不需要 `.keepme`。

不要改动无关 package、viewer、Pixi/VNI runtime 或导出数据，除非实现中发现真实共享契约必须同步。若改动范围超过本清单，必须在任务报告说明原因。

## 6. 实施阶段

### 阶段 0：现状复核

在仓库根目录执行：

```bash
git status --short
git diff --stat
```

阅读当前代码：

```bash
sed -n '1,220p' packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
sed -n '1,280p' packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
sed -n '1,220p' packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
sed -n '1,260p' packages/anieditorv5runtime-cc/src/cocos/types.ts
sed -n '1,260p' packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
sed -n '1,260p' packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
sed -n '1,320p' packages/anieditorv5runtime-cc/tests/fakes/cc.ts
sed -n '1,260p' packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
```

同时搜索 standalone 中的同名实现：

```bash
rg -n "blend|Blend|Material|Effect|shader|srcBlend|dstBlend" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

确认哪些 fixtures 使用了非 `normal`：

```bash
rg -n "\"blendMode\": \"(add|screen|multiply|lighten)\"" packages/anieditorv5runtime-cc/tests/fixtures docs/anieditor5
```

如果没有覆盖所有模式的现成 fixture，需要在测试里构造最小 project，不要为了测试复制大量真实资源。

### 阶段 1：确定 Cocos 实现路线

先做真实 Cocos Creator 3.8.6 探测，再写生产实现。探测不要求提交一个完整 Cocos 项目，但结论必须可复核。

如果当前机器没有 Cocos Creator 3.8.6，必须先准备跨机器探针交接材料，再继续本机可完成的代码实现和自动化测试。交接材料至少要能让用户在另一台机器上回答这几个问题：

```text
1. normal 是否仍按默认 alpha 混合渲染？
2. add 是否明显比 normal 更亮？
3. screen 是否明显增亮，且和 add 不完全一样？
4. multiply 是否明显压暗，且和 normal 不一样？
5. lighten 是否取亮部效果，且和 screen/add 不完全一样？
6. 控制台是否出现 Material / Effect / shader / blend state 报错？
7. 缺失必需 shader / Effect 资产时是否显式报错，而不是静默 normal？
```

最低探测内容：

- 一个目标底图 Sprite。
- 一个源图 Sprite。
- 源图分别应用 `normal`、`add`、`screen`、`multiply`、`lighten`。
- 检查是否能通过 Sprite / Material / Pass 设置 blend state。
- 检查 `lighten` 是否需要 blend op max 或 shader。
- 检查透明 PNG、半透明 alpha、负缩放和粒子 Sprite 是否仍能正常渲染。

实现路线选择规则：

- 原生 Material/blend-state 覆盖全部模式：使用原生 Material/blend-state，不新增 shader 文件。
- 原生路线只覆盖部分模式：允许对部分模式使用 Material/blend-state，对剩余模式使用 shader / Effect，但必须把模式到策略的映射写进代码、测试、README、报告。
- shader / Effect 必需：新增 shader / Effect，并把 standalone 交付改成带资产的自包含交付。

不要因为 Cocos API 在 fake shim 里不存在就修改生产语义；应先扩展 `types/cc-3.8.6-shim.d.ts` 和 `tests/fakes/cc.ts`，让测试能记录真实生产代码需要的最小 API。

### 阶段 2：重写 blend mode 配置层

更新：

```text
packages/anieditorv5runtime-cc/src/cocos/blend-mode.ts
```

目标：

- `getCocosBlendModeConfig("normal")` 返回默认 normal 配置。
- `getCocosBlendModeConfig("add")`、`screen`、`multiply`、`lighten` 返回各自独立配置，不能再全是 `{ mode: "normal" }`。
- 配置里要能表达实现策略，例如原生 blend state、shader/effect key、是否需要额外资产。
- 配置数据要稳定、可测试、可被 standalone 复制。
- 如果某个模式暂时无法实现，不能伪装成 normal；必须在设计阶段就选择 shader 或显式失败。但最终验收要求五个模式全部支持。

建议测试断言：

- 五个模式的 config mode / strategy / key 不应全部相同。
- `add`、`screen`、`multiply`、`lighten` 不等于 `normal`。
- 如果有 shader/effect key，key 必须是稳定字符串，并在 standalone 检查里覆盖。

### 阶段 3：实现 Cocos node driver 的真实应用

更新：

```text
packages/anieditorv5runtime-cc/src/cocos/cocos-node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/node-driver.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
```

目标：

- `applyBlendMode(node, config)` 必须真实改变节点上 Sprite 的渲染状态。
- `normal` 保持默认渲染状态，不引入额外开销。
- 非 `normal` 必须应用对应 Material / blend state / shader。
- 同一种 blend mode 的 Material / Effect 应复用或缓存，避免每帧无意义创建。
- `applyBlendMode(...)` 在 `init()`、粒子节点创建、粒子节点复用时都能工作。
- 如果某个模式需要外部 Material / Effect，但当前 driver 没有拿到，必须抛错。

如果 public options 需要扩展，例如让宿主注入 Material / Effect / factory，必须同步更新：

```text
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/README.md
packages/anieditorv5runtime-cc/tests/standalone/*
```

不要在 `V5GCocosPlayer` 里直接写真实 Cocos API。`player.ts` 仍通过 driver 调用 `applyBlendMode(...)`。

### 阶段 4：覆盖 image layer 和 particle layer

检查并保留这些调用点：

```text
V5GCocosPlayer.init()
V5GCocosPlayer.renderParticleSamples(...)
```

要求：

- image layer 节点创建时应用该 layer 的 blend mode。
- particle 节点创建时应用该 layer 或 particle sample 的 blend mode。
- particle 节点复用后，如果 sample 的 blend mode 变化，必须重新应用。
- `particle_combo.sourceOpacity` 仍只影响源图层显示，不应把粒子透明度一起清零。
- live 粒子排空、segmented playback、range playback 的逻辑不能因为 blend 支持而回退。

如果发现每帧重复设置 Material 造成性能风险，应在 driver 或 managed node 层缓存上一次应用的 blend key。缓存只能用于避免重复设置，不能跳过真实模式变化。

### 阶段 5：同步 standalone runtime

更新：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
```

要求：

- modular runtime 和 standalone runtime 的 blend 配置、driver 行为、public API 完全一致。
- 不能只改 `src/` 后把 standalone 留在旧 normal fallback。
- 继续通过 `typecheck:standalone`。
- 继续通过 `standalone:check`。
- 继续保持 ES2015 兼容，不使用 `.includes(...)`。

更新示例：

```text
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
```

要求：

- 如果不需要额外资产，示例至少说明新 runtime 已支持特殊 blend，不需要宿主额外 normal fallback。
- 如果需要 shader / Effect，示例必须展示宿主如何提供这些资产或 Material factory。
- 示例不能调用 `resources.load()`，不能读取 manifest，不能自动猜资源路径。

重新生成 standalone zip。命令在 package 目录下执行：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
zipinfo -1 standalone.zip
```

如果新增 shader / Effect standalone 资产，上面的 zip 命令必须追加真实资产路径，例如：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts standalone/effects
zipinfo -1 standalone.zip
```

`zipinfo -1` 输出必须写入任务报告，确认没有 macOS metadata、旧文件或无关文件。如果 `standalone.zip` 当前不在 git 跟踪中，仍应创建用于交付验收，并在报告中记录它的存在和是否被跟踪。

### 阶段 6：更新测试

必须改掉旧的错误测试：

```text
packages/anieditorv5runtime-cc/tests/cocos/blend-mode.test.ts
```

旧断言“所有已知 blend mode 都归一为 normal”必须删除或改写。测试导致一些奇怪写法时，修改测试，不要改不该改的生产逻辑。

至少新增或更新这些测试：

1. blend config 测试
   - `normal` 是默认配置。
   - `add`、`screen`、`multiply`、`lighten` 都有非 normal 策略。
   - 非 normal 之间的关键参数或 strategy key 可区分。

2. driver 应用测试
   - fake `cc` 能记录 Sprite 被应用的 blend state / Material / Effect key。
   - `applyBlendMode("normal")` 不破坏默认 Sprite 状态。
   - `applyBlendMode("add")`、`screen`、`multiply`、`lighten` 会写入对应状态。
   - 缺失必要 Material / Effect / API 时抛出清楚错误，不 fallback。

3. player 集成测试
   - image layer 创建时调用对应 blend。
   - particle 节点创建和复用时应用对应 blend。
   - 一个最小 project 中同时存在 normal 图层和非 normal 图层，初始化后 fake 节点状态可区分。

4. standalone parity 测试
   - standalone 的 `getCocosBlendModeConfig(...)` 或等价行为与 modular 一致。
   - standalone player 在 fake driver 下对 image/particle 应用相同 blend。
   - 如果新增 public API，`standalone:check` required exports 必须同步。

5. 校验测试
   - 未知 blend mode 仍失败。
   - 已知五种 blend mode 仍通过校验。

如果 fake `cc` 或 shim 缺少真实 Cocos 类型，扩展：

```text
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/fakes/cc.ts
```

注意：shim 和 fake 只能补足测试环境，不得把生产实现改成“为了 fake 好写”的形状。

### 阶段 7：更新 README 和协作规则判断

更新：

```text
packages/anieditorv5runtime-cc/README.md
```

必须移除或改写旧结论：

```text
所有已知 blend mode 实际按 normal 渲染
```

README 必须说明：

- 支持哪些 blend mode。
- 每种模式是否使用 Cocos native blend state、Material 或 shader / Effect。
- standalone 版如何复制使用。
- 如果 shader / Effect 资产必需，宿主项目应该复制哪些文件、如何绑定、缺失时会如何失败。
- 本仓库自动化验收覆盖了 TypeScript、Vitest fake `cc`、standalone 检查和构建；真实 Cocos Creator 编辑器验收结果以任务报告为准。

判断是否更新：

```text
agents.md
```

只有本任务改变长期协作规则、目录规范或基础脚本时才更新。单纯实现 blend mode、测试、README 和 standalone 资产，不需要更新 `agents.md`。

## 7. 验收命令

在仓库根目录执行 package 级验收：

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
pnpm --filter @slotclientengine/anieditorv5runtime-cc test
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
pnpm --filter @slotclientengine/anieditorv5runtime-cc build
pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
```

在 package 目录执行 standalone zip 验收：

```bash
cd packages/anieditorv5runtime-cc
zipinfo -1 standalone.zip
```

在仓库根目录执行最终 diff 检查：

```bash
git diff --check
git status --short
```

如果本任务新增依赖或修改根级配置，再执行根级验收：

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

如果上述命令因依赖下载失败，先执行代理：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

然后重试同一命令。不要因为网络问题改生产代码。

真实 Cocos Creator 3.8.6 验收：

- 在真实 Cocos Creator 3.8.6 项目中导入 standalone runtime。
- 如果有 shader / Effect 资产，按 README 复制并绑定。
- 用两个重叠 Sprite 或现有 VNI 动画分别验证 `normal`、`add`、`screen`、`multiply`、`lighten`。
- 确认非 normal 模式不再和 normal 视觉一致。
- 确认缺失 shader / Effect 资产时会显式失败，而不是静默 normal。
- 如果本机和用户当前机器都没有 Cocos 环境，执行者必须把上述步骤整理成可换机执行的清单，并在报告中明确告诉用户如何在另一台机器跑、看什么、回传什么。

如果当前环境无法运行真实 Cocos Creator，不能伪造通过；任务报告必须写明“真实 Cocos Creator 验收未运行”和具体原因。

## 8. 任务报告要求

任务完成后新增：

```text
tasks/42-anieditorv5runtime-cc-special-blend-modes-[utctime].md
```

报告必须是中文，至少包含：

- 实现摘要。
- Cocos Creator 3.8.6 blend 能力探测结论。
- 每个 blend mode 的最终实现路线。
- 是否使用 shader / Effect。
- 如果使用 shader / Effect，列出新增资产路径和 standalone 使用方式。
- 修改文件清单。
- 测试和验收命令结果。
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 摘要。
- 真实 Cocos Creator 验收结果；如未运行，写明原因。
- 如果真实 Cocos 验收需要用户换机执行，必须写清楚用户换机执行步骤、判定标准和需要回传的证据。
- 是否更新 `agents.md`，以及原因。
- `pnpm-lock.yaml` 是否变化。
- 已知限制和后续风险。

报告中不能把“没有真实测试”写成“已确认真实 Cocos 可用”。不能把 fake `cc` 测试等同于真实编辑器验收。

## 9. 完成标准

全部满足才算完成：

- [ ] `add`、`screen`、`multiply`、`lighten` 不再按 normal 静默渲染。
- [ ] 未知 blend mode 仍显式失败。
- [ ] 缺失必要 Material / Effect / shader 资产时显式失败。
- [ ] image layer 和 particle layer 都应用正确 blend mode。
- [ ] modular runtime 和 standalone runtime 行为一致。
- [ ] standalone 版可交付；如需要 shader / Effect，standalone zip 包含必需资产和示例。
- [ ] `README.md` 不再保留旧的 normal fallback 说明。
- [ ] 旧测试中“归一为 normal”的断言已删除或改成新契约。
- [ ] package 级 typecheck、lint、test、standalone check、build、format check 全部通过。
- [ ] `standalone.zip` 已重建并确认内容。
- [ ] 中文任务报告已写入 `tasks/42-anieditorv5runtime-cc-special-blend-modes-[utctime].md`。
- [ ] 已判断是否需要同步 `agents.md`，并在报告中记录。

## 10. 二次遗漏检查

交付前必须再检查一遍：

- `src/cocos/blend-mode.ts` 和 standalone 内同名逻辑是否一致。
- `src/cocos/cocos-node-driver.ts` 是否仍是模块化代码里唯一真实操作 `"cc"` 的实现点。
- `src/core/*` 是否没有引入 Cocos 或 shader 平台细节。
- `src/index.ts` 是否没有 runtime re-export 真实 Cocos driver。
- `standalone/anieditorv5runtime-cc.ts` 是否没有相对 import、workspace import、Node、DOM、Pixi、`JsonAsset`、`resources.load()`、`.includes(...)`。
- 如果新增 shader / Effect，standalone zip、README、示例和检查脚本是否都包含它。
- `tests/fakes/cc.ts` 和 `types/cc-3.8.6-shim.d.ts` 是否只补最小真实 API，没有把 fake 专用行为泄漏到生产代码。
- 粒子节点复用时是否会正确处理 blend mode 变化。
- `particle_combo.sourceOpacity`、segmented playback、live 粒子排空是否没有被 blend 改动破坏。
- `packages/anieditorv5runtime-cc/README.md` 是否已经移除旧 fallback 文案。
- `standalone.zip` 是否没有 `__MACOSX`、`._*` 或旧文件。
- `tasks/42-...-[utctime].md` 报告是否包含真实 Cocos 验收结论或未运行原因。
- `git status --short` 是否只包含本任务相关文件。
