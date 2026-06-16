# anieditorv5viewer bootstrap 任务计划

## 1. 任务目标

新增可运行项目 `apps/anieditorv5viewer`，用于渲染 `docs/anieditor5/export/project.json` 中的 victory editor v5 动画，并把 `docs/anieditor5/export/assets` 里的图片资源复制到 viewer 自己的 assets 目录下使用。

本计划是完整可执行版本，不依赖其它上下文。执行者只需要阅读本文件，即可完成需求分析、项目初始化、V5G JSON 解析、Pixi 渲染、时间采样、测试、浏览器验收和任务报告。

核心目标：

- 新增 `apps/anieditorv5viewer` Vite + TypeScript + Pixi.js 项目。
- 读取并渲染 `docs/anieditor5/export/project.json`。
- 复制并加载 `docs/anieditor5/export/assets` 里的图片资源。
- 按 editor v5 的中心坐标系、图层顺序、混合模式、锚点、透明度、负缩放镜像和动画时间线规则渲染。
- 提供可播放、暂停、重播、循环、拖动时间轴预览的 viewer。
- 对当前导出样例完成浏览器可视化验收，确认动画真实渲染出来。
- 不做不必要兜底；项目 JSON、资源、动画类型或参数不合法时显式失败，方便尽早暴露逻辑问题。
- 如果现有测试阻碍正确实现，应修改测试表达新合同，不要为了通过测试改坏生产逻辑。
- 完成后新增中文任务报告：`tasks/29-anieditorv5viewer-bootstrap-[utctime].md`，`utctime` 使用 UTC 年月日时分秒，例如 `260401-181300`。
- 如果任务影响仓库协作规则、目录规范或基础脚本，需要同步更新根目录 `agents.md`；如果没有影响，在任务报告中明确说明无需更新。

## 2. 当前仓库事实

仓库事实：

- 仓库根目录：`/Users/zerro/github.com/slotclientengine`。
- 根仓库是 `pnpm` + `turbo` TypeScript monorepo。
- Node.js 要求：`>=24.0.0`。
- pnpm 要求：`>=10.0.0`。
- workspace 配置：`pnpm-workspace.yaml` 包含 `apps/*` 和 `packages/*`，因此新增 `apps/anieditorv5viewer/package.json` 后会自动进入 workspace。
- 前端构建使用 `vite`。
- 测试使用 `vitest`。
- lint 使用 `eslint`。
- 格式化使用 `prettier`。
- 根目录协作文件路径是 `agents.md`。
- 新增空目录必须放 `.keepme`；本任务会新增有内容的目录，通常不需要 `.keepme`。
- 若依赖下载失败，先执行：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
```

当前参考实现与数据：

- `docs/anieditor5/src/types.ts` 定义了 V5G JSON 结构。
- `docs/anieditor5/src/coordinates.ts` 定义中心坐标系转换：
  - editor x 向右为正。
  - editor y 向上为正。
  - Pixi x = `stage.width / 2 + x`。
  - Pixi y = `stage.height / 2 - y`。
- `docs/anieditor5/src/animation_presets.ts` 定义动画采样算法。
- `docs/anieditor5/src/main.ts` 的 `applyAnimatedLayersAtTime()` 定义预览层在当前时间不被动画覆盖时隐藏的规则。
- `docs/anieditor5/src/pixi_stage.ts` 定义 editor 的 Pixi 图层构造、图层顺序、锚点、变换、透明度和混合模式使用方式。
- `docs/anieditor5/export/project.json` 是本任务必须渲染的样例数据。
- `docs/anieditor5/export/assets` 是本任务必须复制并加载的图片资源目录。

现有可参考 app：

- `apps/victoryani-demo` 是 Vite + Pixi.js + GSAP 项目，可参考 package、tsconfig、vite、eslint、测试和 UI 组织方式。
- 但 `victoryani-demo` 渲染的是旧 victory 导出结构；本任务的运行时语义必须以 `docs/anieditor5` 为准，不要把旧项目格式硬套到 V5G。

## 3. 导出样例事实

`docs/anieditor5/export/project.json` 当前样例摘要：

- `schemaVersion`: `V5G_0.0014`。
- `editor.name`: `victory_editor_v5_g`。
- `engineTarget.name`: `cocos_creator`。
- `engineTarget.version`: `3.8.6`。
- `name`: `胜利测试`。
- 舞台：
  - `width`: `1600`。
  - `height`: `1600`。
  - `coordinate`: `center`。
  - `duration`: `10` 秒。
  - `backgroundColor`: `#101827`。
