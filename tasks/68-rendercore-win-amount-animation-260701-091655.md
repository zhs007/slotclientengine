# 68 rendercore win amount animation 任务报告

## 任务目标回顾

本任务为 `packages/rendercore` 增加通用中奖金额动画能力，并接入 `apps/game003`。实现后，`game003` 在 spin 落停并校验目标 scene 后，会使用 `logic.getBet() * logic.getLines()` 作为下注基准、使用 `logic.getTotalWin()` 作为服务器 raw integer win amount 播放 Pixi 金额递增动画；到达 15x / 30x / 50x 时按顺序播放 bigwin / superwin / megawin VNI segmented tier。浏览器验收按用户要求未执行，交由用户完成。

## 用户反馈后的合同修正

- 下注倍率基准改为 `bet x lines`，例如 live 当前 `10 x 10` 时，金额动画的 `betAmountRaw` 为 `100`。
- `1x -> 15x` 只播放数字变化，时长为 `3s`，不提前启动 bigwin。
- `15x -> 30x` 播放 bigwin，时长至少 `5s`。
- `30x -> 50x` 播放 superwin，时长至少 `5s`。
- `50x -> final` 播放 megawin，时长至少 `5s`；若 final 正好是 `50x`，megawin 仍独占 `5s`。
- tier 切换采用叠播放：bigwin end 和 superwin start 同时播放，superwin end 和 megawin start 同时播放；后启动的 tier 必须盖住前一个正在 end 的 tier。
- bigwin、superwin、megawin 的 tier 切换都按同一流程处理：前一个 tier end 继续跑，后一个 tier start 立刻开始并位于上层。
- 自动阶段到达最终金额后不再自动结束；必须等待玩家点击屏幕。
- 玩家点击时如果当前处在某个 tier 阶段，会先请求当前 tier 的 end / disappear，等待该流程完成后再隐藏金额并结束动画；如果当前只是数字阶段，则直接隐藏金额并结束。

## 实际改动文件

- 新增 rendercore 通用模块：`packages/rendercore/src/win-amount/*`、`packages/rendercore/tests/win-amount/*`。
- 更新 rendercore 导出和文档：`packages/rendercore/src/index.ts`、`packages/rendercore/package.json`、`packages/rendercore/README.md`。
- 扩展 buildgamestatic：`apps/buildgamestatic/src/types.ts`、`apps/buildgamestatic/src/yaml-loader.ts`、`apps/buildgamestatic/src/generator.ts` 及对应测试。
- 扩展 gameframeworks static-config：`packages/gameframeworks/src/static-config/*` 及测试。
- 接入 game003：`apps/game003/config/game-static.yaml`、`apps/game003/src/generated/*`、`apps/game003/src/win-amount-config.ts`、`apps/game003/src/game-adapter.ts`、`apps/game003/vite.config.ts` 及测试。
- 更新协作规则和文档：`agents.md`、`apps/game003/README.md`。

## 资源复制清单

来源：`docs/anieditor5/export`。

目标 JSON：

- `assets/game003-s1/win-amount/bigwin.json`
- `assets/game003-s1/win-amount/superwin.json`
- `assets/game003-s1/win-amount/megawin.json`

目标图片共 27 张，位于 `assets/game003-s1/win-amount/assets/`：

`bigwin_asset_image_mqgf7e6h_g.png`、`image_asset_image_mqgg2jz6_a.png`、`effect3_asset_image_mqgihw37_p.png`、`big_asset_image_mqgir7t1_u.png`、`bigwin_asset_image_mqgix37g_13.png`、`2_asset_image_mqgl9o49_3.png`、`image_asset_image_mqgmcogx_3.png`、`2_asset_image_mqgmd9ai_4.png`、`2_asset_image_mqgmdln6_5.png`、`super_asset_image_mqgmihl5_7.png`、`super_win_asset_image_mqgmin3j_9.png`、`superwin_asset_image_mqgmiqo0_b.png`、`effect4_asset_image_mqgmjujq_d.png`、`2_asset_image_mqgmk7jx_f.png`、`image_asset_image_mqgmko6a_h.png`、`image_asset_image_mqgmkqkl_j.png`、`image_asset_image_mqgmksgb_l.png`、`image_asset_image_mqgn4aqi_1q.png`、`effect2_asset_image_mq6j09f0_k.png`、`effect1_asset_image_mq6m8cly_4.png`、`image_asset_image_mqasjj80_3.png`、`image_asset_image_mqgi7fip_h.png`、`mega_asset_image_mqgn7a26_1t.png`、`win_asset_image_mqgn7cd4_1v.png`、`2_asset_image_mqgn8wz3_27.png`、`image_asset_image_mqgnayb6_2a.png`、`image_asset_image_mqgng0kv_2j.png`。

