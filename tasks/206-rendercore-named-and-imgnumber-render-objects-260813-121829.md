# 任务 206 执行报告（2026-08-13 12:18:29 UTC）

## 结果

已在 RenderCore 完成 exact-name program render object factory 与 standalone ImgNumber façade；未修改 Crave、`apps/**`、`assets/**`、Gamelayout 包或美术。

公开接口：

```ts
runtime.createRenderObject(name): Promise<RenderObject>
runtime.createImgNumberRenderObject(name, { text, anchor? }): Promise<ImgNumberRenderObject>
```

`createRenderObject()` 严格按 package manifest `runtimeResources` name 分派 image、official Spine 与 VNI；image-string 必须走 typed ImgNumber 入口，video 显式拒绝。Spine/VNI 由 package runtime 的 manual `update(deltaSeconds)` 推进，caller 拥有 object，runtime 维护 update 登记与销毁兜底。

`ImgNumberRenderObject` 复用 image-string renderer，提供 `setText/getText`，继承 `setPosition/setVisible/getAnchor/destroy`，并支持独立 clone。它不公开 raw Pixi display tree，也不销毁 package-owned glyph resource。

## 文档

- RenderCore public ownership 说明：`packages/rendercore/README.md`
- Crave Nearwin1/2 与图标中奖人工迁移：`docs/crave-named-render-object-migration.md`
- 既有 Crave RenderObject 文档已增加新文档入口。

Crave 文档要求删除 Nearwin 调用点的 path-to-key、手工 `loadRuntimeResource()`、player materialize/update，并把图标中奖字体对象替换为 ImgNumber 的 `setPosition/setText`。实际 resource name、glyph、美术和金额 formatter 仍由 Gamelayout/Crave 提供。

## 自动化验收

通过：

```text
pnpm --filter @slotclientengine/rendercore exec vitest run tests/presentation tests/scene-layout/render-object-factory.test.ts tests/scene-layout/package-runtime.test.ts
  4 files passed, 24 tests passed

pnpm --filter @slotclientengine/rendercore typecheck
  passed

pnpm --filter @slotclientengine/rendercore build
  passed

git diff --check
  passed
```

覆盖 exact name、image/image-string/video kind 分派、ImgNumber 原子改值/位置/clone/resource ownership、Spine/VNI manual update、abort、runtime destroy、初始化失败回滚及 package runtime public 接线。

依赖准备使用锁文件原样安装，未修改 `pnpm-lock.yaml`，未新增依赖。

## 待外部完成

- Crave 按使用文档修改 Nearwin1/2 与图标中奖调用点。
- Gamelayout/美术提供 exact runtime resource name 和完整 ImgNumber glyph closure。
- 浏览器人工验收由用户执行；本报告不声明其已完成。
- 当前会话未另行委派独立 reviewer；自动化命令已在实现完成后重跑并通过。
