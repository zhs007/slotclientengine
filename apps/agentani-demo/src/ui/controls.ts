import type { AnimationRegistryEntry } from "../animations/types.js";

export interface ControlPanel {
  root: HTMLElement;
  select: HTMLSelectElement;
  playButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  replayButton: HTMLButtonElement;
  loopCheckbox: HTMLInputElement;
  statusLabel: HTMLElement;
  title: HTMLElement;
}

export function createControlPanel(
  entries: readonly AnimationRegistryEntry[],
): ControlPanel {
  const root = document.createElement("aside");
  root.className = "control-panel";

  const title = document.createElement("h1");
  title.textContent = "agentani-demo";

  const selectLabel = document.createElement("label");
  selectLabel.className = "field-label";
  selectLabel.textContent = "动画";

  const select = document.createElement("select");
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent =
      entry.status === "ready" ? entry.label : `${entry.label}（未转换）`;
    option.disabled = entry.status !== "ready";
    select.appendChild(option);
  }
  selectLabel.appendChild(select);

  const actions = document.createElement("div");
  actions.className = "actions";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.textContent = "播放";

  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.textContent = "暂停";

  const replayButton = document.createElement("button");
  replayButton.type = "button";
  replayButton.textContent = "重播";

  actions.append(playButton, pauseButton, replayButton);

  const loopLabel = document.createElement("label");
  loopLabel.className = "loop-toggle";
  const loopCheckbox = document.createElement("input");
  loopCheckbox.type = "checkbox";
  loopCheckbox.checked = true;
  loopLabel.append(loopCheckbox, document.createTextNode("循环"));

  const statusLabel = document.createElement("p");
  statusLabel.className = "status";

  root.append(title, selectLabel, actions, loopLabel, statusLabel);
  return {
    root,
    select,
    playButton,
    pauseButton,
    replayButton,
    loopCheckbox,
    statusLabel,
    title,
  };
}
