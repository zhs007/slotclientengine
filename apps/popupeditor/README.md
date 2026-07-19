# popupeditor

纯前端获奖庆祝弹窗编辑器。运行：`pnpm --filter popupeditor dev`。

工作流为：上传资源/文件夹 → import review → 确认 logical resource → 在固定五档中显式添加图层 → Build production preview → 导出 `<id>-popup.zip`。上传不会自动绑定图层。

支持 PNG、完整 VNI 文件组、official Spine 4.3 文件组和 standalone image-string ZIP。普通文件与 ZIP 都受 entry、单文件及累计 bytes 限额保护；owned payload 使用完整 SHA-256 content path，source filename 只存在 editor provenance。

新项目提供 15/30/50 初始阈值，但五档的 start/loop/end 未全部获得动态 ImgNumber coverage 时禁止导出。preview resolution、zoom、guides、bet/win 是 session state。

production 合同见 [popup-manifest.md](../../docs/popup-manifest.md)。
