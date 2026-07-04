import type {
  VNILayerGroupSlot,
  VNIPlaybackState,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export interface ViewerControlsProfile {
  id: string;
  label: string;
  purpose: string;
  assetScale: number;
  projectPath: string;
}

export interface ViewerUploadedBundleInfo {
  fileName: string;
  bundleId: string;
  profiles: readonly ViewerControlsProfile[];
  selectedProfileId: string | null;
}

export interface ViewerControlsProject {
  projectId: string;
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
  container: HTMLElement;
  onZipUpload: (file: File) => void;
  onProfileChange: (profileId: string) => void;
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
  onApplyTextLayerReplacement: (options: {
    layerId: string;
    mode: "text" | "image";
    text?: string;
    assetPath?: string;
    assetUrl?: string;
    projectAssetId?: string;
  }) => void;
  onTextLayerReplacementTextInput: (text: string) => void;
  onClearTextLayerReplacement: () => void;
}

export interface ViewerControls {
  setUploadedBundle(info: ViewerUploadedBundleInfo): void;
  clearUploadedBundle(): void;
  setUploadError(message: string | null): void;
  setProject(project: ViewerControlsProject): void;
  clearProject(): void;
  setPlaying(isPlaying: boolean): void;
  setTime(time: number): void;
  setLoop(loop: boolean): void;
  setPlaybackState(state: VNIPlaybackState): void;
  setAdvancedError(message: string | null): void;
  setLayerGroupSlots(slots: readonly VNILayerGroupSlot[]): void;
  setInsertionError(message: string | null): void;
  setInsertedNodeActive(active: boolean): void;
  setTextReplacementError(message: string | null): void;
  setTextReplacementActive(active: boolean): void;
}

export function createViewerControls(
  options: ViewerControlsOptions,
): ViewerControls {
  let currentProject: ViewerControlsProject | null = null;
  let currentBundle: ViewerUploadedBundleInfo | null = null;
  let currentLayerGroupSlots: readonly VNILayerGroupSlot[] = [];
  let insertedNodeActive = false;
  let textReplacementActive = false;

  const root = document.createElement("div");
  root.className = "viewer-controls";

  const uploadRow = document.createElement("div");
  uploadRow.className = "project-row";

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "project-picker";
  const uploadText = document.createElement("span");
  uploadText.textContent = "Zip";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = ".zip,application/zip,application/x-zip-compressed";
  uploadInput.setAttribute("aria-label", "上传 VNI zip");
  uploadLabel.append(uploadText, uploadInput);

  const profileLabel = document.createElement("label");
  profileLabel.className = "project-picker";
  const profileText = document.createElement("span");
  profileText.textContent = "Profile";
  const profileSelect = document.createElement("select");
  profileSelect.setAttribute("aria-label", "VNI profile");
  profileLabel.append(profileText, profileSelect);

  uploadRow.append(uploadLabel, profileLabel);

  const uploadError = document.createElement("div");
  uploadError.className = "upload-error";
  uploadError.setAttribute("role", "status");

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

  const textPanel = document.createElement("section");
  textPanel.className = "text-replacement-panel";
  textPanel.setAttribute("aria-label", "文字层替换");

  const textHeader = document.createElement("div");
  textHeader.className = "text-replacement-header";
  const textTitle = document.createElement("strong");
  textTitle.textContent = "文字层替换";
  const textStatus = document.createElement("span");
  textStatus.className = "text-replacement-status";
  textHeader.append(textTitle, textStatus);

  const textControls = document.createElement("div");
  textControls.className = "text-replacement-row";

  const textLayerLabel = document.createElement("label");
  textLayerLabel.className = "text-replacement-select";
  const textLayerText = document.createElement("span");
  textLayerText.textContent = "layer";
  const textLayerSelect = document.createElement("select");
  textLayerSelect.setAttribute("aria-label", "文字层");
  textLayerLabel.append(textLayerText, textLayerSelect);

  const textModeLabel = document.createElement("label");
  textModeLabel.className = "text-replacement-select";
  const textModeText = document.createElement("span");
  textModeText.textContent = "mode";
  const textModeSelect = document.createElement("select");
  textModeSelect.setAttribute("aria-label", "文字层替换模式");
  for (const [value, label] of [
    ["text", "文本"],
    ["image", "图片"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    textModeSelect.appendChild(option);
  }
  textModeLabel.append(textModeText, textModeSelect);

  const textValueLabel = document.createElement("label");
  textValueLabel.className = "text-replacement-input";
  const textValueText = document.createElement("span");
  textValueText.textContent = "text";
  const textValueInput = document.createElement("input");
  textValueInput.type = "text";
  textValueInput.value = "12345";
  textValueInput.setAttribute("aria-label", "动态文字内容");
  textValueLabel.append(textValueText, textValueInput);

  const textAssetLabel = document.createElement("label");
  textAssetLabel.className = "text-replacement-select";
  const textAssetText = document.createElement("span");
  textAssetText.textContent = "asset";
  const textAssetSelect = document.createElement("select");
  textAssetSelect.setAttribute("aria-label", "文字层图片 asset");
  textAssetLabel.append(textAssetText, textAssetSelect);

  const applyTextButton = document.createElement("button");
  applyTextButton.type = "button";
  applyTextButton.className = "control-button primary";
  applyTextButton.textContent = "应用";

  const clearTextButton = document.createElement("button");
  clearTextButton.type = "button";
  clearTextButton.className = "control-button";
  clearTextButton.textContent = "移除";
  clearTextButton.disabled = true;

  const textError = document.createElement("div");
  textError.className = "text-replacement-error";
  textError.setAttribute("role", "status");

  textControls.append(
    textLayerLabel,
    textModeLabel,
    textValueLabel,
    textAssetLabel,
    applyTextButton,
    clearTextButton,
  );
  textPanel.append(textHeader, textControls, textError);

  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files?.item(0);
    if (!file) return;
    options.onZipUpload(file);
    uploadInput.value = "";
  });
  profileSelect.addEventListener("change", () => {
    if (profileSelect.value) {
      options.onProfileChange(profileSelect.value);
    }
  });
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
  textLayerSelect.addEventListener("change", updateTextReplacementControls);
  textModeSelect.addEventListener("change", updateTextReplacementControls);
  textAssetSelect.addEventListener("change", updateTextReplacementControls);
  textValueInput.addEventListener("input", () => {
    if (textModeSelect.value === "text") {
      options.onTextLayerReplacementTextInput(textValueInput.value);
    }
  });
  applyTextButton.addEventListener("click", () => {
    const parsed = parseTextReplacementInputs();
    if (!parsed.ok) {
      setTextReplacementError(parsed.message);
      return;
    }
    setTextReplacementError(null);
    options.onApplyTextLayerReplacement(parsed);
  });
  clearTextButton.addEventListener("click", () => {
    setTextReplacementError(null);
    options.onClearTextLayerReplacement();
  });

  controls.append(playButton, restartButton, loopLabel, timeText, range);
  root.append(
    uploadRow,
    uploadError,
    summary,
    controls,
    advancedPanel,
    insertionPanel,
    textPanel,
  );
  options.container.appendChild(root);

  renderProfileSelect();
  renderNoProject();

  return {
    setUploadedBundle(info: ViewerUploadedBundleInfo): void {
      currentBundle = info;
      renderProfileSelect();
      renderSummary();
    },
    clearUploadedBundle(): void {
      currentBundle = null;
      renderProfileSelect();
      renderSummary();
    },
    setUploadError(message: string | null): void {
      setUploadError(message);
    },
    setProject(project: ViewerControlsProject): void {
      renderProject(project);
    },
    clearProject(): void {
      renderNoProject();
    },
    setPlaying(isPlaying: boolean): void {
      playButton.textContent = isPlaying ? "Pause" : "Play";
      playButton.classList.toggle("is-playing", isPlaying);
    },
    setTime(time: number): void {
      if (!currentProject) return;
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
        currentProject &&
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
    setTextReplacementError(message: string | null): void {
      setTextReplacementError(message);
    },
    setTextReplacementActive(active: boolean): void {
      textReplacementActive = active;
      clearTextButton.disabled = !textReplacementActive;
      updateTextReplacementControls();
    },
  };

  function renderNoProject(): void {
    currentProject = null;
    currentLayerGroupSlots = [];
    insertedNodeActive = false;
    textReplacementActive = false;
    range.max = "0";
    range.value = "0";
    timeText.textContent = "0.00 / 0.00";
    playButton.textContent = "Play";
    playButton.classList.remove("is-playing");
    loopInput.checked = true;
    resetAdvancedDefaults(null);
    resetInsertionDefaults(null);
    resetTextReplacementDefaults(null);
    renderSummary();
    updateLoadedControlAvailability();
  }

  function renderProject(project: ViewerControlsProject): void {
    currentProject = project;
    range.max = String(project.project.stage.duration);
    range.value = "0.00";
    resetAdvancedDefaults(project);
    resetInsertionDefaults(project);
    resetTextReplacementDefaults(project);
    timeText.textContent = `0.00 / ${formatTime(project.project.stage.duration)}`;
    playButton.textContent = "Play";
    playButton.classList.remove("is-playing");
    renderSummary();
    updateLoadedControlAvailability();
  }

  function renderSummary(): void {
    if (currentProject) {
      summary.replaceChildren(
        createSummaryStrong(currentProject.project.name),
        createSummaryItem(currentProject.sourcePath),
        createSummaryItem(`schema ${currentProject.project.schemaVersion}`),
        createSummaryItem(`profile ${currentProject.profileId}`),
        createSummaryItem(`purpose ${currentProject.purpose}`),
        createSummaryItem(
          `assetScale ${formatScale(currentProject.assetScale)}`,
        ),
        createSummaryItem(`${currentProject.project.layers.length} layers`),
        createSummaryItem(`${currentProject.project.assets.length} assets`),
        createSummaryItem(
          `${formatTime(currentProject.project.stage.duration)}s duration`,
        ),
        createSummaryItem(getAnimationTypeSummary(currentProject.project)),
      );
      return;
    }

    if (currentBundle) {
      summary.replaceChildren(
        createSummaryStrong(currentBundle.fileName),
        createSummaryItem(currentBundle.bundleId),
        createSummaryItem(`${currentBundle.profiles.length} profiles`),
        createSummaryItem(
          currentBundle.selectedProfileId
            ? `profile ${currentBundle.selectedProfileId}`
            : "profile not selected",
        ),
      );
      return;
    }

    summary.replaceChildren(
      createSummaryStrong("No project loaded"),
      createSummaryItem("Upload a VNI zip to start"),
    );
  }

  function renderProfileSelect(): void {
    const profiles = currentBundle?.profiles ?? [];
    const selectedProfileId = currentBundle?.selectedProfileId ?? "";
    profileSelect.replaceChildren();
    if (profiles.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "未上传";
      profileSelect.appendChild(option);
      profileSelect.value = "";
      profileSelect.disabled = true;
      return;
    }
    if (!selectedProfileId) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "选择 profile";
      profileSelect.appendChild(option);
    }
    for (const profile of profiles) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `${profile.label} / ${profile.purpose} / ${formatScale(profile.assetScale)}`;
      profileSelect.appendChild(option);
    }
    profileSelect.value = selectedProfileId;
    profileSelect.disabled = profiles.length <= 1;
  }

  function updateLoadedControlAvailability(): void {
    const hasProject = currentProject !== null;
    playButton.disabled = !hasProject;
    restartButton.disabled = !hasProject;
    loopInput.disabled = !hasProject;
    range.disabled = !hasProject;
    loopStartInput.disabled = !hasProject;
    loopEndInput.disabled = !hasProject;
    keepParticlesInput.disabled = !hasProject;
    updateAdvancedValidation();
    updateInsertionControls();
    updateTextReplacementControls();
  }

  function resetAdvancedDefaults(project: ViewerControlsProject | null): void {
    if (!project) {
      loopStartInput.max = "0";
      loopEndInput.max = "0";
      loopStartInput.value = "0.00";
      loopEndInput.value = "0.00";
      keepParticlesInput.checked = true;
      advancedPhase.textContent = "idle";
      segmentedEndButton.disabled = true;
      setAdvancedError(null);
      return;
    }
    const duration = project.project.stage.duration;
    const defaultTime = Math.min(3, duration);
    loopStartInput.max = String(duration);
    loopEndInput.max = String(duration);
    loopStartInput.value = formatTime(defaultTime);
    loopEndInput.value = formatTime(defaultTime);
    keepParticlesInput.checked = true;
    advancedPhase.textContent = "idle";
    segmentedEndButton.disabled = true;
    setAdvancedError(null);
    updateAdvancedValidation();
  }

  function updateAdvancedValidation(): void {
    if (!currentProject) {
      segmentedStartButton.disabled = true;
      segmentedEndButton.disabled = true;
      setAdvancedError(null);
      return;
    }
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
    if (!currentProject) {
      return { ok: false, message: "请先加载项目" };
    }
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

  function resetInsertionDefaults(project: ViewerControlsProject | null): void {
    currentLayerGroupSlots = [];
    insertedNodeActive = false;
    insertionAssetSelect.replaceChildren();
    if (project) {
      for (const asset of project.insertionAssets) {
        const option = document.createElement("option");
        option.value = asset.path;
        option.textContent = asset.label;
        insertionAssetSelect.appendChild(option);
      }
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
    const hasProject = currentProject !== null;
    const hasAsset = insertionAssetSelect.options.length > 0;
    const hasSlot = insertionSlotSelect.options.length > 0;
    insertionAssetSelect.disabled = !hasProject || !hasAsset;
    insertionSlotSelect.disabled = !hasProject || !hasSlot;
    insertionButton.disabled = !hasProject || !hasAsset || !hasSlot;
    clearInsertionButton.disabled = !hasProject || !insertedNodeActive;
    if (!hasProject) {
      insertionStatus.textContent = "未加载";
    } else if (!hasSlot) {
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
    if (!currentProject) return { ok: false, message: "请先加载项目" };
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

  function resetTextReplacementDefaults(
    project: ViewerControlsProject | null,
  ): void {
    textReplacementActive = false;
    textLayerSelect.replaceChildren();
    textAssetSelect.replaceChildren();
    if (project) {
      for (const layer of project.project.layers.filter(
        (candidate) => candidate.type === "text",
      )) {
        const option = document.createElement("option");
        option.value = layer.id;
        option.textContent = `${layer.name} (${layer.id})`;
        textLayerSelect.appendChild(option);
      }
      for (const asset of project.insertionAssets) {
        const option = document.createElement("option");
        option.value = asset.path;
        option.textContent = asset.label;
        textAssetSelect.appendChild(option);
      }
    }
    textModeSelect.value = "text";
    textValueInput.value = "12345";
    setTextReplacementError(null);
    clearTextButton.disabled = true;
    updateTextReplacementControls();
  }

  function updateTextReplacementControls(): void {
    const hasProject = currentProject !== null;
    const hasTextLayer = textLayerSelect.options.length > 0;
    const imageMode = textModeSelect.value === "image";
    const hasAsset = textAssetSelect.options.length > 0;
    textLayerSelect.disabled = !hasProject || !hasTextLayer;
    textModeSelect.disabled = !hasProject || !hasTextLayer;
    textValueInput.disabled = !hasProject || !hasTextLayer || imageMode;
    textAssetSelect.disabled =
      !hasProject || !hasTextLayer || !imageMode || !hasAsset;
    applyTextButton.disabled =
      !hasProject || !hasTextLayer || (imageMode && !hasAsset);
    clearTextButton.disabled = !hasProject || !textReplacementActive;
    textStatus.textContent = !hasProject
      ? "未加载"
      : hasTextLayer
        ? textReplacementActive
          ? "已替换"
          : `${textLayerSelect.options.length} layer`
        : "无文字层";
  }

  function parseTextReplacementInputs():
    | {
        ok: true;
        layerId: string;
        mode: "text" | "image";
        text?: string;
        assetPath?: string;
        assetUrl?: string;
        projectAssetId?: string;
      }
    | { ok: false; message: string } {
    if (!currentProject) return { ok: false, message: "请先加载项目" };
    if (!textLayerSelect.value) return { ok: false, message: "请选择文字层" };
    if (textModeSelect.value === "text") {
      return {
        ok: true,
        layerId: textLayerSelect.value,
        mode: "text",
        text: textValueInput.value,
      };
    }
    const asset = currentProject.insertionAssets.find(
      (candidate) => candidate.path === textAssetSelect.value,
    );
    if (!asset) return { ok: false, message: "请选择图片 asset" };
    const parsed = {
      ok: true as const,
      layerId: textLayerSelect.value,
      mode: "image" as const,
      assetPath: asset.path,
      assetUrl: asset.url,
    };
    return asset.projectAssetId
      ? { ...parsed, projectAssetId: asset.projectAssetId }
      : parsed;
  }

  function setTextReplacementError(message: string | null): void {
    textError.textContent = message ?? "";
    textError.classList.toggle("is-visible", Boolean(message));
  }

  function setUploadError(message: string | null): void {
    uploadError.textContent = message ?? "";
    uploadError.classList.toggle("is-visible", Boolean(message));
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
