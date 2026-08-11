# Visible occurrence transfer 使用说明

本文说明 rendercore 的 grid-cell main reel occurrence handle、附加效果和 awaitable transfer API。

这些接口是中性的 rendercore 能力，不解析 CO、route、symbol 业务名或 server component。游戏负责业务顺序、间隔、路径参数、动画名和后续 Promise 链；rendercore 负责 manual-update 时钟、occurrence ownership、运动、遮罩、显示顺序、原子提交和失败清理。

## 适用范围

当前接口只支持 `RenderGridCellReelSet` 类型的 main reel：

- 不局限于 `game002v2`，任何采用 grid-cell main reel 的游戏均可使用。
- 当前 `game003v2` 使用 standard reel，不能直接使用这些接口。
- standard reel 若需要相同能力，应为 `RenderReelSet` 增加对应的 occurrence ownership 和 transfer 实现，而不是把游戏业务硬编码进 rendercore。

这里的 occurrence 指盘面上一次实际出现的完整 symbol renderer identity，不是复制出来的 texture 或 Sprite。

## 时钟与 update owner

delay、movement、symbol state 和 occurrence effect 都不创建 GSAP ticker、RAF 或 wall-clock timer，只由 rendercore 的 `update(deltaSeconds)` 推进。

通常由 Scene Layout package runtime 更新 main reel：

```ts
app.ticker.add((ticker) => {
  runtime.update(ticker.deltaMS / 1000);
});
```

若创建 runtime 时使用了 `hostUpdatesMainReel: true`，则 runtime 不再推进该 reel，唯一宿主必须同时推进 host-owned reel：

```ts
app.ticker.add((ticker) => {
  const deltaSeconds = ticker.deltaMS / 1000;
  runtime.update(deltaSeconds);
  hostOwnedGridCellReel.update(deltaSeconds);
});
```

不能让 runtime 和 host 重复更新同一个 reel，否则 movement、symbol animation 和 effect 会被推进两次。

## Presentation delay

transfer 外使用通用 delay：

```ts
await runtime.waitForPresentationDelay(120);
```

支持 `AbortSignal`：

```ts
const controller = new AbortController();
const pending = runtime.waitForPresentationDelay(120, controller.signal);

controller.abort();
await pending; // rejects
```

`durationMs` 必须是有限非负数。`0` 立即完成；其它值只有在持续调用 `runtime.update()` 后才完成。runtime destroy 会拒绝全部未完成 delay。

## 通过 pos 获取 occurrence

```ts
const occurrence = runtime.getMainReelVisibleOccurrence(2, 1);
```

返回 `VisibleOccurrenceHandle`，不暴露 Pixi `Container`、`RenderSymbol`、raw zIndex 或 destroy 权限。

### 状态快照

```ts
const snapshot = occurrence.getSnapshot();

console.log(snapshot.x, snapshot.y);
console.log(snapshot.code);
console.log(snapshot.requestedState);
console.log(snapshot.resolvedState);
console.log(snapshot.onceCompletionCount);
```

### 几何快照

```ts
const geometry = occurrence.getGeometrySnapshot();

console.log(geometry.centerX, geometry.centerY);
console.log(geometry.cellWidth, geometry.cellHeight);
```

`centerX/centerY` 是 main reel 本地 authored pixel 坐标，可以用于计算 Bezier control points。

### Presentation value

```ts
occurrence.setPresentationValue(100);
occurrence.setPresentationValue(null);
```

### Await symbol state

```ts
await occurrence.playState("win", {
  transitionMode: "immediate",
  completion: "once-complete",
});
```

常用 completion：

- `entered`：真正进入目标状态时完成。
- `once-complete`：目标 once animation 完整播放一次。
- `next-loop-complete`：完成下一个真实 loop boundary。

handle 绑定 occurrence identity generation。occurrence 被替换、release 或回池后，旧 handle 会报告 stale，不会悄悄指向后来占据同一 pos 的 symbol。

## Occurrence effect attachment

occurrence effect 与已有 cell effect 是两个独立功能：

- cell effect 固定在 cell coordinate。
- occurrence effect 绑定 symbol identity，symbol 移动时随 occurrence 移动。

