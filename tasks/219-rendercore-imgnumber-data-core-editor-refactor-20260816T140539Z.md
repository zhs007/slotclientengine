# 219 rendercore ImgNumber 分层重构执行报告

## 结果

任务已完成代码实现与自动化验收，浏览器 Performance/Memory/视觉验收按用户要求留给用户执行。

- public entry 拆为 `image-string/data`、`image-string/core`、`image-string/editor`，旧混合入口和
  root wildcard 已移除。
- data 是无 Pixi、browserartifactio、editorresource 依赖的 v1 schema/parser/text/reference owner。
- core 预编译 glyph/fixed-group lookup，`setText()` 使用 renderer-owned 双缓冲布局，不再在 mutation
  热路径构造完整 immutable snapshot；public facade 只提供 text/geometry scalar query。
- renderer inactive Sprite pool 上限为 16；超额 Sprite 立即销毁，renderer/resource destroy 幂等，
  既有 prepare rollback 与 owned/borrowed Texture 合同保持。
- editor wrapper 组合同一个 core，提供 mapped package、materialize 与按需 immutable inspection。
- ImgNumber Editor、Popup Editor、Symbols Editor、Game Layout Editor 与 gamelayoutpkgcli 已按职责迁移；
  rendercore presentation/Popup/Symbol/Scene Layout runtime 未依赖 editor public wrapper。
- 未修改 Crave、`assets/**`、game002v2 或 game003v2；本轮不需要 Crave 手工修改文档。

## 主要文件

- `packages/rendercore/src/image-string/{data,core,editor}/**`
- `packages/rendercore/src/image-string/package-runtime.ts`
- `packages/rendercore/package.json`
- `packages/rendercore/benchmarks/image-string-hot-path.mjs`
- `packages/rendercore/tests/image-string/boundary.test.ts`
- ImgNumber/Popup/Symbols/Game Layout Editor 与 gamelayoutpkgcli 的 import/Vite alias
- `packages/rendercore/README.md`、`docs/image-string-manifest.md`
- `docs/agent-rules/shared-game-runtime.md`、`docs/agent-rules/editor-artifacts.md`

## 自动验收

通过：

- rendercore `tsc -p tsconfig.json --noEmit`
- rendercore build（含 declaration exports）
- image-string、Popup package、presentation 与 Scene Layout 直接测试：9 files / 61 tests
- ImgNumber Editor：7 files / 19 tests
- ImgNumber、Popup、Symbols、Game Layout Editor production build
- ImgNumber、Popup、Symbols、Game Layout Editor 与 gamelayoutpkgcli production TypeScript check
- game002v2、game003v2 package typecheck（含直接依赖构建）
- export/source boundary、旧混合 import、runtime→editor wrapper 与 Crave/assets 修改搜索
- `git diff --check`

完整 rendercore suite 当前为 111 files / 891 tests 通过、2 files / 14 tests 失败。失败集中在：

- `configured-round-adapter.test.ts` 的旧空 `manifest.nodes` fixture 被当前 strict parser 拒绝（13）；
- `manifest-cascade-presentation.test.ts` 未包含当前 `afterComplete` 字段的旧预期（1）。

失败路径没有本任务行为修改；本任务直接涉及的 61 tests 全部通过。`gamelayoutpkgcli` 的
`tsconfig.eslint.json` 还会命中 3 个既有 Popup union test narrowing 错误；production `tsconfig.json`
检查通过。本任务未扩大范围修改这些无关 fixture/type expectation。

## Benchmark

命令：

```bash
node --expose-gc packages/rendercore/benchmarks/image-string-hot-path.mjs
```

Node 24，10,000 次 warm-up 后执行 100,000 次 1/6/12/10 位字符串切换：

```json
{
  "iterations": 100000,
  "elapsedMs": 57.731,
  "updatesPerSecond": 1732173,
  "heapDeltaBytes": 0,
  "gcExposed": true
}
```

该数字是当前实现的本机证据，不作为易抖动 CI gate。结构测试另外锁定 core 不公开 occurrence
snapshot、source graph 不反向依赖 editor、长串缩短只保留 16 个 spare Sprite。

## 人工验收状态

未执行浏览器验收，按用户要求由用户完成。建议使用任务计划第 8 节的四组步骤，重点观察：

1. ImgNumber Editor mapped/legacy ZIP、static/counter template、guides 与导出重导；
2. 空串/短串/长串与缺 glyph rollback 后的 pivot/children；
3. Popup/Symbols/Layout Editor 通过各自 production owner 预览；
4. 50 次长短切换和 preview destroy/recreate 后 Sprite/Texture/Object URL/Container 无持续增长。

## 范围与剩余风险

- schema version、wire format、glyph layout 公式、production assets 和 lockfile 均未改变。
- 浏览器真实 GPU/GC/heap snapshot 尚待人工验收；自动 benchmark 不能替代该证据。
- 完整 suite 的 14 个无关失败与 CLI test-config 的 3 个 type error 应由各 owner 独立清理。
