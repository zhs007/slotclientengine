# 25 rendercore symbol keyframe animation 更正执行报告

时间：2026-06-11 10:20:51 UTC

## 结论

任务 25 已按更正后的目标执行完成：关键帧动画目标从误用的 `RS` 改为 `SC`。随后按反馈补充了 `RS.appear` 与 `RS.win` 的 layer `1` 缩放同步左旋动画。静态验收与第二遍审计通过。浏览器验收未执行；用户明确要求“不需要你做浏览器验收”。

## 更正内容

- 保留并恢复 `RS` 的普通三层资源契约：
  - `RS.normal.layers = ["./RS-0.png", "./RS-1.png", "./RS-2.png"]`
  - `RS.win` 不绑定 `layerTextureSequence`。
- 将关键帧资源迁到 `SC`：
  - `SC.normal.layers[1].texture = "./SC-1-0.png"`
  - `SC.normal.layers[1].keyframes = "./SC-1-0.png" ... "./SC-1-4.png"`
  - `SC.win` 绑定 `layerTextureSequence`。
- `SC-1.png` 当前保留在 `assets/symbols` 中，但运行时配置、state manifest、README 和 app src 均不引用它。

## 实现内容

- `packages/rendercore` 保留上一轮新增的通用 layer keyframes 能力：
  - `SymbolLayerTextureSource.keyframes`
  - `SymbolVisualLayer.keyframes`
  - catalog、RenderSymbol、reel registry 对 keyframes 的规范化、校验和传递
  - named animation `layerTextureSequence`
- `generate-symbol-state-textures.mjs` 支持 object layer 的 `index`、`texture`、`keyframes`，并校验首帧与尺寸。
- `symbolsviewer`、`reelsviewer`、`game001` 的 asset loader 均解析并加载 manifest keyframes。
- 三个 app 的 animation profile 改为：
  - `SC.win`: `layerTextureSequence` + `layerStaggeredShineScale`
  - `RS.appear`: layer `1` 使用 `layerBounceScale`，放大时通过 `rotationDegrees: -20` 向左旋转并在缩小时还原
  - `RS.win`: layer `1` 使用 `layerShineScale`，放大时通过 `rotationDegrees: -20` 向左旋转并在缩小时还原；layer `2` 延迟扫光缩放
  - `X2/X5/X10.win`: 原有单层 staggered shine
- `game001` 仅在现有手动/状态请求路径上播放 visible `SC.win` keyframes；没有新增中奖线坐标推断。

## 资源变更

- 新增：
  - `assets/symbols/SC-1-0.png`
  - `assets/symbols/SC-1-1.png`
  - `assets/symbols/SC-1-2.png`
  - `assets/symbols/SC-1-3.png`
  - `assets/symbols/SC-1-4.png`
- 已确认存在：
  - `assets/symbols/RS-1.png`
- 已重新生成：
  - `assets/symbols/SC.spinBlur.png`
  - `assets/symbols/SC.disabled.png`
  - `assets/symbols/symbol-state-textures.manifest.json`

## 文档同步

- 已更新：
  - `packages/rendercore/README.md`
  - `apps/symbolsviewer/README.md`
  - `apps/reelsviewer/README.md`
  - `apps/game001/README.md`
- 未更新 `AGENTS.md` / `agents.md`：
  - 本任务没有改变仓库协作规则、目录规范或基础脚本。
- 未修改 `packages/pixiani`：
  - 该任务不需要 pixiani 改动。

## 验收命令

### 生成

- `pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --symbols S00,S0,S1,S5,S10,SC,RS,X2,X5,X10 --composites assets/symbols/symbol-composites.json`
  - 通过。

### 包级与 app 级测试

- `pnpm --filter @slotclientengine/rendercore test`
  - 通过，16 files / 85 tests。
  - 覆盖率：statements 93.96%，branches 82.26%，functions 98.99%，lines 93.88%。
- `pnpm --filter symbolsviewer test`
  - 通过，1 file / 10 tests。
  - 覆盖率：statements 87.36%，branches 74.74%，functions 100%，lines 87.00%。
- `pnpm --filter reelsviewer test`
  - 通过，4 files / 12 tests。
  - 覆盖率：statements 80.55%，branches 61.34%，functions 79.59%，lines 80.28%。
- `pnpm --filter game001 test`
  - 通过，7 files / 41 tests。
  - 覆盖率：statements 93.56%，branches 88.03%，functions 94.78%，lines 93.71%。

### 根级验收

- `pnpm lint`
  - 通过，14/14 tasks。
- `pnpm test`
  - 通过，14/14 tasks。
- `pnpm typecheck`
  - 通过，14/14 tasks。
- `pnpm build`
  - 通过，14/14 tasks。

### 资源与产物卫生

- `rg -n 'SC-1-[0-4]\.png' assets/symbols/symbol-composites.json assets/symbols/symbol-state-textures.manifest.json apps packages/rendercore --glob '!**/dist/**'`
  - 通过，命中 composite、manifest、README 与测试引用。
- `rg -n 'RS-1-[0-4]\.png|RS\.win|SC/X2|visible RS|RS keyframe|RS keyframes' apps packages/rendercore assets/symbols --glob '!**/dist/**'`
  - 通过，无输出。
- `rg -n 'SC-1\.png' assets/symbols/symbol-composites.json assets/symbols/symbol-state-textures.manifest.json apps/*/README.md apps/*/src packages/rendercore/README.md --glob '!**/dist/**'`
  - 通过，无输出。
- `find assets/symbols -name 'RS-1.png' -print`
  - 通过，输出 `assets/symbols/RS-1.png`，证明 RS 旧层资源已恢复。
- `rg -n '"sharp"|from "sharp"|node:fs|node:path|generate-symbol-state-textures' packages/rendercore/dist apps/symbolsviewer/dist apps/reelsviewer/dist apps/game001/dist`
  - 通过，无输出；Node-only generator/sharp 未进入上述浏览器产物。
- `git diff --check`
  - 通过，无输出。
- `git diff --cached --check`
  - 通过，无输出。

## 第二遍审计

- 确认 keyframes 贯通 `catalog -> RenderSymbol -> animation context -> named animation`。
- 确认 reels registry 不丢失 layered keyframes。
- 确认三个 app 都会加载 SC keyframe URL 为 Pixi Texture。
- 确认 `symbol-composites.json` 与 state texture manifest 的 `SC.normal.layers[1]` 完全一致。
- 确认 `RS` 回到 `RS-0.png`、`RS-1.png`、`RS-2.png` 普通三层资源。
- 确认 `RS.appear` / `RS.win` 只有 layer `1` 在缩放脉冲中使用 `rotationDegrees: -20`；缩小时 rotation 归零。
- 确认 `SC` 不挂 `rotationDegrees`，`SC.win` 仍只负责 layer `1` keyframes 与扫光缩放。
- 确认未做浏览器验收。