`key` 必须是 Scene Layout package 中 exact 声明的 runtime resource，当前支持 `spine | vni`。

### VNI

```ts
const effect = await occurrence.attachEffect({
  key: "coTrail",
  kind: "vni",
  transform: {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  },
  stacking: {
    layer: "above-effects",
    order: 10,
  },
});

await effect.play({
  kind: "vni",
  loop: false,
});
```

### Spine

```ts
const effect = await occurrence.attachEffect({
  key: "coArrival",
  kind: "spine",
  stacking: {
    layer: "above-symbols",
    order: 0,
  },
});

await effect.play({
  kind: "spine",
  animationName: "animation",
  loop: false,
});
```

### Stop 与 detach

```ts
effect.stop();
effect.detach();
```

- `stop()` 停止当前 playback；等待中的 `play()` 会结束。
- `detach()` 释放 attachment 和 player，重复调用安全。
- occurrence release、identity generation 改变或 runtime destroy 会自动清理 attachment。
- attachment resource load/init 期间 occurrence 已失效时，attach 会失败并释放已创建资源。

循环 effect 不会自然完成，不能直接与 movement 永久 `Promise.all`。循环拖尾应显式停止：

```ts
const playback = trail.play({ kind: "vni", loop: true });
await tx.move(motion);
trail.stop();
await playback;
```

## Awaitable transfer

最小直线移动：

```ts
await runtime.runMainReelVisibleOccurrenceTransfer(
  {
    source: { x: 0, y: 0 },
    target: { x: 2, y: 1 },
    sourceReplacementCode: 3,
    sourceReplacementPresentationValue: null,
  },
  async (tx) => {
    await tx.move({
      durationMs: 320,
      path: { kind: "line" },
      easing: {
        kind: "cubic-bezier",
        x1: 0.2,
        y1: 0,
        x2: 0.2,
        y2: 1,
      },
      stacking: {
        layer: "above-effects",
        order: 0,
      },
    });

    await tx.commit();
  },
);
```

`move()` 完成只表示 moving occurrence 已到达 target geometry，不自动修改 committed reel 数据。callback 必须显式 `await tx.commit()`；callback 无 commit 返回时，外层 Promise reject 并 rollback。

## Source replacement 与 hole

非负 code 表示 source 落回 replacement symbol：

```ts
{
  sourceReplacementCode: 3,
  sourceReplacementPresentationValue: 100,
}
```

exact `-1/null` 表示 source 成为空位：

```ts
{
  sourceReplacementCode: -1,
  sourceReplacementPresentationValue: null,
}
```

规则：

- `sourceReplacementCode === -1` 时 value 必须是 `null`。
- 非负 code 必须是可创建的 exact symbol code。
- 小于 `-1`、非 safe integer 或 `-1` 携带非 null value 都在 display mutation 前失败。

## Path 与 time easing

空间 path 和时间 easing 是两个正交参数：

- path 决定经过哪些位置。
- easing 决定 elapsed progress 如何映射为 path progress。

### Line

```ts
path: {
  kind: "line";
}
```

### 单段 cubic Bezier

```ts
const source = runtime.getMainReelVisibleOccurrence(0, 0).getGeometrySnapshot();
const target = runtime.getMainReelVisibleOccurrence(3, 1).getGeometrySnapshot();

const path = {
  kind: "cubic-bezier-path",
  segments: [
    {
      control1: {
        x: source.centerX,
        y: source.centerY - 160,
      },
      control2: {
        x: target.centerX,
        y: target.centerY - 160,
      },
      end: {
        x: target.centerX,
        y: target.centerY,
      },
    },
  ],
} as const;
```

source 是隐式起点。最后一个 segment 的 `end` 必须精确等于 target 的 `centerX/centerY`。

### 多段 cubic Bezier

```ts
path: {
  kind: "cubic-bezier-path",
  segments: [
    {
      control1: { x: 100, y: 50 },
      control2: { x: 180, y: 20 },
      end: { x: 220, y: 100 },
    },
    {
      control1: { x: 260, y: 180 },
      control2: { x: 340, y: 180 },
      end: {
        x: target.centerX,
        y: target.centerY,
      },
    },
  ],
}
```

