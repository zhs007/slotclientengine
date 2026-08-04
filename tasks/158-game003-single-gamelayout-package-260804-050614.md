# 158 game003 单 Game Layout 包执行报告

## 结果

- `apps/game003` 已收敛为只接受 `skin=2`、只加载 `assets/minecart2` mapped package；旧 skin、静态美术表、legacy Symbols/Popup 资源链和双 presentation 分支已删除。
- `assets/game003-s1` 的 127 个 tracked 文件已全部删除，目录不存在；当前 `apps/`、`packages/`、`docs/` 与测试不再读、glob 或引用该目录路径。包内稳定 identity `game003-s1` 按编辑器导出保留。
- 动态传送带、FeatureBar2/bg-bar presentation 与矿车互动的 config/layout/runtime/sequence、tick、等待和清理链已移除。CO overlay、`bg-wins` carousel、中奖 Popup、live session 和本地公开轮带边界保留。
- SymbolsViewer、PopupEditor、SymbolsEditor、Game Layout Editor、buildgamestatic 与 rendercore 的现行 fixture 已改从 Minecart2 map/typed manifest 取值，或使用中性 synthetic 路径。
- README、game003 领域规则、release checker 和 source-boundary 测试已同步。未修改 lockfile，未 commit/push。

## 资源证据

输入文件：`/Users/zerro/Downloads/minecart2/new-layout-layout (6) (1).zip`

| 项目                           |      bytes | SHA-256                                                            |
| ------------------------------ | ---------: | ------------------------------------------------------------------ |
| 原始 ZIP                       | 18,727,657 | `0720e2bcd6aacb7448219e53743be18c65ae1a55d4f20bec9f26fc48100a7b09` |
| quality 80 optimized ZIP       |  9,200,798 | `36bd1906352aa360ccf278e015fbfa07bca470efac8d09dee33b00622d5b91ff` |
| 正式 `layout.manifest.json`    |     19,065 | `0b105e753a65ba34996b3d4c76d4c77389e57d90218033dfaa141cc3287b97d1` |
| 正式 `assets.map.json`         |     45,509 | `47ad9592da48daf48285fc6c2dcaa4dc7f7ef42fabfaf921f8c394bf265f0716` |
| `minecart2.assets-groups.json` |     89,282 | `8a24b69b58e5a0d562f26520dcc7b6208791cc72945396a8c6a51df0b0b251db` |

- ZIP CRC 通过；正式 package 为 152 个 logical files、148 个实际文件，map 合计 9,516,024 bytes，其中 128 个 logical image 已优化为 WebP。
- generated Vite URL map 与 package `--check` 均确认 148 个实际资源。
- 优化时发现 Spine atlas 页逻辑名必须保持 `.png`，但物理 payload 可为 `.webp`。因此补齐了 gamelayoutpkgcli 的 atlas-aware optimizer/writer，以及 editorresource 对“逻辑 PNG + 显式 WebP physical mapping”的严格校验；未手改 content-addressed payload。

## 自动化验收

- `game003 test`：16 files / 60 tests 通过；statements 88.95%、branches 80.20%、functions 91.61%、lines 89.75%。
- `@slotclientengine/rendercore test`：79 files / 633 tests 通过；全局 branch coverage 80.00%。
- `gamelayouteditor`：22 files / 170 tests 通过。
- `popupeditor`：4 files / 18 tests 通过。
- `symbolseditor`：9 files / 69 tests 通过。
- `symbolsviewer`：2 files / 16 tests 通过。
- `gamelayoutpkgcli`：6 files / 18 tests 通过；`editorresource`：2 files / 37 tests 通过。
- `buildgamestatic`：4 files / 25 tests 通过。
- game003、buildgamestatic、上述 editor/viewer、gamelayoutpkgcli、rendercore、editorresource 共 9 个直接相关 package 的 typecheck 通过。
- `game003 check:resources`、`game003 release:check` 与 production build 通过；dist checker 确认 mapped package closure。
- `assets/game003-s1` 不存在；active source/docs/tests 中旧目录路径搜索为零；`git diff --check` 通过。

## 计划偏差

- 新 ZIP 暴露了 atlas logical page 与优化后物理扩展名的通用工具链缺口，实际修改增加了 `apps/gamelayoutpkgcli` 和 `packages/editorresource` 的最小修正与回归测试。没有扩张 rendercore public API。
- ZIP 已包含 FreeGame、BonusGame 和两段视频转场，但本任务没有新增 live mode 切换；这些资源仅由 package 严格接收。

## 浏览器验收

按用户要求，本执行会话没有启动浏览器，也不声明视觉验收通过。横竖版/resize、normal spin、CO、`bg-wins`、Popup 点击推进，以及服务端仍返回 `bg-bar` 时无传送带/矿车和无额外等待，均由用户在浏览器验收。
