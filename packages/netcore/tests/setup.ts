// This file is used to set up the test environment for Vitest.
// It is referenced in `vitest.config.ts`.

// HACK: Forcefully define a global WebSocket implementation for the Node.js test environment.
// This is necessary because of a stubborn issue in the CI environment where
// standard polyfilling methods were not working reliably.
import WebSocket from 'ws';

// Vitest with 'globals: true' doesn't seem to need this, but the CI runner does.
// To be safe, we explicitly assign it.
(global as any).WebSocket = WebSocket;
