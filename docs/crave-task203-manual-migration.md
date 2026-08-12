# Crave task 203 人工迁移说明

> RenderObject统一API已由任务205更新。value/text/symbol飞行请以
> [`docs/crave-render-object-migration.md`](./crave-render-object-migration.md) 为准；本文其余Popup与转场顺序仍有效。

本文基于 Crave `49c19087b825c4bbebce00f2286c9d60080e9ebb`，只提供人工修改步骤；RenderCore 任务不会写入 Crave 仓库。

## 1. Symbol value/text 与飞行

WL/WM/CM multiplier、CN value、whole symbol clone、统一 `RenderObject` 调用、生命周期和旧API对照已经集中到
[`crave-render-object-migration.md`](./crave-render-object-migration.md)。Crave必须使用该文档的canonical API，
不要继续使用任务203时期的四个专用clone/anchor方法。

## 3. 获奖庆祝完成后再转场

Crave 当前没有使用 `operation[]`，继续保留 `round-adapter.ts` 的直接 `for/await` 编排。把 fire-and-forget：

```ts
runtime.startAwardCelebrationForCurrentMode(input);
```

替换为：

```ts
await runtime.playAwardCelebrationForCurrentMode(input);
```

新 Promise 在完整庆祝生命周期结束后 resolve。宿主 ticker 必须继续调用 `runtime.update(deltaSeconds)`；现有 Crave ticker 已满足。

### 进入免费游戏

在 `bg-triggerfg` 分支中，顺序必须是：

```ts
if (triggerAwardRaw > 0) {
  await runtime.playAwardCelebrationForCurrentMode({
    betAmountRaw: logic.getBet() * logic.getLines(),
    winAmountRaw: triggerAwardRaw,
  });
}
await runtime.prepareGameModeTransition("FreeGame");
await runtime.requestGameMode("FreeGame");
```

`triggerAwardRaw` 必须由 Crave 从本次触发前已完成 step 的业务赢分显式计算。RenderCore 不从 `bg-triggerfg` 或 mode 推断金额。若产品定义为截至触发 step 的累计奖励，可在 adapter 循环中累计 `step.getCoinWin()` 并在该分支消费；不要直接用整轮 `logic.getTotalWin()` 代替，避免提前包含尚未播放的免费局奖励。

### 免费游戏结束

离开 FreeGame 前，顺序必须是：

```ts
if (freeGameAwardRaw > 0) {
  await runtime.playAwardCelebrationForCurrentMode({
    betAmountRaw: logic.getBet() * logic.getLines(),
    winAmountRaw: freeGameAwardRaw,
  });
}
await runtime.prepareGameModeTransition("BaseGame");
await runtime.requestGameMode("BaseGame");
```

此时 popup 在当前稳定的 FreeGame mode 上选择，结束后才转回 BaseGame。`freeGameAwardRaw` 同样由 Crave 按产品定义累计，不由 RenderCore计算。

删除 `playSpin()` 末尾现有的“先回 BaseGame、再以 `logic.getTotalWin()` fire-and-forget 庆祝”代码，避免重复弹窗与错误 mode popup。

## 4. Spine Popup 点击

无需在 Crave 复制状态机。RenderCore 已统一为：

- start 点击忽略；
- loop 点击立即进入 end；
- end 点击忽略。

继续使用 `bindPopupInput()` 或 `requestPrimaryPopupInteraction()` 即可。

## 5. 人工验证

1. WL 初次落地不显示 manifest 预览 `x2`；收到业务倍率后显示 exact `xN`，并在 normal/dropdown/appear/win/feature state 保持。
2. CN 从 5→25→500→1000 自动切档；WL/WM/CM 的 multiplier clone 能分别飞向命名场景节点和另一个 symbol。
3. start 阶段点击无效；loop 点击当帧切 end；重复点击不跳过 end。
4. 入免费：庆祝完整结束后才开始转场；出免费：FreeGame 庆祝完整结束后才转回 BaseGame；无重复总赢弹窗。

Crave 仓库内建议人工应用后运行：

```bash
pnpm --filter crave typecheck
pnpm --filter crave test
rg -n "setMainReelSymbolPresentationValue|startAwardCelebrationForCurrentMode" apps/crave/src
```
