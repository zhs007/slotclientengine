# 任务 131 执行报告

UTC：2026-07-28T09:43:10Z

## 结果

- 完成 Symbols Editor 的 ImgNumber multi-target 导入、查看、事务修改、导出和重导；
  旧单 `target` 可读，canonical 输出统一为 `targets`。
- 使用 `crave-symbols-fixed.zip` 与 `crave-wl-num.zip` 配对 WL/WM；WM 增加
  `multStart/multIdle/multEnd/change`，全部 multiplier binding 使用 exact `Mult`
  slot 和同一 ImgNumber dependency。
- 完成 Game Layout Editor 的 headless Symbols/Layout 导入与导出能力；paired
  Symbols 已绑定 BaseGame、FreeGame，并用导出物完整更新 `assets/crave`。
- logiccore/rendercore 增加中性 settled-transform plan、coordinator phase、真实动画
  completion counter 和 prepared occurrence replacement；共享层没有 game002
  component、symbol 或动画硬编码。
- game002 只支持 `skin=2`。WL/WM 数据在画面 mutation 前完整编译，并严格执行：
  全部 symbol 落定、延迟 `bg-incwl` 的 WL Start、WM multiplier 动画、WM -> CN
  原子替换、现有中奖。
- spin 与 refill 使用同一处理流程；没有 WL 时 WM 仍完整执行；没有 WM 但存在延迟
  `bg-incwl` 时只执行 WL Start。

## 交付物

| 文件                                                 |      字节 | SHA-256                                                            |
| ---------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `tasks/artifacts/131/game002-s3-symbols-task131.zip` | 6,222,920 | `fdbc8149bc573b0599aee3e103959cf5f976aa9bf9731155debc3cf251f118ff` |
| `tasks/artifacts/131/crave-layout-task131.zip`       | 9,862,066 | `391ae86b02e2661b1f567e04af45246d1127cbdc92d2dd85bed8a7420e85892c` |

`assets/crave` roots：

- `layout.manifest.json`：
  `74c429ef306f65ff3e2825e35aa0feb39e6ae420a4c90e2c7049c90b311fff09`
- `assets.map.json`：
  `b9add092508be43c29c751eb7d01e0a233385a1dbb85b659e673d6bbd2bf79bd`

原始 Downloads ZIP 未修改。输出由两个编辑器的 task 131 authoring 脚本生成；脚本
包含 edit/export/reimport 探针，正式值恢复后再导出。

## 自动化证据

- Symbols Editor：7 files / 44 tests passed；typecheck、build passed。
- Game Layout Editor：21 files / 156 tests passed；typecheck、build passed。
- logiccore：11 files / 87 tests passed；typecheck passed。
- rendercore：73 files / 557 tests passed；typecheck passed。
- gameframeworks：12 files / 81 tests passed；typecheck passed。
- game002：24 files / 115 tests passed；typecheck、production build、
  `release:check` passed。
- `game002 check:resources`：133 个 scene-layout resources 通过 map、hash、size、
  path 和 orphan 精确检查。
- 受影响 package 的 format check passed；`git diff --check` 通过。

## 计划偏差与剩余风险

- 后续 live 浏览器联调确认 `bg-incwl` 不在中奖 step，而在其下一 cascade step 的
  `bg-dropdown` 后、`bg-refill` 前；实现与 fixture 已改为跨 step 关联中奖 WL，
  refill 落定后再提交 +1 表现。
- 用户补充了 refill WM、无 WL 的 WM、`bg-incwl` 延迟表现；实现和测试已并入同一
  settled-transform phase，没有建立第二条时序。
- 浏览器联调确认 multiplier component 的 `otherScene` 非目标 cell 另有服务器
  用途；现已只读取当前操作目标 symbol cell，不再要求其它位置为零。
- 浏览器联调补充 `bg-genwm.scene` 是 WM 生成后的权威盘面；initial spin 与 refill
  现均在 planning 阶段用它替换生成前 scene。
- 没有取得包含六个新 component 的脱敏真实 round payload；当前协议证据来自
  strict constructed fixtures。若 live payload 的 component-scoped matrix 结构与
  计划不同，应调整明确合同，不增加宽松 fallback。
- 浏览器验收由用户执行，目前状态为待用户验收；本报告不宣称浏览器或 live 视觉
  已通过。

## 用户浏览器验收

1. Symbols Editor 导入 paired Symbols ZIP，检查 WL/WM multiplier targets、WM 四个
   新状态和 exact `Mult` slot；修改、导出、重导。
2. Game Layout Editor 导入 paired Symbols ZIP 与 updated Layout ZIP，检查
   BaseGame/FreeGame binding、预览、修改、导出和重导。
3. game002 使用 `skin=2`：检查 spin/refill 的 WM 流程、无 WL 的 WM、WL
   `bg-incwl` Start、WM 四段动画、原位置 CN、新 CN value 和中奖顺序。
4. 复验期待、cascade、CN collect、summary、popup、resize、cleanup/destroy 与
   console。
