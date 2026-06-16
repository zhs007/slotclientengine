import type { V5GProjectConfig } from "../v5g/types";

export interface ViewerControlsOptions {
  project: V5GProjectConfig;
  container: HTMLElement;
  onTogglePlay: () => void;
  onRestart: () => void;
  onLoopChange: (loop: boolean) => void;
  onSeekStart: () => void;
  onSeek: (time: number) => void;
}

export interface ViewerControls {
  setPlaying(isPlaying: boolean): void;
  setTime(time: number): void;
  setLoop(loop: boolean): void;
}

export function createViewerControls(
  options: ViewerControlsOptions,
): ViewerControls {
  const root = document.createElement("div");
  root.className = "viewer-controls";

  const summary = document.createElement("div");
  summary.className = "viewer-summary";
  const animationTypes = [
    ...new Set(
      options.project.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ),
  ].join(", ");
  summary.innerHTML = `
    <strong>${escapeHtml(options.project.name)}</strong>
    <span>${options.project.layers.length} layers</span>
    <span>${options.project.assets.length} assets</span>
    <span>${escapeHtml(animationTypes)}</span>
  `;

  const controls = document.createElement("div");
  controls.className = "control-row";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "control-button primary";
  playButton.textContent = "Play";
  playButton.addEventListener("click", options.onTogglePlay);

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.className = "control-button";
  restartButton.textContent = "Restart";
  restartButton.addEventListener("click", options.onRestart);

  const loopLabel = document.createElement("label");
  loopLabel.className = "loop-toggle";
  const loopInput = document.createElement("input");
  loopInput.type = "checkbox";
  loopInput.checked = true;
  loopInput.addEventListener("change", () =>
    options.onLoopChange(loopInput.checked),
  );
  const loopText = document.createElement("span");
  loopText.textContent = "Loop";
  loopLabel.append(loopInput, loopText);

  const timeText = document.createElement("span");
  timeText.className = "time-readout";
  timeText.textContent = `0.00 / ${formatTime(options.project.stage.duration)}`;

  const range = document.createElement("input");
  range.type = "range";
  range.className = "timeline";
  range.min = "0";
  range.max = String(options.project.stage.duration);
  range.step = "0.01";
  range.value = "0";
  range.addEventListener("pointerdown", options.onSeekStart);
  range.addEventListener("input", () => {
    options.onSeek(Number(range.value));
  });

  controls.append(playButton, restartButton, loopLabel, timeText, range);
  root.append(summary, controls);
  options.container.appendChild(root);

  return {
    setPlaying(isPlaying: boolean): void {
      playButton.textContent = isPlaying ? "Pause" : "Play";
      playButton.classList.toggle("is-playing", isPlaying);
    },
    setTime(time: number): void {
      const formatted = formatTime(time);
      range.value = formatted;
      timeText.textContent = `${formatted} / ${formatTime(
        options.project.stage.duration,
      )}`;
    },
    setLoop(loop: boolean): void {
      loopInput.checked = loop;
    },
  };
}

function formatTime(time: number): string {
  return time.toFixed(2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
