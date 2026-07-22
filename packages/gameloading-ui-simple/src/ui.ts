import type {
  GameLoadingUi,
  GameLoadingUiCreateContext,
  GameLoadingUiFactory,
  GameLoadingUiSnapshot,
} from "@slotclientengine/gameloading";

let nextInstanceId = 0;

export function createSimpleGameLoadingUi(): GameLoadingUiFactory {
  return Object.freeze({
    create: ({ root }: GameLoadingUiCreateContext) => createUi(root),
  });
}

function createUi(root: HTMLElement): GameLoadingUi {
  const document = root.ownerDocument;
  const instanceId = `sce-simple-loading-${++nextInstanceId}`;
  const selector = `[data-sce-simple-loading="${instanceId}"]`;
  const style = document.createElement("style");
  style.dataset.sceSimpleLoadingStyle = instanceId;
  style.textContent = createStyles(selector);
  document.head.append(style);

  const container = document.createElement("div");
  container.dataset.sceSimpleLoading = instanceId;
  container.className = "sce-simple-loading";
  const panel = document.createElement("div");
  panel.className = "sce-simple-loading__panel";
  const label = document.createElement("div");
  label.className = "sce-simple-loading__label";
  label.textContent = "Loading";
  const track = document.createElement("div");
  track.className = "sce-simple-loading__track";
  const bar = document.createElement("div");
  bar.className = "sce-simple-loading__bar";
  const meta = document.createElement("div");
  meta.className = "sce-simple-loading__meta";
  const status = document.createElement("span");
  status.className = "sce-simple-loading__status";
  const progressValue = document.createElement("span");
  progressValue.className = "sce-simple-loading__progress";
  const errorText = document.createElement("div");
  errorText.className = "sce-simple-loading__error";
  errorText.setAttribute("role", "alert");
  errorText.setAttribute("aria-live", "polite");

  track.append(bar);
  meta.append(status, progressValue);
  panel.append(label, track, meta, errorText);
  container.append(panel);
  root.replaceChildren(container);

  let destroyed = false;
  return {
    update(snapshot: GameLoadingUiSnapshot): void {
      if (destroyed) {
        return;
      }
      const progress = normalizeProgress(snapshot.progress);
      bar.style.width = `${progress}%`;
      progressValue.textContent = `${progress}%`;
      status.textContent = statusFor(snapshot);
      errorText.textContent = snapshot.error ?? "";
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      style.remove();
      container.remove();
    },
  };
}

function normalizeProgress(value: number): number {
  const finite = Number.isFinite(value) ? value : 0;
  return Math.round(Math.max(0, Math.min(100, finite)));
}

function statusFor(snapshot: GameLoadingUiSnapshot): string {
  switch (snapshot.phase) {
    case "loading-resources":
      return "Loading";
    case "preparing":
      return "Preparing";
    case "entering-game":
      return "Ready";
    case "error":
      return "Error";
    default:
      return "Loading";
  }
}

function createStyles(selector: string): string {
  return `
${selector} {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 180px;
  display: grid;
  place-items: center;
  background: #05070a;
  color: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
${selector} .sce-simple-loading__panel { width: min(360px, calc(100% - 48px)); }
${selector} .sce-simple-loading__label { margin-bottom: 12px; color: #cbd5e1; font-size: 14px; line-height: 1.4; }
${selector} .sce-simple-loading__track { width: 100%; height: 8px; overflow: hidden; border-radius: 999px; background: #1f2937; }
${selector} .sce-simple-loading__bar { width: 0%; height: 100%; background: #fbbf24; transition: width 120ms ease; }
${selector} .sce-simple-loading__meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; color: #94a3b8; font-size: 13px; line-height: 1.4; }
${selector} .sce-simple-loading__error { min-height: 20px; margin-top: 12px; color: #f87171; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
`;
}
