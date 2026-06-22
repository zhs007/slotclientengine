# gameframeworksviewer

`gameframeworksviewer` 是 `@slotclientengine/gameframeworks` 的最小可运行验证 app。它不做真实 reels/canvas/Pixi 渲染，只在 game layer 输出每次 spin 的格式化 `GameLogic` list，用来检查 `spin -> logic -> 游戏展示完成 -> collect` 的完整流程。

## Mock 模式

默认 mock 模式可离线运行：

```bash
pnpm --filter gameframeworksviewer dev -- --host 127.0.0.1 --port 5203
```

mock 场景包含中奖、无中奖、零赢分多段结果和 delayed spin。delayed spin 至少延迟 1000ms，可用于观察 pending 期间 UI 状态和 tick 是否仍更新。

## Live 模式

live 模式必须显式设置 `VITE_GAMEFRAMEWORKSVIEWER_MODE=live`，不会从 mock 隐式 fallback。未覆盖其他变量时，会复用 `apps/gameclientcli` / `apps/game001` 前序任务的默认 live 参数：

```text
server url: wss://gameserv.rgstest.slammerstudios.com/
gamecode: CqbQ0Y7gtBpO5419j8h02
businessid: guest
jurisdiction: MT
clienttype: web
language: en
bet=10 lines=10 times=1 autonums=-1
requestTimeoutMs=30000
```

```bash
VITE_GAMEFRAMEWORKSVIEWER_MODE=live \
pnpm --filter gameframeworksviewer dev -- --host 127.0.0.1 --port 5203
```

可用同名 `VITE_GAMEFRAMEWORKSVIEWER_*` 变量覆盖 server、token、gamecode、businessid、clienttype、jurisdiction、language、request timeout 和 spin 参数。

服务器 live 金额使用 USD 最小单位：`100` 表示 `$1.00`，`10` 表示 `$0.10`。viewer 的 HUD 在 live 模式会按 `/100` 展示金额；Logic list 仍保留服务器返回的原始数值，方便核对协议数据。

## List 内容

每条记录包含 viewer 自己维护的 spin id、bet、lines、times、totalwin、step 数量、result 数量、每个 step 的 win/scene/result 摘要，以及 `lineWin`、`bonus`、`freeSpin` 等组件名查询结果。

中奖场景会在 list 追加后 collect；无中奖单结果不 collect。

## 验收命令

```bash
pnpm --filter gameframeworksviewer lint
pnpm --filter gameframeworksviewer test
pnpm --filter gameframeworksviewer typecheck
pnpm --filter gameframeworksviewer build
```
