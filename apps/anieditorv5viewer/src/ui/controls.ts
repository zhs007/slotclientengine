import type {
  VNILayerGroupSlot,
  VNIPlaybackState,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export interface ViewerControlsProject {
  id: string;
  label: string;
  sourcePath: string;
  bundleId: string;
  profileId: string;
  purpose: string;
  assetScale: number;
  project: VNIProjectConfig;
  insertionAssets: readonly ViewerInsertionAsset[];
}

export interface ViewerInsertionAsset {
  path: string;
  label: string;
  url: string;
  projectAssetId?: string;
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
  onSegmentedStart: (options: {
    loopStart: number;
    loopEnd: number;
    keepParticlesAlive: boolean;
  }) => void;
  onSegmentedEnd: () => void;
  onInsertBetweenGroups: (options: {
    assetPath: string;
    assetUrl: string;
    projectAssetId?: string;
    afterGroupId: string;
    beforeGroupId: string;
  }) => void;
  onClearInsertedNodes: () => void;
}

export interface ViewerControls {
  setProject(project: ViewerControlsProject): void;
  setPlaying(isPlaying: boolean): void;
  setTime(time: number): void;
  setLoop(loop: boolean): void;
  setPlaybackState(state: VNIPlaybackState): void;
  setAdvancedError(message: string | null): void;
  setLayerGroupSlots(slots: readonly VNILayerGroupSlot[]): void;
  setInsertionError(message: string | null): void;
  setInsertedNodeActive(active: boolean): void;
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
  let currentLayerGroupSlots: readonly VNILayerGroupSlot[] = [];
  let insertedNodeActive = false;

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

  const advancedPanel = document.createElement("section");
  advancedPanel.className = "advanced-playback-panel";
  advancedPanel.setAttribute("aria-label", "高级播放");

  const advancedHeader = document.createElement("div");
  advancedHeader.className = "advanced-playback-header";
  const advancedTitle = document.createElement("strong");
  advancedTitle.textContent = "高级播放";
  const advancedPhase = document.createElement("span");
  advancedPhase.className = "advanced-phase";
  advancedPhase.textContent = "idle";
  advancedHeader.append(advancedTitle, advancedPhase);

  const advancedControls = document.createElement("div");
  advancedControls.className = "advanced-control-row";

  const loopStartLabel = document.createElement("label");
  loopStartLabel.className = "advanced-number";
  const loopStartText = document.createElement("span");
  loopStartText.textContent = "loopStart";
  const loopStartInput = document.createElement("input");
  loopStartInput.type = "number";
  loopStartInput.step = "0.1";
  loopStartInput.min = "0";
  loopStartInput.setAttribute("aria-label", "segmented loop start seconds");
  loopStartLabel.append(loopStartText, loopStartInput);

  const loopEndLabel = document.createElement("label");
  loopEndLabel.className = "advanced-number";
  const loopEndText = document.createElement("span");
  loopEndText.textContent = "loopEnd";
  const loopEndInput = document.createElement("input");
  loopEndInput.type = "number";
  loopEndInput.step = "0.1";
  loopEndInput.min = "0";
  loopEndInput.setAttribute("aria-label", "segmented loop end seconds");
  loopEndLabel.append(loopEndText, loopEndInput);

  const keepParticlesLabel = document.createElement("label");
  keepParticlesLabel.className = "keep-particles-toggle";
  const keepParticlesInput = document.createElement("input");
  keepParticlesInput.type = "checkbox";
  keepParticlesInput.checked = true;
  keepParticlesInput.setAttribute("aria-label", "维持粒子活动");
  const keepParticlesText = document.createElement("span");
  keepParticlesText.textContent = "维持粒子活动";
  keepParticlesLabel.append(keepParticlesInput, keepParticlesText);

  const segmentedStartButton = document.createElement("button");
  segmentedStartButton.type = "button";
  segmentedStartButton.className = "control-button primary";
  segmentedStartButton.textContent = "开始";

  const segmentedEndButton = document.createElement("button");
  segmentedEndButton.type = "button";
  segmentedEndButton.className = "control-button";
  segmentedEndButton.textContent = "结束";
  segmentedEndButton.disabled = true;

  const advancedError = document.createElement("div");
  advancedError.className = "advanced-error";
  advancedError.setAttribute("role", "status");

  advancedControls.append(
    loopStartLabel,
    loopEndLabel,
    keepParticlesLabel,
    segmentedStartButton,
    segmentedEndButton,
  );
  advancedPanel.append(advancedHeader, advancedControls, advancedError);

  const insertionPanel = document.createElement("section");
  insertionPanel.className = "group-insertion-panel";
  insertionPanel.setAttribute("aria-label", "组间插入");

  const insertionHeader = document.createElement("div");
  insertionHeader.className = "group-insertion-header";
  const insertionTitle = document.createElement("strong");
  insertionTitle.textContent = "组间插入";
  const insertionStatus = document.createElement("span");
  insertionStatus.className = "group-insertion-status";
  insertionHeader.append(insertionTitle, insertionStatus);

  const insertionControls = document.createElement("div");
  insertionControls.className = "group-insertion-row";

  const insertionAssetLabel = document.createElement("label");
  insertionAssetLabel.className = "insertion-select";
  const insertionAssetText = document.createElement("span");
  insertionAssetText.textContent = "asset";
  const insertionAssetSelect = document.createElement("select");
  insertionAssetSelect.setAttribute("aria-label", "插入 asset");
  insertionAssetLabel.append(insertionAssetText, insertionAssetSelect);

  const insertionSlotLabel = document.createElement("label");
  insertionSlotLabel.className = "insertion-select";
  const insertionSlotText = document.createElement("span");
  insertionSlotText.textContent = "slot";
  const insertionSlotSelect = document.createElement("select");
  insertionSlotSelect.setAttribute("aria-label", "组间 slot");
  insertionSlotLabel.append(insertionSlotText, insertionSlotSelect);

  const insertionButton = document.createElement("button");
  insertionButton.type = "button";
  insertionButton.className = "control-button primary";
  insertionButton.textContent = "插入";

  const clearInsertionButton = document.createElement("button");
  clearInsertionButton.type = "button";
  clearInsertionButton.className = "control-button";
  clearInsertionButton.textContent = "移除";
  clearInsertionButton.disabled = true;

  const insertionError = document.createElement("div");
  insertionError.className = "group-insertion-error";
  insertionError.setAttribute("role", "status");

  insertionControls.append(
    insertionAssetLabel,
    insertionSlotLabel,
    insertionButton,
    clearInsertionButton,
  );
  insertionPanel.append(insertionHeader, insertionControls, insertionError);

  loopStartInput.addEventListener("input", updateAdvancedValidation);
  loopEndInput.addEventListener("input", updateAdvancedValidation);
  segmentedStartButton.addEventListener("click", () => {
    const parsed = parseAdvancedInputs();
    if (!parsed.ok) {
      setAdvancedError(parsed.message);
      return;
    }
    setAdvancedError(null);
    options.onSegmentedStart({
      loopStart: parsed.loopStart,
      loopEnd: parsed.loopEnd,
      keepParticlesAlive: keepParticlesInput.checked,
    });
  });
  segmentedEndButton.addEventListener("click", options.onSegmentedEnd);
  insertionAssetSelect.addEventListener("change", updateInsertionControls);
  insertionSlotSelect.addEventListener("change", updateInsertionControls);
  insertionButton.addEventListener("click", () => {
    const parsed = parseInsertionInputs();
    if (!parsed.ok) {
      setInsertionError(parsed.message);
      return;
    }
    setInsertionError(null);
    options.onInsertBetweenGroups(parsed);
  });
  clearInsertionButton.addEventListener("click", () => {
    setInsertionError(null);
    options.onClearInsertedNodes();
  });

  controls.append(playButton, restartButton, loopLabel, timeText, range);
  root.append(projectRow, summary, controls, advancedPanel, insertionPanel);
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
    resetAdvancedDefaults(project);
    resetInsertionDefaults(project);
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
    setPlaybackState(state: VNIPlaybackState): void {
      advancedPhase.textContent = state.phase;
      segmentedEndButton.disabled = !(
        state.mode === "segmented" &&
        (state.phase === "start" || state.phase === "loop")
      );
    },
    setAdvancedError(message: string | null): void {
      setAdvancedError(message);
    },
    setLayerGroupSlots(slots: readonly VNILayerGroupSlot[]): void {
      currentLayerGroupSlots = [...slots];
      renderInsertionSlots();
      updateInsertionControls();
    },
    setInsertionError(message: string | null): void {
      setInsertionError(message);
    },
    setInsertedNodeActive(active: boolean): void {
      insertedNodeActive = active;
      clearInsertionButton.disabled = !insertedNodeActive;
      updateInsertionControls();
    },
  };

  function resetAdvancedDefaults(project: ViewerControlsProject): void {
    const duration = project.project.stage.duration;
    const defaultTime = Math.min(3, duration);
    const loopTime =
      project.id === "multipay" ? Math.min(3, duration) : defaultTime;
    loopStartInput.max = String(duration);
    loopEndInput.max = String(duration);
    loopStartInput.value = formatTime(loopTime);
    loopEndInput.value = formatTime(loopTime);
    keepParticlesInput.checked = true;
    advancedPhase.textContent = "idle";
    segmentedEndButton.disabled = true;
    setAdvancedError(null);
    updateAdvancedValidation();
  }

  function updateAdvancedValidation(): void {
    const parsed = parseAdvancedInputs();
    segmentedStartButton.disabled = !parsed.ok;
    if (parsed.ok) {
      setAdvancedError(null);
    } else {
      setAdvancedError(parsed.message);
    }
  }

  function parseAdvancedInputs():
    | { ok: true; loopStart: number; loopEnd: number }
    | { ok: false; message: string } {
    const loopStart = Number(loopStartInput.value);
    const loopEnd = Number(loopEndInput.value);
    const duration = currentProject.project.stage.duration;
    if (!Number.isFinite(loopStart) || !Number.isFinite(loopEnd)) {
      return { ok: false, message: "loopStart 和 loopEnd 必须是数字" };
    }
    if (loopStart < 0 || loopEnd < 0) {
      return { ok: false, message: "loopStart 和 loopEnd 不能小于 0" };
    }
    if (loopStart > loopEnd) {
      return { ok: false, message: "loopStart 不能大于 loopEnd" };
    }
    if (loopEnd > duration) {
      return { ok: false, message: "loopEnd 不能超过项目时长" };
    }
    return { ok: true, loopStart, loopEnd };
  }

  function setAdvancedError(message: string | null): void {
    advancedError.textContent = message ?? "";
    advancedError.classList.toggle("is-visible", Boolean(message));
  }

  function resetInsertionDefaults(project: ViewerControlsProject): void {
    currentLayerGroupSlots = [];
    insertedNodeActive = false;
    insertionAssetSelect.replaceChildren();
    for (const asset of project.insertionAssets) {
      const option = document.createElement("option");
      option.value = asset.path;
      option.textContent = asset.label;
      insertionAssetSelect.appendChild(option);
    }
    renderInsertionSlots();
    setInsertionError(null);
    clearInsertionButton.disabled = true;
    updateInsertionControls();
  }

  function renderInsertionSlots(): void {
    insertionSlotSelect.replaceChildren();
    for (const slot of currentLayerGroupSlots) {
      const option = document.createElement("option");
      option.value = getSlotValue(slot);
      option.textContent = `${slot.afterGroupName} -> ${slot.beforeGroupName}`;
      insertionSlotSelect.appendChild(option);
    }
  }

  function updateInsertionControls(): void {
    const hasAsset = insertionAssetSelect.options.length > 0;
    const hasSlot = insertionSlotSelect.options.length > 0;
    insertionAssetSelect.disabled = !hasAsset;
    insertionSlotSelect.disabled = !hasSlot;
    insertionButton.disabled = !hasAsset || !hasSlot;
    clearInsertionButton.disabled = !insertedNodeActive;
    if (!hasSlot) {
      insertionStatus.textContent = "无合法 slot";
    } else if (insertedNodeActive) {
      insertionStatus.textContent = "已插入";
    } else {
      insertionStatus.textContent = `${currentLayerGroupSlots.length} slot`;
    }
  }

  function parseInsertionInputs():
    | {
        ok: true;
        assetPath: string;
        assetUrl: string;
        projectAssetId?: string;
        afterGroupId: string;
        beforeGroupId: string;
      }
    | { ok: false; message: string } {
    const assetPath = insertionAssetSelect.value;
    const asset = currentProject.insertionAssets.find(
      (candidate) => candidate.path === assetPath,
    );
    if (!asset) return { ok: false, message: "请选择 asset" };
    const slot = currentLayerGroupSlots.find(
      (candidate) => getSlotValue(candidate) === insertionSlotSelect.value,
    );
    if (!slot) return { ok: false, message: "请选择合法 group slot" };
    const parsed = {
      ok: true as const,
      assetPath: asset.path,
      assetUrl: asset.url,
      afterGroupId: slot.afterGroupId,
      beforeGroupId: slot.beforeGroupId,
    };
    return asset.projectAssetId
      ? { ...parsed, projectAssetId: asset.projectAssetId }
      : parsed;
  }

  function setInsertionError(message: string | null): void {
    insertionError.textContent = message ?? "";
    insertionError.classList.toggle("is-visible", Boolean(message));
  }
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

function getSlotValue(slot: VNILayerGroupSlot): string {
  return `${slot.afterGroupId}\u0000${slot.beforeGroupId}`;
}
