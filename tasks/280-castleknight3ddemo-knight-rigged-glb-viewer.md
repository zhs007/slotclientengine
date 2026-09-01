# 280 castleknight3ddemo-knight-rigged-glb-viewer 任务计划

## 1. 目标与完成定义

### 目标

基于下载目录的 `/Users/zerro/Downloads/20260830134258_0d61785b.glb`，沿用此前河豚的 Blender
脚本化检查、建骨、蒙皮、动作制作、导出和视觉门禁方法，为城堡骑士制作可在 Three.js 中播放的骨骼动画；在
`apps/castleknight3ddemo` 增加独立 GLB 骨骼动画查看页。最终 runtime GLB 内嵌带 mipmap 的 KTX2
纹理并明显小于原始 28 MB 文件，Blender 源工程、处理脚本、中间文件和验收渲染全部留在下载目录。

### 完成定义

- [ ] 骑士 GLB 包含一个明确的人形 armature/skin；躯干、头、双臂、双腿及可辨识装备按显式部件映射蒙皮，
      肩、肘、髋、膝等关节运动时没有明显穿帮、错误拉伸、悬空部件或左右错绑。
- [ ] 最终 GLB 至少包含 `idle`、`attack`、`victory` 三个命名 animation clip；`idle` 首尾可无跳变循环，
      两个一次性动作从稳定姿态出发并回到可继续播放的姿态。
- [ ] 最终 GLB 自包含 mesh、skin、animation、material 与纹理；三张原始 4096×4096 PNG 被不超过
      2048×2048、带完整 mipmap 的 UASTC KTX2 替代，正确区分 sRGB base color 与 linear normal/
      metallic-roughness，使用 `KHR_texture_basisu` 且不夹带 PNG/WebP fallback。
- [ ] 最终 GLB 文件严格小于原始 `29,473,708` bytes；执行报告记录最终字节数、压缩比、texture codec/
      尺寸、bone 数、triangle 数、clip 名称和时长，不以降低到不可接受画质换取数字。
- [ ] `castleknight3ddemo/viewer.html` 可默认加载最终骑士 GLB，也可通过文件选择或拖放打开其他自包含 `.glb`；
      可旋转/缩放、切换 clip、播放/暂停、重播、调速、选择循环、拖动时间轴和显示/隐藏 skeleton。
- [ ] 查看器显示 meshes、triangles、bones、skins、animations 与当前 clip 状态；无 skin、无 animation、未知
      clip、加载失败或 KTX2 转码失败时显示明确状态，不猜测动画或静默降级材质。
- [ ] `index.html` 的现有城堡棋盘、道具预览 query、spin、资源加载和 destroy 行为保持不变；本任务不把骑士
      放入主场景，也不改变现有 symbol 表。
- [ ] Blender source、Python/Node 处理工具、本地工具依赖、原始/中间 GLB、解包纹理、报告 JSON、截图和视频均在
      下载目录；本地 Git 分支只增加 runtime 必需文件，以及用户明确要求的计划和仓库规定的执行报告。
- [ ] app 定向自动化、真实浏览器 KTX2/动画/替换模型/销毁检查、独立资产复验与 UTC 中文执行报告完成。

## 2. 范围

### 包含

- 下载源 GLB 的结构、部件、坐标轴、材质、纹理、拓扑和可蒙皮性检查；生成显式 33-part 语义映射。
- Blender 5.x headless 脚本化 humanoid armature、混合权重/刚性权重、三个动作、`.blend` 保存与 GLB 导出。
- 外部资产流水线中的 2K texture resize、mipmap、UASTC + Zstandard KTX2 编码和自包含 GLB 重打包。
- `castleknight3ddemo` 独立多页 viewer、KTX2 loader/Basis runtime、动画控制、骨架辅助、统计、自动 framing、
  本地 GLB 导入、错误展示和完整 resource cleanup。
