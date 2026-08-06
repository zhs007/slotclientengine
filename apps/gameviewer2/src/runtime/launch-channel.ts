import type { SceneOtherSceneFlowProjectV2 } from "@slotclientengine/rendercore/scene-layout";
import type { finalizeSlotOperationAuthoringProject } from "@slotclientengine/slotoperationauthoring";

export interface GameViewer2LaunchPayloadV3 {
  readonly kind: "gameviewer2-launch";
  readonly version: 3;
  readonly layoutSha256: string;
  readonly layoutZip: ArrayBuffer;
  readonly project: SceneOtherSceneFlowProjectV2;
  readonly operationPlan: ReturnType<
    typeof finalizeSlotOperationAuthoringProject
  >;
}

const HANDSHAKE = "gameviewer2-channel-v3";

export function launchRuntimeWindow(payload: GameViewer2LaunchPayloadV3): void {
  const target = window.open(`${window.location.pathname}?runtime=1`, "_blank");
  if (!target) throw new Error("浏览器阻止了预览窗口，请允许弹出窗口。");
  const channel = new MessageChannel();
  target.addEventListener(
    "load",
    () => {
      target.postMessage({ kind: HANDSHAKE }, window.location.origin, [
        channel.port2,
      ]);
      channel.port1.postMessage(payload, [payload.layoutZip]);
      channel.port1.close();
    },
    { once: true },
  );
}

export function receiveRuntimePayload(): Promise<GameViewer2LaunchPayloadV3> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("等待编辑器传入本地预览数据超时。"));
    }, 15_000);
    const onMessage = (event: MessageEvent): void => {
      if (
        event.origin !== window.location.origin ||
        event.data?.kind !== HANDSHAKE ||
        !event.ports[0]
      )
        return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      const port = event.ports[0];
      port.onmessage = (message: MessageEvent<unknown>) => {
        try {
          resolve(parseLaunchPayload(message.data));
        } catch (error) {
          reject(error);
        } finally {
          port.close();
        }
      };
      port.start();
    };
    window.addEventListener("message", onMessage);
  });
}

export function parseLaunchPayload(input: unknown): GameViewer2LaunchPayloadV3 {
  if (typeof input !== "object" || input === null)
    throw new Error("预览数据无效。");
  const value = input as Partial<GameViewer2LaunchPayloadV3>;
  if (value.kind !== "gameviewer2-launch" || value.version !== 3)
    throw new Error("预览协议版本不受支持。");
  if (!(value.layoutZip instanceof ArrayBuffer))
    throw new Error("预览数据缺少 layout ZIP。");
  if (
    typeof value.layoutSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.layoutSha256)
  )
    throw new Error("预览 layout hash 无效。");
  if (!value.project) throw new Error("预览数据缺少流程项目。");
  if (!value.operationPlan)
    throw new Error("预览数据缺少 finalized operation plan。");
  return value as GameViewer2LaunchPayloadV3;
}
