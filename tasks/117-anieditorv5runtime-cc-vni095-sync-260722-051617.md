# 117 anieditorv5runtime-cc VNI 0.095 同步任务报告

## 1. 结论

分支：`codex/anieditorv5runtime-cc-vni095-sync`

本次已完成自动化实现与仓库交付：`packages/anieditorv5runtime-cc` 从上次同步点补齐到 VNI 0.095，模块化源码、Cocos adapter/player、standalone、检查器、测试、README、长期规则和本地 `standalone.zip` 已同步。

本报告不声称完成真实 Cocos Creator 视觉/Profiler 验收。执行环境实际安装了 Cocos Creator 3.8.6，但用户于本任务收尾阶段明确指示“不需要你用 cocoscreator 来验收”，因此停止该项，未把临时 Creator 工程、`.meta`、`Library`、`Temp` 或 `Build` 写入仓库。当前交付状态为：**自动化实现完成；真实 Creator 验收按用户指令免除**。

## 2. Git 基线与同步范围

`packages/anieditorv5runtime-cc` 最后一次代码同步点为：

```text
82651dc 2026-07-06 feat(player): refactor playback event storage to use arrays for improved performance and clarity
```

重新审计 `82651dc..HEAD` 后确认的相关增量：

| 提交                                       | 变更                                                                 | 本次处理                                            |
| ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------- |
| `958378e`                                  | Pixi RAF 零时长 tick                                                 | 排除；Cocos 由宿主 `update(deltaTime)` 驱动         |
| `fca318f`                                  | VNI 0.045、mask composite                                            | 同步 schema；仅执行 `legacy_alpha`，拒绝 precompose |
| `8a9f4c4`、`57974ac`、`1f15a09`、`8bbd20a` | 粒子 stream/twinkle、live elapsed、移动 emitter、segmented/fade 修正 | 同步纯采样、时序与 Cocos 池化渲染                   |
| `c02fcb5`                                  | vnicore metadata/文档                                                | 核对公共合同，无算法复制                            |
| `3a7c8b0`                                  | VNI 0.070 sequence、闭区间、10 类效果                                | 完整同步 core 与 Cocos renderer                     |
| `272791f`                                  | VNI 0.074 `multi_move`                                               | 完整同步                                            |
| `c4435db`                                  | Pixi viewport 适配                                                   | 排除；宿主负责 Cocos Canvas/root 适配               |
| `aff2b91`                                  | VNI 0.087 basic/bounce/rotate pressure                               | 完整同步，使用稳定 outer/content 节点               |
| `ca0b8be`                                  | Pixi loader API                                                      | 排除；Cocos runtime 不拥有 URL loader               |
| `f4e1c40`                                  | bundle manifest path rewrite                                         | 排除；Cocos runtime 消费已解析 project/SpriteFrame  |
| `b0f0f7e`                                  | VNI 0.095 CardCarousel3D                                             | 完整同步 core、切片池、排序和生命周期               |

最终范围检查确认未修改：

```text
packages/vnicore
docs/anieditor5
apps/anieditorv5viewer
pnpm-lock.yaml
```

## 3. 最终合同矩阵

| 编辑器/VNI 合同                                                               | Core                                         | Cocos runtime                                        | Standalone                    |
| ----------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| project/layer strict validation、VNI 0.095                                    | 严格解析，未知/缺失字段失败                  | 额外校验 Cocos 3.8.6 target                          | 同源生成                      |
| `legacy_alpha`                                                                | 接受合同                                     | Cocos mask adapter；source display 可隐藏            | 同源生成                      |
| `precompose_light_alpha`                                                      | 可识别                                       | 显式拒绝，不降级                                     | 同源生成                      |
| sequence                                                                      | 闭区间 frame sampler                         | 同一 display node 只切 SpriteFrame                   | parity 覆盖                   |
| gather/smoke/energy/slash/flame/wave-band/wave-distort/speed-lines/drift/path | 确定性采样                                   | sprite pool、Graphics line、SpriteFrame region cache | parity/standalone player 覆盖 |
| `multi_move`                                                                  | points 预解析、结束 transform 持续           | 应用 sampled transform                               | parity 覆盖                   |
| basic tracks、bounce、rotate pressure                                         | basic-before-preset，独立 `visualRotation`   | outer 承载基础 transform，content 承载视觉旋转       | parity 覆盖                   |
| CardCarousel3D                                                                | 参数预计算、五阶段、depth/order sample       | card/slice 预分配、region frame ownership            | parity 覆盖                   |
| 粒子同期修正                                                                  | live elapsed、moving emitter、segmented/fade | 保留 Cocos 坐标转换、节点复用和 force-stop 合同      | 同源生成                      |

明确不支持/不引入：Pixi、DOM、RAF、独立 renderer、canvas-to-texture、URL loader、bundle manifest/profile selector、precompose fallback、rotated SpriteFrame 切片、缺 texture/rect/originalSize 的切片源。

## 4. 主要实现