- 最终 runtime GLB、Basis JS/WASM runtime、Vite 多页 build 配置与最小任务文档。

### 不包含

- 不把骑士接入主城堡 scene、5×6 board、symbol replacement、round、server 数据、中奖演出或业务状态机。
- 不修改或抽取 `underwater3ddemo` 的查看器，不创建跨 app shared viewer package；只以其行为和河豚 Blender
  流水线为实现参考。
- 不制作走路位移、跑步、跳跃、受击、死亡、布料/头发物理、面部表情、IK runtime、动作混合树或 root motion。
- 不重拓扑、减面、LOD、Meshopt/Draco geometry compression，也不重绘骑士贴图；KTX2 是本任务唯一资源压缩扩展。
- 不支持带外部 `.bin`/texture URI 的 `.gltf`、ZIP、远程 URL、FBX/OBJ 或模型编辑；本地入口只接受单文件 GLB。
- 不提交 Blender、Python、glTF Transform/KTX 工具、工具 lockfile、source/intermediate GLB、PNG/KTX2 中间件、
  `.blend/.blend1`、validation render/video 或下载目录报告。
- 不新增 npm runtime/dev dependency，不升级 Three.js，不修改 `pnpm-lock.yaml`、workspace/root 工具链、shared package、
  manifest、YAML、生成 TypeScript 或领域规则。

## 3. 制定计划时的基线

```text
UTC: 2026-09-01T04:51:13Z
HEAD: ee2f0d1c442daa118b1c5cdc2085bd5f9a181cda
branch: detached HEAD
git status --short --untracked-files=all: clean
```

已读取：

- 根 `AGENTS.md`
- `tasks/templates/task-plan.md`
- `tasks/214-slot3ddemo001-megalith-wall.md`
- `apps/castleknight3ddemo/{README.md,package.json,index.html,vite.config.ts}`
- `apps/castleknight3ddemo/src/{main.ts,castle-scene.ts,model-loader.ts,symbols.ts}` 及现有定向测试
- `apps/underwater3ddemo/{README.md,viewer.html,vite.config.ts}`
- `apps/underwater3ddemo/src/{model-viewer.ts,pufferfish-actor.ts}`
- `/Users/zerro/Downloads/underwater3ddemo-model-work/blender-tools/{inspect_glb.py,rig_pufferfish.py,validate_animated_glb.py}`

`apps/`、`apps/castleknight3ddemo` 和 `apps/underwater3ddemo` 下均无补充 `AGENTS.md`。本任务只修改独立 demo
app 与 task 文档，不命中根规则表中的领域规则，因此规划阶段未加载 `docs/agent-rules/*`。

当前结论：

- 源文件 SHA-256 为 `ce9af6bc27d3c89c91bb097addf8f300481b272ebb770607d9d8985c345ab56e`，
  长度 `29,473,708` bytes；执行时保留原文件不动，先复制到 task 外部工作目录。
- 源 GLB 由 Blender glTF exporter 4.0.43 生成，含 1 scene、33 个顶层 `part_0`…`part_32` node/mesh、
  24,702 triangles、1 material、3 textures；当前没有 `skins` 或 `animations`，不能只给既有骨架补 keyframe。
- 三张纹理都是内嵌 4096×4096 PNG：normal `5,232,371` bytes、base color `12,546,084` bytes、
  metallic-roughness `10,988,141` bytes。GLB 只使用 `KHR_materials_specular`，尚无 KTX2 extension。
- 现有河豚流程使用 Blender 脚本按严格 part 名/空间位置建 vertex group、armature 和 `idle/win/land` actions，
  再用独立脚本检查 armature、skinned mesh、actions 并渲染关键帧；该方法可复用，骑士必须先建立新的部件语义表，
  不能照抄河豚的坐标阈值或 bone layout。
