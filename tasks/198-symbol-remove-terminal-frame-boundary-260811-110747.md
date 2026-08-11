# 任务 198 执行报告：Symbols once 完成行为与 terminal remove 边界

## 结论

任务实现完成。`symbol-state-textures.manifest.json` 现在支持 strict v1/v2，并在加载边界把合法 v1 自动升级为 canonical v2：exact `remove` 填 `terminal`，其它 once 填 `return-to-default`。v2 直接使用完整 `settings.stateDefinitions`，runtime、Symbols Editor 与 game002v2 不再按状态名推断完成行为。

terminal once 在独立 `RenderSymbol` 中保持终态且可 Replay；grid-cell occurrence 在自身 once completion 的同步 `update()` 边界直接 release，不再通过 Promise continuation 提交，因此不会先恢复 normal 再多渲染一帧。symbol cascade 与 configured round 的 remove 路径已统一改用 shared terminal transaction。

## Schema 与迁移

- 外层 `symbols.package.json` 继续为 v1；只升级内层 symbol-state-textures manifest。
- v2 `settings.stateDefinitions[]` 保存完整 builtin/custom 定义。
- once/once 必须声明 `afterComplete: "return-to-default" | "terminal"`；stable/static 或 stable/loop 禁止该字段。
- v2 缺 builtin、重复定义、非法组合、缺 once 完成行为、混写 `additionalStateDefinitions`、未知字段或未来版本均显式失败。
- `upgradeSymbolStateTextureManifest()` 先 strict parse source，再输出 deep-frozen canonical v2；对 v2 幂等。
- package resource 加载与两种 materialize 路径都输出 canonical v2 raw manifest；正式 assets 未批量改写。

## Runtime 与 consumer

- `SymbolStateMachine.notifyOnceComplete()` 按显式 `afterComplete` 返回 default 或保持 terminal。
- `RenderSymbol.playTerminalState()` 在 completion edge 同步调用 occurrence owner，并支持同一 terminal state Replay。
- `RenderGridCellReelSet.removeVisibleSymbols()` 全批 preflight terminal capability，exact occurrence 在 completion callback 内同步 release；Promise 仅汇总结果。
- symbol cascade 的 group、sequential collect 与 overlapping collect，以及 configured round v1 flow，均不再等待 remove 回 normal。
- game002v2 保持 `removeMainReelSymbols()` 边界；source guard 证明 app 不调用私有 release，也没有 `state/id === remove` 分支。
- 为让既有 game002 shared cascade target 满足新增 transaction contract，仅在 `apps/game002/src/game002-reel-controller.ts` 增加对同一 grid-cell API 的透传；没有加入业务判断。

## Symbols Editor

- typed project state definition 保存 `afterComplete`。
- v1 ZIP 打开后，项目状态定义直接显示迁移值；v2 输入保留显式值。
- 项目状态 UI 为 once 显示完成行为 select，新建 custom once 要求显式值；stable 不保存该字段。
- 新导出恒为 v2 完整 `stateDefinitions`；旧 `additionalStateDefinitions` 不再输出。
- preview/Replay 继续只调用 shared RenderSymbol 状态机，没有 remove 名称分支。

## 自动化结果

基线 HEAD：`ff7b860443983d403c23b179ff77f688d8192a1a`。

通过：

- `pnpm --filter @slotclientengine/rendercore build`
- rendercore 定向 Vitest：9 files、145 tests 全部通过，覆盖 manifest migration/v2 strict、state machine、terminal Replay、package/materialize、completion update 返回前同步 hole、cascade 与 configured round。
- `pnpm --filter symbolseditor typecheck`
- `pnpm --filter game002v2 typecheck`
- Symbols Editor `zip-io` 与 `preview-layout`：2 files、10 tests 全部通过。
- Symbols Editor 本任务定向 model/UI：4 tests 通过。
- `pnpm --filter game002v2 test`：8 files、15 tests 全部通过。
- `git diff --check` 通过。

完整 Symbols Editor 指定组合运行结果为 40 passed、9 failed。9 个失败均在读取测试主体前因当前 worktree 缺少 Crave fixture 而退出：`h1.webp`、`cn_1.json` 或 `symbol-state-textures.manifest.json` 在 fixture map 中不可用。相同命令中的 `zip-io`、`preview-layout` 与所有不依赖这些 fixture 的本任务测试已单独通过；未伪造或补写 production 美术 fixture。

## 人工浏览器验收

按用户要求由用户执行，当前未标记为自动完成。建议检查：

1. Symbols Editor 打开旧 v1 ZIP，确认 remove=`terminal`、其它 once=`return-to-default`。
2. terminal remove 播放结束后保持终态，Replay 能重新播放；切成 return-to-default 后回 normal。
3. 导出重开后 manifest 为 v2 且值保持。
4. game002v2 跑含 remove/dropdown/refill 的 round，逐帧确认 removed symbol 不闪 normal、不多出一帧，后续 fall 正常。

## 范围与工作区

- 未修改正式 assets、YAML、外层 package schema、server 协议、logiccore 或 lockfile。
- 更新了 rendercore/Symbols Editor/game002v2 README，以及 `editor-artifacts.md`、`shared-game-runtime.md` 的长期合同。
- 未 commit、未 push。
