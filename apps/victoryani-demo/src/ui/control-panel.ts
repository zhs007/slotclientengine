import type { AnimationSupportEntry, VictoryProjectConfig } from "../config/victory-types.js";

export interface ControlPanel {
  root: HTMLElement;
  playButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  replayButton: HTMLButtonElement;
  loopCheckbox: HTMLInputElement;
  timeLabel: HTMLElement;
  statusLabel: HTMLElement;
}

export function createControlPanel(project: VictoryProjectConfig, supportMatrix: AnimationSupportEntry[]): ControlPanel {
  const root = document.createElement("aside");
  root.className = "control-panel";

  const title = document.createElement("h1");
  title.className = "control-panel__title";
  title.textContent = project.name;

  const meta = document.createElement("p");
  meta.className = "control-panel__meta";
  meta.textContent = `${project.layers.length} layers · ${project.duration.toFixed(1)}s · ${collectUsedAnimations(project).length} presets`;

  const actions = document.createElement("div");
  actions.className = "control-panel__actions";

  const playButton = createButton("Play", "is-primary");
  const stopButton = createButton("Stop");
  const replayButton = createButton("Replay");
  actions.append(playButton, stopButton, replayButton);

  const toggles = document.createElement("label");
  toggles.className = "control-panel__toggle";
  const loopCheckbox = document.createElement("input");
  loopCheckbox.type = "checkbox";
  loopCheckbox.checked = true;
  const loopText = document.createElement("span");
  loopText.textContent = "Loop playback";
  toggles.append(loopCheckbox, loopText);

  const statusLabel = document.createElement("p");
  statusLabel.className = "control-panel__status";
  statusLabel.textContent = "Ready";

  const timeLabel = document.createElement("p");
  timeLabel.className = "control-panel__time";
  timeLabel.textContent = `0.00s / ${project.duration.toFixed(2)}s`;

  const usedSection = document.createElement("section");
  usedSection.className = "control-panel__section";
  usedSection.append(createSectionTitle("Used in sample"), createTagList(collectUsedAnimations(project)));

  const supportSection = document.createElement("section");
  supportSection.className = "control-panel__section";
  supportSection.append(createSectionTitle("Support matrix"), createSupportList(supportMatrix));

  root.append(title, meta, actions, toggles, statusLabel, timeLabel, usedSection, supportSection);

  return {
    root,
    playButton,
    stopButton,
    replayButton,
    loopCheckbox,
    timeLabel,
    statusLabel
  };
}

function collectUsedAnimations(project: VictoryProjectConfig) {
  return [...new Set(project.layers.flatMap((layer) => layer.animations.map((animation) => animation.type)))].sort();
}

function createButton(label: string, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `control-panel__button ${extraClass}`.trim();
  button.textContent = label;
  return button;
}

function createSectionTitle(label: string) {
  const title = document.createElement("h2");
  title.className = "control-panel__section-title";
  title.textContent = label;
  return title;
}

function createTagList(values: string[]) {
  const list = document.createElement("div");
  list.className = "tag-list";
  for (const value of values) {
    const tag = document.createElement("span");
    tag.className = "tag-list__item";
    tag.textContent = value;
    list.appendChild(tag);
  }
  return list;
}

function createSupportList(entries: AnimationSupportEntry[]) {
  const list = document.createElement("ul");
  list.className = "support-list";
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = `support-list__item support-list__item--${entry.status}`;
    item.textContent = `${entry.type}: ${entry.note}`;
    list.appendChild(item);
  }
  return list;
}