- `underwater3ddemo/viewer.html` 已验证独立 Vite page、OrbitControls、AnimationMixer、SkeletonHelper、文件拖放和
  resource dispose 的基本路线，但只用裸 `GLTFLoader`、总是循环且接受不完整 `.gltf`，不满足本任务 KTX2、时间轴、
  strict GLB 和 clip loop-mode 要求。
- `castleknight3ddemo` 已依赖锁定的 `three@0.185.1`，当前只有单页 Vite input；现有外部静态 GLB 位于
  `public/models/`。新增 viewer 无需依赖或 lockfile 变化。
- 本机已有 `/Applications/Blender.app` 和 `ktx 4.4.2`；shell Node 需先 `nvm use 24`。资产重打包工具尚未作为
  workspace 依赖存在，执行时只能固定安装在下载目录的外部工具工作区，不能写入仓库 manifest/lockfile。

## 4. 需求解释与技术决策

### 需求解释

1. “类似河豚的方法”解释为可重复的 Blender headless inspection → explicit rig/weights → named actions → GLB
   export → structural/visual validation 流程，不代表复用河豚骨架、坐标或动作。
2. “骑士的骨骼动画”以三个能清楚证明 humanoid joints 的 clip 为最小交付：循环 `idle`、一次性 `attack` 和
   `victory`。本任务不推断游戏主场景何时触发它们，viewer 是唯一 runtime consumer。
3. “专门的 GLB 查看器”解释为 `castleknight3ddemo` 中独立于主棋盘的 `viewer.html`，不是复用 prop query，也
   不是新增全仓通用 package。它默认查看本任务骑士，同时能检查其他自包含 GLB。
4. “GLB 需要压缩，KTX2”解释为纹理缩到最高 2K、生成 mipmap 并以 UASTC + Zstandard 内嵌进 GLB；不以
   WebP fallback 冒充 KTX2，也不顺带引入 geometry codec。
5. “Blender 相关内容放下载目录”包含资产检查/rig/validator 脚本、`.blend`、本地 glTF Transform 工具工作区、
   中间资产和视觉证据；这些不进入 Git。仓库内只保留浏览器实际下载/执行的文件，task plan/report 是明确要求的
   流程记录例外。

### 关键决策

1. **先以视觉与几何报告固定 part mapping，再建骨。**
   - 在 `/Users/zerro/Downloads/task-280-castle-knight-rig/` 创建 `source/`、`blender-tools/`、`work/`、
     `validation/` 与本地工具目录；复制源文件并复验 hash。
   - `inspect_knight.py` 输出 bounds、vertices/polygons、world center、material、正/侧/背/四分之三视图和 33-part
     contact sheet；`rig_knight.py` 只接受确认后的精确 part 集及显式语义映射，数量/名称/空间门禁变化即失败。
2. **使用一套 deformation skeleton，按部位选择刚性或混合权重。**
   - armature 至少表达 root/pelvis/spine/chest/neck/head、左右 upper/lower arm/hand、左右 thigh/shin/foot；
     可辨识武器、盾牌、披风或装饰只有在检查确认存在时才增加语义 bone。
   - 硬甲/手持部件全重绑定所属 bone；跨关节的人体、衣物或连续网格使用有限混合权重并限制每 vertex influence。
     所有可见部件必须受唯一明确的 skin/骨骼链管理，禁止依赖 object 名猜测或 automatic weight 的未审结果。
3. **动作以稳定姿态和可检查关节为合同。**
   - `idle` 使用轻微呼吸、重心和手臂变化，首尾 pose/velocity 连续；`attack` 明确表现准备、挥击、回收；
     `victory` 明确表现挺身/举臂或装备庆祝并回收。三者固定 30 fps、无意外 root displacement、无 NLA 残留。
   - action 名称严格唯一且导出为独立 glTF clips；未知/重复/零时长 action、未绑定 mesh 或 non-finite transform
     都由外部 validator 失败，不在 viewer 中重命名或选择首项掩盖。
