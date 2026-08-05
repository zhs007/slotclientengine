# Popup Editor

纯前端 strict `award-celebration` 与普通 `spine` popup package 编辑器。

资源 tab 只有一个支持多文件/多 ZIP 的“导入资源”入口，识别 image、WOFF2/WOFF/TTF/OTF 字体、official Spine 4.3、VNI、standalone ImgNumber ZIP 和 Popup ZIP。字体会校验扩展名与文件签名。所有 closure 在提交前结构化抹平为 filename keys，普通导入只入库；layer/tier 仍由用户显式绑定。

VNI bundle 只导入 `purpose=runtime` 的运行发布包：唯一 runtime 自动选中；只有声明多个 runtime 时才显示下拉选择，不允许手输 profile id。`purpose=editing` 的完整编辑备份不会作为候选，也不会进入资源库；最终只提交所选 runtime project 与精确 assets。`.DS_Store`、未知、orphan、缺失和歧义输入不会被忽略。

同名不同 bytes 默认覆盖，review 显示 hash、bytes、动作和受影响 layer；全项目校验或 preview prepare 失败会完整回滚。不存在文件夹入口、任意 logical resource id 或独立 dependency bytes 区。

新导出的 `<id>-popup.zip` 由根 `popup.manifest.json`、`assets.map.json` 和完整 SHA-256 payload 构成。普通 Spine 类型接收一组 JSON、atlas 与若干 PNG，并显式配置 start、loop、end 动画；点击在 loop 边界生效。runtime parser 与两类播放生命周期均由 `rendercore/popup` 拥有。

普通 Spine 类型还可配置一个单行点击提示：字体默认使用 rendercore 的 `system-ui, sans-serif`，不会写入资源表或 ZIP；显式选择 package 字体时才携带 WOFF2/WOFF/TTF/OTF。默认文案、颜色、order 与渲染区域均可编辑，预览文案可临时覆盖，留空时显示默认文案；游戏 runtime 可传入已翻译 string。字号以区域高度起步并按区域等比缩小，不换行。可追加任意数量 image、系统文字、ImgNumber、Spine 或 VNI overlay，编辑其位置、缩放、旋转、order 及各类型 playback/可见 segment。

所有获奖档位与普通 Spine overlay 都可添加多个命名系统文字和 manual ImgNumber。系统文字支持单行默认文案、字号、字距、纯色/线性渐变、描边、投影、正负弧度、anchor、旋转与 segment；导入字体后直接作为 text layer 添加。每个获奖档仍必须恰好有一个 `win-amount` ImgNumber，再次添加 ImgNumber 会创建可独立命名和设值的 manual 节点。预览侧栏可按节点 exact name 或各 kind 的零基 index 临时 set/reset string，这些覆盖不写入 ZIP。

项目页的 `project id` 在输入时即时执行与 production manifest 相同的 lowercase kebab-case 校验，非法值显示红框与就地错误，preview/export 仍严格拒绝。按钮统一提供 hover、按下、键盘 focus 和 disabled 反馈；顶部 tab 与档位 tab 另外保留明确选中态。

VNI 图层可显式选择“分段循环”或“完整单次”。分段模式编辑 start/loop/end 边界；
完整单次模式从 `0` 到 VNI 总时长非循环播放，动画先于金额阶段结束时保持 authored
最后一帧，到跨档或关闭 Popup 才隐藏。两种模式使用互斥字段，未知或残留字段会阻止
preview/export。

ImgNumber 图层可显式选择 Popup 根节点或同档 VNI 的文字占位层。选择文字层后，`x/y/scale/anchor` 相对该层编辑并跟随其动画；候选从严格校验的 VNI project 枚举，目标缺失或替换后失效会阻止 preview/export，不会自动换到其它文字层或根节点。

预览区可单独设置 ImgNumber 的固定小数位数（默认 `0`，范围 `0..6`）和千位分隔
（默认关闭）。预览 raw 金额按整数单位显示：例如 raw `1234567` 配置两位小数与分组后
显示 `1,234,567.00`；小数点固定为 `.`，分组符固定为 `,`。设置只属于当前页面会话，
不会写入 project、manifest 或 Popup ZIP，也不会由导入恢复；启用的符号缺少对应 glyph 时
preview 会显式失败。

运行：`pnpm --filter popupeditor dev`
