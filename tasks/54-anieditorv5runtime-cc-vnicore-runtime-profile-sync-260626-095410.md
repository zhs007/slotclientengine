# 任务 54 执行报告：anieditorv5runtime-cc vnicore runtime profile sync

报告时间：260626-095410 UTC

## 1. 结论

已完成任务 54。

- `packages/anieditorv5runtime-cc` 模块化源码和 standalone 单文件已同步任务 53 的 `safe_glow` blendMode 继承语义。
- Cocos player 继续对 safe glow node 应用 `getCocosBlendModeConfig(safeGlow.blendMode)`，未引入 normal fallback、placeholder、路径猜测或 manifest/profile 自动选择。
- 已新增 `roundreel` Cocos runtime fixture，覆盖 `VNI_0.020` / `runtime_100` / `safe_glow` / `add` blend / `fileScale: 1` metadata。
- standalone 是本任务主交付面之一：`standalone/anieditorv5runtime-cc.ts`、checker、standalone tests 和 `standalone.zip` 已同步并验收。
- 真实 Cocos Creator 3.8.6 编辑器项目内导入验收未在本轮执行；本报告已列出手工交接步骤，未把 fake-driver/Vitest 冒充为真实编辑器验收。

## 2. 修改文件清单

模块化源码：

- `packages/anieditorv5runtime-cc/src/core/safe-glow-sampler.ts`

standalone / checker / zip：

- `packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts`
- `packages/anieditorv5runtime-cc/scripts/check-standalone.mjs`
- `packages/anieditorv5runtime-cc/standalone.zip`

测试和 fixture：

- `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json`
- `packages/anieditorv5runtime-cc/tests/core/safe-glow-sampler.test.ts`
- `packages/anieditorv5runtime-cc/tests/core/validation.test.ts`
- `packages/anieditorv5runtime-cc/tests/cocos/player.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-import.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-parity.test.ts`
- `packages/anieditorv5runtime-cc/tests/standalone/standalone-player.test.ts`

文档和报告：

- `packages/anieditorv5runtime-cc/README.md`
- `tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync-260626-095410.md`

## 3. 任务 53 delta 分类

| 任务 53 项 | Cocos runtime 处理 |
| --- | --- |
| `safe_glow` 继承 layer `blendMode` | 已同步到 core sampler、standalone sampler、Cocos player 测试、standalone fake `cc` 测试、README 和 checker。 |
| `VNI_0.020` / `runtime_100` / `roundreel` | 已作为真实 fixture 加入 `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json`，profile 语义来自 JSON `exportProfile`。 |
| `validateV5GBundleManifest(...)` path 安全校验 | 不迁入；Cocos runtime 不解析 bundle manifest，不负责 profile 选择。 |
| viewer manifest-driven profile registry | 不迁入；属于 viewer / 宿主选择 project 的职责。 |
| profile-scoped Vite asset URL resolver | 不迁入；Cocos runtime 继续使用 SpriteAtlas 或 resolver，缺资源显式失败。 |
| top-level `project.particles` fail-fast | 保持现有 fail-fast，未放宽。 |
| vnicore/viewer 文档 safe_glow 文案 | 已同步 Cocos README：safe glow 继承图层 blendMode，不需要 shader、Effect、滤镜或模糊。 |

## 4. safe_glow 实现摘要

- `VNISafeGlowLayerSampleState` 增加 `blendMode: V5GBlendMode`。
- `VNISafeGlowSpriteSample.blendMode` 从 `"normal"` 改为 `V5GBlendMode`。
- `sampleSafeGlowSprite(...)` 返回 `blendMode: sampledLayer.blendMode`。
- 保持原有 alpha、scale、rotation、起始帧、`spread <= 0.001` 和 `alpha <= 0.002` 行为。
- `src/cocos/player.ts` 已经在 `applySafeGlowSample(...)` 使用 `getCocosBlendModeConfig(safeGlow.blendMode)`，本轮保留该 fail-fast 写入路径。

## 5. roundreel 验收摘要

新增 fixture 来源：

```text
docs/anieditor5/export/roundreel.json
-> packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json
```

测试中用解析后的 JSON 对比确认 package fixture 与 docs 源数据一致。Prettier 只调整了 package fixture 的格式。

已覆盖：

