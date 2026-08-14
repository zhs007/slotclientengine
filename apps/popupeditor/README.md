# Popup Editor

纯前端 strict `award-celebration` 与普通 `spine` popup package 编辑器。

资源 tab 只有一个支持多文件/多 ZIP 的“导入资源”入口，识别 image、WOFF2/WOFF/TTF/OTF 字体、official Spine 4.3、VNI、standalone ImgNumber ZIP 和 Popup ZIP。字体会校验扩展名与文件签名。所有 closure 在提交前结构化抹平为 filename keys，普通导入只入库；layer/tier 仍由用户显式绑定。

VNI bundle 只导入 `purpose=runtime` 的运行发布包：唯一 runtime 自动选中；只有声明多个 runtime 时才显示下拉选择，不允许手输 profile id。`purpose=editing` 的完整编辑备份不会作为候选，也不会进入资源库；最终只提交所选 runtime project 与精确 assets。`.DS_Store`、未知、orphan、缺失和歧义输入不会被忽略。

同名不同 bytes 默认覆盖，review 显示 hash、bytes、动作和受影响 layer；全项目校验或 preview prepare 失败会完整回滚。不存在文件夹入口、任意 logical resource id 或独立 dependency bytes 区。

新建项目与新导出的 `<id>-popup.zip` 固定使用 Popup v6，由根 `popup.manifest.json`、`assets.map.json` 和完整 SHA-256 payload 构成。v6 的 award 图层由所在档位决定可见性，不再保存跨档 `visibleStates`；同一 exact id 在不同档表示同一逻辑图层，Editor 可显式把已有逻辑图层复用到当前档并独立编辑配置。普通 Spine overlay 与 backdrop 继续保存类型化状态可见性。导入合法 v1–v5 ZIP 时先完成原版本 strict 校验和资源 prepare，再原子迁移到 v6；后续 preview/export 不再写旧版本。普通 Spine 类型接收一组 JSON、atlas 与若干 PNG，并显式配置 start、loop、end 动画；点击仍在 loop 边界生效。

普通 Spine 类型不再提供独立 prompt authoring；提示语与其它文案一样使用命名的字体文字 overlay。旧 v1/v2 prompt 在导入边界自动结构化迁移为 `name=prompt` 的文字层，名称、order 或资源冲突会使整次导入失败。可追加任意数量 image、字体文字、ImgNumber、Spine 或 VNI overlay，编辑其位置、缩放、旋转、order 及各类型 playback/项目状态可见性。

所有获奖档位与普通 Spine overlay 都可添加多个命名字体文字和 manual ImgNumber。字体文字可明确选择已导入的 WOFF2/WOFF/TTF/OTF；未选择资源时才使用 `system-ui, sans-serif`。文字支持单行默认文案、字号、字距、色板或 canonical color string、纯色/线性渐变、描边、投影、正负 Curved Text、anchor 与旋转；普通 Spine overlay 还可编辑三阶段可见性。每个获奖档仍必须恰好有一个 exact id 为 `win-amount` 的 ImgNumber，再次添加 ImgNumber 会创建可独立命名和设值的 manual 节点。游戏通过 exact layer name 获取 rendercore handle 并原子 `setText()/resetText()`；Editor 预览不提供临时节点覆盖入口。

production preview 使用与 runtime 相同的无界 maximized-focus transform：重点区域始终完整可见，宿主宽高比所需的额外空间以 focus 几何中心向外扩展，宿主 placement 再叠加到该矩阵。预览 canvas 后方的颜色持续按红、蓝、黄、绿循环，只用于观察适配和全屏 backdrop，不进入 project、manifest 或 ZIP。production canvas/keyboard binding 仍负责 award advance 与 Spine dismiss，但 input、textarea、select、button 和 contenteditable 的键盘事件会透传，不再阻止表单输入。文字标量输入就地提交并异步重建 player，不替换当前 inspector DOM。

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
