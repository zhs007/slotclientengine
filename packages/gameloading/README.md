# @slotclientengine/gameloading

`@slotclientengine/gameloading` 是独立的 DOM loading 小包，负责首屏进度条、资源加载和 `99% / 100%` 生命周期编排。它不依赖 Pixi、`gameframeworks`、`rendercore` 或 `netcore`。

## 生命周期

```ts
import { createGameLoading } from "@slotclientengine/gameloading";

const loading = createGameLoading({
  root: document.getElementById("loading")!,
  maxConcurrentResources: 4,
  resources: [
    { id: "background", url: "./assets/bg.jpg", weight: 8 },
    { id: "runtime", weight: 10, load: () => import("./game-entry.js") },
  ],
  async onBeforeComplete({ loadedResources }) {
    const runtime = loadedResources.get("runtime");
    return prepareLiveSession(runtime);
  },
  async onEnterGame({ prepareResult }) {
    await enterGame(prepareResult);
  },
});

await loading.start();
```

资源加载阶段只会推进到 `99%`。默认最多同时加载 6 个资源，可以通过 `maxConcurrentResources` 调整，避免首屏把大量大文件一次性塞进浏览器队列。`onBeforeComplete` 开始时页面已经显示 `99%`，只有它成功 resolve 后才会显示 `100%` 并调用 `onEnterGame`。任意阶段失败都会停在 loading 错误态并调用 `onError`。

## 默认资源类型

未提供自定义 `load()` 时会按 URL 去掉 query/hash 后的扩展名推断类型：

- 图片：`.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` / `.svg` / `.avif`
- JSON：`.json`
- 文本：`.txt` / `.csv` / `.xml` / `.yaml` / `.yml`
- 二进制：`.bin` / `.dat` / `.atlas`
- Wasm：`.wasm`，加载后编译为 `WebAssembly.Module`
- Module：`.js` / `.mjs`，通过动态 import 进入 module cache
- 样式：`.css`

缺 URL、未知扩展名、重复资源 id、非法权重都会显式失败，不做隐藏 fallback。
