# 142 anieditorv5runtime-cc-particle-combo-retarget-pool 执行报告

## 结果

任务 142 已完成模块化源码、Cocos player pool、standalone、自动化测试、文档和本地 ZIP 交付。
真实 Cocos Creator 验收按用户明确要求未执行。

- Cocos core 新增与任务 139 同语义的 `particle_combo` target variant API：
  - `layerId + animationId` 精确选择；
  - preserve-authored-speed 与 fixed-duration；
  - authored/effective target、distance、duration、speed 和 playback range descriptor；
  - fresh project、输入不变、stage 只扩展和 strict failure。
- 新增同步 `V5GCocosPlayerPoolManager`、per-template pool、generation lease、stats 和 idle cap。
- clone 复用 host root、driver、asset source 和 source SpriteFrame；project、node tree、transport、
  particle、event/listener 独立，且不继承 template callbacks。
- Cocos runtime 不创建 ticker；宿主继续显式调用 `lease.player.update(deltaTime)`。
- `playOnce()` 完成后自动归还；提前 release、template re-init/destroy、manager destroy 和迟到
  completion 均安全。
- 归还恢复 authored target/duration/stage，重算 particle drain cache，清理 lease state 并 detach。
- standalone exports、checker、示例、import/parity/player tests、README 和 Cocos 长期规则已同步。

## 实际文件与计划偏差

实现保持在任务 142 范围内，没有修改 vnicore、Viewer、schema、validation、fixture、Cocos shim、
依赖版本或 `pnpm-lock.yaml`。

计划中的独立 `tests/cocos/player-pool.test.ts` 没有新增；pool 测试并入现有
`tests/cocos/player.test.ts`，以复用同一 FakeDriver、Node 和 SpriteFrame ownership 基线。其余新增、
修改和生成文件符合计划。

依赖通过 Node 24 和 frozen lockfile 恢复；没有 lockfile diff。第一次安装尝试因 PATH 中缺少 Node
在 Sharp lifecycle 停止，切换 `nvm use 24` 后完成。

## 自动化验收

```text
standalone:build                 passed
package test                     21 files / 228 tests passed
package typecheck                passed
package build/declaration        passed
standalone:check                 passed
standalone ES2015 typecheck      passed
package ESLint                   passed
changed-file Prettier check      passed
git diff whitespace checks       passed
```

新增测试覆盖 core timing、零距离/fixed failure、输入不变、同步 acquire、同 root attach/detach、
idle reuse、authored reset、唯一 manager、detached template 拒绝、template re-init、pending Promise
失效、source SpriteFrame ownership，以及 modular/standalone parity。

## standalone.zip

本地 ignored 交付物：

```text
path: packages/anieditorv5runtime-cc/standalone.zip
size: 90,415 bytes
SHA-256: 42acbb805db4938810acf0e96f72c2f734f0f52467f1dabc8ab2f580e2afc261
```

ZIP 只包含：

```text
standalone/anieditorv5runtime-cc.ts
standalone/V5GPreview.example.ts
standalone/effects/vni-screen-alpha.effect
```

## 真实样本与未执行验收

已复核任务 139 样本仍是 Cocos-compatible：

```text
path: /Users/zerro/Downloads/bamboonanza_lizi.zip
SHA-256: bbbaf520f08306bcbafe11ea54e8d345f3f5a23ea6a29676455a362876246172
engineTarget: cocos_creator 3.8.6
animation: layer_image_mr0hscjx_a / anim_module_mr0ht7ml_b
authored: target (600, 0), duration 1.5s, nominal speed 400 VNI units/s
```

真实 Cocos Creator 3.8.6 场景、atlas、Effect/Material、粒子终点和销毁视觉验收未执行，原因是用户
明确说明“CocosCreator 的测试不需要你做”。fake `cc`、编译和 standalone parity 没有冒充该结果。

## Git

基线 `bec0911c18d055a1c1a43f721c66f0d431a10dec`（detached HEAD）。未 commit、未 push、未创建 PR。
