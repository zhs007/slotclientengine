# @slotclientengine/browserartifactio

除 deterministic bounded ZIP 外，本包统一拥有 editor logical id 建议、Web Crypto
完整 SHA-256、canonical media detection、bounded File/directory source index、
exact/unique case-fold resolution、immutable blob collision guard 与 flat allocator。
`assertNoPackagePathAliases` 允许 exact content path 复用，但拒绝 NFC/case alias。

浏览器侧 artifact 基础设施：受限流式 ZIP 解压、确定性 ZIP 创建、package 路径安全与 Blob URL 生命周期。调用方必须显式提供自己的大小限制和大小写策略。

同时提供 editor 通用的 logical id 建议、Web Crypto 完整 SHA-256、bounded source index、exact/unique case-fold resolution 和 `assets/<digest>.<ext>` allocator；本包不包含 editor、Pixi、VNI 或 Spine 业务语义。