- `schemaVersion === "VNI_0.020"`
- `editor.name === "VNI"`
- `engineTarget.name/version === cocos_creator/3.8.6`
- `name === "roundreel"`
- `exportProfile === runtime_100/runtime/1`
- animationTypes 包含 `safe_glow`
- blendModes 包含 `add`
- 每个 asset 保留 `fileWidth/fileHeight/fileScale: 1`
- `docs/anieditor5/export/assets/*` 资源路径存在
- `validateV5GProject(...)` 和 `validateCocosV5GProject(...)` 通过
- fake driver 与 standalone fake `cc` 在 safe glow 时间点渲染出 add blend 副本

## 6. Standalone 和 public export

- `standalone/anieditorv5runtime-cc.ts` 已同步 safe glow 类型和 sampler 语义。
- `scripts/check-standalone.mjs` 新增语义片段检查：
  - `blendMode: V5GBlendMode;`
  - `blendMode: sampledLayer.blendMode`
  - `getCocosBlendModeConfig(safeGlow.blendMode)`
- `standalone-parity.test.ts` fixture 列表加入 `roundreel`，并验证 standalone 与模块化 sampler 在 `roundreel` 上输出 `add`。
- `standalone-player.test.ts` 验证 standalone fake `cc` safe glow node 写入 `SRC_ALPHA / ONE`。
- `standalone-import.test.ts` 验证 `VNISafeGlowLayerSampleState` / `VNISafeGlowSpriteSample` public type 可导入且表达 inherited blend。
- 已检查 `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts`：现有 export 链已经覆盖 safe glow sampler 和 Cocos public API，本轮无需改入口。

## 7. README 和边界

README 已更新：

- `safe_glow` 不再描述为固定 normal blend。
- 新描述为同图 `SpriteFrame` 副本、继承图层 `blendMode`、scale 和 opacity。
- 样例数据来源增加 `docs/anieditor5/export/roundreel.json`。
- 保持 runtime 不读取 JSON、不解析 manifest、不负责 profile 选择、不做资源路径猜测。

`standalone/V5GPreview.example.ts` 已检查：它只展示宿主侧 atlas/project 绑定，没有 safe glow 或 profile 选择文案，本轮无需修改。

## 8. 格式、协作规则和依赖

- `packages/anieditorv5runtime-cc/.prettierignore` 仍包含：

```text
coverage
dist
node_modules
```

- `format:check` 等价命令通过，未让 Prettier 扫描生成物。
- 仓库同时存在 `AGENTS.md` 和 `agents.md`；`cmp -s AGENTS.md agents.md` 通过。
- 未更新 `AGENTS.md` / `agents.md`，原因是现有规则已经要求 runtime public 行为同步模块化源码、standalone、checker、standalone 测试和 zip；本任务未新增长期仓库协作规则。
- 未新增 npm 依赖。
- 未执行成功的 `pnpm install`。
- `pnpm-lock.yaml` 未变化。

## 9. 验收命令

环境：

```text
node --version => v24.14.0
pnpm --version => 11.7.0
```

说明：直接执行

```bash
pnpm --filter @slotclientengine/anieditorv5runtime-cc typecheck
```

当前环境的 pnpm 先触发 deps status / install，并因无 TTY 拒绝 purge `node_modules`：