4. **Blender intermediate 与 production GLB 分层。**
   - Blender 输出保留完整 skin/animations 的中间 GLB 到下载目录；外部固定版本的 glTF 工具仅做 texture resize、
     KTX2 encode/repack，不改变 bone、weight、animation time/value、material slot 或 node hierarchy。
   - base color 标记 sRGB，normal 和 metallic-roughness 保持 linear；全部 UASTC、Zstandard supercompression、完整
     mip chain、max 2048。最终 GLB 不带 fallback URI/image，不增加 Meshopt/Draco decoder contract。
5. **viewer 显式拥有 KTX2 解码与模型替换 transaction。**
   - 从当前 `three@0.185.1` distribution 复制 `basis_transcoder.js/.wasm` 作为 runtime，并对
     `KTX2Loader` 设置 app-local transcoder path、`detectSupport(renderer)`，再注入 `GLTFLoader`。
   - 每次 load 先 prepare 新 GLTF、验证有效 scene，再 commit 替换；请求序号防止慢请求覆盖新选择。失败或 stale
     load 释放临时 scene/texture/Object URL，保留当前可用模型并显示错误。
   - committed model 统一 framing、shadow 和 stats；replace/destroy 停止并 uncache mixer、移除/销毁 helper，按 Set
     去重释放 geometry/material/texture，最终释放 controls、KTX2 loader、renderer、observer、listener 和 animation loop。
6. **viewer 是独立 runtime page，不改变主 scene。**
   - `vite.config.ts` 增加 `main`/`viewer` inputs；viewer 自有 DOM/CSS/renderer/controller，不在
     `CastleKnightRenderer` 或 `SymbolField` 复制 animation state。
   - 文件输入只接受 `.glb`；空 skin/animation 可显示静态模型和明确的 `0` 状态，但不能生成伪 clip。默认骑士若
     缺 skin、必需 clip 或 KTX2 则视为交付失败。

## 5. 职责与合同

- **外部 Blender 工作区**：拥有 source inspection、part semantic mapping、armature、weights、actions、intermediate
  export、KTX2 packaging 参数与视觉证据；可重建 final GLB，但不属于 runtime/git 交付。
- **runtime GLB**：拥有唯一 mesh/material/skin/animation 事实；viewer 只读 glTF contract，不维护第二份 bone、part、
  texture 或 clip duration 表。
- **viewer page**：拥有模型加载 transaction、KTX2 decoder、AnimationMixer/action、UI state、framing、stats、
  file Object URL 和资源生命周期；不拥有 Blender authoring 语义。
- **数据/API**：固定 default asset URL 与 `idle/attack/victory` 资产验收合同；任意用户 GLB 的 clip 列表完全来自
  `gltf.animations`，顺序和名称不猜测。viewer 不新增跨 package public TypeScript API。
- **资源生命周期**：外部 source/intermediate/final candidate 由下载目录管理；Git 只复制最后通过门禁的 final GLB。
  browser prepare/commit/rollback/destroy 必须区分，不能在替换失败后留下半提交 scene 或提前销毁当前模型。
- **失败策略**：source part mapping 不确定、关节不可合理变形、KTX2 encode/validate 失败、asset 超过原始大小、
  required runtime 文件缺失或默认 clip/skin 缺失时停止交付并保留证据；不得改用 PNG/WebP、静态 object animation、
  placeholder、首 clip 猜测或材质降级。
- **禁止行为**：提交 `.blend`/脚本/截图/中间资产、修改原下载文件、第二份 animation manifest、CDN decoder、
  base64 decoder、静默 KTX2 fallback、复制 viewer 到 shared package 或顺手接入主棋盘。

## 6. 文件范围

### 下载目录预计新增（不进入 Git）

```text
/Users/zerro/Downloads/task-280-castle-knight-rig/**
```

