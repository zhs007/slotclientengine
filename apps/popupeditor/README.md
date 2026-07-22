# Popup Editor

纯前端 strict `award-celebration` popup package 编辑器。

资源 tab 只有一个支持多文件/多 ZIP 的“导入资源”入口，识别 image、official Spine 4.3、VNI、standalone ImgNumber ZIP 和 Popup ZIP。所有 closure 在提交前结构化抹平为 filename keys，普通导入只入库；layer/tier 仍由用户显式绑定。

VNI bundle 声明多个 profile 时必须输入并确认一个有效 profile id，未选或选错会阻断；只提交所选 project 与精确 assets。`.DS_Store`、未知、orphan、缺失和歧义输入不会被忽略。

同名不同 bytes 默认覆盖，review 显示 hash、bytes、动作和受影响 layer；全项目校验或 preview prepare 失败会完整回滚。不存在文件夹入口、任意 logical resource id 或独立 dependency bytes 区。

新导出的 `<id>-popup.zip` 由根 `popup.manifest.json`、`assets.map.json` 和完整 SHA-256 payload 构成。manifest `resources` key 与 layer `resource` 直接使用 image、Spine skeleton、VNI project 或 image-string manifest 的 filename key。runtime 的 parser、五档 threshold、金额格式和播放生命周期仍由 `rendercore/popup` 拥有。

运行：`pnpm --filter popupeditor dev`