- 资源数量：4。
- 图层数量：5。
- 粒子数量：0。
- 当前所有图层都是 `image`。
- 当前所有 `keyframes` 都为空数组。
- 当前 `particles` 为空数组。
- 使用到的混合模式：
  - `normal`。
  - `add`。
- 使用到的动画类型：
  - `move`。
  - `fade`。
  - `scale_up`。
  - `scale_down`。
  - `rotate`。
- 样例包含负 `scaleX`，用于飞机左侧镜像；渲染时必须保留负缩放符号。

当前资源：

- `docs/anieditor5/export/assets/epic_asset_image_mq6i4x4l_a.png`
- `docs/anieditor5/export/assets/effect2_asset_image_mq6j09f0_k.png`
- `docs/anieditor5/export/assets/effect1_asset_image_mq6m8cly_4.png`
- `docs/anieditor5/export/assets/image_asset_image_mqasjj80_3.png`

注意版本差异：

- `docs/anieditor5/src/constants.ts` 当前常量是 `V5G_0.0041`。
- 导出样例是 `V5G_0.0014`。
- viewer 不应只接受当前 editor 常量版本，否则无法渲染现有样例。
- 初始兼容策略：显式支持 `schemaVersion` 形如 `V5G_0.x` 且 `editor.name === "victory_editor_v5_g"` 的 V5G 项目；如果遇到其它 major 或其它 editor name，抛出清晰错误。

## 4. 技术合同

### 4.1 项目边界

本任务要做：

- 新增 `apps/anieditorv5viewer`。
- 复制当前 V5G 导出 JSON 和图片资源。
- 实现当前导出样例需要的 V5G 运行时。
- 对 V5G 类型、坐标、动画采样、项目采样、资源加载和渲染入口写测试。
- 启动 dev server 并用浏览器确认动画不为空、能播放、时间轴可拖动。

本任务不做：

- 不改 `docs/anieditor5` 编辑器代码，除非发现任务必须修复的明确 bug；如果改了，必须在报告里解释原因。
- 不实现编辑器功能。
- 不实现导出 ZIP 导入。
- 不实现 Cocos Creator 导出。
- 不实现粒子系统，因为当前样例 `particles` 为空；如果项目中出现非空 `particles`，初版 viewer 必须显式报错。
- 不实现 keyframe 插值，因为当前样例 `keyframes` 为空且 editor 当前预览路径没有使用 keyframes；如果图层出现非空 `keyframes`，初版 viewer 必须显式报错。
- 不对未知资源、未知图层类型、未知动画类型、未知混合模式做静默占位或自动降级。

### 4.2 资源复制合同

目标路径：

```text
apps/anieditorv5viewer/src/assets/project.json
apps/anieditorv5viewer/src/assets/assets/epic_asset_image_mq6i4x4l_a.png
apps/anieditorv5viewer/src/assets/assets/effect2_asset_image_mq6j09f0_k.png
apps/anieditorv5viewer/src/assets/assets/effect1_asset_image_mq6m8cly_4.png
apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqasjj80_3.png
```

复制要求：

- `project.json` 内容从 `docs/anieditor5/export/project.json` 原样复制。
- 图片资源从 `docs/anieditor5/export/assets` 原样复制。
- 保留 JSON 中的 `asset.path`，例如 `assets/epic_asset_image_mq6i4x4l_a.png`。
- viewer 通过资源 manifest 把 JSON 里的 `asset.path` 映射到 Vite 打包后的 URL。
- 推荐使用 `import.meta.glob("./assets/assets/*", { eager: true, query: "?url", import: "default" })` 建立 manifest。
- manifest key 统一规范为 `assets/<filename>`，必须能和 JSON 中的 `asset.path` 精确匹配。
- 如果 JSON 引用了不存在的资源，直接抛错，不渲染 missing box。

### 4.3 V5G schema 合同

新增 app 内类型文件，类型来源参考 `docs/anieditor5/src/types.ts`。

必须支持字段：

- `schemaVersion`
- `editor.name`
- `editor.version`
- `engineTarget.name`
- `engineTarget.version`
- `name`
- `stage.width`
- `stage.height`
- `stage.coordinate`
- `stage.duration`
- `stage.backgroundColor`
- `assets[]`
- `layers[]`
- `particles[]`

