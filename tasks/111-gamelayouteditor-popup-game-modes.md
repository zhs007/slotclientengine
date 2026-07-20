# Game Layout Editor Popup Game Modes 任务计划

## 1. 任务目标

本任务在现有 `apps/gamelayouteditor`、`apps/popupeditor` 与
`packages/rendercore` 的 popup / scene-layout 能力上，补齐“游戏模式选择 ->
该模式的获奖庆祝配置 -> 真实预览 -> 自包含 layout ZIP -> 游戏直接消费”的完整链路。

任务完成后，布局配置人员必须能够：

1. 把 `apps/popupeditor` 导出的 strict `<popup-id>-popup.zip` 导入 Game
   Layout Editor；导入时严格验证根 sentinel、manifest、资源版本、图片尺寸、
   animation、ImgNumber glyph 与完整传递闭包，不把未知、多余或缺失文件带入项目。
2. 在一个 layout 项目中维护一个或多个游戏模式。模式 id 是业务显式配置，示例为
   `BaseGame`、`FreeGame`、`BonusGame`，也允许项目使用 `BG`、`FG` 等其它合法 id；
   shared package 不硬编码这些名称。
3. 为每个游戏模式选择零个或一个 `award-celebration` popup。多个模式可以引用同一个
   popup dependency，也可以分别引用不同 popup；没有配置时必须在 UI 中明确显示“无庆祝效果”，
   不能自动回退到第一个、唯一或 BaseGame popup。
4. 为每个导入的 popup 按 layout 的 active responsive variant 配置一份相对最终 Pixi
   viewport center 的 root `x/y/scale`。popup 内部 tier、layer、金额格式、坐标和资源继续只由
   Popup Editor 编辑，Game Layout Editor 不复制这些能力。
5. 在右侧 preview 选择当前游戏模式；预览输入默认 `betAmountRaw=100`、
   `winAmountRaw=6000`。点击“开始庆祝”时，必须使用当前所选模式绑定的 popup 和 production
   rendercore player 从头开始渲染；Advance、awaiting-dismiss、dismiss、重播和逐帧 update
   必须使用 production runtime，不写 editor-only 动画模拟器。
6. Game Layout Editor 导出的 `<layout-id>-layout.zip` 必须包含
   `layout.manifest.json`、layout 自有精确资源闭包，以及所有被游戏模式实际引用的 popup ZIP
   内容，vendor 到 `dependencies/popups/<popup-id>/`。重新导入该 layout ZIP 后，游戏模式、
   popup 引用、placement 和 bytes 必须无损恢复并可再次预览、导出。
7. production game 通过 scene-layout package runtime 选择游戏模式并启动当前模式的获奖庆祝，
   不再自行解析 nested popup 路径、猜 popup id、复制 placement 或直接操作 Pixi/VNI/Spine。

最终 ZIP 结构示例：

```text
game003-layout.zip
  layout.manifest.json
  assets/**
  dependencies/image-strings/**
  dependencies/symbols/**                 # 仅在原有显式 include 规则满足时存在
  dependencies/popups/base-celebration/
    popup.manifest.json
    assets/**
    dependencies/image-strings/**
  dependencies/popups/free-celebration/
    popup.manifest.json
    assets/**
    dependencies/image-strings/**
```

本文件是完整实施合同。执行者不得依赖聊天记录、任务 107、108、110、执行报告或口头说明
补齐行为；可以阅读历史代码理解基线，但 schema、API、失败策略、实施顺序、测试、验收和交付物
均以本文件为准。

任务完成后必须新增中文任务报告：

```text
tasks/111-gamelayouteditor-popup-game-modes-[utctime].md
```

UTC 时间戳必须使用：

```bash
date -u +%y%m%d-%H%M%S
```

示例：

```text
tasks/111-gamelayouteditor-popup-game-modes-260401-181300.md
```

## 2. 当前基线与已确认缺口

制定本计划时仓库现场为：

```text
repository: /Users/zerro/github.com/slotclientengine
branch:     main
HEAD:       37618e8
status:     clean
date:       2026-07-20 (Asia/Shanghai)
```

实施开始时必须重新记录 branch、HEAD、工作区状态与工具版本；这里的 hash 只用于说明计划制定基线，
不能拿它覆盖用户后续修改。

当前已经存在且必须复用的能力：

- `apps/popupeditor` 已能编辑并导出 strict `popup.manifest.json` v1 /
  `award-celebration` 自包含 ZIP。
- `packages/rendercore/src/popup/**` 已拥有 popup manifest parser、精确资源闭包、
  image/image-string/VNI/official Spine 4.3 resource prepare、BigInt threshold sequence、金额格式、
  点击/dismiss/end drain、snapshot 与 destroy 生命周期。
- `packages/rendercore/src/scene-layout/**` 已能把 popup dependency 放进 layout package、
  创建 popup player、按 active variant 应用相对 viewport center placement，并在统一 ticker 中 update。
