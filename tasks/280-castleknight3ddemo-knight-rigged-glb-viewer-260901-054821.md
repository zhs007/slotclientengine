# 280 castleknight3ddemo-knight-rigged-glb-viewer 执行报告

## 结果

已为城堡骑士建立一套 20-bone humanoid armature，以刚性单权重绑定原模型的 33 个硬表面部件，并导出
`idle`、`attack`、`victory`、`walk` 四段骨骼动画。生产 GLB 的三张纹理已转换为带完整 mipmap 的
2048×2048 UASTC KTX2；最终文件为 `7,849,116` bytes，比原始 `29,473,708` bytes 减少 `73.37%`。

`castleknight3ddemo` 新增独立 `/viewer.html`：默认查看该骑士，也可打开或拖放其他自包含 GLB；支持 orbit/zoom、
动画切换、播放/暂停、重播、时间轴、调速、循环模式和骨架显示。原 `/` 城堡棋盘未接入骑士且行为保持不变。

## 实现与文件

- `apps/castleknight3ddemo/public/models/castle-knight-rigged-ktx2.glb`
  - 1 个 skinned mesh、1 个 skin、20 个 joints、16,528 个上传顶点、24,702 个三角面。
  - `attack` 1.30 秒、`idle` 2.03 秒、`victory` 1.53 秒、`walk` 2.03 秒；每段 60 个 transform channels。
  - 3 张内嵌 `image/ktx2` UASTC 纹理，均为 2048×2048、12 级 mipmap；GLB required extension 为
    `KHR_texture_basisu`，无 PNG/WebP fallback 或外部 URI。
  - SHA-256：`aae3275d8df13310501047c34b8d88036aa86631e31747974d70818021368ee3`。
- `apps/castleknight3ddemo/viewer.html`
  - 独立查看器页面及可访问名称明确的控制面板。
- `apps/castleknight3ddemo/src/model-viewer.ts`
  - KTX2-aware GLTF loader、AnimationMixer、SkeletonHelper、统计、自动 framing 和所有播放控制。
  - 以 load generation 隔离 stale request；候选模型验证成功后才替换当前模型，失败保留当前模型并明确报错。
  - replace/destroy 时停止并 uncache mixer，释放 helper、geometry、material、texture、Object URL、controls、
    KTX2 loader、timer、renderer 与 observer。
- `apps/castleknight3ddemo/src/model-viewer.css`
  - 查看器桌面布局、控制状态、错误/拖放状态及窄屏单列样式。
- `apps/castleknight3ddemo/vite.config.ts`
  - 增加 `main` 与 `viewer` 两个 Vite build inputs。

Blender 源工程、检查/rig/validator 脚本、part-to-bone 映射、中间 GLB、KTX2 工具工作区和渲染证据均保存在：

```text
/Users/zerro/Downloads/task-280-castle-knight-rig/
```

原始下载文件未修改；外部 source copy SHA-256 为
`ce9af6bc27d3c89c91bb097addf8f300481b272ebb770607d9d8985c345ab56e`。

## 工具与资产门禁

- Blender `5.2.1 LTS`：建立 armature、rigid weights、动作并导出 intermediate GLB。
- glTF Transform CLI `4.5.0`：纹理缩至最高 2K，再以 UASTC、RDO lambda 0.75、Zstd 18 和 mipmap 重打包。
- KTX-Software `4.4.2`：逐张 `ktx validate` 通过。
- Node.js `v24.19.0`、Three.js `0.185.1`。

独立 validator 对仓库内最终 GLB 重新执行了以下门禁并通过：

- intermediate 重导入后恰有 1 个 armature、1 个 skinned mesh、20 bones、20 vertex groups；每个顶点恰有一个
  权重为 1.0 的有效 bone assignment。
- action 集严格等于 `attack / idle / victory / walk`，均为非零时长。
- `attack` 和 `victory` 左右脚的世界空间位移与旋转均严格为 0；`attack` 持剑手轨迹约 0.353m、旋转约
  2.298 radians，验证为一次明确挥砍；改良后的 `walk` 左右脚各有约 0.105m 前后交替运动。
- final 恰有 1 个 skin、20 joints、4 个同名 clips；KTX2 magic、尺寸、mipmap、extension 和最终大小全部符合合同。
- rest pose、三个非 walk clip 各 5 个关键姿势及 walk 的 9 个完整相位共 25 张 Blender 渲染均无左右错绑、
  悬空部件或异常拉伸。

