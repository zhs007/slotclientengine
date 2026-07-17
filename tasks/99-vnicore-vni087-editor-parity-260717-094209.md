# 99 vnicore VNI 0.087 editor parity 任务报告

## 1. 结果摘要

本任务已把当前工作区 `docs/anieditor5/src` 的 VNI 0.087 Pixi 预览合同同步到 `packages/vnicore` 和上传式 `apps/anieditorv5viewer`：

- 严格解析、校验并采样 `basicAnimation` 六条基础属性轨道。
- 实现 `bounce_jump` 完整数学语义与无逐帧数组分配的缓存。
- 实现 VNI 0.087 rotate 加速/匀速/减速积分、方向/圈数和 pressure 外层压缩/内层旋转。
- 保留旧 `fromRotation/toRotation` rotate；新旧合同部分缺参或混用会显式失败。
- Pixi layer 改为稳定 outer root / content root / sprite-or-text 结构；sequence 换帧、文字替换和每帧采样不重建结构。
- viewer 可上传 synthetic VNI 0.087 zip，并在 summary 展示 animation type、启用 basic track 数和 point 数。
- vnicore、viewer 的包级验收全部通过；rendercore 和根级 test 只存在两条与本任务无关的 game002 reel manifest 旧期望失败，详见第 7 节。

浏览器人工验收按用户要求未由 Codex 执行，保留给用户最终完成。

## 2. 开始时的基线复核

任务开始时 `git status --short --untracked-files=all` 只有用户已有的编辑器修改与未跟踪任务计划：

```text
M docs/anieditor5/src/animation_presets.ts
M docs/anieditor5/src/constants.ts
M docs/anieditor5/src/coordinates.test.ts
M docs/anieditor5/src/main.ts
M docs/anieditor5/src/pixi_stage.ts
M docs/anieditor5/src/project_state.ts
M docs/anieditor5/src/types.ts
?? tasks/99-vnicore-vni087-editor-parity.md
```

编辑器 diff 为 7 个文件、1740 insertions / 146 deletions；`VNI_VERSION` 从 `VNI_0.074` 升到 `VNI_0.087`。`docs/anieditor5/export` 没有 Git diff，因此没有可声称为真实 VNI 0.087 导出的新 fixture。本任务没有修改、回滚或格式化上述用户编辑器文件。

`apps/anieditorv5viewer` 仍是上传 zip shell，没有恢复内置 asset registry。`packages/vnicore` 和 viewer 开始时没有重叠的未提交用户修改。

环境实际使用 Codex 工作区 Node `v24.14.0` 和 pnpm `11.9.0`。系统 PATH 最初没有 `node`；后续命令显式加入：

```text
/Users/zerro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin
/Users/zerro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback
```

## 3. 编辑器到 runtime 对照矩阵

| 编辑器合同 | 开始时 vnicore | 落点 | 验证 |
| --- | --- | --- | --- |
| `basicAnimation` 六轨 | 缺失 | core types / validation / `basic-animation.ts` / project sampler | strict invalid cases、端点、右点 easing、backOut、basic-before-preset |
| `bounce_jump` | 缺失 | animation sampler / validation | 蓄力、起跳、末帧、height=0、cache invalidation golden |
| VNI 0.087 rotate | 仅旧 from/to | animation sampler / validation | accel/linear/decel、ease span normalize、方向、pressure threshold、新旧/混用错误 |
| `visualRotation` | 缺失 | sampled layer / Pixi content root | outer scale、inner rotation、seek/restart 清零、结构复用 |
| viewer VNI 0.087 | 未覆盖 | summary / synthetic upload zip | schema、bounce type、basic track/point summary |

## 4. 实现细节

### 4.1 basic tracks

- 新增 public VNI/V5G 类型 alias，并从 core barrel 导出。
- `basicAnimation` 存在时必须完整包含 opacity、positionX/Y、scaleX/Y、rotation 六轨。
- point 严格要求非空 id、finite number time/value、受支持 easing；不接受数字 string。
- time 必须在 `0..stage.duration`，每轨最多 200 点，输入必须按 time 非递减排序。
- value 范围与编辑器 normalization 一致。
- 采样不排序、不 clone 轨道，使用无分配二分查找；段 easing 属于右点，首末端点持续，最终保留四位小数。
- basic sample 先成为 preset animation stack 的 base。
- 非空 legacy `keyframes` 继续失败，runtime 不做迁移。