校验结果：

- `bigwin`：`stage.duration=5`，9 个 assets，缺失 `none`。
- `superwin`：`stage.duration=5`，9 个 assets，缺失 `none`。
- `megawin`：源 `stage.duration=10`，9 个 assets，缺失 `none`；运行时配置 `durationSeconds=5`，rendercore clone 后使用 5 秒，不修改源 JSON。

## 金额和 formatter 合同

- 金额动画只接受 raw server integer：`betAmountRaw` 和 `winAmountRaw`。
- `betAmountRaw` 必须是 finite positive number；`winAmountRaw` 必须是 finite non-negative number。
- `game003` 传入的 `betAmountRaw` 必须是 `logic.getBet() * logic.getLines()`，不是单独的 `logic.getBet()`。
- 阈值比较基于 `winAmountRaw / betAmountRaw`，不先格式化、不先除以显示 scale。
- `game003` 的 formatter 复用 `formatServerUsdAmount(...)`，当前 `100 -> "$1.00"`，framework HUD 与 Pixi 金额动画使用同一套 formatter。
- `packages/rendercore` 未出现 USD、`SERVER_USD_AMOUNT_SCALE` 或 `formatServerUsdAmount`。

## 阈值和阶段实现

- `winAmountRaw === 0`：不创建金额动画 overlay，立即完成。
- `0 < win <= 1x bet`：小额数字在主转轮区底部居中，默认 1.5 秒。
- `win > 1x bet`：先小额到 1x，再切到主转轮区中心大号数字。
- `1x -> 15x`：纯数字变化，默认 3 秒；此阶段不启动 bigwin。
- `15x -> 30x`：bigwin tier 阶段，默认 5 秒。
- `30x -> 50x`：superwin tier 阶段，默认 5 秒。
- `50x -> final`：megawin tier 阶段，默认 5 秒。
- tier 使用 VNI segmented playback：`0s -> 1s` start、`1s -> 4s` loop、`4s -> 5s` end，`keepParticlesAlive=true`。
- tier 切换时上一 tier 调用 `requestSegmentedPlaybackEnd()` 并留在底层继续播放 end；下一 tier 立即 start 并添加到更高层，遮住前一个 tier。
- 最终金额到达后进入 `awaiting-dismiss`，等待玩家点击；点击后才请求当前 tier 的 end / disappear，完成后隐藏金额并结束。

## 边界说明

- `rendercore` 拥有通用金额递增、阈值切换、VNI segmented tier 播放、project/assets 解析和 duration 截断。
- `game003` 只负责从 generated static config 读取资源和阈值、复用 formatter、把 `reelArea` anchor 转成 rendercore layout。
- `game003` 不直接 import `@slotclientengine/vnicore`，不操作 `VNIPlayer` 或私有 Pixi display tree。
- `vnicore` 继续只负责 VNI 播放状态机和粒子排空；不绘制 stage background。
- `playSpin()` 现在等待 symbol win sequence 和金额动画都完成后才 resolve；金额动画的完成包括玩家点击和当前 tier disappear / end 完成。

## agents.md

已更新 `agents.md`，新增长期规则：

- rendercore 拥有通用中奖金额动画状态机和 VNI segmented tier 生命周期。
- game003 framework HUD 和 Pixi 金额动画必须复用同一 formatter。
- game003 金额动画资源属于 `assets/game003-s1/win-amount`，不要混入 symbol VNI manifest 或 `assets/game003-s1/assets`。

## 执行过的命令

首次直接执行 `pnpm --filter game003 generate:static-config` 和 `pnpm --filter @slotclientengine/rendercore typecheck` 均遇到 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，已按计划改用 `CI=true` 重试。

通过的命令：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm --filter game003 check:static-config
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter @slotclientengine/gameframeworks test
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 release:check
find assets/game003-s1/win-amount -maxdepth 2 -type f | sort
find assets/game003-s1/win-amount -name .DS_Store -print
git diff --check
```

用户反馈修正后追加通过的命令：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test -- win-amount
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game003 test -- game-adapter win-amount-config
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 format:check
CI=true pnpm --filter game003 release:check
CI=true pnpm --filter buildgamestatic test -- yaml-loader
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic format:check
CI=true pnpm --filter @slotclientengine/gameframeworks test -- static-config
CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
CI=true pnpm --filter @slotclientengine/gameframeworks lint
CI=true pnpm --filter @slotclientengine/gameframeworks format:check
git diff --check
```

