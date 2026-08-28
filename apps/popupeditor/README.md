# Popup Editor

纯前端 strict `award-celebration`、普通 `spine` 与 `single-state` popup package 编辑器。

资源 tab 只有一个支持多文件/多 ZIP 的“导入资源”入口，识别 image、WOFF2/WOFF/TTF/OTF 字体、official Spine 4.3、VNI、standalone ImgNumber ZIP 和 Popup ZIP。字体会校验扩展名与文件签名。所有 closure 在提交前结构化抹平为 filename keys，普通导入只入库；layer/tier 仍由用户显式绑定。

VNI bundle 只导入 `purpose=runtime` 的运行发布包：唯一 runtime 自动选中；只有声明多个 runtime 时才显示下拉选择，不允许手输 profile id。`purpose=editing` 的完整编辑备份不会作为候选，也不会进入资源库；最终只提交所选 runtime project 与精确 assets。`.DS_Store`、未知、orphan、缺失和歧义输入不会被忽略。

同名不同 bytes 默认覆盖，review 显示 hash、bytes、动作和受影响 layer；全项目校验或 preview prepare 失败会完整回滚。不存在文件夹入口、任意 logical resource id 或独立 dependency bytes 区。

新建项目与新导出的 `<id>-popup.zip` 固定使用 Popup v9。默认 loader 接受全部受支持的 v1–v9，先 strict 校验 source，再统一规范化并复验为 latest v9。v8 新增的 `single-state` 继续可保持零图层，也可组合 image、字体文字、ImgNumber、Spine 与 VNI，Spine/VNI autoplay 均可省略。合法 v1–v8 文字层在升级时补入 `widthRange: { minWidth: 0, maxWidth: 0 }`，保持旧视觉不变。

`single-state` 图层的 exact `id` 同时是 Editor name、runtime lookup name 和 Game Layout 地址 segment。父节点只能选择同一 Popup 中已经存在的 Spine exact slot，或由 ImgNumber 选择已经存在的 VNI 文字层；不提供主 Spine fallback。runtime 通过 `getLayer(name)` 取得 borrowed `RenderObject`，通过 `getTextNode(name)` / `getImageStringNode(name)` 修改文字。

普通 Spine 类型不再提供独立 prompt authoring；提示语与其它文案一样使用命名的字体文字 overlay。旧 v1/v2 prompt 在导入边界自动结构化迁移为 `name=prompt` 的文字层，名称、order 或资源冲突会使整次导入失败。可追加任意数量 image、字体文字、ImgNumber、Spine 或 VNI overlay，编辑其位置、缩放、旋转、order 及各类型 playback/项目状态可见性。

所有获奖档位与普通 Spine overlay 都可添加多个命名字体文字和 manual ImgNumber。字体文字可明确选择已导入的 WOFF2/WOFF/TTF/OTF；未选择资源时才使用 `system-ui, sans-serif`。文字支持单行默认文案、字号、字距、色板或 canonical color string、纯色/线性渐变、描边、投影、正负 Curved Text、anchor 与旋转；还可配置 local typographic `minWidth/maxWidth`，`0/0` 表示关闭，启用时 runtime 只调字号使文字落入区间。普通 Spine overlay 还可编辑三阶段可见性。每个获奖档仍必须恰好有一个 exact id 为 `win-amount` 的 ImgNumber，再次添加 ImgNumber 会创建可独立命名和设值的 manual 节点。游戏通过 exact layer name 获取 rendercore handle 并原子 `setText()/resetText()`；Editor 预览不提供临时节点覆盖入口。

production preview 使用与 runtime 相同的无界 maximized-focus transform：重点区域始终完整可见，宿主宽高比所需的额外空间以 focus 几何中心向外扩展，宿主 placement 再叠加到该矩阵。预览 canvas 后方的颜色持续按红、蓝、黄、绿循环，只用于观察适配和全屏 backdrop，不进入 project、manifest 或 ZIP。guides 开启时，启用 `widthRange` 的文字上方显示蓝色 max、黄色 min 两个完整粗框和静态斜线；线宽按当前 preview scale 补偿，关闭 guides 后连同 viewport、中心和重点区域参考线一起立即移除，所有 guide 都不持久化。production canvas/keyboard binding 仍负责 award advance 与 Spine dismiss，但 input、textarea、select、button 和 contenteditable 的键盘事件会透传，不再阻止表单输入。

authoring 的文字、数字与颜色输入在一次字段编辑完成并产生原生 `change` 后才提交 project；连续键入或拖动 color picker 只更新当前 DOM，不逐字符 materialize package。select、checkbox 与结构按钮仍在完成选择/点击后提交。合法 commit 会在短合并窗口后自动 rebuild 最后一个 snapshot，invalid commit 保留上一份成功 preview 并显示 diagnostics；viewport、zoom、guides、preview bet/win 与金额格式继续直接更新 session，不 rebuild player。`Play / Replay` 只播放或重播已准备好的 production player，不是 Build 按钮。

项目页的 `project id` 在输入时即时执行与 production manifest 相同的 lowercase kebab-case 校验，非法值显示红框与就地错误，preview/export 仍严格拒绝。按钮统一提供 hover、按下、键盘 focus 和 disabled 反馈；顶部 tab 与档位 tab 另外保留明确选中态。

VNI 图层可显式选择“分段循环”或“完整单次”。分段模式编辑 start/loop/end 边界；
完整单次模式从 `0` 到 VNI 总时长非循环播放，动画先于金额阶段结束时保持 authored
最后一帧，到跨档或关闭 Popup 才隐藏。两种模式使用互斥字段，未知或残留字段会阻止
preview/export。

每个 image、字体文字、ImgNumber、VNI 或 Spine 图层都可先选择当前作用域内的 Spine 目标，再选择该 skeleton 的 exact slot；普通 Spine Popup 还可选择主 Spine。award 目标限定在同档位，普通 overlay 目标限定在同一 Popup。目标 slot 内可同时挂图片背景、文字和 ImgNumber，`order` 只比较同一父节点下的兄弟；局部 transform 会跟随 slot bone、颜色和 draw order。循环引用、失效 target/slot、同父 order 冲突以及覆盖资源后 slot 消失都会阻止提交，删除仍被引用的 Spine layer 也会被拒绝。

ImgNumber 图层还可显式选择同档 VNI 的文字占位层。选择文字层后，`x/y/scale/anchor` 相对该层编辑并跟随其动画；候选从严格校验的 VNI project 枚举，目标缺失或替换后失效会阻止 preview/export，不会自动换到其它文字层或根节点。

预览区可单独设置 ImgNumber 的固定小数位数（默认 `0`，范围 `0..6`）和千位分隔
（默认关闭）。预览 raw 金额按整数单位显示：例如 raw `1234567` 配置两位小数与分组后
显示 `1,234,567.00`；小数点固定为 `.`，分组符固定为 `,`。设置只属于当前页面会话，
不会写入 project、manifest 或 Popup ZIP，也不会由导入恢复；启用的符号缺少对应 glyph 时
preview 会显式失败。

运行：`pnpm --filter popupeditor dev`