```text
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

该失败发生在 package script 之前，且当前可执行 pnpm 版本为 11.7.0，不是仓库声明的 pnpm 10.0.0。因此正式验收使用任务计划允许的等价本地二进制命令。

通过：

```bash
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.json --noEmit
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.standalone.json --noEmit
node packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/eslint .
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/vitest run --coverage
node_modules/.bin/tsc -p packages/anieditorv5runtime-cc/tsconfig.build.json
cd packages/anieditorv5runtime-cc && ../../node_modules/.bin/prettier --check .
git diff --check
find . -name .DS_Store -print
test -f packages/anieditorv5runtime-cc/standalone.zip
zipinfo -1 packages/anieditorv5runtime-cc/standalone.zip
cmp -s AGENTS.md agents.md
```

测试结果：

```text
15 files passed / 148 tests passed
All files coverage: statements 82.44%, branches 73.35%, functions 93.64%, lines 83.59%
```

语义 grep 通过：

```bash
rg -n "blendMode: sampledLayer.blendMode|VNISafeGlowSpriteSample|roundreel|runtime_100|safeGlow.blendMode|fixed normal|normal blend" packages/anieditorv5runtime-cc/src packages/anieditorv5runtime-cc/tests packages/anieditorv5runtime-cc/standalone packages/anieditorv5runtime-cc/scripts packages/anieditorv5runtime-cc/README.md
```

结果只剩新语义、`roundreel/runtime_100` 和 checker 证明点；无 `fixed normal` 或旧 `normal blend` 语义残留。

`.DS_Store` 检查初次发现：

```text
./assets/symbols002/.DS_Store
./assets/game002/.DS_Store
```

已清理，复跑 `find . -name .DS_Store -print` 无输出。

## 10. standalone.zip

重建命令：

```bash
cd packages/anieditorv5runtime-cc
rm -f standalone.zip
zip -X -r standalone.zip standalone/anieditorv5runtime-cc.ts standalone/V5GPreview.example.ts
```

内容：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

未包含 macOS metadata 或其它文件。`standalone.zip` 被 `*.zip` 忽略，不会出现在 `git status` 中。

## 11. 真实 Cocos Creator 验收状态

未执行真实 Cocos Creator 3.8.6 编辑器项目内导入、场景绑定、截图或视频验收。本轮自动化验收只证明 TypeScript、Vitest fake driver、fake `cc`、standalone checker、build 和 zip 交付。

手工验收交接文件：

```text
packages/anieditorv5runtime-cc/standalone/anieditorv5runtime-cc.ts
packages/anieditorv5runtime-cc/standalone/V5GPreview.example.ts
docs/anieditor5/export/roundreel.json
docs/anieditor5/export/assets/gx_6_asset_image_mqthi919_1e.png
docs/anieditor5/export/assets/image_asset_image_mqtjdi3v_3.jpg
```

建议步骤：

1. 用 Cocos Creator 3.8.6 打开临时或现有项目。
2. 复制 standalone runtime 到项目脚本目录。
3. 导入 `roundreel.json` 和两张图片资源。
4. 按 `V5GPreview.example.ts` 方式绑定 `SpriteAtlas` 和 project 对象。
5. 播放到约 `1.175s`，确认 safe glow 副本出现并继承 `add` blend。
6. 故意缺资源或 atlas key 不匹配，确认显式抛错。

## 12. 最终工作区摘要

本任务改动：

- `packages/anieditorv5runtime-cc/*` 上述源码、测试、README、standalone。
- `packages/anieditorv5runtime-cc/tests/fixtures/roundreel.json`
- 本报告文件。

执行前已有、未由本任务产生的无关改动仍保留：

- `assets/game002/bgfull.jpg`
- `assets/symbols002/AF.png`
- `assets/symbols002/CM.png`
- `assets/symbols002/CN.png`
- `assets/symbols002/CO.png`
- `assets/symbols002/H1.png`
- `assets/symbols002/H2.png`
- `assets/symbols002/L1.png`
- `assets/symbols002/L2.png`
- `assets/symbols002/L3.png`
- `assets/symbols002/L4.png`
- `assets/symbols002/WL.png`
- `assets/symbols002/WM.png`
- `tasks/54-anieditorv5runtime-cc-vnicore-runtime-profile-sync.md`

## 13. 二次遗漏检查

- [x] 模块化源码和 standalone 单文件都已同步。
- [x] `standalone.zip` 已重建并验证内容。
- [x] checker 不再只检查 `safe_glow` 字符串，而是检查 inherited blend 关键片段。
- [x] README 无 fixed normal / normal blend 旧文案。
- [x] 未把 viewer manifest registry 或 Vite asset URL resolver 迁入 Cocos runtime。
- [x] 未新增 `@slotclientengine/vnicore`、`pixi.js`、Node 或 DOM runtime 依赖。
- [x] `runtime_100` 来自 JSON `exportProfile`，不从目录名推断。
- [x] 未修改 `docs/anieditor5/export/roundreel.json` 或其它真实导出 fixture 来绕过测试。
- [x] `roundreel` 保留并校验 `fileWidth/fileHeight/fileScale: 1`。
- [x] `src/core/index.ts`、`src/index.ts`、`src/cocos/index.ts` 和 standalone import 测试已检查。
- [x] `.prettierignore` 保持 `coverage`、`dist`、`node_modules`。
- [x] 缺资源、未知 blend mode、Cocos blend 写入失败继续 fail-fast。
- [x] 旧 `runtime_50` metadata 验收保留。
- [x] atlas `filenameStem(asset.path)` 规则未改变。
- [x] `.DS_Store` 已清理，`git diff --check` 通过。
- [x] 已区分 fake-driver/Vitest 与真实 Cocos Creator 编辑器验收。
