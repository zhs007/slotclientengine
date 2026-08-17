# Crave：Task 220 Popup 分层手工迁移

本任务没有修改 Crave 的源码、资源、配置或生成物。以下步骤由 Crave 维护者在同步新版
`@slotclientengine/rendercore` 后手工执行。

## 需要检查的 import

搜索所有旧的 `@slotclientengine/rendercore/popup` 混合入口，并按实际职责替换，不保留本地
compatibility barrel：

- manifest types、strict parser、latest normalizer、金额/visibility/attachment 与纯引用遍历改为
  `@slotclientengine/rendercore/popup/data`；
- production resource prepare、award/Spine Runtime、presentation、string handle 与宿主 input binding改为
  `@slotclientengine/rendercore/popup/core`；
- 只有 standalone Popup package 的 mapped resolve/flatten/namespace/materialize 或完整 editor snapshot
  才使用 `@slotclientengine/rendercore/popup/editor`。

如果 Crave 只通过 `@slotclientengine/gameframeworks` 或 Scene Layout 驱动 Popup，通常不需要新增直接
Popup import；同步新版依赖并修复已经存在的旧入口即可。production 不应依赖 `popup/editor`。

## 统一版本加载

所有受支持的 Popup v1–v6 都调用 data 的默认入口：

```ts
import { loadPopupManifest } from "@slotclientengine/rendercore/popup/data";

const { sourceVersion, manifest } = loadPopupManifest(source);
// manifest 当前恒为 strict latest v6；sourceVersion 只用于日志或迁移提示。
```

删除默认流程中对 `upgradePopupManifestToV2/V3/V4/V5/V6` 的自行选择、按 consumer 分支升级或“已是
最新版”的假设。未知未来版本仍必须失败，不按最近版本猜测。若 Crave 读取 Scene Layout 内嵌 Popup，
由新版 Scene Layout loader 完成同一规范化，不要再升级第二次。

## 手工验收

1. 对 Crave 的实际 Popup fixture 分别覆盖现存历史版本与 v6，确认加载后 production Runtime 只消费
   latest，并保持 award 档位、金额、attachment、普通 Spine start/loop/end 与 dismiss 边界。
2. 类型检查 production 源码，确认没有 `popup/editor`、完整 snapshot player 或旧 `popup` 入口。
3. 在浏览器复验 Scene Layout/Popup 视觉与输入；连续 replay/destroy 后检查 listener、Object URL、
   FontFace、Texture、VNI/Spine/ImgNumber 与 Container 数量不持续增长。

如 Crave 有仓库外 standalone Popup 打包工具，它属于 editor adapter consumer，应单独改用
`popup/editor`；不要把该依赖带入游戏 bundle。
