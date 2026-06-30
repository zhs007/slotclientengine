export interface GameLoadingDom {
  readonly progressValue: HTMLElement;
  readonly errorText: HTMLElement;
  setProgress(progress: number): void;
  setError(message: string): void;
  destroy(): void;
}

const STYLE_ID_PREFIX = "sce-game-loading-style-";
let nextStyleId = 0;

export function createGameLoadingDom(root: HTMLElement): GameLoadingDom {
  const document = root.ownerDocument;
  const style = document.createElement("style");
  style.id = `${STYLE_ID_PREFIX}${++nextStyleId}`;
  style.textContent = `
.sce-game-loading {
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
.sce-game-loading__panel {
  width: min(360px, calc(100% - 48px));
}
.sce-game-loading__label {
  margin-bottom: 12px;
  color: #cbd5e1;
  font-size: 14px;
  line-height: 1.4;
}
.sce-game-loading__track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: #1f2937;
}
.sce-game-loading__bar {
  width: 0%;
  height: 100%;
  background: #fbbf24;
  transition: width 120ms ease;
}
.sce-game-loading__meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.4;
  color: #94a3b8;
}
.sce-game-loading__error {
  margin-top: 12px;
  min-height: 20px;
  color: #f87171;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
`;
  document.head.append(style);

  const container = document.createElement("div");
  container.className = "sce-game-loading";
  const panel = document.createElement("div");
  panel.className = "sce-game-loading__panel";
  const label = document.createElement("div");
  label.className = "sce-game-loading__label";
  label.textContent = "Loading";
  const track = document.createElement("div");
  track.className = "sce-game-loading__track";
  const bar = document.createElement("div");
  bar.className = "sce-game-loading__bar";
  const meta = document.createElement("div");
  meta.className = "sce-game-loading__meta";
  const status = document.createElement("span");
  status.textContent = "Preparing";
  const progressValue = document.createElement("span");
  progressValue.textContent = "0%";
  const errorText = document.createElement("div");
  errorText.className = "sce-game-loading__error";
  errorText.setAttribute("role", "alert");
  errorText.setAttribute("aria-live", "polite");

  track.append(bar);
  meta.append(status, progressValue);
  panel.append(label, track, meta, errorText);
  container.append(panel);
  root.replaceChildren(container);

  let destroyed = false;
  return {
    progressValue,
    errorText,
    setProgress(progress: number): void {
      if (destroyed) {
        return;
      }
      const normalized = Math.max(0, Math.min(100, Math.round(progress)));
      bar.style.width = `${normalized}%`;
      progressValue.textContent = `${normalized}%`;
      status.textContent = normalized >= 100 ? "Ready" : "Loading";
    },
    setError(message: string): void {
      if (destroyed) {
        return;
      }
      errorText.textContent = message;
      status.textContent = "Error";
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      style.remove();
      if (container.parentElement === root) {
        root.replaceChildren();
      } else {
        container.remove();
      }
    },
  };
}
