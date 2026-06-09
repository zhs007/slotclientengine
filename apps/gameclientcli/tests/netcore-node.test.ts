import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { installNodeWebSocket } from "../src/netcore-node";

describe("installNodeWebSocket", () => {
  it("installs ws as global WebSocket", () => {
    const originalWebSocket = globalThis.WebSocket;

    try {
      installNodeWebSocket();
      expect(globalThis.WebSocket).toBe(WebSocket);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