- `apps/gamelayouteditor/src/io/imported-popup-package.ts` 已能严格解压并校验一个 popup ZIP。
- `apps/gamelayouteditor/src/io/exported-layout-zip.ts` 已能把当前单个 popup dependency vendor
  到 layout ZIP。
- Game Layout Editor 已有 Spine node state machine，可编辑稳定状态和直接有向 transition，并可在
  preview 中请求 node state。

当前缺口必须按实际代码修复，不能在计划执行时误当成已完成：

1. `EditorProject` 只有 singular `popupDependency`，scene-layout parser 也要求 `popups`
   存在时恰好一项；无法为不同游戏模式配置不同 popup，也没有模式到 popup 的显式引用。
2. 当前 popup drawer 是一次性插入的临时控件，只有全局 popup，没有游戏模式的新增、删除、选择、
   初始模式、绑定和只读诊断。
3. 当前 preview 的 win 默认值是 `5000`，不符合本任务要求的 `6000`。
4. `LayoutPreview.setLayout()` 只有 manifest 带 `symbolPackage` 时才创建
   `SceneLayoutPackageRuntime`。只导入 popup、没有 symbols binding 时会退回 layout-only runtime，
   `playAwardCelebration()` 随后因没有 package runtime 失败。这是实际逻辑 bug，必须直接修复，
   不能通过要求用户附带一个无关 symbols ZIP 绕过。
5. 当前 export API 只接收一个 `popupFiles` map；导入 layout 也只重建一个 popup dependency。
6. production API 只提供 `getAwardCelebrationPopup(id)`，游戏仍需知道 layout 内 popup binding id；
   尚无“当前游戏模式”的 runtime snapshot、切换 API和按当前模式启动庆祝的 API。
7. 当前 `docs/scene-layout-manifest.md` 与 `apps/gamelayouteditor/README.md` 只描述单个全局 popup，
   需要与新合同同步。

实施时至少重新阅读：

```text
agents.md
apps/gamelayouteditor/README.md
apps/gamelayouteditor/src/model/editor-project.ts
apps/gamelayouteditor/src/model/editor-store.ts
apps/gamelayouteditor/src/model/validation.ts
apps/gamelayouteditor/src/io/imported-popup-package.ts
apps/gamelayouteditor/src/io/imported-layout-zip.ts
apps/gamelayouteditor/src/io/exported-layout-zip.ts
apps/gamelayouteditor/src/preview/layout-preview.ts
apps/gamelayouteditor/src/ui/app-shell.ts
apps/gamelayouteditor/src/ui/layout-workspace.ts
apps/gamelayouteditor/src/ui/project-workspace.ts
apps/gamelayouteditor/tests/popup-package.test.ts
apps/gamelayouteditor/tests/zip-io.test.ts
packages/rendercore/src/popup/**
packages/rendercore/src/scene-layout/**
docs/popup-manifest.md
docs/scene-layout-manifest.md
```

## 3. 已确定的产品与架构决定

### 3.1 游戏模式是 layout production 数据，不是 preview session state

scene-layout v1 增加可选的 `gameModes` 字段；现有合法 v1 package 不改变含义，旧 consumer API
继续工作。新建和经 Game Layout Editor 重新导出的项目必须显式包含 `gameModes`。

合同形状固定为：

```ts
interface SceneLayoutGameModes {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameMode[];
}

interface SceneLayoutGameMode {
  readonly id: string;
  readonly nodeStates: Readonly<Record<string, string>>;
  readonly awardCelebrationPopup?: string;
}
```

manifest 示例：

```json
{
  "version": 1,
  "kind": "scene-layout",
  "id": "game003",
  "adaptation": {},
  "nodes": [],
  "reels": {},
  "popups": {
    "base-celebration": {
      "type": "award-celebration",
      "manifest": "dependencies/popups/base-celebration/popup.manifest.json",
      "placements": {
        "landscape": { "x": 0, "y": -30, "scale": 1 },
        "portrait": { "x": 0, "y": 20, "scale": 0.9 }
      }
    },
    "free-celebration": {
      "type": "award-celebration",
      "manifest": "dependencies/popups/free-celebration/popup.manifest.json",
      "placements": {
        "landscape": { "x": 0, "y": -30, "scale": 1 },
        "portrait": { "x": 0, "y": 20, "scale": 0.9 }
      }
    }
  },
  "gameModes": {
    "initialMode": "BaseGame",
    "modes": [
      {
        "id": "BaseGame",
        "nodeStates": { "bg": "BG" },
        "awardCelebrationPopup": "base-celebration"
      },
      {
        "id": "FreeGame",
        "nodeStates": { "bg": "FG" },
        "awardCelebrationPopup": "free-celebration"
      },
      {
        "id": "BonusGame",
        "nodeStates": { "bg": "BG" },
        "awardCelebrationPopup": "base-celebration"
      }
    ]
  }
}
```

