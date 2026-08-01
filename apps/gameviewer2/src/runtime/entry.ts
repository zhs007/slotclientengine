import { createSceneOtherSceneFlowRuntime } from "@slotclientengine/rendercore/scene-layout";
import { receiveRuntimePayload } from "./launch-channel.js";

export async function startRuntimeWindow(root: HTMLElement): Promise<void> {
  root.innerHTML =
    '<main class="runtime"><div class="runtime-toolbar"><strong>Game Viewer 2</strong><span data-status>等待本地配置…</span><button data-replay disabled>重新播放</button></div><div class="runtime-stage" data-stage></div></main>';
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const stage = root.querySelector<HTMLElement>("[data-stage]")!;
  const replay = root.querySelector<HTMLButtonElement>("[data-replay]")!;
  try {
    const payload = await receiveRuntimePayload();
    const runtime = await createSceneOtherSceneFlowRuntime({
      root: stage,
      layoutZipBytes: new Uint8Array(payload.layoutZip),
      expectedLayoutSha256: payload.layoutSha256,
      project: payload.project,
    });
    const resize = () =>
      runtime.applyViewport({
        width: Math.max(1, stage.clientWidth),
        height: Math.max(1, stage.clientHeight),
      });
    new ResizeObserver(resize).observe(stage);
    resize();
    replay.disabled = false;
    replay.addEventListener("click", () => runtime.replay());
    status.textContent = `${runtime.readiness.layout.layoutId} · ${runtime.readiness.layout.renderMode}`;
    runtime.play();
    window.addEventListener("beforeunload", () => runtime.destroy(), {
      once: true,
    });
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    status.classList.add("error");
  }
}
