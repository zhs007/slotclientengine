# 210 Popup 获奖档位、逻辑图层与即时结束执行报告

UTC：2026-08-14 06:45:04

## 结果

RenderCore 与 Popup Editor 已完成任务 210：

- Popup canonical 版本升级到 v6；合法 v1–v5 ZIP 先按源版本 strict parse/prepare，再确定性升级并统一导出 v6。
- v6 award layer 不再保存跨档 `visibleStates`。配置所在 tier 是唯一状态，同一 exact id 跨档表示同一逻辑图层；每档金额层统一为 `win-amount`。
- runtime 只启动当前 tier。`base/standard` 不会提前 enter celebration VNI，切到 `superwin/megawin` 前会同步隐藏并撤销旧 tier attachment，旧 `bigwin` 不再留在背后。
- 相同 `id + kind + resource key` 的 image、text、manual ImgNumber、Spine、VNI 跨档复用已初始化 runtime；transform、alpha、order、attachment、anchor/style/default text 与 playback 在状态边界重配。资源 key 变化时使用该 Popup 内已准备的独立变体。
- award 分段 VNI 的最终结束请求直接从 exact `loopEndTime` 播放非循环 end range，不等待当前 loop 边界；end/drain 完成后隐藏并 complete。重复结束请求保持 dismissing，不重新发起。普通 Spine Popup 继续使用原有 loop-boundary 合同。
- Popup player complete 后保留初始化实例供下一次 `start()`；`destroy()` 以 attachment、共享 runtime、tier container 的安全顺序统一释放，不增加全局池。
- Popup Editor 移除 award layer 五档可见性控件，新增 state-neutral id 与“复用逻辑图层到当前档”操作；删除只删除当前档配置。
- task 209 的 public Scene Layout award facade 与稳定 `PopupStringNodeHandle` API 未修改。

没有修改 Crave 代码、`assets/`、Scene Layout、Game Layout Editor、gameframeworks、vnicore、lockfile或生成物。Crave 最终资源重导与替换步骤记录在 `docs/crave-popup-v6-migration.md`。

## 数据迁移

- v1–v5 award 以 layer 所在 tier 为状态权威，删除旧 layer visibility，不按全选状态复制到其它档。
- `binding="win-amount"` 固定升级为 id `win-amount`。
- 跨 tier 相同旧 id 的 kind/name/binding 一致时保留；冲突时使用 state-qualified id，并同步重写同 tier 的 VNI/Spine attachment target。
- upgrader 预留全部旧 id 与 canonical amount id，避免生成 id 覆盖原有逻辑层；结果按 order canonical 排序，strict parse 后不发生第二次变化。

## 自动验收

通过：

```text
RenderCore source/tests typecheck
  ./node_modules/.bin/tsc -p packages/rendercore/tsconfig.json --noEmit

PopupEditor source/tests typecheck
  ./node_modules/.bin/tsc -p apps/popupeditor/tsconfig.json --noEmit

RenderCore 定向 Vitest
  7 files passed, 112 tests passed

PopupEditor 定向 Vitest
  3 files passed, 26 tests passed

pnpm --filter popupeditor build
  passed（仅既有 Vite >500 kB chunk warning）

pnpm --filter @slotclientengine/gameframeworks typecheck
  passed

Prettier touched-files check
  passed

git diff --check
  passed
```

依赖按现有 `pnpm-lock.yaml` 从本机 pnpm store 恢复，lockfile 未变化。Codex bundled pnpm 11 报告现有 `enableGlobalVirtualStore` 设置差异，因此验收命令使用 `verify-deps-before-run=warn`，未再次清理或重写依赖目录。

## 人工验收

浏览器验收按用户要求由用户完成，本报告不声明已通过。建议用最终 Crave/Gamelayout Popup 资源检查：

1. base、standard 仅显示金额与各自配置，进入 threshold 时才启动 bigwin/superwin/megawin VNI。
2. 连续跨档时上一档立即不可见，尤其 megawin 背后没有残留 bigwin。
3. loop 中点击立即进入 end，end 与粒子 drain 完整播放后隐藏；end 中重复点击没有重启或回到等待态。
4. complete 后下一轮可正常复用，金额、命名 text/manual ImgNumber override 与 task 209 handle 不串值。
5. 用 Popup Editor 导入旧 ZIP 后检查 stable id，导出 v6、再次导入并确认配置不再变化。
