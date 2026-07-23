import type { SceneLayoutTemplateCredential } from "@slotclientengine/gameframeworks/scene-layout-template";
import {
  parseGameViewerLaunchPayload,
  type GameViewerLaunchPayloadV1,
} from "./launch-payload.js";

const HANDSHAKE_TIMEOUT_MS = 15_000;

export interface RuntimeLaunchInput {
  readonly layoutSha256: string;
  readonly layoutZipBytes: Uint8Array;
  readonly config: GameViewerLaunchPayloadV1["config"];
  readonly credential: SceneLayoutTemplateCredential;
}

export function launchRuntimeWindow(
  input: RuntimeLaunchInput,
  host: Window = window,
): Promise<void> {
  const nonce = createNonce();
  const runtimeUrl = new URL(host.location.href);
  runtimeUrl.searchParams.set("runtime", "1");
  runtimeUrl.hash = `nonce=${encodeURIComponent(nonce)}`;
  // This must remain the first browser-side effect in the click call stack.
  const child = host.open(runtimeUrl.href, "_blank");
  if (!child)
    return Promise.reject(
      new Error("浏览器阻止了新窗口，请允许本站弹出窗口后重试。"),
    );

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = host.setTimeout(
      () => fail(new Error("运行窗口启动握手超时。")),
      HANDSHAKE_TIMEOUT_MS,
    );
    const cleanup = (): void => {
      host.clearTimeout(timeout);
      host.removeEventListener("message", onMessage);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onMessage = (event: MessageEvent): void => {
      if (
        event.origin !== host.location.origin ||
        event.source !== child ||
        !isHandshakeMessage(event.data, "game-viewer-runtime-ready", nonce)
      )
        return;
      host.removeEventListener("message", onMessage);
      const channel = new MessageChannel();
      let payloadSent = false;
      channel.port1.onmessage = (portEvent: MessageEvent) => {
        if (
          isHandshakeMessage(
            portEvent.data,
            "game-viewer-runtime-accepted",
            nonce,
          )
        ) {
          if (!payloadSent) {
            fail(new Error("运行窗口在接收 payload 前提前确认。"));
            channel.port1.close();
            return;
          }
          channel.port1.close();
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
          return;
        }
        if (
          !isHandshakeMessage(
            portEvent.data,
            "game-viewer-runtime-port-ready",
            nonce,
          )
        ) {
          fail(new Error("运行窗口 MessageChannel 响应无效。"));
          channel.port1.close();
          return;
        }
        if (payloadSent) {
          fail(new Error("运行窗口重复请求启动 payload。"));
          channel.port1.close();
          return;
        }
        payloadSent = true;
        const bytes = input.layoutZipBytes.slice();
        const payload: GameViewerLaunchPayloadV1 = Object.freeze({
          kind: "game-viewer-launch",
          version: 1,
          nonce,
          layoutSha256: input.layoutSha256,
          layoutZipBytes: bytes,
          config: input.config,
          credential: Object.freeze({ ...input.credential }),
        });
        channel.port1.postMessage(payload, [bytes.buffer]);
      };
      channel.port1.start();
      child.postMessage(
        { kind: "game-viewer-runtime-port", nonce },
        host.location.origin,
        [channel.port2],
      );
    };
    host.addEventListener("message", onMessage);
  });
}

export function receiveRuntimeLaunchPayload(
  host: Window = window,
): Promise<GameViewerLaunchPayloadV1> {
  const nonce = readRuntimeNonce(host.location.hash);
  const opener = host.opener;
  if (!opener)
    return Promise.reject(
      new Error("启动会话已失效，请从配置器重新打开运行窗口。"),
    );
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = host.setTimeout(
      () => fail(new Error("等待配置器启动 payload 超时。")),
      HANDSHAKE_TIMEOUT_MS,
    );
    const cleanup = (): void => {
      host.clearTimeout(timeout);
      host.removeEventListener("message", onPort);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onPort = (event: MessageEvent): void => {
      if (
        event.origin !== host.location.origin ||
        event.source !== opener ||
        !isHandshakeMessage(event.data, "game-viewer-runtime-port", nonce)
      )
        return;
      if (event.ports.length !== 1) {
        fail(new Error("启动 MessagePort 数量无效。"));
        return;
      }
      host.removeEventListener("message", onPort);
      const port = event.ports[0];
      let payloadReceived = false;
      port.onmessage = (payloadEvent: MessageEvent) => {
        if (payloadReceived) {
          fail(new Error("运行窗口收到重复启动 payload。"));
          port.close();
          return;
        }
        payloadReceived = true;
        try {
          const payload = parseGameViewerLaunchPayload(
            payloadEvent.data,
            nonce,
          );
          port.postMessage({
            kind: "game-viewer-runtime-accepted",
            nonce,
          });
          port.close();
          settled = true;
          cleanup();
          host.history.replaceState(
            null,
            "",
            `${host.location.pathname}${host.location.search}`,
          );
          try {
            host.opener = null;
          } catch {
            // Some browsers expose a read-only opener. The port is already closed.
          }
          resolve(payload);
        } catch (error) {
          fail(asError(error));
          port.close();
        }
      };
      port.start();
      port.postMessage({
        kind: "game-viewer-runtime-port-ready",
        nonce,
      });
    };
    host.addEventListener("message", onPort);
    opener.postMessage(
      { kind: "game-viewer-runtime-ready", nonce },
      host.location.origin,
    );
  });
}

export function readRuntimeNonce(hash: string): string {
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash,
  );
  const nonce = params.get("nonce");
  if (!nonce || !/^[0-9a-f]{32}$/u.test(nonce))
    throw new Error("运行窗口 URL 缺少有效的一次性 nonce。");
  return nonce;
}

export function isHandshakeMessage(
  value: unknown,
  kind: string,
  nonce: string,
): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).kind === kind &&
    (value as Record<string, unknown>).nonce === nonce
  );
}

function createNonce(): string {
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("当前浏览器缺少 Web Crypto nonce 支持。");
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