其中可包含 `source/20260830134258_0d61785b.glb`、`blender-tools/*.py`、本地 asset-tool manifest/lockfile、
`.blend/.blend1`、intermediate/final candidate GLB、解包 KTX2、inspection/validation JSON、关键帧渲染和预览视频。

### 仓库预计新增

```text
apps/castleknight3ddemo/viewer.html
apps/castleknight3ddemo/src/model-viewer.ts
apps/castleknight3ddemo/src/model-viewer.css
apps/castleknight3ddemo/public/models/castle-knight-rigged-ktx2.glb
apps/castleknight3ddemo/public/basis/basis_transcoder.js
apps/castleknight3ddemo/public/basis/basis_transcoder.wasm
tasks/280-castleknight3ddemo-knight-rigged-glb-viewer-<utctime>.md
```

### 仓库预计修改

```text
apps/castleknight3ddemo/vite.config.ts
```

当前计划文件是用户明确要求创建的 `tasks/280-castleknight3ddemo-knight-rigged-glb-viewer.md`。

### 原则上不应修改或提交

```text
apps/castleknight3ddemo/{index.html,README.md,package.json}
apps/castleknight3ddemo/src/{main.ts,castle-scene.ts,model-loader.ts,symbols.ts}
apps/castleknight3ddemo/tests/**
apps/underwater3ddemo/**
packages/**
assets/**
docs/agent-rules/**
package.json
pnpm-lock.yaml
```

执行时若需要修改主场景、共享 API、依赖/lockfile、使用 geometry codec，或无法在明确 part mapping 下制作可信
humanoid deformation，属于明显范围扩张，应先提交证据并停止，不能修改计划来事后合理化。

## 7. 实施步骤

1. **确认基线并建立下载目录工作区**
   - 重核 HEAD/status、计划、源路径/hash/bytes 和 Blender/KTX/Node 版本；若 source hash 变化则先停止。
   - 复制源 GLB 到 task 外部目录，创建外部工具/工作/validation 分区；确认整个目录不位于 Git worktree。
2. **检查模型并冻结 semantic part map**
   - 编写/运行外部 `inspect_knight.py`，导出结构 JSON、多视图和按 part 高亮的 contact sheet。
   - 人工确认正面、up/forward axis、ground、左右、身体/装备部件和关节边界；把 33 个输入 part 一一映射到
     deformation region/rigid bone，禁止遗漏、重名或靠运行时坐标猜测。
3. **脚本化建骨、蒙皮和动作**
   - 外部 `rig_knight.py` 严格导入 source、应用坐标/scale、创建 armature 与 vertex groups/armature modifiers，
     依据部件性质使用 full weights 或受控 blend weights。
   - 制作 `idle/attack/victory` actions，清除多余 scene/object/action，保存 `.blend` 并导出带 skin/animation 的
     intermediate GLB；在 Blender 中检查 rest pose 与关节极值。
4. **验证 intermediate 并生成 KTX2 production candidate**
   - 外部 validator 检查 armature/skin/bones/influences、exact clips、时长/采样、finite transforms、mesh/material、
     bounds 与资源自包含性；渲染 rest pose、各 clip 关键帧和完整帧序列抽查穿插/跳变。
   - 用下载目录固定版本工具把三张纹理缩到最大 2K，按 glTF slot 设置 color space，生成 UASTC + Zstd + mipmap
     KTX2 并重打包；逐张 `ktx validate`，复验 skin/animation parity 和 final bytes。
5. **接入独立 KTX2 GLB viewer**
   - 只把通过门禁的 final GLB 复制到 `public/models/`，从锁定 Three distribution 复制两份 Basis runtime 文件。
   - 新增 viewer HTML/CSS/TS 与 Vite MPA input；实现 KTX2-aware loader、OrbitControls、lighting/grid、auto framing、
     stats、clip select、play/pause/replay/speed/loop/timeline/skeleton 及本地 GLB drag/drop。
   - 完成 race-safe prepare/commit/rollback、Object URL 回收和 replace/destroy 清理；不触碰主 app bootstrap。
