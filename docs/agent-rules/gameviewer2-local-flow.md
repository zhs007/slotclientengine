# Game Viewer 2 本地流程规则

## 产品边界

- `apps/gameviewer2` 是完全本地的 scene / otherScene 流程配置器与独立预览窗口；不连接服务器，不消费 server round、component graph、credential 或真实服务器轮带。
- app 生产依赖只允许 `@slotclientengine/rendercore`。layout ZIP 的 `reelSet` 与 `renderMode` 直接选择 rendercore 已有的 standard / grid-cell 转轮实现，不经 `gameframeworks`。
- app 只持有浏览器 File、UI draft 和一次性 launch payload。ZIP 解析、strict readiness、公开轮带 Roll、值权重 Roll、转轮与 Symbol 播放属于 rendercore public facade。

## 本地项目合同

- 正式项目使用 versioned strict `scene-other-scene-flow` v2：一个 reel presentation profile、带 `spin | sequence` kind 的命名编排列表、有序 snapshot 列表。v1 不静默迁移。
- snapshot 保持 x-first `scene` / `otherScene`。第一组是不持有编排的 initial；第二组是唯一 Spin target；第三组及后续是 settled state。新建 settled snapshot deep clone scene/otherScene；只在 source 也是 settled 时 clone 其 sequence 引用。
- Spin 编排固定由 `beforeSpin`、`spinning`、`stopping` 三节点组成，不可拆分。`spinning` 必须 stable；`stopping` 和普通 sequence 的中间项只允许 once，末项必须是 exact stable `normal`；local-flow project 不承载 `holdSeconds`。
- 每个非 initial snapshot 必须显式选择 `all-cells-normal | first-cell-normal`。第一格固定是左上角 `(0,0)`；提前结束时必须退役当前 generation 的其它 controller，不得跨 scene 发出过期 state request。
- readiness 必须校验 layout hash、尺寸、render mode、display code、otherScene value、编排引用和每格 Symbol state capability；不兼容必须精确失败，不回退到 normal。

## 播放语义与生命周期

- 第一个 snapshot 到第二个 snapshot 是唯一特殊 Spin 边：source symbol 处理 `beforeSpin`，启转时请求 `spinning`，各真实落点使用 target symbol 执行 `stopping`。standard 的落点粒度是整列内所有格，grid-cell 是单格；两种 completion policy 都不得越过 reel settle 屏障。
- 第三个及后续 snapshot 在 settled 边界原位提交 Symbol occurrence/value，再执行该 snapshot 的逐格编排；不伪造 server step/component。
- 配置器在打开新窗口后仅通过一次性 `MessageChannel` 发送 ZIP bytes、hash 和完整 project。新窗口重新 readiness，并独立拥有及销毁 Pixi application、layout resource、reel 与 Symbol players。
- Replay 必须回到第一 snapshot 并重走完整流程；不得复用半完成 controller、landing queue 或 spin 状态。
