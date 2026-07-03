# anieditorv5runtime-cc particle force stop 执行报告

## 1. 任务摘要

- 当前任务按用户本轮指定的 77 任务执行；计划文件内部曾写 `tasks/76-anieditorv5runtime-cc-particle-force-stop-[utctime].md`，但当前计划文件本身为 `tasks/77-anieditorv5runtime-cc-particle-force-stop.md`，且仓库已存在 `tasks/76-game003-win-loop-dismiss-and-minecart-scale.md`，本报告使用 77 前缀，未覆盖已有 76 文件。
- 新增 `V5GCocosPlayer.forceStopAllParticles(options?)` public API，用于立即清空当前 player 管理的所有粒子 runtime 状态和 Cocos 粒子节点。
- 扩展 `requestSegmentedPlaybackEnd(options?)`，新增 `forceStopParticles?: boolean`。默认仍保持旧 drain 行为；传 `true` 时不会在调用瞬间清粒子，而是等 segmented ending 播放到尾帧后清空粒子并跳过 drain。
- 未新增 public `stop()`：当前 runtime 没有普通停止播放接口，本任务不把 `pause()`、`restart()` 或 `destroy()` 改造成 stop，避免引入语义不清的半状态。
- 任务执行中发现 `docs/anieditor5/export/roundreel.json` 已是未提交的新导出样例，按仓库规则同步了 `packages/anieditorv5runtime-cc`、`packages/vnicore` 和 viewer 的 `roundreel` 副本，保持字节一致。

## 2. API 合同

- `forceStopAllParticles()`：
  - 未初始化调用显式失败：`V5GCocosPlayer must be initialized before forceStopAllParticles.`
  - 默认 `suppressUntilNextPlayback: true`，清空粒子后，同一段播放生命周期后续 `update(deltaTime)` 不会重新 emit 粒子。
  - `play(...)`、`playRange(...)`、`seek(...)`、`restart()`、`init()` 会解除 suppression。
  - `{ suppressUntilNextPlayback: false }` 只清当前粒子和 runtime state，后续 `update(deltaTime)` 可按当前播放时间重新生成粒子。
  - 在 `particle-draining` 中调用会清理 pending drain 并同步触发原本 pending 的 `onPlaybackComplete(...)`，避免卡在 drain。
  - 不清 safe glow、chaser light、mask、text binding 或 mounted node。
- `requestSegmentedPlaybackEnd({ forceStopParticles: true })`：
  - 只记录“ending 完成后清粒子”的意图，不在调用瞬间清掉当前可见粒子。
  - start phase 和 loop phase 都覆盖；ending 到 `project.stage.duration` 后清 runtime 和节点，最终 phase 为 `complete`，不进入 `particle-draining`。
  - complete event context 保持 `{ startTime: 0, endTime: duration, currentTime: duration, loopIndex }`。
  - 参数非 boolean 显式失败，不做 truthy/falsy 隐式转换。
- `requestSegmentedPlaybackEnd()` 和 `{ forceStopParticles: false }`：
  - 保持旧行为：进入 ending，尾帧后进入 `particle-draining`，drain 完成后触发 complete。

## 3. 关键实现文件

- `packages/anieditorv5runtime-cc/src/core/playback-sequence.ts`
- `packages/anieditorv5runtime-cc/src/core/particle-runtime.ts`
- `packages/anieditorv5runtime-cc/src/cocos/types.ts`
- `packages/anieditorv5runtime-cc/src/cocos/player.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/README.md`
- `agents.md`

## 4. 测试和同步覆盖

- Core runtime：新增 `forceStopAll()` 测试，覆盖 live particle、draining、重复调用和 `advanceDrain(...)` 清理后的稳定状态。
- Cocos player：覆盖未初始化失败、默认 suppression、`suppressUntilNextPlayback: false`、drain 中强停触发 complete、segmented loop/start phase delayed force stop、flag 不污染下一轮、非 boolean 参数显式失败。
- Standalone：同步单文件类型、runtime、player 行为、checker required exports/snippets、standalone import/player/parity tests。
- README：补充 `forceStopAllParticles(...)`、`requestSegmentedPlaybackEnd({ forceStopParticles: true })`、未新增 `stop()` 的边界。
- 示例：`V5GPreview.example.ts` 新增 Inspector/Button 可调用的 `requestSegmentedPlaybackEndAndForceStopParticles()` 和 `forceStopAllParticles()`。
- `agents.md`：新增长期规则，明确 segmented force-stop 只能在 ending 尾帧后清粒子，立即清粒子必须走 `forceStopAllParticles()`。

## 5. 验收命令

初次 `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test` 在 sandbox 内触发 `node_modules` 重建并因 registry `EPERM` 失败；随后按计划使用代理环境提权重跑，依赖恢复成功。之后完成以下验收：

