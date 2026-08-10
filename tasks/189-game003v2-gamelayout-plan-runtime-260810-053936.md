# 189 game003v2-gamelayout-plan-runtime 执行报告

## 结果

- 新增 `apps/game003v2`，以 Scene Layout package、logiccore immutable operation plan、rendercore coordinator/
  reel/symbol/popup owner 和 gameframework request-dispatched hook 组成精简 live consumer。
- game003v2 非 generated `src/**/*.ts` 共 936 行；旧 game003 对应 2,572 行。新 app 不读取
  `assets/game003`，资源仅来自本任务接收的 `assets/minecart2`。
- standard reel 已支持 response 前 targetless continuous start、response 后同一 transaction settle，以及失败/
  destroy cancel；game app 不创建 reel ticker 或第二套 coordinator。
- round compiler 先完成 strict server selection、ordered operation draft、logiccore finalize/deep-freeze，再允许
  rendercore mutation。中奖组以 plain plan data 交给 carousel，不在执行期保留 GameLogic。
- 全仓长期规则已记录：production 解包资源 files/bytes 为权威；runtime/build 不比较 hash、byteLength、
  content-addressed filename，不扫描 orphan，不做全包齐全性 gate；实际引用缺失在消费点报错。
- game003v2 不再生成逐文件资源绑定。Vite 原样提供 `assets/minecart2`，rendercore 按 manifest URL 和
  assets map 在消费点加载；美术替换目录后只需重启开发服务或重新构建，不产生 TypeScript diff。

## layout10 接收与 CLI 修复

- 只读输入：`/Users/zerro/Downloads/minecart2/layout10.zip`
- 输入 SHA-256：`5ab872fb5ea12404c6aba7b550023dbc530d6adf367a31023db803ca8965335a`
- 输入 ZIP：25,527,802 bytes；quality 80 最终输出：10,220,443 bytes；转换图片 171 个。
- 优化产物经 staging 完整替换 `assets/minecart2`，并同步
  `assets/minecart2.assets-groups.json`；没有与旧目录合并。中间错误产物保存在 `/private/tmp`，可恢复但未进入项目。

执行中确认并修复 `gamelayoutpkgcli` 的 Spine 引用缺陷：

1. 原 ZIP 的 logical key 是 `pkg-9-minecart2-symbol.png`，atlas 页名是
   `pkg-9-minecart2-Symbol.png`。旧 CLI 以大小写敏感精确匹配 atlas 页，漏判后把 logical key 改成 WebP，
   却未改 atlas 文本。
2. CLI 现在以 editor asset collision token 唯一解析 atlas 页，图片统一改为 WebP，并同步重写 atlas 页名；
   页资源不存在时直接报错。
3. 普通 Spine resource 还具有 `textures` 页名键。CLI 同步重写该键和值，并在重写后冲突时直接报错。

最终 `pkg-9-minecart2-symbol.atlas` 首行与 typed texture binding 均为
`pkg-9-minecart2-symbol.webp`。旧 game003 的严格 package prepare 和新 game003v2 build 均通过，未发现需要美术
补入的实际消费资源。

## 主要公共合同变化

- rendercore `RenderReelSet`：standard continuous `start/settle/cancel`。
- Scene Layout package runtime：同一 continuous API 支持 standard/grid-cell，standard 明确拒绝 grid-cell-only 输入。
- symbol win carousel：`prepareGroups()` 接收 compiler 产出的严格 plain groups。
- gameframeworks facade：导出已有 strict server view/source selector，避免 game app 直依赖 logiccore。
- game003v2：package-only loading、plan compiler、thin round adapter、CO image-string value、win carousel 和 award popup。

## 自动验收

通过：

- `gamelayoutpkgcli`: 22 tests、typecheck、lint、build、format check。
- `rendercore`: 92 test files / 728 tests，branch coverage 80.04%，typecheck、lint、format check。
- `gameframeworks`: 13 test files / 91 tests，typecheck、lint。
- 旧 `game003`: 16 test files / 60 tests，coverage 通过；188 项 resource generator `--check` 通过。
- `game003v2`: 定向 tests、typecheck、lint、format check和production build均通过；不再执行resource generator。
- 最终优化 ZIP CRC、`git diff --check` 通过。

整仓现存的非本任务失败：

- 根 `pnpm typecheck` 停在 `packages/uiframeworks/tests/test-helpers.ts`：既有 fake GameLogic 缺少
  `getLastComponentScenes`、`getLastComponentOtherScenes`、`getLastComponentResults`。
- 根 `pnpm lint` 停在 `apps/game002v2/src/round-adapter.ts:214`：既有 `_error` 未使用。

上述文件未在任务范围内修改。直接依赖链已全部通过；未用无关修改掩盖根级失败。

## 待人工验收

浏览器视觉/交互验收由用户执行，当前未标记完成。建议重点观察：request 发出即开始转、response 后只落停一次、
CO 数字、首轮和 lingering win、award popup、横竖屏切换，以及 console 是否存在实际缺资源错误。

浏览器验收发现并修复 coordinator `next-spin` cleanup 提前清除 request-time continuous spin ownership 的问题；
该 cleanup 现在保留 pre-spin 状态，由首个 landing operation 调用 `settleMainReelContinuousSpin()` 完成同一轮落停。
同时将 game003v2 reel direction 从 phase-forward（屏幕向上）调整为 `backward`，使 symbol 按产品预期向下旋转。