示例中的空 `adaptation/nodes/reels` 只省略无关内容，不是合法完整 fixture。测试和文档的可执行示例
必须使用完整合法 manifest。

严格规则：

- mode id 使用现有 Spine state id 等价的 ASCII 规则：
  `^[A-Za-z][A-Za-z0-9_-]*$`，大小写敏感，数组内唯一。
- `initialMode` 必须精确引用一个已声明 mode。
- 每个 mode 必须显式保存 `nodeStates`，没有 stateful node 时写 `{}`，不接受省略、`null`
  或 unknown key。
- `nodeStates` 的 key 必须引用当前 manifest 中 `stateMachine` Spine node；value 必须精确引用该
  node 的稳定状态。普通 image、image-string、single-loop Spine 或未知 node 均失败。
- 为避免模式切换后留下不确定 node 状态，只要 manifest 存在 stateful Spine node，每个 mode
  都必须恰好为全部 stateful node 提供目标状态；不允许部分映射或“未写就沿用上一次”。
- `initialMode` 的每个 `nodeStates` value 必须等于对应 node state machine 的
  `initialState`，保证 runtime 初始化 snapshot 与业务模式一致。
- `awardCelebrationPopup` 省略表示该 mode 明确没有获奖庆祝；一旦存在，必须引用 `popups`
  中已声明 binding，且 type 必须为 `award-celebration`。
- `popups` 可以有一项或多项；binding id 唯一、lowercase scene identifier，第一版一个 binding
  对应一个 popup package id，binding id 必须等于 nested `popup.manifest.json` 的 `id`。
- 同一个 popup binding 可被多个 mode 引用；bytes 与 player resource 不复制。
- 没有 mode 引用的 popup binding 是 orphan production dependency，manifest parser 或 package
  closure 校验必须拒绝。编辑器资源库可以暂存未引用 popup，但导出时必须排除；项目不能因资源库
  有未引用素材而被迫导出 orphan。
- `BounsGame` 不作为 `BonusGame` 的 alias，也不做拼写纠正；id 永远按用户明确输入保存。新项目
  示例和文档使用正确拼写 `BonusGame`。
- parser 继续递归拒绝 unknown key，不保留 `states`、`modesById`、`popupId` 等别名。

### 3.2 新旧 manifest 兼容边界

- rendercore parser 继续接受没有 `gameModes` 的既有 scene-layout v1；其现有 node/reel/popup
  低层 API 行为不变。
- 没有 `gameModes` 的 runtime 调用任何新 game-mode API 时必须明确失败，不把 BaseGame、第一项 popup
  或 node initial state 猜成业务模式。
- Game Layout Editor 新建项目默认创建一个显式 `BaseGame` mode、`initialMode=BaseGame`、
  `nodeStates={}`、无 popup。
- Game Layout Editor 导入旧 layout ZIP 时，如果 manifest 没有 `gameModes`，执行一次明确的 editor
  migration：创建上述 `BaseGame` mode，并在 UI 显示“旧 layout 已升级；导出后将显式保存
  gameModes”。如果存在 stateful node，则该 BaseGame 的 `nodeStates` 从 manifest 中明确声明的
  `initialState` 逐项复制；不能从 animation 文件名、BG/FG 字符串或当前画面猜测。
- 该 migration 只发生在编辑器导入边界，production loader 不做隐式补全；round-trip 测试必须锁定。

### 3.3 popup package 是可复用 dependency，游戏模式只保存引用

Game Layout Editor 的 typed project 从 singular `popupDependency` 改为：

```ts
interface EditorPopupDependency {
  readonly id: string;       // 等于 nested popup manifest id / scene binding id
  readonly files: ReadonlyMap<string, Uint8Array>;
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}

interface EditorGameModeDraft {
  id: string;
  nodeStates: Record<string, string>;
  awardCelebrationPopupId: string | null;
}

interface EditorProject {
  // 保留既有字段
  popupDependencies: Map<string, EditorPopupDependency>;
  gameModes: {
    initialMode: string;
    modes: EditorGameModeDraft[];
  };
}
```

- `Map` key 与 dependency `id` 必须相等。
- 导入新 popup 只加入 dependency library，并初始化所有 active variant 的
  `{x:0,y:0,scale:1}`；不得自动绑定到当前 mode、BaseGame 或全部 modes。
- 同 id 已存在时普通导入必须失败，显示“已存在，可使用替换”；不得静默覆盖、合并或追加随机后缀。
- 替换操作必须要求 nested id 相同，先完整 parse/prepare 成功，再原子替换 files；mode 引用、placement
  和当前 UI selection 保持。失败时旧 dependency、preview 和 Blob URL 全部保持。
