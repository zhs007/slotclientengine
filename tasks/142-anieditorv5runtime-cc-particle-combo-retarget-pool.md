# 142 anieditorv5runtime-cc-particle-combo-retarget-pool 任务计划

## 1. 目标与完成定义

### 目标

把任务 139 已在 `packages/vnicore` 落地的 `particle_combo` 动态目标、时长计算和实例池能力，
以独立 Cocos Creator 3.8.6 实现同步到 `packages/anieditorv5runtime-cc`：

- 宿主以 `layerId + animationId` 选择已启用的 `particle_combo`；
- 默认保持 authored 名义速度，根据新目标距离计算播放时长；
- 宿主可显式指定 fixed duration，并取得变化后的 effective speed；
- 从已初始化 Cocos template player 借出独立 clone，播放完成或取消后恢复 authored 参数并归还；
- modular package、生成的 standalone runtime、示例和本地 `standalone.zip` 保持一致。

### 完成定义

- [ ] core public API 与任务 139 的坐标、公式、descriptor、strict failure 和输入不变合同一致。
- [ ] preserve mode 满足
      `authoredSpeed = hypot(authoredTargetX, authoredTargetY) / authoredDuration` 和
      `effectiveDuration = hypot(newTargetX, newTargetY) / authoredSpeed`。
- [ ] fixed-duration 精确采用正有限宿主时长，并返回 effective speed 和 time range。
- [ ] 每个初始化 template 有唯一 pool；并发 clone 不共享 project、transport、particle、listener 或
      Cocos node tree。
- [ ] clone 复用 template 的 host root、driver、asset source 和 source SpriteFrame，不加载 URL、
      不复制或销毁宿主资源。
- [ ] `playOnce()` 在宿主持续调用 clone `update(deltaTime)` 时完成并自动归还；提前 release、失败、
      template/manager destroy 和迟到 completion 安全。
- [ ] 归还前恢复 authored target/duration/stage、重算 particle drain cache、清除 lease state 并从
      host root detach；后续借出无残留。
- [ ] 不使用新 API 的现有 Cocos player、manual playback、standalone consumer 和动画行为不变。
- [ ] standalone checker、类型、行为 parity 和包含 Effect 的 `standalone.zip` 已同步。
- [ ] 使用任务 139 的真实 Cocos-compatible ZIP 完成 Creator 验收步骤；执行报告不得用 fake
      `cc` 测试冒充真实视觉结果。

## 2. 范围

### 包含

- `packages/anieditorv5runtime-cc/src/core`：
  - 独立的 `particle_combo` target variant 类型、纯函数、枚举 query 和 strict validation；
  - duration-dependent particle runtime reconfigure。
- `packages/anieditorv5runtime-cc/src/cocos`：
  - template snapshot/clone/reset/detach 所需的受控 player 生命周期；
  - per-template pool、generation lease、stats 和显式 manager；
  - Cocos 同步 acquire 与宿主显式 update 合同。
- modular/standalone public exports、checker、parity/player tests、README 和 standalone 示例。
- 本地 ignored `packages/anieditorv5runtime-cc/standalone.zip` 正式交付物。
- `docs/agent-rules/cocos-runtime.md` 的最小稳定职责补充。

### 不包含

- 不修改 `packages/vnicore`、任务 139 的 Viewer Tab 或 `apps/anieditorv5viewer`。
- 不新增 Cocos viewer app、Creator project、scene、prefab、atlas、`.meta` 或 Library/Build 缓存。
- 不修改 VNI schema、editor、exporter、bundle manifest、版本号或正式 fixture。
- 不把动态目标写回 ZIP/JSON/template project，不支持其它动画 runtime 参数 patch。
- 不让 Cocos runtime 依赖 vnicore、Pixi、DOM、URL loader、timer、Tween 或隐藏 renderer。
- 不保证 curve、spawn、stagger/easing 下实际粒子弧长速度恒定；本任务仍只保持名义速度。
- 不继承 template 的 `onTimeChange`/`onPlayingChange` callback 给 clone，不引入隐藏自动时钟。
- 不把下载样本复制进仓库，也不修改 lockfile 或新增依赖。