必须支持图层字段：

- `id`
- `name`
- `type`
- `assetId`
- `parentId`
- `visible`
- `locked`
- `transform`
- `opacity`
- `blendMode`
- `text`
- `animations`
- `keyframes`

必须支持 transform 字段：

- `x`
- `y`
- `scaleX`
- `scaleY`
- `rotation`
- `anchorX`
- `anchorY`

校验规则：

- `stage.coordinate` 初版只允许 `center`。
- `stage.width`、`stage.height`、`stage.duration` 必须是正数。
- `backgroundColor` 必须是 `#RRGGBB` 或明确可解析的十六进制颜色；不合法直接报错。
- `asset.id` 必须唯一。
- `asset.path` 必须唯一并能解析到已复制资源。
- `asset.width`、`asset.height` 必须是正数；图片加载后如果实际纹理尺寸与 JSON 记录不一致，应显式报错并包含 asset id/path。
- `layer.id` 必须唯一。
- `layer.type` 初版支持 `image` 和 `text`；当前样例只要求 `image`。
- `layer.type === "image"` 时 `assetId` 必须指向存在的 image asset。
- `layer.type === "text"` 时允许 `assetId === null`，使用 Pixi Text 渲染。
- `layer.type === "group"` 初版不支持；遇到时抛出 `Unsupported V5G layer type: group`。
- `parentId !== null` 初版不支持嵌套；遇到时抛出清晰错误。
- `transform.x/y/scaleX/scaleY/rotation/anchorX/anchorY` 必须是有限 number；`anchorX/anchorY` 初版要求在 `0..1`。
- `opacity` 必须是 `0..1` 的有限 number。
- `animation.startTime` 必须是有限 number 且 `>= 0`。
- `animation.duration` 必须是有限 number 且 `> 0`。
- `animation.startTime + animation.duration` 必须 `<= stage.duration`；editor 会把项目总时长扩展到最长动画结束点，导出数据若不满足应视为数据错误，不在 viewer 里静默修正。
- `animation.params.easing` 如果存在，必须是支持列表中的 easing；未知 easing 直接报错，不要按 linear 兜底。
- `particles.length > 0` 初版不支持；遇到时抛出清晰错误。
- 任意图层 `keyframes.length > 0` 初版不支持；遇到时抛出清晰错误。
- 未知动画类型直接报错，不要跳过。
- 未知混合模式直接报错，不要映射为 normal。

### 4.4 时间线和动画采样合同

运行时不要依赖隐藏的 tween 状态作为唯一事实来源。应实现确定性的纯函数采样器：

```ts
sampleLayerAnimationsAtTime(base, animations, time)
sampleProjectAtTime(project, time)
```

采样行为以 `docs/anieditor5/src/animation_presets.ts` 和 `docs/anieditor5/src/main.ts` 为准：

- 对每个图层，从图层基础 `transform` 和基础 `opacity` 开始。
- 动画按 `startTime` 升序处理。
- `enabled === false` 的动画忽略。
- `time < startTime` 时该动画不参与。
- `time >= startTime + duration` 时该动画 progress 为 `1`。
- `startTime <= time < startTime + duration` 时 progress 为 `(time - startTime) / duration`。
- duration 至少按 `0.0001` 防止除零；但 schema 层应把 duration <= 0 当作错误，除非后续明确需要瞬时动画。
- easing 支持：
  - `linear`
  - `easeInQuad`
  - `easeOutQuad`
  - `easeInOutQuad`
  - `backOut`
- 未知 easing 视为导出数据错误，必须在 validation 阶段报错；不要沿用 `easeProgress()` 的默认 linear 行为来掩盖问题。
- 参数缺失不应静默猜测成正确数据；对当前支持的动画类型，必需参数缺失或类型错误时应抛错。只有 editor 明确有默认语义且计划中写明的字段可以使用默认值。

必须实现的动画类型：

- `move`
  - `x = base.x + lerp(fromX, toX, progress) - baseX`
  - `y = base.y + lerp(fromY, toY, progress) - baseY`
  - `baseX` 缺失时沿用 editor 逻辑，默认 `fromX`。
  - `baseY` 缺失时沿用 editor 逻辑，默认 `fromY`。
- `fade`
  - `opacity = lerp(fromOpacity, toOpacity, progress)`。