- 删除被 mode 引用的 popup 必须失败并列出 mode id；用户先把这些 mode 改成“无庆祝效果”或其它 popup。
- clone/transaction/import/export 必须深拷贝全部 `Uint8Array`，不得共享可变 bytes。
- 同一 mode 只允许一个 award celebration，不预留数组、优先级或随机选择。

### 3.4 游戏模式可统一驱动 stateful scene node

`nodeStates` 让游戏模式和现有 Spine 稳态直接关联。shared runtime 只解释“mode id -> node stable
state”，不硬编码 BaseGame/FreeGame/BonusGame、BG/FG 或任何 GMI 字段。

`SceneLayoutPackageRuntime` 新增：

```ts
interface SceneLayoutGameModeSnapshot {
  readonly stableMode: string;
  readonly targetMode: string | null;
  readonly phase: "stable" | "transitioning";
}

getGameModeIds(): readonly string[];
getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
requestGameMode(modeId: string): Promise<void>;
startAwardCelebrationForCurrentMode(input: {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}): void;
requestAdvanceAwardCelebration(): void;
dismissActiveAwardCelebrationImmediately(): void;
getActiveAwardCelebrationSnapshot(): AwardCelebrationSnapshot | null;
```

行为固定为：

- runtime init 后 `stableMode=initialMode`；所有 node 已处于该 mode 声明的 initial stable state。
- 请求当前 stable mode 立即 resolve，不 replay node loop，不重启 popup。
- 请求未知 mode、transitioning 时并发请求、或 popup 正在播放时切 mode，全部立即失败。
- `requestGameMode()` 在启动任意 node transition 前先原子 preflight：每个 stateful node 的当前稳定状态
  到目标状态必须相同或存在 manifest 明确的直接有向 transition。任一不满足时不得启动任何 node。
- preflight 通过后，各 node transition 在同一调用边界并行启动；全部完成且都进入目标稳定 loop 后，
  才原子提交 `stableMode=target` 并 resolve。期间 snapshot 为 transitioning。
- destroy 必须 reject 未完成的 mode request，并清理全部 node/popup player；不得留下 pending Promise。
- 每个 package runtime 同时最多一个 active award celebration。start 时当前 mode 未绑定 popup、正在 mode
  transition、另一个 popup 仍 active、bet/win 非合法 safe integer，均明确失败。
- Replay 不是 production start 的隐式行为。Editor 的“开始庆祝 / 重新播放”按钮可以显式先调用
  `dismissActiveAwardCelebrationImmediately()`，再调用 start；游戏 orchestration 则自行决定何时清理上一局。
- Advance 只作用于当前 active popup；没有 active popup 时明确失败，不能静默忽略。
- `update(deltaSeconds)` 继续同时推进 scene nodes、reel 和所有 active/ending popup；金额播放不能冻结背景、
  symbol 或其它 scene animation。
- 保留现有 `getAwardCelebrationPopup(id)` 作为低层兼容 API；新 game-mode API 是 production game 的推荐入口。

若现有 node runtime 没有无副作用的 transition preflight API，应在 rendercore 内新增通用
`canRequestNodeState` / validator 并由 node API 与 game-mode API 复用；不得在 package runtime 复制
Spine transition 查找或根据 animation 名称猜测。

### 3.5 Preview 使用 production package runtime

- `LayoutPreview.setLayout()` 只要 manifest 需要 package-level 能力（`symbolPackage`、`popups`
  或 `gameModes` 任一存在），就创建 `SceneLayoutPackageRuntime`。新 Game Layout Editor 项目因为总有
  `gameModes`，正常 preview 应统一使用 package runtime。
- 没有 symbols binding 时调用 `packageRuntime.init()` 不传 reels；不能制造空 symbol package 或 fixture reel。
- 有 symbols binding 时继续沿用现有本地公开轮带 scene/local phase 合同，不改变随机预览。
- runtime 切换使用 request token；快速修改项目、替换 popup 或销毁 app 时，晚到的 prepare 必须被销毁，
  不得覆盖新 preview。
- preview 游戏模式下拉框只列 manifest 的显式 mode ids，默认选 initialMode；切换时调用
  `requestGameMode()`，切换期间禁用 mode、Play/Replay 与 popup binding 编辑。
- 显示 `stableMode/targetMode/phase`、当前 mode 绑定 popup id（或“无庆祝效果”）、当前 popup tier/
  segment/player snapshot；不能只显示“已开始”而没有可诊断状态。
- bet/win 是 preview session-only input，默认分别为 `100`、`6000`，必须是 finite safe integer，
  bet > 0、win >= 0。它们不进入 editor project、layout manifest 或 ZIP。
- 点击“开始庆祝 / 重新播放”时显式清理 active popup 后从金额 0/sequence 起点重播当前 mode 的 popup。
- Advance 与 production player 一致；另提供“立即清理”便于测试和切 mode。不要新增另一套暂停、seek、
  随机 tier 或测试专属 runtime 语义。

