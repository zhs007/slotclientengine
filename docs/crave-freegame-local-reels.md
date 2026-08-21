# Crave FreeGame 单次本地轮带接入

rendercore 的 legacy grid-cell Scene Layout spin 入口现在接受可选的 `localReels`。它是
x-first 的二维数组：第一层索引是列 `x`，第二层是该列循环播放的公开视觉轮带。

这份改动不需要修改 Crave 的 gameconfig，也不会把数组写回 Symbol package。数组只在本次
spin 中生效，服务器返回的 `scene` 仍作为最终落点覆盖可见窗口。

## 1. 在 Crave 中声明数组

可直接在 `apps/crave/src/round-adapter.ts` 顶层常量区加入真实图标码：

```ts
const FREE_GAME_LOCAL_REELS = [
  [
    /* 第 0 列循环图标码 */
  ],
  [
    /* 第 1 列循环图标码 */
  ],
  [
    /* 第 2 列循环图标码 */
  ],
  [
    /* 第 3 列循环图标码 */
  ],
  [
    /* 第 4 列循环图标码 */
  ],
  [
    /* 第 5 列循环图标码 */
  ],
] as const;
```

每一列是完整循环轮带，不是最终的 6 × 9 盘面。当前 Crave grid-cell phase 会为同列 9 格抽取
互不重复的起始 phase，所以每列至少放 9 个元素。图标码必须能被当前 Symbols package 的
registry 解析。

rendercore 不额外预校验这份数组：列数、长度或图标码不对时，会在现有 phase/reel/symbol
消费位置直接抛错并进入 Crave 现有 fail-stop 流程。

## 2. FreeGame 预转时传入

在 `startSpinPresentation()` 里已经有 `freeGame` 判断。给
`startMainReelContinuousSpin()` 的参数增加条件字段：

```ts
runtime.startMainReelContinuousSpin({
  ...createGame002v2ContinuousSpinInput(
    inputScene,
    this.requireSpinCodes(),
    this.#reelPresentation,
    freeGame,
  ),
  ...(freeGame ? { localReels: FREE_GAME_LOCAL_REELS } : {}),
  random: Tools.secureRandom,
});
```

## 3. FreeGame 落停时再次传入

在 `spinTo()` 创建 `input` 时，按现有 `kind` 增加同一数组：

```ts
const input = {
  scene,
  localPhaseYs: this.localPhases(),
  ...(kind === "freegame" ? { localReels: FREE_GAME_LOCAL_REELS } : {}),
  random: Tools.secureRandom,
  presentationValues,
  // 原有 buildGridCellSpinPlan 保持不变
} as const;
```

预转和落停必须传入同一份 `FREE_GAME_LOCAL_REELS`。这样响应回来前的连续滚动、响应后的临时
落停 strip 都使用特殊轮带；最终显示仍精确提交服务器 `scene`。没有预转的 FreeGame 普通
`spinMainReelToScene(input)` 也会直接使用这份数组。

BaseGame、`plain`、cascade 和 anticipation refill 不加 `localReels`，继续使用 gameconfig 中的
公开轮带。

## 4. 同步 rendercore

Crave 需要同步包含以下文件的 rendercore 版本：

- `packages/rendercore/src/scene-layout/types.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/reel/types.ts`
- `packages/rendercore/src/reel/render-reel.ts`
- `packages/rendercore/src/reel/render-grid-cell-reel-set.ts`

对外调用字段只有一个：

```ts
readonly localReels?: readonly (readonly number[])[];
```