- `scale_up`
  - `scaleX = sign(base.scaleX) * abs(lerp(fromScaleX, toScaleX, progress))`。
  - `scaleY = sign(base.scaleY) * abs(lerp(fromScaleY, toScaleY, progress))`。
  - 必须保持负缩放镜像。
- `scale_down`
  - 与 `scale_up` 相同采样公式。
- `rotate`
  - `rotation = base.rotation + lerp(fromRotation, toRotation, progress)`。

初版建议同时移植并测试但样例不强依赖的动画类型：

- `slide_in`
- `slide_out`
- `bounce_in`
- `pulse`
- `float`
- `swing`

如果实现这些可选动画，公式应与 editor 保持一致：

- `slide_in/slide_out`：
  - `x = base.x + lerp(fromX, toX, progress)`。
  - `y = base.y + lerp(fromY, toY, progress)`。
  - `slide_in && fadeIn` 时 `opacity = lerp(0, base.opacity, progress)`。
  - `slide_out && fadeOut` 时 `opacity = lerp(base.opacity, 0, progress)`。
- `bounce_in`：
  - `ratio = backOutProgress(progress, overshoot)`。
  - `scaleRatio = max(0, lerp(fromScale, toScale, ratio))`。
  - `scaleX = base.scaleX * scaleRatio`。
  - `scaleY = base.scaleY * scaleRatio`。
  - `fadeIn` 时 `opacity = lerp(0, base.opacity, clamp(progress * 1.25, 0, 1))`。
- `pulse`：
  - `cycle = (1 - cos(progress * PI * 2 * cycles)) / 2`。
  - `scaleX = base.scaleX * lerp(1, scale, cycle)`。
  - `scaleY = base.scaleY * lerp(1, scale, cycle)`。
- `float`：
  - `y = base.y + sin(progress * PI * 2 * cycles) * amplitude`。
- `swing`：
  - `rotation = base.rotation + sin(progress * PI * 2 * cycles) * angle`。
- `backOutProgress(progress, overshoot)`：
  - `t = clamp(progress, 0, 1)`。
  - `c1 = max(0, overshoot)`。
  - `c3 = c1 + 1`。
  - `return 1 + c3 * (t - 1)^3 + c1 * (t - 1)^2`。

图层显示/隐藏规则：

- 如果一个图层没有任何启用动画，则按基础 transform、基础 opacity 和 `layer.visible` 渲染。
- 如果一个图层有至少一个启用动画，但当前 `time` 不在任何启用动画的覆盖范围内，则该图层有效 opacity 为 `0`。
- 覆盖范围判断使用 editor 逻辑：`time >= startTime && time <= startTime + duration`。
- 这条规则是关键：它避免动画开始前图层已经出现在画布中，也会让动画段之间的空档隐藏。
- `layer.visible === false` 时无论采样结果如何都不可见。

取样结果整理：

- `x`、`y`、`scaleX`、`scaleY`、`rotation` 统一 round 到 4 位小数。
- `opacity` clamp 到 `0..1` 后 round 到 4 位小数。
- `time` 应 clamp 到 `0..stage.duration`，手动拖动时间轴和播放都使用同一条采样路径。

### 4.5 Pixi 渲染合同

渲染器要求：

- 使用 `pixi.js`，版本与现有 Pixi app 保持一致，建议 `^8.1.6`。
- 不需要 GSAP；本任务的 V5G 播放用 requestAnimationFrame + 纯函数采样即可，避免 tween 状态和 editor 采样规则分叉。
- Pixi Application 背景色来自 `project.stage.backgroundColor`。
- 舞台逻辑尺寸来自 `project.stage.width` 和 `project.stage.height`。
- viewer 容器 resize 时保持完整舞台可见，居中等比适配。
- 可提供缩放/适配但不影响 V5G 坐标采样。
- display list 顺序使用 `project.layers` 原始顺序；后面的图层后 addChild，因此绘制在前面图层之上。这与 `docs/anieditor5/src/pixi_stage.ts` 的 `syncLayers()` 行为一致。

图层渲染：

- `image`：
  - 根据 `assetId` 找 asset。
  - 根据 asset.path 通过 manifest 找 URL。
  - 使用 `PIXI.Assets.load` 或等价 Pixi v8 加载方式。
  - 创建 Sprite。
  - 设置 `sprite.anchor.set(anchorX, anchorY)`。
  - 图片加载失败或纹理尺寸与 JSON `asset.width/height` 不一致时显式失败。