### 3.6 UI 工作流

把当前一次性 popup drawer 整理为可持续编辑的两个区域，保持右侧 preview 始终可见：

1. `游戏模式`区域：
   - 模式列表、当前 mode、initial 标记、添加、重命名、删除；
   - mode id 精确输入与即时诊断；
   - 每个 stateful Spine node 一个稳定状态 select；
   - 一个“获奖庆祝”select，候选为“无”加全部已导入 popup id；
   - 删除 initial mode 前必须先选择其它 initial mode；至少保留一个 mode；
   - 重命名模式原子更新 initial 引用和 preview selection；不修改 node state id 或 popup id。
2. `Popup dependencies`区域：
   - 导入 Popup ZIP、列出 id/type/designViewport/文件数/总 bytes/被哪些 mode 引用；
   - 每个 active responsive variant 编辑 root x/y/scale；
   - 显式替换、删除；
   - 只读提示“内部 tier/layer/金额格式请回 Popup Editor 修改”。

新项目至少创建 `BaseGame`。UI 可提供“添加 FreeGame / BonusGame”的快捷建议值，但必须走同一合法 id
校验和普通新增命令，不能硬编码三种模式为固定枚举。导入项目完全以 manifest 为准，不额外塞入
FreeGame/BonusGame。

UI 控件必须从 store snapshot 重建或同步，导入 layout、撤换 popup、切 mode 后不得继续显示初始化时
写死的 placement 或旧 id。DOM listener 不得因 rerender 重复注册；session-only selection 与 production
project 分离。

### 3.7 最终 ZIP 精确闭包

`exportLayoutZip()` 的 popup 输入改为按 popup id 索引：

```ts
readonly popupFilesById?: ReadonlyMap<
  string,
  ReadonlyMap<string, Uint8Array>
>;
```

导出过程：

1. 从 typed project 生成并 strict parse manifest。
2. 从 `gameModes.modes[*].awardCelebrationPopup` 派生实际引用 popup id 集合。
3. 为每个引用 id 找到 manifest `popups[id]` 与 `popupFilesById.get(id)`；id、nested manifest id、
   dependency 目录三者必须相等。
4. 对每个 nested popup 调用 rendercore 的 `collectPopupPackagePaths()`，只增加
   `dependencies/popups/<id>/` 前缀，bytes 原样复制；不重新 hash、不改写 nested manifest、
   VNI、atlas 或 image-string。
5. 多个 mode 引用同一 popup 时只 vendor 一份。
6. 未被任何 mode 引用的 editor popup resource 不进入 manifest/ZIP；导出反馈报告排除数量。
7. 最终调用 `collectSceneLayoutPackagePaths()` 对完整 layout closure 做 exact equality；missing、orphan、
   path traversal、case/NFC collision、id mismatch、unknown key 均失败。
8. deterministic ZIP 同一 project/bytes 连续导出必须逐字节相等。

导入 layout ZIP 时按 manifest `popups` 逐个提取 prefix、严格重验 nested closure、深拷贝到
`popupDependencies`，然后重建 gameModes 引用。不能按目录枚举猜 popup，也不能保留 unreferenced
`dependencies/popups/**`。

### 3.8 Ownership 与禁止事项

```text
apps/popupeditor
  popup 内部资源、五档 tier、layer、金额、播放段与 standalone popup ZIP

apps/gamelayouteditor
  popup dependency library、游戏模式 draft、mode->popup/node-state 绑定、placement、UI、preview 编排、layout ZIP IO

packages/rendercore/popup
  popup parser、闭包、prepare、真实播放器、金额/点击/dismiss/end drain/snapshot

packages/rendercore/scene-layout
  layout/gameModes parser、模式切换、popup package 组合、viewport placement、production public API

game app
  根据业务事件请求明确 mode，提交 bet/win，驱动 update/advance/cleanup
```

禁止：

- Game Layout Editor 编辑或覆盖 popup 内 threshold、tier、layer、ImgNumber、VNI/Spine animation。
- scene-layout/rendercore 硬编码 BaseGame、FreeGame、BonusGame、BG、FG、game002、game003、GMI、
  component name 或服务端字段。
- game app 解析 `dependencies/popups/**`、复制 root placement、直接操作 popup Pixi child/Spine track/
  VNI timeline。
- 用 popup 文件名、唯一候选、当前背景 animation 或 mode 名猜绑定。
- 缺 popup、缺 mode、缺 transition 时使用第一个 popup、图片、字体、空动画、旧 win-amount 或静默 no-op。
- 把 preview bet/win、当前 selection、zoom、guides、active popup snapshot 写入 ZIP。
- 为了测试方便增加 production fallback、放宽 parser、吞异常或改出两套 runtime。

## 4. 实施步骤

### 阶段 A：保护现场与建立基线

