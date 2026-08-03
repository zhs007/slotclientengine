# 154 Symbols Editor 多图层 state 动画执行报告

## 结果

已实现 symbol state 的显式 composite 模式：一份 normal/stateTexture base 可叠加非空、有序的 Spine/VNI underlay/overlay layers。编辑器 draft、Inspector、Resource Picker、资源替换、ZIP 往返与 rendercore production runtime 使用同一严格 manifest 合同。

浏览器视觉与交互验收未执行，按用户要求由用户处理。

## 主要改动

- rendercore 新增 strict `kind: "composite"` schema，校验 base、layer id、placement、leaf kind、state texture 和 lifecycle。
- exact closure、mapped package materializer 及 Spine/VNI resource builder 递归处理全部 leaf；同资源的 composite layer 使用独立 player instance。
- 新增 composite runtime owner，稳定挂载 underlay/overlay slots，聚合 once/loop completion，并在 reset/update 失败或 destroy 时幂等清理整组资源。
- Symbols Editor 新增 composite draft、base selector、layer 新增/删除/换位、Spine/VNI 字段及 exact Picker binding。
- Spine skeleton 覆盖缺失动画时，只清空对应 composite leaf 的 `animationName` 并报告 exact location。
- 更新 Symbols Editor、rendercore、Symbol Package 及领域规则文档。

## 自动验收

以下命令全部通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run tests/symbol/manifest.test.ts tests/symbol/composite-animation.test.ts tests/symbol/vni-animation.test.ts tests/symbol/package.test.ts tests/symbol/materialize-package.test.ts
  5 files / 68 tests passed

pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor exec vitest run tests/editor-project.test.ts tests/resource-picker.test.ts tests/resource-import.test.ts tests/app-shell.test.ts tests/zip-io.test.ts
  5 files / 52 tests passed

pnpm --filter symbolseditor build
  Vite production build passed（保留既有 >500 kB chunk warning）

git diff --check
```

## 待用户浏览器验收

- normal 与非 normal state 切换 composite，并检查 normal/stateTexture base。
- 新增、删除、上下移动 layer，检查 underlay/base/overlay 及同组列表顺序。
- 分别绑定 Spine/VNI，检查 replay、once 完成、loop 边界、切 state 与重开项目后的清理。
- 导出 ZIP 后重新导入，确认 base、layer id、placement、顺序和 binding 保持一致。
