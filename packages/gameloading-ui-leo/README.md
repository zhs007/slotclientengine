# @slotclientengine/gameloading-ui-leo

`@slotclientengine/gameloading-ui-leo` 是 game002 使用的 Leo 品牌 Loading UI。它使用原生 DOM/CSS，运行时零依赖，不接触游戏 query、live session、framework、Pixi 或全局 store。

```ts
import { createLeoGameLoadingUi } from "@slotclientengine/gameloading-ui-leo";

const ui = createLeoGameLoadingUi({
  introDurationMs: 3200,
  gifLoadTimeoutMs: 5000,
  exitDurationMs: 100,
});
```

创建后同步显示黑色 shell 和 logo；GIF load/error/timeout 后启动 intro gate，gate 完成再显示由 controller progress 驱动的 `a2/a3` reveal。GIF 期间收到的真实进度只排队、不提前画到隐藏图层；reveal 出现后以默认 `1200ms` 从零追赶真实目标，达到 controller 的 `99%` 后才完成 visual readiness，避免快速本地/CDN 资源让进度层第一帧已经是 `99%`。这个时长可通过 `progressRevealDurationMs` 调整，不会改变资源、platform bootstrap 或 live session 的完成状态。

progress reveal 保持原 Leo 动画的图片内坐标：`a2` 以 `(50%, 35%)` 为圆心逆时针展开，`a3` 只在真实内容区从 `30%` 展开到 `70%`，不会把透明画布误当成进度。装饰图片失败不会阻塞业务，controller 仍必须同时等待自己的资源和 live prepare。enter 成功后才播放 exit。

本包只拥有 `loading2.gif`、`logo_1.webp`、`a2.webp`、`a3.webp` 四个精确资产。没有 timestamp cache busting、远程资源、React/JSX、Zustand、event bus、framework/network 或 Wildsheep fallback。
