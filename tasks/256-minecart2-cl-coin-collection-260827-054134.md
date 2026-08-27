# 256 minecart2 CL/CO 收集执行报告

## 结果

- 执行时间：2026-08-27T05:41:34Z
- engine 分支：`codex/task-256-minecart2-cl-coin-collection`
- engine 基线：`7105c3bc325219d8d28cf971e94cdead50534a7b`
- Minecart2 工作区：`/Users/zerro/gitee.com/piximinecart2`，保留在用户现有 `rgs` 分支，未替用户提交。
- exact `bg-coinwins` 现在编译为 landing 后、普通 `game003:wins` 前的独立 `game003:coin-collect` state mutation；样例顺序为 CL `(0,3)` 收集 CO `(4,1)=1`、`(4,2)=750`，最终累计 `751`。
- 后续真实下注数据确认 `cashWin` 是随下注/币值换算的现金金额，因此不与 raw CO value 合计比较；strict parity 只覆盖同单位的 component `wins/coinWin`、CO value、数量和 result role。
- 后续真实回合确认 `usedResults` 可包含多个 CL group。compiler 现在为每组生成独立 `game003:coin-collect`，每个 CL 分别计数和获奖；同一 CO 被多组引用时每组各创建一个飞行 clone，原 CO 只在最后引用完成后提交为 hole。
- CO 按 result position 顺序执行 `win -> normal clone flight -> end -> hole commit`，CL 执行一次 `collect_start -> collect_idle`，全部收集后执行 `collect_end -> win`。普通 wins、award、BO 收集和 mode transition 消费去除 CO 后的 snapshot。
- CL 上只创建一个初始空字符串的字体计数器；每枚 CO 到达期间进行有界、单调、整数 count-up。

## 粒子与性能

- RenderCore 新增从 exact Scene Layout image runtime resource 创建的 typed `ParticleTrailRenderObject`，由受管 layer 的 owner clock 更新。
- 每条拖尾预分配固定 Sprite pool，运行时不增加容量、不创建逐粒子 ticker；共享单纹理并使用 additive batch-friendly sprite。
- Minecart2 配置：单 emitter 最大 32 粒子、42 粒子/秒、寿命 0.32–0.55 秒、尺寸 8–18 px，同时最多保留 2 条 emitting/draining trail；parser 硬限制并发不超过 2、粒子不超过 48、最长寿命不超过 0.6 秒。
- 低帧率时在前后 emitter anchor 间插值发射，避免单帧位移造成粒子断带。
- clone 到达后只调用 `stopEmissionAndDrain()` 停止新发射；已经飞出的粒子继续按自身 lifetime 更新到 live count 为零。下一枚 CO 不等待上一条 drain；operation 退出 presentation scope 前才执行最终 barrier。abort、失败或 runtime destroy 才允许 hard cleanup。
- 正式粒子资源为 exact `256-co-gold-particle-128`，128×128 RGBA；任务源图 SHA-256 为 `38cbc13692efac8d74bab80f87e565d52b869d85acee2ebc83adac39c2a288e3`。production delivery 使用用户更新后的 on-demand 映射资源，没有写回 `layout32.zip`。

## 文件与同步

- engine：新增粒子 primitive、presentation export、Scene Layout package runtime/factory typed API、单测、README 与 shared runtime 规则。
- Minecart2：新增 `coin-collection.ts` 和 handler 测试；更新 config、round compiler/adapter、样例 fixture、资源/源码边界测试与 README。
- 主仓与 Minecart2 的 8 个 RenderCore 共享源码/测试/README 文件逐文件 `diff -q` 一致。
- 用户更新的 `assets/minecart2` 删除/新增 chunk、WebP 和 delivery manifest 均保留；没有修改 source ZIP，也没有提交 Minecart2 工作区。
- delivery 与 RenderCore 源码目录中的 Finder `.DS_Store` 会破坏 checker/coverage，执行时分别暂存到 `/tmp/task256-minecart2-assets.DS_Store` 与 `/tmp/task256-minecart2-rendercore-src.DS_Store`，未删除正式资源。

## 自动验收

通过：

- RenderCore 定向 Vitest：2 files，16 tests passed。
- `pnpm --filter @slotclientengine/rendercore typecheck`。
- Minecart2 全量 Vitest：9 files，90 tests passed（含 bet-scaled cashWin、多 CL/shared CO compiler 与非最终 CO 恢复）。
- Minecart2 build。
- `gamelayoutpkgcli` build。
- `layout32.zip --delivery-dir assets/minecart2 --quality 80 --check`：成功；Atlas 4 张、合图帧 213 个、外置资源 14 个。
- 两仓 `git diff --check`。
- 共享文件 parity `diff -q`。

已最小化的基线阻断：

- Minecart2 direct typecheck 在本任务文件已无诊断；命令仍被 `packages/bridgecore` 与 `packages/device-detector` 的既有 NodeNext 相对 import extension 诊断阻断。
- RenderCore package 全量 coverage suite 仍失败 16 项：configured-round-adapter fixture 使用空 nodes、symbol fixture 仍期待 manifest v2 而当前为 v3，以及两个既有 package-runtime parent/order 断言。失败不指向本任务新增粒子或 factory 测试；本任务定向 16 项和 RenderCore typecheck 均通过。外部同步仓的全量 suite 还缺历史 `assets/gamecfg/game2.json`/`test-utils` fixture，因此同样不作为本任务通过条件。

## 待用户浏览器验收

- 浏览器人工验收由用户接管，当前标记为待完成。
- 重点观察横/竖屏中 CO 的 `win -> 飞行拖尾 -> end`、CL 状态顺序、单一计数器 `空 -> 1 -> 751`、第二枚飞行时第一条拖尾仍自然消散、最后粒子无硬切，以及低帧率和连续 spin 下无明显掉帧/泄漏。
- 如需视觉调节，只改 versioned `coinCollection` flight/counter/trail 参数和用户维护的 Layout resource，不改变自然 drain 生命周期。
