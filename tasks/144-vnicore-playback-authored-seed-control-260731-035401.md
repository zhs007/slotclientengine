# 144 vnicore playback authored seed control 执行报告

UTC：2026-07-31T03:54:01Z

## 实现

- 为三种 `VNIPlayer.play()` mode 增加 `ignoreAuthoredSeed?: boolean`；省略或 `false` 保持
  exported animation `seed`，非 boolean 显式失败。
- `ignoreAuthoredSeed: true` 在每个新 timeline/range/segmented 播放建立 runtime seed session，
  以 runtime base seed 和稳定 `layerId + animationId` 派生 effective seeds。
- player 创建只读 sampling layer view；particle、deterministic effect 和 render effect 从该 view
  采样。authored project、snapshot、schema 和 core sampler 默认确定性合同未改写。
- pause/resume、seek、restart、loop、segmented hold 和 particle drain 复用当前 session；新的
  range/segmented `play()` 重建它。manual playback、legacy `playRange()`、pool `playOnce()` 继续
  authored seed。pool reuse、manual session 和 destroy 清理 session state。
- 更新 vnicore README、中文 API 和中英文 usage；补充 strict normalization、session stability、
  project immutability 和 fresh runtime seed 的测试。

## 实际修改

```text
packages/vnicore/src/core/playback-sequence.ts
packages/vnicore/src/pixi/vni-player.ts
packages/vnicore/tests/core/playback-sequence.test.ts
packages/vnicore/tests/pixi/vni-player.test.ts
packages/vnicore/README.md
packages/vnicore/docs/api-zh.md
packages/vnicore/docs/usage-en.md
packages/vnicore/docs/usage-zh.md
```

计划没有重大偏差。seed layer view 直接保留在 `VNIPlayer`，未新增 helper 文件或修改 core sampler。

## 验收

应用随附 Node runtime 用于命令执行；用户 nvm 目录没有 Node 24。先以 frozen lockfile 安装依赖，
不产生 lockfile 变更。

```text
PASS  pnpm --filter @slotclientengine/vnicore typecheck
PASS  pnpm --filter @slotclientengine/vnicore test
      19 files / 244 tests; coverage thresholds passed
PASS  pnpm --filter @slotclientengine/vnicore build
PASS  pnpm --filter @slotclientengine/vnicore lint
PASS  pnpm --filter @slotclientengine/rendercore --filter anieditorv5viewer typecheck
PASS  pnpm --filter @slotclientengine/vnicore format:check
PASS  git diff --check
```

## 人工验收与风险

- 未执行浏览器视觉验收；待使用明显粒子或 shatter VNI 连续比较 authored 与 runtime 模式，确认
  runtime 模式两次新播放分布不同且单次播放无跳变。
- runtime mode 不提供 replay seed；需要精确复现的 consumer 应继续使用默认 authored mode。
- 未修改 schema、fixture、资源、Cocos runtime、Viewer UI、lockfile 或根工具链。
