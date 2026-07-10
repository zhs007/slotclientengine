# game003 win amount manifest assets 执行报告

## 1. 基本信息

- 任务计划：`tasks/88-game003-win-amount-manifest-assets.md`
- 执行时间戳：`260709-071951` UTC
- 仓库：`/Users/zerro/github.com/minecart2`
- 结论：任务范围内实现完成，`game003` 发布面验收通过；根级 `typecheck` 存在本任务边界外的 `apps/reelsviewer` 类型错误，已在第 5 节记录。
- 浏览器验收：未由 Codex 执行，按用户要求留给人工浏览器验收 `game003`。

## 2. 最终资源盘点

主转轮 display symbol 盘点通过：

- `H1-H5.jpg` / `H1-H5.jpeg` 已不存在。
- `WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC` 都存在 `normal PNG`、`spinBlur PNG`、`disabled PNG`。
- `WL,H1,H2,H3,H4,H5,CO,CL,SC` 的状态贴图已随本轮基础 PNG 更新重新生成；`L1-L5` 内容未发生无意义 churn。

win-amount VNI project 盘点通过：

```text
bigwin:   stage=900x1600 duration=2.9 assets=7
superwin: stage=900x1600 duration=2.9 assets=10
megawin:  stage=900x1600 duration=2.9 assets=9
total unique assets=26
```

`assets[].path` 均指向当前存在的 `assets/game003-s1/win-amount/assets/*.png`，没有跨 tier 重复 basename，也没有残留已删除旧资源引用。

## 3. 实现内容

### 3.1 manifest 和资源生成

- 新增 `assets/game003-s1/win-amount/win-amount.manifest.json`，作为 game003 win-amount tier 资源、VNI project、asset glob 和三段式播放时间的唯一静态来源。
- manifest 当前合同为 `version=1`、`kind=vni-win-amount-tiers`、`projectGlob="./{bigwin,superwin,megawin}.json"`、`assetGlob="./assets/*.{png,jpg,jpeg,webp}"`。
- tier 阈值保持 `bigwin=15`、`superwin=30`、`megawin=50`；播放时间统一为 `durationSeconds=2.9`、`loopStartTime=1`、`loopEndTime=2.5`、`keepParticlesAlive=true`。
- 使用 rendercore generator 重新生成 game003-s1 display symbol 的 `spinBlur` / `disabled` 状态贴图。

### 3.2 rendercore / buildgamestatic / gameframeworks 合同

- `packages/rendercore` 新增 win-amount manifest 类型、parser、manifest modules resolver 和 VNI tier 创建入口；旧的 5 秒最低时长假设已移除，改为校验 finite positive duration 与合法 loop 边界。
- `apps/buildgamestatic` 新增 manifest 读取与校验逻辑；YAML 只保留 `winAmount.animations.manifest`，不再维护第二份 tier 时间表。
- generated static config 自动导入 manifest、VNI project modules 和 asset modules；generated loading config 自动追加 manifest、三个 project JSON 和 referenced assets 对应资源组。
- `packages/gameframeworks` 的 static config 类型和校验更新为 manifest/projectModules/assetModules 新形态，不再暴露旧 `tiers` 配置。

### 3.3 game003 / 验收脚本 / 文档

- `apps/game003/src/win-amount-config.ts` 改为调用 `createWinAmountAnimationTiersFromManifestModules(...)`，game003 app 只负责 formatter、布局和 app 层阈值一致性校验。
- `apps/game003/scripts/verify-static-dist.mjs` 已覆盖 win-amount manifest、project JSON 和所有 `assets[].path` referenced assets 的 dist hash 校验，并保留 `H1-H5.jpg` runtime reference 检查。
- `apps/game003/tests/loading-resources.test.ts`、`static-config.test.ts` 改为从 manifest/project JSON 反查资源，不再依赖旧文件名前缀。
- `apps/game003/tests/assets.test.ts` 已移除 `normal: "./H1.jpg"` 漂移反例，改为符合新合同的 PNG 反例。
- `apps/game003/README.md` 和 `packages/rendercore/README.md` 已更新 manifest 驱动说明。
- `agents.md` 已同步新增 win-amount manifest 来源、`2.9/1/2.5` 时间合同、rendercore ownership、`H1-H5.jpg` 删除后的 PNG-only 规则。
- `pnpm-lock.yaml` 未变化，未新增第三方依赖。

## 4. 任务范围内验收

以下命令通过：

