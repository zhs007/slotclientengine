# 任务 155 执行报告：单一 gamelayout 包与延迟资源

## 结果

- game002 的生产资源已统一为 `assets/crave` 一个 gamelayout package；`assets/game002-s3` 已完整删除，当前 apps/packages/docs 不再直接读取该目录。
- Crave manifest 已声明 `nearwin1`、`nearwin2`、`nearwin3` 三个 `runtimeResources`。game002 在 99% 阶段只显式加载 nearwin1/2，nearwin3 保持未加载。
- rendercore 新增 package runtime 的精确图层接口 `getLayer("layout" | "reel" | "transition" | "popup")`，以及资源接口 `getLoadedRuntimeResource(key, kind)` / `loadRuntimeResource(key, kind)`。
- gameframeworks facade 已公开 package resource/runtime/presentation surface factory 与对应类型，后续游戏无需直接依赖 rendercore 才能使用单包、图层和延迟资源接口。
- lazy loader 按 `assets.map.json` 的 logical key 定位 physical asset，校验 byteLength 与 SHA-256，合并并发请求、缓存成功结果，并在失败/destroy 时回滚 Object URL。
- gamelayoutpkgcli 输出独立的 `runtime-resource:<key>` 分组；nearwin1/2/3 的增量项分别只含各自 skeleton，共享 `symbol.atlas` 与 `symbol.webp` 仍由 eager Symbols 闭包拥有。
- symbolsviewer、rendercore、gamelayouteditor、symbolseditor 的生产 fixture 已迁移为从 Crave map 读取，不再依赖已删除目录。
- 明确 SymbolsEditor ZIP 对 gamelayouteditor 是自包含、只读的 symbol 状态机合同；Layout Editor 只绑定 package/reelSet/renderMode 并调用公开 preview/capability，不编辑内部图片或动画细节。当前实现已遵守该边界，无需新增行为改动。

## 输入与产物

| 项目                                              |            大小 | SHA-256                                                            |
| ------------------------------------------------- | --------------: | ------------------------------------------------------------------ |
| `/Users/zerro/Downloads/crave/crave-layout.zip`   | 9,868,988 bytes | `143350212a44be3a5995cf9c01d2357f8ec6955274d9221a6fef75a59101564e` |
| `/private/tmp/task155-crave-layout.optimized.zip` | 2,937,506 bytes | `b8395bb6f222aeddabed81def0a9cd57404b66cc795dc45d6870d01dab3125b1` |

- Downloads 原 ZIP 未修改。
- optimized ZIP 内容已精确展开到 `assets/crave`，并生成 `assets/crave.assets-groups.json`。
- 所有图片共 100 张，使用 quality 80 优化；正式 package map、manifest 和生成的 Vite resource index 已同步。

## 自动化验收

所有 Node/pnpm 命令均先执行 `nvm use 24`，实际 Node 为 `v24.14.0`。

- game002：typecheck 通过；26 files / 190 tests 通过；`check:resources` 通过；`release:check` 与 static dist checker 通过。
- rendercore：typecheck 通过；本任务 scene-layout/reel 定向 6 files / 37 tests 通过；迁移后的 production fixture 4 files / 67 tests 通过。
- gamelayoutpkgcli：typecheck 通过；6 files / 17 tests 通过。
- symbolsviewer：typecheck、build 通过；2 files / 17 tests 通过。
- gameframeworks facade：typecheck 通过；13 files / 87 tests 通过。
- gamelayouteditor production reel fixture：1 file / 3 tests 通过。
- symbolseditor migrated fixtures：3 files / 40 tests 通过。
- `git diff --check` 通过；`assets/game002-s3` 不存在；当前 apps/packages/docs 中 `assets/game002-s3` 路径搜索无结果。

## 人工验收

按用户要求，本任务没有启动浏览器。game002 的 loading 进度、BaseGame/FreeGame、nearwin1/2、popup、resize 与图层 identity 的浏览器验收由用户处理。