6. **定向验收、Git 边界与报告**
   - 运行 L2 指定命令，真实浏览器检查默认 KTX2 模型、三个 clip、骨架、时间轴、拖放替换、resize 和错误路径。
   - 用 `git status`/`git diff --stat` 确认没有 source/intermediate/tool/screenshot、依赖或 lockfile 进入仓库；本地分支
     提交范围只含第 6 节 runtime 文件、计划和执行报告，不 push。
   - 生成 UTC 中文执行报告，记录外部工具版本/门禁结果但不复制外部脚本、完整资产表或大段日志。

## 8. 测试与验收

### 测试原则

- source/intermediate/final 使用同一外部 validator 比较 scene/mesh/material、skin、bone、clip name/time 与 bounds；
  KTX2 阶段只允许纹理表示、尺寸和 GLB packing 变化，不允许动画或节点层级漂移。
- 资产 validator 必须解析 final GLB JSON/BIN 和内嵌 KTX2 header，检查 `KHR_texture_basisu`、KTX2 magic、mipmap、
  dimensions、color-space slot、无 PNG/WebP fallback、无外部 URI、exact clips 和文件大小。
- Blender render 验证 deformation；浏览器验证 Three.js/KTX2 transcoding 和交互。结构脚本、compile/build 或截图均不能
  单独替代真实动画播放。
- 不为本任务提交测试 helper/fixture；外部 validator 留在下载目录。仓库现有 Vitest 全量继续运行，证明主 demo 纯函数
  行为未回归。

### 验收级别

`L2`：没有跨 package public API、依赖或 lockfile 变化，但新增正式 runtime GLB、KTX2 decoder files 和 Vite 多页
交付物；需要 app 定向 build、外部资产 parity/KTX2 checker、真实浏览器以及独立资产复验。无直接 package consumer，
因此不扩张到整仓 L3。

### 执行会话必须运行

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python /Users/zerro/Downloads/task-280-castle-knight-rig/blender-tools/validate_knight_glb.py -- --intermediate /Users/zerro/Downloads/task-280-castle-knight-rig/work/castle-knight-rigged.glb --final apps/castleknight3ddemo/public/models/castle-knight-rigged-ktx2.glb --output-dir /Users/zerro/Downloads/task-280-castle-knight-rig/validation/final
pnpm --filter castleknight3ddemo typecheck
pnpm --filter castleknight3ddemo lint
pnpm --filter castleknight3ddemo test
pnpm --filter castleknight3ddemo build
pnpm --filter castleknight3ddemo format:check && git diff --check
```

第一条外部 validator 必须同时运行逐张 `ktx validate`、GLB structural/parity/size 检查和关键帧渲染；若 Blender
不能导入 KTX2 final，则只从 intermediate 渲染，但仍直接解析 final GLB/KTX2 并由浏览器完成 final 视觉验收。

### 人工验收

1. 在 Blender 对 rest、`idle` 循环接缝、`attack` 最大挥击、`victory` 最大举臂及回收姿态检查正/侧/背/四分之三
   视图；重点观察肩肘髋膝、手持装备、甲片/披风穿插、脚底漂移和首尾跳变。
2. 启动 `pnpm --filter castleknight3ddemo dev`，打开 `/viewer.html`；确认 Network 实际请求 final GLB 与本地 Basis
   JS/WASM，材质/normal/metallic-roughness 正确，无缺 mip、紫黑材质、KTX2 worker 或 WebGL 错误。
3. 逐个播放三个 clip，验证暂停、重播、0.2×/2×、loop on/off、scrub、切 clip、骨架显示、orbit/zoom、resize 和
   stats；`idle` 循环无跳帧，一次性动作停止/重播语义清楚。
4. 拖入 source 静态 GLB，应显示 bones/skins/animations 为 0 而不伪造动画；再拖入 final GLB 和一个损坏/错误扩展名
   文件，确认成功替换、失败保留当前模型、错误明确且控制台无 uncaught rejection。
5. 返回 `/` 检查原城堡棋盘、prop query 与 spin；重复 viewer 模型替换后离开页面，确认无重复 canvas/listener、
   stale load commit 或可观察 GPU/resource 泄漏。

### 独立验收建议

`必须`。原因是 rig/weights/KTX2 production pipeline 位于 Git 外，正式 binary 资产无法仅靠 code review 重建；独立
验收者需重点复核 final GLB 与 intermediate 的 animation/skin parity、KTX2 runtime 解码和关节视觉质量。复验命令：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --python /Users/zerro/Downloads/task-280-castle-knight-rig/blender-tools/validate_knight_glb.py -- --intermediate /Users/zerro/Downloads/task-280-castle-knight-rig/work/castle-knight-rigged.glb --final apps/castleknight3ddemo/public/models/castle-knight-rigged-ktx2.glb --output-dir /Users/zerro/Downloads/task-280-castle-knight-rig/validation/independent
pnpm --filter castleknight3ddemo test
pnpm --filter castleknight3ddemo build
```

