# 133 game003 minecart2 skin runtime parity 执行报告

## 结论

任务 133 的实现与自动化验收已完成。game003 现严格支持 `skin=1|2`：

- skin1 保留原实现，仅作为功能/效果对齐基线。
- skin2 直接消费解压到 `assets/minecart2` 的优化 mapped package，运行时不读 ZIP。
- skin2 使用 scene-layout package 的背景、5x5 standard reel、Symbols、横竖屏
  placement 和 popup；不创建旧矿车动画，也不创建动态传送带 Symbols。
- game003 的 HUD、中奖金额、skin1 win amount 和 skin2 popup 统一使用无货币符号、
  两位小数的 `formatServerAmount()`。
- 固定 `USD` 已从 game003 YAML、生成物和 framework 启动参数移除；服务器
  `amountScale=100` 与两位小数逻辑保留。
- ZIP popup 的 `amountFormat` 仍只作 editor/default preview，game003 runtime
  通过 formatter seam 覆盖，未修改 ZIP 内 popup 配置。

浏览器视觉验收按用户要求未代做，留给用户执行。

## 输入与交付物

- 输入 ZIP：
  `/Users/zerro/Downloads/minecart2.optimized.zip`
- ZIP SHA-256：
  `698c2608bde01b2358ae9e41a70777a471f5e2a3d6d18b754e36b66352a16b78`
- 解压目录：`assets/minecart2`
- layout SHA-256：
  `dbc5bb0cf91c8b50d3b893b1979be663ba7716ddac8ab466a051d9cbb97a63a4`
- assets map SHA-256：
  `65d86f7a98b9b01f1fbac19b7f7c5b29e86a6797de208b68c8b2614fdd2de4e9`
- generated URL closure：138 项。
- `unzip -t`：ZIP 内全部文件通过 CRC 检查。

release checker 会逐项验证 map path/hash/size、mapped folder exact physical closure，
并确认 layout、map 和全部 physical payload 均进入 game003 dist。

## Editor 资源校验审计

最终合同是：

```text
atlas page logical name
  -> manifest texture filename key
  -> assets.map.json content-addressed physical path
```

这三层不要求 basename 相同。审计并修正了 5 条错误路径：

1. Spine background manifest：删除 texture path basename 必须等于 atlas page 的校验。
2. Symbols manifest runtime：删除单页 atlas page 必须等于 texture filename key 的校验。
3. Symbols editor introspection：不再用上传 texture path basename 校验 atlas page。
4. Grid-cell effect：从 atlas 内容读取真实单页 page，不再从 texture key 推导 page。
5. Symbol value presentation：从 atlas 内容读取真实单页 page，不再从 texture key
   推导 page。

Popup 与 scene-layout 原本已使用显式 `textures: { [atlasPage]: filenameKey }`，
无需修改。`editorresource` 的以下严格校验是正确的，继续保留：

- filename key 唯一性与合法扩展名；
- physical path 必须为 `assets/<sha256>.<key-extension>`；
- payload hash、byteLength、缺失和 orphan closure；
- Spine atlas page 与显式 texture page key 的 exact closure；
- skeleton 版本、attachment、animation name 和资源生命周期。

相关回归测试均使用 atlas page 保留 `.png`、texture key 改为 `.webp`、physical URL
为 hash 名的组合。

## 分层与生命周期

- rendercore 拥有 mapped package 解析、Pixi/Spine/VNI、standard reel、popup
  formatter seam、geometry snapshot、viewport 和资源释放。
- game003 拥有 skin 选择、业务 component、CO/bg-wins、金额语义，以及 skin1/skin2
  capability 差异。
- skin2 prepare 并行准备 live session 与 package resource；失败或 abort 会 rollback。
- package owner 随 framework 销毁，不留下半提交 runtime。
- app 没有复制 scene-layout parser、reel 状态机或 popup 播放器。

## 金额配置

`buildgamestatic` 和 `gameframeworks/static-config` 将 winAmount 的 `currency` /
`locale` 改为向后兼容的可选字段。旧游戏仍可声明；game003 不再声明或生成固定币种。

game003 保留：

- `SERVER_AMOUNT_SCALE = 100`；
- minimum/maximum fraction digits 均为 2；
- finite number 严格校验；
- CO `otherScene` raw positive integer 显示语义不变。

## 自动化验收

最终结果：

- buildgamestatic：4 files、25 tests 通过。
- gameframeworks：12 files、81 tests 通过。
- rendercore：73 files、561 tests 通过，branch coverage 80.01%。
- game003：29 files、139 tests 通过，branch coverage 80.12%。
- buildgamestatic、gameframeworks、rendercore、game003 typecheck 通过。
- buildgamestatic、gameframeworks、rendercore、game003 lint 通过。
- game003 `check:static-config` 通过。
- minecart2 generated resource `--check` 通过，共 138 项。
- game003 `release:check` 通过，最终输出
  `game003 static dist check passed.`。
- `git diff --check` 通过。
- game003 范围搜索无 `currency: USD`、`style: "currency"`、旧
  `formatServerUsdAmount` 或 `SERVER_USD` 残留。
- editor/runtime 范围搜索无 atlas page 与 texture filename/path 必须同名的旧错误
  文案或校验残留。

发布构建只有既有的 Vite 大 chunk warning，没有构建失败。

## 计划偏差

- 用户进一步明确“所有 editor 资源都遵循 filename key -> hash path”，因此范围从
  minecart2 Symbols 单点兼容扩大为全部相关 Spine consumer 审计与修正。
- 为彻底移除固定币种，增加了 buildgamestatic/gameframeworks 的向后兼容可选字段；
  未删除共享 API 中供其它游戏使用的 currency 能力。
- ZIP popup 配置按用户要求保持不动，只在 runtime 注入 formatter。
- 未执行浏览器验收；这是已约定的用户负责项。

## Git 与用户输入保护

- 基线 HEAD：
  `abedbf0c67bac430d78e8109aaa0c8a3b942bbb4`
- detached HEAD；未创建分支、未暂存、未提交。
- 未执行 reset、checkout、stash、clean。
- 未修改 `pnpm-lock.yaml`。
- 没有删除 skin1 资源或实现。

## 浏览器验收建议

分别打开合法 game003 query 的 `skin=1` 与 `skin=2`，重点检查：

1. skin1 原背景、bg-bar、矿车和原 reel 行为保持。
2. skin2 横竖屏与 resize 的 package placement、5x5 reel、CO、bg-wins 和 popup。
3. skin2 不出现旧矿车动画或动态传送带 Symbols。
4. HUD、result overlay、win amount 与 popup 的整数 cents 均显示两位小数，任何位置
   不出现货币符号。
5. spin、中奖展示、popup dismiss、下一轮和销毁后无残留节点或异常。
