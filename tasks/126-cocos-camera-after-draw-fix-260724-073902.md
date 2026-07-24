# 任务 126：Cocos Camera capture 修复

## 问题

真实 Cocos Creator 3.8.6 Web 构建在 complex Node capture 时抛出：

```text
Cocos node visual capture failed: camera.render is not a function
```

原因是任务 126 的 shim/fake 错误声明了 `Camera.render()`，掩盖了真实 3.8.6 Camera component 没有该 public API 的事实。

## 修复

- 删除 runtime、shim 和 fake 中对 `Camera.render()` 的依赖。
- capture root 挂入 active scene 后，异步等待 `Director.EVENT_AFTER_DRAW`。
- 该帧完成后再用 RenderTexture 创建 SpriteFrame，并立即销毁临时 capture root/camera。
- 保留同步参数校验、异步 capture failure rollback、宿主 Node ownership 和引用计数 release。
- standalone 由生成器重新生成。

## 验收

- 使用本机 Cocos Creator 3.8.6 官方 `cc.d.ts` 直接编译 standalone：通过。
- standalone build/check/typecheck：通过。
- package typecheck/lint/test/build/format：通过。
- Vitest：19 files / 212 tests 通过。
- 新增回归明确断言 fake `Camera.prototype` 不存在 `render`，capture 必须等待 draw Promise。
- `git diff --check`：通过。

真实 Web 视觉、透明度、UV、Mask/Spine 和 profiler 结果仍由用户完成最终验收。
