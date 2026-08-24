# 243 rendercore addressed RenderObject mounting 执行报告

## 结果

任务已在 `007dd813be5f0e2e9cb724d04a2d67f993b0b2d7` 基线上实现，未提交、未修改 lockfile、manifest/schema、app 或 production assets。

- `RenderObject.getChildLayer()` 支持 exact Spine slot 与 VNI text layer；相同 ref 返回稳定的 opaque `RenderObjectLayer`。
- child parent 使用单一内部 group，组内复用 safe-integer `order`，child 继承 Spine/VNI owner clock；owner destroy 只 detach caller child。
- `SceneLayoutPackageRuntime.addresses` 新增 `mount()`、`addressOf()` 与 live instance catalog。
- program resource factory、`createRenderObject()`、`createImgNumberRenderObject()` 支持可选显式 `instanceId`；无 ID 保持匿名兼容路径。
- program Popup request 支持可选显式 `instanceId`，session 返回 `instanceAddress | null`；带 ID 的 queued session 可预挂到 `.../layer/root`，仅 active group 可见，结束/取消/失败/destroy 后注销并 detach。
- authored Scene Spine/VNI 的 exact slot/text-layer 地址从已准备的严格资源 metadata 编译。
- RenderCore/Gameframeworks exports、README、两份长期文档与两份领域规则已同步。

`instanceId` 是 owner-local exact string：`"gamelayout"` 没有保留含义，可正常使用；相同 owner 下 duplicate live ID 在 prepare 前失败，不同 owner 可重名，destroy/session 结束后可复用。不传不会自动生成 ID，`addressOf()` 明确失败。

## 地址与 API

新增主要地址：

```text
gamelayout:/node/<node-id>/slot/<slot>
gamelayout:/node/<node-id>/text-layer/<layer-id>
gamelayout:/resource/<kind>/<key>/instance/<instance-id>
gamelayout:/resource/spine/<key>/instance/<instance-id>/slot/<slot>
gamelayout:/resource/vni/<key>/instance/<instance-id>/text-layer/<layer-id>
gamelayout:/popup/<popup-id>/instance/<instance-id>
gamelayout:/popup/<popup-id>/instance/<instance-id>/layer/root
```

`list()` 保留既有静态 catalog 顺序，并追加按 address 排序的当前 live descriptor；每次返回 frozen snapshot。`mount()` 返回幂等 detach handle，不取得 child destroy ownership。

## 验收

已通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore exec vitest run \
  tests/presentation/render-object-child-layer.test.ts \
  tests/presentation/render-object-layer.test.ts \
  tests/scene-layout/runtime-address.test.ts \
  tests/scene-layout/runtime-address-mount.test.ts \
  tests/scene-layout/render-object-factory.test.ts \
  tests/scene-layout/package-runtime.test.ts
  => 6 files, 50 tests passed
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/gameframeworks typecheck
git diff --check
```

依赖目录初始不完整；按仓库规则执行 `CI=true pnpm install --frozen-lockfile` 后验收，未产生 lockfile diff。

## 浏览器验收

未执行。用户明确由其完成真实浏览器验收，建议按计划第 8 节验证两个同 resource instance、Scene/Reel/Spine/VNI 间 mount/detach，以及两个同 Popup binding session 的 queued/active 隔离。

## 计划偏差与剩余风险

- 本次 program Popup instance 提供 session-scoped `layer/root`，满足统一“Popup 图层”挂载；计划中进一步设想的 Popup authored logical named layer、其 nested Spine/VNI child 地址未实现。现有静态 `popup/<id>/layer/<id>` borrowed endpoint 保持原行为，避免把 award 跨 tier 的多个 concrete layer 错误伪装成一个稳定 parent。
- `mount()` 验证 RenderCore-created、owned、detached child，但现有 RenderObject adapter 没有 package-runtime owner token，因此未新增跨 package runtime 的 foreign-object 判定；所有 clock/parent/destroy 边界仍由 resolved target layer负责。
- 现有 `attachRenderObjectToSpineSlot()` 与 authored `bindSlotObjects()` 保持兼容；同一个 slot 不应同时混用旧 direct attachment 与新 child-layer parent。新代码应统一使用 address mount 或 `getChildLayer()`。
