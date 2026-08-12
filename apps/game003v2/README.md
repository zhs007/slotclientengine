# game003v2

主转轮通过 Scene Layout runtime 的 `getReelArea("main")` 完全使用 RenderCore 第一层接口。请求发出后
五列同步 targetless `start()`；响应 landing 按 runtime config 的 `stopDelayMs` 使用 operation frame
delay 错峰调用 `settle()`，没有预转时调用 `roll()`，最终以 `Promise.all()` 等待全部列。app 不计算
local final phase、不轮询 reel completion，也不截断 ticker delta；落停 scene/value 与 symbol runtime
ownership 仍由 RenderCore 负责。

中奖循环由 game003v2 以 `area.present(..., { repeat: true })`、`getSymbols()` 和 awaitable
`SymbolGroup.playState("win")` 编排单轮；金额使用通用TextRenderObject，通过group center anchor和`context.withNode()`
定位、挂载及自动销毁。首轮完成后operation可以结束，后台重复和下一次`area.spin.start()`的中断由area内部管理；app
不自建deferred Promise、`while(true)`、中心坐标计算或transient node cleanup，也不使用旧carousel、state snapshot、
geometry snapshot或raw reel presentation container。逐列landing使用通用`createAreaSpinFunction()`装配left-to-right cadence。

`game003v2` 是 Minecart 的精简 live consumer。美术、layout、公开轮带、Symbols 与 Popup
唯一来自 `assets/minecart2`；该目录由 `layout10.zip` 经 `gamelayoutpkgcli optimize --quality 80`
后的 ZIP 完整解包得到。

运行时只把 `assets.map.json` 当 logical key 到安全 physical path 的路由。不会校验 hash、
byte size、content-addressed 文件名、orphan 或整包 closure；manifest 或 typed binding 实际引用的
文件缺失时在消费点直接报错，也不会从 `assets/game003` 或其它 app 回退。

`assets/minecart2` 由 Vite 原样作为 public 目录提供；美术替换该目录后只需重启开发服务或重新构建，
无需生成或修改 TypeScript 资源绑定。

回合响应先编译、finalize 为 immutable `SlotOperationPlanV2`，再交给 rendercore coordinator。
framework 发出请求后立即调用 targetless standard continuous spin；响应到达后首个 landing operation
在同一 transaction 注入目标并落停，失败或销毁时取消。

```bash
CI=true pnpm --filter game003v2 dev -- --host 0.0.0.0
CI=true pnpm --filter game003v2 test
```
