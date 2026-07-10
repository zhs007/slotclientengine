# vnicore 示例

这些示例是可 typecheck 的 TypeScript 文件，演示 public API 用法，不依赖 `apps/anieditorv5viewer/src/**`。

```bash
pnpm --filter @slotclientengine/vnicore examples:typecheck
```

- `basic-player.ts`: 创建 `VNIPlayer`、`init()`、`play()`、`seek()`、`destroy()`，并演示可选文字层替换绑定。
- `playback-events.ts`: 使用 `playRange(...)`、time/frame range、marker、complete listener 和 disposer。
- `segmented-playback.ts`: 使用 hold-frame 和 range-loop 三段式高级播放。
- `group-slot-insertion.ts`: 读取相邻 layer group slot，并把 Pixi node 或 project asset image 插入两个 group 之间。
- `validate-project.ts`: 使用 `assertVNIProject`、`validateVNIProject`、manifest 校验，错误会显式抛出。
- `vite-asset-manifest.ts`: 宿主应用如何用 Vite `import.meta.glob` 生成 `AssetUrlManifest`。

`safe_glow` 的 runtime 支持由 core/Pixi tests 和 `lock_01` / `roundreel` fixture 覆盖；它是继承 layer blendMode 的同图副本高亮，不属于 `shatter` / `glow` render effect 示例。`multi_move` 的多段点解析、结束位移接力和空帧隐藏由 core/Pixi tests 覆盖；示例层不复制 `pointsJson` 解析或 visibility 判断。`chaser_light` 的固定灯位、弧长 spacing 和亮灭推进由 core/Pixi tests 与 `roundreel` fixture 覆盖，示例层不复制走马灯算法。
