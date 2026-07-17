# Symbols Editor

纯前端 symbols package v1 编辑器。上传公开 `gameconfig.json` 后配置统一 `cellSize`、display symbols、normal/state texture 与单状态动画；可严格导入/导出 `<id>-symbols.zip`。

编辑器只做单状态预览，不包含 symbolsviewer 的 sequence、hold、next、spin/cascade 编排。ZIP 必须包含唯一 game config、symbol manifest 和精确资源闭包；未知上传文件停留在 unmapped 列表，不会进入导出。

```bash
pnpm --filter symbolseditor dev
pnpm --filter symbolseditor test
pnpm --filter symbolseditor build
```