- 新增 `timeline-progress.ts`、`sequence-layer.ts`、`multi-move.ts`、`basic-animation.ts`、`effect-sampler.ts`、`render-effect-sampler.ts`、`card-carousel-3d.ts`，同步编辑器/VNI 的纯确定性语义。
- 扩展 types/validation/project sampler/particle sampler/runtime，保留旧 fixture 兼容，同时对未知动画、非法参数、资源缺失和错误 Cocos target 尽早失败。
- Cocos driver 新增 SpriteFrame 切片创建/销毁、图片 frame/color 切换、sibling order、Graphics line 与 blend 能力。切片基于 Cocos 3.8.6 `SpriteFrame.reset({ texture, rect, originalSize, offset, isRotate })` 合同；rotated/越界/缺元数据直接失败。
- Cocos player 使用稳定 `layer outer -> content -> display/text` 结构；effect/CardCarousel 保持 group sibling，避免 pressure `visualRotation` 污染效果节点。
- sequence 不重建节点；wave/CardCarousel 使用 runtime-owned SpriteFrame region cache；speed-lines 复用单个 line node；初始化中途失败会回收已创建的 region frame。
- `getRuntimeDiagnostics()` 增加 deterministic sprite/line、CardCarousel card/slice/visible 数量。
- `src/index.ts` 公开 Cocos factory/driver；standalone 改为由 `scripts/build-standalone.mjs` 从模块化源码确定性生成，禁止手改，生成物只依赖 `cc`。
- 更新 fake `cc`、3.8.6 shim、standalone checker/parity/player tests、README 和 `agents.md`。

## 5. 性能与生命周期证据

自动化测试在预热后连续 seek 300 帧，并以对象身份和稳定计数断言，不使用脆弱的墙钟阈值：

| 路径                 | 稳定上限/结果                                                                  |
| -------------------- | ------------------------------------------------------------------------------ |
| sequence             | 1 个 display node，300 帧只切共享 SpriteFrame                                  |
| CardCarousel fixture | 3 个 card、每卡 4 slices，共 12 个 slice node/frame view；300 帧 identity 不变 |
| wave_distort fixture | 4 个 slice node/frame view；300 帧 identity 不变                               |
| speed_lines fixture  | 1 个 Graphics/line node、每帧 6 条 line sample；300 帧 node identity 不变      |

`destroy()` 后 CardCarousel/wave 的 runtime-owned region frame 均标记销毁；共享 source SpriteFrame 明确保持未销毁。seek/restart/loop 复用已有 pool/cache，不按帧重建节点或 frame view。

## 6. Standalone 与 ZIP

模块化/standalone 的 project validation、sequence、basic、multi_move、Cocos fake tree、SpriteFrame 切换及关键错误信息有 parity 覆盖。checker 确认生成文件仅导入 `cc`，不含 workspace、Pixi、DOM、Node 或相对依赖。

ZIP 于 2026-07-22 05:16 UTC 最终复核：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
```

```text
standalone.zip SHA-256: be93b49258bc6dbbe0789bb7fb64b4e3ec1b61ce1b0193888b813c1f590eafb6
standalone/anieditorv5runtime-cc.ts SHA-256: 1325d0778c657edd17c32c6fa2ae0cffe2448659a3d65d4804fd9d82ed14fd95
```

`standalone.zip` 受根级 `*.zip` ignore 规则管理，是本地交付物，不会出现在普通 `git status` 中。

## 7. 自动化验收

环境统一使用 `nvm use 24` 提供的 Node.js `v24.14.0` 与仓库 pnpm，没有强制修改版本。无新增第三方依赖，`pnpm-lock.yaml` 无变化；依赖下载代理未使用。

包级全部通过：

- `standalone:build`
- `standalone:check`
- `typecheck:standalone`
- `typecheck`
- `lint`
- `test`
- `build`
- `format:check`

测试结果：17 个 test file、195 个 test 全部通过；总 statements coverage `60.25%`，Cocos 源码 statements coverage `88.43%`。

根级结果：

- `pnpm typecheck`：27/27 package 通过。
- `pnpm lint`：27/27 package 通过。
- `pnpm build`：27/27 package 通过。
- `pnpm format:check`：27/27 package 通过。
- 首次并行 `pnpm test`：本任务 package 通过，但 `game002` 一项 suite 在另一个并行任务尚未产出 `packages/gameframeworks/dist/index.js` 时导入失败；先构建 `@slotclientengine/gameframeworks` 后单独复跑 `game002`，18/18 file、95/95 test 全部通过。该失败属于现有根级并行产物竞态，与本任务包无依赖关系，未修改无关测试或生产代码掩盖它。
- `git diff --check`：通过。
- `cmp -s AGENTS.md agents.md`：通过；当前 macOS 工作区两个大小写路径对应同一内容。

## 8. 长期规则与剩余风险

`agents.md` 已补充 VNI 0.095 能力、standalone 同源生成、SpriteFrame region ownership/销毁、rotated/缺元数据失败，以及禁止引入 manifest/Pixi/DOM/loader/precompose fallback 的规则。

剩余风险只有真实引擎视觉和 profiler 数据未采集：本次未在 Creator 场景中逐帧截图对比 blend、切片缝隙和 depth，也未记录 Creator CPU/内存/draw-call。此项按用户明确指令取消，不影响本次修订后的自动化交付范围；若以后需要真实美术验收，应使用相同 Cocos-compatible project/atlas 在 Creator 3.8.6 独立任务中完成，不应在 runtime 增加兜底。