```bash
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test
CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build
```

结果：

- `format`：通过，Prettier 写入 `src/cocos/player.ts`、standalone 和新增测试格式。
- `format:check`：通过，`All matched files use Prettier code style!`
- `lint`：通过。
- `typecheck`：通过。
- `typecheck:standalone`：通过。
- `standalone:check`：通过，`standalone runtime check passed`。
- `test`：通过，`15 passed`，`168 passed`。
- `build`：通过。

## 6. standalone.zip

已重建：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
```

`zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 输出：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

`standalone.zip` 被 `.gitignore` 的 `*.zip` 忽略，已用 `test -f` 和 `zipinfo -1` 直接验证。

## 7. 边界检查

- `rg -n "forceStopAllParticles|forceStopParticles|suppressParticleEmission|requestSegmentedPlaybackEnd|stop\\(" ...`：命中新 API、README、checker、tests 和 standalone 中的预期位置；未新增 public `stop()` 实现。
- `rg -n "resources\\.load|JsonAsset|from \\\"@slotclientengine|from '../|from \\\"\\.\\./|document|window" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`：0 命中。
- `rg -n "\\.includes\\(" packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`：0 命中。
- `git diff --check`：通过。
- `git check-ignore -v`：
  - `.gitignore:12:*.zip packages/anieditorv5runtime-cc/standalone.zip`
  - `.gitignore:6:coverage packages/anieditorv5runtime-cc/coverage/index.html`
  - `.gitignore:3:.turbo packages/anieditorv5runtime-cc/.turbo/turbo-build.log`
  - `.gitignore:7:.DS_Store packages/anieditorv5runtime-cc/.DS_Store`
- `git ls-files packages/anieditorv5runtime-cc/dist`：无输出，`dist/` 不是 tracked 交付面。
- `test ! -f AGENTS.md || cmp -s AGENTS.md agents.md`：返回 0。

## 8. roundreel 同步

以下同步校验均返回 0：

```text
docs/anieditor5/export/roundreel.json == packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
docs/anieditor5/export/roundreel.json == packages/vnicore/tests/fixtures/export/roundreel.json
docs/anieditor5/export/roundreel.json == apps/anieditorv5viewer/src/assets/projects/roundreel.json
docs/anieditor5/export/assets/image_asset_image_mqtariy1_a.png == apps/anieditorv5viewer/src/assets/assets/image_asset_image_mqtariy1_a.png
```

`roundreel` 相关测试从旧 `VNI_0.022` 断言更新为当前 `VNI_0.042`，继续验证 `runtime_100`、safe_glow、chaser_light、add blend、文件尺寸元数据和 docs 字节一致。

## 9. 真实 Cocos Creator 3.8.6 验收

本机未执行真实 Cocos Creator 3.8.6 编辑器导入或发布包验收；仓库内已完成 fake `cc`、Vitest、typecheck、build、standalone checker 和 zip 验收。真实 Cocos 仍需宿主项目手工执行：

1. 将 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts` 和 `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts` 放入宿主 Cocos 项目脚本目录。
2. 使用带粒子的 VNI 导出，例如 `packages/anieditorv5runtime-cc/tests/fixtures/superwin.json`，或宿主项目内实际带粒子导出。
3. 绑定对应 `SpriteAtlas`，运行 `V5GPreview.example.ts` 或宿主已有组件。
4. 验证默认 `requestSegmentedPlaybackEnd()` 仍进入 particle drain。
5. 验证 `requestSegmentedPlaybackEnd({ forceStopParticles: true })` 调用瞬间不清粒子，ending 到尾帧后清空粒子，不出现 publish 红错。
6. 验证 `forceStopAllParticles()` 立即清空粒子，不影响 safe glow、chaser light、mask、text binding 和 mounted nodes。

## 10. 风险和后续建议

- 真实 Cocos 发布包仍需重点观察是否有红色 runtime error，尤其是 segmented ending 后清粒子和 complete listener 同步抛错路径。
- 本任务未新增 `stop()`；如果未来需要普通停止播放，应单独定义停止播放状态、是否保留当前非粒子画面、是否取消 pending complete 等合同后再实现。
- `docs/anieditor5/export/roundreel.json` 和 docs 新增 PNG 是任务开始前已存在的工作区改动；viewer 同名 PNG 在同步检查时已存在且与 docs PNG 一致，当前仍是未跟踪同步面。本次按仓库规则同步 JSON 副本，没有回滚或重写 docs 来源。

## 11. 最终工作区状态摘要

报告写入时的工作区状态会在最终回复中以最新 `git status --short --untracked-files=all` 和 `git diff --stat` 为准。