## 9. 环境与依赖

- 使用仓库要求的 Node.js 24 与 pnpm；shell 没有 Node 时执行：

  ```bash
  source /Users/zerro/.nvm/nvm.sh
  nvm use 24
  ```

- 依赖缺失时使用 `CI=true pnpm install --frozen-lockfile`；只有下载实际失败后才设置仓库约定代理并重试原命令。
- Blender 使用现有 `/Applications/Blender.app`，KTX 验证使用现有 `ktx 4.4.2`；执行报告记录实际 Blender、glTF
  packaging tool 与 KTX 版本。
- glTF Transform 或等价 packaging CLI 必须固定版本并安装在
  `/Users/zerro/Downloads/task-280-castle-knight-rig/` 的本地工具目录，其 manifest/lock/cache 不进入仓库。
- viewer 复用 `three@0.185.1` 的 `GLTFLoader`、`KTX2Loader`、`OrbitControls`、`AnimationMixer` 和
  `SkeletonHelper`；Basis runtime 复制自同一锁定版本，禁止 CDN 或版本错配。
- 不新增/升级 workspace 依赖，不修改 package manifest/lockfile；若当前 frozen install 不能提供 Three 的 Basis
  runtime，应先查明 lock/install 问题，不能下载任意版本文件顶替。

## 10. 生成物、文档与规则

- `.blend`、Blender/Python/Node tooling、intermediate GLB、拆出的 KTX2 和验收视觉证据都是下载目录外部生成物，
  禁止提交；final GLB 是唯一正式模型 runtime 生成物，禁止手改 binary。
- `basis_transcoder.js/.wasm` 是 KTX2Loader 实际运行必需的 vendor runtime，必须从 `three@0.185.1` 原样复制并在
  执行报告记录来源；不得复制无关 examples 或工具文件。
- 用户要求 Git 只保留 runtime 必需内容，因此不修改 README、不增加仓库内资产 checker/test fixture；viewer 页面本身
  提供入口说明和操作提示。本计划与规定的执行报告是任务治理记录例外。
- 本任务不改变稳定架构职责，不更新根 `AGENTS.md` 或 `docs/agent-rules/*`；无 YAML、manifest 或生成 TypeScript，
  不运行无关 generator/checker。

## 11. 执行报告

规划时不生成报告。执行完成后创建：

```text
tasks/280-castleknight3ddemo-knight-rigged-glb-viewer-<utctime>.md
```

UTC 使用 `date -u +%y%m%d-%H%M%S`。报告简要记录 final runtime 文件、source/final hash 与 bytes、texture codec/
dimensions/mips、bone/skin/triangle/clip facts、外部工具版本、实际验收命令与结果、浏览器/独立视觉结论、Git 边界、
计划偏差和剩余风险；不复制 Blender 脚本、part 全表、frame sequence、完整日志或下载目录文件。