## 3. 制定计划时的基线

```text
UTC: 2026-07-31T01:01:29Z
HEAD: bec0911c18d055a1c1a43f721c66f0d431a10dec
branch: detached HEAD
git status --short --untracked-files=all: clean
task 139 implementation commit: c06f7a8
```

执行时保留用户后续产生的无关修改，不 reset、checkout、stash 或顺手格式化。

实际读取：`AGENTS.md`、`docs/agent-rules/{vni-runtime,cocos-runtime}.md`、计划模板、任务 139
计划/报告和任务 126 Cocos 同步计划。

`packages/anieditorv5runtime-cc` 下没有更深层 `AGENTS.md`。

当前实现结论：

- 任务 139 已新增 `vnicore/src/core/particle-combo-variant.ts` 和 Pixi player pool，但明确没有修改
  `packages/anieditorv5runtime-cc`。
- Cocos core 已支持 `particle_combo` 采样和 validation，但没有 target variant query/builder。
- `V5GParticleRuntime.maxDrainDuration` 当前 readonly 且只在 constructor 计算；复用 clone 改 duration
  后无法刷新 drain cache。
- `V5GCocosPlayer` 同步 `init()`，把自有 stage node 挂到 host-owned `root`；asset source 只同步返回
  host-owned SpriteFrame，runtime 不负责加载。
- player 有 `onPlaybackComplete()` 和显式 `update(deltaTime)`，但没有 project snapshot、pool clone、
  reset-for-reuse、destroy observer 或 pool。
- Cocos driver 可以被多个 player 共享；默认 driver 内的 Node capture queue 必须继续保持单 driver
  串行语义。
- standalone 源码由 `scripts/build-standalone.mjs` 生成；checker 当前还不知道 variant/pool exports。
- `standalone.zip` 受根 `*.zip` ignore，制定计划时不存在；普通 `git status` 不能证明交付状态。

真实样本：

```text
path: /Users/zerro/Downloads/bamboonanza_lizi.zip
SHA-256: bbbaf520f08306bcbafe11ea54e8d345f3f5a23ea6a29676455a362876246172
bundle/schema/project: VNI_0.042 / runtime_100/bamboonanza_lizi.json
engineTarget/mask: cocos_creator 3.8.6 / null
stage: 2000 x 2000, duration 2s
animation: layer_image_mr0hscjx_a / anim_module_mr0ht7ml_b / particle_combo / start 0
authored: target (600, 0), duration 1.5s, nominal speed 400 VNI units/s
```

执行前复核 hash、manifest 和 runtime JSON；不一致时 synthetic 自动化可继续，真实 Creator 验收标为
阻塞，不猜测或替换样本。

## 4. 需求解释与技术决策

### 需求解释

- “同步任务 139”指同步 runtime capability 和生命周期语义，不复制 Pixi renderer、loaded texture
  handle、Viewer UI 或自动 ticker。
- target 是 layer-local VNI offset；Cocos particle renderer 内部已有 Y 坐标转换，public API 不预先
  翻转 Y。
- timing 每次从 template authored snapshot 计算，不从上一个 lease 的 modified project 继续计算。
- preserve mode 下 authored/effective distance 都必须大于 0；零距离只能使用 fixed-duration。
- fixed-duration 接受正有限秒数；effective target 可以是 `(0, 0)`，此时 effective speed 为 0。
- 新 animation end 超过 stage 时只扩展 variant stage；归还恢复 authored stage，不裁改 template。
- Cocos 没有内部时钟：`playOnce()` 只启动 non-loop range；宿主必须逐帧调用
  `lease.player.update(deltaTime)`，Promise 才会在 range 和 particle drain 完成后结算。

