# `@slotclientengine/editorresource`

四个纯前端 Editor 共用的 headless 资源工作区。唯一资源身份是 Unicode NFC 的单个文件名 key；资源 bytes 通过完整 lowercase SHA-256 映射到 `assets/<sha256>.<ext>`。本包拥有 key 校验、`assets.map.json`、冲突 review、覆盖/改名/删除、引用影响、事务回滚、精确导出与 bounded files/ZIP ingestion。

本包不依赖 DOM renderer、Pixi、Node `fs` 或游戏业务。格式结构解释和路径字段改写仍由 rendercore/vnicore owner adapter 完成。ZIP 目录只存在于解析阶段，提交前必须扁平化；同名不同 bytes 默认计划为覆盖，不能自动追加 suffix。
