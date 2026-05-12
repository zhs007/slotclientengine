# agentani-demo 剩余动画转换报告

## 任务目标

把 `assets/editor2` 下除 `bg` 外的剩余动画全部转换为 `agentani-demo` 内的 TypeScript 代码动画，并纳入播放器下拉列表。

## 实际完成内容

已新增 6 个代码动画：

- `src/animations/fang.ts`
- `src/animations/heart.ts`
- `src/animations/mei.ts`
- `src/animations/tao.ts`
- `src/animations/beach.ts`
- `src/animations/bamboo1.ts`

已新增 67 个图片资源目录文件：

- `src/assets/fang/`：9 个
- `src/assets/heart/`：9 个
- `src/assets/mei/`：9 个
- `src/assets/tao/`：9 个
- `src/assets/beach/`：13 个
- `src/assets/bamboo1/`：18 个

`src/animations/registry.ts` 已将全部动画标记为 ready：`bg`、`fang`、`heart`、`mei`、`tao`、`海滩`、`竹子1`。

## 运行时扩展

新增或补齐以下效果类型：

- `particleBurst`
- `fireDistortion`
- `slideOut`
- `float`
- `leafFall`
- `zoomIn`

当前显式支持的全部效果为：

- `fadeIn`
- `fadeOut`
- `fireDistortion`
- `float`
- `leafFall`
- `particleBurst`
- `pulse`
- `slideOut`
- `starlight`
- `sweepLight`
- `swing`
- `zoomIn`

## 验证结果

已通过：

```bash
pnpm --filter agentani-demo typecheck
pnpm --filter agentani-demo lint
pnpm --filter agentani-demo format:check
pnpm --filter agentani-demo test
pnpm --filter agentani-demo build
```

测试结果：8 个测试文件、13 个测试用例全部通过。

补充检查：

- `apps/agentani-demo/src/assets` 下资源数量：`bg 15`、`fang 9`、`heart 9`、`mei 9`、`tao 9`、`beach 13`、`bamboo1 18`。
- `apps/agentani-demo/src` 与 `index.html` 中没有 `project.json`、`assets/editor2`、`rawProject` 或 `fetch(` 命中。
- Vite dev server 可启动，`http://127.0.0.1:5175/` 返回 `HTTP/1.1 200 OK`。

## 已知限制

`particleBurst`、`fireDistortion`、`leafFall`、`starlight` 为 TypeScript 近似播放实现，保留时间、透明度、位移、缩放、旋转等可验收动态语义，不执行编辑器导出的脚本字符串。
