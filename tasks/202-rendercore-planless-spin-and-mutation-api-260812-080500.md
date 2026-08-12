# 任务 202 执行报告：RenderCore direct mutation 与 active spin session

## 结果

完成一组增量、无 gameplay plan 的 RenderCore API，同时保持 game002v2 当前 grid-cell plan/drain/polling 调用链不变。

- 新增独立 `SymbolMutationArea`：`replaceSymbol/replaceSymbols` 返回新 exact `SymbolRender/SymbolGroup`，旧 façade stale。
- `SymbolGroup` 新增 mapped `setValues/setStates`，全组先 preflight再提交。
- 新增 standard reel 与 CellSpin active session controller；`SpinningReel/SpinningCell.land()` resolve 后直接返回落地 SymbolGroup/SymbolRender，
  stable `overlay` 复用现有 reel/cell attachment owner。
- CellSpin 作为新 grid 玩法主实现，新增一次 await 的 `transferSymbols/dropOccurrences`，使用自己的 runtime update时钟、pool和occurrence identity。
- Crave 仍使用期间，grid-cell 同步提供基础 `replaceSymbol(s)`、direct transfer/drop；旧 prepare/plan入口保持兼容。
- CellSpin与grid-cell统一约定`-1`为唯一hole标记；其它symbol code非负，`-1`不进入registry或创建RenderSymbol。
- Scene Layout additive 暴露 mutation area、standard reel session controller和grid-cell direct transfer/drop，不删除旧方法。
- Crave源码未修改；新增人工迁移手册，绑定只读基线`ab86cec8a8cae7bd0c2aa6910be383295518b1b2`。

## 计划调整

执行期间按用户确认将“任务202删除RenderCore旧plan并迁移game002v2”改为纯增量策略：game002v2成熟流程只做回归；旧接口完全删除留待
direct/session API被真实consumer验证后的独立任务。

进一步确认维护关系：CellSpin是正式主实现；grid-cell在Crave仍使用时同步本次所需基础能力，但不发展独有高级API。Crave未来迁移到
CellSpin后，grid-cell停止继续维护。

## 自动化验收

通过：

```text
RenderCore定向：6 files / 94 tests passed
game002v2：8 files / 15 tests passed
RenderCore typecheck：passed
RenderCore build：passed
game002v2 typecheck：passed
git diff --check：passed
```

RenderCore全量`pnpm --filter @slotclientengine/rendercore test`另有13个既有失败：11个旧value-controller fixture缺少once
`afterComplete`，1个manifest旧期望，1个Pixi children对象深比较。这些文件不在本任务修改范围；本任务的reel、CellSpin、grid-cell和
Scene Layout定向套件全部通过，未为无关旧测试扭曲生产代码。

## 文档与外部Consumer

- 长期第一层文档和RenderCore README已补direct/session、CellSpin主owner、grid-cell兼容和`-1`hole合同。
- `docs/crave-rendercore-direct-api-migration.md`提供feature replacement/value、CO transfer、cascade和后续CellSpin迁移步骤。
- Crave仓库没有被写入、stage或commit；文档中的Crave命令和浏览器验收仍需人工应用后执行。

## 人工验收

按用户约定浏览器验收由用户处理。game002v2重点确认initial/continuous/selective/Nearwin/cascade/refill保持；Crave仅在人工应用迁移文档后
验收WM/CM/AF replacement、CO transfer、cascade和原spin/Nearwin不回归。

## 剩余边界

- task202没有把grid-cell initial/refill/Nearwin plan迁移到CellSpin；这是Crave后续独立迁移任务。
- active session第一版只暴露稳定overlay、pending和land/cancel；没有虚构尚无底层安全seam的动态speed/dimming API。
- grid-cell direct drop当前接收已有render-ready movement；movement推导仍可暂时复用旧builder，不把推导DSL搬入新API。