1. 执行并记录：

   ```bash
   git branch --show-current
   git rev-parse --short HEAD
   git status --short
   node --version
   pnpm --version
   ```

2. 仓库要求 Node `>=24.0.0`。若 shell 中没有 `node` 或当前版本不满足要求，执行：

   ```bash
   nvm use 24
   node --version
   pnpm --version
   ```

   后续全部命令统一使用这次 `nvm use 24` 环境自带的 Node、corepack/pnpm；不要强制安装、降级、
   升级或改写 `packageManager`/engines 来迁就当前 shell。

3. 工作区若有修改或 untracked 文件，全部视为用户输入。禁止 reset、checkout 覆盖、stash、clean、
   删除或批量 format 无关文件。
4. 先运行当前 scoped baseline，记录已有失败，避免把旧问题归因到本任务：

   ```bash
   pnpm --filter @slotclientengine/rendercore test
   pnpm --filter gamelayouteditor test
   pnpm --filter popupeditor test
   ```

### 阶段 B：扩展 strict scene-layout schema

1. 在 `packages/rendercore/src/scene-layout/types.ts` 增加 gameModes 类型与 runtime snapshot/API。
2. 在 manifest parser 增加 `gameModes` unknown-key allowlist、严格解析、唯一性、initial 引用、
   stateful node 完整映射、initial state 对齐、popup 引用与 popup orphan 校验。
3. 把 `parsePopupBindings()` 从“恰好一个”扩展为一个或多个；保持每项 active variant placement 完整、
   path canonical、type strict，并校验 binding id = nested package id 的跨 package 条件。
4. 更新 asset/package closure，让多 popup 只按 manifest 精确收集；相同 dependency 不重复 prepare/bytes。
5. 为 legacy v1 无 gameModes 情况保留 parse/load 行为，但锁定新 API 明确失败。

### 阶段 C：实现 game-mode package runtime

1. 在 package runtime 初始化 current mode snapshot；验证 initial node states。
2. 从现有 node state controller 提取/公开无副作用 transition preflight，避免复制 transition 查找。
3. 实现 `requestGameMode()` 的 preflight、并行 transition、完成边界、并发拒绝、destroy rejection。
4. 实现当前 mode popup resolver、单 active popup 生命周期、start/advance/immediate dismiss/snapshot API。
5. 保留低层 `getAwardCelebrationPopup(id)` 兼容入口；为推荐 game-mode API补齐 JSDoc 和文档示例。
6. 验证统一 ticker 在 popup 播放期间继续更新 layout node 和 reel。

### 阶段 D：迁移 Game Layout Editor typed project 与命令

1. 把 singular popup draft 迁移为 `popupDependencies` + `gameModes`。
2. 新增纯 model/resource commands：add/rename/delete/set initial mode、设置 node state、绑定/解绑 popup、
   import/replace/delete popup、设置 placement。
3. 所有命令通过 store transaction 原子提交；失败时 revision、selection、bytes、preview 均不变。
4. 更新 clone、validation、manifest materialization、manifest import 和 legacy editor migration。
5. 更新 project workspace diagnostics，列出 invalid mode、未配置 node state、未知 popup、被引用 popup、
   unreferenced editor popup 等具体问题。

### 阶段 E：多 popup 导入、导出与 round-trip

1. 保留 `importPopupPackageZip()` bounded strict 校验，并增加供 replace 使用的 prepare/identity 检查。
2. 修改 export API 为 `popupFilesById`，按 mode 引用集精确 vendor。
3. 修改 layout ZIP import，逐个重建 popup dependencies 与 gameModes。
4. 确认 nested package 只增加目录前缀，bytes 不改写；多 mode 共用一份 dependency。
5. 锁定 deterministic export、精确 closure和旧 layout migration round-trip。

### 阶段 F：重做游戏模式、popup dependency 与 preview UI

1. 用 store-driven markup 替换当前初始化时写死的 singular popup drawer。
2. 实现游戏模式列表、initial、增删改、stateful node mapping 与 popup select。
3. 实现 popup dependency card、引用列表、variant placement、replace/delete。
4. preview 默认设置 `100/6000`，模式下拉默认 initialMode，并显示 mode/popup snapshot。
5. 修复 package runtime 选择条件，确保“有 popup、无 symbols package”可以真实 prepare/play。
6. Replay 显式 immediate dismiss 后 start；mode transition 与 popup active 时按合同禁用/失败。
7. 保持 viewport resize、zoom、guides、symbols random preview 与 otherScene preview 原有行为不回归。

### 阶段 G：文档、agents 约束与 production 示例

1. 更新 `docs/scene-layout-manifest.md`：gameModes schema、严格引用、模式切换 API、多 popup closure、
   legacy 边界与完整 production 示例。
