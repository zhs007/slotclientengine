export type AnimationSelectControls = {
  root: HTMLElement;
  select: HTMLSelectElement;
  replayButton: HTMLButtonElement;
  loopCheckbox: HTMLInputElement;
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
  description.textContent = "直接消费 cabin atlas 与 JSON 数据，使用手写 Pixi 播放层而不是 Spine 运行时。";

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

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = "<div>Animations: cabin, cabin_s</div><div>Timelines: translate, rotate, scale, attachment, color</div>";

  controls.append(selectGroup, actionGroup);
  root.append(eyebrow, title, description, controls, meta);

  return {
    root,
    select,
    replayButton,
    loopCheckbox
  };
}