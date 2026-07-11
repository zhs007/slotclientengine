# game003 resource and Spine refresh 任务报告

## 1. 执行结论

任务 90 已完成任务范围实现和严格验收：

- `game003-s1` 的 16 个 Spine skeleton 已按当前美术输入确认为 Spine `4.2.43`。
- `packages/rendercore` 的官方 Spine runtime 已从可跨 minor 的 `^4.3.9` 改为锁定 4.2 的 `~4.2.0`，lockfile 最终解析为 `4.2.119`。
- rendercore 已按 skeleton version 严格分派：3.8 使用已有内部 adapter，4.2 使用官方 runtime；malformed、未知版本和 4.3 等错配版本显式失败。
- 旧的 Spine 3.8 atlas parser 不再尝试解析当前 4.2 `bounds/rotate:90` atlas。
- `game003` 当前 8 个 display Spine symbol 保持不变：`WL,H1,H2,H3,H4,H5,CL,SC`。
- `BN,CN,ES,MP2,RS,Reel_NearWin,UP,UPCN` 仍不进入主转轮 display set、YAML Spine glob、loading display 资源组或 symbolsviewer display set。
- win-amount 三个 project 共引用 30 个唯一 asset，磁盘 assets 也刚好为 30 个；missing、duplicate、orphan 均为 0。
- 已删除 8 个不再被 project 引用的旧 win-amount assets，并新增 source/loading/dist 精确闭包校验。
- `spinBlur` / `disabled` 在实施前用当前 generator 重建并逐文件比较，14 个 display symbol 的 28 张派生图全部一致，因此本任务没有制造派生图二进制 churn。
- `game-static.generated.ts`、`game-loading.generated.ts` 已由命令检查，均保持最新且没有手改/漂移。
- `game003 release:check` 通过，当前 Spine skeleton/atlas/texture、win-amount manifest/projects/referenced assets 均以 source hash 进入 dist。

## 2. Git 和资源输入

执行开始时工作区已有用户提供的资源变更：

- 16 个 Spine skeleton JSON；
- `Symbol.atlas`、`Symbol.png`；
- `win-amount/{bigwin,superwin,megawin}.json`；
- 12 个新增 win-amount PNG assets。

这些美术输入保持只读：本次没有为了 parser、runtime 或旧测试手改 skeleton、atlas、texture、VNI JSON 或图片内容。

`H1-H5.jpg/jpeg` 继续不存在。`bg1.jpg` / `bg2.jpg` 仍是背景资源，不属于 symbol JPG。

## 3. symbol 派生图检查

在 `/tmp` 中复制当前 14 个 display normal PNG、manifest 和现有派生图，运行：

```bash
node packages/rendercore/scripts/generate-symbol-state-textures.mjs \
  --input-dir <tmp-input> \
  --output-dir <tmp-input> \
  --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC \
  --scale 1
```

对 28 张输出逐文件比较 SHA-256：

```text
WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC
  spinBlur: 14/14 MATCH
  disabled: 14/14 MATCH
```

结论：当前基础 PNG 和派生图已经同步，无需更新 `spinBlur` / `disabled`。最终 `git diff --name-status` 也没有这些文件的变更。

## 4. Spine 4.2 接入

### 4.1 依赖

修改：

```text
packages/rendercore/package.json
pnpm-lock.yaml
```

合同：

```text
package specifier: @esotericsoftware/spine-pixi-v8@~4.2.0
resolved spine-pixi-v8: 4.2.119
resolved spine-core: 4.2.119
resolved spine-canvas: 4.2.119
```

`~4.2.0` 允许 4.2 patch 更新，但不能自动跨到 4.3。

依赖安装记录：

