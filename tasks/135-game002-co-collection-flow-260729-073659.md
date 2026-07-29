# 135 game002 CO 收集玩法执行报告

## 结果

任务 135 的代码、正式 Symbols/Scene Layout 资源、mapped assets、generated imports、
自动化测试和发布检查已完成。浏览器与 live server 人工验收按用户要求未执行，状态为
待用户验收。

最终行为包括：

- initial spin/refill 的 settled scene 先合入 `bg-genco` 新 CO，CO 不再于转换末尾凭空
  replacement。
- 有实际 `bg-win` result 时保持普通 win 优先；无 win 时才严格经过
  `bg-triggerco/bg-co/bg-win2/bg-bn`。
- 严格编译 `bg-co.pos` 分段、4..8 个 transfer、多 CO、八邻域、symbol、scene、
  otherScene、win2 与 BN source set。
- CO `feature` 与 source `feature1` 同时开始；source `feature2` 与完整 occurrence
  transfer 同时进行，全部完成后原子提交 source BN、target symbol/value 和 CO
  replacement。
- `bg-win2` 复用既有 win/amount/remove/cascade；`bg-bn` 作为 release-only holes，
  不进入正金额 group、summary 或 carousel。
- WL/WM/CM/CN 既有路径保留，金额 fallback 增加服务器 `mul`。

## 公共合同

- `logiccore`
  - cascade profile 增加中性 `releaseOnlyWins` role。
  - win plan 增加 release-only positions。
  - settled transform 支持 immutable relocation draft/plan，转移 source occurrence
    identity、替换 source 并记录被覆盖 target。
- `rendercore`
  - grid-cell reel set 增加 prepared visible occurrence transfer batch。
  - prepare 不修改宿主；start/commit/rollback/destroy 管理完整 RenderSymbol、
    presentation value、transfer layer、mask 和 ownership。
- `gameframeworks`
  - 只转出上述中性合同，不包含 game002 component 或 symbol 名称。

## 资源与生成物

输入未改写：

| 文件                      |     bytes | SHA-256                                                            |
| ------------------------- | --------: | ------------------------------------------------------------------ |
| `crave-symbols-fixed.zip` | 6,195,912 | `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835` |
| `crave-v2.zip`            | 9,832,922 | `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d` |
| `crave-wl-num.zip`        |    28,802 | `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487` |

输出：

| 文件                                      |     bytes | SHA-256                                                            |
| ----------------------------------------- | --------: | ------------------------------------------------------------------ |
| `game002-s3-symbols-task135.zip`          | 6,223,098 | `e59d9014e3ea802c647c1fd184b2d91c5b2817ed5c2bd2d0ee3bfa96b3c7d255` |
| `crave-layout-task135.zip`                | 9,862,244 | `942262eaee15fe78796b9f8cff726be56b08d2932d30b7c8541eaa2081228d12` |
| `crave-layout-task135.optimized.zip`      | 2,930,739 | `126ab15a5b441278b66309af8b4de17d8198169d81c5de2c80c8c8ea6f5f5c26` |
| `crave-layout-task135.assets-groups.json` |    61,652 | `8e66c32384cd5bc18cb5cec977b80f3105d33c5fe264080e612efc6fd50a2daa` |

最终 mapped roots：

| 文件                                |  bytes | SHA-256                                                            |
| ----------------------------------- | -----: | ------------------------------------------------------------------ |
| `assets/crave/layout.manifest.json` |  4,621 | `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09` |
| `assets/crave/assets.map.json`      | 37,289 | `d35f62f82ed156ecd4d231577fc548552bb729674d569803c4c22d6e3958c7ec` |

task135 authoring 已确定性重放并通过导出/重导约束；正式 optimizer 将 Layout ZIP 从
9,862,244 bytes 压缩至 2,930,739 bytes。generator/check 识别 132 个 Scene Layout
resources。

## 删除与引用检查

- 删除 `assets/game002-s1/bg.jpg` 及 `assets/symbols001/**`，共 29 个 tracked
  skin1 文件。
- 全仓排除 `tasks/**` 搜索 `game002-s1|symbols001` 无残留 consumer。
- `assets/game002-s2/**`、`assets/game002-s3/**`、`assets/symbols002/**` 和
  `assets/symbols003/**` 未删除。
- `pnpm-lock.yaml` 未修改。

## 自动化验收

以下最终结果通过：

- 五个直接范围 typecheck：
  `logiccore`、`rendercore`、`symbolseditor`、`gamelayouteditor`、`game002`。
- 全量测试：
  - logiccore：11 files / 89 tests。
  - rendercore：73 files / 572 tests。
  - Symbols Editor：7 files / 44 tests。
  - Game Layout Editor：21 files / 158 tests。
  - game002：25 files / 135 tests；branch coverage `80.03%`，所有全局覆盖率门槛通过。
- `symbolseditor build:task135` 与 `gamelayouteditor build:task135`。
- Symbols Editor 与 Game Layout Editor production build。
- `game002 check:crave-layout-resources` 与 `game002 release:check`；production build
  和 static dist verifier 通过。
- `git diff --check`。

执行中新增的 value relocation 用例发现并修复了一个 parity 缺陷：显式 BN
`outputValue: null` 不能用空值合并回退到 source 的旧 value。

## 与计划的适配

- generic transfer 直接落在现有
  `render-grid-cell-reel-set.ts`、`render-reel.ts`、`types.ts` 及对应测试中，没有新增
  计划预估的独立 `grid-cell-symbol-transfer.ts`；职责仍位于 rendercore reel
  transaction。
- runtime 未暴露 Spine once 的归一化 duration。移动在 Feature2 活跃期间按 frame
  更新并在 90% 处等待，真实 once completion 时设为 100% 并原子提交；因此提交边界
  使用真实 completion，但视觉速度仍需浏览器验收。
- 没有 commit、push 或创建 PR。

## 待用户浏览器验收

1. Symbols Editor 导入 task135 Symbols，检查 CO Feature、候选 Feature1/Feature2、
   CN 各 tier 与任务 132 WL/WM/CM states，并做 edit/export/reimport。
2. Game Layout Editor 导入 task135 Symbols/Layout，检查 BaseGame/FreeGame dependency、
   reel/background/popup/geometry 与 edit/export/reimport。
3. game002 `skin=2` 验证 CO 随 spin/refill 落定、普通 win 优先、CO/source 第一阶段
   并行、Feature2 移动、win2、BN+win remove、dropdown/refill。
4. 复验多 CO、CN value、WM/CM 后 CO、期待、resize、next-spin、failure cleanup、
   destroy、console 与 live server payload。

## 剩余风险

自动化覆盖 strict protocol、scene/value/identity 和 transaction 边界，但真实 Pixi
mask/z-order、Spine 播放观感、多 CO live payload 与 resize/destroy 时机仍只能由上述
浏览器/live 验收确认。
