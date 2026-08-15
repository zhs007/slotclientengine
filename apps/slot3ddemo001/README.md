# slot3ddemo001

Three.js + PixiJS 的巨石墙视觉 PoC。页面使用两份静态 GLB 随机生成 5×3 scene；symbol 保持
固定正面，从下排到上排纯垂直落下并组成正对摄像机的墙体。没有 reel、spin、自转、服务端、
logiccore 或 netcore。

## 运行

两份 GLB 体积过大，不进入 Git。首次运行前将本地文件复制为以下固定路径：

```text
<下载目录>/0e428e0f95db86332864db919ebde750.glb
  -> apps/slot3ddemo001/public/models/megalith-a.glb
<下载目录>/b6f1621ab9576bcedae99e367f5a8aa1.glb
  -> apps/slot3ddemo001/public/models/megalith-b.glb
```

```bash
pnpm --filter slot3ddemo001 dev
```

页面加载约 118 MB 的原始 GLB。它们只用于验证构图、模型规范化、灯光、落石节奏和资源复用，
不是 production 体积基线。

## 验收

```bash
pnpm --filter slot3ddemo001 typecheck
pnpm --filter slot3ddemo001 lint
pnpm --filter slot3ddemo001 test
pnpm --filter slot3ddemo001 build
```
