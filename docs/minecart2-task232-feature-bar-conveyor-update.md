# Minecart2 task 232 手工更新说明

本文只说明如何在 `/Users/zerro/gitee.com/piximinecart2` 接入 task 232；本任务没有修改该目录。
请先同步本仓的 `packages/logiccore`、`packages/rendercore` 与 `packages/gameframeworks`，再改游戏代码。
Minecart2 当前通过 `bridgecore` 间接取得 `GameLogic`，因此同步后的 `GameLogic` 已包含
`getFeatureBar2Data(stepIndex, exactName)`；游戏不需要直接依赖 logiccore。

## 已核对的 exact 配置

| 项目              | landscape                   | portrait                    |
| ----------------- | --------------------------- | --------------------------- |
| authored node     | `conveyor-1`                | `conveyor-2`                |
| Start once        | `Conveyor1_Start`           | `Conveyor2_Start`           |
| Idle loop         | `Conveyor1_Idle`            | `Conveyor2_Idle`            |
| slot（index 0→4） | `conveyor1_4`…`conveyor1_0` | `conveyor1_4`…`conveyor1_0` |

当前解包的 `conveyor_2.json` slot 也确实是小写 `conveyor1_0`…`conveyor1_4`，不是
`Conveyor2_*` 或 `conveyor2_*`。动画名使用 `Conveyor2_*`，slot 名仍必须按 skeleton 的 exact
小写名称。不要增加 alias；以后美术若改名，显式更新下方配置。

feature 与程序图片的 exact 映射如下：

```text
normal -> gamelayout:/resource/image/f-coin
up     -> gamelayout:/resource/image/f-up
wild   -> gamelayout:/resource/image/f-jk
```

## 1. 新增 `apps/minecart2/src/feature-bar-conveyor.ts`

下面代码只依赖公开 runtime address、opaque authored Spine capability 和 caller-owned
`RenderObject`，不访问 Pixi Container 或 Spine player：

