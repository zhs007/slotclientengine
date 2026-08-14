# 209 RenderCore Scene Layout Popup 字符串输入执行报告

UTC：2026-08-14 06:02:39

## 结果

RenderCore 已为 Scene Layout transition prelude 增加本轮文字输入：

```ts
await runtime.requestGameMode(targetMode, {
  preludePopupStrings: [
    { kind: "text", name: "heading", text: translatedHeading },
    { kind: "image-string", name: "amount", text: formattedAmount },
  ],
});
```

- 输入只应用到 exact directed edge 已绑定的普通 Spine `preludePopup`。
- text/manual ImgNumber 均使用 `kind + exact name + 最终 string`；RenderCore 不解释翻译 key、金额或币种。
- runtime 在 Popup start 前应用输入；任一 setter 失败时回滚已应用节点，不启动 Popup或切换mode。
- Popup complete、失败、immediate dismiss或runtime destroy后恢复调用前的 `text/overridden` 状态，避免本轮金额留到下一轮。
- 既有player exact handle `setText/resetText`保持persistent语义，可继续在播放前或播放中直接更新。
- presentation-only surface同步支持相同request options。

没有修改`apps/**`、`assets/**`、Popup/Scene Layout schema、ZIP、生成器、lockfile或Crave代码。

## 实际文件

RenderCore实现与测试：

- `packages/rendercore/src/scene-layout/types.ts`
- `packages/rendercore/src/scene-layout/package-runtime.ts`
- `packages/rendercore/src/scene-layout/presentation-surface.ts`
- `packages/rendercore/tests/scene-layout/package-runtime-mode.test.ts`

文档与稳定规则：

- `docs/crave-scene-layout-popup-inputs.md`
- `packages/rendercore/README.md`
- `docs/popup-manifest.md`
- `docs/scene-layout-manifest.md`
- `docs/agent-rules/shared-game-runtime.md`
- `docs/agent-rules/scene-layout.md`

## 计划适配

- 按用户最新要求把实施范围收敛到RenderCore与必要文档，不修改或验证assets，也未修改gameframeworks。
- 没有新增独立Popup helper文件；transaction helper留在package runtime内部，直接组合既有player handle，避免新增一层无消费者的public API。
- 只保留必要校验：edge必须有prelude、exact kind/name、重复输入，以及底层text/ImgNumber setter本身的字符串/glyph失败；未增加业务或资产完整性检查。

## 自动验收

通过：

```text
RenderCore定向Vitest
  5 files passed, 27 tests passed

pnpm --dir packages/rendercore exec tsc -p tsconfig.build.json --noEmit
  passed

pnpm --dir packages/rendercore build
  passed

git diff --check
  passed
```

定向测试覆盖本轮text+ImgNumber输入、调用前persistent override恢复、第二节点失败回滚、无prelude拒绝、Popup complete恢复、runtime destroy恢复，以及既有Spine/video/presentation surface回归。

完整`pnpm --dir packages/rendercore typecheck`仍只有任务207已记录的既有测试类型错误：

```text
tests/popup/award-player.test.ts(21,6) TS2352
readonly visibleStates 转换为 string[]
```

本任务未修改该测试；RenderCore production build/source typecheck已通过。依赖从现有pnpm store按锁文件恢复，`pnpm-lock.yaml`未变化。

## 人工验收

浏览器验收按用户要求由用户完成，本报告不声明已通过。请使用最终Gamelayout资源检查：

1. FreeGame source画面先完整播放Popup，再切回BaseGame。
2. 翻译文字和实际赢分正确，连续两轮不串值。
3. 播放中direct handle更新、点击/键盘、placement和backdrop正确。
4. 错误exact name或缺glyph时Popup不闪现、mode不切换，下一次合法请求仍可执行。
5. dismiss、失败或runtime destroy后无残留Popup、override或pending Promise。

当前会话未修改或验收最终assets，也未另行委派独立agent；使用方法见`docs/crave-scene-layout-popup-inputs.md`。