叠播放节奏修正后再次通过的命令：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test -- win-amount
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore format:check
CI=true pnpm --filter game003 release:check
git diff --check
```

边界 grep 结果：

- `rg -n '@slotclientengine/logiccore' apps/game003/src`：无输出，退出码 1，符合预期。
- `rg -n '@slotclientengine/vnicore' apps/game003/src`：无输出，退出码 1，符合预期。
- `rg -n 'bg-wins|WaysTriggerData|game003|WL' packages/rendercore/src packages/vnicore/src packages/gameframeworks/src packages/logiccore/src`：无输出，退出码 1，符合预期。
- `rg -n 'USD|SERVER_USD_AMOUNT_SCALE|formatServerUsdAmount' packages/rendercore/src`：无输出，退出码 1，符合预期。
- `rg -n 'win-amount|bigwin|superwin|megawin' apps/game003/src/generated apps/game003/config assets/game003-s1/win-amount`：命中 generated/config/新资源目录，符合预期。

`pnpm-lock.yaml` 未变化。

## 浏览器验收

未执行。用户明确说明“浏览器验收我来做”，本报告只记录非浏览器自动化验收结果。

建议人工验收：

- 首屏先显示 loading，`99%` 才初始化 live，`100%` 后才进入游戏画面。
- URL 中带 `serverUrl` 仍显式失败。
- `totalwin > 0` 时，spin 落停后金额显示为 `$x.xx`，不是服务器整数。
- live 当前 `10 x 10` 时，倍率阈值应以 `100` 为下注基准。
- 大于 1x 后数字切到主转轮区中心；`1x -> 15x` 只播放 3 秒数字变化。
- `15x -> 30x` 播放 bigwin 且至少 5 秒；切 superwin 时，bigwin end 与 superwin start 同时播放，superwin 在上层。
- `30x -> 50x` 播放 superwin 且至少 5 秒；切 megawin 时，superwin end 与 megawin start 同时播放，megawin 在上层。
- `50x -> final` 播放 megawin 且至少 5 秒。
- 最终金额到达后必须等待玩家点击；点击后金额 overlay 应彻底隐藏。
- 如果玩家在 bigwin / superwin / megawin 当前阶段中点击，应先播放当前阶段的 disappear / end，再隐藏金额并结束。
- 动画期间无第二 canvas、无隐藏 DOM overlay、无双 WebSocket。
- 播放完成后 framework 才进入 collect / idle。

## 二次遗漏检查

- 目标文件均在任务范围内；未改动无关业务模块。
- `assets/game003-s1/win-amount` 只包含本任务需要的 3 个 JSON 和 27 张图片。
- 三个 JSON 引用的 asset 全部存在，无 `.DS_Store`。
- YAML、generated TS、static-config types/validate、buildgamestatic tests 已同步。
- `game-loading.generated.ts` 包含 `game003-win-amount-vni-projects` 和 `game003-win-amount-vni-assets`，glob 非空由 generated expansion 测试覆盖。
- `game-static.generated.ts` 包含 `winAmount` 配置、project modules 和 asset modules。
- rendercore 没有 USD、game003、GMI、`bg-wins`、Ways/WL 专属逻辑。
- game003 没有直接操作 VNIPlayer 或 VNI 私有 display tree。
- game003 复用同一个 formatter 显示 framework HUD 和 Pixi 金额动画。
- `playSpin()` 等待金额动画、玩家点击 dismiss 和现有 symbol win sequence 都完成。
- `game003` 金额动画下注基准已由单独 `bet` 改为 `bet * lines`。
- rendercore、buildgamestatic、gameframeworks 三层都校验 tier `durationSeconds >= 5`。
- tier 切换测试覆盖 bigwin end / superwin start、superwin end / megawin start 同步叠放，且后一个 tier 在上层遮住前一个 tier。
- 点击中断测试覆盖当前 tier 先走 end / disappear，且不会继续启动后续 tier。
- destroy、viewport change、repeated spin、zero win、invalid data 均有测试覆盖。
- `agents.md` 已更新。
- `git diff --check` 通过。
