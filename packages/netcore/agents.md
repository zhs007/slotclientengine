# AGENTS.md version=1.0

This document provides instructions for AI agents to work on this project.

## Capabilities

This project uses `npm` for package management and `vitest` for testing. The agent is expected to be able to run `npm install`, `npm run check`, and other scripts defined in `package.json`.

## Project Overview

This project is a TypeScript-based networking library for a frontend application to communicate with a game server. Its primary goal is to provide a stable, resilient, and easy-to-use API for game developers, while handling the complexities of network state, protocol specifics, and error recovery internally.

### Game Flow Notes

- **Standard Spin**: `spin()` resolves, and the state transitions: `IN_GAME` -> `SPINNING` -> `SPINEND` (on win) or `IN_GAME` (no win).
- **Player Choice Spin**: This is a multi-step process.
  1.  Call `spin()`. The promise resolves normally. The state transitions: `IN_GAME` -> `SPINNING` -> `WAITTING_PLAYER`.
  2.  In the `WAITTING_PLAYER` state, the `UserInfo` object will contain an `optionals` array with choices.
  3.  Call `selectOptional(index)`. This promise resolves with the final outcome of the choice. The state transitions: `WAITTING_PLAYER` -> `PLAYER_CHOICING` -> `SPINEND` (on win) or `IN_GAME` (no win).

## Key Commands

- **Install dependencies**:
  ```bash
  npm install
  ```
- **Run all checks (lint, test, build)**:
  ```bash
  npm run check
  ```
- **Run tests with coverage**:
  ```bash
  npm test
  ```
- **Build the project**:
  ```bash
  npm run build
  ```

## Code Style and Principles

- **TypeScript First**: All code must have complete and accurate type definitions.
- **Minimal Dependencies**: Do not add new production dependencies without a strong justification.
- **High Test Coverage**: All logical code must be covered by unit tests. The target coverage is >90%.
- **Clarity and Simplicity**: The internal code should be well-commented, and the public API must remain simple and intuitive.

## Testing Strategy

- **Unit Tests (`tests/*.test.ts`)**: These test individual classes in isolation, using `vi.mock()` to mock dependencies.
- **Integration Tests (`tests/integration.test.ts`)**: These verify end-to-end functionality using a mock WebSocket server (`tests/mock-server.ts`). Prefer adding integration tests for new features or bug fixes related to client-server communication.
- **Test-Driven Development**: For new features, write tests first. For bug fixes, first write a failing test that reproduces the bug.

## Custom Instructions

- **Agent, to validate your work, run this command:**
  ```bash
  npm run check
  ```
- When adding new features, please add corresponding tests.
- When fixing a bug, please add a test that reproduces the bug first.
- Please keep the documentation (`jules.md`, `README.md`) up to date with your changes.