### 关键决策

1. **core 语义等价、源码独立**
   - 在 Cocos package 内实现同名
     `listVNIParticleComboTargetAnimations()` /
     `createVNIParticleComboTargetVariant()` 和 `VNIParticleCombo*` 类型。
   - 用 golden tests 锁定与任务 139 相同输入输出；不得运行时 import vnicore。
2. **Cocos acquire 保持同步**
   - `V5GCocosPlayer.init()` 和 asset resolver 都是同步合同，因此 pool `acquire()` 同步返回 lease。
   - 不为了表面 API 一致制造无意义 Promise，也不把 async Node capture 引入 particle pool。
3. **显式 manager，但不创建 manager ticker**
   - 新增 `V5GCocosPlayerPoolManager<TNode, TSpriteFrame>`；按 template identity 唯一分池。
   - manager/pool 不自动 schedule/update；宿主继续遵守 Cocos Component `update(deltaTime)` 边界。
   - 并发 lease 由宿主分别 update；同一 player 不得同时由两个时钟推进。
4. **clone 共享宿主资源，不共享 mutable runtime**
   - template 只在 initialized 且 stage 已挂 root 时可建 pool。
   - clone 使用 fresh variant project 和独立 nodes/transport/particles/listeners，复用同一 root、driver、
     asset source 和 screen material 已封装的 driver。
   - clone 不继承 template callbacks；resolver 可做同步 lookup，但 runtime 不 load/decode/clone/destroy
     source SpriteFrame。
5. **lease 是唯一归还凭证**
   - lease 返回 `{ player, timing, playOnce, release }`；`playOnce()` 只允许调用一次。
   - generation token 防止旧 completion/release 操作已重新借出的 entry。
   - release 幂等；提前 release 拒绝 pending Promise，manager/template destroy 使 lease 失效。
6. **复用前完整恢复**
   - release 先取消 manual/legacy transport、清 listener/event、particle/effect/mounted/text binding 等
     lease state，再恢复 authored project 字段并 reconfigure particle runtime。
   - render authored time 0 后从 root detach；再次 acquire 完成 apply/reset/attach 后才 publish。
   - idle 上限有限；超额 clone destroy，释放 runtime-owned nodes、region frames/captures，不动宿主资源。
7. **standalone 是同等 public surface**
   - 只修改 modular source，生成 standalone；禁止手改生成文件。
   - checker 固定要求 core variant、Cocos pool/manager/lease exports，parity tests 验证行为而非只搜字符串。
   - standalone 示例增加 opt-in target preview 和明确的 lease update/destroy 顺序。

## 5. 职责与合同

- **core variant builder**：校验输入、fresh clone、精确定位 animation、计算 timing、扩展 stage、复验
  project；不读取 Cocos Node/SpriteFrame。
- **template player**：提供 authored snapshot 和受控 clone/reset/detach 内部边界；不被 variant 修改。
- **pool**：拥有 clone entries、idle/active registry、generation、authored reset 和 stats；不拥有 template。
- **manager**：拥有多个 pool 和唯一登记关系；destroy pool/manager 时销毁 clone，不销毁 template/root。
- **clone player**：拥有自己的 stage/node tree、runtime-owned SpriteFrame views、transport 和 particle state；
  source SpriteFrame、root、driver、asset resolver 属于宿主。
- **lease/host**：宿主负责逐帧 update；`playOnce()` 自动 release，手工 transport 必须 `finally release()`。
- **失败策略**：非法 ref/type/target/timing/template/manager、clone init、reset/attach 和资源解析失败均显式
  抛错；失败 entry 不进入 active/idle，已创建 runtime 资源 rollback。
- **禁止行为**：修改 template、共享 mutable node/runtime、重复加载、隐式 singleton/ticker、路径猜测、
  placeholder、首项默认、静默 fallback 或吞掉 destroy/release 错误。

## 6. 文件范围