后一段起点自动取前一段 `end`。rendercore 为整条 path 建立确定性的累计弧长 lookup，按实际距离行进，不把总时间平均分给每个 segment。

### Easing

匀速：

```ts
easing: {
  kind: "linear";
}
```

CSS-style cubic Bezier：

```ts
easing: {
  kind: "cubic-bezier",
  x1: 0.2,
  y1: 0,
  x2: 0.2,
  y2: 1,
}
```

约束：

- `durationMs` 必须是有限正数。
- 所有 path/easing 坐标必须是有限数。
- easing `x1/x2` 必须位于 `[0, 1]`。
- progress `0/1` 精确命中 source/target。

## Semantic stacking 与 mask

```ts
stacking: {
  layer: "above-symbols",
  order: 0,
}
```

`above-symbols` 高于全部静止 symbol，但低于 reel effects。

```ts
stacking: {
  layer: "above-effects",
  order: 0,
}
```

`above-effects` 同时高于静止 symbol 和 reel effects。

`order` 必须是非负 safe integer，用于同一语义层内的相对顺序，不是 raw Pixi zIndex。移动保留完整 board mask；曲线超出盘面的部分会被裁切。

## Scope 内的 moving 与原 target

scope 提供两个 identity-bound handle：

- `tx.moving`：source 的完整 occurrence。
- `tx.target`：commit 前 target 原本存在的 occurrence。

```ts
await runtime.runMainReelVisibleOccurrenceTransfer(input, async (tx) => {
  await tx.move(motion);

  await Promise.all([
    tx.moving.playState("arrival", {
      transitionMode: "immediate",
      completion: "once-complete",
    }),
    tx.target.playState("hit", {
      transitionMode: "immediate",
      completion: "once-complete",
    }),
  ]);

  await tx.commit();
});
```

生命周期语义：

- 调用 `tx.move()` 后，source pos 被 transfer 租用，通过 pos 重新查询 source 会失败。
- commit 前 target pos 和 `tx.target` 仍表示原 target occurrence。
- commit 时 target 获得 moving occurrence，source 获得 replacement 或 hole，原 target 被释放。
- commit 后原 target handle 变 stale，原 target occurrence effects 自动清理。
- `tx.moving` 继续表示已经落在 target 的 occurrence，可以用于 commit 后动画。

如果原 target 需要播放 hit/effect，应在 commit 前完成。如果要对新 target 播放落地动画，可在 commit 后继续使用 `tx.moving`。

## Movement 与 effect 组合

非循环 effect 可以直接并行：

```ts
await runtime.runMainReelVisibleOccurrenceTransfer(input, async (tx) => {
  const trail = await tx.moving.attachEffect({
    key: "coTrail",
    kind: "vni",
    stacking: { layer: "above-effects", order: 10 },
  });

  await Promise.all([
    tx.move(motion),
    trail.play({ kind: "vni", loop: false }),
  ]);

  await tx.commit();
});
```

循环拖尾：

```ts
await runtime.runMainReelVisibleOccurrenceTransfer(input, async (tx) => {
  const trail = await tx.moving.attachEffect({
    key: "coTrail",
    kind: "vni",
  });
  const trailPlayback = trail.play({ kind: "vni", loop: true });

  await tx.move(motion);

  trail.stop();
  await trailPlayback;
  await tx.commit();
});
```

## Transfer 内插入节奏

`tx.delay()` 使用同一个 reel update clock：

```ts
await runtime.runMainReelVisibleOccurrenceTransfer(input, async (tx) => {
  await tx.delay(80);
  await tx.move(motion);
  await tx.delay(60);

  await Promise.all([
    tx.moving.playState("arrival", {
      transitionMode: "immediate",
      completion: "once-complete",
    }),
    tx.target.playState("hit", {
      transitionMode: "immediate",
      completion: "once-complete",
    }),
  ]);

  await tx.delay(40);
  await tx.commit();
});
```

## 游戏侧 for + await 示例