- `text`：
  - 使用 Pixi Text。
  - 初版样式可接近 editor：白字、粗体、暗描边、阴影。
  - 当前样例没有 text 图层，测试可以覆盖基本渲染实例创建。
- transform：
  - `position` 使用中心坐标转换。
  - `scale` 使用 sampled scaleX/scaleY，保留负值。
  - `rotation` 从度转换为弧度。
  - `alpha` 使用 sampled opacity。
  - `visible` 同时受 `layer.visible` 和有效 opacity 影响。
- blendMode：
  - `normal`
  - `add`
  - `screen`
  - `multiply`
  - `lighten`
  - 未知值抛错。

UI 要求：

- 首屏就是 viewer，不要做 landing page。
- 页面结构建议：
  - 全屏舞台区域。
  - 顶部或底部轻量控制条。
  - 控制包含 play/pause、restart、loop toggle、时间文本、range 时间轴。
  - 可显示项目名、当前时间、总时长、图层数、动画类型列表。
- UI 文案保持简洁，不要把实现说明铺在界面上。
- 画布和控制条不能互相遮挡到无法操作。

## 5. 目标目录结构

新增或修改文件建议如下：

```text
apps/anieditorv5viewer/
  README.md
  eslint.config.cjs
  index.html
  package.json
  tsconfig.eslint.json
  tsconfig.json
  vite.config.ts
  src/
    assets/
      project.json
      assets/
        epic_asset_image_mq6i4x4l_a.png
        effect2_asset_image_mq6j09f0_k.png
        effect1_asset_image_mq6m8cly_4.png
        image_asset_image_mqasjj80_3.png
    config/
      bundled-project.ts
    runtime/
      animation-sampler.ts
      asset-manifest.ts
      blend-mode.ts
      coordinates.ts
      layer-instance.ts
      project-sampler.ts
      validation.ts
      v5g-player.ts
    ui/
      controls.ts
    v5g/
      types.ts
    main.ts
    styles.css
    vite-env.d.ts
  tests/
    runtime/
      animation-sampler.test.ts
      asset-manifest.test.ts
      coordinates.test.ts
      project-sampler.test.ts
      validation.test.ts
    setup.ts
```

说明：

- `src/v5g/types.ts` 从 `docs/anieditor5/src/types.ts` 移植必要类型，不从 docs 目录直接 import。
- `src/runtime/animation-sampler.ts` 移植并收敛 editor 动画采样逻辑。
- `src/runtime/project-sampler.ts` 实现每个时间点的项目级采样和隐藏规则。
- `src/runtime/validation.ts` 集中做 fail-fast 校验。
- `src/runtime/asset-manifest.ts` 负责 Vite asset URL manifest 与 JSON asset.path 映射。
- `src/runtime/v5g-player.ts` 负责 Pixi Application、图层实例、播放循环和 resize。
- `src/ui/controls.ts` 只负责 viewer 控件，不参与采样逻辑。

## 6. 实施步骤

### 6.1 初始化 app

1. 新建 `apps/anieditorv5viewer`。
2. 参考 `apps/victoryani-demo` 创建：
   - `package.json`
   - `tsconfig.json`
   - `tsconfig.eslint.json`
   - `vite.config.ts`
   - `eslint.config.cjs`
   - `index.html`
   - `src/main.ts`
   - `src/styles.css`
   - `src/vite-env.d.ts`
   - `tests/setup.ts`
3. `package.json` 建议：

