# 152 game003-symbol-package-filename-keys 执行报告

## 结果

任务 152 的自动化实现与正确资源包已完成。根因是用户提供的 ZIP 已丢失 logical
filename identity，不是最新 Symbols Editor 把正常文件名改成 hash；因此没有修改
production importer，而是从仓库中的 game003 skin 1 权威资源重新生成 mapped ZIP。

新包保持 62 个 logical resource key，并将相同内容去重为 57 个 physical payload；
`WL.png`、`Symbol.atlas`、`L1-wins.json` 等原文件名保留在 `assets.map.json` 的 key 和
manifest 引用中，只有 `assets/<sha256>.<ext>` payload path 使用 hash。package id 为
`game003-s1`，cell 为 `165 x 130`，display symbol 数为 14。

## 实际文件与计划偏差

新增：

```text
apps/symbolseditor/scripts/build-task152-game003-symbols.mjs
tasks/152-game003-symbol-package-filename-keys.md
tasks/152-game003-symbol-package-filename-keys-260803-054951.md
tasks/artifacts/152/game003-s1-symbols.zip（被 *.zip 规则忽略的本地交付物）
```

修改：

```text
apps/symbolseditor/package.json
apps/symbolseditor/src/model/state-texture-generation.ts
apps/symbolseditor/tests/state-texture-generation.test.ts
apps/symbolseditor/tests/zip-io.test.ts
```

计划原拟使用 TypeScript task 脚本；实际改为 Node ESM `.mjs`。当前 TypeScript 6 与
`ts-node-esm` 10 的组合无法在该入口中解析仓库的 `.js` 到 `.ts` 导入，连相邻 YAML
loader 源码也无法稳定加载。最终脚本直接调用构建后的 browserartifactio、editorresource、
rendercore symbol materializer 和 buildgamestatic YAML loader，保留相同 owner 与严格校验，
并由 editor ZIP 往返测试保护 importer/exporter 合同。

没有修改 production importer、shared public API、game003 权威资源、依赖版本或
`pnpm-lock.yaml`。依赖按 frozen lockfile 安装；第一次 Sharp lifecycle 因子进程 PATH
缺少 Node 失败，显式使用 Node 24 PATH 后完成，lockfile 无差异。

用户浏览器验收发现，带 `animations.normal` 的 symbol 无法点击“生成模糊图”和“生成
disable 图”。后续修正生成源解析：direct image normal 继续可用；Spine/VNI normal 在
`baseVisual` 明确为 image 时也使用该 logical image 及 bytes。layered、empty、无底图和
Spine tier normal 仍保持禁用，不猜测其他图片。

## 交付 ZIP

```text
path: tasks/artifacts/152/game003-s1-symbols.zip
size: 4,490,756 bytes
SHA-256: 2dd983e1213a66be4b948dd3b06af3091f6ac44d300399296e2ff572a66cf034
logical resource keys: 62
physical payloads: 57
display symbols: 14
cellSize: 165 x 130
```

Builder 从 `assets/game003-s1`、`assets/gamecfg003/gameconfig.json` 和
`apps/game003/config/game-static.yaml` 派生 exact closure 和 cell size；连续生成结果必须
逐字节相同，`--check` 只读复算并与交付物比较。5 组 L1–L5 normal/VNI 同 bytes 资源
共享 payload，但仍保留各自 logical key。

## 自动化验收

```text
pnpm --filter symbolseditor build:task152                         passed
pnpm --filter symbolseditor build:task152 -- --check              passed
pnpm --filter symbolseditor typecheck                              passed
pnpm --filter symbolseditor exec vitest run tests/zip-io.test.ts   1 file / 6 tests passed
target changed-file Prettier check                                 passed
task 152 builder direct ESLint                                     passed
state texture generation + app shell tests                         2 files / 28 tests passed
state texture generation changed-file ESLint                       passed
git diff --check                                                   passed
```

新增测试确认两个 logical key 即使内容完全相同，mapped ZIP 也只共享 physical path，
不会合并资源库记录或破坏 VNI typed reference。Builder 的写入模式和 check 模式均输出相同
SHA-256、62/57 数量和 `165 x 130` cell。

完整 `pnpm --filter symbolseditor lint` 另行尝试，但被 4 个既有 task 脚本
`build-task131/132/135/147-symbols.ts` 的 ESLint parser project 配置阻塞；错误不涉及本次
新增 `.mjs`，该脚本的定向 ESLint 已通过。

## 人工验收与剩余风险

按用户要求，真实浏览器验收由用户处理，本次没有把 headless 导入、编译或单测冒充
WebGL/Pixi/Spine/VNI 视觉结果。待人工检查：

- 打开新 ZIP 后项目为 `game003-s1`、cell 为 `165 x 130`、共有 14 个 display symbol；
- 资源库和 picker 显示 `WL.png`、`Symbol.atlas`、`L1-wins.json` 等 logical filename；
- image、Spine、VNI 以及 normal/spinBlur/disabled/appear/win 状态可正常预览；
- 从 UI 再导出的 ZIP 仍保持 62 logical keys、57 physical payloads 和相同 manifest 语义。

除上述真实浏览器视觉验收外，无已知未完成的自动化实现项。未 commit、未 push、未创建 PR。
