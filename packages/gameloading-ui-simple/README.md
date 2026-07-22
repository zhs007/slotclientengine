# @slotclientengine/gameloading-ui-simple

`@slotclientengine/gameloading-ui-simple` 是可注入的原生 DOM Loading UI，提供深色背景、进度条、百分比、Loading/Preparing/Ready/Error 状态和可访问的 error 区域。

```ts
import { createGameLoading } from "@slotclientengine/gameloading";
import { createSimpleGameLoadingUi } from "@slotclientengine/gameloading-ui-simple";

createGameLoading({
  root,
  ui: createSimpleGameLoadingUi(),
  resources,
  onBeforeComplete,
  onEnterGame,
});
```

本包无运行时依赖，不提供视觉最短等待，不依赖 React、Pixi、framework 或 network。每个实例只管理 root 的 children 和自己的 style，`destroy()` 幂等。
