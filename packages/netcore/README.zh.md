# @slotclientengine/netcore

`slotclientengine` monorepo 内部使用的网络库。它通过 `SlotcraftClient` 统一封装 WebSocket 联机流程与回放调试流程，供后续应用和游戏模板复用。

英文说明见 [README.md](./README.md)。

## 当前定位

- workspace 包名：`@slotclientengine/netcore`
- 使用范围：当前仓库内部包
- 包管理器：`pnpm`
- 编排工具：`turbo`
- 构建产物：`dist/` 下的 CommonJS 输出

当前文档以 monorepo 内部使用为前提，不再按“独立发布 npm 包”描述。

## 主要能力

- 对外提供统一的 `connect`、`enterGame`、`spin`、`collect`、`selectOptional` 等接口。
- 内部维护连接状态机，并处理重进游戏后的恢复状态。
- 提供 `state`、`message`、`raw_message`、`disconnect` 等事件。
- 联机模式下支持异常断线后的重连。
- URL 为 HTTP(S) 时可切换到回放模式，用静态 JSON 调试游戏流程。

## 在 workspace 中使用

由其他 workspace 包依赖并导入：

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';
```

## 最小示例

```ts
import { ConnectionState, SlotcraftClient } from '@slotclientengine/netcore';

async function run() {
  const client = new SlotcraftClient({
    url: 'ws://your-game-server.example/ws',
    token: 'user-token',
    gamecode: 'game-code-001',
    businessid: 'demo',
    clienttype: 'web',
    language: 'zh',
  });

  client.on('state', ({ current }) => {
    console.log('state:', current);
  });

  await client.connect();
  await client.enterGame();

  while (client.getState() !== ConnectionState.IN_GAME) {
    const state = client.getState();

    if (state === ConnectionState.SPINEND) {
      await client.collect();
      continue;
    }

    if (state === ConnectionState.WAITTING_PLAYER) {
      await client.selectOptional(0);
      continue;
    }

    if (state === ConnectionState.RESUMING) {
      await new Promise((resolve) => client.once('state', resolve));
      continue;
    }

    throw new Error(`恢复阶段遇到未处理状态: ${state}`);
  }

  const result = await client.spin({ bet: 100, lines: 10 });
  console.log(result);
  client.disconnect();
}

run().catch(console.error);
```

## 公开 API

- `connect(token?)`：建立连接并完成登录。
- `enterGame(gamecode?)`：进入目标游戏。
- `spin(params)`：执行一次局内操作。
- `collect(playIndex?)`：领取当前或推导出的结果。
- `selectOptional(index)`：处理等待玩家选择的状态。
- `selectSomething(clientParameter)`：向服务端 `selectany` 流程发送字符串参数。
- `send(cmdid, params)`：直接发送底层命令。
- `getState()`、`getUserInfo()`：读取运行时状态和缓存。

## 开发命令

从仓库根目录执行：

- `pnpm --filter @slotclientengine/netcore build`
- `pnpm --filter @slotclientengine/netcore test`
- `pnpm --filter @slotclientengine/netcore typecheck`
- `pnpm --filter @slotclientengine/netcore lint`
- `pnpm --filter @slotclientengine/netcore run check`

仓库级统一验证命令：

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 相关文档

- `docs/usage_en.md`：简明英文集成说明
- `docs/usage_zh.md`：简明中文集成说明
- `docs/frontend-ws-doc-en.md`：偏协议层的 WebSocket 说明
- `examples/example001.ts`：本地调试示例

`collect` 操作是游戏循环中的一个关键部分，用于正式确认来自服务器的结果，通常是赢奖。

-   **何时需要 `collect`？**: 在 `spin` 或 `selectOptional` 操作后，如果结果是赢奖或多阶段的特色玩法，客户端的状态将转换为 `SPINEND`。这表明需要调用 `collect()` 来确认结果，然后才能进行下一次 spin。
-   **自动收集 (Auto-Collect)**: 为了简化开发者体验并减少网络往返，该库实现了一个“自动收集”机制。如果单个操作（如 spin）产生了多个结果（例如，基础游戏赢奖触发了带有其自身结果的特色玩法），该库将在后台自动对所有中间结果调用 `collect()`。这样，只留下最后一个结果供用户手动 `collect()`，从而极大地简化了游戏流程。

### `selectOptional` 与 `selectSomething` 的对比

虽然这两种方法都用于玩家选择，但它们的目的根本不同：

-   **`selectOptional(index)`**: 此方法专门用于 `WAITTING_PLAYER` 状态。此状态是 **由服务器驱动的**；服务器上的游戏逻辑已暂停，并等待客户端从其提供的特定选项列表中进行选择。调用 `selectOptional` 会将玩家的选择发送回服务器，从而使被阻塞的游戏逻辑得以继续。

-   **`selectSomething(clientParameter)`**: 这是一个更通用的、**由客户端驱动的** 操作。它用于通过 `selectany` 命令向服务器发送自定义字符串参数。它不对应于一个被阻塞的服务器状态。相反，它是客户端发送信息或触发不符合标准 `spin` 或 `selectOptional` 流程的自定义功能的一种方式。
