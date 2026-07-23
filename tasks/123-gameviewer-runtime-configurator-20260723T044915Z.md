# Task 123 执行报告（UTC 2026-07-23T04:49:15Z）

## 结论

本轮已完成 GameViewer 配置器、strict server/round/presentation schema、canonical production ZIP loader、framework template facade、安全新窗口协议及自动化质量门槛。

当前真实输入改为 `/Users/zerro/Downloads/crave-v2.zip`。该文件只读验收通过，未被修改或重新导出：

- SHA-256：`3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d`
- 121 entries，13,324,796 uncompressed bytes
- layout id：`new-layout`
- initial mode：`BaseGame`
- reel：6 × 9，`renderMode=grid-cell`
- symbol package：`game002-s3`
- popup：`bigwin2`

`docs/crave/crave.json` 的 `normal` bet method 已通过 shared parser 生成 7 项需显式 review 的职责候选；repository/graph 未进入 readiness 或 runtime payload。真实 readiness 编译结果为 `grid-cell + cascade`，popup 可用，layout hash 精确匹配。

## 新增 shared seam

- `logiccore`：browser-safe server authoring summary、bet-method catalog、review suggestion、strict base + optional cascade round profile。
- `rendercore`：bounded canonical production ZIP loader、strict standard/grid-cell presentation profile、compatibility/capability gate、scene-layout main reel spin/state seam、configured round adapter。
- `gameframeworks`：`scene-layout-template` one-call facade，集中加载 ZIP、验证 config/hash、创建 framework/session/render owner。
- `apps/gameviewer`：纯前端六阶段配置器与独立 runtime window；runtime 只校验 payload 并调用 framework facade。

新增 seam 的原因是原有 runtime 没有从 production ZIP + versioned profile 一次性装配 framework 的公共入口；ZIP/hash、server semantic、reel kind 与 flow 也没有共同的 readiness gate。

## 四组合矩阵

| Reel | Base | Cascade |
| --- | --- | --- |
| standard | compatibility + adapter lifecycle 自动测试通过 | compatibility + adapter lifecycle 自动测试通过 |
| grid-cell | compatibility + adapter lifecycle 自动测试通过 | Crave V2 真实 readiness 通过 |

## 自动验收

- logiccore：11 files / 77 tests；lint、test、typecheck、build、exports 通过。
- rendercore：71 files / 518 tests；coverage 87.29% statements、80.01% branches、90.40% functions、87.73% lines；lint、typecheck、build 通过。
- gameframeworks：12 files / 78 tests；coverage 90.46% statements、81.87% branches、94.83% functions、90.57% lines；lint、typecheck、build 通过。
- gameviewer：7 files / 27 tests；coverage 76.88% statements、68.11% branches、82.10% functions、78.17% lines；lint、test、typecheck、build 通过。
- GameViewer source-boundary test 确认 production source 无 Crave/game002/game003、业务 component/symbol、Pixi/rendercore 实现硬编码。
- 浏览器验收未执行，按用户要求由用户完成。

## 严格验收保留项

当前 configured adapter 已覆盖 initial scene、两种 reel spin、win once drain、下一 spin cleanup 和最终 refill scene提交；但尚未把完整 remove → dropdown → refill movement、value continuity/collect 和 popup amount trigger 接到已有 symbol-cascade/player。

因此 Task 123 完成定义第 6、8、10、11 项尚不能标记通过；本报告不伪造完整 cascade/live 验收。live 凭据也未提供，未执行 live smoke。

后续应优先把 game002 的通用 cascade sequence 下沉为 capability-driven shared coordinator，并让 standard/grid-cell adapter 都实现相同 cascade target；随后补 faithful GMI 的 no-win、win/cascade、value/collect 测试，再进行用户浏览器验收。
