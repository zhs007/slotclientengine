import type { PixiAnimationRegistryEntry } from "../animations/pixi/types.js";

export interface ControlPanel {
  root: HTMLElement;
  select: HTMLSelectElement;
  title: HTMLElement;
  status: HTMLElement;
  loop: HTMLInputElement;
  play: HTMLButtonElement;
  pause: HTMLButtonElement;
  replay: HTMLButtonElement;
}

function button(label: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  return element;
}

export function createControlPanel(
  entries: PixiAnimationRegistryEntry[],
): ControlPanel {
  const root = document.createElement("aside");
  root.className = "control-panel";

  const title = document.createElement("h1");
  title.textContent = "agentani-demo2";

  const status = document.createElement("p");
  status.className = "status";
  status.textContent = "准备加载 bg。";

  const select = document.createElement("select");
  for (const entry of entries) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent =
      entry.status === "ready" ? entry.label : `${entry.label}（未转换）`;
    option.disabled = entry.status !== "ready";
    select.appendChild(option);
  }

  const play = button("播放");
  const pause = button("暂停");
  const replay = button("重播");

  const loopLabel = document.createElement("label");
  loopLabel.className = "loop-control";
  const loop = document.createElement("input");
  loop.type = "checkbox";
  loop.checked = true;
  loopLabel.append(loop, "循环");

  const row = document.createElement("div");
  row.className = "button-row";
  row.append(play, pause, replay);

  root.append(title, select, row, loopLabel, status);
  return { root, select, title, status, loop, play, pause, replay };
}
