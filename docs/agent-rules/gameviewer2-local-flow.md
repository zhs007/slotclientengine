# Game Viewer 2 本地流程规则

## 产品边界

- `apps/gameviewer2` 是完全本地的 scene / otherScene 流程配置器与独立预览窗口；不连接服务器，不消费 server round、component graph、credential 或真实服务器轮带。
- app 生产依赖只允许 `@slotclientengine/rendercore` 与
  `@slotclientengine/slotoperationauthoring`。layout ZIP 的 `reelSet` 与 `renderMode` 直接选择 rendercore 已有的 standard / grid-cell 转轮实现，不经 `gameframeworks`。
- app 只持有浏览器 File、UI draft 和一次性 launch payload。ZIP 解析、strict readiness、公开轮带 Roll、值权重 Roll、转轮与 Symbol 播放属于 rendercore public facade。

## 本地项目合同

- 正式外层项目使用 strict `gameviewer2-project` v4，并同时保存
  `scene-other-scene-flow` v2 presentation 与 `slot-operation-authoring-project` v2 effect evidence。
  外层 v2/v3 只能显式升级为 `review: required` 草稿；未完成 review/final closure 时不可
  preview/export，旧项目不得根据相等 snapshot 猜测 presentation effect。
- snapshot 保持 x-first `scene` / `otherScene`。第一组是不持有编排的 initial；第二组是唯一 Spin target；第三组及后续是 settled state。新建 settled snapshot deep clone scene/otherScene；只在 source 也是 settled 时 clone 其 sequence 引用。
- Spin 编排固定由 `beforeSpin`、`spinning`、`stopping` 三节点组成，不可拆分。`spinning` 必须 stable；`stopping` 和普通 sequence 的中间项只允许 once，末项必须是 exact stable `normal`；local-flow project 不承载 `holdSeconds`。
- 每个非 initial snapshot 必须显式选择 `all-cells-normal | first-cell-normal`。第一格固定是左上角 `(0,0)`；提前结束时必须退役当前 generation 的其它 controller，不得跨 scene 发出过期 state request。
- readiness 必须校验 layout hash、尺寸、render mode、display code、otherScene value、编排引用和每格 Symbol state capability；不兼容必须精确失败，不回退到 normal。

## 播放语义与生命周期

- 第一个 snapshot 到第二个 snapshot 是唯一特殊 Spin 边：source symbol 处理 `beforeSpin`，启转时请求 `spinning`，各真实落点使用 target symbol 执行 `stopping`。`stopping` 首状态和 target value 必须随 spin plan 下沉到 reel 的 exact landing transaction；landing drain 只接管后续 once completion 与 scene barrier，不得等 `update()` 返回后才批量启动首状态。standard 的落点粒度是整列内所有格，grid-cell 是单格；两种 completion policy 都不得越过 reel settle 屏障。
- 第三个及后续 snapshot 在 settled 边界原位提交 Symbol occurrence/value，再执行该 snapshot 的逐格编排；不伪造 server step/component。
- finalized V2 plan 必须由 rendercore 实例级 operation coordinator 执行；初始 snapshot 由
  scene landing 建立，settled scene/value 只能从 state mutation 的 `operation.output` 提交，
  presentation 不提交 scene。authoring plan 不保存 occurrence identity、operation input 或通用
  mutation list；coordinator 将上一 state output 作为 `context.input` 交给 render handler。
- 配置器在打开新窗口后仅通过一次性 `MessageChannel` 发送 ZIP bytes、hash、flow 和
  finalized operation plan。新窗口先核对 plan initial/edge checkpoint，再重新 readiness，
  并独立拥有及销毁 Pixi application、layout resource、reel 与 Symbol players。
- Replay 必须回到第一 snapshot 并重走完整流程；不得复用半完成 controller、landing queue 或 spin 状态。
- flow/operation 完成只结束编排调度，不结束预览 renderer 时钟。宿主 ticker 必须继续恰好一次推进
  package runtime，使最终 Symbol 按现有状态机保持 `normal` loop，并让 Gamelayout 其它动画遵守各自
  manifest、可见性与 playhead；不得通过暂停、重播、reset 或重建其它 player 伪装完成态。
