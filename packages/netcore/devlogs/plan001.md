# 任务 001：项目初始化与核心类型定义

## 目标

搭建项目基础结构，配置 TypeScript 和 Jest，并根据服务器协议文档定义所有核心数据结构和类型。这是后续所有开发工作的基础。

## 前置条件

- 已仔细阅读 `docs/` 目录下的服务器协议文档。

## 主要步骤

1.  **初始化项目**:
    - 执行 `npm init -y` 创建 `package.json` 文件。

2.  **安装依赖**:
    - 安装开发依赖：`npm install typescript ts-node jest ts-jest @types/jest --save-dev`。
    - 本项目力求零生产依赖。

3.  **配置 TypeScript**:
    - 执行 `npx tsc --init` 创建 `tsconfig.json` 文件。
    - 配置 `tsconfig.json`，确保 `target` (建议 `ES2020` 或更高)、`module` (`CommonJS` 或 `ESNext`)、`outDir` (`./dist`)、`rootDir` (`./src`) 和 `declaration` (`true`) 等选项符合要求，以生成类型声明文件。

4.  **创建目录结构**:
    - 创建 `src/`、`tests/` 目录。

5.  **定义核心类型 (`src/types.ts`)**:
    - **状态枚举**: 创建 `ConnectionState` 枚举，包含 `IDLE`, `CONNECTING`, `CONNECTED`, `LOGGING_IN`, `LOGGED_IN`, `ENTERING_GAME`, `IN_GAME`, `DISCONNECTED`, `RECONNECTING` 等状态。
    - **消息接口**: 定义客户端发送消息 `ClientMessage` 和服务器推送消息 `ServerMessage` 的基础接口和具体类型。
    - **用户信息**: 定义 `UserInfo` 接口，用于存储 `token`, `ctrlid`, `balance`, `gamecode` 等。
    - **配置选项**: 定义 `SlotcraftClientOptions` 接口，用于初始化客户端时的配置，如 `url`, `token`, `gamecode` 等。
    - **事件载荷**: 为所有需要对外发送的事件定义其数据载荷的类型，例如 `OnGameDataPayload`, `OnErrorPayload`。

6.  **配置 Jest**:
    - 创建 `jest.config.js` 文件。
    - 配置 `preset` 为 `ts-jest`，`testEnvironment` 为 `node`。

7.  **创建 `.gitignore`**:
    - 添加 `node_modules/`、`dist/`、`.DS_Store` 等常见忽略项。

## 验收标准

- 项目结构已创建。
- 所有开发依赖已安装。
- `tsconfig.json` 和 `jest.config.js` 配置完成。
- `src/types.ts` 文件包含所有必要的、注释清晰的类型定义。
- 可以成功执行 `npx tsc` 编译命令并通过。
