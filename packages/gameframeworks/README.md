# @slotclientengine/gameframeworks

`gameframeworks` 是后续 slot 游戏默认 facade。游戏侧默认只依赖 `@slotclientengine/gameframeworks`，由本包整合 `uiframeworks` HUD、`netcore` live session 和 `logiccore` 的 `GameLogic`。

## 基本用法

```ts
import {
  createSlotGameFramework,
  getComponentScenesByName,
  type SlotGameAdapter,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";

const gameAdapter: SlotGameAdapter = {
  mount(context) {
    context.gameLayer.append(document.createElement("ol"));
  },
  async playSpin(logic) {
    const scenes = getComponentScenesByName(logic, "lineWin");
    console.log(logic.getTotalWin(), scenes.length);
  },
};

const framework = createSlotGameFramework({
  root: document.querySelector("#app")!,
  gameAdapter,
  live: {
    serverUrl: "wss://example.test/game",
    token: "token",
    gamecode: "game001",
  },
  betOptions: [{ bet: 1, lines: 10 }],
});

await framework.connect();
await framework.spin();
```

## 游戏侧合同

- `framework.spin()` 返回 `Promise<GameLogic>`。
- `adapter.playSpin(logic)` 收到的就是当前 spin 的 `GameLogic`。
- `adapter.playSpin(logic)` 的 Promise resolve 表示游戏动画或展示完成；框架随后按协议自动 collect。
- 游戏不要解析 `gmi.replyPlay` 或调用 `client.collect()`。
- `balance`、`bet`、`win`、spin 状态和 collect 状态由框架自动驱动 HUD。

## 逻辑读取

本包重新导出 `GameLogic`、`GameLogicStep`、`LogicComponent`、`SceneMatrix`、`WinResult` 等常用类型。游戏可通过 `logic.getStep(index)`、`logic.getComponentScenes(stepIndex, name)`，或以下 helper 按组件名读取：

- `findComponentSteps(logic, name)`
- `getComponentScenesByName(logic, name, options?)`
- `getComponentResultsByName(logic, name, options?)`

helper 只接收 `GameLogic`，不会暴露 raw 协议 wrapper。

## Fail-fast 策略

- live URL 只允许 `ws://` 或 `wss://`。
- mock 只用于测试和 viewer 显式 mock 模式。
- 缺少 `gmi`、`totalwin`、`results`、结果长度不一致、非法 balance 或 logic 解析失败都会抛错。
- adapter reject、collect 失败、netcore `error`、非预期 `disconnect`、`reconnecting`、服务端错误消息和 logger `warn/error` 都会让框架进入 error。

## Collect 时序

spin 顺序为：

```text
UI spinning -> netcore spin -> GameLogic -> UI presenting -> adapter.playSpin(logic)
  -> adapter resolve -> optional collect -> UI idle
```

最终 collect 规则保持为：

```ts
(totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
```

因此 `framework.spin()` resolve 时，必要 collect 已完成并且状态已回到可安全下一次 spin 的 `idle`。

## 验收命令

```bash
pnpm --filter @slotclientengine/gameframeworks lint
pnpm --filter @slotclientengine/gameframeworks test
pnpm --filter @slotclientengine/gameframeworks typecheck
pnpm --filter @slotclientengine/gameframeworks build
```