### 4.2 bounce_jump

- 数学顺序、clamp、蓄力 wave、flight stretch、apex、landing、decay 与编辑器 `sampleBounceJump()` 对齐。
- `height/bounceCount/bounceDecay` 组成 WeakMap cache 的热更识别键。
- lobe heights 和 total weight 仅在 cache miss 时分配/计算，不在每帧创建 `Array.from/reduce/findIndex` 临时结构。
- `height=0` 时显式保持编辑器 `findIndex` 的首项 decay 语义。
- 8 个参数全部必需并做范围/整数校验。

### 4.3 rotate 与 visualRotation

- legacy 路径严格要求 `fromRotation/toRotation`。
- 当前路径严格要求 `turns/direction/accelRatio/decelRatio/pressure/pressureStretch`。
- `direction` 只接受 `1|-1`，新旧字段不能混合。
- `easeSpinProgress()` 的面积归一化、加速二次积分、匀速面积和减速积分与编辑器一致；ease 总和超过 0.95 时按比例归一化。
- pressure `<= 0.001` 时旋转累加到 outer transform；大于阈值时 outer 只应用 scale，旋转累加到 `visualRotation`。
- 多个 pressure rotate 按稳定 animation stack 顺序累加。

### 4.4 Pixi 结构和清理

每个 layer 初始化一次：

```text
outer layer root
└── content root
    └── sprite | sequence sprite | original/replacement text/image
```

- outer root 拥有 position、sampled scale/rotation、alpha、visibility、blend mode 和 native mask。
- content root 拥有资源 logical/file scale compensation 和 `visualRotation`。
- sequence 只切同一个 sprite 的 texture。
- text replacement 挂到 content root，继承 pressure visual rotation。
- effect/particle/group-slot 继续是 layer root 的 sibling，不错误继承 content-only rotation。
- native mask 和 precompose key 继续只使用 sampled transform，不加入 `visualRotation`，与当前编辑器边界一致。
- 每次 sampled state 都显式写 content rotation，包括归零；seek、restart、超出 animation 区间都不会遗留 pressure rotation。
- player 既有 range、segmented、loop、particle pool、mask cache 和 destroy 测试继续通过。

## 5. viewer、文档和长期约束

- viewer summary 新增 `N basic tracks, M points`，只展示数据，不实现采样。
- 新增内存构造的 synthetic VNI 0.087 single-project zip 测试，没有提交来源不明的二进制 fixture。
- 更新 vnicore README、API 中英文使用文档、迁移文档、viewer README。
- `examples/validate-project.ts` 新增只调用 public validation/project sampler 的 VNI 0.087 示例函数，没有复制算法。
- 更新根 `agents.md`：vnicore 长期拥有 VNI 0.087 basic tracks、bounce、新/legacy rotate、pressure visualRotation；viewer/game runtime 不复制轨道、反弹、旋转或私有 Pixi tree；不增加 Cocos-compatible `legacy_alpha`。
- 没有修改 `packages/anieditorv5runtime-cc`。

## 6. 自动一致性与性能证据

最终 vnicore 测试为 15 files / 206 tests 全通过，包含：

- basic 首点前、段中、末点后、right-point easing、backOut overshoot、basic+move 叠加。
- bounce 蓄力中点、起跳边界、末帧、结束后、height=0、参数热更 cache invalidation。
- rotate legacy/current、accel/linear/decel golden、正负 turns/direction、ease span > 0.95、pressure threshold、多个 pressure rotate 累加。
- strict basic/bounce/rotate parse 和 validation 错误。
- Pixi outer/content/sprite 结构、pressure inner rotation、inactive/seek/restart 清零和对象 identity 复用。
- viewer synthetic VNI 0.087 zip、schema/bounce/basic summary。

覆盖率：

```text
vnicore: statements 91.55%, branches 82.86%, functions 98.62%, lines 92.60%
viewer:  statements 93.64%, branches 77.94%, functions 96.36%, lines 94.44%
```

性能合同证据：basic sampler 不排序点、不 clone 轨道；bounce cache 只在关键参数变化时重建；root/content/sprite 初始化后复用；sequence 只换 texture；既有 effect/particle pool 与 precompose texture cache 回归测试继续通过。

## 7. 实际命令和结果

### 环境与首次依赖状态

