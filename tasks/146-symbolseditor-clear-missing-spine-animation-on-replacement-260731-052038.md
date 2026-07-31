# 146 Symbols Editor 替换缺失 Spine 动画清理执行报告

## 结果

任务已完成。覆盖有效 Spine skeleton 后，若已有 exact animation 不再存在，Symbols
Editor 在 candidate project 内只清空受影响的 `animationName`，再一次性提交；资源路径、
transform、state、tier、ImgNumber、cascade 和其它 binding 保持不变。

普通 Spine state 逐项处理。value presentation 则按所有 tier 的 animation intersection
处理：缺失的 normal animation 同步清空全部 tier 的共享选择，缺失的 `activeSpine`
只清对应 state。导入反馈会列出被清空的 location 与旧动画名。

## 实际修改

- `apps/symbolseditor/src/model/resource-import.ts`
  - 新增 `ClearedSpineAnimationBinding` 和 overwrite skeleton 的 typed reconciliation。
  - 只对 resolved `overwrite` 的 skeleton key 处理；add/noop/keep-both 不触发清理。
  - 在独立 validation clone 中临时使用可用动画验证剩余 runtime binding；临时值不写回
    draft。slot、atlas、closure 等其它错误继续拒绝整批提交。
- `apps/symbolseditor/src/ui/workspace-app.ts`
  - 导入成功反馈在无清理时维持“配置保持不变”，有清理时明确显示数量、location 和旧
    animation name。
- `apps/symbolseditor/tests/resource-import.test.ts`
  - 覆盖普通 Spine 的保留/最小清理、tiered activeSpine、tier normal 共享清理，以及
    “缺动画同时缺 slot”仍 rollback。
- `apps/symbolseditor/README.md`、`docs/agent-rules/editor-artifacts.md`
  - 同步稳定 replacement 合同与重新选择动画的要求。

未修改 production schema、rendercore/editorresource、其它 editor、assets、lockfile
或根 `AGENTS.md`。

## 验收

通过：

```bash
pnpm --filter symbolseditor test
pnpm --filter symbolseditor typecheck
pnpm --filter symbolseditor build
pnpm --filter symbolseditor format:check
git diff --check
```

- 测试：8 files / 52 tests passed。
- build：成功。Vite 保留已有的主 chunk 超过 500 kB 警告；本任务没有新增依赖或扩大
  bundle owner。
- 执行前按 Node 24 运行 `CI=true pnpm install --frozen-lockfile` 补全工作区依赖；
  lockfile 未变化。

## 人工验收与剩余风险

未执行浏览器人工验收。建议用真实 Symbols project 覆盖一个删除了已选动画的 skeleton，
确认 success feedback、空 animation select、其它配置保留，以及重新选择有效动画后的
preview/export；再以缺 slot replacement 复验 rollback。