```ts
import type { GameLogic } from "@slotclientengine/bridgecore";
import type {
  RenderObject,
  SceneLayoutPackageRuntime,
  SceneLayoutSpineLoopRenderObject,
  SceneLayoutSpineSlotObjectAttachment,
} from "@slotclientengine/rendercore";

type Feature = "normal" | "up" | "wild";
type Variant = "landscape" | "portrait";

const COMPONENT = "bg-bar";
const FEATURE_COUNT = 5;
const SLOT_BY_INDEX = [
  "conveyor1_4",
  "conveyor1_3",
  "conveyor1_2",
  "conveyor1_1",
  "conveyor1_0",
] as const;
const RESOURCE_BY_FEATURE: Readonly<Record<Feature, string>> = {
  normal: "f-coin",
  up: "f-up",
  wild: "f-jk",
};
const CONVEYOR: Readonly<
  Record<
    Variant,
    { readonly node: string; readonly start: string; readonly idle: string }
  >
> = {
  landscape: {
    node: "conveyor-1",
    start: "Conveyor1_Start",
    idle: "Conveyor1_Idle",
  },
  portrait: {
    node: "conveyor-2",
    start: "Conveyor2_Start",
    idle: "Conveyor2_Idle",
  },
};

export interface FeatureBarConveyor {
  startSpin(): void;
  applySpin(logic: GameLogic): void;
  cancelSpin(): void;
  destroy(): void;
}

export async function createFeatureBarConveyor(options: {
  readonly runtime: SceneLayoutPackageRuntime;
  readonly initialVariant: string;
  readonly onError: (error: Error) => void;
}): Promise<FeatureBarConveyor> {
  const created: RenderObject[] = [];
  try {
    const pool = new Map<Feature, readonly RenderObject[]>();
    for (const feature of ["normal", "up", "wild"] as const) {
      const key = RESOURCE_BY_FEATURE[feature];
      const endpoint = options.runtime.addresses.resolve(
        `gamelayout:/resource/image/${key}`,
        "resource-factory",
      );
      if (endpoint.kind !== "resource-factory")
        throw new Error(`unexpected resource endpoint kind for ${key}`);
      const occurrences: RenderObject[] = [];
      for (let index = 0; index < FEATURE_COUNT; index += 1) {
        const object = await endpoint.create();
        occurrences.push(object);
        created.push(object);
      }
      pool.set(feature, Object.freeze(occurrences));
    }

    const controller = new DefaultFeatureBarConveyor(
      options.runtime,
      pool,
      exactVariant(options.initialVariant),
      options.onError,
    );
    controller.init();
    return controller;
  } catch (error) {
    for (const object of created.reverse()) object.destroy();
    throw error;
  }
}

class DefaultFeatureBarConveyor implements FeatureBarConveyor {
  readonly #runtime: SceneLayoutPackageRuntime;
  readonly #pool: ReadonlyMap<Feature, readonly RenderObject[]>;
  readonly #nodes: Readonly<Record<Variant, SceneLayoutSpineLoopRenderObject>>;
  readonly #onError: (error: Error) => void;
  #variant: Variant;
  #queue: readonly Feature[] = Object.freeze([
    "normal",
    "normal",
    "normal",
    "normal",
    "normal",
  ]);
  #roundStart: readonly Feature[] | null = null;
  #awaitingResponse = false;
  #startPending = false;
  #epoch = 0;
  #startAbort: AbortController | null = null;
  #attachment: SceneLayoutSpineSlotObjectAttachment | null = null;
  #disposeVariant: (() => void) | null = null;
  #destroyed = false;

  constructor(
    runtime: SceneLayoutPackageRuntime,
    pool: ReadonlyMap<Feature, readonly RenderObject[]>,
    initialVariant: Variant,
    onError: (error: Error) => void,
  ) {
    this.#runtime = runtime;
    this.#pool = pool;
    this.#variant = initialVariant;
    this.#onError = onError;
    this.#nodes = Object.freeze({
      landscape: requireConveyor(runtime, CONVEYOR.landscape.node),
      portrait: requireConveyor(runtime, CONVEYOR.portrait.node),
    });
  }

  init(): void {
    this.#rebind(this.#variant);
    this.#playIdle();
    this.#disposeVariant = this.#runtime.addresses.bind(
      "gamelayout:/event/variant-changed",
      (event) => this.#switchVariant(exactVariant(event.detail.variantId)),
    );
  }

  startSpin(): void {
    this.#assertReady();
    if (this.#awaitingResponse)
      throw new Error("feature bar is still waiting for the previous response");

    this.#epoch += 1;
    this.#startAbort?.abort();
    this.#activeNode().stopAnimation();
    const epoch = this.#epoch;
    const abort = new AbortController();
    this.#startAbort = abort;
    this.#roundStart = this.#queue;
    this.#awaitingResponse = true;
    this.#startPending = true;

    void this.#activeNode()
      .playAnimation(CONVEYOR[this.#variant].start, {
        signal: abort.signal,
      })
      .then(() => {
        if (this.#destroyed || epoch !== this.#epoch) return;
        this.#startPending = false;
        this.#startAbort = null;
        if (this.#awaitingResponse) {
          this.#queue = shiftedQueue(this.#roundStart!);
          this.#rebind(this.#variant);
        }
        this.#playIdle();
      })
      .catch((error: unknown) => {
        if (this.#destroyed || epoch !== this.#epoch) return;
        this.#startPending = false;
        this.#startAbort = null;
        this.#onError(asError(error));
      });
  }

  applySpin(logic: GameLogic): void {
    this.#assertReady();
    // 当前服务器合同中 bg-bar 属于主 spin 的 step 0；不要搜索其它 step 作 fallback。
    const data = logic.getFeatureBar2Data(0, COMPONENT);
    if (!data)
      throw new Error(`required component was not triggered: ${COMPONENT}`);
    this.#queue = exactQueue(data.features);
    this.#awaitingResponse = false;
    this.#roundStart = null;
    // GMI 一到就提交服务器 features；不检查旧 index 0、curFeature 或移位关系。
    this.#rebind(this.#variant);
  }

  cancelSpin(): void {
    if (this.#destroyed) return;
    this.#epoch += 1;
    this.#startAbort?.abort();
    this.#startAbort = null;
    this.#activeNode().stopAnimation();
    if (this.#awaitingResponse && this.#roundStart)
      this.#queue = this.#roundStart;
    this.#roundStart = null;
    this.#awaitingResponse = false;
    this.#startPending = false;
    this.#rebind(this.#variant);
    this.#playIdle();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#epoch += 1;
    this.#startAbort?.abort();
    this.#startAbort = null;
    this.#activeNode().stopAnimation();
    this.#disposeVariant?.();
    this.#disposeVariant = null;
    this.#attachment?.detach();
    this.#attachment = null;
    for (const objects of this.#pool.values())
      for (const object of objects) object.destroy();
  }

  #switchVariant(next: Variant): void {
    if (next === this.#variant) return;
    this.#epoch += 1;
    this.#startAbort?.abort();
    this.#startAbort = null;
    this.#activeNode().stopAnimation();
    if (this.#startPending && this.#awaitingResponse && this.#roundStart)
      this.#queue = shiftedQueue(this.#roundStart);
    this.#startPending = false;
    this.#rebind(next);
    this.#playIdle();
  }

  #rebind(next: Variant): void {
    const bindings = this.#queue.map((feature, index) => ({
      slot: SLOT_BY_INDEX[index]!,
      object: this.#pool.get(feature)![index]!,
    }));
    if (next === this.#variant) {
      this.#attachment = this.#nodes[next].bindSlotObjects(bindings);
      return;
    }

    const previousVariant = this.#variant;
    const previousAttachment = this.#attachment;
    previousAttachment?.detach();
    try {
      this.#attachment = this.#nodes[next].bindSlotObjects(bindings);
      this.#variant = next;
    } catch (error) {
      this.#attachment = this.#nodes[previousVariant].bindSlotObjects(bindings);
      throw error;
    }
  }

  #playIdle(): void {
    const epoch = this.#epoch;
    void this.#activeNode()
      .playAnimation(CONVEYOR[this.#variant].idle, { loop: true })
      .catch((error: unknown) => {
        if (!this.#destroyed && epoch === this.#epoch)
          this.#onError(asError(error));
      });
  }

  #activeNode(): SceneLayoutSpineLoopRenderObject {
    return this.#nodes[this.#variant];
  }

  #assertReady(): void {
    if (this.#destroyed) throw new Error("feature bar conveyor is destroyed");
  }
}

function requireConveyor(
  runtime: SceneLayoutPackageRuntime,
  nodeId: string,
): SceneLayoutSpineLoopRenderObject {
  const endpoint = runtime.addresses.resolve(
    `gamelayout:/node/${nodeId}`,
    "render-object",
  );
  if (endpoint.kind !== "render-object")
    throw new Error(`unexpected node endpoint kind: ${nodeId}`);
  const object = endpoint.get();
  if (object.kind !== "spine" || object.playback !== "loop")
    throw new Error(`expected authored loop Spine node: ${nodeId}`);
  return object;
}

function exactQueue(values: readonly string[]): readonly Feature[] {
  if (values.length !== FEATURE_COUNT)
    throw new Error(
      `bg-bar.features must contain exactly ${FEATURE_COUNT} items`,
    );
  return Object.freeze(values.map(exactFeature));
}

function exactFeature(value: string): Feature {
  if (value === "normal" || value === "up" || value === "wild") return value;
  throw new Error(`unknown bg-bar feature: ${value}`);
}

function exactVariant(value: unknown): Variant {
  if (value === "landscape" || value === "portrait") return value;
  throw new Error(`unknown layout variant: ${String(value)}`);
}

function shiftedQueue(values: readonly Feature[]): readonly Feature[] {
  return Object.freeze([...values.slice(1), "normal"]);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
```