- `node --version`：系统 PATH 中命令不存在；加载工作区 runtime 后为 `v24.14.0`。
- `pnpm --version`：`11.9.0`。
- 首次不带 `CI=true` 的 vnicore typecheck 在 pnpm 依赖状态检查阶段以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止；随后所有 pnpm 验收按计划使用 `CI=true`，未下载新依赖。
- 没有使用代理；没有执行 `pnpm install`；`pnpm-lock.yaml` 无变化。

### vnicore

以下命令全部通过：

```text
CI=true pnpm --filter @slotclientengine/vnicore typecheck
CI=true pnpm --filter @slotclientengine/vnicore lint
CI=true pnpm --filter @slotclientengine/vnicore test
CI=true pnpm --filter @slotclientengine/vnicore build
CI=true pnpm --filter @slotclientengine/vnicore examples:typecheck
CI=true pnpm --filter @slotclientengine/vnicore format:check
```

最终 test：15 files / 206 tests passed。

### anieditorv5viewer

以下命令全部通过：

```text
CI=true pnpm --filter anieditorv5viewer typecheck
CI=true pnpm --filter anieditorv5viewer lint
CI=true pnpm --filter anieditorv5viewer test
CI=true pnpm --filter anieditorv5viewer build
CI=true pnpm --filter anieditorv5viewer format:check
```

test：2 files / 26 tests passed；Vite production build 通过。

### rendercore 真实消费者

```text
CI=true pnpm --filter @slotclientengine/rendercore typecheck  PASS
CI=true pnpm --filter @slotclientengine/rendercore build      PASS
CI=true pnpm --filter @slotclientengine/rendercore test       FAIL (2 unrelated assertions)
```

失败只在：

```text
tests/reel/grid-cell-effect.test.ts
  expected anticipation pool 3, actual 7

tests/reel/manifest.test.ts
  expected firstFollowingStopDelayMs 2000.0001, actual 800
  expected stopStepMs 240, actual 100
```

这些测试读取当前受版本控制的 `assets/game002-s3/reel.manifest.json`。任务开始前该 manifest 已是 `800/100`，根 `agents.md` 也明确当前期待时序为 800ms / 100ms；本任务未修改 manifest、rendercore reel 逻辑或上述测试，因此没有回退生产合同或顺手修改无关测试。rendercore 其余 43 files / 288 tests 通过。

### 根级

```text
CI=true pnpm typecheck     PASS (23/23 packages)
CI=true pnpm lint          PASS (23/23 packages)
CI=true pnpm build         PASS (23/23 packages)
CI=true pnpm test          FAIL only at the same 2 rendercore assertions
CI=true pnpm format:check  FAIL on pre-existing unrelated formatting debt
git diff --check           PASS
```

根 format 首批明确报告：`apps/reelsviewer` 16 个文件、`apps/gengameconfig` 7 个文件，以及 `victoryani-demo`、`spine2pixiani-demo` 等已有文件不符合 Prettier；Turbo 随首个 package failure 中止其它包。本任务相关 vnicore/viewer 的独立 format:check 均通过，未格式化这些无关文件。

## 8. 主要文件

- `packages/vnicore/src/core/basic-animation.ts`
- `packages/vnicore/src/core/types.ts`
- `packages/vnicore/src/core/validation.ts`
- `packages/vnicore/src/core/animation-sampler.ts`
- `packages/vnicore/src/core/project-sampler.ts`
- `packages/vnicore/src/pixi/layer-instance.ts`
- `packages/vnicore/src/pixi/vni-player.ts`
- `apps/anieditorv5viewer/src/ui/controls.ts`
- vnicore/viewer 对应 tests、README/docs/example
- `agents.md`

## 9. 未完成项和剩余风险

1. 没有真实 VNI 0.087 export/resource closure；当前集成证据是编辑器源码 golden + synthetic contract zip + Pixi scene graph 断言。真实编辑器导出出现后仍应补一份字节一致的 integration fixture。
2. 浏览器人工视觉验收按用户要求尚未执行。需要重点观察 pressure 外轮廓保持竖直、内容旋转、bounce 首/中/末帧、seek/restart/loop 无污染和 summary 数值。
3. 根级绿色被两条无关 rendercore 旧期望和已有多包 Prettier 债阻断；本任务相关包级验收均为绿色。
4. 未进行自动编辑器截图对比，因为当前 `docs/anieditor5` 没有独立可运行 package/script，且没有真实 VNI 0.087 导出；报告未声称执行不存在的编辑器自动测试。
