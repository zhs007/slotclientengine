# 任务 007：文档撰写与项目最终化

## 目标

完成所有面向开发者的文档，包括使用指南和 API 参考。同时，配置项目以便能被正确打包和发布到 npm，并创建 `agents.md` 文件。

## 主要步骤

1.  **编写使用文档 (中文)**:
    - **创建文件**: `docs/usage_zh.md`。
    - **内容**:
      - **简介**: 项目是做什么的。
      - **特性**: 主要功能点列表（如自动重连、请求缓存等）。
      - **安装**: `npm install <package-name>`。
      - **快速上手**: 一个完整的代码示例，展示如何导入、实例化、连接、发送消息和监听事件。
      - **API 参考**:

- `new SlotcraftClient(options)`: 构造函数和 `options` 参数详解。- `client.connect(): Promise<void>`: 方法说明、成功和失败的情况。- `client.send(cmd, params): Promise<any>`: 方法说明、参数、返回值。- `client.disconnect()`: 方法说明。- `client.on(event, callback)`: 事件监听。
  - **事件列表**:
    - 详细列出所有对外触发的事件 (`connect`, `disconnect`, `ready`, `error`, `reconnecting` 等)，并说明每个事件的回调参数。
  - **高级用法**: 如何处理重连、如何利用返回的 `Promise` 进行流程控制等。

2.  **编写使用文档 (英文)**:
    - **创建文件**: `docs/usage_en.md`。
    - **内容**: 将 `usage_zh.md` 的内容完整、准确地翻译成英文。

3.  **代码内注释审查**:
    - 通读 `src/` 目录下的所有代码。
    - 确保所有的 `public` 方法、`class`、`interface`、`type` 都有清晰的 TSDoc 注释。
    - 复杂的 `private` 方法或逻辑块也应有必要的注释。

4.  **配置 `package.json` 用于发布**:
    - `name`: 设置包名。
    - `version`: 设置初始版本号，如 `1.0.0`。
    - `description`: 填写项目描述。
    - `main`: 指向打包后的 JS 文件，例如 `dist/main.js`。
    - `types`: 指向生成的类型声明文件，例如 `dist/main.d.ts`。
    - `files`: 指定哪些文件或目录应被包含在 npm 包中，例如 `["dist", "docs"]`。
    - `scripts`:
      - `"build": "tsc"`: 添加构建脚本。
      - `"prepublishOnly": "npm run build"`: 确保发布前总是先构建。
    - `repository`, `keywords`, `author`, `license` 等字段也应填写完整。

5.  **创建 `agents.md`**:
    - 在项目根目录创建 `agents.md` 文件。
    - 根据 https://agents.md/ 规范，添加说明。
    - **内容应包括**:
      - 项目简介和目标。
      - **开发规约**:
        - 所有新功能必须有单元测试。
        - 必须运行 `npm test` 并且全部通过。
        - 提交前运行 `npm run test:coverage` 确保覆盖率不降低。
        - 代码风格遵循 Prettier (如果使用) 或现有的风格。
      - **如何开始**: `npm install`, `npm test`。
      - **程序化检查**: 提供一个可以运行的检查命令，例如在 `package.json` 中添加 `"check": "npm test"`。

6.  **最终审查**:
    - 删除所有开发过程中的临时文件和日志。
    - 运行一次完整的流程：`npm install`, `npm test`, `npm run build`，确保一切正常。
    - 阅读所有文档，检查是否有错别字或不清晰的表述。

## 验收标准

- `docs/usage_zh.md` 和 `docs/usage_en.md` 文件已创建，内容完整、清晰。
- `package.json` 已为 npm 发布正确配置。
- `agents.md` 文件已按规范创建。
- 项目代码注释完善。
- `npm run build` 命令可以成功生成 `dist` 目录，其中包含 `.js` 和 `.d.ts` 文件。
