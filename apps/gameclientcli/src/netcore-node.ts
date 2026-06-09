import WebSocket from "ws";

export function installNodeWebSocket(): void {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
}
