# 225 gamelayoutpkgcli-aac-audio-optimization 任务计划

## 1. 目标与完成定义

### 目标

扩展 `apps/gamelayoutpkgcli` 的 production ZIP 后处理：在既有 PNG/JPEG→WebP 之后，按 typed
Scene Layout、Symbols 和 Popup 音频引用收集 exact closure，通过本机 FFmpeg/FFprobe 将交付音频统一为
M4A 容器中的 AAC-LC，并重新生成结构化引用、content-addressed payload、`assets.map.json` 与外置资源分组。

### 完成定义

- [ ] 非合规音频转为 `.m4a` / `audio/mp4` / AAC-LC；已经是 AAC-LC/M4A 且码率不高于目标的资源原样保留。
- [ ] 保留输入声道数与采样率；BGM 默认 128 kbps，mono effect 默认 64 kbps，其它 effect 默认 96 kbps。
- [ ] CLI 支持 FFmpeg/FFprobe 路径和三类码率参数，未知、重复、越界参数显式失败。
- [ ] 转码后的 root/nested audio path 与 media type 结构化改写，完整重建并严格复验 production ZIP。
- [ ] 外置 asset-groups 记录音频编码策略、工具版本、数量与体积；旧 v1 可显式读取，新输出为 v2。
- [ ] 更新 README、定向测试和 UTC 中文执行报告。

## 2. 范围

### 包含

- `apps/gamelayoutpkgcli` 的音频 typed traversal、FFprobe、FFmpeg AAC-LC 编码、CLI 参数、统计、测试和文档。
- `scene-layout-asset-groups` v2 音频优化 metadata；继续把 `audio:scene-layout` 从 `initialAssets` 排除。

### 不包含

- 不修改 Scene Layout v4、Popup v7、Symbol v3 或 audiocore v1 schema/runtime。
- 不修改 Game Layout Editor 导入、试听和源 ZIP，不在浏览器内转码。
- 不把 video transition 的音轨当独立音频处理，不自动转 mono，不增加 Opus/MP3 codec 选择。
- 不内置 FFmpeg binary、不增加 npm 依赖或 lockfile 变化。

## 3. 执行基线

```text
UTC: 2026-08-18T04:44:41Z
HEAD: 92f117be17d21a532ef773219c28edc2bfa1a29b
branch: detached HEAD
git status --short --untracked-files=all: clean
```

- 已读取根 `AGENTS.md`、`docs/agent-rules/scene-layout.md`、
  `docs/agent-rules/editor-artifacts.md`；目标目录无子级 `AGENTS.md`。
- 当前 CLI 只由 `image-optimizer.ts` 调用 `cwebp`；audio typed path 已能被
  `reference-rewriter.ts` 结构化改写，`asset-groups.ts` 已收集 root/Symbol/Popup audio closure。
- 当前 ZIP 使用 deterministic deflate level 6；对已压缩音频无有效体积收益，必须在 ZIP 重建前转码。

## 4. 技术决策与合同

1. **使用系统 FFmpeg/FFprobe。** 沿用 `cwebp` 的 `execFile` runner seam，不使用 WASM、shell 拼接或 bundled binary。
2. **固定 production codec。** 输出固定 AAC-LC + M4A；参数只控制工具路径和码率，不提供未知 codec fallback。
3. **保留声道。** FFprobe 必须得到恰好一条 audio stream 且没有其它 stream；FFmpeg 不传 `-ac`，输出复验声道数一致。
4. **避免无意义二次有损。** `.m4a` + `audio/mp4` + AAC LC 且码率不高于目标时直接保留；无法证明合规时转码。
5. **音乐优先。** 同一 logical path 同时作为 BGM/effect 时使用 BGM 码率；effect 的 mono/其它码率由 probe channel count 决定。
6. **原子输出。** prepare/probe/encode 在临时目录完成；任一失败清理临时文件且不提交 ZIP/JSON，继续使用现有 output-pair rollback。
7. **外置 schema 显式升版。** v2 在 optimization 中增加 audio metadata；parser 显式支持历史 v1 和新 v2，不向 v1 塞未知字段。

## 5. 文件范围

### 预计新增

```text
apps/gamelayoutpkgcli/src/audio-assets.ts
apps/gamelayoutpkgcli/src/audio-optimizer.ts
apps/gamelayoutpkgcli/tests/audio-optimizer.test.ts
tasks/225-gamelayoutpkgcli-aac-audio-optimization-<utctime>.md
```

### 预计修改

```text
apps/gamelayoutpkgcli/src/{cli,types,asset-groups,reference-rewriter}.ts
apps/gamelayoutpkgcli/tests/{cli,fixtures,package-flow,asset-groups,reference-rewriter}.test.ts
apps/gamelayoutpkgcli/README.md
docs/agent-rules/scene-layout.md
```

### 原则上不应修改

```text
packages/**
apps/gamelayouteditor/**
apps/popupeditor/**
apps/symbolseditor/**
assets/**
package.json
pnpm-lock.yaml
```

## 6. 实施步骤

1. 抽取唯一 typed audio asset role collector，供优化与 asset group 共用。
2. 实现 FFprobe/FFmpeg runner、合规判断、目标 key/collision、缓存、输出签名和 probe 复验。
3. 将 image/audio optimization 串入 CLI，合并 key mapping 后复用既有 typed reference rewrite 和 package validator。
4. 升级 asset-groups v2 metadata，补齐 CLI、optimizer、nested rewrite、determinism、strict failure 与 rollback 测试。
5. 更新 README/领域规则，执行定向验收并生成报告。

## 7. 验收

验收级别为 L2：改变正式后处理 ZIP 和外置 versioned asset-groups，但不修改共享 package public API 或 lockfile。

```bash
pnpm --filter gamelayoutpkgcli typecheck
pnpm --filter gamelayoutpkgcli lint
pnpm --filter gamelayoutpkgcli test
pnpm --filter gamelayoutpkgcli build
pnpm --filter gamelayoutpkgcli format:check
git diff --check
```

人工验收：用真实 WAV/MP3/OGG/M4A production ZIP 检查 BGM loop 接缝、音效声道/听感、目标浏览器解码和实际体积。

## 8. 风险与假设

- AAC encoder padding 可能影响无缝 loop；CLI 只能保证 codec/container/stream 合同，听觉接缝需要真实素材验收。
- FFmpeg 小版本可能产生不同 bytes，因此 v2 metadata 保存 exact tool version；同版本、同输入和同参数要求确定性输出。
- 仓库没有 production 音频 fixture；自动化用 runner seam 验证 transaction，真实 codec 另做人工验收。