## 自动验收

```text
Blender validate_knight_glb.py --intermediate ... --final <仓库 final GLB> --output-dir /private/tmp/task-280-independent-validation
PASS：结构、刚性权重、锁脚/挥砍/走路 motion 门禁、4 clips、3 KTX2、逐张 ktx validate、25 张姿势渲染

pnpm --filter castleknight3ddemo typecheck
PASS

pnpm --filter castleknight3ddemo lint
PASS

pnpm --filter castleknight3ddemo test
PASS：4 files，13 tests

pnpm --filter castleknight3ddemo build
PASS：同时产出 index.html、viewer.html、final GLB，以及 Vite 从 Three.js 打包的 hashed Basis JS/WASM

pnpm --filter castleknight3ddemo format:check
PASS

git diff --check
PASS
```

build 只有已有阈值语义下的 `GLTFLoader` chunk 超过 500 kB 警告，没有错误。

依赖环境说明：仓库现有 `pnpm-lock.yaml` 缺少一条 ESLint dependency resolution，规定的 frozen install 在安装前
失败。本次只执行 `pnpm --filter castleknight3ddemo install --no-frozen-lockfile --lockfile=false` 恢复目标 app
依赖；未读写 lockfile，Git 状态没有依赖或生成物变更。验收使用 Codex bundled Node 24 路径补入 shell `PATH`。

## 浏览器人工验收

已在真实本地浏览器以 `http://127.0.0.1:4178/viewer.html` 验收：

1. 默认 KTX2 骑士正确显示 base color、normal、metallic/roughness 材质；统计为 1 mesh、24,702 triangles、
   20 bones、1 skin、4 animations，默认循环播放 `idle`。
2. `attack`、`victory`、`walk` 切换、单次停止、播放/暂停、重播、时间轴 scrub、loop toggle 与 skeleton toggle
   均生效；浏览器逐帧可见攻击蓄力后只挥砍一次、攻击/胜利双脚固定，以及 walk 双腿交替迈步。
3. 打开原始静态 GLB 后显示 33 meshes、24,702 triangles、0 bones/skins/animations，动画控制禁用且不伪造 clip。
4. 打开损坏 `.glb` 时显式显示 parse error，原 KTX2 骑士及动画控制保持可用，没有 uncaught rejection。
5. 新开的默认 viewer 控制台只有 Vite 连接日志，无 Three/KTX2/WebGL 警告或错误；`/` 原城堡场景视觉与控制台正常。

查看器包含 `max-width: 760px` 的单列窄屏布局；本次 in-app browser 的 viewport override 未改变其固定
1280×720 viewport，因此窄屏视觉未能在该浏览器中独立截图复核。

## 关键决策与计划偏差

- 源模型由 33 个分离硬表面部件组成，适合明确 part mapping 后做刚性蒙皮；最终未使用 automatic weights 或
  不可审计的距离阈值，避免盔甲和武器在关节处被拉软。
- 计划原预计把 `basis_transcoder.js/.wasm` 复制到 `public/basis/`。Three.js `0.185.1` 的 `KTX2Loader`
  已通过静态 module URL 让 Vite 自动产出版本一致的 hashed Basis JS/WASM；额外 public copy 会重复下载产物且并非
  runtime 必需，因此未提交这两份重复文件。
- Three.js `Clock` 在当前版本会产生弃用 warning，查看器改用 `Timer`，默认控制台保持干净。
- 未新增 npm 依赖、测试 fixture、README、主场景入口或共享 package；未修改 `package.json`、`pnpm-lock.yaml`、
  workspace 配置、领域规则或现有测试。

## 用户反馈迭代

2026-09-01 首次交付后按用户反馈完成第二版动作：

- `attack` 删除 pelvis 和腿部 motion，双脚在整段 clip 中保持世界空间完全静止；动作重做为蓄力、一次快速挥砍、
  follow-through 和回收，不包含第二次挥砍。
- `victory` 删除 pelvis 上移和腿部 rotation，庆祝动作只由躯干、头、双臂、披风和头饰参与，双脚完全固定。
- 新增 2.03 秒原地循环 `walk`，包含交替 thigh swing、knee bend、foot compensation、双步 pelvis bob 和反向摆臂。
- viewer 的默认资产合同同步为严格四段 clip，并在真实浏览器复验 4 animations、KTX2 材质和控制台。

