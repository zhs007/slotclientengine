export type MouseMode = "select" | "pan";

export type AnimationSelectControls = {
  root: HTMLElement;
  select: HTMLSelectElement;
  replayButton: HTMLButtonElement;
  loopCheckbox: HTMLInputElement;
  setMouseMode: (mode: MouseMode) => void;
  setSelection: (selection: { name: string; type: string; parentName: string | null } | null) => void;
  setZoom: (zoom: number) => void;
  onMouseModeChange: (listener: (mode: MouseMode) => void) => void;
};

export function createAnimationSelect(animationNames: string[]): AnimationSelectControls {
  const root = document.createElement("section");
  root.className = "panel";

  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Spine To Pixiani";

  const title = document.createElement("h1");
  title.textContent = "Cabin Demo";

  const description = document.createElement("p");
  description.textContent = "直接消费 cabin atlas 与 JSON 数据，使用手写 Pixi 播放层而不是 Spine 运行时；点击右侧节点树会在舞台中直接显示选中框。";

  const controls = document.createElement("div");
  controls.className = "controls";

  const selectGroup = document.createElement("div");
  selectGroup.className = "control-group";

  const selectLabel = document.createElement("label");
  selectLabel.textContent = "Animation";
  selectLabel.htmlFor = "animation-select";

  const select = document.createElement("select");
  select.id = "animation-select";
  for (const animationName of animationNames) {
    const option = document.createElement("option");
    option.value = animationName;
    option.textContent = animationName;
    select.appendChild(option);
  }

  selectGroup.append(selectLabel, select);

  const actionGroup = document.createElement("div");
  actionGroup.className = "control-group";

  const actionLabel = document.createElement("div");
  actionLabel.className = "toggle-label";
  actionLabel.textContent = "Playback";

  const row = document.createElement("div");
  row.className = "control-row";

  const replayButton = document.createElement("button");
  replayButton.type = "button";
  replayButton.textContent = "Replay";

  const toggle = document.createElement("label");
  toggle.className = "toggle";

  const loopCheckbox = document.createElement("input");
  loopCheckbox.type = "checkbox";
  loopCheckbox.checked = true;

  const loopText = document.createElement("span");
  loopText.textContent = "Loop";

  toggle.append(loopCheckbox, loopText);
  row.append(replayButton, toggle);
  actionGroup.append(actionLabel, row);

  const modeGroup = document.createElement("div");
  modeGroup.className = "control-group";

  const modeLabel = document.createElement("div");
  modeLabel.className = "toggle-label";
  modeLabel.textContent = "Mouse Mode";

  const modeRow = document.createElement("div");
  modeRow.className = "mode-row";

  const selectModeButton = document.createElement("button");
  selectModeButton.type = "button";
  selectModeButton.className = "mode-button";
  selectModeButton.textContent = "Select";

  const panModeButton = document.createElement("button");
  panModeButton.type = "button";
  panModeButton.className = "mode-button";
  panModeButton.textContent = "Pan";

  modeRow.append(selectModeButton, panModeButton);
  modeGroup.append(modeLabel, modeRow);

  const debugState = document.createElement("div");
  debugState.className = "debug-state";

  const modeValue = createStatRow("Mode", "select");
  const selectedValue = createStatRow("Selected", "Nothing selected");
  const typeValue = createStatRow("Type", "-", "muted");
  const parentValue = createStatRow("Parent", "-", "muted");
  const zoomValue = createStatRow("Zoom", "100%");

  debugState.append(modeValue.row, selectedValue.row, typeValue.row, parentValue.row, zoomValue.row);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML =
    "<div>Animations: cabin, cabin_s</div><div>Debug view: tree-driven selection box, bone picking, viewport pan/zoom</div>";

  controls.append(selectGroup, actionGroup, modeGroup, debugState);
  root.append(eyebrow, title, description, controls, meta);

  let mouseMode: MouseMode = "select";
  const listeners = new Set<(mode: MouseMode) => void>();

  const applyMouseMode = (nextMode: MouseMode) => {
    mouseMode = nextMode;
    selectModeButton.classList.toggle("is-active", nextMode === "select");
    panModeButton.classList.toggle("is-active", nextMode === "pan");
    modeValue.value.textContent = nextMode;
  };

  const setMouseMode = (nextMode: MouseMode) => {
    if (nextMode === mouseMode) {
      applyMouseMode(nextMode);
      return;
    }

    applyMouseMode(nextMode);
    for (const listener of listeners) {
      listener(nextMode);
    }
  };

  selectModeButton.addEventListener("click", () => setMouseMode("select"));
  panModeButton.addEventListener("click", () => setMouseMode("pan"));
  applyMouseMode(mouseMode);

  return {
    root,
    select,
    replayButton,
    loopCheckbox,
    setMouseMode,
    setSelection(selection) {
      selectedValue.value.textContent = selection?.name ?? "Nothing selected";
      typeValue.value.textContent = selection?.type ?? "-";
      parentValue.value.textContent = selection?.parentName ?? "-";
      selectedValue.value.classList.toggle("is-muted", !selection);
      typeValue.value.classList.toggle("is-muted", !selection);
      parentValue.value.classList.toggle("is-muted", !selection);
    },
    setZoom(zoom) {
      zoomValue.value.textContent = `${Math.round(zoom * 100)}%`;
    },
    onMouseModeChange(listener) {
      listeners.add(listener);
    }
  };
}

function createStatRow(label: string, value: string, valueClassName?: string) {
  const row = document.createElement("div");
  row.className = "debug-stat";

  const name = document.createElement("span");
  name.className = "debug-stat-label";
  name.textContent = label;

  const content = document.createElement("strong");
  content.className = "debug-stat-value";
  if (valueClassName) {
    content.classList.add(valueClassName);
  }
  content.textContent = value;

  row.append(name, content);

  return {
    row,
    value: content
  };
}