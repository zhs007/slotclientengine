# 145 anieditorv5runtime-cc playback authored seed control 执行报告

UTC：2026-07-31T05:32:06Z

## 实现

- 为 `V5GCocosPlayer.play()` 的 timeline、range 和 segmented mode 增加
  `ignoreAuthoredSeed?: boolean`；省略或 `false` 保持 VNI 导出的 authored animation `seed`，非
  boolean 在 transport 状态变化前显式失败。
- `ignoreAuthoredSeed: true` 在新 playback session 生成 runtime base seed，并以稳定
  `layerId + animationId` 派生 effective seed。runtime layer view 只在 session 建立时创建，逐帧
  update 不 reroll，也不修改 `options.project` 或 snapshot。
- particle runtime 和 Cocos 当前支持的 deterministic effect 都从同一 playback layer view 采样。
  Cocos 未支持的 `shatter` / `glow` render effect 继续由 validation/init 显式失败。
- pause/resume、seek、restart、loop、segmented ending 和 drain 保留当前 session；range/segmented
  新 `play()` 建立新 session。完成、manual session、pool reset、destroy 和 cancelled manual range
  清理 session state；legacy `playRange()`、manual range 和 pool lease `playOnce()` 保持 authored mode。
- 新增 Cocos public type alias、standalone checker/import/player/parity coverage 和 README 用法；
  generated standalone 由正式生成器更新，未手改。

## 实际修改

```text
packages/anieditorv5runtime-cc/src/core/playback-sequence.ts
packages/anieditorv5runtime-cc/src/cocos/types.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/tests/core/playback-sequence.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
packages/anieditorv5runtime-cc/README.md
```

计划偏差：初次实现只在 README 展示 opt-in 用法，用户复核后要求 standalone 示例也提供直接入口；
因此 `V5GPreview.example.ts` 新增 Inspector 开关并将其传入普通 range/segmented `play()`，checker
同步固定该交付合同。seed session helper 仍保留在 `V5GCocosPlayer`，未新增源文件，也未修改
vnicore、schema、fixture、Cocos driver、pool API、lockfile 或领域规则。

## 验收

用户 nvm 中没有 Node 24，使用桌面环境提供的 Node runtime；依赖按 frozen lockfile 恢复，未产生
lockfile 变更。

```text
PASS  pnpm --dir packages/anieditorv5runtime-cc standalone:build
PASS  pnpm --dir packages/anieditorv5runtime-cc typecheck
PASS  pnpm --dir packages/anieditorv5runtime-cc test
      21 files / 233 tests; coverage thresholds passed
PASS  pnpm --dir packages/anieditorv5runtime-cc standalone:check
PASS  pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
PASS  pnpm --dir packages/anieditorv5runtime-cc build
PASS  pnpm --dir packages/anieditorv5runtime-cc format:check
PASS  pnpm --dir packages/anieditorv5runtime-cc lint
PASS  git diff --check
```

## standalone.zip

本地 ignored 交付物已重建：

```text
path: packages/anieditorv5runtime-cc/standalone.zip
SHA-256: 65cc4099bc7f2f74a7285397f3f57f7d70d4aecabd6b9647add8c433a0cabee7
```

`zipinfo -1` 确认 ZIP 仅包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
standalone/effects/vni-screen-alpha.effect
```

## 人工验收与风险

- 未执行 Cocos Creator 3.8.6 视觉验收；待用含明显 particle 或 deterministic effect 的
  Cocos-compatible VNI 连续比较 authored 与 runtime mode，确认 runtime mode 的两次新播放分布不同、
  单次 playback 无跳变。
- runtime mode 不提供 replay seed；需要精确复现的 consumer 应继续使用默认 authored mode。
- fake Cocos、typecheck 和 standalone parity 不替代真实 Creator 的粒子、材质和帧视觉验收。

## Git

基线为 `effb9dfc64e90116077b1bedf973c9ec975e9b13`。未 commit、未 push、未创建 PR。