2. 更新 `docs/popup-manifest.md`：说明 popup package 本身不拥有游戏模式，layout 负责 mode 绑定。
3. 更新 `apps/gamelayouteditor/README.md`：端到端导入、配置、`100/6000` 预览、导出、重导入步骤。
4. 本任务会改变长期 ownership 和 package 合同，因此需要同步更新根 `agents.md`：明确 Game Layout
   Editor 拥有 generic game-mode binding，rendercore scene-layout 拥有 mode runtime，popup 内部仍归
   popupeditor/rendercore popup；不得把具体 mode 名写进 shared code。
5. 如仓库有 package README/index exports，补齐类型/API export；不新增第二份 manifest 文档。

## 5. 测试计划

### 5.1 RenderCore 单元测试

至少覆盖：

- 合法 BaseGame/FreeGame/BonusGame，多 mode 分别绑定、多 mode 共用同一 popup、mode 无 popup。
- mode id 非法/重复、initial 缺失、unknown key、未知 popup、popup orphan。
- nodeStates 未覆盖全部 stateful node、引用普通 node、未知 stable state、initial mapping 不匹配。
- popups 0/1/N 项、binding/path/nested id mismatch、missing/orphan/case/NFC/traversal。
- 无 gameModes legacy manifest 仍可 parse/低层运行，新 mode API 明确失败。
- request 当前 mode no-op；未知 mode、缺 direct transition、transition 中并发、popup active 时切 mode失败。
- 多 node preflight 任一失败时所有 node 均未启动；成功时同边界启动并在全部稳定后 resolve。
- destroy 中断 mode transition/popup 时 Promise、player、container 和资源全部排空。
- 当前 mode start 使用正确 popup；无绑定、重复 start、非法 bet/win、无 active Advance 显式失败。
- popup 播放时 background/reel update 仍推进。
- files loader 与 URL loader 对多 popup 使用相同 exact closure 和严格校验。

### 5.2 Game Layout Editor model/IO 测试

至少覆盖：

- 新项目显式 BaseGame；add/rename/delete/set initial 的引用更新与拒绝条件。
- 每 mode state mapping 与 popup binding manifest round-trip。
- 两个 mode 共用同一 popup 时只输出一份 dependency。
- 两个 mode 使用不同 popup 时分别精确 vendor；nested bytes 与原 ZIP逐字节一致。
- 未引用 editor popup 不导出；删除被引用 popup 报出 mode ids。
- duplicate id 普通 import 拒绝；same-id explicit replace 保持绑定/placement；错误 replace 原子回滚。
- clone/store transaction 不共享 popup `Uint8Array`。
- layout ZIP 导入恢复全部 popup/mode/placement；legacy 无 gameModes 显式迁移为 BaseGame。
- deterministic export 两次 bytes 相等；missing/orphan/unknown nested files 全部失败。

### 5.3 Preview/UI 测试

至少覆盖：

- 默认 bet `100`、win `6000`、selected mode = initialMode。
- 导入 popup 不自动绑定；mode select 明确绑定后 Play 使用正确 id。
- 无 symbols package 时 popup package runtime 仍初始化并播放，这是本任务的必测回归。
- 切 BaseGame/FreeGame 驱动对应 node state 与 popup；共用 popup 不重建 dependency。
- mode transition/active popup 时按钮状态和错误诊断正确。
- 导入/替换/删除/切项目后控件不保留 stale id/placement，不重复注册 listener。
- page resize、orientation variant、placement 相对 viewport center；popup 内部坐标不被修改。
- rapid refresh 与 destroy 清理晚到 runtime/resource/Blob URL。
- source-boundary 测试确认 editor 未复制 popup、Spine、VNI、image-string runtime 算法。

### 5.4 集成与人工浏览器验收

自动化 fixture 必须自包含，不能依赖用户本机某个 popup ZIP。另使用 Popup Editor 实际导出的 package 做人工验收：

1. `pnpm --filter popupeditor dev` 导出一个合法 bigwin popup ZIP。
2. `pnpm --filter gamelayouteditor dev` 新建 layout 并导入该 ZIP。
3. 新建/选择 `BaseGame`、`FreeGame`、`BonusGame`（或项目实际 BG/FG id），分别配置同一或不同 popup。
4. 在 preview 切 mode，确认 node state 完成切换后显示 stable snapshot。
5. 保持默认 bet `100`、win `6000`，点击“开始庆祝”，目视确认真实 image/VNI/Spine/ImgNumber
   渲染、金额递增、tier 跳转、Advance 和 dismiss。
6. 切 landscape/portrait 或 page size，确认 popup root 按各 variant 的 viewport center placement 重定位。
7. 导出 layout ZIP，检查只含精确 closure；重新导入并重复步骤 4-6。
8. 用文档中的 production package runtime 示例加载该 layout，`requestGameMode()` 后调用
   `startAwardCelebrationForCurrentMode()`，确认游戏端不需要 popup id 或内部资源路径。

