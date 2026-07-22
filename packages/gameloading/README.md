# @slotclientengine/gameloading

`@slotclientengine/gameloading` 只负责资源加载、加权进度、`99% / 100%` 生命周期、错误与取消，以及可注入 Loading UI contract。包内不再包含具体 DOM/CSS，也不依赖 Pixi、framework、render 或 network package。

## 生命周期

```ts
import { createGameLoading } from "@slotclientengine/gameloading";
import { createSimpleGameLoadingUi } from "@slotclientengine/gameloading-ui-simple";

const loading = createGameLoading({
  root: document.getElementById("loading")!,
  ui: createSimpleGameLoadingUi(),
  maxConcurrentResources: 4,
  resources: [
    { id: "background", url: "./assets/bg.jpg", weight: 8 },
    { id: "runtime", weight: 10, load: () => import("./game-entry.js") },
  ],
  async onBeforeComplete({ loadedResources, signal }) {
    return prepareLiveSession(loadedResources.get("runtime"), signal);
  },
  async onEnterGame({ prepareResult, signal }) {
    await enterGame(prepareResult, signal);
  },
  onError(error) {
    console.error(error);
  },
});

await loading.start();
```

固定顺序为：资源 `0..99%` → `preparing/99%` → 同时等待业务 prepare 与 UI `readyToComplete` → `entering-game/100%` → enter 成功 → UI exit → UI destroy → root hidden。UI 的视觉 gate 不能代表 live session 已完成，也不能调用业务回调。

`start()` 成功时 resolve；任一资源、prepare、视觉 gate、enter 或 exit 失败时，发布可见 error snapshot、调用 `onError` 恰好一次，并 reject 同一个规范化 `Error`。调用方若使用 fire-and-forget，应显式处理 rejection。`destroy()` 幂等，会中止同一实例的 `AbortSignal`、销毁 UI 并隐藏 root；之后不会再发布 snapshot 或启动业务阶段。

## UI contract

UI factory 在 controller 创建时同步接收 app-owned root，并立即收到冻结的初始 snapshot：

```ts
interface GameLoadingUi {
  readonly readyToComplete?: Promise<void>;
  update(snapshot: GameLoadingUiSnapshot): void;
  playExit?(): Promise<void>;
  destroy(): void;
}
```

具体实现位于：

- `@slotclientengine/gameloading-ui-simple`：通用简单进度条。
- `@slotclientengine/gameloading-ui-leo`：原生 DOM/CSS 的 Leo 品牌界面。

## 默认资源类型

未提供自定义 `load()` 时按 URL 扩展名推断 image、json、text、binary、wasm、module 或 style。fetch、image 与 style loader 使用实例的 `AbortSignal`；自定义 loader 通过 context 读取同一个 signal。缺 URL、未知扩展名、重复 id、非法权重或并发数都会显式失败，不做 fallback。