### 预计新增

```text
packages/anieditorv5runtime-cc/src/core/particle-combo-variant.ts
packages/anieditorv5runtime-cc/src/cocos/player-pool.ts
packages/anieditorv5runtime-cc/tests/core/particle-combo-variant.test.ts
packages/anieditorv5runtime-cc/tests/cocos/player-pool.test.ts
```

### 预计修改

```text
packages/anieditorv5runtime-cc/src/core/index.ts
packages/anieditorv5runtime-cc/src/core/particle-runtime.ts
packages/anieditorv5runtime-cc/src/cocos/player.ts
packages/anieditorv5runtime-cc/src/cocos/index.ts
packages/anieditorv5runtime-cc/tests/cocos/player.test.ts
packages/anieditorv5runtime-cc/tests/standalone/{standalone-import,standalone-parity,standalone-player}.test.ts
packages/anieditorv5runtime-cc/scripts/check-standalone.mjs
packages/anieditorv5runtime-cc/standalone/{anieditorv5runtime-cc.ts,V5GPreview.example.ts}
packages/anieditorv5runtime-cc/README.md
docs/agent-rules/cocos-runtime.md
```

生成的 `standalone/anieditorv5runtime-cc.ts` 只能由 `standalone:build` 更新。测试可按现有组织小幅合并，
报告记录偏差。

### 正式本地生成物

```text
packages/anieditorv5runtime-cc/standalone.zip
```

ZIP 只含 standalone runtime、示例和 `effects/vni-screen-alpha.effect`，虽被 Git ignore 仍必须重建、
列目录并记录 SHA-256。

### 原则上不应修改

```text
packages/vnicore
apps/anieditorv5viewer
docs/anieditor5
packages/anieditorv5runtime-cc/src/core/types.ts
packages/anieditorv5runtime-cc/src/core/validation.ts
packages/anieditorv5runtime-cc/types/cc-3.8.6-shim.d.ts
packages/anieditorv5runtime-cc/tests/fixtures
pnpm-lock.yaml
```

若必须改 schema/validation、asset resolver contract、Cocos shim 或其它 consumer，先停止说明范围扩张。

## 7. 实施步骤

1. **确认执行基线与样本**
   - 重核 HEAD、工作区、规则、任务 139 public contract、Cocos player/driver 和 ignored ZIP。
   - 复验下载 ZIP 的 hash、engine target、profile、animation ref 和 authored values。
2. **同步纯 variant 合同**
   - 新增 Cocos package 内独立 builder/query/types，按 authored baseline 计算并返回 immutable descriptor。
   - 覆盖 fresh project、stage expansion、输入不变和 strict failure；从 core index 导出。
3. **补充 Cocos player pool 生命周期**
   - 为 particle runtime 增加 reset + max drain reconfigure。
   - 为 player 增加 snapshot、clone、reset/detach/reattach 和 destroy observation 的最小 `@internal`
     边界；clone 复用 host resources、抑制 template callbacks。
   - reset 清理全部 lease 可变状态，但保留可复用 node tree 和 runtime-owned caches。
4. **实现 pool、lease 与 manager**
   - 同步 acquire 时 prepare variant，优先复用 idle；新 clone init 失败完整 rollback。
   - 实现唯一 manager、stats、idle cap、generation-safe completion/release、template/manager destroy。
   - attach/reset 全部成功后才加入 active；release reset/detach 成功后才加入 idle。
5. **同步 modular/standalone consumer surface**
   - 导出 public pool contract，更新 README 的坐标、公式、同步 acquire、显式 update 和 destroy 示例。
   - standalone example 增加 opt-in `particle_combo` target preview，不把样本 ID 写进 runtime。
   - 更新 checker 要求和 import/parity/player tests，再用生成器更新 standalone。
