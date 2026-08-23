# 241 editorcore-gamelayout-event-dialog 执行报告

## 结果

任务 241 的实现和自动验收已完成。浏览器人工验收按任务发起人的安排由其自行执行，本报告不伪造人工结论。

- RenderCore 新增唯一纯 event catalog compiler。production runtime 与 editor package inspector 共用同一份
  descriptor/address/family/facet 编译逻辑；Symbol exact/wildcard dispatch metadata 也由该 compiler 生成。
- `scene-layout/editor` 新增 DOM/GPU-free package inspection：严格解析 current Layout、nested Symbols/Popup 和
  audio manifest closure，不创建 renderer、player、texture、Object URL 或 ticker。
- EditorCore 新增 committed `game-layout` root materializer、event catalog provider、immutable event group contract
  与 exact-address validation；Game Layout 单 root export 复用相同 materializer。
- 新 native dialog 使用 master-detail：顶部选择 Layout，左侧维护有序 event 列表，右侧一次只展示一个 catalog
  facet，支持 breadcrumb 回退、大候选搜索、canonical address 复制、add/edit/remove、row cancel、group cancel/
  confirm、同名 ZIP replacement 复验和显式清空后切换 root。
- Editordemo 已挂载“编辑 Event 组”入口并显示最后确认的 group；group 只属于 UI session，不写入 Demo archive。

## Public API

- `compileGameLayoutRuntimeEventCatalog(source)`
- `inspectSceneLayoutRuntimeEventCatalog({ manifest, files })`
- `inspectEditorGameLayoutEventCatalog(snapshot, rootKey)`
- `validateEditorGameLayoutEventGroup(catalog, group)`
- `mountEditorGameLayoutEventDialog({ controller, root, value, onConfirm })`

Dialog 确认值固定为：

```ts
{
  readonly rootKey: string;
  readonly events: readonly {
    readonly address: GameLayoutRuntimeAddress;
    readonly descriptor: GameLayoutRuntimeAddressDescriptor & {
      readonly kind: "event";
    };
  }[];
}
```

具体业务 identity 不在 EditorCore 中维护。family label 只用于通用 UI 呈现；node、animation、Symbol、state、
scope、x/y、Popup、mode、transition 和 lifecycle 的实际值全部来自所选 ZIP 的 catalog。

## 自动验收

通过：

```text
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore exec vitest run \
  tests/scene-layout/runtime-address.test.ts \
  tests/scene-layout/package-runtime-mode.test.ts
  -> 2 files / 27 tests passed

pnpm --filter @slotclientengine/editorcore typecheck
pnpm --filter @slotclientengine/editorcore build
pnpm --filter @slotclientengine/editorcore lint
pnpm --filter @slotclientengine/editorcore test
  -> 4 files / 24 tests passed，coverage thresholds passed

pnpm --filter editordemo typecheck
pnpm --filter editordemo lint
pnpm --filter editordemo test
  -> 1 file / 4 tests passed，coverage thresholds passed
pnpm --filter editordemo build
```

新增集成 fixture 是 current v4 mapped ZIP，包含 nested Symbols package。测试证明统一 importer 原子提交 Layout
root、provider 从 ZIP 生成列级 Symbol event、UI 可添加/修改/移除并保持 group cancel 隔离，以及同 root ZIP 替换
后旧 exact address 失效并阻止确认。runtime parity 测试比较 pure compiler 与 runtime `list({kind:"event"})`。

探索性运行全部 `tests/scene-layout` 时，任务直接影响的 `package-runtime-mode` 16 项最初暴露 fake fixture node
缺少 resource 的兼容问题，修复后与 runtime-address 共 27 项全部通过。其余未通过项稳定为：

- `configured-round-adapter.test.ts` 13 项：fixture 的空 `manifest.nodes` 被 current strict latest upgrader 拒绝；
- `manifest-upgrade.test.ts` 1 项：测试仍期望 latest version 3，当前实现返回 version 4。

上述两个测试文件及其失败路径均未由任务 241 修改，未为通过探索性整组测试而扩大范围或放宽 parser。

最终还需执行 `git diff --check` 与定向 format check；结果记录在交付回复。

## 文档与计划偏差

- 更新了 EditorCore/Editordemo README、runtime address reference、Editor artifact 与 Scene Layout 稳定规则。
- 计划预估的独立 `runtime-event-catalog.test.ts`、EditorCore/Dialog test 和 Editordemo test 文件没有拆分；相关证明
  合并进现有 runtime-address 与 adapters-and-ui 集成测试，Demo 的公开依赖链由自身 test/build 覆盖。
- Symbol scope 没有另写一套特殊地址构造器；它作为 catalog 的 `scope → x/y → edge` facets 使用同一个渐进式
  selector，因此不会产生 catalog 外组合。
- 没有修改 schema、lockfile、依赖、production assets 或 Gamelayout Editor exporter。

## 浏览器人工验收

状态：**待任务发起人执行**。

建议按计划重点检查真实 Gamelayout Editor ZIP 的候选完整性、深候选搜索、全部/列/行/cell scope、row/group
cancel、Layout 替换 invalid 状态、Escape/焦点返回、窄屏上下布局、Clipboard 权限提示，以及 reset/destroy 后无
stale async UI 或控制台错误。

## 基线与时间

```text
baseline HEAD: 5116c5b4730836f0c7beb664978139636d16c0cf
baseline UTC: 2026-08-23T04:04:54Z
report UTC: 2026-08-23T04:52:01Z
```
