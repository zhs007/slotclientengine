# 169 symbolseditor-per-tier-imgnumber 执行报告

UTC：2026-08-05T08:14:55Z

## 实现结果

- `rendercore` 将 value ImgNumber 的 `specialValueImages` 纳入每个 tier binding；dependency、slot、anchor、transform、颜色跟随和特殊图片均按命中的 Spine tier index 精确选择。
- strict parser 继续接受旧的 `valuePresentation.text.specialValueImages`，并规范化为每档独立列表；canonical typed 输出和新物化 package 只保留 per-tier 字段。新旧位置并存时显式失败。
- package closure、mapped materialization、Vite generator、resource pool、default value 校验和 mapped display 均按档位处理 special map，缺 glyph/resource/slot 不跨档回退。
- Symbols Editor 按 Spine 档位显示等长 ImgNumber 卡。每档独立编辑 dependency rootKey、该档 skeleton exact slot、transform、`followSlotColor` 和特殊数值图片；新增档位创建空 binding，修改一档不会广播到其它档。
- 更新 Symbols Editor、rendercore、Symbol package 文档及相关领域规则。

## 兼容性与计划偏差

- 使用仓库已跟踪的 task147 同源 `assets/crave` fixture 验证旧四档 CN import/compile parity；未复制或修改用户的 `/Users/zerro/Downloads/crave/crave-layout-task147.zip`。
- 用户明确表示浏览器验收由其执行，因此本次没有启动浏览器，也没有生成或覆盖 Layout ZIP。
- 依赖目录最初不完整，按仓库约定执行 frozen-lockfile install；未新增依赖，`pnpm-lock.yaml` 无变化。

## 自动化验收

- `pnpm --filter @slotclientengine/rendercore typecheck`：通过。
- `pnpm --filter @slotclientengine/rendercore test`：通过，85 files / 672 tests。
- `pnpm --filter symbolseditor typecheck`：通过。
- `pnpm --filter symbolseditor test`：通过，10 files / 74 tests。
- `pnpm --filter symbolseditor build`：通过；仅有既存的大 chunk 提示，无构建失败。
- `git diff --check`：通过。

定向新增覆盖包括：per-tier canonical/legacy normalization、新旧字段混用失败、每档 special map 的 runtime 选择、档位 special image 精确闭包、generator imports，以及 Editor 独立档位修改和 tier-aware Picker。

## 待用户人工验收

1. 用 task147 同源 Symbols package 打开 CN，确认四档各显示一张 ImgNumber 卡且旧配置均已填充。
2. 只修改其中两档的 dependency、slot/transform 或特殊图片，跨阈值预览时确认其它档不变。
3. 导出、重导 Symbols ZIP，再通过 Layout owner 替换 `game002-s3` dependency，验证真实 Layout/game preview；保留原 Downloads ZIP 不变。

## 剩余风险

- 浏览器内的真实 Spine slot 视觉、Layout dependency 替换与最终 game preview 尚未执行；这是本任务唯一未完成的验收项，由用户接手。