```json
{
  "name": "anieditorv5viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "vite build",
    "dev": "vite",
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

4. `tsconfig.json` 必须继承 `../../tsconfig.base.json`，并保留或覆盖以下关键能力：
   - `module: "ESNext"`。
   - `moduleResolution: "Bundler"`。
   - `lib` 包含 `DOM`。
   - `types` 包含 `node`、`vite/client`、`vitest/globals`。
   - 根 `tsconfig.base.json` 已开启 `resolveJsonModule`，不要关闭它，否则 `src/assets/project.json` import 会失败。
   - `include` 至少覆盖 `src/**/*.ts`、`src/**/*.d.ts`、`tests/**/*.ts`、`vite.config.ts`、`eslint.config.cjs`；如果实现中直接类型检查 JSON import 受阻，再显式加入 `src/**/*.json`。
5. `vite.config.ts` 必须：
   - 使用 `defineConfig`。
   - `base: "./"`，保证 build 后静态资源相对路径可用。
   - dev server `host: "0.0.0.0"`。
   - vitest 使用 `environment: "node"`。
   - coverage 排除 `src/main.ts`、`src/styles.css`、`src/vite-env.d.ts`、`vite.config.ts`、`eslint.config.cjs`、`tests/setup.ts` 和复制进来的图片/JSON 资源。
6. `eslint.config.cjs` 和 `tsconfig.eslint.json` 参考 `apps/victoryani-demo`，不要引入和仓库基础工具链版本不一致的新配置风格。
7. 不新增根脚本，除非有明确需要。
8. 因为 `pnpm-workspace.yaml` 已覆盖 `apps/*`，不需要改 workspace。

### 6.2 复制导出资源

1. 创建 `apps/anieditorv5viewer/src/assets`。
2. 复制：
   - `docs/anieditor5/export/project.json` 到 `apps/anieditorv5viewer/src/assets/project.json`。
   - `docs/anieditor5/export/assets/*` 到 `apps/anieditorv5viewer/src/assets/assets/`。
3. 不修改 JSON 内容来适配代码；代码应适配 JSON 中已有 `asset.path`。
4. 如需生成 manifest，manifest key 必须保持和 JSON `asset.path` 一致。
5. 复制后执行资源审计：

```bash
find apps/anieditorv5viewer/src/assets -maxdepth 3 -type f | sort
jq -r '.assets[].path' apps/anieditorv5viewer/src/assets/project.json | sort
```

6. 资源审计必须确认 JSON 中 4 个 `asset.path` 都有对应文件。

### 6.3 移植 V5G 类型与校验

1. 从 `docs/anieditor5/src/types.ts` 移植 V5G 类型到 `src/v5g/types.ts`。
2. 在 `src/runtime/validation.ts` 实现：
   - `assertV5GProject(value): V5GProjectConfig`
   - `validateV5GProject(project): void`
   - `parseColorHex(value): number`
   - `assertSupportedLayer(layer)`
   - `assertSupportedAnimation(animation)`
3. 先用当前样例写测试，再实现校验。
4. 对不支持的内容显式抛错，不做占位渲染。

### 6.4 实现坐标和采样纯函数

1. 从 `docs/anieditor5/src/coordinates.ts` 移植：
   - `editorToPixi`
   - `pixiToEditor`
   - `clampNumber`
   - `roundTo`
2. 从 `docs/anieditor5/src/animation_presets.ts` 移植采样逻辑到 `src/runtime/animation-sampler.ts`。
3. 在 `src/runtime/project-sampler.ts` 实现：
   - `sampleProjectAtTime(project, time)`
   - `sampleLayerAtTime(layer, time)`
   - 图层时间覆盖范围判断。
   - 动画区间外隐藏规则。
4. 用测试固定以下场景：
   - t 在动画开始前，图层有启用动画时 opacity 为 0。
   - t 在动画开始边界时可见。
   - t 在动画结束边界时可见并取结束态。
   - t 超过所有动画覆盖范围后 opacity 为 0。
   - move 使用 `baseX/baseY` 的偏移语义。
   - fade clamp 到 `0..1`。
   - scale 对负 `scaleX` 保持负号。
   - rotate 使用度数采样，渲染层再转弧度。
   - 多个动画同一时间覆盖时按 startTime 顺序应用。
   - 未知 easing 抛错。
   - 动画结束时间超过 `stage.duration` 抛错。

### 6.5 实现资源加载与 Pixi player

1. 在 `src/runtime/asset-manifest.ts` 使用 `import.meta.glob` 读取复制后的图片资源。
2. 在 `src/config/bundled-project.ts` import `project.json` 和 asset manifest。
3. 在 `src/runtime/layer-instance.ts` 建立 layer id 到 Pixi DisplayObject 的映射。
4. 在 `src/runtime/v5g-player.ts` 实现：
   - 初始化 Pixi Application。
   - 加载所有 `project.assets` 对应图片。
   - 创建所有 layer display。
   - 按 `project.layers` 原始顺序 addChild。
   - `seek(time)`：调用 `sampleProjectAtTime` 并同步所有 display 状态。
   - `play()`：requestAnimationFrame 驱动，按 wall clock 推进时间。
   - `pause()`。
   - `restart()`。
   - `setLoop(loop)`。
   - `destroy()`。
   - resize 适配舞台。
5. 纹理加载阶段必须校验实际尺寸，确保 `texture.width/height` 与 asset config 一致。
6. `seek()` 是唯一修改图层视觉状态的入口，play 和拖动时间轴都必须走 `seek()`。

### 6.6 实现 viewer UI

1. `src/main.ts`：
   - 读取 bundled project。
   - 校验项目。
   - 初始化 player。
   - 绑定 UI 控件。
   - 发生错误时在页面明确显示错误，并在 console 抛出/记录完整错误。
2. `src/ui/controls.ts`：
   - play/pause。
   - restart。
   - loop checkbox。
   - range timeline，min 0，max `stage.duration`，step 0.01。
   - 当前时间 / 总时长。
   - 项目名和基本统计。
3. `src/styles.css`：
   - 做实际 viewer，不做 landing page。
   - 画布区域优先，控制条简洁。
   - 确保桌面和较窄视口下文字不溢出、不遮挡控制。

### 6.7 文档

新增 `apps/anieditorv5viewer/README.md`，至少包含：

- 这个 viewer 渲染的来源：`docs/anieditor5/export/project.json`。
- 资源复制位置。
- 支持的 V5G 字段和当前不支持项。
- 本地运行命令。
- 验收命令。
- fail-fast 说明：缺资源、未知动画、未知图层等直接报错。

## 7. 测试计划

### 7.1 单元测试

新增测试：

- `apps/anieditorv5viewer/tests/runtime/coordinates.test.ts`
  - 中心坐标转换。
  - y 轴方向转换。
- `apps/anieditorv5viewer/tests/runtime/animation-sampler.test.ts`
  - easing。
  - move。
  - fade。
  - scale_up/scale_down。
  - negative scale sign。
  - rotate。
  - disabled animation。
  - animation ordering。
- `apps/anieditorv5viewer/tests/runtime/project-sampler.test.ts`
  - 动画开始前隐藏。
  - 动画覆盖区间内可见。
  - 动画结束边界可见。
  - 动画覆盖区间外隐藏。
  - 无动画图层保持基础可见性。
  - `layer.visible === false` 不可见。
- `apps/anieditorv5viewer/tests/runtime/asset-manifest.test.ts`
  - 当前 4 个 asset.path 都能解析。
  - 缺失资源抛错。
- `apps/anieditorv5viewer/tests/runtime/validation.test.ts`
  - 当前样例通过校验。
  - 非 center 坐标系抛错。
  - `particles` 非空抛错。
  - `keyframes` 非空抛错。
  - 未知动画类型抛错。
  - 未知 blendMode 抛错。
  - 未知 easing 抛错。
  - 动画结束时间超过 `stage.duration` 抛错。
  - `schemaVersion` 非 V5G major 抛错。

测试约束：

- 如果测试因为旧假设而失败，先判断测试合同是否过期；过期就改测试。
- 不要为了测试通过而加入 silent fallback、missing asset placeholder 或忽略未知动画。
- 不要只测 happy path；至少覆盖 fail-fast 错误。

### 7.2 浏览器验收

实现完成后启动 dev server：

```bash
pnpm --filter anieditorv5viewer dev -- --host 0.0.0.0 --port 5175
```

如果 5175 被占用，换 5176 或其它空闲端口，并在任务报告中写明实际端口。

浏览器验收项：

- 页面能打开，不出现空白页。
- Pixi canvas 已创建。
- 背景颜色接近 `#101827`。
- 能看到 `epic`、左右飞机、光效等图片在播放期间出现。
- 点击 play 后动画从 0 秒开始播放。
- 时间轴能拖动到 0.6s、0.8s、4.0s、4.4s 附近并看到画面变化。
- loop 开关生效。
- restart 能回到 0 秒。
- console 没有资源缺失、schema 校验或 Pixi 初始化错误。
- 若使用截图工具验收，截图应能证明 canvas 非空且图层在正确时间点可见。
- 做一次 canvas 像素级 sanity check：至少确认截图或 canvas 采样不是纯背景色，避免“canvas 创建了但图层没画出来”的假通过。

## 8. 验证命令

首次新增 package 后安装依赖：

```bash
pnpm install
```

如果依赖下载失败，执行代理后重试：

```bash
export http_proxy=http://127.0.0.1:1087;export https_proxy=http://127.0.0.1:1087;
pnpm install
```

模块级验证：

```bash
pnpm --filter anieditorv5viewer typecheck
pnpm --filter anieditorv5viewer lint
pnpm --filter anieditorv5viewer test
pnpm --filter anieditorv5viewer build
```

根级回归验证：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

如果根级命令耗时过长或因既有无关问题失败，不能直接忽略；任务报告必须记录：

- 失败命令。
- 失败摘要。
- 判断是否与本任务相关。
- 如果与本任务相关，必须修复后重跑。
- 如果确认是既有无关问题，报告里写明证据。

## 9. 验收标准

功能验收：

- `apps/anieditorv5viewer` 存在并进入 pnpm workspace。
- app 能通过 Vite 启动。
- app 能加载复制后的 `project.json` 和 4 个图片资源。
- app 校验图片实际尺寸与 JSON `asset.width/height` 一致。
- app 能渲染当前 V5G 样例动画。
- 播放、暂停、重播、循环、拖动时间轴都可用。
- 动画开始前图层隐藏规则正确。
- 动画结束后图层隐藏规则正确。
- 负 `scaleX` 镜像正确。
- `add` 混合模式正确传给 Pixi。
- 图层顺序与 editor v5 一致。

代码验收：

- V5G 类型、校验、采样、资源解析、Pixi player 分层清晰。
- 动画采样逻辑有单元测试覆盖。
- fail-fast 错误有单元测试覆盖。
- 没有静默跳过未知动画、未知图层、未知资源。
- 没有为了测试加入不该有的生产逻辑。
- 没有修改无关项目代码。

文档验收：

- `apps/anieditorv5viewer/README.md` 存在并说明运行、资源来源、支持范围和 fail-fast 策略。
- 任务报告按要求写入 `tasks/29-anieditorv5viewer-bootstrap-[utctime].md`。
- 如果没有更新 `agents.md`，报告里明确说明本任务只新增普通 app，不改变仓库协作规则、目录规范或基础脚本，因此无需更新。
- 如果实际更新了 `agents.md`，报告里列出原因和改动。

命令验收：

- 模块级命令全部执行并记录结果：
  - `pnpm --filter anieditorv5viewer typecheck`
  - `pnpm --filter anieditorv5viewer lint`
  - `pnpm --filter anieditorv5viewer test`
  - `pnpm --filter anieditorv5viewer build`
- 根级命令执行并记录结果：
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm format:check`
  - `git diff --check`
- 浏览器验收执行并记录结果。

## 10. 任务报告要求

任务完成后创建中文报告：

```bash
date -u +%y%m%d-%H%M%S
```

报告路径格式：

```text
tasks/29-anieditorv5viewer-bootstrap-[utctime].md
```

例如：

```text
tasks/29-anieditorv5viewer-bootstrap-260401-181300.md
```

报告必须包含：

- 任务摘要。
- 新增/修改文件列表。
- 实现要点：
  - V5G schema 校验。
  - 资源 manifest。
  - 时间采样规则。
  - Pixi 渲染。
  - viewer UI。
- 当前支持范围和明确不支持范围。
- 复制资源清单。
- 测试结果，逐条列命令和结果。
- 浏览器验收结果，包含实际 URL 和关键观察。
- 是否更新 `agents.md`，以及原因。
- 遇到的问题和处理方式。
- 未完成项或后续建议。

## 11. 二次检查清单

提交前按此清单再检查一遍：

- 目标目录 `apps/anieditorv5viewer` 是否完整。
- `project.json` 是否从 `docs/anieditor5/export/project.json` 原样复制。
- 4 个图片资源是否全部复制。
- JSON asset.path 是否都能映射到 Vite URL。
- 当前样例是否没有因为版本号 `V5G_0.0014` 被错误拒绝。
- 非 V5G 项目是否会被拒绝。
- 动画时间是否被校验在 `stage.duration` 内。
- 未知 easing 是否会显式报错。
- 图片实际尺寸是否和 JSON asset 元数据一致。
- `particles` 非空是否会显式报错。
- `keyframes` 非空是否会显式报错。
- 未知动画类型是否会显式报错。
- 动画覆盖范围外隐藏规则是否有测试。
- 负 scaleX 是否有测试。
- 图层顺序是否按 editor v5 行为处理。
- 浏览器里 canvas 是否非空。
- play/pause/restart/loop/seek 是否都手动验收。
- 没有修改无关 app、package 或 docs。
- 没有新增空目录缺 `.keepme`。
- `agents.md` 是否需要更新已判断并写入报告。
- 任务报告是否已按 UTC 文件名创建。
