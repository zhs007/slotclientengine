# vnicore bootstrap 任务计划

## 1. 任务目标

新增稳定核心库：

```text
/Users/zerro/github.com/slotclientengine/packages/vnicore
```

包名：

```text
@slotclientengine/vnicore
```

`vnicore` 是面向 Pixi.js v8 的 VNI 动画运行时核心库，用来承载当前 `apps/anieditorv5viewer` 内已经验证过的 VNI/V5G 导出解析、校验、采样、粒子、资源尺寸校验和 Pixi 渲染能力。任务完成后，`apps/anieditorv5viewer` 必须基于 `@slotclientengine/vnicore` 渲染，不再把核心动画 runtime 私有放在 app 内。

本计划是完整可执行版本，不依赖其它聊天上下文。执行者只需要阅读本文件，即可完成初始化、抽库、迁移 viewer、测试、浏览器验收、协作规则同步和任务报告。

核心目标：

- 新增 workspace package：`packages/vnicore`。
- `packages/vnicore` 使用 Pixi.js v8，依赖版本与当前 viewer 保持一致：`pixi.js: ^8.1.6`。
- `packages/vnicore` 是 Pixi runtime/core，不是 Cocos Creator runtime，不替代 `packages/anieditorv5runtime-cc`。
- `apps/anieditorv5viewer` 只保留 viewer 外壳、UI 控件、内置资源导入、项目列表和页面诊断装配；动画核心从 `@slotclientengine/vnicore` 导入。
- `packages/vnicore` 覆盖率必须不低于 80%，并用 Vitest coverage threshold 强制失败。
- `packages/vnicore` 必须包含中文文档和可 typecheck 的示例代码，不能只靠 viewer app 当隐含示例。
- 继续支持现有导出：
  - `docs/anieditor5/export/project.json`
  - `docs/anieditor5/export/bigwin.json`
  - `docs/anieditor5/export/megawin.json`
  - `docs/anieditor5/export/superwin.json`
  - `docs/anieditor5/export/2x.json`
  - `docs/anieditor5/export/5x.json`
  - `docs/anieditor5/export/10x.json`
  - `docs/anieditor5/export/respin.json`
  - `docs/anieditor5/export/scatter1.json`
  - `docs/anieditor5/export/scatter2.json`
  - `docs/anieditor5/export/multipay.json`
  - `docs/anieditor5/export2/manifest.json`
  - `docs/anieditor5/export2/edit_full/project.json`
  - `docs/anieditor5/export2/runtime_50/project.json`

任务完成后必须新增中文任务报告：

```text
tasks/39-vnicore-bootstrap-[utctime].md
```

