import type { VNIProjectConfig } from "@slotclientengine/vnicore/core";

export interface ViewerControlsProject {
  id: string;
  label: string;
  sourcePath: string;
  bundleId: string;
  profileId: string;
  purpose: string;
  assetScale: number;
  project: VNIProjectConfig;
}

export interface ViewerControlsOptions {
  projects: readonly ViewerControlsProject[];
  selectedProjectId: string;
  container: HTMLElement;
  onProjectChange: (projectId: string) => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onLoopChange: (loop: boolean) => void;
  onSeekStart: () => void;
  onSeek: (time: number) => void;
}

export interface ViewerControls {
  setProject(project: ViewerControlsProject): void;
  setPlaying(isPlaying: boolean): void;
  setTime(time: number): void;
  setLoop(loop: boolean): void;
}

export function createViewerControls(
  options: ViewerControlsOptions,
): ViewerControls {
  const selectedProject = options.projects.find(
    (project) => project.id === options.selectedProjectId,
  );
  if (!selectedProject) {
    throw new Error(
      `Unknown selected V5G project: ${options.selectedProjectId}`,
    );
  }
  let currentProject: ViewerControlsProject = selectedProject;

  const root = document.createElement("div");
  root.className = "viewer-controls";

  const projectRow = document.createElement("div");
  projectRow.className = "project-row";
  const projectLabel = document.createElement("label");
  projectLabel.className = "project-picker";
  const projectText = document.createElement("span");
  projectText.textContent = "Project";
  const projectSelect = document.createElement("select");
  projectSelect.setAttribute("aria-label", "V5G project");
  for (const project of options.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.label;
    projectSelect.appendChild(option);
  }
  projectSelect.value = currentProject.id;
  projectSelect.addEventListener("change", () => {
    options.onProjectChange(projectSelect.value);
  });
  projectLabel.append(projectText, projectSelect);
  projectRow.appendChild(projectLabel);

  const summary = document.createElement("div");
  summary.className = "viewer-summary";

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

  const range = document.createElement("input");
  range.type = "range";
  range.className = "timeline";
  range.min = "0";
  range.step = "0.01";
  range.addEventListener("pointerdown", options.onSeekStart);
  range.addEventListener("input", () => {
    options.onSeek(Number(range.value));
  });

  controls.append(playButton, restartButton, loopLabel, timeText, range);
  root.append(projectRow, summary, controls);
  options.container.appendChild(root);

  function renderProject(project: ViewerControlsProject): void {
    currentProject = project;
    projectSelect.value = project.id;
    summary.replaceChildren(
      createSummaryStrong(project.project.name),
      createSummaryItem(project.sourcePath),
      createSummaryItem(`schema ${project.project.schemaVersion}`),
      createSummaryItem(`profile ${project.profileId}`),
      createSummaryItem(`purpose ${project.purpose}`),
      createSummaryItem(`assetScale ${formatScale(project.assetScale)}`),
      createSummaryItem(`${project.project.layers.length} layers`),
      createSummaryItem(`${project.project.assets.length} assets`),
      createSummaryItem(
        `${formatTime(project.project.stage.duration)}s duration`,
      ),
      createSummaryItem(getAnimationTypeSummary(project.project)),
    );
    range.max = String(project.project.stage.duration);
    range.value = "0.00";
    timeText.textContent = `0.00 / ${formatTime(project.project.stage.duration)}`;
    playButton.textContent = "Play";
    playButton.classList.remove("is-playing");
  }

  renderProject(currentProject);

  return {
    setProject(project: ViewerControlsProject): void {
      renderProject(project);
    },
    setPlaying(isPlaying: boolean): void {
      playButton.textContent = isPlaying ? "Pause" : "Play";
      playButton.classList.toggle("is-playing", isPlaying);
    },
    setTime(time: number): void {
      const formatted = formatTime(time);
      range.value = formatted;
      timeText.textContent = `${formatted} / ${formatTime(
        currentProject.project.stage.duration,
      )}`;
    },
    setLoop(loop: boolean): void {
      loopInput.checked = loop;
    },
  };
}

function createSummaryStrong(value: string): HTMLElement {
  const element = document.createElement("strong");
  element.textContent = value;
  return element;
}

function createSummaryItem(value: string): HTMLElement {
  const element = document.createElement("span");
  element.textContent = value;
  return element;
}

function getAnimationTypeSummary(project: VNIProjectConfig): string {
  const animationTypes = [
    ...new Set(
      project.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ),
  ];
  return animationTypes.length > 0
    ? animationTypes.join(", ")
    : "no animations";
}

function formatTime(time: number): string {
  return time.toFixed(2);
}

function formatScale(scale: number): string {
  return Number.isFinite(scale) ? String(scale) : "unknown";
}