人工验收必须记录浏览器、viewport、所用 popup package id、mode mapping、bet/win 与结果；若执行环境没有
真实 GPU/浏览器，可在报告中明确列为待用户执行，但自动化、build 与 package round-trip 不能因此跳过。

## 6. 命令与验收门槛

优先执行 scoped 命令：

```bash
pnpm --filter @slotclientengine/rendercore test
pnpm --filter @slotclientengine/rendercore typecheck
pnpm --filter @slotclientengine/rendercore lint
pnpm --filter @slotclientengine/rendercore build
pnpm --filter @slotclientengine/rendercore format:check

pnpm --filter gamelayouteditor test
pnpm --filter gamelayouteditor typecheck
pnpm --filter gamelayouteditor lint
pnpm --filter gamelayouteditor build
pnpm --filter gamelayouteditor format:check

pnpm --filter popupeditor test
pnpm --filter popupeditor typecheck
pnpm --filter popupeditor lint
pnpm --filter popupeditor build
pnpm --filter popupeditor format:check
```

再执行根级回归：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
pnpm exec turbo run test --concurrency=1
git diff --check
```

根测试使用单并发是为了避开多个 app 同时重建 shared `dist` 的已知竞争，不得用它掩盖 scoped failure。

若依赖尚未安装或 lockfile 需要正常注册 workspace，先用当前 Node 24 环境执行 `pnpm install`。下载失败时
再使用用户指定代理：

```bash
export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
pnpm install
```

不要把代理写进仓库配置、shell profile、`.npmrc`、lockfile 或源码。若代理本身不可用，在报告记录原始错误，
不要通过修改依赖版本、关闭校验或 vendoring node_modules 绕过。

测试失败处理原则：

- 先判断是 production bug、测试期望过时、fixture 不合法、环境限制还是 shared dist 并发竞争。
- production 行为与本计划合同一致而旧测试仍要求 singular popup、`5000` 默认值或隐式 fallback 时，修改测试。
- 如果测试迫使代码出现重复 runtime、吞异常、`as any`、延时等待、默认第一个 popup、放宽 parser 等奇怪写法，
  应修正测试/fixture，而不是污染 production。
- 不降低 coverage threshold，不排除新文件，不用 `.skip/.only`，不把失败断言改成宽泛 truthy。
- 不修改与任务无关的 game002/game003 业务逻辑、真实轮带、YAML/generated 文件或旧 win-amount production
  路径，除非本任务接入点确实需要且有对应回归测试。

## 7. 完成定义

只有同时满足以下条件才能宣称完成：

1. Popup Editor 导出的合法 ZIP 可被 Game Layout Editor 严格导入；非法、缺失、多余、错版本 package
   在 project mutation 前失败。
2. layout 显式保存至少一个游戏模式；每个 mode 可选择无 popup、同 popup 或不同 popup。
3. mode 与全部 stateful Spine node 的稳定状态绑定完整、严格，并由 package runtime 统一切换。
4. preview 可选择 mode，默认输入严格为 `100/6000`，无 symbols package 时也能播放真实 popup。
5. preview 的 Play/Advance/dismiss、viewport placement 与 snapshot 符合 production runtime。
6. 最终 layout ZIP deterministic、自包含、精确闭包；多 mode 共用 popup 只存一份，未引用 popup 不导出。
7. layout ZIP 重新导入后 mode/popup/placement/bytes 无损恢复并可再次预览导出。
8. production 文档示例只需 mode + bet/win 即可启动当前庆祝，不要求游戏知道 nested popup path。
9. scoped 与根级测试/typecheck/lint/build/format/diff check 全部通过，或仅有报告中可复现、与本任务无关
   且已有明确证据的环境阻塞；不能把真实功能失败标为环境问题。
10. `agents.md`、README 和 manifest 文档与最终实现一致。
11. 已生成中文 UTC 任务报告，列出修改文件、schema/API 决策、命令结果、人工验收、未完成项和风险。

## 8. 任务报告内容

最终报告至少包含：

- 执行时 branch、起止 HEAD、初始/最终 `git status --short`、Node、pnpm。
- 最终 gameModes / popups schema 与 legacy migration 说明。
- rendercore 新 production API及状态切换/active popup 语义。
- Game Layout Editor 的模式、popup dependency、preview 与 ZIP 工作流。
- 精确闭包、deterministic export、same-popup reuse 的验证证据。
- scoped 与根级每条命令的结果、测试数量和任何 warning。
- 浏览器人工验收所用 package/mode/bet/win/viewport 与结果；未执行时给出可直接复现步骤。
- 是否使用 `nvm use 24`、是否使用代理、依赖下载是否失败。
- 是否修改 `agents.md` 及修改原因。
- 所有剩余阻塞、已知风险和明确未做范围；不得把 fixture 或 fallback 描述成 production 完成。

