# Shared game runtime rules

本文件适用于 `packages/logiccore`、`packages/rendercore`、`packages/gameframeworks`、`packages/uiframeworks` 及消费这些能力的游戏 app。

## 依赖与职责

- `packages/gameframeworks` 是后续游戏默认 facade，整合 UI、网络、logic 数据流和 production scene-layout API。
- `packages/logiccore` 只拥有通用 server round/component/result/otherScenes 解析、索引校验、strict profile 和不可变 execution plan；业务 component、symbol 和金额语义由 app 注入。
- 所有配置驱动 round 必须在任何画面 mutation 前完整编译。component role、remove/drop/value/sequential companion policy 只能来自 strict versioned profile，并按 active symbol package 大小写精确校验。
- `packages/rendercore` 的 capability-driven coordinator 是 standard/grid-cell、base/cascade 的共享编排入口，负责 initial、win、remove、dropdown、refill、sequential collect、completion 和 cleanup 边界。
- symbol package 到 reel registry 的 catalog/value-controller 适配属于 rendercore；
  game app 不从 package bytes 重建 asset 表。layout/background/popup 与 app-owned reel
  组合时使用 rendercore presentation surface，不复制 scene-layout visibility、placement
  或 popup lifecycle。
- 游戏 app 只保留业务 component/value/result resolver、formatter、layout、anticipation 和 typed extension；不得复制 Pixi、Spine、reel、cascade 或 popup 状态机。

## Reel 与 server 数据边界

- 客户端 spin 始终使用本地公开轮带。服务器 scene 只覆盖本轮临时 strip 的可见落点窗口；scene 无法反查本地 stop 时不得失败。
- 不读取、缓存、输出或推断服务器真实轮带，也不消费服务器 randomNumbers 作为本地视觉随机源。
- `otherScenes` 是变化数据：业务 component 触发但 auxiliary matrix 未变化时可以没有 update。logiccore 不强制每个 component 恰好一份，app 负责区分可推导省略和不可推导的新值。
- `renderPriority` 只允许非负安全整数，默认 `0`；只影响 Pixi display order，不改变 scene、stop、result、state、金额或点击逻辑。同优先级保持默认稳定顺序。

## Symbol、Spine 与 image-string

- symbol manifest parser、animation resolver、VNI/official Spine adapter、resource closure、player lifecycle、裁切和 pooling 属于 rendercore。
- app/viewer 只能传 manifest、显式 modules、resolver 和 validator；禁止根据 symbol code 写共享分支或直接操作 player/display tree。
- official Spine Pixi runtime 当前只支持 `4.3.x`。atlas、skeleton、animation 名和版本大小写精确校验；不得恢复 3.8/4.2 adapter 或手写兼容层。
- normal/win/appear 共享相同 Spine resource 时复用 player，只切换语义 animation；资源、value/tier 或 symbol 真实变化时才按合同重建。
- image-string parser、Unicode code-point layout、glyph exact closure、natural/fixed advance、动态 `visualBounds` anchor 和 `setText()` 生命周期属于 rendercore。缺 glyph、slot、resource 或 binding 显式失败，不回退字体、占位图、glob 或路径猜测。
- value presentation 使用 strict `font | image | image-string` union；Spine slot attach 通过外层 wrapper 跟随 bone matrix，内部 display 保留自身 offset/scale/pivot。

## Background、viewport 与 UI

- rendercore 拥有通用 art-size、focus-rect、visible viewport、background manifest/resource resolver、Spine state machine 和完整 art clip 算法；app 只配置 art、focus、resource 和显式 state。
- `packages/uiframeworks`/`gameframeworks` 拥有 DOM frame、canvas 逻辑尺寸上限、黑边居中和 viewport resize policy；app 不以私有 CSS/DOM resize 绕过。
- background、symbol 和 popup 复用官方 runtime、manual update、completion 和 destroy 底层；不得增加静态图、首帧或默认 animation fallback。

## Presentation

- rendercore 拥有通用 symbol win carousel、金额递增、big/super/mega tier、segmented VNI 播放、popup threshold sequence、点击/advance/dismiss/end drain 和 runtime snapshot。
- component 名、amount resolver、formatter、样式和业务阻塞边界由 app 传入；shared code 不维护游戏专属金额或 symbol 规则。
- win-amount 进入 `awaiting-dismiss` 后不得继续阻塞 `playSpin()`；下一次 spin 负责清理遗留展示。
- reel runtime 在金额或 popup 播放期间仍需逐帧 update，不能冻结 active Spine/VNI loop。

## Scene layout 与生成配置

- rendercore 拥有 strict scene-layout manifest parsing、exact asset closure、named-node attachment、focus/reel geometry、variant application、mode-aware visibility 和 production runtime。
- `columnGap`/`rowGap` 等 manifest geometry 必须一致作用于 standard/grid-cell reel、mask、effect、cascade 和 geometry snapshot。
- 游戏静态 YAML 只承载可发布的美术和静态配置，不承载 token、cookie、服务器真实轮带或本轮下注。
- YAML 保留中文注释说明字段用途和坐标基准；注释不作为构建逻辑。
- `game-static.generated.ts`、`game-loading.generated.ts` 等生成物由对应构建工具生成，修改 YAML 后同步生成并执行 `--check`。