这里有意预创建 `3 × 5 = 15` 个 occurrence-owned 图片对象。同一个 feature 在五个位置各有独立
`RenderObject`，不会把一个 mutable display occurrence 同时绑定多个 slot。方向切换时先同步 detach
旧 conveyor，再绑定同一批对象到新 conveyor；若新绑定失败，代码立即把旧 conveyor 绑定恢复。

## 2. 修改 `round-adapter.ts`

新增 import 与字段：

```ts
import {
  createFeatureBarConveyor,
  type FeatureBarConveyor,
} from "./feature-bar-conveyor.js";

// Game003v2RoundAdapter field
#featureBar: FeatureBarConveyor | null = null;
```

在 `runtime.init()` 成功后，只调用一次 `applyViewport()` 并用它的 committed snapshot 创建 controller。
原代码后面那次单独 `runtime.applyViewport(...)` 改为：

```ts
const snapshot = runtime.applyViewport(
  this.requireContext().getViewport().frameDesignSize,
);
const featureBar = await createFeatureBarConveyor({
  runtime,
  initialVariant: snapshot.variantId,
  onError: (error) => console.error(error),
});

// 与 #runtime/#coordinator 一起提交实例字段；init catch 中若尚未提交，也 destroy featureBar。
this.#featureBar = featureBar;
```

