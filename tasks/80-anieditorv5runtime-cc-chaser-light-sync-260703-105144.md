# 任务 80 执行报告：anieditorv5runtime-cc chaser light sync

## 1. 任务目标和完成范围

本次按 `tasks/80-anieditorv5runtime-cc-chaser-light-sync.md` 执行，目标是把任务 78 已在 `packages/vnicore` / `apps/anieditorv5viewer` 落地的 `chaser_light` 固定灯位语义同步到 `packages/anieditorv5runtime-cc`，并确保 copyable standalone 交付面同步正确。

已完成：

- 同步 `packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts`。
- 同步 `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`。
- 保持 `packages/anieditorv5runtime-cc/src/cocos/player.ts` 现有 `managed.chaserLightNodes` 节点池行为，不改成每帧重建。
- 新增 / 更新 modular core、Cocos fake driver、standalone direct semantics、standalone parity 和 standalone import/API 测试。
- 更新 `scripts/check-standalone.mjs`，纳入 chaser public API 和关键算法片段。
- 更新 `packages/anieditorv5runtime-cc/README.md` 的固定灯位和 standalone 接入说明。
- 同步 runtime-cc fixtures 与 `docs/anieditor5/export` 的字节形态。
- 重建并复验 `packages/anieditorv5runtime-cc/standalone.zip`。

本次未新增第三方依赖，未执行 `pnpm install`，`pnpm-lock.yaml` 无变化。

## 2. task 78 / git 更新确认

已确认任务 78 对应提交：

```text
b90c27d fix: update schema version to VNI_0.042 in validation tests
```

`git show --stat --name-status --oneline b90c27d` 显示任务 78 修改了 `agents.md`、`packages/vnicore/src/core/chaser-light-sampler.ts`、`packages/vnicore/tests/core/chaser-light-sampler.test.ts`、`packages/vnicore/tests/pixi/vni-player.test.ts`、vnicore docs/fixtures、viewer bundled project 和任务报告。

旧 runtime-cc 与 vnicore 差异已用 `git diff --no-index -- packages/vnicore/src/core/chaser-light-sampler.ts packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts` 复现；差异集中在旧圆形旋转、旧亮灯错位、旧 alpha/scale 波形和缺少 `positiveModulo(...)`。

## 3. 修改文件清单

- `packages/anieditorv5runtime-cc/src/core/chaser-light-sampler.ts`
- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/tests/core/chaser-light-sampler.test.ts`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/README.md`
- `packages/anieditorv5runtime-cc/tests/fixtures/{10x,2x,3reel_multipay_01,3reel_multipay_02,5x,lock_01,multipay,project,respin,scatter1,scatter2}.json`
- `packages/anieditorv5runtime-cc/standalone.zip`（ignored artifact，已直接验证）

## 4. chaser_light 同步细节

旧语义：

- 圆形轨迹把 `elapsed * 2PI` 加进 angle，导致灯位整体旋转。
- 圆形分布使用 `index / totalCount * 2PI`，不是编辑器 / vnicore 的弧长 spacing。
- 每盏灯错位使用 `index * interval`。
- `cycleDuration = interval * totalCount + lightDuration`。
- `isLit = cycleTime <= lightDuration`。
- 亮灯 alpha 使用 `baseOpacity * (0.72 + wave * 0.28)`。
- 暗灯 scale 使用 `0.65 * baseScale`，亮灯 scale 使用 `1 + wave * 0.35`。

新语义：

- 圆形轨迹固定采样点：`angle = index * spacing / max(radius, 1) - PI / 2`。
- 圆形轨迹使用原始 `radius`，不再改写成 `max(radius, spacing / 2PI)`。
- 每盏灯错位周期为 `lightDuration + interval`。
- `cycleDuration = chasePeriod * totalCount`。
- `cycleTime = positiveModulo(elapsed - index * chasePeriod, cycleDuration)`。
- `isLit = cycleTime < lightDuration`。
- 亮灯 alpha 为 `baseOpacity`，暗灯 alpha 为 `baseOpacity * dimAlpha`。
- 亮灯 scale 为 `baseScale * (1 + wave * 0.18)`，暗灯 scale 为 `baseScale`。
- 亮灯 blend mode 为 `add`，暗灯 blend mode 为图层 `blendMode`。

