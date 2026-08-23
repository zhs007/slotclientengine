# gardenboard3ddemo

Three.js 纯背景 PoC：6×10 草皮棋盘、程序化草地纹理、实例化外围草丛和低模花朵。没有 UI、角色、
symbols、reel 或服务端逻辑。草叶通过顶点 shader 晃动，花朵通过共享实例网格的矩阵动画晃动。

```bash
pnpm --filter gardenboard3ddemo dev
```

定向验收：

```bash
pnpm --filter gardenboard3ddemo typecheck
pnpm --filter gardenboard3ddemo lint
pnpm --filter gardenboard3ddemo test
pnpm --filter gardenboard3ddemo build
```
