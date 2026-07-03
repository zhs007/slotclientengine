# 75 任务执行报告：rendercore Spine Symbol Animation

## 结论

已完成 `packages/rendercore` 的 manifest 驱动 Spine symbol animation 接入，并同步 `game003`、`symbolsviewer`、`buildgamestatic`、静态配置、loading 资源、测试与文档。浏览器验收按用户要求未代做，留作手动验收。

## 实现范围

- `packages/rendercore` 新增 `kind: "spine"` manifest schema、资源解析、官方 Spine Pixi v8 runtime adapter 和 `SpineSymbolAni` 生命周期。
- `createSymbolManifestAnimationResolver()` 现在统一支持 `builtin` / `static` / `vni` / `spine`，app 侧只传 manifest、Vite modules 和 fallback resolver。
- `apps/buildgamestatic` 新增 `spineSkeletonGlob` / `spineAtlasGlob` / `spineTextureGlob`，并生成 skeleton modules、atlas raw modules、texture URL modules。
- `apps/game003` 和 `apps/symbolsviewer` 接入 Spine modules；app 侧没有直接 import Spine runtime，也没有复制 atlas/skeleton parser。
- `assets/game003-s1/symbol-state-textures.manifest.json` 已配置：
  - `WL,H1,H2,H3,H4,H5.normal` 使用 Spine `Idle` loop。
  - `WL.appear` 使用 Spine `start` once。
  - `H1.appear` 使用 Spine `Start` once。
  - `H2-H5.appear` 保持 builtin，因为当前 skeleton 没有 Start 动画。
- `apps/game003/config/game-static.yaml` 已同步 Spine static glob 和 loading 预加载资源。
- `agents.md`、`packages/rendercore/README.md`、`apps/game003/README.md`、`apps/symbolsviewer/README.md` 已补充协作边界。

## 资源兼容性

- 采用官方 `@esotericsoftware/spine-pixi-v8@4.3.9`，原因是当前资源为 Spine 4.2 且包含 skins array、mesh、atlas `bounds` / `rotate:90` 等结构，不适合继续扩展 demo parser。
- 已验证 `Symbol.atlas` 单页为 `Symbol.png`，共 21 个 regions。
- 已验证 `WL,H1,H2,H3,H4,H5` skeleton 可由官方 parser 解析，动画名为：
  - `WL`: `Idle`, `start`, `Win`
  - `H1`: `Idle`, `Start`, `Win`
  - `H2-H5`: `Idle`, `Win`
- Spine animation name 区分大小写；manifest 和测试均锁定 exact name。

## 关键边界

- live slot 轮带边界未变：game003 继续使用本地公开轮带滚动，服务器 scene 只叠加目标可见窗口。
- `Symbol.png` 是 Spine atlas texture，不是可展示 symbol，不进入 symbol catalog fallback。
- `buildgamestatic` 对 Spine 三件套采用 all-or-nothing 校验；atlas/texture 生成显式 import，避免 Vite 对单元素 brace glob 产出空模块表。
- 生成物 `game-static.generated.ts` / `game-loading.generated.ts` 已由 `generate:static-config` 同步，未手改。

## 非浏览器验收

已通过：

```bash
CI=true pnpm --filter @slotclientengine/rendercore test
CI=true pnpm --filter @slotclientengine/rendercore typecheck
CI=true pnpm --filter @slotclientengine/rendercore lint
CI=true pnpm --filter @slotclientengine/rendercore build
CI=true pnpm --filter buildgamestatic test
CI=true pnpm --filter buildgamestatic typecheck
CI=true pnpm --filter buildgamestatic lint
CI=true pnpm --filter buildgamestatic build
CI=true pnpm --filter @slotclientengine/gameframeworks exec vitest run tests/static-config.test.ts
CI=true pnpm --filter symbolsviewer test
CI=true pnpm --filter symbolsviewer typecheck
CI=true pnpm --filter symbolsviewer lint
CI=true pnpm --filter symbolsviewer build
CI=true pnpm --filter game003 test
CI=true pnpm --filter game003 typecheck
CI=true pnpm --filter game003 lint
CI=true pnpm --filter game003 release:check
```

补充验证：

```bash
CI=true pnpm --filter game003 generate:static-config
CI=true pnpm exec prettier --check ...
```

`game003 release:check` 已包含 `check:static-config`、生产构建和 `scripts/verify-static-dist.mjs`；dist 中可见 Spine skeleton JSON、`Symbol.atlas` 和 `Symbol.png`。

## 浏览器验收交接

浏览器验收由用户执行。建议页面：

```text
game003: http://127.0.0.1:5208/?skin=1&token=TOKEN&businessid=guest&clienttype=web&jurisdiction=MT&language=en&bet=5&lines=10&times=1&autonums=-1&requestTimeoutMs=30000
symbolsviewer: pnpm --filter symbolsviewer dev -- --host 0.0.0.0
```

重点观察：

- `WL,H1,H2,H3,H4,H5` 普通态是否播放 Spine `Idle`。
- `WL.appear` 是否播放 `start`，`H1.appear` 是否播放 `Start`。
- `H2-H5.appear` 是否仍为 builtin，不应因为缺 Start 资源失败。
- `L1-L5.win` VNI 中奖动画保持透明、位置和生命周期正常。
- game003 loading 阶段应预加载 Spine skeleton、atlas 和 texture，`100%` 后才进入游戏画面。

## 备注

- 首次 `pnpm` 依赖状态检查在沙箱内因 registry 访问被拒，已按流程使用授权后的命令完成安装/生成。
- 本报告未把浏览器验收标为完成。