保留 mount 中的 viewport callback：它先 resize renderer，再调用
`this.#runtime?.applyViewport(...)`。新的 global variant event 会在该 apply 成功提交方向变化时同步触发，
不需要在 app 再比较 width/height。

在 pre-spin、GMI response、cancel 三个边界各加一行：

```ts
startSpinPresentation(): void {
  // 保留原有 ready/running 检查。
  const featureBar = this.#featureBar;
  if (!featureBar) throw new Error("game003v2 feature bar is not ready.");
  featureBar.startSpin();
  try {
    this.requireRuntime().getReelArea("main").spin.start();
    this.#preSpinActive = true;
  } catch (error) {
    featureBar.cancelSpin();
    throw error;
  }
}

cancelSpinPresentation(_error: Error): void {
  this.#featureBar?.cancelSpin();
  // 继续执行原有 reel cancel 与 #preSpinActive cleanup。
}

playSpin(logic: Parameters<SlotGameAdapter["playSpin"]>[0]): Promise<void> {
  const featureBar = this.#featureBar;
  if (!featureBar) throw new Error("game003v2 feature bar is not ready.");
  featureBar.applySpin(logic); // 必须放在 compile/start coordinator 之前，GMI 到达即刷新。
  const compilation = compileGame003v2Round({
    logic,
    gameConfig: this.#resource.symbols.gameConfig,
    displaySymbols: this.#resource.symbols.displaySymbols,
  });
  return this.requireCoordinator().start(compilation.plan);
}
```

`destroy()` 中按以下相对顺序释放；不要 destroy authored conveyor：

```ts
this.#featureBar?.destroy();
this.#featureBar = null;
this.#coordinator?.destroy();
this.#runtime?.destroy();
```

若 `applyInitialState()` 在 controller 创建后、实例字段提交前失败，局部变量也必须 `destroy()`，避免 15 个
图片对象泄漏。最简单的写法是在方法开头声明 `let featureBar: FeatureBarConveyor | null = null`，catch 中在
`runtime.destroy()` 前调用 `featureBar?.destroy()`。

## 3. 行为边界

- 首次没有本轮 `bg-bar` 时只由 controller 显示五个 `normal`；不要从 player state 恢复，也不要让
  logiccore 提供 fallback。
- Start 完成而 GMI 尚未到达时，显示 `[old[1], old[2], old[3], old[4], normal]` 并进入 Idle loop。
- GMI 先到时，立即显示服务器 `features`；稍后 Start completion 只切 Idle，不再覆盖服务器 queue。
- Start 期间切方向时，旧 Start 被彻底停止。尚无 response 时只执行一次临时 shift；已有 response 时保留
  authoritative queue。随后迁移图片并直接播放新方向 Idle loop。
- 不比较相邻 response、不用 `curFeature` 修补 `features`。长度不是 5 或出现未知 feature 时直接报错，
  暴露服务器/配置问题。
- `playAnimation(..., { loop: true })` 的 Promise 在第一圈结束时 resolve，但 Idle 会继续循环；不要把
  Promise resolve 当成 stop。

## 4. 用户浏览器验收

代码同步并完成 typecheck/build 后，请人工检查：

1. 首次横屏：`conveyor-1` 显示五个 `f-coin`，`conveyor-2` 不显示。
2. 首次竖屏：`conveyor-2` 显示五个 `f-coin`，slot 位置顺序正确。
3. spin：active conveyor 播放一次对应 `Start`；若人工延迟 response，动画结束后左移并补
   `normal`，随后 `Idle` 循环。
4. response 到达：`normal/up/wild` 分别显示 `f-coin/f-up/f-jk`，index 0 在
   `conveyor1_4`，index 4 在 `conveyor1_0`。
5. Start 中横竖屏互切：旧 Start 停止，新方向直接 Idle；无双份图片、stale conveyor 或重复 shift。
6. response 先到/动画先到两种 race 都以服务器 queue 为最终画面。
7. 连续同方向 resize 不重绑方向；真正方向变化只发生一次 variant event。
8. spin 网络失败后恢复原 queue 并 Idle；退出/重进无残留图片、listener、动画或控制台 unhandled rejection。

浏览器验收结论由你记录；shared package 的自动验收不替代这一步。
