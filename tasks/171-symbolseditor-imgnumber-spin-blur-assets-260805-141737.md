# 任务 171 执行报告

UTC：2026-08-05T14:17:37Z

## 结果

- Symbols manifest 的命名 ImgNumber node 新增显式 `spinBlurProfile`；仅允许与 non-Spine exact
  `spinBlur` target 一起使用，并严格校验普通/模糊 dependency 的 metrics、glyph 字符与 size/offset、
  fixed-advance groups、special value 集合及 initial text 闭包。
- Symbols Editor 的 ImgNumber 卡片新增“生成并使用模糊 ImgNumber”按钮。首次生成按 rendercore 当前
  versioned `spinBlur` preset 处理 unique glyph/special source，安装合法 v1 ImgNumber dependency，
  并在一次 project transaction 中绑定所有同源且配置了 `spinBlur` target 的 node。
- 派生 dependency identity 由普通 dependency 内容与 preset 决定；同 project 重复使用时复用现有
  dependency 和特殊值图片，不重复生成。普通 glyph/dependency/special source 变化会清除对应旧 profile，
  要求显式重建，不继续使用过期模糊图。
- package exact closure、mapped materializer、引用图和 ZIP export 均包含已引用的模糊 manifest、glyph 与
  special 图片；未引用派生资源仍只留在 Editor library，不进入正式输出。
- runtime prepare normal/blur 两套 profile 后，在同一个 mapped renderer/container 上调用
  `setResource()` 切换纹理；normal → spinBlur → normal 保持 container 与 glyph Sprite pool identity，
  不创建第二个 ImgNumber instance，也不在 runtime 生成像素。旧 package 未配置 profile 时继续使用
  normal assets，兼容原行为。
- README、Symbol Package 文档和 Editor/runtime 领域规则已同步。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore --filter symbolseditor typecheck`：通过。
- rendercore：87 files，691 tests 通过；branch coverage 80.04%。
- symbolseditor：11 files，76 tests 通过。
- game002：26 files，190 tests 通过；测试前直接依赖构建通过。
- `pnpm --filter symbolseditor build`：通过；仅有既存的大 chunk warning。
- `git diff --check`：通过。
- `assets/**`、`pnpm-lock.yaml` 与 game002 generated resources：无 diff。

`pnpm --filter @slotclientengine/rendercore --filter symbolseditor --filter game002 typecheck` 中，rendercore 与
symbolseditor 已通过；game002 最终测试 TypeScript 检查被既存的
`apps/game002/tests/value-resource-fixture.ts:217` 阻断：代码直接访问 legacy/shared union 上并非共同存在的
`tiers`，并产生一个隐式 `any`。该文件及相关 value-presentation 类型均不在本任务 diff 中，本任务未扩大
范围修改它。

## 待用户浏览器验收

按用户要求，本次未启动浏览器。待人工确认：

1. 给命名 ImgNumber 添加 exact `spinBlur` target 后，卡片显示可用的生成按钮；缺 dependency、glyph 或
   special 图片时按钮禁用并显示具体原因。
2. 首次点击后资源库出现一份模糊 ImgNumber dependency，预览 `spinBlur` 显示模糊 glyph/特殊值整图；
   normal 与 spinBlur 往返位置、尺寸、slot attachment 和颜色跟随不变。
3. 两个 symbol/node 复用同一个普通 ImgNumber 且都有 `spinBlur` target 时，一次生成会同时绑定；再次点击
   不新增 dependency 或图片。
4. 覆盖普通 glyph、替换普通 dependency、修改 special 映射或覆盖 special source 后，旧模糊 profile
   失效并要求重新生成；仍被其它有效 node 引用的派生资源不被删除。
5. 导出并重新导入 Symbols ZIP 后 profile 与资源完整；旧的 target-only ZIP 仍使用普通 ImgNumber assets。
