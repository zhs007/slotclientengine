# `@slotclientengine/editorcore`

共享 Editor 能力包。Task 229 首先提供统一 Assets 模块；四个正式 Editor 尚未迁移。

## 分层

- `assets/data`：十一类顶层 root、唯一 graph node、typed relation、host reference/program binding 和 snapshot 类型。
- `assets/core`：graph 校验、树投影、使用状态派生、导入/覆盖/改名/删除事务，以及精确 map/payload 导出计划。
- `assets/adapters`：组合 AudioCore、VNICore、RenderCore 和 EditorResource 的 strict owner API，识别 loose 文件与 ZIP。
- `assets/ui`：可挂载/销毁的原生 DOM treegrid、统一导入 review、搜索筛选、inspector 和固定行高虚拟列表。

底层 logical identity 仍是 `@slotclientengine/editorresource` 的扁平 filename key；树是 owner 关系的视图，不是目录。Spine atlas page、VNI 图片和 package leaf 只能随其顶层 root 使用，不能独立绑定。需要复用时应单独导入顶层资源；相同 bytes 在 `assets.map.json` materialization 时共享 content-addressed payload，logical identity 不合并。

## Host 接入

```ts
import { createDefaultEditorAssetsController } from "@slotclientengine/editorcore/assets/adapters";
import { mountEditorAssetsView } from "@slotclientengine/editorcore/assets/ui";

const controller = createDefaultEditorAssetsController({ project, host });
const view = mountEditorAssetsView({ controller, root: element });

// host 卸载时
view.destroy();
controller.destroy();
```

`host` 必须负责 clone project、收集业务引用、收集/写入显式程序 binding、结构化重写 root 引用；建议实现 candidate project/catalog/workspace 的最终校验。`used` 和 `programmatic` 均从 host 合同实时派生，不持久化布尔副本。

默认 adapter factory 的 `prepareImport()` 可以接收同一批普通文件和 ZIP。所有格式发现、profile 选择和冲突 review 完成后，调用 `commitImport()` 原子提交；blocking diagnostic、未处理同名冲突或 host 校验失败都保留旧 snapshot。只需 graph/usage/export 的 headless consumer 可直接使用 `assets/core` 的 factory 并注入自己的 discover function，不会由 core 隐式加载 format adapter。

## 当前边界

- 原子 root：PNG/JPEG/WebP、AudioCore 支持的音频、MP4，以及尚无 loader 的 opaque text/binary 文件。
- compound root：VNI、Spine 4.3、ImgNumber、Popup、Symbols、Game Layout。
- 已有 loader 的格式继续严格验证签名/schema；没有 loader 的文件保留 bytes 和 text/binary 类型，后续 loader 可在 generic fallback 前显式 claim。坏 hash、缺失引用和 package physical orphan 不会 fallback。
- compound root 不能通过通用命令只改内部 leaf；需要 owner schema rewrite 的整体 keep-both/rename 应由后续 owner adapter 扩展。
- 图片、原生 audio/video 有内置 inspector；compound 动画播放仍由正式 owner preview/runtime 承担。
- `apps/editordemo` 是当前公开合同与工程 ZIP 的隔离验收宿主。
