# 213 RenderCore lightweight reel rolling visual 执行报告

时间：2026-08-15T04:00:41Z

## 结果

任务已实现，改动仅位于 `packages/rendercore/**`、`docs/**` 和 `tasks/**`。Crave app、资源、
manifest 和生成物均未修改。

- 每个 reel slot 只创建一次稳定 rolling Sprite；rolling 帧只同步 texture、scale、priority、位置、
  mask 和 tint，`snapshot.symbol` 为 `null`，不再按经过的轮带 code new/destroy 完整 RenderSymbol。
- target-aware start/continuous settle 在 spin 开始时只为最终可见非空落点创建 detached
  RenderSymbol。landing 只挂载 prepared occurrence；相邻相同 code 使用独立实例和独立 value。
- RenderSymbol、official Spine、VNI 和 value presentation 增加只读 readiness。任一最终实例 pending
  时保持最终 rolling frame；全部 ready 后才发布 stopped/landed，失败则显式抛错。
- stopped 时只有可见行持有完整 RenderSymbol；buffer 只有隐藏 lightweight view，因此不会 update
  隐藏动画。grid/standard dimming 和 render order 改为作用于统一 slot container。
- 既有 settled symbol pool 保持原职责，rolling Sprite 不进入 pool。
- 后续补充 tier-aware rolling value：中间 CN value 来自游戏 resolver，slot 按 code+tier 有界缓存
  轻量 image-string view，不创建 CN tier Spine；显式 target CN 强制要求服务器 final value，最终
  rolling frame 与 settled commit 使用同一 exact value。
- 完整 RenderSymbol 在 detached prepare 阶段已写入 final value；value resource ready 后、挂入可见树
  前会再次核对 exact value。兜底创建路径同样严格按 init、set/verify final value、attach 的顺序执行。
- weighted resolver 改为每 cell 默认最多保留 32 个最近 occurrence，避免 continuous symbolY 令
  随机值 Map 永久增长。
- 后续继续优化完整 RenderSymbol 内部资源实例：普通 Spine 和 CN tier player 按实际资源身份缓存，
  value ImgNumber 以稳定 renderer 跨 tier 重绑；状态离开和回池不再销毁这些可复用实例，Symbol
  真正销毁时统一释放。

## 确定性证据

新增测试覆盖：

- start 前后完整 symbol 创建数只增加最终 textured target 数；多次 rolling update 不再增加；
- rollingVisual identity 跨帧不变，moving slot 没有完整 symbol；
- landing 后只有可见 textured occurrence 持有完整 symbol，隐藏 buffer 为零；
- 3 个相邻相同 code 使用 3 个独立 RenderSymbol，分别保存 `10/20/30`；
- target preparation 中途失败会销毁已准备实例，原 stopped scene 和 occurrence identity 不变；
- readiness pending 时不 landed，ready 后下一 tick 原子提交；value init failure 报 failed。
- rolling value 覆盖 3 个 tier、缺 explicit final value fail-fast，以及按 cell LRU 淘汰后重新抽样。
- pending 阶段验证 3 个 detached 完整 RenderSymbol 已分别持有 `5/50/500`，而可见 slot 仍没有完整
  symbol；ready 后才一次性挂载。

## 自动验收

通过：

- `pnpm --filter @slotclientengine/rendercore typecheck`
- 9 个直接相关测试文件，123 tests passed
- `pnpm --filter @slotclientengine/rendercore build`
- `pnpm --filter @slotclientengine/gameframeworks typecheck`
- `pnpm --filter game002v2 typecheck`
- RenderSymbol 内部资源复用补充验收：5 个定向测试文件，49 tests passed；rendercore 与
  gameframeworks typecheck、rendercore build 通过
- `git diff --check`
- diff 路径检查：`apps/game002v2/**`、`assets/crave/**`、`assets/gamecfg002/**` 零修改

`pnpm --filter @slotclientengine/rendercore test` 的整包运行仍有 2 个与任务无关的既存断言失败：

- `tests/symbol/manifest-cascade-presentation.test.ts` 的 expected 未包含 parser 已返回的
  `afterComplete: "return-to-default"`；
- `tests/symbol/render-symbol.test.ts` 仍按 5 层 children 断言，但当前 RenderSymbol 已有 7 层。

两个文件单独运行同样失败；本任务没有修改对应行为或测试，未扩大范围处理。

## 计划偏差

production/required texture 继续取得 exact `spinBlur`。为保持已有 symbol-package fixture 和 legacy
package 行为，registry 在没有 state texture、且 normal 是单层 Texture 时使用同一 normal texture；
layered/transparent 且没有 rolling texture 仍显式失败。这只影响 lightweight visual 取图，不会构造
RenderSymbol fallback。

readiness seam 完全落在 rendercore，未修改 `packages/vnicore`。基础 rolling Sprite 直接由
`RenderReel` slot owner 持有；tier-aware 数字轻量 view 的构造逻辑独立在
`rolling-value-visual.ts`，实例仍由对应 slot 有界持有。

## 用户待验收

浏览器视觉、手机 30 分钟 FPS/heap/GC/温升，以及同 RNG 相邻 CN 多轮复验尚未执行。步骤见
[`docs/crave-task213-manual-performance-verification.md`](../docs/crave-task213-manual-performance-verification.md)。