`utctime` 使用 UTC 年月日时分秒，命令为：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/39-vnicore-bootstrap-260623-123456.md
```

## 2. 仓库和环境约束

仓库根目录：

```text
/Users/zerro/github.com/slotclientengine
```

仓库约束：

- Node.js：`>=24.0.0`
- pnpm：`>=10.0.0`
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

本任务会新增 workspace package，并让 `apps/anieditorv5viewer` 依赖 `@slotclientengine/vnicore`。修改 `package.json` 后必须执行：

```bash
pnpm install
```

如果 `pnpm install` 下载失败，用上面的代理环境变量重试。任务报告必须记录 `pnpm-lock.yaml` 是否变化。

根协作规则文件当前实际路径是：

```text
agents.md
```

本任务新增长期核心库和 viewer 依赖边界，因此需要同步更新 `agents.md`：在目录约定或执行约定中加入 `packages/vnicore` 的定位。如果执行时发现仓库同时存在 `AGENTS.md`，必须保持 `agents.md` 与 `AGENTS.md` 内容同步；如果仍只有 `agents.md`，只更新 `agents.md`。

## 3. 当前相关事实

执行前必须重新确认工作区，不要回滚用户已有改动：

```bash
git status --short
git diff --stat
```

当前相关路径：

```text
apps/anieditorv5viewer
apps/anieditorv5viewer/src/runtime
apps/anieditorv5viewer/src/v5g/types.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/assets
packages/anieditorv5runtime-cc
packages/anieditorv5runtime-cc/src/core
packages/anieditorv5runtime-cc/src/cocos
```

当前 viewer runtime 源文件：

```text
apps/anieditorv5viewer/src/runtime/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
apps/anieditorv5viewer/src/runtime/blend-mode.ts
apps/anieditorv5viewer/src/runtime/coordinates.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts
apps/anieditorv5viewer/src/runtime/validation.ts
apps/anieditorv5viewer/src/v5g/types.ts
```

当前 Cocos runtime 有一套非 Pixi 的 `src/core`：

```text
packages/anieditorv5runtime-cc/src/core/animation-sampler.ts
packages/anieditorv5runtime-cc/src/core/coordinates.ts
packages/anieditorv5runtime-cc/src/core/particle-sampler.ts
packages/anieditorv5runtime-cc/src/core/project-sampler.ts
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
```

执行时必须以 `apps/anieditorv5viewer/src/runtime` 为抽库主线，因为 `vnicore` 是专门为 Pixi.js v8 使用的库，而当前 viewer runtime 才包含 Pixi v8 渲染、纹理加载、资源尺寸补偿、profile-scoped asset URL manifest、粒子显示顺序和浏览器诊断等真实运行路径。`packages/anieditorv5runtime-cc/src/core` 只能作为参考和差异审计来源，用来检查是否有值得同步的纯校验/纯采样修正；不要以 Cocos runtime 反推 `vnicore` 架构，也不要为了兼容 Cocos 调整 Pixi runtime 的设计。不要让 `packages/anieditorv5runtime-cc` 依赖 `@slotclientengine/vnicore`，也不要让 `@slotclientengine/vnicore` import `cc`。

当前 viewer 支持的关键能力必须保留：

- `schemaVersion` 接受 `V5G_0.x` 和 `VNI_0.x`。
- `editor.name` 接受 `victory_editor_v5_g` 和 `VNI`。
- `engineTarget.name` 当前导出数据仍是 `cocos_creator`；在本任务中把它视为导出 schema 元数据，不代表 runtime 依赖 Cocos。
- `export2` bundle 支持 `manifest.json`、`edit_full`、`runtime_50`。
- `runtime_50` 真实 PNG 文件像素为 50%，但显示逻辑尺寸仍使用 JSON 中的 `asset.width` / `asset.height`。
- `asset.fileWidth` / `asset.fileHeight` / `asset.fileScale` 必须全部存在或全部不存在。
- profile-scoped asset manifest 不能退回成全局 `asset.path -> url`。
- 支持 animation type：
  - `move`
  - `fade`
  - `scale_up`
  - `scale_down`
  - `scale_in`
  - `scale_out`
  - `pop`
  - `shake`
  - `blink`
  - `rotate`
  - `slide_in`
  - `slide_out`
  - `bounce_in`
  - `pulse`
  - `float`
  - `swing`
  - `particles`
  - `particle_twinkle`
  - `particle_wall`
  - `particle_combo`
  - `squash_stretch`
- `particle_combo.sourceOpacity` 只控制原图层透明度，不能杀掉 combo 粒子。
- 粒子显示顺序必须保持 per-layer：每个 image layer 的粒子容器紧跟该 layer 原图层之后，而不是全局顶层。
- `progress <= 0` 的粒子不能渲染，避免 0 秒首帧漏出。

## 4. 设计边界

### 4.1 vnicore 职责

`packages/vnicore` 负责：

- VNI/V5G export JSON 类型定义。
- export JSON assert/validate。
- bundle manifest assert/validate。
- export profile 与 manifest entry 对齐校验。
- asset file metadata 校验。
- asset URL manifest 纯函数能力。
- center-coordinate 到 Pixi coordinate 的转换。
- layer animation 采样。
- particle animation 确定性采样。
- project time sampling。
- Pixi.js v8 layer instance 创建。
- Pixi.js v8 texture 加载和 file size 校验。
- Pixi.js v8 player：init/play/pause/restart/seek/setLoop/destroy。
- runtime diagnostics dataset 输出。

`apps/anieditorv5viewer` 负责：

- Vite app shell。
- 选择器、按钮、时间轴等 UI。
- `import.meta.glob` 导入内置 assets。
- 内置 project 列表和 label。
- 把本地 asset modules 转成 `AssetUrlManifest`。
- 初始化 `VNIPlayer` 并连接 controls。
- 浏览器页面样式和 README。

### 4.2 不要做的事

本任务不要做：

- 不要创建 `apps/vnicoreviewer` 或新的 viewer app。
- 不要把 `packages/anieditorv5runtime-cc` 改造成依赖 `@slotclientengine/vnicore`。
- 不要把 `@slotclientengine/vnicore` 做成 Cocos runtime。
- 不要把 `cc` shim、standalone zip、Cocos Component 示例搬进 `vnicore`。
- 不要修改 `docs/anieditor5/src/**`，除非发现明确导出 bug 阻塞验收；如果修改，必须在报告中说明原因、影响和验证。
- 不要改变 `packages/gameframeworks`、`packages/rendercore`、`packages/pixiani` 等无关包。
- 不要为了测试通过在生产逻辑里加隐藏 fallback。
- 不要用占位纹理、默认动画、默认资源路径、默认 profile 静默掩盖数据问题。

### 4.3 命名边界

新库公共命名以 VNI 为主：

- 推荐 class：`VNIPlayer`
- 推荐 type：`VNIProjectConfig`、`VNILayerConfig`、`VNIAnimationConfig`、`VNIBundleManifest`
- 推荐 public subpath：`@slotclientengine/vnicore/core`、`@slotclientengine/vnicore/pixi`

历史 schema 兼容是数据兼容，不是品牌命名回退。允许继续在错误信息或注释中提到 `V5G_0.x`，因为现有导出仍包含 `V5G_0.x`。不建议在新 public API 中继续使用 `V5GPlayer` 作为主类名。如果为了降低迁移风险保留 `V5G*` type alias，必须：

- 在 README 中说明它只是 legacy schema alias。
- 在测试中覆盖 alias 不改变运行语义。
- 不把 app 新代码继续写成 `V5GPlayer`。

## 5. 建议目标结构

新增：

```text
packages/vnicore/package.json
packages/vnicore/README.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/basic-player.ts
packages/vnicore/examples/playback-events.ts
packages/vnicore/examples/validate-project.ts
packages/vnicore/examples/vite-asset-manifest.ts
packages/vnicore/eslint.config.cjs
packages/vnicore/tsconfig.json
packages/vnicore/tsconfig.build.json
packages/vnicore/tsconfig.eslint.json
packages/vnicore/tsconfig.examples.json
packages/vnicore/vite.config.ts
packages/vnicore/src/index.ts
packages/vnicore/src/core/index.ts
packages/vnicore/src/core/types.ts
packages/vnicore/src/core/coordinates.ts
packages/vnicore/src/core/animation-sampler.ts
packages/vnicore/src/core/particle-sampler.ts
packages/vnicore/src/core/project-sampler.ts
packages/vnicore/src/core/validation.ts
packages/vnicore/src/core/asset-manifest.ts
packages/vnicore/src/pixi/index.ts
packages/vnicore/src/pixi/blend-mode.ts
packages/vnicore/src/pixi/layer-instance.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/animation-sampler.test.ts
packages/vnicore/tests/core/asset-manifest.test.ts
packages/vnicore/tests/core/coordinates.test.ts
packages/vnicore/tests/core/particle-sampler.test.ts
packages/vnicore/tests/core/project-sampler.test.ts
packages/vnicore/tests/core/validation.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/tests/setup.ts
```

如果执行时发现需要额外测试 helper 或 fixture 目录，可以新增：

```text
packages/vnicore/tests/fixtures
packages/vnicore/tests/fakes
```

新增空目录必须放 `.keepme`，但不要为了 `.keepme` 保留已有文件的非空目录。

建议 `package.json`：

```json
{
  "name": "@slotclientengine/vnicore",
  "version": "0.1.0",
  "private": true,
  "description": "PixiJS v8 runtime core for VNI animation exports.",
  "packageManager": "pnpm@10.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./core": {
      "types": "./dist/core/index.d.ts",
      "import": "./dist/core/index.js"
    },
    "./pixi": {
      "types": "./dist/pixi/index.d.ts",
      "import": "./dist/pixi/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "docs", "examples"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "examples:typecheck": "tsc -p tsconfig.examples.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run --coverage",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "pixi.js": "^8.1.6"
  },
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "eslint-config-prettier": "^9.1.0",
    "globals": "^15.15.0"
  }
}
```

如果 player 测试需要真实 DOM，可把 `happy-dom` 加到 `devDependencies` 并在 `vite.config.ts` 使用 `environment: "happy-dom"`；否则用当前 viewer 测试类似的 Pixi mock 和手写 HTMLElement stub，保持 `environment: "node"` 即可。

`vite.config.ts` 必须包含 coverage threshold：

```ts
coverage: {
  provider: "v8",
  reporter: ["text", "lcov", "html", "json"],
  reportsDirectory: "coverage",
  include: ["src/**/*.ts"],
  exclude: ["src/**/types.ts"],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
}
```

不要通过排除核心实现文件来凑 80%。只允许排除纯类型文件、测试 setup、generated coverage/dist、无法执行的类型入口。若必须排除其它文件，必须在任务报告中解释原因。

## 6. 实施步骤

### 6.1 初始化包

1. 创建 `packages/vnicore`。
2. 复制同类 package 的基础配置风格，优先参考：
   - `packages/anieditorv5runtime-cc/package.json`
   - `packages/anieditorv5runtime-cc/tsconfig.json`
   - `packages/anieditorv5runtime-cc/tsconfig.build.json`
   - `packages/anieditorv5runtime-cc/eslint.config.cjs`
   - `packages/gameframeworks/vite.config.ts`
   - `packages/rendercore/vite.config.ts`
3. `tsconfig.json` 使用 `module: "ESNext"`、`moduleResolution: "Bundler"`、`target: "ES2023"`，并包含 `lib: ["ES2023", "DOM", "DOM.Iterable"]`，因为 `vnicore` 的 Pixi player public API 会使用 `HTMLElement`、`ResizeObserver`、canvas 和 RAF。
4. `tsconfig.build.json` 输出 `dist`、生成 declaration 和 source map。
5. `tsconfig.eslint.json` 必须覆盖 `src/**/*.ts`、`tests/**/*.ts`、`examples/**/*.ts`、`vite.config.ts` 和相关配置文件，避免示例逃过 lint。
6. `tsconfig.examples.json` 专门 typecheck `examples/**/*.ts`，并通过 `paths` 或 package alias 指向 `src`，不要依赖已经存在的 `dist`。该配置必须包含 DOM lib 和 `vite/client` 类型，因为 `vite-asset-manifest.ts` 会演示 `import.meta.glob`。
7. `eslint.config.cjs` 忽略 `dist/**`、`coverage/**`、`node_modules/**`，但不要忽略 `examples/**`。
8. `examples:typecheck` 必须纳入验收命令。
9. `README.md` 说明：
   - `vnicore` 是 Pixi.js v8 VNI runtime core。
   - 与 `packages/anieditorv5runtime-cc` 的区别。
   - public imports。
   - 支持和不支持的 schema/runtime 行为。
   - fail-fast 原则。
   - 文档和示例入口。
   - 测试/覆盖率命令。

### 6.1.1 文档和示例

新增中文文档：

```text
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
```

`usage-zh.md` 必须说明：

- 安装和 workspace 依赖方式：`"@slotclientengine/vnicore": "workspace:*"`。
- Pixi v8 player 最小用法。
- host app 如何准备 `container`、`project`、`assetUrls`。
- `play()`、`pause()`、`restart()`、`seek()`、`setLoop()`、`destroy()` 的生命周期。
- `playRange(...)`、时间/帧 range、open-ended range、marker 和 complete listener 的用法。
- browser diagnostics 字段含义。
- `runtime_50` 的文件像素和逻辑尺寸关系。
- 常见错误的 fail-fast 解释。

`api-zh.md` 必须说明：

- root / `./core` / `./pixi` 三个 import surface。
- 主要类型：`VNIProjectConfig`、`VNIBundleManifest`、`VNIPlayerOptions`、`VNIPlaybackRange`、`VNIPlaybackEventOptions`、`VNIPlaybackCompleteContext`、`AssetUrlManifest`。
- 主要函数：assert/validate、manifest profile 校验、sampler、asset manifest resolver。
- 主要 player 方法：`playRange`、`addPlaybackEvent`、`clearPlaybackEvent`、`clearPlaybackEvents`、`onPlaybackComplete`。
- 明确哪些 API 是 stable public surface，哪些 helper 只是内部或测试辅助。

`migration-from-viewer-zh.md` 必须说明：

- 从 `apps/anieditorv5viewer/src/runtime/*` 迁移到 `@slotclientengine/vnicore` 的 import 对照表。
- viewer 迁移后哪些职责留在 app：Vite `import.meta.glob`、内置 project list、controls、styles。
- 哪些职责进入 vnicore：类型、校验、采样、Pixi player、texture size 校验、diagnostics。
- 明确 Cocos runtime 只是参考，不是迁移来源。

新增示例：

```text
packages/vnicore/examples/README.md
packages/vnicore/examples/basic-player.ts
packages/vnicore/examples/playback-events.ts
packages/vnicore/examples/validate-project.ts
packages/vnicore/examples/vite-asset-manifest.ts
```

示例要求：

- 示例代码必须是真实 TypeScript 文件，并通过 `pnpm --filter @slotclientengine/vnicore examples:typecheck`。
- `basic-player.ts` 演示创建 `VNIPlayer`、`init()`、`play()`、`seek()`、`destroy()`，但不依赖真实 DOM 运行；可以导出函数，让宿主传入 `HTMLElement`、project 和 asset URLs。
- `playback-events.ts` 演示 `playRange(...)`、时间/帧 range、`addPlaybackEvent(...)`、`onPlaybackComplete(...)`、disposer 和显式 `fps`。
- `validate-project.ts` 演示 `assertVNIProject`、`validateVNIProject`、错误处理和显式失败，不要吞掉错误后继续运行。
- `vite-asset-manifest.ts` 演示 viewer/app 侧如何用 Vite `import.meta.glob` 生成 `AssetUrlManifest`，并强调 `import.meta.glob` 留在 app，不进入 core。
- `examples/README.md` 用中文说明每个示例的用途和如何 typecheck。
- 示例不能依赖 `apps/anieditorv5viewer/src/**`，不能 import 测试 fake，不能使用隐藏 mock 数据绕过核心 API。

### 6.2 抽取 core

从 viewer 迁移并重命名：

```text
apps/anieditorv5viewer/src/v5g/types.ts -> packages/vnicore/src/core/types.ts
apps/anieditorv5viewer/src/runtime/coordinates.ts -> packages/vnicore/src/core/coordinates.ts
apps/anieditorv5viewer/src/runtime/animation-sampler.ts -> packages/vnicore/src/core/animation-sampler.ts
apps/anieditorv5viewer/src/runtime/particle-sampler.ts -> packages/vnicore/src/core/particle-sampler.ts
apps/anieditorv5viewer/src/runtime/project-sampler.ts -> packages/vnicore/src/core/project-sampler.ts
apps/anieditorv5viewer/src/runtime/validation.ts -> packages/vnicore/src/core/validation.ts
```

迁移要求：

- public type 命名以 `VNI*` 为主。
- 保留 `V5G_0.x` / `VNI_0.x` schema 校验。
- 保留 `victory_editor_v5_g` / `VNI` editor 校验。
- 保留 `engineTarget.name === "cocos_creator"` 的当前导出校验，除非现有 fixture 已经变化；如果变化，必须显式更新校验和测试，不允许宽泛通过任意字符串。
- 保留 top-level `project.particles` 非空时显式失败。
- 保留 group layer、parentId、keyframes 显式失败。
- 保留未知 animation/easing/blend mode 显式失败。
- 保留 numeric param 必须为 finite number，不能把字符串数字解析成数字。
- 保留 optional boolean 的明确默认值，例如 `fadeOut` 缺省为 `true`。
- 保留粒子数量/速度/尺寸的范围 clamp，但缺少 param 必须失败。
- 保留 `particle_combo.sourceOpacity` 对原图层和粒子的分离语义。
- 保留 `runtime_50` 的 `fileWidth` / `fileHeight` / `fileScale` all-or-none 规则。
- 以 viewer runtime 的当前 Pixi 行为为准，先迁移 viewer 已验证逻辑，再做 Cocos core 差异审计。
- 对照 `packages/anieditorv5runtime-cc/src/core` 时，只允许同步与渲染引擎无关的纯类型、纯校验或纯采样修正；如果 Cocos core 有 viewer 缺失的严格校验或 open-ended 边界修正，必须先证明它适用于 Pixi v8 viewer，再同步到 `vnicore` 并加测试。
- 不允许因为 Cocos runtime 的 standalone 交付、ES2015 限制或 `cc` 适配改变 `vnicore` 的 Pixi v8 player API 和 viewer 渲染路径。
- 任务 34 为 Cocos runtime 补充的播放控制接口本身是重要能力，`vnicore` 也必须提供 Pixi 版本的等价接口；但 Pixi player 不能因此变成只能由宿主手动 `update(deltaSeconds)` 驱动的模式，原有 RAF 驱动的 `play()` 流程必须保留。

### 6.3 抽取 asset manifest 纯函数

拆分当前 `apps/anieditorv5viewer/src/runtime/asset-manifest.ts`：

- 迁移纯函数到：

```text
packages/vnicore/src/core/asset-manifest.ts
```

至少包含：

```ts
export type AssetUrlManifest = Readonly<Record<string, string>>;
export function createAssetUrlManifest(modules: Record<string, string>): AssetUrlManifest;
export function resolveProjectAssetUrls(project: VNIProjectConfig, manifest: AssetUrlManifest): AssetUrlManifest;
```

- 不要把 `import.meta.glob` 放进 `packages/vnicore`，因为内置资源属于 viewer app。
- viewer 内保留一个轻量资源模块，例如：

```text
apps/anieditorv5viewer/src/config/asset-url-modules.ts
```

或保留原文件名：

```text
apps/anieditorv5viewer/src/runtime/asset-manifest.ts
```

但里面只能做 Vite `import.meta.glob` 和调用 `@slotclientengine/vnicore/core` 的纯函数，不再承载核心逻辑。

### 6.4 抽取 Pixi runtime

从 viewer 迁移并重命名：

```text
apps/anieditorv5viewer/src/runtime/blend-mode.ts -> packages/vnicore/src/pixi/blend-mode.ts
apps/anieditorv5viewer/src/runtime/layer-instance.ts -> packages/vnicore/src/pixi/layer-instance.ts
apps/anieditorv5viewer/src/runtime/v5g-player.ts -> packages/vnicore/src/pixi/vni-player.ts
```

迁移要求：

- `V5GPlayer` 重命名为 `VNIPlayer`。
- `VNIPlayer` 只依赖 Pixi.js v8 和 `packages/vnicore/src/core`。
- `VNIPlayerOptions` 至少保留：
  - `container`
  - `projectId`
  - `bundleId`
  - `profileId`
  - `profilePurpose`
  - `assetScale`
  - `project`
  - `assetUrls`
  - `onTimeChange`
  - `onPlayingChange`
- `VNIPlayer` 必须新增任务 34 同级的高级播放接口，使用 VNI 命名而不是 Cocos 命名：
  - `playRange(options: VNIPlayRangeOptions): void`
  - `addPlaybackEvent(options: VNIPlaybackEventOptions): () => void`
  - `clearPlaybackEvent(id: string): void`
  - `clearPlaybackEvents(): void`
  - `onPlaybackComplete(listener: (event: VNIPlaybackCompleteContext) => void): () => void`
- `VNIPlayer` 必须保留现有 `play()`、`pause()`、`restart()`、`seek()`、`setLoop()`、`getLoop()`、`getTime()`、`isPlaying()`、`destroy()` 行为。
- 可新增 `update(deltaSeconds): void` 或内部等价方法用于手动推进和测试，但 `play()` 仍必须使用 Pixi/browser RAF 自动推进；不要把 Pixi player 改成 Cocos 那种只能由宿主每帧调用 `update(deltaSeconds)` 的模型。
- `init()` 必须加载纹理、校验真实 texture size、创建 per-layer display/particleDisplay。
- `seek(time)` 必须调用 core sampler，更新 layer state，重画粒子，更新 diagnostics。
- `destroy()` 必须 pause、cancel RAF、disconnect ResizeObserver、destroy particles、清理 diagnostics、destroy Pixi app。
- 继续按 layer 顺序 add child：`display`, `particleDisplay`, next layer `display`, next layer `particleDisplay`。
- 保留 stage fit/resize 逻辑。
- 保留 texture size mismatch 显式失败。
- 保留 `runtime_50` display compensation。
- 不要在 `vnicore` 里写 viewer UI 或 project selector。

diagnostics 建议升级到 VNI 命名：

```text
data-vni-project-id
data-vni-time
data-vni-visible-layers
data-vni-particle-sprites
data-vni-bundle-id
data-vni-profile-id
data-vni-asset-scale
data-vni-profile-purpose
data-vni-pixel-samples
data-vni-non-background-samples
data-vni-max-pixel-delta
data-vni-pixel-sample-error
```

如果为了兼容旧浏览器验收脚本同时保留 `data-v5g-*`，必须在 README 和测试中说明这是 legacy diagnostics alias，并确保 destroy 时新旧字段都清理。

### 6.4.1 播放区间和事件接口

任务 34 给 `packages/anieditorv5runtime-cc` 增加的播放控制接口在 `vnicore` 中同样是必做能力。`vnicore` 使用 Pixi/VNI 命名，但行为语义必须对齐。

建议新增类型：

```ts
export type VNIPlaybackRange =
  | { unit: "time"; start: number; end?: number }
  | { unit: "frame"; start: number; end?: number; fps: number };

export interface VNIPlayRangeOptions {
  range: VNIPlaybackRange;
  loop?: boolean;
}

export type VNIPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

export interface VNIPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface VNIPlaybackEventOptions {
  id: string;
  at: VNIPlaybackPoint;
  once?: boolean;
  listener: (event: VNIPlaybackEventContext) => void;
}

export interface VNIPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}
```

行为规则：

- `playRange(...)` 在 `init()` 后可调用；未初始化时必须显式失败，不做延迟排队。
- `playRange({ range: { unit: "time", start, end } })` 使用秒。
- `playRange({ range: { unit: "frame", start, end, fps } })` 使用 `frame / fps` 换算成秒。
- frame range 的 `fps` 必须显式传入，且必须是 finite positive number；不要默认 60fps，不要从 RAF 帧率猜测 fps。
- time range 的 `start`、`end` 必须是 finite number。
- frame range 的 `start`、`end` 必须是非负整数帧号。
- `end` 省略、`undefined` 或 `-1` 表示播放到 `project.stage.duration`，与当前 Cocos runtime 的 open-ended range 语义一致。
- 归一化后必须满足 `0 <= startTime < endTime <= project.stage.duration`。
- `playRange(...)` 应立即 `seek(startTime)`，然后进入播放状态。
- `loop` 未传时沿用当前 `setLoop(...)` 状态；传入时只影响本次 range 播放任务。
- 非循环 range 到达终点时，先 seek 到 `endTime`，再触发被跨过的 marker，最后停止播放、清空 active range 并触发 complete。
- 循环 range 到达终点时，应处理到终点的 marker，然后回到 `startTime` 继续播放；循环播放不触发 complete。
- 一次 RAF tick 或一次手动 `update(deltaSeconds)` 如果跨过多个 marker，必须按时间从小到大触发，不能因为大 delta 或跳帧漏事件。
- 如果一次推进跨过多圈循环，marker 应按每一圈的时间顺序触发，不能只触发最后一圈。
- marker 与播放终点同一时刻发生时，marker 必须先于 complete。
- `addPlaybackEvent(...)` 注册的是 project 时间轴上的绝对时间点；frame point 同样通过 `frame / fps` 转成绝对时间点。
- marker 时间必须满足 `0 <= time <= project.stage.duration`。
- marker `id` 必须是非空字符串且唯一；重复 id 直接抛错。
- `clearPlaybackEvent(id)` 找不到 id 时直接抛错，避免隐藏拼写错误。
- `clearPlaybackEvents()` 显式清空所有 marker。
- `addPlaybackEvent(...)` 返回的 disposer 可移除 marker；disposer 重复调用应幂等。
- `onPlaybackComplete(...)` 返回的 disposer 可移除 complete listener；disposer 重复调用应幂等。
- `once=true` 的 marker 触发后自动移除；建议先移除再调用 listener，避免 listener 抛错后下次重复触发。
- marker 只在播放推进跨过该时间点时触发；手动 `seek(...)`、`init()`、`restart()` 不触发 marker。
- `pause()` 只暂停播放，不清空 active range、marker 或 complete listener；`pause(); play();` 应恢复 active range。
- `restart()` 保持现有语义：清空 active range，seek 到 0；如果业务要重新播放同一段，应再次调用 `playRange(...)`。
- `destroy()` 必须停止播放并清理 active range、marker、complete listener、RAF 和 diagnostics，避免宿主页面销毁后遗留 callback。
- marker listener 和 complete listener 都同步调用；不要放到 Promise、microtask、`setTimeout` 或 RAF 之后延后执行。
- listener 抛出的错误必须继续向外抛出，不允许吞掉。

### 6.5 导出面

`packages/vnicore/src/core/index.ts` 导出：

- types
- `assertVNIProject`
- `validateVNIProject`
- `assertVNIBundleManifest`
- `validateVNIBundleManifest`
- `validateManifestProjectProfile`
- `parseColorHex`
- `sampleProjectAtTime`
- `sampleLayerAtTime`
- `sampleLayerAnimationsAtTime`
- `sampleParticleSpritesForLayer`
- `hasActiveParticleAnimation`
- `createAssetUrlManifest`
- `resolveProjectAssetUrls`
- 必要的 helper types

如果从旧函数名迁移，允许在初始版本中保留 `assertV5GProject` 等 alias，但主 README 和 viewer 新代码必须使用 `VNI` 名称。

`packages/vnicore/src/pixi/index.ts` 导出：

- `VNIPlayer`
- `VNIPlayerOptions`
- `VNIPlaybackRange`
- `VNIPlayRangeOptions`
- `VNIPlaybackPoint`
- `VNIPlaybackEventOptions`
- `VNIPlaybackEventContext`
- `VNIPlaybackCompleteContext`
- Pixi 相关 helper types，如需要

`packages/vnicore/src/index.ts` 导出：

- `./core`
- `./pixi`

不要从 root export 暴露测试 fake、viewer 内置资源、Cocos adapter 或 standalone 文件。

### 6.6 迁移 viewer

更新：

```text
apps/anieditorv5viewer/package.json
apps/anieditorv5viewer/vite.config.ts
apps/anieditorv5viewer/tsconfig.json
apps/anieditorv5viewer/src/main.ts
apps/anieditorv5viewer/src/config/bundled-projects.ts
apps/anieditorv5viewer/src/runtime/asset-manifest.ts 或 src/config/asset-url-modules.ts
apps/anieditorv5viewer/tests/runtime/*.test.ts
apps/anieditorv5viewer/README.md
```

`apps/anieditorv5viewer/package.json`：

- 新增依赖：

```json
"@slotclientengine/vnicore": "workspace:*"
```

- 如果 viewer 不再直接 import `pixi.js`，移除 viewer 自己的 `pixi.js` dependency。
- 新增或更新脚本：

```json
"prepare:deps": "pnpm --filter @slotclientengine/vnicore build",
"build": "pnpm run prepare:deps && vite build",
"dev": "pnpm run prepare:deps && sh -c 'if [ \"$1\" = \"--\" ]; then shift; fi; exec vite \"$@\"' sh",
"typecheck": "pnpm run prepare:deps && tsc -p tsconfig.json --noEmit"
```

测试可以通过 Vite alias 直接读 `packages/vnicore/src`，也可以先 build 再测；必须选择一种稳定方式并写入 package scripts。不要让本地空 `dist` 造成 typecheck/build 假失败。

`apps/anieditorv5viewer/vite.config.ts`：

- 增加 alias，参考 `apps/game001/vite.config.ts`、`apps/gameframeworksviewer/vite.config.ts`：

```ts
{
  find: "@slotclientengine/vnicore/core",
  replacement: resolve(__dirname, "../../packages/vnicore/src/core/index.ts"),
},
{
  find: "@slotclientengine/vnicore/pixi",
  replacement: resolve(__dirname, "../../packages/vnicore/src/pixi/index.ts"),
},
{
  find: "@slotclientengine/vnicore",
  replacement: resolve(__dirname, "../../packages/vnicore/src/index.ts"),
}
```

- 如果 dev server 需要跨 workspace 读源码，设置：

```ts
server: {
  host: "0.0.0.0",
  fs: {
    allow: [resolve(__dirname, "../..")],
  },
}
```

`apps/anieditorv5viewer/src/main.ts`：

- 从 `@slotclientengine/vnicore/pixi` 导入 `VNIPlayer`。
- 不再从 `./runtime/v5g-player` 导入 player。

`apps/anieditorv5viewer/src/config/bundled-projects.ts`：

- 从 `@slotclientengine/vnicore/core` 导入 assert/validate/manifest helpers/types。
- 保持内置 project list 不变。
- 保持 `export2` manifest profile 校验不变。
- 保持 profile-scoped asset URL manifest 不变。

清理：

- 如果 `apps/anieditorv5viewer/src/runtime` 迁移后只剩 Vite asset glob glue，可以保留。
- 如果 `apps/anieditorv5viewer/src/runtime` 已不再需要，删除该目录；不要留下 dead code。
- 如果删除目录后为空，不需要 `.keepme`，因为不需要保留空目录。
- `apps/anieditorv5viewer/src/v5g/types.ts` 应删除或改为从 `@slotclientengine/vnicore/core` re-export；优先删除，避免双份类型漂移。

### 6.7 测试迁移和新增覆盖

把当前 viewer runtime 测试迁移到 `packages/vnicore/tests`：

```text
apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts
apps/anieditorv5viewer/tests/runtime/asset-scale.test.ts
apps/anieditorv5viewer/tests/runtime/coordinates.test.ts
apps/anieditorv5viewer/tests/runtime/particle-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts
apps/anieditorv5viewer/tests/runtime/validation.test.ts
apps/anieditorv5viewer/tests/runtime/v5g-player.test.ts
```

迁移后 `packages/vnicore` 至少覆盖：

- schema/editor 接受 `V5G_0.x`、`VNI_0.x`。
- 非法 schema/editor 显式失败。
- `engineTarget` 当前契约。
- stage 尺寸、duration、backgroundColor 校验。
- duplicate asset id/path 显式失败。
- partial `fileWidth` / `fileHeight` / `fileScale` 显式失败。
- `exportProfile.assetScale` 与 asset `fileScale` 不一致显式失败。
- manifest duplicate id/path mismatch/profile mismatch 显式失败。
- unknown animation type/easing/blend mode 显式失败。
- required numeric param 缺失、NaN、Infinity、字符串数字显式失败。
- optional boolean 类型错误显式失败。
- `scale_up` / `scale_in` 首帧隐藏边界。
- 普通 animation 在结束帧稳定采样。
- particle animation 在 `time < start`、`time >= end`、`progress <= 0` 不渲染。
- `particles`、`particle_twinkle`、`particle_wall`、`particle_combo` 确定性采样。
- `particle_combo.sourceOpacity = 0` 时原图层隐藏但粒子仍出现。
- per-layer particleDisplay 顺序。
- `runtime_50` texture size 和 display compensation。
- `VNIPlayer.destroy()` 清理 RAF、ResizeObserver、particles、diagnostics。
- diagnostics 输出和清理。
- `playRange({ range: { unit: "time", start: 0, end: 0.4 }, loop: false })` 到 end 后停止并触发 complete。
- `playRange({ range: { unit: "time", start: 0.2, end: 0.6 }, loop: true })` 超过 end 后回到 start 区间，并保持 `play()` 恢复 active range。
- `playRange({ range: { unit: "frame", start: 30, end: 60, fps: 60 } })` 等价于 0.5 到 1 秒。
- `end` 省略、`undefined`、`-1` 都表示播放到 `project.stage.duration`。
- frame range 缺少 `fps`、`fps <= 0`、非整数帧号、非法 range 边界都显式失败。
- 时间 marker 和帧 marker 在大 delta 跨过时不会漏触发。
- 同一 delta 跨过多个 marker 时顺序正确；循环跨多圈时每圈 marker 都触发。
- marker 与 end 同时发生时，marker 先于 complete。
- `once=true` marker 触发后自动移除。
- disposer 能移除 marker 和 complete listener。
- 手动 `seek(...)`、`init()`、`restart()` 不触发 marker；`pause()` 后推进不触发 marker。
- marker/complete listener 抛错会向外传播。
- 全时长非循环 `play()` 到 `project.stage.duration` 也触发 complete。

`apps/anieditorv5viewer` 测试保留 app 层覆盖：

- 内置 project 列表完整。
- 所有 bundled project asset URL 都能 resolve。
- `export2` profile asset URL 仍然 scoped，不被全局 map 污染。
- Vite JSON/assets import 配置覆盖 nested assets。
- `main.ts` 能初始化 `VNIPlayer`，项目切换会 destroy 旧 player。

如果测试导致一些奇怪写法，就修改测试，不要改不该改的生产逻辑，以免后续出现问题难查。

## 7. fail-fast 契约

不允许：

- 忽略未知 animation type。
- 忽略未知 easing。
- 忽略未知 blend mode。
- 缺少资源时渲染占位图。
- 缺少必须 numeric param 时使用默认值继续播放。
- 把导出 JSON 里的 numeric param 字符串当数字解析后继续播放。
- 贴图尺寸不匹配时继续播放。
- `manifest` 与 `project.exportProfile` 不一致时继续播放。
- `edit_full` 与 `runtime_50` 使用同一个全局 `asset.path -> url` map。
- 为了覆盖率把核心实现文件排除出 coverage。
- 为了测试通过在生产逻辑里写奇怪分支。

允许：

- 对已经定义为可选的 boolean 参数使用导出契约默认值，例如 `fadeOut` 缺省可视为 `true`。
- 对粒子数量、速度、尺寸等已存在的 numeric param 做范围 clamp，防止极端值炸掉浏览器；但 param 缺失仍要显式失败。
- 保留 legacy schema alias，但必须测试并文档化，不允许把 alias 当作隐藏 fallback。

原则：有些逻辑 bug 越早暴露越好，不要加不必要兜底。

## 8. 文档和协作规则

必须更新：

```text
packages/vnicore/README.md
packages/vnicore/docs/usage-zh.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/migration-from-viewer-zh.md
packages/vnicore/examples/README.md
packages/vnicore/examples/basic-player.ts
packages/vnicore/examples/playback-events.ts
packages/vnicore/examples/validate-project.ts
packages/vnicore/examples/vite-asset-manifest.ts
apps/anieditorv5viewer/README.md
agents.md
```

`packages/vnicore/README.md` 必须说明：

- 包定位：Pixi.js v8 VNI runtime core。
- 与 `packages/anieditorv5runtime-cc` 的区别。
- public import 示例。
- 支持 schema、animation、particle、asset metadata、bundle manifest。
- fail-fast 不支持项。
- `docs/` 和 `examples/` 入口链接。
- 覆盖率要求和命令。

`packages/vnicore/docs/*.md` 必须是中文，并且可以脱离本聊天上下文阅读。不要只写“见 viewer 实现”；必须写清楚 public API、生命周期、资源 manifest、错误边界和迁移边界。

`packages/vnicore/examples/*.ts` 必须和当前 public API 一起维护，不能是伪代码。示例里如果需要简化数据，必须用最小合法对象或函数参数，而不是使用生产代码不接受的假数据。

`apps/anieditorv5viewer/README.md` 必须说明：

- viewer 基于 `@slotclientengine/vnicore`。
- app 内仍然负责 bundled assets 和 project selector。
- 运行/测试/构建命令。
- 浏览器验收关注的 diagnostics。

`agents.md` 建议加入目录约定：

```text
- `packages/vnicore`：Pixi.js v8 VNI 动画核心库，供 `apps/anieditorv5viewer` 等 Pixi 运行时使用；不要与 `packages/anieditorv5runtime-cc` 的 Cocos Creator runtime 混用。
```

如果协作规则措辞与实际实现略有不同，以最终代码为准，但必须把 `vnicore` 与 Cocos runtime 的边界写清楚。

## 9. 验收命令

从仓库根目录执行：

```bash
node -v
pnpm -v
git status --short
```

安装依赖：

```bash
pnpm install
```

如果下载失败：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

vnicore 单包验收：

```bash
pnpm --filter @slotclientengine/vnicore typecheck
pnpm --filter @slotclientengine/vnicore lint
pnpm --filter @slotclientengine/vnicore examples:typecheck
pnpm --filter @slotclientengine/vnicore test
pnpm --filter @slotclientengine/vnicore build
pnpm --filter @slotclientengine/vnicore format:check
```

`pnpm --filter @slotclientengine/vnicore test` 必须因为 coverage thresholds 强制保证：

```text
lines >= 80
functions >= 80
branches >= 80
statements >= 80
```

viewer 验收：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
pnpm --filter anieditorv5viewer format:check
```

根级回归验收：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

diff hygiene：

```bash
git diff --check
git status --short
```

如果某条根级命令因为仓库既有无关问题失败，不能直接忽略；必须在任务报告中记录：

- 命令。
- 失败摘要。
- 是否与本任务改动相关。
- 已执行的更小范围替代验证。

## 10. 浏览器验收

启动 viewer：

```bash
pnpm --dir apps/anieditorv5viewer dev --host 0.0.0.0 --port 5175
```

打开：

```text
http://127.0.0.1:5175
```

浏览器验收必须覆盖：

- 默认项目能渲染。
- project selector 能切换全部 bundled projects。
- `multipay` 在粒子活动时间点有 `particle_combo` 粒子。
- `bigwin-runtime-50` 能用 50% 文件像素按原始逻辑尺寸显示。
- `bigwin-edit-full` 与 `bigwin-runtime-50` 的 shared `asset.path` 不互相污染。
- 项目切换后页面只保留一个 canvas，旧 player 已 destroy。
- 控制台无未处理异常。
- diagnostics dataset 证明当前渲染的是预期 bundle/profile。

建议在浏览器控制台记录：

```js
const mount = document.querySelector(".stage-mount");
mount?.dataset;
document.querySelectorAll("canvas").length;
```

如果使用新 diagnostics，任务报告至少记录：

```text
data-vni-project-id
data-vni-time
data-vni-visible-layers
data-vni-particle-sprites
data-vni-bundle-id
data-vni-profile-id
data-vni-asset-scale
data-vni-profile-purpose
data-vni-non-background-samples
data-vni-max-pixel-delta
```

如果保留旧 `data-v5g-*`，也要记录新旧字段是否一致。

验收完成后停止 dev server，不要留下仍在运行的长期进程。

## 11. 任务报告要求

任务完成后新增：

```text
tasks/39-vnicore-bootstrap-[utctime].md
```

报告必须包含：

- 任务摘要。
- 新增/修改/删除文件列表。
- `packages/vnicore` public API 和 subpath exports。
- `playRange`、marker、complete listener 等任务 34 同级播放接口的实现和测试结果。
- 与 `packages/anieditorv5runtime-cc` 的边界说明。
- 文档和示例清单，说明每个文档/示例解决什么问题。
- viewer 如何改为依赖 `@slotclientengine/vnicore`。
- 是否更新 `agents.md`，如果没有更新必须说明原因。
- `pnpm-lock.yaml` 是否变化。
- vnicore coverage 结果，必须贴出 lines/functions/branches/statements。
- 所有验收命令和结果。
- 浏览器验收记录，包含项目、profile、diagnostics、canvas 数量。
- 若有失败或跳过，说明原因、影响、后续处理建议。
- 第二遍遗漏检查结果。

报告文件名示例：

```bash
UTC_TIME="$(date -u +%y%m%d-%H%M%S)"
REPORT="tasks/39-vnicore-bootstrap-${UTC_TIME}.md"
```

## 12. 第二遍遗漏检查

交付前必须逐项检查：

- `packages/vnicore` 是否在 workspace 中被 pnpm 识别。
- `@slotclientengine/vnicore` exports 是否与 `dist` 输出一致。
- `dist` 是否由 build 生成，不要手写。
- coverage threshold 是否真的在配置里，而不是只写在 README。
- `packages/vnicore/docs/*.md` 是否覆盖 usage、API 和 viewer 迁移。
- `packages/vnicore/examples/*.ts` 是否通过 `examples:typecheck`，且没有依赖 viewer 私有路径。
- viewer 是否没有继续 import `./runtime/v5g-player`、`./runtime/animation-sampler` 等已迁移核心模块。
- viewer 是否没有双份 VNI/V5G type 定义漂移。
- `apps/anieditorv5viewer/src/assets` 是否仍被 Vite、Prettier、TS 配置正确排除或包含。
- `export2` `edit_full` / `runtime_50` asset URL manifest 是否仍 profile-scoped。
- `runtime_50` texture file size 校验是否仍用 `fileWidth` / `fileHeight`。
- `particle_combo.sourceOpacity = 0` 是否仍隐藏原图层但显示粒子。
- `progress <= 0` 粒子是否仍不渲染。
- `destroy()` 是否清理 RAF、ResizeObserver、particles、diagnostics。
- browser 验收是否切换过 `multipay`、`bigwin-edit-full`、`bigwin-runtime-50`。
- `agents.md` 是否记录了 `packages/vnicore` 边界。
- 中文任务报告是否已写入 `tasks/`，命名是否使用 UTC。
- `git diff --check` 是否通过。
- `git status --short` 是否只包含本任务预期改动和用户已有改动。

满足以上检查后，才算本任务完成。