6. **补齐自动化测试**
   - core 覆盖 `(600,0)/1.5 → (300,0)/0.75`、`(900,0)/2.25`、fixed 1s、零距离和非法输入。
   - fake Cocos 覆盖同 root/driver/assets、独立 node/state、复用/reset、source frame ownership、回滚、
     stale completion、idle cap、manual state cleanup 和任意 destroy 顺序。
   - standalone 与 modular 对相同 project/delta 产生相同 timing、stats、completion、错误和 cleanup。
7. **生成交付物、定向验收与报告**
   - 按第 8/10 节顺序 build standalone、运行 L2 验收并重建 ZIP。
   - 报告记录 ZIP 内容/hash，区分自动化与真实 Creator 结果；不 commit、push 或创建 PR。

## 8. 测试与验收

### 测试原则

- core math 使用 synthetic project，不让 CI 依赖 Downloads 绝对路径。
- pool 测试观察 node/SpriteFrame identity、resolver ownership、root attach/detach、stats 和 destroy。
- fake `cc` 只能证明合同和资源计数；真实曲线、坐标、粒子视觉必须在 Creator 3.8.6 验收。
- 不为 parity 放宽 Cocos-compatible validation；unsupported profile/type 必须在 acquire 前失败。
- 任务不改变的 manual/card-carousel/mask/blend 行为以现有测试保护，不扩大到整仓。

### 验收级别

`L2`。本任务新增 package public API、改变 player resource/lifecycle 边界，并更新 standalone 与本地正式
ZIP；不涉及 workspace 工具链、lockfile、schema 或 release，因此不升级 L3。

### 执行会话必须运行

```bash
pnpm --dir packages/anieditorv5runtime-cc standalone:build
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc typecheck
pnpm --dir packages/anieditorv5runtime-cc build
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
git diff --check
```

共 7 条：package test/typecheck/build 分别保护行为、测试源码类型和 declaration；standalone 的生成、
边界 checker、ES2015 类型是三个独立正式交付面；最后检查 diff。失败先最小化到 core、pool、
standalone parity 或生成物，不运行根级全仓门禁。

### 用户负责的 Creator 验收

在 Cocos Creator 3.8.6 项目导入最终 standalone runtime/example/Effect，并使用
`bamboonanza_lizi.zip` 的 runtime JSON 与对应 SpriteFrame/atlas：

1. template 保持 authored `(600,0)/1.5s`，借出 `(300,0)` preserve variant，逐帧 update clone，
   确认 duration `0.75s`、终点和方向正确、完成后自动归还。
2. 借出 `(900,0)` preserve variant，确认 duration `2.25s`、variant stage 扩展到 `2.25s`；
   再借出时 template/idle clone 已恢复 authored stage `2s` 和 animation `1.5s`。
3. fixed duration `1s` + `(900,0)`，确认 effective speed `900 units/s` 且实际播放约 `1s`。
4. 连续及并发预览不同目标，确认 node tree/particle state 独立、idle reuse 增长且无上次参数残留。
5. 播放中 release、销毁 template/manager、销毁 Creator Component，确认 clone node、runtime-owned
   view 和 listener 清理，source SpriteFrame、host root/atlas/material 不被销毁。

### 独立验收建议

`必须`。涉及 public contract、resource ownership、destroy 和 standalone 正式生成物；独立会话复验：

```bash
pnpm --dir packages/anieditorv5runtime-cc test
pnpm --dir packages/anieditorv5runtime-cc standalone:check
pnpm --dir packages/anieditorv5runtime-cc typecheck:standalone
```

真实 Creator 视觉仍由用户完成，不能被上述自动化替代。

## 9. 环境与依赖

- 使用仓库要求的 Node 24；shell 没有 Node 时先 `source /Users/zerro/.nvm/nvm.sh`，再 `nvm use 24`。
- 使用该环境的 pnpm，不切换 npm/yarn，不强制改版本。
- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`。
- 只有下载实际失败后才设置 `http_proxy` / `https_proxy` 为 `http://127.0.0.1:1087` 并重试。
- 本任务不新增依赖或修改 lockfile；如实现需要，先停止并说明 Cocos/现有工具为何不足。