1. `CI=true pnpm install` 因 frozen lockfile 正确拒绝旧 lock。
2. `CI=true pnpm install --no-frozen-lockfile` 在沙箱内因 registry `EPERM` 失败。
3. 按任务要求使用 `http_proxy/https_proxy=http://127.0.0.1:1087` 重试；第一次代理安装因安装脚本 PATH 中找不到 `node/npm` 失败。
4. 补充 bundled Node/fallback bin PATH 后，用同一代理命令重试成功。

### 4.2 版本分派和 fail-fast

新增：

```text
packages/rendercore/src/symbol/spine-version.ts
```

修改：

```text
packages/rendercore/src/symbol/manifest.ts
packages/rendercore/src/symbol/spine-animation.ts
```

实现结果：

- `readSupportedSpineSkeletonVersion()` 只接受 `3.8.x` 和 `4.2.x`。
- 缺 `skeleton` metadata、缺 version、空 version、4.3 或其它未知版本直接抛错。
- manifest 预校验先分类版本。
- 3.8 继续使用 `parseSpineAtlasText()` / `validateSpine38SkeletonContract()` 和 `Spine38SymbolPlayer`。
- 4.2 使用官方 `TextureAtlas`、`AtlasAttachmentLoader`、`SkeletonJson` 和 `Spine`。
- 4.2 预校验继续检查单 atlas page、`Symbol.png` page/texture 一致、attachment region 和 exact animation name。
- official player 已按 4.2 API 使用 `setToSetupPose()` 和按 animation name 调用 `setAnimation()`。
- runtime 初始化错误不退回 builtin/static/default/normal。

### 4.3 测试调整

修改：

```text
packages/rendercore/tests/symbol/spine-animation.test.ts
packages/rendercore/tests/symbol/spine38-runtime.test.ts
```

旧测试不再把当前 4.2 game003 美术资源当成 3.8 fixture。3.8 adapter 改用稳定的测试本地最小 skeleton/atlas，继续覆盖 weighted mesh、clipping、once lifecycle 和错误合同；4.2 路径覆盖 official player 和 unsupported/malformed version 显式失败。

## 5. win-amount 资源闭包

最终 project 统计：

```text
bigwin:   stage=900x1600 duration=2.9 assets=8
superwin: stage=900x1600 duration=2.9 assets=11
megawin:  stage=900x1600 duration=2.9 assets=11
unique referenced basenames=30
disk assets=30
missing=0
duplicate=0
orphan=0
```

manifest 时间合同未改：

```text
durationSeconds=2.9
loopStartTime=1
loopEndTime=2.5
```

删除的 orphan：

```text
1_asset_image_mr8vgcru_1i.png
1_asset_image_mr8whgiu_1r.png
2_asset_image_mr8vt3bd_1l.png
a1_asset_image_mrae2ges_2h.png
big_asset_image_mr4s4la3_w.png
mega_asset_image_mrae66wt_37.png
win2_asset_image_mr4s4o3o_y.png
win3_asset_image_mrae4kox_2n.png
```

修改的验收面：

```text
apps/game003/tests/loading-resources.test.ts
apps/game003/tests/static-config.test.ts
apps/game003/scripts/verify-static-dist.mjs
```

现在不仅检查“所有引用存在”，还要求 generated loading/source assets 集合与三个 project 的引用集合完全一致；release check 同时拒绝 missing、duplicate 和 orphan。

## 6. 文档和协作规则

已同步：

```text
agents.md
packages/rendercore/README.md
apps/game003/README.md
apps/symbolsviewer/README.md
```

同步内容：

- 当前 game003-s1 display skeleton 为 Spine 4.2.43。
- 官方 runtime 必须锁定 4.2.x，不能跨 minor。
- 4.2 使用 rendercore 封装的 official runtime；3.8 adapter 不是当前 game003 路径。
- 未知/错配版本和 atlas/skeleton/animation 错误显式失败。
- app/viewer 不直接依赖 Spine runtime。
- 8 个非 display skeleton 不通过宽泛 glob 自动接入。

## 7. 任务范围验收结果

通过：

