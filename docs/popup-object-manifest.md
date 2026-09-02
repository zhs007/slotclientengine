# Popup Object Manifest v1

Popup Object 是由 Popup Editor 制作、供其他 Popup 组合使用的原子美术对象，不是第四种可独立播放的 Popup。

独立包的根文件固定为 `popup-object.manifest.json`：

```json
{
  "version": 1,
  "kind": "popup-object",
  "name": "tap-to-continue",
  "resources": {},
  "layers": []
}
```

- `name` 必须是 lowercase kebab-case，也是对象唯一的稳定业务身份。
- 根对象只允许 `version`、`kind`、`name`、`resources` 和 `layers`；没有 Popup id/type、adaptation、focus、backdrop、audio、tier、amount 或输入合同。
- `resources` 与 `layers` 复用 Popup v9 single-state 的 image、font text、image-string、VNI 与 Spine 合同；不允许包含另一个 Popup Object。
- 内部 attachment 只在对象自身图层图中解析，不允许引用宿主 Popup 或 `main-spine`。
- ZIP 文件名为 `<name>-popup-object.zip`，包含根 manifest、`assets.map.json` 与 exact transitive payload closure。

Popup v9 通过 `{ "kind": "popup-object", "manifest": "..." }` resource 和同 kind layer 创建实例。实例的 id、transform、alpha、order、attachment，以及 Spine Popup 中的 segment visibility 属于宿主；对象内部图层保持封装，不与宿主图层排序或命名空间交错。

运行时可由宿主 player 的 `getObject(instanceId)` 取得 borrowed handle，再以对象局部 exact name 调用 `getLayer()`、`getTextNode()` 或 `getImageStringNode()`。对象生命周期完全从属宿主 Popup，不拥有 dismiss、advance、completion、ticker、canvas 或独立 backdrop。