## 5. standalone 交付

已同步 standalone 单文件的 sampler 语义、`positiveModulo(...)` helper 和 public export。

`scripts/check-standalone.mjs` 已新增检查：

- `VNIChaserLightLayerSampleState`
- `VNIChaserLightTextureSize`
- `VNIChaserLightSpriteSample`
- `getChaserLightProgress`
- `hasActiveChaserLightAnimation`
- `sampleChaserLightSpritesForLayer`
- `chaser_light`
- `lightDuration + interval`
- `positiveModulo`
- `getCocosBlendModeConfig(chaser.blendMode)`

`standalone.zip` 已重建。`zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip` 输出：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

`git status --short --ignored packages/anieditorv5runtime-cc/standalone.zip` 输出：

```text
!! packages/anieditorv5runtime-cc/standalone.zip
```

根级 build 在 zip 之后执行过，已在 build 后重新执行 `test -f` 和 `zipinfo -1`，zip 仍存在且内容仍只包含上述两个文件。

## 6. fixture / 文档 / agents 判断

fixture 审计结果：

- `roundreel.json` 与 `docs/anieditor5/export/roundreel.json` 字节一致。
- 其它 runtime-cc fixture 原差异全部为末尾换行差异，JSON 内容一致。
- 已直接按 `docs/anieditor5/export/*.json` 同步已有 runtime-cc fixture，复跑字节检查无输出。
- `git diff --numstat -- packages/anieditorv5runtime-cc/tests/fixtures` 显示每个同步文件仅 `1 1`，符合 EOF 字节同步。

README 已补充：

- `chaser_light` 灯位固定在轨迹采样点上，只推进亮灯/暗灯窗口。
- 圆形 `spacing` 按弧长换算角度。
- standalone 单文件与模块化包使用同一套固定灯位采样语义。

`agents.md` 判断：

- 本任务没有更新 `agents.md`。
- 原因：任务 78 已写入长期规则，当前只是把该规则同步到 runtime-cc 交付面；未发现新的 Cocos / standalone 专属长期协作规则。

## 7. 验收结果

环境：

- `node -v`：`v24.14.0`
- `pnpm -v`：`11.7.0`

已通过的包级验收：

- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck:standalone`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc lint`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc format:check`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc standalone:check`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc test`：16 个文件，179 个测试通过。
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc build`
- `CI=true pnpm --filter @slotclientengine/anieditorv5runtime-cc exec vitest run tests/core/chaser-light-sampler.test.ts tests/cocos/player.test.ts tests/standalone/standalone-player.test.ts tests/standalone/standalone-parity.test.ts tests/standalone/standalone-import.test.ts`：5 个文件，94 个测试通过。

已通过的边界检查：

- `git diff --check`
- `cmp -s docs/anieditor5/export/roundreel.json packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json`
- fixture 全量字节一致性检查：无输出。
- 旧走马灯核心语义扫描：无命中。
- standalone forbidden import / DOM / Node / Pixi / `JsonAsset` / `resources.load` / `require(` 扫描：无命中。
- standalone `.includes(` 扫描：无命中。
- `test -f packages/anieditorv5runtime-cc/standalone.zip`
- `zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip`

根级参考验收：