```text
@slotclientengine/rendercore test        30 files / 198 tests
@slotclientengine/vnicore test           15 files / 195 tests
buildgamestatic test                      4 files / 24 tests
symbolsviewer test                        2 files / 16 tests
game003 test                             28 files / 136 tests
```

以下包级检查通过：

```text
@slotclientengine/rendercore lint/typecheck/build
@slotclientengine/vnicore lint/typecheck/build/format:check
buildgamestatic lint/typecheck/build
symbolsviewer lint/typecheck/build/format:check
game003 lint/typecheck/format:check
game003 release:check
game003 check:static-config
```

`game003 release:check` 最终输出：

```text
game003 static dist check passed.
```

本次触及的代码、测试、README、AGENTS、package.json 和任务文档全部通过独立 Prettier check。`git diff --check` 通过。

## 8. 全仓验收结果

通过：

```text
CI=true pnpm lint   23/23 packages
CI=true pnpm build  23/23 packages
```

后续已一并解决最初发现的两个 root blocker：

- `reelsviewer`、`game001`、`game002` 的 normal texture loader 显式处理 `transparent` 联合类型，并新增对应测试；未将透明资源错误加载为 Pixi texture。
- `anieditorv5viewer` 测试不再依赖 Git 中从未存在的 `docs/anieditor5/roundreel.zip` / `megawin.zip` 二进制，而是从受版本控制的 export JSON 和真实引用 assets 确定性构造等价 zip fixture。
- `game001` 旧测试 mount context 已补齐 framework 当前要求的 viewport API。
- unfinished `appear` 清理测试使用测试专属 animation resolver，不恢复生产默认 resolver 对 `appear` 的隐式兜底。

最终根级验收通过：

```text
CI=true pnpm typecheck  23/23 packages
CI=true pnpm test       23/23 packages
```

`pnpm test` 中 `netcore` 需要监听本机临时 WebSocket 端口，因此完整测试在允许本机监听的环境中复验通过；沙箱内统一的 server start 超时不是测试断言失败。

### 8.1 包全目录 format 基线

以下未修改文件存在既有 Prettier 漂移：

```text
packages/rendercore/src/win-amount/vni-tier-effect.ts
packages/rendercore/tests/win-amount/win-amount-stage.test.ts
apps/buildgamestatic/src/win-amount-manifest.ts
apps/buildgamestatic/tests/generator.test.ts
```

未为任务 90 夹带格式化这些无关文件。本次触及文件的独立 Prettier check 已通过。

## 9. 第二遍遗漏审计

- 美术输入：未手改或回滚用户提交的 skeleton/atlas/texture/VNI JSON/新增图片。
- symbol 派生图：28/28 与 generator 一致，最终无 diff。
- JPG：H1-H5 symbol JPG 不存在；当前 README/规则只描述已删除事实。
- Spine：16/16 skeleton 为 4.2.43；8 个 display animation names 大小写合同保持。
- 依赖：rendercore 唯一直接依赖 official Spine runtime；lockfile 无本任务遗留的 4.3 Spine packages。
- 分派：malformed/unknown 不再通过 catch 误分配到 official runtime。
- 非 display 资源：未进入 manifest/YAML/generated/viewer/runtime display set。
- win-amount：磁盘集合与 30 个引用完全相等。
- generated：两个 generated TS 无 diff，check 通过。
- side consumers：symbolsviewer、game003 tests、loading、source boundary、dist verify、README、agents 均已覆盖。
- live/gameplay：未修改 gameconfig、live server、gamecode、reel、bg-bar、minecart、中奖循环或点击语义。
- `git diff --check`：通过。

## 10. 人工验收 handoff

自动化和非浏览器发布验收已完成。浏览器中实际观察 `Idle/Start/start/Win` 动画效果、mesh/clipping/blend 视觉以及 big/super/mega 新资源效果，仍待用户进行最终视觉确认；本报告不把该步骤冒充已完成证据。
