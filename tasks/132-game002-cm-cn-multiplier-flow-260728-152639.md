# 任务 132 执行报告

UTC：2026-07-28T15:26:39Z

## 结果

- 从三个 Downloads 原始 ZIP 确定性重放任务 131 的 WL/WM authoring，并新增 CM
  `feature1/change`、CN `featureChange`。WL、WM、CM 共用唯一 multiplier
  ImgNumber resource，全部使用 exact `Mult` slot；CN 原 coin digits dependency
  保持独立。
- 用任务 132 Symbols 更新原始 `crave-v2.zip` 的 `game002-s3` dependency；
  BaseGame、FreeGame 继续绑定同一 package。两个 authoring 脚本都完成了可逆
  edit/export/reimport 探针。
- 用 Layout Editor 输出完整更新 `assets/crave` 和 133 个 generated imports；
  production 仍只支持 `skin=2`，没有修改或恢复 `skin=1`。
- initial spin 与 refill 的 settled scene 优先级统一为
  `bg-gencm > bg-genwm > bg-spin/bg-refill`；每步最多一个 CM，倍数只从
  `bg-setcm.otherScene` 的 CM 目标 cell 读取。
- game002 在画面 mutation 前严格编译并校验
  `bg-updcn/bg-cm2cn/bg-gencmcn`。WM 完整提交后才执行 CM
  `Feature1 -> 全 CN Feature_Change/变值 -> CM Change -> CM 转 CN`，完成后才
  进入中奖；refill CM 与 initial CM 共用同一流程。
- 无 CM、WM-only、CM-only、WM+CM、无已有 CN、多个 CM、unsafe integer 和
  component/scene 漂移均有明确行为或 strict failure；未修改 shared public API。

## 交付物

| 文件                                                 |      字节 | SHA-256                                                            |
| ---------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `tasks/artifacts/132/game002-s3-symbols-task132.zip` | 6,222,967 | `7530bb2d824ead45114e52aee6ce38900762b6de5859b91b99f7b3e5c4e37937` |
| `tasks/artifacts/132/crave-layout-task132.zip`       | 9,862,114 | `bec61622f208546efaa7ad069c502559b34c24968932aa216d403ec6993aa51c` |
| `assets/crave/layout.manifest.json`                  |     4,621 | `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09` |
| `assets/crave/assets.map.json`                       |    37,070 | `317a60ccbe130be11fd244069fb8bdc71bbe8068b11a42c4fc4069c157dbcaf5` |

Downloads 输入未修改：

| 文件                      |      字节 | SHA-256                                                            |
| ------------------------- | --------: | ------------------------------------------------------------------ |
| `crave-symbols-fixed.zip` | 6,195,912 | `8e1d9655ff33b0827f41f671d021305d2211056e599368a93a2475a4bbe20835` |
| `crave-v2.zip`            | 9,832,922 | `3a96ebe392133765e5b33c96769277b9c8a6c499cce75bf5ceabc59aadecda9d` |
| `crave-wl-num.zip`        |    28,802 | `21f0aa5c1b720606e09c57640cad426b7ad32a1c90ce542a1fef3db81b8c6487` |

`layout.manifest.json` 的 root hash 未变化；嵌套 Symbols manifest 的 content-addressed
payload 从旧 hash 替换为任务 132 hash，`assets.map.json`、generated imports 与实际
文件同步，无旧 payload orphan。

## 自动化证据

- task132 Symbols authoring：导出/重导通过，输出 hash 稳定。
- task132 Layout authoring：dependency replace、导出/重导通过，输出 hash 稳定。
- Symbols Editor：7 files / 44 tests passed；typecheck、production build passed。
- Game Layout Editor：21 files / 156 tests passed；typecheck、production build passed。
- game002：24 files / 124 tests passed；typecheck、production build、
  `release:check` passed。
- `game002 check:crave-layout-resources`：133 个 scene-layout resources 通过。
- `git diff --check` 通过。

## 计划偏差与剩余风险

- 现有 editor model/IO/UI 已能表达 custom states、activeSpine 和 multi-target
  ImgNumber，因此只新增任务 132 authoring 脚本，没有修改 editor 核心。
- 现有 generic settled-transform 与 prepared replacement 已能表达 WM、CM 两段
  commit，因此没有修改 logiccore、rendercore 或 gameframeworks public API。
- 尚未取得含五个 CM component 的脱敏 live round；协议验证来自 strict constructed
  fixtures。若真实 payload 的 component-scoped matrix 结构不同，应更新明确合同，
  不增加宽松 fallback。
- 自动化验证了状态机和真实 completion counter 合同，但不能替代浏览器中的 Spine
  视觉、跨 CN tier 切换和 live server smoke。浏览器验收状态为待用户验收。

## 用户浏览器验收

1. Symbols Editor 导入任务 132 Symbols ZIP，预览 CM
   `appear/feature1/change`、`xN` exact `Mult` 和四档 CN `featureChange`，再执行
   修改、导出、重导。
2. Game Layout Editor 导入任务 132 Symbols/Layout ZIP，检查 BaseGame、FreeGame
   binding、main reel、background、popup 和 edit/export/reimport。
3. game002 `skin=2` 分别验证 initial 与 refill CM：CM 落点 Start，整盘与 WM 完成
   后播放 Feature1，全部当时 CN 同时 Feature_Change/变值，CM Change 后原位置新
   CN，随后才中奖。
4. 复验 WM-only、期待、cascade、CN collect/summary、popup、resize、
   next-spin、failure cleanup、destroy 和 console。
