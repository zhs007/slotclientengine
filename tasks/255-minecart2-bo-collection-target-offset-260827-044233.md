# 255 minecart2-bo-collection-target-offset 执行报告

UTC：2026-08-27T04:42:33Z

## 最终实现

- Minecart2 私有 runtime config 从 v4 升至 v5，在 `boCollection` 增加并严格校验
  `targetOffsetUpPixels: 117`，不提供旧版本、缺省值或 alias fallback。
- `collectionTarget()` 保留原 5×5 转轮顶部水平中心算法，只把最终本地 Y 再减 117；同一新 anchor 继续同时作为
  `context.move().to` 和 cubic path 最后一段 `end`。
- BO state、clone、隐藏、0.32秒时长、curve lift、easing、并行飞行、presentation cleanup、Squib、hole commit、
  abort/failure恢复和后续transition均未改变。
- 更新定向测试与Minecart2 README。LogicCore、RenderCore、game003v2、资源、生成物、依赖和lockfile未修改，
  未执行shared package同步。

实际修改：

```text
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/config/game-runtime.manifest.json
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/config.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/src/round-adapter.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/tests/round-adapter.test.ts
/Users/zerro/gitee.com/piximinecart2/apps/minecart2/README.md
```

## 计划偏差

- 执行开始时piximinecart2 HEAD已从计划基线`dc3a79c`前进到`c4cdde6`；新增提交只改了README中的期待效果说明，
  BO实现和config仍与计划基线一致。本次在新HEAD上保留该更新并合并目标文档修改。
- 用户明确接管浏览器验收，因此未启动本地页面；横竖屏真实视觉结果保留为待用户完成。
- 目标文件Prettier初检发现测试文件格式差异，已只格式化该测试文件并复跑定向测试。

## 验收结果

通过：

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 exec vitest run tests/round-adapter.test.ts
# 1 file、13 tests通过；格式化后复跑仍通过

pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 build
# 通过，生成Minecart2 1.0.16 production bundle

pnpm --dir /Users/zerro/gitee.com/piximinecart2 exec prettier --check apps/minecart2/config/game-runtime.manifest.json apps/minecart2/src/config.ts apps/minecart2/src/round-adapter.ts apps/minecart2/tests/round-adapter.test.ts apps/minecart2/README.md
# 通过

git diff --check
git -C /Users/zerro/gitee.com/piximinecart2 diff --check
# 均通过
```

未通过但与本任务无关：

```bash
pnpm --dir /Users/zerro/gitee.com/piximinecart2 --filter minecart2 typecheck
```

- `prepare:deps`全部完成后，app `tsc --noEmit`在未修改的`packages/bridgecore/src/**`和
  `packages/device-detector/src/index.ts`失败。
- 主要错误为NodeNext/Node16 module resolution下既有相对import缺少显式`.js`扩展（TS2834/TS2835），另有
  `bridgecore/src/services/bridge/session.ts`两个既有implicit-any（TS7006）。
- 本任务diff未触及上述文件；未扩围修复这些基础包问题。定向Vitest与production build均通过。

## 待用户完成的人工验收

1. 含BO回合中确认最终中心X不变，目标Y相对任务248旧顶部中心向上117个游戏逻辑像素，到达后消失。
2. 确认随后只播放一次exact `0_Squib`、BO原格提交holes、后续round/transition正常，无双影、闪回、残留或额外停顿。
3. 横屏和竖屏各检查一次，确认117是local offset并随游戏画面缩放，不受CSS/device pixel影响。

## 剩余风险与未完成项

- 浏览器真实美术验收待用户完成；自动化只证明fixture目标从`(250,0)`变为`(250,-117)`且path endpoint一致。
- Minecart2全量typecheck仍受上述既有BridgeCore/Device Detector导入问题阻塞；与本任务无关，未纳入修复范围。