- `CI=true pnpm lint`：通过，23/23 packages successful。
- `CI=true pnpm build`：通过，23/23 packages successful；仅 Vite chunk-size warning。
- `CI=true pnpm typecheck`：失败于既有无关问题 `apps/uiframeworksviewer/tests/demo-game.test.ts(38,3)`，mock `SlotGameMountContext` 缺少 `getViewport` / `onViewportChange`。本任务修改范围不涉及 `apps/uiframeworksviewer`。
- `CI=true pnpm test`：失败于既有无关问题 `apps/symbolsviewer/tests/symbol-set-config.test.ts:200`，断言 `builtinContext.sprite.scale.x` 期望大于 1，实际为 1。根级输出中 `@slotclientengine/anieditorv5runtime-cc:test` 已通过 16 个文件 / 179 个测试。

## 8. 真实 Cocos 验收或手工交接

已执行：

```bash
command -v CocosCreator
```

结果：无输出，退出码 1，本机当前 PATH 中没有 `CocosCreator` 命令。因此未执行真实 Cocos Creator 3.8.6 编辑器导入验收。

已完成仓库内验收：

- TypeScript typecheck。
- standalone typecheck。
- Vitest fake `cc` player 测试。
- standalone direct sampler / parity / import 测试。
- standalone checker。
- build。
- zip 内容验证。

手工验收需要的文件：

- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts`
- `packages/anieditorv5runtime-cc/standalone.zip`
- `docs/anieditor5/export/roundreel.json`
- `docs/anieditor5/export/assets/*`

手工验收重点：

- 导入 standalone 后播放 `roundreel`。
- 肉眼确认 `chaser_light` 灯位固定，只推进亮灯/暗灯窗口。
- `getRuntimeDiagnostics().chaserLightSpriteCount` 播放中稳定。
- seek 到动画区间外后 chaser 节点归零。
- Cocos 控制台无红色 runtime 错误。

## 9. 已知问题和后续建议

- 根级 `typecheck` 仍有既有 `apps/uiframeworksviewer` mock contract 失败，非本任务引入。
- 根级 `test` 仍有既有 `apps/symbolsviewer` scale 断言失败，非本任务引入。
- 建议后续单独处理上述根级历史失败，避免后续任务继续需要分类说明。

## 10. 二次遗漏检查

- [x] `src/core/chaser-light-sampler.ts` 没有旧的 `elapsed * 2PI` 圆形旋转逻辑。
- [x] `standalone/anieditorv5runtime-cc.ts` 没有旧的 `elapsed * 2PI` 圆形旋转逻辑。
- [x] modular 和 standalone 都使用 `lightDuration + interval` 作为走马错位周期。
- [x] modular 和 standalone 都使用任务 78 后的 alpha / scale / blendMode 语义。
- [x] Cocos player 仍用 `managed.chaserLightNodes` 增删复用，没有每帧重建全部节点。
- [x] `animation-sampler` / `project-sampler` / `validation` 的 `keepOriginal=false`、active flag 和 chaser 参数校验没有被放松。
- [x] Cocos fake driver 测试覆盖 Y 轴反向和 rotation 负角度映射。
- [x] standalone tests 有直接语义断言，不只依赖 parity。
- [x] public export 审计覆盖 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`、standalone 和 `standalone-import.test.ts`。
- [x] `scripts/check-standalone.mjs` 覆盖 chaser public API / snippets。
- [x] `standalone-import.test.ts` 覆盖 chaser sample 类型和 public API。
- [x] `README.md` 已说明固定灯位语义和 standalone 接入边界。
- [x] `roundreel.json` 与 `docs/anieditor5/export/roundreel.json` 字节一致。
- [x] 其它 fixture 差异已分类并同步为字节一致。
- [x] `standalone.zip` 已重建，且 `zipinfo -1` 只包含两个 standalone 文件。
- [x] `standalone.zip` 被忽略也已用 `test -f` / `zipinfo` 直接验证。
- [x] 根级 build 在 zip 之后执行，已在最后再次验证 `standalone.zip`。
- [x] `git diff --check` 通过。
- [x] 包级 `typecheck`、`typecheck:standalone`、`lint`、`format:check`、`standalone:check`、`test`、`build` 已执行并记录。
- [x] 已判断无需更新 `agents.md`。
- [x] 已生成任务报告并使用 UTC 文件名。
