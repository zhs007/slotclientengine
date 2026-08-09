# game002v2

game002 的精简重写。运行时直接消费 `assets/crave` 解包目录，并通过
`SceneLayoutPackageRuntime` 调用 Gamelayout 已绑定的背景、Symbols、转场和 Popup。

回合表现是直接的异步调用链，不生成 execution plan、mutation contract 或 rollback。
业务失败采用 fail-stop；下一次恢复由重新连接/初始化负责。