用户随后反馈首版 `walk` 观感怪异，第三版将基于正弦的大幅摆腿重做为 9 个显式 gait phases：contact、down、
passing、high point 及左右镜像。大腿最大摆幅从 24° 降至 12°，移除 pelvis 侧摆，脚部世界轨迹从约 0.145m
降至约 0.096m，并改用轻微上下起伏和克制的反向摆臂。Blender 九相位 contact sheet 与 Three.js 循环两侧步态均已复验。

用户进一步指出脚应向角色正前方而不是斜向。轴向诊断确认 splayed thigh 的 local X 每产生约 4.1cm 前后位移时会
混入约 2.4cm 横向位移；第四版先加入左右相反的 local Z 补偿，再在每个 gait key pose 数值求解 thigh Z，使左右
foot bone 的世界 X 回到各自固定轨道。最终左脚横向/前后范围为 0.080cm/10.480cm，右脚为
0.088cm/10.473cm，横向比例均小于 1%；validator 将 3% 设为显式失败门禁，并在 Three.js 两个半步中复验。

用户再次指出外八观感，并明确范围是 `walk` 起点。几何主轴检测显示原始左鞋、右鞋分别外偏约 29.5°、21.8°；
第五版不修改另外三个动作，而是在 walk 第 1 帧及其余 8 个 gait key poses 根据蒙皮后鞋面几何数值求解 foot Z，
将脚尖持续对准角色正前方。最终 GLB 密集采样最大朝向偏差为左脚 0.164°、右脚 0.075°，validator 以 2° 为失败
门禁；Blender 九相位渲染和真实 Three.js viewer 的 walk 起点均已复验。

用户继续指出脚尖已变但腿链未变。诊断证实第五版 walk 中膝盖相对髋部仍向外约 4.3–4.5cm，脚踝向外 6.5cm；
第六版在每个 gait key pose 联立数值求解 thigh Z 与 shin Z，使左右两侧的髋、膝、踝分别处于同一角色前后平面，
再独立求解鞋尖朝向。最终 GLB 密集采样的腿链最大横向偏差约 0.05mm、鞋尖最大朝向偏差约 0.081°，脚踝保持
约 10.385cm 的前后步幅；validator 增加 5mm 腿平面门禁，Blender 九相位和真实 Three.js viewer 起步/换步均通过。

用户随后指出 `victory` 抬剑时剑穿过面甲。第七版将持剑侧肩和前臂由向面部内收改为从角色右外侧抬起，五个
关键姿态中剑身均与头盔、头饰、躯干和披风保持间距。validator 对整段 victory 做 13 点密集采样，并以 BVH 检查
right-hand/sword 网格与除相连前臂外全部身体和装备分组，所有样本相交数均为 0；双脚继续保持零位移/零旋转，
Blender 五相位与真实 Three.js viewer 的最高抬剑姿态均已复验。

用户提供正面截图指出第六版 walk 的腿仍然怪异。几何诊断确认“髋、膝、踝零横向偏差”约束过度：鞋几何中心
间距只有约 8.5cm，两鞋横向范围明显重叠，造成膝盖内扣和换步交叉感。第八版改为自然宽度的左右独立轨道：
膝盖相对髋部各向外 2cm，左/右脚踝分别向外 4cm/5cm，同时继续数值求解鞋尖朝前。最终 GLB 密集采样的鞋中心
间距稳定在 18.56–18.90cm；validator 改为自然腿距、轨道稳定性和最小 14cm 鞋中心间距门禁。与用户截图一致的
正面九相位渲染及真实 Three.js viewer 换步姿态均无内扣、拥挤或交叉。

## 剩余风险

- 模型是分件硬表面资产，极端大幅度动作仍可能出现原始甲片之间的几何穿插；本次四个动作的关键姿势和浏览器播放
  范围已控制在可接受幅度。
- 外部 Blender pipeline 按用户要求不进 Git；仓库可以运行最终 GLB，但未来重建 binary 依赖下载目录工作区，需由
  用户自行备份该目录。
- 真实 390 px 窄屏视觉仍建议用户在可改变 viewport 的浏览器做一次快速确认；桌面布局与 CSS breakpoint 已完成。
