# 任务 187 执行报告

## 结果

任务 187 已完成代码与 L2 自动验收。浏览器视觉/真实性能验收按用户要求未代为执行，
状态为“待用户确认”。

基线：`ebd77ebf5b5b2e07242e9abaa6a55e716fa3446e`

报告时间：`2026-08-09T06:57:37Z`

## 职责落点

### gameframeworks

- 新增默认关闭、实例级 `performanceObserver`，以单调时钟和递增 trace id 上报
  mount/connect、UI command、request/response、logic parse、adapter、collect、失败/销毁边界。
- observer 不携带 payload、token、logic、scene、random 或轮带；observer 自身异常不改变游戏。

### rendercore

- 修复 grid-cell full/selective spin 时间片：waiting、landed、completed、selective held 的
  occupied occurrence 持续 update，hole 不 update，spinning delta 不重复消费。
- 新增 selective spin transaction、held code/value continuity、started edge drain 与通用
  refill position ordering。
- 新增 terminal remove transaction：整批 preflight，中性 retained predicate，每个 removable
  occurrence 的 once completion 边界直接 release，不插入 normal；返回 immutable
  removed/retained snapshot。
- 新增 already-loaded Scene Layout Spine 到 grid effect 的 strict typed adapter；保留 official
  Spine 版本、atlas page、texture、animation 与 duration 校验。

### game002v2

- 只保留阶段日志 formatter/paint marker、FG WL/CN predicate、Nearwin/anticipation component
  决策、WL remove predicate 与 shared API wiring。
- loading 退场前等待 initial scene commit 后的 animation frame。
- `fg-spin` 只选择输入 scene 中非 WL/CN 格；held target 漂移由 rendercore 在 release 前失败。
- 从 Crave exact 加载 `nearwin1/nearwin2`，不请求 `nearwin3`；时序只消费
  `apps/game002/config/reel-presentation.manifest.json`。
- 期待 cascade 为 existing-only dropdown → Nearwin2 sweep → holes selective Nearwin1 refill；
  unified refill 新形成第二枚 WL 时只影响后续 cascade，不倒放已完成阶段。
- remove candidate 合并 win results 与 server target holes；WL retained，removed/retained 坐标
  与 `bg-remove` scene 严格核对。

## 控制台数据

每个完成/失败 trace 输出：

```text
[game002v2 timing] {
  traceKind, traceId, status, totalMs,
  phases: [{ phase, atMs, durationMs, elapsedMs }]
}
```

startup 含 entering-game、framework/mount/connect、initial state 和 first-scene-paint；spin 含
command、request build/send、server response、logic parse、adapter、plan call、first-cell-start、
first-cell-paint、collect/complete。`request-send → response-received` 可独立识别 server RTT，
不会误算为客户端渲染。

确定性本地优化包括：Nearwin 资源在 loading prepare 阶段复用、initial first-paint gate、删除
remove 后的 normal 中间态、selective held 不重建、期待 refill 不让 survivor 重播 spin/appear。
本报告不填写虚构的浏览器 median 或改善比例。

## 自动验收

通过：

```text
rendercore targeted: 5 files, 52 tests passed
gameframeworks framework-flow: 1 file, 14 tests passed
game002v2: 8 files, 13 tests passed
rendercore/gameframeworks/game002v2/game002 L2 typecheck: passed
git diff --check: passed
```

覆盖的关键中间态包括：retained occurrence 未触碰、per-occurrence terminal release、selective
held 动画继续、started edge 单次 drain、held target 漂移 release 前失败、loaded Spine strict
适配和 `nearwin3` 未加载。

## 用户浏览器验收清单（待用户确认）

1. 冷/热 cache 各启动 5 次，确认 loading 退场时 initial scene 已可见；保存 startup trace，
   分别计算 total 与最大 phase 的 median。
2. 点击 spin 5 次，确认 trace id 不串轮，server RTT 与客户端 plan/first edge/paint 分开；观察
   尚未开始和已停格的 normal 动画不中断。
3. 进入 FG，确认 WL/CN identity/value/动画保留，只有其它格开始转。
4. 取得 2+ WL 且含 cascade/refill 的 round，对照 game002 检查 Nearwin1、Nearwin2 sweep、
   selective refill 顺序和最终 scene/value。
5. 对中奖消除录屏逐帧检查：remove once 完成后位置保持 hole，直到 dropdown/refill 正确进入；
   retained WL 不 remove、不闪 normal/随机图标。

## 资产与范围

- 未修改 `assets/**`、manifest、YAML、生成物、lockfile 或根工具链。
- production 美术 bytes 仍只来自 `assets/crave` 的 Gamelayout 解包闭包。
- 未实现 targetless speculative spin；若最大阶段是 server RTT，应作为后续独立合同处理。