```bash
env CI=true pnpm --filter @slotclientengine/rendercore generate:symbol-state-textures -- --input-dir assets/game003-s1 --output-dir assets/game003-s1 --symbols WL,H1,H2,H3,H4,H5,L1,L2,L3,L4,L5,CO,CL,SC --scale 1
env CI=true pnpm --filter game003 run generate:static-config
env CI=true pnpm --filter game003 run check:static-config
env CI=true pnpm --filter @slotclientengine/rendercore test
env CI=true pnpm --filter @slotclientengine/rendercore typecheck
env CI=true pnpm --filter buildgamestatic test
env CI=true pnpm --filter buildgamestatic typecheck
env CI=true pnpm --filter @slotclientengine/gameframeworks test
env CI=true pnpm --filter @slotclientengine/gameframeworks typecheck
env CI=true pnpm --filter game003 test
env CI=true pnpm --filter game003 typecheck
env CI=true pnpm --filter game003 release:check
env CI=true pnpm --filter symbolsviewer test
env CI=true pnpm --filter symbolsviewer typecheck
env CI=true pnpm lint
env CI=true pnpm build
git diff --check
```

资源盘点命令通过：

```bash
node -e 'const fs=require("fs"); const p="assets/game003-s1"; const jpgs=fs.readdirSync(p).filter(f=>/^H[1-5]\.jpe?g$/i.test(f)); if (jpgs.length) throw new Error(`runtime symbol JPGs still exist: ${jpgs.join(",")}`); console.log("game003 symbol jpg removal ok");'
node -e 'const fs=require("fs"); const path=require("path"); const root="assets/game003-s1/win-amount"; const all=new Set(); for (const name of ["bigwin","superwin","megawin"]) { const json=JSON.parse(fs.readFileSync(`${root}/${name}.json`,"utf8")); if (json.stage?.duration !== 2.9) throw new Error(`${name} duration ${json.stage?.duration}`); for (const asset of json.assets ?? []) { const filename=path.basename(asset.path); if (all.has(filename)) throw new Error(`duplicate asset basename across win-amount tiers ${filename}`); all.add(filename); const full=`${root}/${asset.path}`; if (!fs.existsSync(full)) throw new Error(`${name} missing ${asset.path}`); } } console.log("game003 win amount assets ok");'
```

二次搜索审计通过，剩余旧字符串命中均为合理说明或反向断言：

```text
agents.md: 说明 H1-H5.jpg 已删除
apps/game003/README.md: 说明 H1-H5.jpg 已删除
apps/buildgamestatic/tests/generator.test.ts: 断言 generated config 不包含 durationSeconds: 5
```

## 5. 失败与重试记录

首次执行：

```bash
pnpm --filter game003 run generate:static-config
```

因 pnpm 在非 TTY 环境触发 store metadata fetch / modules purge 保护失败，随后使用 `env CI=true` 重试通过。未使用代理。

以下根级命令未完全通过：

```bash
env CI=true pnpm typecheck
```

首个真实失败：

```text
apps/reelsviewer/src/assets.ts(345,14): Property 'layers' does not exist on type 'TransparentSymbolTextureSource | LayeredSymbolTextureSource<...>'.
apps/reelsviewer/src/assets.ts(345,32): Parameter 'layer' implicitly has an 'any' type.
apps/reelsviewer/src/assets.ts(347,40): Parameter 'keyframe' implicitly has an 'any' type.
```

本次 diff 未触达 `apps/reelsviewer`。turbo 在该首错后中断部分并行任务，因此任务范围包已单独完成 typecheck，且根级 `env CI=true pnpm build` 已通过。

## 6. 浏览器验收交接

Codex 未执行浏览器验收。建议人工验收时启动：

```bash
env CI=true pnpm --filter game003 dev -- --host 127.0.0.1 --port 5173
```

浏览器重点检查：

- `game003` 仍先走 `packages/gameloading`，`100%` 后再进入游戏画面。
- big / super / mega 金额动画触发后使用新 `2.9s` VNI 资源，开始段、循环段、结束段节奏分别符合 `0..1`、`1..2.5`、`2.5..2.9`。
- 点击金额动画仍只加速/跳档或在最终 `awaiting-dismiss` 后 dismiss，不重新阻塞 `playSpin()`。
- 下一次 spin 开始时上一轮残留金额展示会清理。
- dist 中不再请求或引用 `H1-H5.jpg`，主转轮 symbol 普通态使用 PNG。

## 7. 最终工作区摘要

主要变更集中在：

- 资源：`assets/game003-s1`、`assets/game003-s1/win-amount`
- manifest：`assets/game003-s1/win-amount/win-amount.manifest.json`
- rendercore：`packages/rendercore/src/win-amount/*`、相关 README 和测试
- buildgamestatic：manifest 校验、YAML 读取、generated config/loading 生成和测试
- gameframeworks：static config 类型 / 校验 / public export
- game003：YAML、generated 文件、win-amount config、release dist 校验、测试和 README
- 协作规则：`agents.md`

任务计划文件仍保留为：

- `tasks/88-game003-win-amount-manifest-assets.md`
