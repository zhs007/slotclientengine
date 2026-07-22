# `@slotclientengine/editorresource`

四个纯前端 Editor 共用的 headless 资源工作区。唯一资源身份是 Unicode NFC 的单个文件名 key；资源 bytes 通过完整 lowercase SHA-256 映射到 `assets/<sha256>.<ext>`。本包拥有 key 校验、`assets.map.json`、冲突 review、覆盖/改名/删除、引用影响、事务回滚、精确导出与 bounded files/ZIP ingestion。

本包不依赖 DOM renderer、Pixi、Node `fs` 或游戏业务。格式结构解释和路径字段改写仍由 rendercore/vnicore owner adapter 完成。ZIP 目录只存在于解析阶段，提交前必须扁平化；同名不同 bytes 默认计划为覆盖，不能自动追加 suffix。

ZIP 导入边界会忽略 Finder 生成的 `__MACOSX/**`、`._*` 与 `.DS_Store`，并且仅在剥离唯一一层外包装目录后能找到调用方指定的根 manifest 时移除该目录。规范化后的真实包内容仍执行原有路径、manifest、`assets.map.json`、SHA-256、缺失文件与孤儿 payload 严格校验；这些 macOS 元数据和外包装目录不会进入 workspace 或重新导出的 ZIP。
