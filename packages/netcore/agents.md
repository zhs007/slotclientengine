# AGENTS.md version=2.0

This document provides package-level instructions for AI agents working in `packages/netcore`.

## Package Context

- Package name: `@slotclientengine/netcore`
- Package role: internal workspace network library in the `slotclientengine` monorepo
- Package manager: `pnpm`
- Task runner at repo root: `turbo`
- Primary quality tools: `vitest`, `eslint`, `typescript`, `prettier`

Follow the root-level [agents.md](../agents.md) first. This file only adds package-specific guidance.

## Key Commands

Run these commands from the repository root unless there is a strong reason not to:

- Install dependencies: `pnpm install`
- Run package checks: `pnpm --filter @slotclientengine/netcore run check`
- Run package tests: `pnpm --filter @slotclientengine/netcore test`
- Build the package: `pnpm --filter @slotclientengine/netcore build`
- Run workspace-wide validation: `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`

## Package Notes

- `SlotcraftClient` switches between live WebSocket mode and replay mode based on the URL protocol.
- `spin()` may end in `IN_GAME`, `SPINEND`, or `WAITTING_PLAYER`; callers must handle follow-up `collect()` or `selectOptional()` when needed.
- Tests cover both isolated modules and mocked server integration flows under `tests/`.
- Keep this package aligned with root workspace tooling and avoid reintroducing `npm`-specific workflow files or commands.

## Change Expectations

- Preserve the current public API unless the task explicitly requires a breaking change.
- Prefer minimal runtime dependencies.
- Update package documentation when behavior or workflow changes.
- When fixing behavior, add or adjust tests if existing coverage does not already protect the change.
