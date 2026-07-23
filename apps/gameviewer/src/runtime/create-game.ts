import { createSceneLayoutSlotGameTemplate } from "@slotclientengine/gameframeworks/scene-layout-template";
import type { GameViewerLaunchPayloadV1 } from "./launch-payload.js";

export async function createRuntimeGame(
  root: HTMLElement,
  payload: GameViewerLaunchPayloadV1,
): Promise<() => void> {
  const framework = await createSceneLayoutSlotGameTemplate({
    root,
    layoutZipBytes: payload.layoutZipBytes,
    expectedLayoutSha256: payload.layoutSha256,
    config: payload.config,
    credential: payload.credential,
  });
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    framework.destroy();
  };
  try {
    await framework.connect();
    return destroy;
  } catch (error) {
    destroy();
    throw error;
  }
}