## 10. 生成物、文档与规则

- 先修改 modular source，再运行 `standalone:build`；禁止手改 generated standalone。
- `standalone:check` 必须验证只依赖 `"cc"`、无 vnicore/Pixi/DOM/Node/相对 import，并包含新 public API。
- 全部自动化通过后重建 `standalone.zip`，只包含：

  ```text
  standalone/anieditorv5runtime-cc.ts
  standalone/V5GPreview.example.ts
  standalone/effects/vni-screen-alpha.effect
  ```

- 用 `test -f`、`zipinfo -1` 和 `shasum -a 256` 验证 ZIP；不能用普通 Git status 代替。
- README 同步 modular/standalone 用法、宿主 update、ownership、strict failure 和 timing 限制。
- `docs/agent-rules/cocos-runtime.md` 只补充稳定的 target variant、pool、显式时钟和归还边界；不写
  样本 ID、精确时长或执行证据。

## 11. 执行报告

规划时不生成报告。执行完成后创建
`tasks/142-anieditorv5runtime-cc-particle-combo-retarget-pool-<utctime>.md`，简要记录最终实现/文件、
计划偏差、实际命令结果、standalone ZIP 内容/hash、Creator 验收状态和剩余风险；不收集无关
coverage、完整历史或整仓统计。

## 12. 风险、假设与待确认

### 风险

- Cocos clone 共用 root/driver/asset source；attach/detach 或 destroy 顺序错误会破坏 host tree 或
  source SpriteFrame ownership。
- 宿主忘记 update clone 时 `playOnce()` 不会完成；README/example 必须把显式时钟写成合同。
- idle clone 若未清 listener、manual session、mounted/text binding、particle drain 或 dynamic view，
  会跨 lease 污染。
- fake `cc` 无法证明 Creator 的粒子终点、帧时序、Effect/material 与 atlas 生命周期。
- ignored ZIP 容易漏重建或残留旧文件，必须显式删除旧目标、重建并核对目录/hash。

### 假设

- 任务 139 的 formula、descriptor、pool/lease lifecycle 是任务 142 的语义来源；Cocos 差异仅落在
  renderer、同步初始化、资源 owner 和 update 驱动方式。
- 下载样本 hash 与上述基线一致，且用户可在真实 Creator project 中绑定其 JSON 和图片资源。
- pool clone 与 template 挂同一 host root 符合现有 player options；需要其它 root 属于后续显式 API。

### 待确认

无。

## 13. 完成清单

- [ ] 任务 139 runtime capability 已以 Cocos 独立实现同步，目标和非目标均满足。
- [ ] core public API、Cocos pool/lease、显式 update 和 strict failure 符合计划。
- [ ] template/root/driver/source SpriteFrame ownership 未被 clone/pool 接管。
- [ ] reset、rollback、generation、idle cap 和任意 destroy 顺序有直接测试。
- [ ] modular、generated standalone、checker、tests、README/example 和规则已同步。
- [ ] `standalone.zip` 已重建，仅含三个预期文件并记录 SHA-256。
- [ ] 指定 L2 自动化通过，真实 Creator 验收与 fake 自动化明确区分。
- [ ] UTC 中文执行报告已生成。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、`docs/agent-rules/cocos-runtime.md` 和本计划；
2. 核对 Git/ignored ZIP/真实样本基线和任务 139 当前 public contract；
3. 按计划实现，不重新制定另一套方案；
4. 小幅适配当前源码组织时在报告记录；
5. public API、schema、asset ownership、lockfile 或文件范围明显扩大时先停止说明；
6. 只运行计划规定的 L2 验收，失败先最小化；
7. 重建并核对 standalone ZIP，生成 UTC 报告；
8. 除非用户明确要求，不 commit、不 push、不创建 PR。
