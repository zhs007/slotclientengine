# game003v2

`game003v2` 是 Minecart 的精简 live consumer。美术、layout、公开轮带、Symbols 与 Popup
唯一来自 `assets/minecart2`；该目录由 `layout10.zip` 经 `gamelayoutpkgcli optimize --quality 80`
后的 ZIP 完整解包得到。

运行时只把 `assets.map.json` 当 logical key 到安全 physical path 的路由。不会校验 hash、
byte size、content-addressed 文件名、orphan 或整包 closure；manifest 或 typed binding 实际引用的
文件缺失时在消费点直接报错，也不会从 `assets/game003` 或其它 app 回退。

回合响应先编译、finalize 为 immutable `SlotOperationPlanV2`，再交给 rendercore coordinator。
framework 发出请求后立即调用 targetless standard continuous spin；响应到达后首个 landing operation
在同一 transaction 注入目标并落停，失败或销毁时取消。

```bash
CI=true pnpm --filter game003v2 dev -- --host 0.0.0.0
CI=true pnpm --filter game003v2 check:resources
CI=true pnpm --filter game003v2 test
```