```ts
for (const route of routes) {
  await runtime.waitForPresentationDelay(route.intervalMs);

  await runtime.runMainReelVisibleOccurrenceTransfer(
    {
      source: route.source,
      target: route.target,
      sourceReplacementCode: route.replacementCode,
      sourceReplacementPresentationValue: route.replacementValue,
      signal: roundAbortController.signal,
    },
    async (tx) => {
      const source = tx.moving.getGeometrySnapshot();
      const target = tx.target.getGeometrySnapshot();

      const trail = await tx.moving.attachEffect({
        key: route.trailResource,
        kind: "vni",
        stacking: {
          layer: "above-effects",
          order: route.order,
        },
      });
      const trailPlayback = trail.play({ kind: "vni", loop: true });

      await tx.move({
        durationMs: route.durationMs,
        path: {
          kind: "cubic-bezier-path",
          segments: [
            {
              control1: {
                x: source.centerX,
                y: source.centerY - route.arcHeight,
              },
              control2: {
                x: target.centerX,
                y: target.centerY - route.arcHeight,
              },
              end: {
                x: target.centerX,
                y: target.centerY,
              },
            },
          ],
        },
        easing: route.easing,
        stacking: {
          layer: "above-effects",
          order: route.order,
        },
      });

      trail.stop();
      await trailPlayback;

      const arrival = await tx.moving.attachEffect({
        key: route.arrivalResource,
        kind: "spine",
      });

      await Promise.all([
        arrival.play({
          kind: "spine",
          animationName: route.arrivalAnimation,
          loop: false,
        }),
        tx.target.playState(route.targetHitState, {
          transitionMode: "immediate",
          completion: "once-complete",
        }),
      ]);

      await tx.commit();
    },
  );
}
```

rendercore 不检查多条 route 之间的业务冲突。游戏必须提供适合当前顺序执行的 source/target、replacement/value 和 path 参数。

## Abort、rollback 与 destroy

```ts
const controller = new AbortController();

const pending = runtime.runMainReelVisibleOccurrenceTransfer(
  {
    source: { x: 0, y: 0 },
    target: { x: 2, y: 1 },
    sourceReplacementCode: -1,
    sourceReplacementPresentationValue: null,
    signal: controller.signal,
  },
  async (tx) => {
    await tx.delay(100);
    await tx.move(motion);
    await tx.commit();
  },
);

controller.abort();
await pending; // rejects
```

未 commit 时出现以下情况会 rollback：

- callback 抛错或正常返回但未 commit。
- delay、movement、symbol state 或 effect playback 失败。
- `AbortSignal` abort。
- reel reset。
- reel/runtime destroy。

rollback 会恢复 source occurrence、释放预创建 replacement、保留原 target，并清理临时 overlay/mask。已经完成并 commit 的前序 transfer 不会因为后续调用失败而倒放。

## 并发与调用限制

- source 和 target 必须不同，且开始时都必须 occupied。
- 同一个 grid-cell reel 同时只允许一个 scoped transfer。
- 一个 scope 只能调用一次 `move()`。
- movement 到达后才能调用 `commit()`。
- `commit()` 只能调用一次。
- callback 必须显式 commit。
- 不支持 standard reel。
- 不提供跨 operation timeline DSL、自动 stagger 或 CO route interpreter。
- 不自动合并 source/target 业务数据；target 原 occurrence 的后续表现由游戏在 commit 前决定。

## 低层 manual batch API

既有 batch API 继续保留，且支持 exact hole：

```ts
const prepared = runtime.prepareMainReelVisibleOccurrenceTransferBatch({
  transfers: [
    {
      source: { x: 0, y: 0 },
      target: { x: 2, y: 1 },
      sourceReplacementCode: -1,
      sourceReplacementPresentationValue: null,
    },
  ],
});

prepared.start();
prepared.setProgress(0.5);
prepared.setProgress(1);
prepared.commit();
```

低层 API 保持既有固定直线/ease-out 和 consumer-managed progress，主要用于兼容现有调用。新业务需要 duration、Bezier、effect、delay、abort 和自动 rollback 时，应优先使用 `runMainReelVisibleOccurrenceTransfer()`。
