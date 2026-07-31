# 139 vnicore-particle-combo-retarget-pool 执行报告

## 结果

任务 139 的实现与自动化验收已完成；真实浏览器视觉验收按用户要求留给用户执行。

- core 新增严格的 `particle_combo` target variant API：
  - 精确使用 `layerId + animationId`；
  - 默认保持 authored 名义速度并返回新 duration/range；
  - fixed-duration 模式采用宿主时长并返回变化后的 effective speed；
  - 输入 project 不修改，变体超出原 stage 时只扩展 stage。
- Pixi runtime 新增共享 loaded texture handle、loaded clone、per-template pool、
  generation lease 和显式 `VNIPlayerPoolManager`。
- clone 只共享已加载 texture；project、display tree、transport、particle 和 listener 独立。
- `playOnce()` 完成后自动归还；提前 release、template/manager destroy 和重复 release 安全。
- 归还恢复 authored target/duration、重算 particle drain duration、清除 lease state 并 detach。
- vniviewer 新增第五个“目标预览”Tab，包含 animation、targetX/Y、timing mode、fixed
  duration、computed timing、pool stats、错误状态和池化预览。
- 普通播放、manual 连续周期预览和目标预览互斥；切 profile、重新上传和 unload 清理 lease/pool。
- public README、API、usage、Viewer README 和 VNI runtime 稳定规则已同步。

## 实际范围

实现保持在计划范围内。没有修改 VNI schema、editor、Cocos runtime、rendercore runtime、
游戏 app、asset manifest、fixture 或 lockfile。下载 ZIP 没有复制进仓库。

依赖安装使用现有 `pnpm-lock.yaml`，未产生 lockfile diff。干净 worktree 的 rendercore
typecheck 首次因既有 workspace package 尚无 dist 失败；构建
`browserartifactio/editorresource/logiccore/pixiani` 前置产物后，同一检查通过。

## 自动化验收

```text
vnicore test --coverage
  19 files passed
  241 tests passed
  coverage: statements 90.28%, branches 80.78%, functions 96.75%, lines 91.51%

vnicore typecheck                         passed
vnicore build/declaration                 passed
anieditorv5viewer test                    2 files / 32 tests passed
anieditorv5viewer typecheck               passed
rendercore direct-consumer typecheck      passed
anieditorv5viewer production build        passed
changed vnicore/viewer ESLint             passed
changed-file Prettier check               passed
git diff --check                          passed
```

Viewer production build保留既有单 chunk 大于 500 kB 的 Vite warning，没有 build error。

## 真实样本核对

```text
path: /Users/zerro/Downloads/bamboonanza_lizi.zip
SHA-256: bbbaf520f08306bcbafe11ea54e8d345f3f5a23ea6a29676455a362876246172
runtime project: runtime_100/bamboonanza_lizi.json
layerId: layer_image_mr0hscjx_a
animationId: anim_module_mr0ht7ml_b
authored target: (600, 0)
authored duration: 1.5s
authored nominal speed: 400 VNI units/s
```

## 待用户浏览器验收

在 anieditorv5viewer 上传上述 ZIP，进入“目标预览”：

1. 保持原速度，输入 `(300, 0)`，确认 duration `0.75s`；
2. 保持原速度，输入 `(900, 0)`，确认 duration `2.25s`；
3. fixed duration `1s` + `(900, 0)`，确认 effective speed `900 units/s`；
4. 连续预览不同目标，确认 pool stats 的 reused 增长且结果无上次参数残留；
5. 播放中重新预览、切 profile 或重传 ZIP，确认旧预览消失且无异常。

浏览器视觉结果当前状态：`待用户验收`，没有用 mock 结果替代。

## Git

基线 `272a9e94efd73c8c43bfdab5f098871a1d3cdffa`。未 commit、未 push、未创建 PR。