## 12. 风险、假设与待确认

### 风险

- 33 个 part 只有 `part_N` 名且没有 skin；仅靠 bounds 可能无法区分贴近的左右甲片或内部部件。必须用高亮多视图
  人工冻结 mapping，无法可靠辨识时停止，不能靠最近 bone 自动猜测。
- 源模型可能由互相穿插的硬表面部件构成，肩/髋大角度会暴露 rest pose 下看不到的断口；动作幅度需以可信视觉为
  上限，但不能把关节几乎不动来假装骨骼动画成功。
- UASTC 2K 主要降低 GPU 友好度和原始 PNG 体积，最终大小取决于纹理内容；必须确保严格小于 source。若不满足，
  应在外部流水线评估较低尺寸并重新视觉验收，不能改用 fallback 或 geometry codec 偷换合同。
- KTX2 GLB 依赖 Basis JS/WASM 与 Three.js 版本匹配；路径/base 配置错误会在普通 PNG GLB 上不暴露，必须以 final
  asset 和 production build 路径验收。
- local file 连续拖放会产生异步竞态和 GPU 资源 ownership 问题；没有 request generation 与 transaction cleanup 时
  可能出现旧模型覆盖新模型或替换失败后画面空白。
- 外部 pipeline 不在 Git，未来不能仅凭仓库重建 final GLB；这是用户明确的交付边界，执行报告必须保留版本与摘要，
  下载目录需由用户自行备份。

### 假设

- 最小动作集采用 `idle/attack/victory`；用户没有要求主场景触发、root motion 或更多动作。
- source inspection 能辨认稳定的人形身体/装备分区，并允许用刚性权重加局部混合权重得到可接受变形。
- 最高 2K UASTC + Zstd 能在保持当前 demo 视觉质量的同时令 final GLB 小于原始文件。
- `/viewer.html` 是“专门查看器”的目标部署入口；不要求从主棋盘页面添加导航链接。

### 待确认

无。动作集、查看器归属、压缩方式和主场景非目标均已在本计划作为最小可执行合同明确；若执行时源几何证据否定
可蒙皮性，按风险门禁停止而不是向用户隐瞒或自动换方案。

## 13. 完成清单

- [ ] 目标和非目标已满足，三个动作、KTX2 GLB 与独立 viewer 均可观察。
- [ ] Blender/tool/intermediate/validation 内容全部留在下载目录，Git 文件符合第 6 节边界。
- [ ] final GLB 的 skin/clip/KTX2/parity/size 合同通过外部 validator。
- [ ] viewer KTX2 loader、async transaction 和 destroy/resource ownership 符合计划。
- [ ] 主城堡页面和现有测试无回归，依赖、lockfile、shared package 和领域规则未变化。
- [ ] 指定自动化、Blender 视觉、真实浏览器和独立验收已完成且明确区分。
- [ ] UTC 中文执行报告已生成，local branch 仅提交授权范围且未 push。

## 14. 执行会话交接

执行会话应：

1. 读取根 `AGENTS.md`、本计划和第 3 节列出的直接相关文件；当前任务无需领域规则。
2. 核对 Git 基线、源 GLB hash/bytes、Blender/KTX/Node 环境与下载目录外部边界。
3. 按 inspection → mapping gate → rig/animation → intermediate validation → KTX2 → viewer 顺序实施，不重新制定方案。
4. 小幅适配当前实现时在报告记录；source 不可可靠蒙皮或需扩大 public API/依赖/主场景时先停止说明。
5. 只运行计划规定的 L2 验收，并由独立验收者复核 binary asset 与真实浏览器。
6. 完成后生成 UTC 报告；用户已明确要求提交本地 Git 分支时只提交第 6 节 runtime 文件、计划和报告，不提交下载
   目录内容，不 push、不创建 PR。
