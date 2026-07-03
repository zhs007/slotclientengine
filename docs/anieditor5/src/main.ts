import {
  V5G_EASINGS,
  createDefaultAnimationParams,
  getAnimationCategory,
  getAnimationPreset,
  getAnimationPresetsByCategory,
  isV5GAnimationType,
  sampleLayerAnimationsAtTime,
  type V5GAnimationCategory,
} from "./animation_presets";
import { VNI_VERSION } from "./constants";
import { clampNumber, roundTo } from "./coordinates";
import {
  exportProjectZip,
  importProjectZip,
  sanitizeZipFilename,
} from "./export_project";
import { V5GPixiStage } from "./pixi_stage";
import {
  createDefaultLayerGroup,
  createId,
  createImageAsset,
  createImageLayer,
  createInitialEditorState,
  createRuntimeAsset,
  createTextLayer,
  getLayerGroup,
  getSelectedLayer,
  isLayerEffectivelyVisible,
  normalizeProjectLayerGroups,
  normalizeProjectMasks,
} from "./project_state";
import type {
  V5GAnimationConfig,
  V5GAnimationParamValue,
  V5GAnimationType,
  V5GBlendMode,
  V5GEditorState,
  V5GLayerConfig,
  V5GLayerGroupConfig,
  V5GProjectConfig,
  V5GPreviewLayerState,
  V5GTransformConfig,
  V5GViewportState,
} from "./types";
import {
  clearRuntimeAssetsForProject,
  cloneProjectConfig,
  createWorkspaceProjectId,
  deleteProjectFromWorkspace,
  loadOrCreateWorkspace,
  loadProjectConfig,
  loadRuntimeAssets,
  saveProjectRecord,
  saveRuntimeAssets,
  saveWorkspaceIndex,
} from "./workspace_storage";
import type { V5GProjectSummary, V5GWorkspaceIndex } from "./workspace_storage";

let state: V5GEditorState = createInitialEditorState();
let pixiStage: V5GPixiStage;
let animationFrame = 0;
let playStartedAt = 0;
let activePlaybackRange: { start: number; end: number } | null = null;
let workspaceIndex: V5GWorkspaceIndex | null = null;
let currentProjectId = "";
let isDeleteConfirmVisible = false;
let isResetConfirmVisible = false;
let timelineDragState: {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  hasPanned: boolean;
} | null = null;
let timelinePlayheadDragState: {
  pointerId: number;
} | null = null;
let timelineAnimationDragState: {
  pointerId: number;
  layerId: string;
  animationId: string;
  mode: "move" | "resize-duration";
  startClientX: number;
  originalStartTime: number;
  originalDuration: number;
  hasChanged: boolean;
} | null = null;
let timelinePixelsPerSecond = 120;
let timelineScrollLeft = 0;
let draggedLayerId: string | null = null;
let layerDropTargetId: string | null = null;
let layerDropPosition: "before" | "after" | null = null;
const undoStack: V5GProjectConfig[] = [];
const collapsedAnimationIds = new Set<string>();
const expandedTimelineLayerIds = new Set<string>();
let selectedAnimationId: string | null = null;
let animationClipboard:
  | {
      kind: "layer";
      sourceLayerName: string;
      animations: V5GAnimationConfig[];
    }
  | {
      kind: "single";
      sourceLayerName: string;
      animation: V5GAnimationConfig;
    }
  | null = null;
let pendingAnimationPaste:
  | { targetLayerId: string; source: "layer-toolbar" }
  | { targetLayerId: string; source: "animation-toolbar" }
  | null = null;
let autoSaveTimer = 0;
let saveRunId = 0;
let isWorkspaceOperationRunning = false;

let assetsDirty = false;

let pendingAnimationDraft: {
  layerId: string;

  category: V5GAnimationCategory;

  memoryKey: string;
} | null = null;

interface V5GAnimationTypeDraft {
  startTime: number;

  duration: number;

  easing: string;

  params: Record<string, V5GAnimationParamValue>;
}

const animationTypeDrafts = new Map<
  string,
  Map<V5GAnimationType, V5GAnimationTypeDraft>
>();

const MIN_STAGE_SIZE = 100;
const MAX_STAGE_SIZE = 5000;
const MIN_ZOOM_PERCENT = 5;
const MAX_ZOOM_PERCENT = 800;
const MAX_UNDO_STEPS = 50;
const MIN_LEFT_PANEL_WIDTH = 180;
const MAX_LEFT_PANEL_WIDTH = 420;
const MIN_RIGHT_PANEL_WIDTH = 220;
const MAX_RIGHT_PANEL_WIDTH = 520;
const MIN_TIMELINE_HEIGHT = 96;
const MAX_TIMELINE_HEIGHT_RATIO = 0.67;
const TIMELINE_SCROLLBAR_HIT_AREA_PX = 18;
const MIN_TIMELINE_PX_PER_SECOND = 32;
const MAX_TIMELINE_PX_PER_SECOND = 640;
const DEFAULT_TIMELINE_PX_PER_SECOND = 120;
const TIMELINE_ZOOM_STEP = 1.12;
const TIMELINE_MINOR_TICK_SECONDS = 0.05;
const TIMELINE_TIME_DECIMALS = 2;
const MIN_PROJECT_DURATION_SECONDS = 0.5;
const MAX_PROJECT_DURATION_SECONDS = 3600;
const TIMELINE_PAN_THRESHOLD_PX = 4;

const els = {
  pixiContainer: getElement("pixi-container"),
  status: getElement("status"),
  btnRun: getButton("btn-run"),
  btnStop: getButton("btn-stop"),
  btnSwitchProject: getButton("btn-switch-project"),
  btnResetView: getButton("btn-reset-view"),
  cbShowSelectionOutline: getInput("cb-show-selection-outline"),
  cbLoopPlay: getInput("cb-loop-play"),
  cbPlaySegment: getInput("cb-play-segment"),
  playStartSeconds: getInput("input-play-start-seconds"),
  playEndSeconds: getInput("input-play-end-seconds"),
  btnAddText: getButton("btn-add-text"),
  btnAddGroup: getButton("btn-add-group"),
  fileReplaceImage: getInput("file-replace-image"),
  btnReplaceImage: getButton("btn-replace-image"),

  animToolbar: getElement("anim-toolbar"),
  btnPasteCopiedAnim: getButton("btn-paste-copied-anim"),
  btnConfirmPasteCopiedAnim: getButton("btn-confirm-paste-copied-anim"),
  btnCancelPasteCopiedAnim: getButton("btn-cancel-paste-copied-anim"),
  btnExportZip: getButton("btn-export-zip"),
  exportAssetScale: getSelect("select-export-asset-scale"),
  btnAnimCategoryAnimation: getButton("btn-anim-category-animation"),

  btnAnimCategoryParticle: getButton("btn-anim-category-particle"),

  btnApplyStage: getButton("btn-apply-stage"),
  btnNewProject: getButton("btn-new-project"),
  btnDuplicateProject: getButton("btn-duplicate-project"),
  btnResetProject: getButton("btn-reset-project"),
  btnConfirmResetProject: getButton("btn-confirm-reset-project"),
  btnCancelResetProject: getButton("btn-cancel-reset-project"),
  btnDeleteProject: getButton("btn-delete-project"),
  btnConfirmDeleteProject: getButton("btn-confirm-delete-project"),
  btnCancelDeleteProject: getButton("btn-cancel-delete-project"),
  fileImage: getInput("file-image"),
  fileZip: getInput("file-zip"),
  projectName: getInput("input-project-name"),
  projectSelect: getSelect("select-project"),
  projectOptions: getElement("project-options"),
  zipName: getInput("input-zip-name"),
  stageWidth: getInput("input-stage-width"),
  stageHeight: getInput("input-stage-height"),
  versionLabel: getElement("version-label"),
  autoSaveLabel: getElement("autosave-label"),
  stageSizeLabel: getElement("stage-size-label"),
  zoomInput: getInput("input-zoom-percent"),
  layerList: getElement("layer-list"),
  layerCountLabel: getElement("layer-count-label"),
  cursorLabel: getElement("cursor-label"),
  timeLabel: getElement("time-label"),
  timelineTrack: getElement("timeline-track"),
  timelineBar: getElement("timeline-bar"),
  timelineRuler: getElement("timeline-ruler"),
  timelineRulerTrack: getElement("timeline-ruler-track"),
  timelineItems: getElement("timeline-items"),
  durationSeconds: getInput("input-duration-seconds"),
  selectionEmpty: getElement("selection-empty"),
  propertyPanel: getElement("property-panel"),
  selectedLayerHeading: getElement("selected-layer-heading"),
  selectedLayerMeta: getElement("selected-layer-meta"),
  propName: getInput("prop-name"),
  propX: getInput("prop-x"),
  propY: getInput("prop-y"),
  propScaleX: getInput("prop-scale-x"),
  propScaleY: getInput("prop-scale-y"),
  btnFlipX: getButton("btn-flip-x"),
  btnFlipY: getButton("btn-flip-y"),
  btnCopyLayerAnimations: getButton("btn-copy-layer-animations"),
  btnPasteLayerAnimations: getButton("btn-paste-layer-animations"),
  btnConfirmPasteLayerAnimations: getButton(
    "btn-confirm-paste-layer-animations",
  ),
  btnCancelPasteLayerAnimations: getButton("btn-cancel-paste-layer-animations"),
  propRotation: getInput("prop-rotation"),
  propOpacity: getInput("prop-opacity"),
  propBlendMode: getSelect("prop-blend-mode"),
  propMaskEnabled: getInput("prop-mask-enabled"),
  propMaskSource: getSelect("prop-mask-source"),
  propMaskShowSource: getInput("prop-mask-show-source"),
  maskWarning: getElement("mask-warning"),
  propLayerGroup: getSelect("prop-layer-group"),
  animCountLabel: getElement("anim-count-label"),

  animList: getElement("anim-list"),

  appMain: getElement("app-main"),
  leftResizer: getElement("left-resizer"),
  rightResizer: getElement("right-resizer"),
  timelineResizer: getElement("timeline-resizer"),
  timelinePanel: getElement("timeline-panel"),
  stageShell: getElement("stage-shell"),
};

void bootstrap();

async function bootstrap(): Promise<void> {
  els.versionLabel.textContent = VNI_VERSION;
  initResizableLayout();
  setAutoSaveLabel("正在加载工作区…", "info");

  try {
    const loaded = await loadOrCreateWorkspace(state.project);
    workspaceIndex = loaded.index;
    currentProjectId = loaded.index.currentProjectId;
    state = createEditorState(loaded.project, loaded.runtimeAssets);
    syncProjectControls();
    syncProjectFields();
  } catch (error) {
    syncProjectFields();
    setAutoSaveLabel("本地工作区不可用", "error");
    showStatus(`加载本地工作区失败：${getErrorMessage(error)}`, "error");
  }

  pixiStage = new V5GPixiStage(els.pixiContainer, state, {
    onSelectLayer: (layerId) => {
      state.selectedLayerId = layerId;
      renderAll();
    },
    onClearSelection: () => {
      if (!state.selectedLayerId) return;
      state.selectedLayerId = null;
      renderAll();
    },
    onLayerMoveStart: (layerId) => {
      const layer = findLayer(layerId);
      if (!layer) return;
      pushUndoSnapshot();
      clearLayerPreview(layer.id);
    },
    onLayerMove: (layerId, x, y) => {
      const layer = findLayer(layerId);
      if (!layer) return;
      layer.transform.x = x;
      layer.transform.y = y;
      renderAll();
      scheduleAutoSave();
    },
    onCursorMove: (x, y) => {
      els.cursorLabel.textContent = `x: ${formatCursorCoordinate(x)}, y: ${formatCursorCoordinate(y)}`;
    },
    onViewportChange: (viewport) => {
      updateZoomLabel(viewport.scale);
      saveCurrentProjectViewport(viewport);
    },
  });
  await pixiStage.init();
  pixiStage.setViewportState(getCurrentProjectSummary()?.viewport ?? null);
  updateZoomLabel(pixiStage.getViewportState().scale);

  bindEvents();
  renderAll();
  setAutoSaveLabel("已自动保存", "success");
  showStatus(
    `${VNI_VERSION} 已启动：所有资源比例都会导出 edit_full + runtime 双份 Bundle。`,
    "success",
  );
}

function bindEvents(): void {
  els.btnRun.addEventListener("click", () => togglePlayback());
  els.cbPlaySegment.addEventListener("change", () => syncPlaybackRangeInputs());
  for (const input of [els.playStartSeconds, els.playEndSeconds]) {
    input.addEventListener("input", () => renderTimelineAnimations());
    input.addEventListener("change", () => syncPlaybackRangeInputs());
    input.addEventListener("blur", () => syncPlaybackRangeInputs());
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      syncPlaybackRangeInputs();
      input.blur();
    });
  }

  els.btnStop.addEventListener("click", () => stopPlayback());
  els.btnResetView.addEventListener("click", () => {
    pixiStage.resetView();
    showStatus("画布已重新居中。", "info");
  });
  els.cbShowSelectionOutline.addEventListener("change", () => {
    state.showSelectionOutline = els.cbShowSelectionOutline.checked;
    renderAll();
    showStatus(
      state.showSelectionOutline
        ? "已显示选中图层边框。"
        : "已隐藏选中图层边框。",
      "info",
    );
  });

  els.projectSelect.addEventListener("change", () => {
    hideResetConfirmation();
    hideDeleteConfirmation();
    const selectedProjectId = els.projectSelect.value;
    void switchProject(selectedProjectId);
  });
  els.btnSwitchProject.addEventListener("click", () => {
    hideResetConfirmation();
    hideDeleteConfirmation();
    renameCurrentProjectFromInput();
  });
  els.btnNewProject.addEventListener("click", () => {
    hideResetConfirmation();
    hideDeleteConfirmation();
    void createNewWorkspaceProject();
  });
  els.btnDuplicateProject.addEventListener("click", () => {
    hideResetConfirmation();
    hideDeleteConfirmation();
    void duplicateCurrentWorkspaceProject();
  });
  els.btnResetProject.addEventListener("click", () => {
    showResetConfirmation();
  });
  els.btnConfirmResetProject.addEventListener("click", () => {
    void resetCurrentWorkspaceProject();
  });
  els.btnCancelResetProject.addEventListener("click", () => {
    hideResetConfirmation();
    showStatus("已取消初始化项目。", "info");
  });
  els.btnDeleteProject.addEventListener("click", () => {
    showDeleteConfirmation();
  });
  els.btnConfirmDeleteProject.addEventListener("click", () => {
    void deleteCurrentWorkspaceProject();
  });
  els.btnCancelDeleteProject.addEventListener("click", () => {
    hideDeleteConfirmation();
    showStatus("已取消删除项目。", "info");
  });

  els.btnApplyStage.addEventListener("click", () => {
    void applyStageSizeFromInputs();
  });
  for (const input of [els.stageHeight, els.stageWidth]) {
    input.addEventListener("change", () => {
      void applyStageSizeFromInputs();
    });
    input.addEventListener("blur", () => {
      void applyStageSizeFromInputs();
    });
  }

  els.zoomInput.addEventListener("change", () => {
    applyZoomPercentFromInput();
  });
  els.zoomInput.addEventListener("blur", () => {
    applyZoomPercentFromInput();
  });
  els.zoomInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyZoomPercentFromInput();
    els.zoomInput.blur();
  });

  els.btnAddText.addEventListener("click", async () => {
    const layer = createTextLayer(
      `文字 ${state.project.layers.length + 1}`,
      0,
      0,
    );
    layer.groupId = getPreferredNewLayerGroupId();
    pushUndoSnapshot();
    state.project.layers.push(layer);
    state.selectedLayerId = layer.id;
    await renderAllAsync();
    scheduleAutoSave();
    showStatus("已添加文字图层。", "success");
  });

  els.btnAddGroup.addEventListener("click", () => {
    createLayerGroupFromButton();
  });

  els.btnAnimCategoryAnimation.addEventListener("click", () => {
    showAnimationDraftModule("animation");
  });

  els.btnAnimCategoryParticle.addEventListener("click", () => {
    showAnimationDraftModule("particle");
  });

  els.btnPasteCopiedAnim.addEventListener("click", () =>
    requestPasteAnimationsToSelectedLayer("animation-toolbar"),
  );
  els.btnConfirmPasteCopiedAnim.addEventListener("click", () =>
    confirmPendingAnimationPaste(),
  );
  els.btnCancelPasteCopiedAnim.addEventListener("click", () =>
    cancelPendingAnimationPaste(),
  );
  els.durationSeconds.addEventListener("change", () => {
    applyProjectDurationFromInput();
  });
  els.durationSeconds.addEventListener("blur", () => {
    applyProjectDurationFromInput({ silentIfUnchanged: true });
  });
  els.durationSeconds.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyProjectDurationFromInput();
    els.durationSeconds.blur();
  });
  els.timelineRuler.addEventListener("wheel", (event) => {
    handleTimelineWheel(event);
  });
  els.timelineTrack.addEventListener("wheel", () => {
    handleTimelineTrackWheel();
  });
  for (const timelineSurface of [els.timelineRuler, els.timelineTrack]) {
    timelineSurface.addEventListener("pointerdown", (event) => {
      if (isTimelinePlayheadTarget(event.target)) {
        startTimelinePlayheadDrag(event);
        return;
      }
      if (isTimelineAnimationTarget(event.target)) return;
      startTimelinePointerInteraction(event);
    });
    timelineSurface.addEventListener("pointermove", (event) => {
      updateTimelinePlayheadDrag(event);
      updateTimelineAnimationDrag(event);
      updateTimelinePointerInteraction(event);
    });
    timelineSurface.addEventListener("pointerup", (event) => {
      finishTimelinePlayheadDrag(event);
      finishTimelineAnimationDrag(event);
      finishTimelinePointerInteraction(event);
    });
    timelineSurface.addEventListener("pointercancel", (event) => {
      cancelTimelinePlayheadDrag(event);
      cancelTimelineAnimationDrag(event);
      cancelTimelinePointerInteraction(event);
    });
  }

  els.fileImage.addEventListener("change", async () => {
    const file = els.fileImage.files?.[0];
    els.fileImage.value = "";
    if (!file) return;
    await importImage(file);
  });

  els.btnReplaceImage.addEventListener("click", () => {
    const layer = getSelectedLayer(state);
    if (!layer || layer.type !== "image") {
      showStatus("请选择一个图片图层再替换资源。", "error");
      return;
    }
    els.fileReplaceImage.click();
  });
  els.fileReplaceImage.addEventListener("change", async () => {
    const file = els.fileReplaceImage.files?.[0];
    els.fileReplaceImage.value = "";
    if (!file) return;
    await replaceSelectedImageResource(file);
  });

  els.fileZip.addEventListener("change", async () => {
    const file = els.fileZip.files?.[0];
    els.fileZip.value = "";
    if (!file) return;
    await importZipAsWorkspaceProject(file);
  });

  els.btnExportZip.addEventListener("click", async () => {
    const zipFilename = sanitizeZipFilename(state.project.name);
    const assetScale = readExportAssetScale();
    els.zipName.value = zipFilename.replace(/\.zip$/i, "");
    setButtonLoading(els.btnExportZip, true, "导出中");
    try {
      await exportProjectZip(state, zipFilename, { assetScale });
      showStatus(
        `已导出安全 Bundle：${zipFilename}，包含 100% 完整编辑备份和 ${Math.round(assetScale * 100)}% 运行资源。`,
        "success",
      );
    } catch (error) {
      showStatus(`导出 ZIP 失败：${getErrorMessage(error)}`, "error");
    } finally {
      setButtonLoading(els.btnExportZip, false);
    }
  });

  els.projectName.addEventListener("change", () => {
    renameCurrentProjectFromInput();
  });
  els.projectName.addEventListener("blur", () => {
    renameCurrentProjectFromInput({ silentIfUnchanged: true });
  });
  els.projectName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    renameCurrentProjectFromInput();
    els.projectName.blur();
  });

  window.addEventListener("keydown", (event) => {
    handleGlobalShortcut(event);
  });

  for (const input of [
    els.propName,
    els.propX,
    els.propY,
    els.propScaleX,
    els.propScaleY,
    els.propRotation,
    els.propOpacity,
  ]) {
    input.addEventListener("input", () => updateSelectedLayerFromProperties());
  }
  els.btnFlipX.addEventListener("click", () => flipSelectedLayer("x"));
  els.btnFlipY.addEventListener("click", () => flipSelectedLayer("y"));
  els.btnCopyLayerAnimations.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copySelectedLayerAnimations();
  });
  els.btnPasteLayerAnimations.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    requestPasteAnimationsToSelectedLayer("layer-toolbar");
  });
  els.btnConfirmPasteLayerAnimations.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    confirmPendingAnimationPaste();
  });
  els.btnCancelPasteLayerAnimations.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingAnimationPaste();
  });
  els.propBlendMode.addEventListener("change", () =>
    updateSelectedLayerFromProperties(),
  );
  els.propMaskEnabled.addEventListener("change", () =>
    updateSelectedLayerMaskFromProperties(),
  );
  els.propMaskSource.addEventListener("change", () =>
    updateSelectedLayerMaskFromProperties(),
  );
  els.propMaskShowSource.addEventListener("change", () =>
    updateSelectedLayerMaskFromProperties(),
  );
  els.propLayerGroup.addEventListener("change", () =>
    updateSelectedLayerGroupFromProperties(),
  );

  window.addEventListener("beforeunload", () => {
    if (!workspaceIndex || !currentProjectId) return;
    updateCurrentProjectSummary();
    saveWorkspaceIndex(workspaceIndex);
  });
}

function initResizableLayout(): void {
  bindHorizontalResizer(els.leftResizer, (clientX) => {
    const rect = els.appMain.getBoundingClientRect();
    const width = clampNumber(
      clientX - rect.left,
      MIN_LEFT_PANEL_WIDTH,
      Math.min(MAX_LEFT_PANEL_WIDTH, rect.width - MIN_RIGHT_PANEL_WIDTH - 360),
    );
    els.appMain.style.setProperty("--left-panel-width", `${width}px`);
  });

  bindHorizontalResizer(els.rightResizer, (clientX) => {
    const rect = els.appMain.getBoundingClientRect();
    const width = clampNumber(
      rect.right - clientX,
      MIN_RIGHT_PANEL_WIDTH,
      Math.min(MAX_RIGHT_PANEL_WIDTH, rect.width - MIN_LEFT_PANEL_WIDTH - 360),
    );
    els.appMain.style.setProperty("--right-panel-width", `${width}px`);
  });

  els.timelineResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    els.timelineResizer.setPointerCapture(event.pointerId);
    document.body.classList.add("cursor-row-resize");

    const startY = event.clientY;
    const startHeight = els.timelinePanel.getBoundingClientRect().height;

    const handleMove = (moveEvent: PointerEvent) => {
      const maxTimelineHeight = Math.max(
        MIN_TIMELINE_HEIGHT,
        Math.floor(window.innerHeight * MAX_TIMELINE_HEIGHT_RATIO),
      );
      const nextHeight = clampNumber(
        startHeight + startY - moveEvent.clientY,
        MIN_TIMELINE_HEIGHT,
        maxTimelineHeight,
      );
      els.timelinePanel.style.height = `${nextHeight}px`;
      els.stageShell.style.setProperty(
        "--timeline-panel-height",
        `${nextHeight}px`,
      );
      const trackHeight = Math.max(40, nextHeight - 108);
      els.timelineTrack.style.height = `${trackHeight}px`;
      clampTimelineScrollLeft();
      renderTimelineAnimations();
    };

    const handleEnd = () => {
      document.body.classList.remove("cursor-row-resize");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  });
}

function bindHorizontalResizer(
  handle: HTMLElement,
  onResize: (clientX: number) => void,
): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("cursor-col-resize");

    const handleMove = (moveEvent: PointerEvent) => {
      onResize(moveEvent.clientX);
    };

    const handleEnd = () => {
      document.body.classList.remove("cursor-col-resize");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  });
}

async function importImage(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    showStatus("请选择图片文件。", "error");
    return;
  }

  try {
    const size = await readImageSize(file);
    const asset = createImageAsset(file, size.width, size.height);
    const runtimeAsset = createRuntimeAsset(asset.id, file);
    const layer = createImageLayer(asset);
    layer.groupId = getPreferredNewLayerGroupId();
    pushUndoSnapshot();
    state.project.assets.push(asset);
    state.runtimeAssets.push(runtimeAsset);
    state.project.layers.push(layer);
    state.selectedLayerId = layer.id;
    assetsDirty = true;
    await renderAllAsync();
    scheduleAutoSave(0);
    showStatus(`已导入图片：${file.name}`, "success");
  } catch (error) {
    showStatus(`导入图片失败：${getErrorMessage(error)}`, "error");
  }
}

async function replaceSelectedImageResource(file: File): Promise<void> {
  const layer = getSelectedLayer(state);
  if (!layer || layer.type !== "image") {
    showStatus("请选择一个图片图层再替换资源。", "error");
    return;
  }
  if (!file.type.startsWith("image/")) {
    showStatus("请选择图片文件。", "error");
    return;
  }

  try {
    const previousAssetId = layer.assetId;
    const size = await readImageSize(file);
    const asset = createImageAsset(file, size.width, size.height);
    const runtimeAsset = createRuntimeAsset(asset.id, file);
    pushUndoSnapshot();
    state.project.assets.push(asset);
    state.runtimeAssets.push(runtimeAsset);
    layer.assetId = asset.id;
    removeUnusedAssetById(previousAssetId);
    assetsDirty = true;
    clearLayerPreview(layer.id);
    await renderAllAsync();
    scheduleAutoSave(0);
    showStatus(
      `已替换「${layer.name}」的图片资源：${file.name}。其他图层仍保留原资源。`,
      "success",
    );
  } catch (error) {
    showStatus(`替换资源失败：${getErrorMessage(error)}`, "error");
  }
}

async function importZipAsWorkspaceProject(file: File): Promise<void> {
  if (!workspaceIndex) {
    showStatus("本地工作区尚未初始化，无法导入 ZIP。", "error");
    return;
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    showStatus("请选择 V5G 导出的 ZIP 文件。", "error");
    return;
  }

  try {
    setAutoSaveLabel("导入中…", "info");
    showStatus("正在读取 ZIP 并恢复项目…", "info");
    await flushAutoSave();
    stopPlayback({ silent: true });

    const imported = await importProjectZip(file);
    const projectId = createWorkspaceProjectId();
    const now = Date.now();
    const importedProject = cloneProjectConfig(imported.project);
    if (!importedProject.name.trim()) importedProject.name = "VictoryAnimation";

    revokeRuntimeAssetUrls();
    currentProjectId = projectId;
    workspaceIndex.currentProjectId = projectId;
    workspaceIndex.projects.push({
      id: projectId,
      name: importedProject.name,
      createdAt: now,
      updatedAt: now,
    });

    state = createEditorState(importedProject, imported.runtimeAssets);
    clearUndoHistory();
    clearPreviewBaseCache();
    await saveProjectRecord(projectId, state.project, now, now);
    await saveRuntimeAssets(projectId, state.runtimeAssets, {
      skipExisting: true,
    });
    assetsDirty = false;
    saveWorkspaceIndex(workspaceIndex);

    hideResetConfirmation();
    hideDeleteConfirmation();
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.resetView();
    updateZoomLabel(pixiStage.getViewportState().scale);
    setAutoSaveLabel("已自动保存", "success");
    showStatus(
      imported.importNote
        ? `已导入 ZIP 为新项目：${importedProject.name}。${imported.importNote}`
        : `已导入 ZIP 为新项目：${importedProject.name}，可继续编辑。`,
      "success",
    );
  } catch (error) {
    setAutoSaveLabel("导入失败", "error");
    showStatus(`导入 ZIP 失败：${getErrorMessage(error)}`, "error");
  }
}

async function switchProject(projectId: string): Promise<void> {
  if (!workspaceIndex || !projectId || projectId === currentProjectId) return;
  const summary = workspaceIndex.projects.find(
    (project) => project.id === projectId,
  );
  if (!summary) return;

  try {
    setAutoSaveLabel("正在切换…", "info");
    await flushAutoSave();
    stopPlayback({ silent: true });
    const project = await loadProjectConfig(projectId);
    if (!project) throw new Error("项目记录不存在");
    const runtimeAssets = await loadRuntimeAssets(projectId, project);
    revokeRuntimeAssetUrls();
    currentProjectId = projectId;
    workspaceIndex.currentProjectId = projectId;
    saveWorkspaceIndex(workspaceIndex);
    state = createEditorState(project, runtimeAssets);
    clearUndoHistory();
    clearPreviewBaseCache();
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.setViewportState(summary.viewport ?? null);
    updateZoomLabel(pixiStage.getViewportState().scale);
    setAutoSaveLabel("已自动保存", "success");
    showStatus(`已切换到项目：${summary.name}`, "success");
  } catch (error) {
    syncProjectControls();
    setAutoSaveLabel("切换失败", "error");
    showStatus(`切换项目失败：${getErrorMessage(error)}`, "error");
  }
}

async function createNewWorkspaceProject(): Promise<void> {
  if (!workspaceIndex) return;
  if (isWorkspaceOperationRunning) {
    showStatus("当前已有项目操作进行中，请稍候。", "info");
    return;
  }
  isWorkspaceOperationRunning = true;
  setButtonLoading(els.btnNewProject, true, "新建中");
  try {
    setAutoSaveLabel("正在保存当前项目…", "info");
    await flushAutoSave();
    stopPlayback({ silent: true });
    revokeRuntimeAssetUrls();
    const newState = createInitialEditorState();
    const projectId = createWorkspaceProjectId();
    const now = Date.now();
    newState.project.name = `VictoryAnimation ${workspaceIndex.projects.length + 1}`;
    currentProjectId = projectId;
    workspaceIndex.currentProjectId = projectId;
    workspaceIndex.projects.push({
      id: projectId,
      name: newState.project.name,
      createdAt: now,
      updatedAt: now,
    });
    state = newState;
    clearUndoHistory();
    clearPreviewBaseCache();
    await saveProjectRecord(projectId, state.project, now, now);
    saveWorkspaceIndex(workspaceIndex);
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.resetView();
    updateZoomLabel(pixiStage.getViewportState().scale);
    assetsDirty = false;
    setAutoSaveLabel("已自动保存", "success");
    showStatus("已新建项目，并已切换到新项目。", "success");
  } catch (error) {
    setAutoSaveLabel("新建失败", "error");
    showStatus(`新建项目失败：${getErrorMessage(error)}`, "error");
  } finally {
    isWorkspaceOperationRunning = false;
    setButtonLoading(els.btnNewProject, false);
  }
}

async function duplicateCurrentWorkspaceProject(): Promise<void> {
  if (!workspaceIndex || !currentProjectId) return;
  if (isWorkspaceOperationRunning) {
    showStatus("当前已有项目操作进行中，请稍候。", "info");
    return;
  }
  isWorkspaceOperationRunning = true;
  setButtonLoading(els.btnDuplicateProject, true, "复制中");
  try {
    setAutoSaveLabel("正在保存当前项目…", "info");
    await flushAutoSave();
    const projectId = createWorkspaceProjectId();
    const now = Date.now();
    const duplicatedProject = cloneProjectConfig(state.project);
    duplicatedProject.name = `${state.project.name} Copy`;
    currentProjectId = projectId;
    workspaceIndex.currentProjectId = projectId;
    workspaceIndex.projects.push({
      id: projectId,
      name: duplicatedProject.name,
      createdAt: now,
      updatedAt: now,
      viewport: pixiStage.getViewportState(),
    });
    state = createEditorState(duplicatedProject, state.runtimeAssets);
    clearUndoHistory();
    clearPreviewBaseCache();
    await saveProjectRecord(projectId, state.project, now, now);
    await saveRuntimeAssets(projectId, state.runtimeAssets, {
      skipExisting: true,
    });
    assetsDirty = false;
    saveWorkspaceIndex(workspaceIndex);
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.setViewportState(getCurrentProjectSummary()?.viewport ?? null);
    updateZoomLabel(pixiStage.getViewportState().scale);
    setAutoSaveLabel("已自动保存", "success");
    showStatus("已复制当前项目，并已切换到副本。", "success");
  } catch (error) {
    setAutoSaveLabel("复制失败", "error");
    showStatus(`复制项目失败：${getErrorMessage(error)}`, "error");
  } finally {
    isWorkspaceOperationRunning = false;
    setButtonLoading(els.btnDuplicateProject, false);
  }
}

async function resetCurrentWorkspaceProject(): Promise<void> {
  if (!workspaceIndex || !currentProjectId) return;
  if (!isResetConfirmVisible) {
    showResetConfirmation();
    return;
  }

  try {
    setAutoSaveLabel("初始化中…", "info");
    clearAutoSaveTimer();
    stopPlayback({ silent: true });
    revokeRuntimeAssetUrls();

    const resetState = createInitialEditorState();
    state = resetState;
    clearUndoHistory();
    clearPreviewBaseCache();
    await clearRuntimeAssetsForProject(currentProjectId);
    await saveProjectRecord(currentProjectId, state.project);
    updateCurrentProjectSummary();
    const summary = getCurrentProjectSummary();
    if (summary) summary.viewport = undefined;
    saveWorkspaceIndex(workspaceIndex);

    hideResetConfirmation();
    hideDeleteConfirmation();
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.resetView();
    updateZoomLabel(pixiStage.getViewportState().scale);
    setAutoSaveLabel("已自动保存", "success");
    showStatus("当前项目已初始化：资源、图层与项目状态已重置。", "success");
  } catch (error) {
    hideResetConfirmation();
    setAutoSaveLabel("初始化失败", "error");
    showStatus(`初始化项目失败：${getErrorMessage(error)}`, "error");
  }
}

async function deleteCurrentWorkspaceProject(): Promise<void> {
  if (!workspaceIndex || !currentProjectId) return;
  if (workspaceIndex.projects.length <= 1) {
    showStatus("至少需要保留一个项目，不能删除最后一个项目。", "error");
    return;
  }

  if (!isDeleteConfirmVisible) {
    showDeleteConfirmation();
    return;
  }

  try {
    const deletedId = currentProjectId;
    clearAutoSaveTimer();
    stopPlayback({ silent: true });
    await deleteProjectFromWorkspace(deletedId);
    workspaceIndex.projects = workspaceIndex.projects.filter(
      (project) => project.id !== deletedId,
    );
    const nextProject = workspaceIndex.projects[0];
    currentProjectId = nextProject.id;
    workspaceIndex.currentProjectId = nextProject.id;
    saveWorkspaceIndex(workspaceIndex);
    const project = await loadProjectConfig(nextProject.id);
    if (!project) throw new Error("下一个项目记录不存在");
    const runtimeAssets = await loadRuntimeAssets(nextProject.id, project);
    revokeRuntimeAssetUrls();
    state = createEditorState(project, runtimeAssets);
    clearUndoHistory();
    clearPreviewBaseCache();
    hideDeleteConfirmation();
    syncProjectControls();
    syncProjectFields();
    await renderAllAsync();
    pixiStage.setViewportState(nextProject.viewport ?? null);
    updateZoomLabel(pixiStage.getViewportState().scale);
    setAutoSaveLabel("已自动保存", "success");
    showStatus("已删除项目，并切换到下一个项目。", "success");
  } catch (error) {
    hideDeleteConfirmation();
    setAutoSaveLabel("删除失败", "error");
    showStatus(`删除项目失败：${getErrorMessage(error)}`, "error");
  }
}

function showResetConfirmation(): void {
  hideDeleteConfirmation();
  isResetConfirmVisible = true;
  els.btnResetProject.classList.add("hidden");
  els.btnConfirmResetProject.classList.remove("hidden");
  els.btnCancelResetProject.classList.remove("hidden");
  showStatus("确认初始化当前项目？这会清空资源、图层并恢复默认状态。", "error");
}

function hideResetConfirmation(): void {
  isResetConfirmVisible = false;
  els.btnResetProject.classList.remove("hidden");
  els.btnConfirmResetProject.classList.add("hidden");
  els.btnCancelResetProject.classList.add("hidden");
}

function showDeleteConfirmation(): void {
  hideResetConfirmation();
  if (!workspaceIndex || workspaceIndex.projects.length <= 1) {
    showStatus("至少需要保留一个项目，不能删除最后一个项目。", "error");
    return;
  }
  isDeleteConfirmVisible = true;
  els.btnDeleteProject.classList.add("hidden");
  els.btnConfirmDeleteProject.classList.remove("hidden");
  els.btnCancelDeleteProject.classList.remove("hidden");
  showStatus("确认删除当前项目？此操作只删除本地工作区中的该项目。", "error");
}

function hideDeleteConfirmation(): void {
  isDeleteConfirmVisible = false;
  els.btnDeleteProject.classList.remove("hidden");
  els.btnConfirmDeleteProject.classList.add("hidden");
  els.btnCancelDeleteProject.classList.add("hidden");
}

function renderAll(): void {
  renderStaticUi();
  renderProperties();
  void pixiStage.render(state);
}

async function renderAllAsync(): Promise<void> {
  renderStaticUi();
  renderProperties();
  await pixiStage.render(state);
}

function renderStaticUi(): void {
  normalizeProjectLayerGroups(state.project);
  normalizeProjectMasks(state.project);
  const timelineScrollBackup = els.timelineTrack.scrollTop;
  els.layerList.innerHTML = "";
  els.timelineItems.innerHTML = "";
  els.layerCountLabel.textContent = String(state.project.layers.length);
  els.stageSizeLabel.textContent = `${state.project.stage.height}×${state.project.stage.width}`;

  for (const group of getOrderedLayerGroups()) {
    appendLayerGroupHeader(group);
    if (group.collapsed) continue;
    const orderedLayers = state.project.layers
      .filter((layer) => layer.groupId === group.id)
      .reverse();
    for (const layer of orderedLayers) {
      appendLayerDropIndicator(layer.id, "before");
      appendLayerCard(layer);
    }
    if (orderedLayers.length > 0) {
      appendLayerDropIndicator(
        orderedLayers[orderedLayers.length - 1].id,
        "after",
      );
    }
  }

  const normalizedDuration = normalizeProjectDurationToAnimationEnd({
    silent: true,
  });
  els.durationSeconds.value = formatTimelineSeconds(normalizedDuration);
  els.cbShowSelectionOutline.checked = state.showSelectionOutline;
  syncPlaybackRangeInputs({ silent: true });
  els.timeLabel.textContent = `${state.playheadSeconds.toFixed(2)}s / ${normalizedDuration.toFixed(2)}s`;
  renderTimelineAnimations({ scrollTop: timelineScrollBackup });
}

function appendLayerCard(layer: V5GLayerConfig): void {
  const card = document.createElement("div");
  const selected = layer.id === state.selectedLayerId;
  const group = getLayerGroup(state.project, layer.groupId);
  const layerIndex = state.project.layers.findIndex(
    (item) => item.id === layer.id,
  );
  card.dataset.layerId = layer.id;
  card.className = [
    "ml-2 w-[calc(100%-0.5rem)] cursor-pointer rounded-lg border p-2 text-left transition",
    selected
      ? "border-zinc-400/70 bg-zinc-200 text-black"
      : "border-white/10 bg-[#10141d] hover:border-zinc-400/40 hover:bg-slate-800/70",
    layer.visible && group?.visible !== false ? "" : "opacity-55",
    draggedLayerId === layer.id ? "opacity-35" : "",
  ].join(" ");
  card.innerHTML = `
    <div class="layer-select flex w-full items-center gap-2 text-left">
      <span class="layer-drag-handle flex h-5 w-5 shrink-0 cursor-pointer touch-none items-center justify-center rounded-full bg-white font-mono text-[10px] font-bold text-black" title="按住拖动调整图层顺序">${layerIndex + 1}</span>
      <i class="fa-solid ${layer.type === "image" ? "fa-image" : "fa-font"} ${selected ? "text-black" : layer.visible ? "text-zinc-300" : "text-zinc-600"}"></i>
      <input type="text" data-layer-name="${escapeHtml(layer.id)}" value="${escapeHtml(layer.name)}" class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs ${selected ? "text-black placeholder:text-black" : "text-slate-100"} outline-none transition focus:border-zinc-400 focus:bg-white/10" title="直接修改图层名称" />
      <div class="flex shrink-0 items-center gap-1">
        <button type="button" data-action="visible" class="layer-action rounded px-1.5 py-1 text-[10px] ${selected ? "bg-black/10 text-black hover:bg-black/20" : layer.visible ? "bg-zinc-900 text-zinc-200 hover:bg-zinc-800" : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"} transition" title="隐藏 / 显示"><i class="fa-solid ${layer.visible ? "fa-eye" : "fa-eye-slash"}"></i></button>
        <button type="button" data-action="lock" class="layer-action rounded px-1.5 py-1 text-[10px] ${layer.locked ? "text-[#ffe28b]" : selected ? "text-black/60" : "text-zinc-500"} ${selected ? "bg-black/10 hover:bg-black/20" : "bg-zinc-900 hover:bg-zinc-800"} transition" title="锁定 / 解锁图层拖动"><i class="fa-solid ${layer.locked ? "fa-lock" : "fa-lock-open"}"></i></button>
        <button type="button" data-action="duplicate" class="layer-action rounded px-1.5 py-1 text-[10px] ${selected ? "bg-black/10 text-black hover:bg-black/20" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"} transition" title="复制图层：复用资源，复制基础属性和动画"><i class="fa-solid fa-clone"></i></button>
        <button type="button" data-action="delete" class="layer-action rounded px-1.5 py-1 text-[10px] ${selected ? "bg-black/10 text-black hover:bg-black/20" : "bg-zinc-900 text-zinc-400 hover:bg-red-950/70 hover:text-red-200"} transition" title="删除图层"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;
  const selectButton = card.querySelector(".layer-select");
  selectButton?.addEventListener("click", () => {
    state.selectedLayerId = layer.id;
    renderAll();
  });
  const nameInput = card.querySelector<HTMLInputElement>("[data-layer-name]");
  nameInput?.addEventListener("click", (event) => event.stopPropagation());
  nameInput?.addEventListener("input", (event) => {
    event.stopPropagation();
    updateLayerNameFromList(layer.id, nameInput.value);
  });
  nameInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    nameInput.blur();
  });
  for (const actionButton of card.querySelectorAll(".layer-action")) {
    actionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const action = (event.currentTarget as HTMLButtonElement).dataset.action;
      handleLayerAction(layer.id, action ?? "");
    });
  }
  bindLayerDragEvents(card, layer.id);
  els.layerList.appendChild(card);
}

function getOrderedLayerGroups(): V5GLayerGroupConfig[] {
  normalizeProjectLayerGroups(state.project);
  return [...state.project.layerGroups].sort(
    (left, right) => left.order - right.order,
  );
}

function appendLayerGroupHeader(group: V5GLayerGroupConfig): void {
  const groupLayers = state.project.layers.filter(
    (layer) => layer.groupId === group.id,
  );
  const header = document.createElement("div");
  header.dataset.layerGroupId = group.id;
  header.className = [
    "rounded-md border border-white/10 bg-zinc-950/80 px-2 py-1.5 text-[10px] text-zinc-300",
    group.visible ? "" : "opacity-55",
  ].join(" ");
  header.innerHTML = `
    <div class="flex items-center gap-1.5">
      <button type="button" data-group-action="collapse" class="rounded px-1 py-0.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100" title="展开 / 收起分组"><i class="fa-solid ${group.collapsed ? "fa-chevron-right" : "fa-chevron-down"}"></i></button>
      <i class="fa-solid fa-layer-group text-zinc-500"></i>
      <input type="text" data-group-name="${escapeHtml(group.id)}" value="${escapeHtml(group.name)}" class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold text-zinc-200 outline-none transition focus:border-zinc-500 focus:bg-white/10" title="直接修改分组名称" />
      <span class="font-mono text-[9px] text-zinc-600">${groupLayers.length}</span>
      <button type="button" data-group-action="visible" class="rounded px-1.5 py-1 text-[10px] ${group.visible ? "text-zinc-300" : "text-zinc-600"} transition hover:bg-zinc-800 hover:text-zinc-100" title="整体隐藏 / 显示此分组"><i class="fa-solid ${group.visible ? "fa-eye" : "fa-eye-slash"}"></i></button>
    </div>
  `;
  header
    .querySelector<HTMLElement>('[data-group-action="collapse"]')
    ?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLayerGroupCollapsed(group.id);
    });
  header
    .querySelector<HTMLElement>('[data-group-action="visible"]')
    ?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleLayerGroupVisible(group.id);
    });
  const nameInput = header.querySelector<HTMLInputElement>("[data-group-name]");
  nameInput?.addEventListener("click", (event) => event.stopPropagation());
  nameInput?.addEventListener("change", () =>
    renameLayerGroup(group.id, nameInput.value),
  );
  nameInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    nameInput.blur();
  });
  els.layerList.appendChild(header);
}

function createLayerGroupFromButton(): void {
  pushUndoSnapshot();
  const nextOrder = state.project.layerGroups.length;
  const group = createDefaultLayerGroup(nextOrder, `分组 ${nextOrder + 1}`);
  state.project.layerGroups.push(group);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    `已新建分组：${group.name}。选中图层后可在右侧基础属性里切换到该分组。`,
    "success",
  );
}

function toggleLayerGroupCollapsed(groupId: string): void {
  const group = getLayerGroup(state.project, groupId);
  if (!group) return;
  group.collapsed = !group.collapsed;
  renderStaticUi();
  scheduleAutoSave();
}

function toggleLayerGroupVisible(groupId: string): void {
  const group = getLayerGroup(state.project, groupId);
  if (!group) return;
  pushUndoSnapshot();
  group.visible = !group.visible;
  clearPreviewBaseCache();
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    group.visible
      ? `分组「${group.name}」已显示。`
      : `分组「${group.name}」已隐藏；编辑包会保留，运行包会跳过。`,
    "success",
  );
}

function renameLayerGroup(groupId: string, value: string): void {
  const group = getLayerGroup(state.project, groupId);
  if (!group) return;
  const nextName = value.trim();
  if (!nextName) {
    renderStaticUi();
    showStatus("分组名不能为空，已恢复原名称。", "error");
    return;
  }
  group.name = nextName;
  syncLayerGroupSelect(getSelectedLayer(state));
  scheduleAutoSave();
}

function getPreferredNewLayerGroupId(): string {
  normalizeProjectLayerGroups(state.project);
  const selectedLayer = getSelectedLayer(state);
  if (
    selectedLayer?.groupId &&
    getLayerGroup(state.project, selectedLayer.groupId)
  ) {
    return selectedLayer.groupId;
  }
  const firstVisibleGroup = getOrderedLayerGroups().find(
    (group) => group.visible,
  );
  return (
    firstVisibleGroup?.id ?? state.project.layerGroups[0]?.id ?? "group_default"
  );
}

function syncLayerGroupSelect(layer: V5GLayerConfig | null): void {
  normalizeProjectLayerGroups(state.project);
  els.propLayerGroup.innerHTML = "";
  for (const group of getOrderedLayerGroups()) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.visible ? group.name : `${group.name}（隐藏）`;
    option.style.backgroundColor = "#050505";
    option.style.color = "#f4f4f5";
    els.propLayerGroup.appendChild(option);
  }
  els.propLayerGroup.value =
    layer?.groupId ?? state.project.layerGroups[0]?.id ?? "";
}

function syncLayerMaskControls(layer: V5GLayerConfig): void {
  normalizeProjectMasks(state.project);
  const candidates = state.project.layers.filter(
    (item) => item.id !== layer.id,
  );
  els.propMaskSource.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent =
    candidates.length === 0 ? "无可用遮罩图层" : "不使用遮罩";
  noneOption.style.backgroundColor = "#050505";
  noneOption.style.color = "#f4f4f5";
  els.propMaskSource.appendChild(noneOption);

  for (const candidate of candidates) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `${candidate.name}${candidate.visible ? "" : "（隐藏）"}`;
    option.style.backgroundColor = "#050505";
    option.style.color = "#f4f4f5";
    els.propMaskSource.appendChild(option);
  }

  const sourceLayerId = layer.mask?.sourceLayerId ?? "";
  const hasSource = candidates.some(
    (candidate) => candidate.id === sourceLayerId,
  );
  els.propMaskEnabled.checked = layer.mask?.enabled === true && hasSource;
  els.propMaskEnabled.disabled = candidates.length === 0;
  els.propMaskSource.disabled = candidates.length === 0;
  els.propMaskSource.value = hasSource ? sourceLayerId : "";
  els.propMaskShowSource.checked = layer.mask?.showSourceLayer !== false;
  els.propMaskShowSource.disabled = candidates.length === 0;
  els.maskWarning.classList.toggle("hidden", !els.propMaskEnabled.checked);
}

function updateSelectedLayerMaskFromProperties(): void {
  const layer = getSelectedLayer(state);
  if (!layer) return;
  const sourceLayerId = els.propMaskSource.value || null;
  const hasValidSource =
    sourceLayerId !== null &&
    sourceLayerId !== layer.id &&
    state.project.layers.some((candidate) => candidate.id === sourceLayerId);
  const enabled = els.propMaskEnabled.checked && hasValidSource;

  pushUndoSnapshot();
  layer.mask = {
    enabled,
    sourceLayerId: hasValidSource ? sourceLayerId : null,
    mode: "alpha",
    compositeMode: "precompose_light_alpha",
    showSourceLayer: els.propMaskShowSource.checked,
  };
  normalizeProjectMasks(state.project);
  clearLayerPreview(layer.id);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    enabled
      ? `已为「${layer.name}」启用高级光效遮罩：光效图层会先去黑预合成，再按遮罩源 alpha 裁剪。`
      : `已关闭「${layer.name}」的图层遮罩。`,
    "success",
  );
}

function updateSelectedLayerGroupFromProperties(): void {
  const layer = getSelectedLayer(state);
  const nextGroupId = els.propLayerGroup.value;
  if (!layer || !nextGroupId || layer.groupId === nextGroupId) return;
  const group = getLayerGroup(state.project, nextGroupId);
  if (!group) {
    syncLayerGroupSelect(layer);
    showStatus("目标分组不存在，已恢复当前分组。", "error");
    return;
  }
  pushUndoSnapshot();
  layer.groupId = group.id;
  renderAll();
  scheduleAutoSave(0);
  showStatus(`已将「${layer.name}」移动到分组「${group.name}」。`, "success");
}

function handleLayerAction(layerId: string, action: string): void {
  const index = state.project.layers.findIndex((layer) => layer.id === layerId);
  if (index === -1) return;
  state.selectedLayerId = layerId;

  if (action === "visible") {
    const layer = state.project.layers[index];
    layer.visible = !layer.visible;
    showStatus(
      layer.visible ? "图层已显示。" : "图层已隐藏，画布同步不可见。",
      "success",
    );
  } else if (action === "lock") {
    const layer = state.project.layers[index];
    layer.locked = !layer.locked;
    showStatus(
      layer.locked
        ? "图层已锁定，不能在画布中拖动。"
        : "图层已解锁，可在画布中拖动。",
      "success",
    );
  } else if (action === "duplicate") {
    duplicateLayerAt(index);
    return;
  } else if (action === "delete") {
    deleteLayerAt(index);
    return;
  } else {
    return;
  }

  renderAll();
  scheduleAutoSave(0);
}

function updateLayerNameFromList(layerId: string, value: string): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  const nextName = value.trim();
  if (!nextName) return;

  layer.name = nextName;
  if (layer.type === "text") layer.text = nextName;
  if (state.selectedLayerId === layerId) {
    els.selectedLayerHeading.textContent = layer.name;
    els.propName.value = layer.name;
  }
  void pixiStage.render(state);
  scheduleAutoSave();
}

function appendLayerDropIndicator(
  targetLayerId: string,
  position: "before" | "after",
): void {
  const indicator = document.createElement("div");
  const active =
    draggedLayerId !== null &&
    layerDropTargetId === targetLayerId &&
    layerDropPosition === position;
  indicator.className = active
    ? "my-1 h-0.5 rounded-full bg-sky-400 shadow shadow-sky-300/70"
    : "h-1";
  indicator.dataset.dropTargetId = targetLayerId;
  indicator.dataset.dropPosition = position;
  els.layerList.appendChild(indicator);
}

function bindLayerDragEvents(card: HTMLElement, layerId: string): void {
  const handle = card.querySelector<HTMLElement>(".layer-drag-handle");
  handle?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startLayerPointerDrag(event, layerId, card);
  });
}

function startLayerPointerDrag(
  event: PointerEvent,
  layerId: string,
  card: HTMLElement,
): void {
  draggedLayerId = layerId;
  state.selectedLayerId = layerId;
  const handle = card.querySelector<HTMLElement>(".layer-drag-handle");
  card.classList.remove("cursor-pointer");
  handle?.classList.remove("cursor-pointer");
  card.classList.add("cursor-grabbing", "opacity-35");
  handle?.classList.add("cursor-grabbing");
  card.setPointerCapture(event.pointerId);

  const handleMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
    const target = getLayerDropTargetFromPoint(
      moveEvent.clientX,
      moveEvent.clientY,
    );
    if (!target) return;
    setLayerDropTarget(target.layerId, target.position);
  };

  const cleanupPointerDragListeners = () => {
    card.classList.remove("cursor-grabbing");
    card.classList.add("cursor-pointer");
    handle?.classList.remove("cursor-grabbing");
    handle?.classList.add("cursor-pointer");
    if (card.hasPointerCapture(event.pointerId)) {
      card.releasePointerCapture(event.pointerId);
    }
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleEnd);
    window.removeEventListener("pointercancel", handleCancel);
  };

  const handleEnd = () => {
    cleanupPointerDragListeners();
    completeLayerDrop();
  };

  const handleCancel = () => {
    cleanupPointerDragListeners();
    clearLayerDragState();
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleEnd);
  window.addEventListener("pointercancel", handleCancel);
}

function getLayerDropTargetFromPoint(
  clientX: number,
  clientY: number,
): { layerId: string; position: "before" | "after" } | null {
  const layerCards = Array.from(
    els.layerList.querySelectorAll<HTMLElement>("[data-layer-id]"),
  );
  if (layerCards.length === 0) return null;

  const pointerOverList = isPointInsideRect(
    clientX,
    clientY,
    els.layerList.getBoundingClientRect(),
  );
  if (!pointerOverList) return null;

  for (const card of layerCards) {
    const layerId = card.dataset.layerId;
    if (!layerId || layerId === draggedLayerId) continue;
    const rect = card.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return {
        layerId,
        position: clientY < rect.top + rect.height / 2 ? "before" : "after",
      };
    }
  }

  const candidates = layerCards
    .map((card) => ({ card, rect: card.getBoundingClientRect() }))
    .filter(({ card }) => card.dataset.layerId !== draggedLayerId)
    .sort((a, b) => a.rect.top - b.rect.top);
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (!first || !last) return null;
  if (clientY < first.rect.top) {
    return { layerId: first.card.dataset.layerId ?? "", position: "before" };
  }
  if (clientY > last.rect.bottom) {
    return { layerId: last.card.dataset.layerId ?? "", position: "after" };
  }

  let nearest = first;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.min(
      Math.abs(clientY - candidate.rect.top),
      Math.abs(clientY - candidate.rect.bottom),
    );
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return {
    layerId: nearest.card.dataset.layerId ?? "",
    position:
      clientY < nearest.rect.top + nearest.rect.height / 2 ? "before" : "after",
  };
}

function isPointInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function setLayerDropTarget(
  targetLayerId: string,
  position: "before" | "after",
): void {
  if (!draggedLayerId || targetLayerId === draggedLayerId) return;
  if (layerDropTargetId === targetLayerId && layerDropPosition === position) {
    return;
  }
  layerDropTargetId = targetLayerId;
  layerDropPosition = position;
  refreshLayerDropIndicators();
}

function refreshLayerDropIndicators(): void {
  for (const indicator of els.layerList.querySelectorAll<HTMLElement>(
    "[data-drop-target-id]",
  )) {
    const active =
      draggedLayerId !== null &&
      indicator.dataset.dropTargetId === layerDropTargetId &&
      indicator.dataset.dropPosition === layerDropPosition;
    indicator.className = active
      ? "my-1 h-0.5 rounded-full bg-sky-400 shadow shadow-sky-300/70"
      : "h-1";
  }
}

function completeLayerDrop(): void {
  if (!draggedLayerId || !layerDropTargetId || !layerDropPosition) {
    clearLayerDragState();
    return;
  }
  const fromIndex = state.project.layers.findIndex(
    (layer) => layer.id === draggedLayerId,
  );
  const targetIndex = state.project.layers.findIndex(
    (layer) => layer.id === layerDropTargetId,
  );
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    clearLayerDragState();
    return;
  }
  const targetLayerId = layerDropTargetId;
  const targetPosition = layerDropPosition;
  pushUndoSnapshot();
  const [movingLayer] = state.project.layers.splice(fromIndex, 1);
  if (!movingLayer) {
    clearLayerDragState();
    return;
  }
  let insertIndex = state.project.layers.findIndex(
    (layer) => layer.id === targetLayerId,
  );
  if (insertIndex === -1) {
    state.project.layers.splice(fromIndex, 0, movingLayer);
    clearLayerDragState();
    return;
  }
  const targetLayer = state.project.layers.find(
    (layer) => layer.id === targetLayerId,
  );
  if (targetLayer?.groupId) movingLayer.groupId = targetLayer.groupId;
  if (targetPosition === "before") insertIndex += 1;
  state.project.layers.splice(insertIndex, 0, movingLayer);
  state.selectedLayerId = movingLayer.id;
  clearLayerDragState({ render: false });
  renderAll();
  scheduleAutoSave(0);
  showStatus("图层顺序已通过拖动调整，画布层级已同步。", "success");
}

function clearLayerDragState(options: { render?: boolean } = {}): void {
  draggedLayerId = null;
  layerDropTargetId = null;
  layerDropPosition = null;
  if (options.render !== false) renderAll();
}

function duplicateLayerAt(index: number): void {
  const sourceLayer = state.project.layers[index];
  if (!sourceLayer) return;

  pushUndoSnapshot();
  const copiedLayer: V5GLayerConfig = {
    ...sourceLayer,
    id: createId(sourceLayer.type === "image" ? "layer_image" : "layer_text"),
    name: getDuplicateLayerName(sourceLayer.name),
    transform: cloneTransform(sourceLayer.transform),
    animations: sourceLayer.animations.map((animation) => ({
      ...animation,
      id: createId("anim_module"),
      params: { ...animation.params },
    })),
    keyframes: sourceLayer.keyframes?.map((keyframe) => ({
      ...keyframe,
      id: createId("keyframe"),
      transform: cloneTransform(keyframe.transform),
    })),
    mask: sourceLayer.mask ? { ...sourceLayer.mask } : undefined,
  };
  if (copiedLayer.type === "text") copiedLayer.text = sourceLayer.text;

  state.project.layers.splice(index + 1, 0, copiedLayer);
  state.selectedLayerId = copiedLayer.id;
  selectedAnimationId = copiedLayer.animations[0]?.id ?? null;
  if (copiedLayer.animations.length > 0) {
    expandedTimelineLayerIds.add(copiedLayer.id);
  }
  clearLayerPreview(copiedLayer.id);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    `已复制图层：${sourceLayer.name}。新图层复用同一资源，但基础属性、显示模式和动画可独立调整。`,
    "success",
  );
}

function getDuplicateLayerName(sourceName: string): string {
  const baseName = `${sourceName} Copy`;
  const existingNames = new Set(
    state.project.layers.map((layer) => layer.name),
  );
  if (!existingNames.has(baseName)) return baseName;
  let index = 2;
  while (existingNames.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

function deleteLayerAt(index: number): void {
  const layer = state.project.layers[index];
  if (!layer) return;

  pushUndoSnapshot();
  const [deletedLayer] = state.project.layers.splice(index, 1);
  if (!deletedLayer) return;
  clearLayerPreview(deletedLayer.id);
  for (const layer of state.project.layers) {
    if (layer.mask?.sourceLayerId === deletedLayer.id) {
      layer.mask = {
        enabled: false,
        sourceLayerId: null,
        mode: "alpha",
        compositeMode: layer.mask.compositeMode ?? "precompose_light_alpha",
        showSourceLayer: layer.mask.showSourceLayer !== false,
      };
    }
  }
  normalizeProjectMasks(state.project);
  removeUnusedAssetForDeletedLayer(deletedLayer);
  if (state.selectedLayerId === deletedLayer.id) {
    state.selectedLayerId =
      state.project.layers[Math.min(index, state.project.layers.length - 1)]
        ?.id ?? null;
  }
  renderAll();
  scheduleAutoSave(0);
  showStatus(`已删除图层：${deletedLayer.name}，画布已同步移除。`, "success");
}

function removeUnusedAssetForDeletedLayer(deletedLayer: V5GLayerConfig): void {
  removeUnusedAssetById(deletedLayer.assetId);
}

function removeUnusedAssetById(assetId: string | null): void {
  if (!assetId) return;
  const stillUsed = state.project.layers.some(
    (layer) => layer.assetId === assetId,
  );
  if (stillUsed) return;

  state.project.assets = state.project.assets.filter(
    (asset) => asset.id !== assetId,
  );
  // Keep runtimeAssets in memory and IndexedDB until the next full project cleanup.
  // This makes Delete/Replace + Ctrl/Cmd+Z safe for image layers without duplicating
  // File blobs in the undo stack. Export/save only uses assets still referenced by
  // project.assets.
}

function renderTimelineAnimations(options: { scrollTop?: number } = {}): void {
  const scrollBefore = options.scrollTop ?? els.timelineTrack.scrollTop;
  els.timelineItems.innerHTML = "";
  const duration = normalizeProjectDurationToAnimationEnd({ silent: true });
  const viewportWidth = getTimelineViewportWidth();
  const contentWidth = getTimelineContentWidth(viewportWidth);
  clampTimelineScrollLeft(viewportWidth, contentWidth);
  renderTimelineRuler(duration, contentWidth);

  const orderedLayers = [...state.project.layers].reverse();
  if (orderedLayers.length === 0) {
    const empty = document.createElement("div");
    empty.className =
      "rounded bg-slate-900 px-2 py-2 text-[10px] text-slate-500";
    empty.textContent =
      "还没有图层。新增图片或文字后，可在这里查看全局动画时间。";
    els.timelineItems.appendChild(empty);
    els.timelineTrack.scrollTop = scrollBefore;
    return;
  }

  for (const layer of orderedLayers) {
    const enabledAnimations = layer.animations.filter((item) => item.enabled);
    const layerIndex = state.project.layers.findIndex(
      (item) => item.id === layer.id,
    );
    const selected = layer.id === state.selectedLayerId;
    const isExpanded = expandedTimelineLayerIds.has(layer.id);
    const row = document.createElement("div");
    row.className = [
      "grid grid-cols-[136px_minmax(0,1fr)] items-start gap-2 rounded border bg-zinc-900/60 px-2 py-1 transition hover:border-amber-300/50",
      selected ? "border-amber-300/70" : "border-white/10",
      isLayerEffectivelyVisible(state.project, layer) ? "" : "opacity-55",
    ].join(" ");
    row.dataset.timelineLayerId = layer.id;
    row.title = `第 ${layerIndex + 1} 层 · ${layer.name}`;
    row.addEventListener("click", () => {
      selectLayerFromTimeline(layer.id);
    });

    const labelWrap = document.createElement("div");
    labelWrap.className = "flex min-w-0 items-start gap-1";

    const expandButton = document.createElement("button");
    expandButton.type = "button";
    expandButton.className = [
      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-950 text-[10px] text-zinc-400 transition",
      enabledAnimations.length > 0
        ? "hover:bg-zinc-800 hover:text-zinc-100"
        : "cursor-default opacity-40",
    ].join(" ");
    expandButton.disabled = enabledAnimations.length === 0;
    expandButton.title = isExpanded ? "收起动画轨道" : "展开每个动画的独立轨道";
    expandButton.innerHTML = `<i class="fa-solid ${isExpanded ? "fa-chevron-down" : "fa-chevron-right"}"></i>`;
    expandButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleTimelineLayerExpanded(layer.id);
    });

    const label = document.createElement("button");
    label.type = "button";
    label.className =
      "min-w-0 flex-1 text-left text-[10px] text-zinc-400 transition hover:text-zinc-200";
    label.innerHTML = `
      <div class="flex min-w-0 items-center gap-1">
        <i class="fa-solid ${layer.type === "image" ? "fa-image" : "fa-font"} ${isLayerEffectivelyVisible(state.project, layer) ? "text-zinc-300" : "text-slate-600"}"></i>
        <span class="truncate ${selected ? "text-zinc-100" : "text-zinc-300"}">${escapeHtml(layer.name)}</span>
      </div>
      <div class="mt-0.5 font-mono text-[9px] text-slate-500">L${layerIndex + 1} · ${enabledAnimations.length} 个动画</div>
    `;
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLayerFromTimeline(layer.id);
    });
    labelWrap.append(expandButton, label);

    const laneStack = document.createElement("div");
    laneStack.className = isExpanded ? "space-y-1" : "";
    const summaryLane = createTimelineLane(contentWidth, "h-5");
    appendTimelinePlayhead(summaryLane.content);

    if (enabledAnimations.length === 0) {
      const none = document.createElement("div");
      none.className =
        "absolute inset-y-0 left-0 flex items-center px-2 text-[9px] text-slate-600";
      none.textContent = "无动画";
      summaryLane.content.appendChild(none);
      laneStack.appendChild(summaryLane.track);
    } else if (!isExpanded) {
      for (const animation of enabledAnimations) {
        appendTimelineAnimationBlock(
          summaryLane.content,
          layer,
          animation,
          false,
        );
      }
      laneStack.appendChild(summaryLane.track);
    } else {
      const hint = document.createElement("div");
      hint.className = "px-1 pb-0.5 text-[9px] text-slate-500";
      hint.textContent =
        "拖动动画块修改开始秒；拖右侧把手修改持续秒；全部按 0.05s 吸附。";
      laneStack.appendChild(hint);
      for (const animation of enabledAnimations) {
        const animationLane = createTimelineLane(contentWidth, "h-6");
        appendTimelinePlayhead(animationLane.content);
        appendTimelineAnimationBlock(
          animationLane.content,
          layer,
          animation,
          true,
        );
        laneStack.appendChild(animationLane.track);
      }
    }

    row.appendChild(labelWrap);
    row.appendChild(laneStack);
    els.timelineItems.appendChild(row);
  }
  els.timelineTrack.scrollTop = scrollBefore;
}

function createTimelineLane(
  contentWidth: number,
  heightClass: string,
  label?: string,
  labelTitle?: string,
  labelClass = "text-slate-500",
): { track: HTMLElement; content: HTMLElement } {
  const track = document.createElement("div");
  track.dataset.timelineLane = "true";
  track.dataset.timelineViewport = "true";
  track.className = `relative ${heightClass} overflow-hidden rounded bg-zinc-950`;

  const content = document.createElement("div");
  content.className = "absolute inset-y-0 left-0";
  content.style.width = `${contentWidth}px`;
  content.style.transform = `translateX(${-timelineScrollLeft}px)`;
  content.style.transformOrigin = "left center";
  track.appendChild(content);

  if (label) {
    const laneLabel = document.createElement("div");
    laneLabel.className = `pointer-events-none absolute inset-y-0 left-0 z-10 flex max-w-[92px] items-center truncate px-1 text-[9px] ${labelClass}`;
    laneLabel.title = labelTitle ?? label;
    laneLabel.textContent = label;
    track.appendChild(laneLabel);
  }

  return { track, content };
}

function appendTimelinePlayhead(content: HTMLElement): void {
  const playhead = document.createElement("div");
  playhead.dataset.timelinePlayhead = "true";
  playhead.className =
    "pointer-events-auto absolute bottom-0 top-0 z-30 w-[7px] -translate-x-1/2 cursor-ew-resize bg-amber-300 shadow shadow-amber-300/60 before:absolute before:-top-1 before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-x-[4px] before:border-t-[5px] before:border-x-transparent before:border-t-amber-300 after:absolute after:-bottom-1 after:left-1/2 after:h-0 after:w-0 after:-translate-x-1/2 after:border-x-[4px] after:border-b-[5px] after:border-x-transparent after:border-b-amber-300";
  playhead.style.left = `${timeToTimelineX(state.playheadSeconds)}px`;
  playhead.title = `拖动黄色刻度线预览 ${state.playheadSeconds.toFixed(2)}s`;
  content.appendChild(playhead);
}

function appendTimelineAnimationBlock(
  content: HTMLElement,
  layer: V5GLayerConfig,
  animation: V5GAnimationConfig,
  editable: boolean,
): void {
  const item = document.createElement("div");
  const endTime = animation.startTime + animation.duration;
  const selected = animation.id === selectedAnimationId;
  item.dataset.timelineAnimationBlock = "true";
  item.dataset.animationId = animation.id;
  item.dataset.layerId = layer.id;
  item.className = [
    "absolute top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full px-1.5 text-[9px] font-semibold leading-3 text-zinc-950 shadow shadow-black/30",
    selected
      ? "bg-amber-300 ring-2 ring-amber-200 shadow-amber-300/40"
      : "bg-zinc-200",
    editable
      ? "cursor-grab touch-none hover:bg-white"
      : "cursor-pointer hover:bg-amber-200",
  ].join(" ");
  item.style.left = `${timeToTimelineX(animation.startTime)}px`;
  item.style.width = `${Math.max(8, animation.duration * timelinePixelsPerSecond)}px`;
  item.title = `${layer.name} · ${animation.type} · ${formatTimelineSeconds(animation.startTime)}s - ${formatTimelineSeconds(endTime)}s`;
  item.textContent = `${getAnimationDisplayName(animation)} ${formatTimelineSeconds(animation.startTime)}-${formatTimelineSeconds(endTime)}s`;
  item.addEventListener("click", (event) => {
    event.stopPropagation();
    selectAnimationFromTimeline(layer.id, animation.id);
  });
  if (editable) {
    item.addEventListener("pointerdown", (event) =>
      startTimelineAnimationDrag(event, layer.id, animation.id, "move"),
    );
    const resizeHandle = document.createElement("span");
    resizeHandle.dataset.timelineAnimationResize = "true";
    resizeHandle.className =
      "absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize bg-zinc-950/25 hover:bg-zinc-950/40";
    resizeHandle.title = "拖动修改持续秒";
    resizeHandle.addEventListener("pointerdown", (event) =>
      startTimelineAnimationDrag(
        event,
        layer.id,
        animation.id,
        "resize-duration",
      ),
    );
    item.appendChild(resizeHandle);
  }
  content.appendChild(item);
}

function selectAnimationFromTimeline(
  layerId: string,
  animationId: string,
): void {
  state.selectedLayerId = layerId;
  selectedAnimationId = animationId;
  expandedTimelineLayerIds.add(layerId);
  collapsedAnimationIds.delete(animationId);
  stopPlayback({ silent: true, keepPlayhead: true });
  renderAll();
  scrollSelectedAnimationModuleIntoView();
  showStatus("已选中动画模块，右侧对应模块已展开并高亮。", "info");
}

function toggleTimelineLayerExpanded(layerId: string): void {
  if (expandedTimelineLayerIds.has(layerId)) {
    expandedTimelineLayerIds.delete(layerId);
  } else {
    expandedTimelineLayerIds.add(layerId);
  }
  renderTimelineAnimations();
}

function renderTimelineRuler(duration: number, contentWidth: number): void {
  els.timelineRulerTrack.innerHTML = "";
  const rulerContent = document.createElement("div");
  rulerContent.dataset.timelineViewport = "true";
  rulerContent.className = "absolute inset-y-0 left-0";
  rulerContent.style.width = `${contentWidth}px`;
  rulerContent.style.transform = `translateX(${-timelineScrollLeft}px)`;
  rulerContent.style.transformOrigin = "left center";
  els.timelineRulerTrack.appendChild(rulerContent);
  appendTimelineSegmentMarker(rulerContent, duration);

  const minorStep = TIMELINE_MINOR_TICK_SECONDS;
  const viewportWidth = getTimelineViewportWidth();
  const visibleStart = Math.max(
    0,
    timelineScrollLeft - timelinePixelsPerSecond,
  );
  const visibleEnd = Math.min(
    contentWidth,
    timelineScrollLeft + viewportWidth + timelinePixelsPerSecond,
  );
  const firstTickIndex = Math.floor(timelineXToTime(visibleStart) / minorStep);
  const lastTickIndex = Math.ceil(timelineXToTime(visibleEnd) / minorStep);
  const labelStep = getTimelineLabelStepSeconds();
  const rulerPlayhead = document.createElement("div");
  rulerPlayhead.dataset.timelinePlayhead = "true";
  rulerPlayhead.className =
    "pointer-events-auto absolute bottom-0 top-0 z-30 w-[7px] -translate-x-1/2 cursor-ew-resize bg-amber-300 shadow shadow-amber-300/60 before:absolute before:-top-1 before:left-1/2 before:h-0 before:w-0 before:-translate-x-1/2 before:border-x-[4px] before:border-t-[5px] before:border-x-transparent before:border-t-amber-300 after:absolute after:-bottom-1 after:left-1/2 after:h-0 after:w-0 after:-translate-x-1/2 after:border-x-[4px] after:border-b-[5px] after:border-x-transparent after:border-b-amber-300";
  rulerPlayhead.style.left = `${timeToTimelineX(state.playheadSeconds)}px`;
  rulerPlayhead.title = `拖动黄色刻度线预览 ${state.playheadSeconds.toFixed(2)}s`;
  rulerContent.appendChild(rulerPlayhead);

  for (let index = firstTickIndex; index <= lastTickIndex; index += 1) {
    const seconds = roundTo(index * minorStep, TIMELINE_TIME_DECIMALS);
    if (seconds < 0 || seconds > duration + 0.0001) continue;
    const isWholeSecond = Math.abs(seconds - Math.round(seconds)) < 0.0001;
    const isHalfSecond =
      Math.abs(seconds * 2 - Math.round(seconds * 2)) < 0.0001;
    const tick = document.createElement("div");
    tick.className = [
      "absolute bottom-0 w-px bg-zinc-700/80",
      isWholeSecond ? "h-5 bg-zinc-400" : isHalfSecond ? "h-4" : "h-2",
    ].join(" ");
    tick.style.left = `${timeToTimelineX(seconds)}px`;
    rulerContent.appendChild(tick);

    const remainder = seconds % labelStep;
    const shouldLabel =
      seconds === 0 ||
      remainder < 0.0001 ||
      Math.abs(labelStep - remainder) < 0.0001;
    if (!shouldLabel) continue;
    const label = document.createElement("div");
    label.className =
      "pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[9px] text-zinc-400";
    label.style.left = `${timeToTimelineX(seconds)}px`;
    label.textContent = `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`;
    rulerContent.appendChild(label);
  }
}

function appendTimelineSegmentMarker(
  content: HTMLElement,
  duration: number,
  options: { force?: boolean } = {},
): void {
  if (!options.force && !els.cbPlaySegment.checked) return;

  const start = snapTimelineSeconds(
    clampNumber(readNumberInput(els.playStartSeconds, 0), 0, duration),
  );
  let end = snapTimelineSeconds(
    clampNumber(readNumberInput(els.playEndSeconds, duration), 0, duration),
  );
  const minEnd = snapTimelineSeconds(
    clampNumber(start + TIMELINE_MINOR_TICK_SECONDS, 0, duration),
  );
  if (end <= start) end = minEnd > start ? minEnd : duration;
  if (end <= start) return;

  const startX = timeToTimelineX(start);
  const endX = timeToTimelineX(end);
  const width = Math.max(8, endX - startX);
  const marker = document.createElement("div");
  marker.className =
    "pointer-events-none absolute bottom-0 z-20 h-3 border-x-2 border-b-2 border-amber-300/90 bg-amber-300/10 shadow-[0_0_10px_rgba(252,211,77,0.35)]";
  marker.style.left = `${startX}px`;
  marker.style.width = `${width}px`;
  marker.title = `时间段播放范围：${formatTimelineSeconds(start)}s - ${formatTimelineSeconds(end)}s`;
  content.appendChild(marker);
}

function getTimelineLabelStepSeconds(): number {
  if (timelinePixelsPerSecond >= 160) return 0.5;
  if (timelinePixelsPerSecond >= 80) return 1;
  if (timelinePixelsPerSecond >= 45) return 2;
  return 5;
}

function selectLayerFromTimeline(layerId: string): void {
  state.selectedLayerId = layerId;
  if (
    !findLayer(layerId)?.animations.some(
      (animation) => animation.id === selectedAnimationId,
    )
  ) {
    selectedAnimationId = null;
  }
  renderAll();
}

function getTimelineLayerIdFromPointerEvent(
  event: PointerEvent,
): string | null {
  return (
    (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-timeline-layer-id]",
    )?.dataset.timelineLayerId ?? null
  );
}

function isTimelinePlayheadTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("[data-timeline-playhead]") !== null
  );
}

function isTimelineAnimationTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("[data-timeline-animation-block]") !== null
  );
}

function renderProperties(): void {
  sanitizeSelectedAnimation();
  const layer = getSelectedLayer(state);
  if (!layer) {
    els.selectionEmpty.classList.remove("hidden");
    els.propertyPanel.classList.add("hidden");
    return;
  }

  els.selectionEmpty.classList.add("hidden");
  els.propertyPanel.classList.remove("hidden");
  const layerIndex = state.project.layers.findIndex(
    (item) => item.id === layer.id,
  );
  els.selectedLayerMeta.textContent = `第 ${layerIndex + 1} 层`;
  els.selectedLayerHeading.textContent = layer.name;
  els.propName.value = layer.name;
  els.propX.value = String(layer.transform.x);
  els.propY.value = String(layer.transform.y);
  els.propScaleX.value = String(layer.transform.scaleX);
  els.propScaleY.value = String(layer.transform.scaleY);
  els.propRotation.value = String(layer.transform.rotation);
  els.propOpacity.value = String(layer.opacity);
  els.propBlendMode.value = normalizeBlendMode(layer.blendMode);
  syncLayerGroupSelect(layer);
  syncLayerMaskControls(layer);
  els.btnReplaceImage.classList.toggle("hidden", layer.type !== "image");
  syncLayerAnimationClipboardButtons(layer);
  syncAnimationPanel(layer);
}

function syncLayerAnimationClipboardButtons(layer: V5GLayerConfig): void {
  els.btnCopyLayerAnimations.disabled = layer.animations.length === 0;
  els.btnCopyLayerAnimations.classList.toggle(
    "opacity-45",
    layer.animations.length === 0,
  );
  els.btnCopyLayerAnimations.classList.toggle(
    "cursor-not-allowed",
    layer.animations.length === 0,
  );
  const canPaste = animationClipboard !== null;
  els.btnPasteLayerAnimations.disabled = !canPaste;
  els.btnPasteLayerAnimations.classList.toggle("opacity-45", !canPaste);
  els.btnPasteLayerAnimations.classList.toggle("cursor-not-allowed", !canPaste);
  const showingConfirm = isPendingAnimationPasteFor(layer.id, "layer-toolbar");
  els.btnConfirmPasteLayerAnimations.classList.toggle(
    "hidden",
    !showingConfirm,
  );
  els.btnCancelPasteLayerAnimations.classList.toggle("hidden", !showingConfirm);
  els.btnPasteLayerAnimations.classList.toggle("hidden", showingConfirm);
}

function copySelectedLayerAnimations(): void {
  const layer = getSelectedLayer(state);
  if (!layer) {
    showStatus("请先选择一个图层再复制动画。", "error");
    return;
  }
  if (layer.animations.length === 0) {
    showStatus("当前图层还没有动画可复制。", "error");
    return;
  }

  animationClipboard = {
    kind: "layer",
    sourceLayerName: layer.name,
    animations: layer.animations
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map(cloneAnimationConfig),
  };
  pendingAnimationPaste = null;
  renderAll();
  showStatus(
    `已复制「${layer.name}」上的 ${layer.animations.length} 个动画模块。请选择目标图层后点击粘贴。`,
    "success",
  );
}

function copySingleAnimation(layerId: string, animationId: string): void {
  const layer = findLayer(layerId);
  const animation = layer?.animations.find((item) => item.id === animationId);
  if (!layer || !animation) return;

  animationClipboard = {
    kind: "single",
    sourceLayerName: layer.name,
    animation: cloneAnimationConfig(animation),
  };
  pendingAnimationPaste = null;
  renderAll();
  showStatus(
    `已复制「${layer.name}」的 ${getAnimationDisplayName(animation)} 动画模块。请选择目标图层后点击粘贴。`,
    "success",
  );
}

function requestPasteAnimationsToSelectedLayer(
  source: "layer-toolbar" | "animation-toolbar",
): void {
  const layer = getSelectedLayer(state);
  if (!layer) {
    showStatus("请先选择一个目标图层再粘贴动画。", "error");
    return;
  }
  requestPasteAnimationsToLayer(layer.id, source);
}

function requestPasteAnimationsToLayer(
  targetLayerId: string,
  source: "layer-toolbar" | "animation-toolbar",
): void {
  const targetLayer = findLayer(targetLayerId);
  if (!targetLayer) return;
  if (!animationClipboard) {
    showStatus("还没有复制过动画。请先复制整层动画或单个动画模块。", "error");
    return;
  }
  if (source === "animation-toolbar" && animationClipboard.kind !== "single") {
    showStatus(
      "顶部粘贴动画只用于单个动画模块。请先复制某一个动画模块。",
      "error",
    );
    return;
  }

  pendingAnimationPaste = { targetLayerId, source };
  renderAll();
  showStatus(
    `确认要把${getAnimationClipboardDescription()}粘贴到「${targetLayer.name}」吗？请点击确认。`,
    "info",
  );
}

function confirmPendingAnimationPaste(): void {
  if (!pendingAnimationPaste) {
    showStatus("没有待确认的动画粘贴操作。", "info");
    return;
  }
  if (!animationClipboard) {
    pendingAnimationPaste = null;
    renderAll();
    showStatus("动画剪贴板为空，无法粘贴。", "error");
    return;
  }
  const targetLayer = findLayer(pendingAnimationPaste.targetLayerId);
  if (!targetLayer) {
    pendingAnimationPaste = null;
    renderAll();
    showStatus("目标图层不存在，已取消粘贴。", "error");
    return;
  }

  const pastedAnimations = createPastedAnimationsFromClipboard();
  if (pastedAnimations.length === 0) {
    pendingAnimationPaste = null;
    renderAll();
    showStatus("没有可粘贴的动画模块。", "error");
    return;
  }

  pushUndoSnapshot();
  targetLayer.animations.push(...pastedAnimations);
  targetLayer.animations.sort((a, b) => a.startTime - b.startTime);
  state.selectedLayerId = targetLayer.id;
  selectedAnimationId = pastedAnimations[0]?.id ?? null;
  expandedTimelineLayerIds.add(targetLayer.id);
  for (const animation of pastedAnimations) {
    collapsedAnimationIds.delete(animation.id);
  }
  pendingAnimationPaste = null;
  normalizeProjectDurationToAnimationEnd({ silent: true });
  clearPreviewBaseCache();
  setPlayheadSeconds(pastedAnimations[0]?.startTime ?? state.playheadSeconds);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    `已粘贴 ${pastedAnimations.length} 个动画模块到「${targetLayer.name}」。`,
    "success",
  );
}

function cancelPendingAnimationPaste(): void {
  if (!pendingAnimationPaste) return;
  pendingAnimationPaste = null;
  renderAll();
  showStatus("已取消粘贴动画。", "info");
}

function isPendingAnimationPasteFor(
  targetLayerId: string,
  source: "layer-toolbar" | "animation-toolbar",
): boolean {
  return (
    pendingAnimationPaste?.targetLayerId === targetLayerId &&
    pendingAnimationPaste.source === source
  );
}

function getAnimationClipboardDescription(): string {
  if (!animationClipboard) return "剪贴板中的动画";
  if (animationClipboard.kind === "layer") {
    return `「${animationClipboard.sourceLayerName}」的 ${animationClipboard.animations.length} 个动画模块`;
  }
  return `「${animationClipboard.sourceLayerName}」的 ${getAnimationDisplayName(animationClipboard.animation)} 动画模块`;
}

function createPastedAnimationsFromClipboard(): V5GAnimationConfig[] {
  if (!animationClipboard) return [];
  if (animationClipboard.kind === "layer") {
    return animationClipboard.animations.map(createPastedAnimationConfig);
  }
  return [createPastedAnimationConfig(animationClipboard.animation)];
}

function createPastedAnimationConfig(
  animation: V5GAnimationConfig,
): V5GAnimationConfig {
  return {
    ...cloneAnimationConfig(animation),
    id: createId("anim_module"),
  };
}

function cloneAnimationConfig(
  animation: V5GAnimationConfig,
): V5GAnimationConfig {
  return {
    ...animation,
    params: { ...animation.params },
  };
}

function updateSelectedLayerFromProperties(): void {
  const layer = getSelectedLayer(state);
  if (!layer) return;

  layer.name = els.propName.value.trim() || layer.name;
  if (layer.type === "text") layer.text = layer.name;
  layer.transform.x = roundTo(readNumberInput(els.propX, layer.transform.x), 1);
  layer.transform.y = roundTo(readNumberInput(els.propY, layer.transform.y), 1);
  layer.transform.scaleX = roundTo(
    readNumberInput(els.propScaleX, layer.transform.scaleX),
    3,
  );
  layer.transform.scaleY = roundTo(
    readNumberInput(els.propScaleY, layer.transform.scaleY),
    3,
  );
  layer.transform.rotation = roundTo(
    readNumberInput(els.propRotation, layer.transform.rotation),
    2,
  );
  layer.opacity = clampNumber(
    readNumberInput(els.propOpacity, layer.opacity),
    0,
    1,
  );
  layer.blendMode = normalizeBlendMode(els.propBlendMode.value);
  normalizeProjectMasks(state.project);
  clearLayerPreview(layer.id);
  renderStaticUi();
  void pixiStage.render(state);
  scheduleAutoSave();
}

function flipSelectedLayer(axis: "x" | "y"): void {
  const layer = getSelectedLayer(state);
  if (!layer) {
    showStatus("请先选择一个图层再翻转。", "error");
    return;
  }

  pushUndoSnapshot();
  if (axis === "x") {
    const magnitude = Math.abs(layer.transform.scaleX) || 1;
    layer.transform.scaleX = roundTo(
      layer.transform.scaleX < 0 ? magnitude : -magnitude,
      3,
    );
  } else {
    const magnitude = Math.abs(layer.transform.scaleY) || 1;
    layer.transform.scaleY = roundTo(
      layer.transform.scaleY < 0 ? magnitude : -magnitude,
      3,
    );
  }
  clearLayerPreview(layer.id);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    axis === "x"
      ? "已左右翻转：整段动画会沿用新的基础翻转方向。"
      : "已上下翻转：整段动画会沿用新的基础翻转方向。",
    "success",
  );
}

function createAnimationFromDraft(layerId: string, module: HTMLElement): void {
  const layer = findLayer(layerId);

  if (!layer) {
    showStatus("目标图层不存在，无法创建动画模块。", "error");

    return;
  }

  const typeSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-type]",
  );

  const easingSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-easing]",
  );

  const startInput = module.querySelector<HTMLInputElement>(
    "[data-animation-start]",
  );

  const durationInput = module.querySelector<HTMLInputElement>(
    "[data-animation-duration]",
  );

  const paramContainer = module.querySelector<HTMLElement>(
    "[data-animation-param-fields]",
  );

  if (
    !typeSelect ||
    !easingSelect ||
    !startInput ||
    !durationInput ||
    !paramContainer ||
    !isV5GAnimationType(typeSelect.value)
  ) {
    showStatus("请先在空模块内选择有效的动画或粒子类型。", "error");

    return;
  }

  const animationType = typeSelect.value;

  const preset = getAnimationPreset(animationType);

  const startTime = startInput.value.trim()
    ? readAnimationStart(startInput, state.playheadSeconds)
    : snapTimelineSeconds(state.playheadSeconds);

  const duration = durationInput.value.trim()
    ? readAnimationDuration(durationInput, preset?.defaultDuration ?? 1)
    : snapTimelineSeconds(preset?.defaultDuration ?? 1);

  const params = readAnimationParamsFromContainer(
    animationType,

    paramContainer,
  );

  params.easing = easingSelect.value || preset?.defaultEasing || "linear";

  const draftMemoryKey = module.dataset.animationMemoryKey;

  rememberAnimationTypeDraft(draftMemoryKey, animationType, module);

  const nextAnimation: V5GAnimationConfig = {
    id: createId("anim_module"),

    type: animationType,

    name: getAnimationTypeDisplayName(animationType),

    startTime,

    duration,

    enabled: true,

    seed: Date.now() % 100000,

    params,
  };

  if (draftMemoryKey) {
    const savedDrafts = animationTypeDrafts.get(draftMemoryKey);

    if (savedDrafts) {
      animationTypeDrafts.set(
        getAnimationModuleMemoryKey(layer.id, nextAnimation.id),

        savedDrafts,
      );
    }

    animationTypeDrafts.delete(draftMemoryKey);
  }

  pushUndoSnapshot();

  pendingAnimationDraft = null;

  selectedAnimationId = nextAnimation.id;

  expandedTimelineLayerIds.add(layer.id);

  layer.animations.push(nextAnimation);

  layer.animations.sort((a, b) => a.startTime - b.startTime);

  collapsedAnimationIds.delete(nextAnimation.id);

  normalizeProjectDurationToAnimationEnd({ silent: true });

  clearLayerPreview(layer.id);

  renderAll();

  scrollSelectedAnimationModuleIntoView();

  scheduleAutoSave(0);

  showStatus(
    `已为「${layer.name}」创建${getAnimationCategoryLabel(getAnimationCategory(animationType))}模块：${nextAnimation.name}。`,

    "success",
  );
}

function getAnimationDisplayName(animation: V5GAnimationConfig): string {
  return (
    animation.name ||
    getAnimationPreset(animation.type)?.label ||
    animation.type
  );
}

function getAnimationTypeDisplayName(type: V5GAnimationType): string {
  return getAnimationPreset(type)?.label ?? type;
}

function readAnimationStart(input: HTMLInputElement, fallback: number): number {
  return roundTo(
    clampNumber(
      readNumberInput(input, fallback),
      0,
      state.project.stage.duration,
    ),
    2,
  );
}

function readAnimationDuration(
  input: HTMLInputElement,
  fallback: number,
): number {
  return roundTo(
    clampNumber(
      readNumberInput(input, fallback),
      TIMELINE_MINOR_TICK_SECONDS,
      state.project.stage.duration,
    ),
    2,
  );
}

function readAnimationParamsFromContainer(
  type: V5GAnimationType,

  container: HTMLElement,
): Record<string, V5GAnimationParamValue> {
  const preset = getAnimationPreset(type);

  const params: Record<string, V5GAnimationParamValue> = {};

  if (!preset) return params;

  for (const param of preset.params) {
    const input = container.querySelector<HTMLInputElement>(
      `[data-anim-param="${param.key}"]`,
    );

    if (!input) {
      params[param.key] = param.defaultValue;

      continue;
    }

    if (param.inputType === "checkbox") {
      params[param.key] = input.checked;

      continue;
    }

    const fallback =
      typeof param.defaultValue === "number" ? param.defaultValue : 0;

    const value = clampNumber(
      readNumberInput(input, fallback),

      param.min ?? Number.NEGATIVE_INFINITY,

      param.max ?? Number.POSITIVE_INFINITY,
    );

    params[param.key] = roundTo(value, 4);
  }

  if (type === "move") {
    params.baseX = 0;

    params.baseY = 0;
  }

  return params;
}

function getAnimationModuleMemoryKey(
  layerId: string,

  animationId: string,
): string {
  return `${layerId}:${animationId}`;
}

function getAnimationTypeDraftMap(
  memoryKey: string,
): Map<V5GAnimationType, V5GAnimationTypeDraft> {
  let drafts = animationTypeDrafts.get(memoryKey);

  if (!drafts) {
    drafts = new Map<V5GAnimationType, V5GAnimationTypeDraft>();

    animationTypeDrafts.set(memoryKey, drafts);
  }

  return drafts;
}

function getModuleCurrentAnimationType(
  module: HTMLElement,
): V5GAnimationType | null {
  const currentType = module.dataset.currentAnimationType;

  return currentType && isV5GAnimationType(currentType) ? currentType : null;
}

function rememberAnimationTypeDraft(
  memoryKey: string | undefined,

  type: V5GAnimationType,

  module: HTMLElement,
): void {
  if (!memoryKey) return;

  const startInput = module.querySelector<HTMLInputElement>(
    "[data-animation-start]",
  );

  const durationInput = module.querySelector<HTMLInputElement>(
    "[data-animation-duration]",
  );

  const easingSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-easing]",
  );

  const paramContainer = module.querySelector<HTMLElement>(
    "[data-animation-param-fields]",
  );

  if (!startInput || !durationInput || !easingSelect || !paramContainer) {
    return;
  }

  const preset = getAnimationPreset(type);

  getAnimationTypeDraftMap(memoryKey).set(type, {
    startTime: startInput.value.trim()
      ? readAnimationStart(startInput, state.playheadSeconds)
      : snapTimelineSeconds(state.playheadSeconds),

    duration: durationInput.value.trim()
      ? readAnimationDuration(durationInput, preset?.defaultDuration ?? 1)
      : snapTimelineSeconds(preset?.defaultDuration ?? 1),

    easing: easingSelect.value || preset?.defaultEasing || "linear",

    params: readAnimationParamsFromContainer(type, paramContainer),
  });
}

function rememberCurrentAnimationTypeDraft(
  memoryKey: string | undefined,

  module: HTMLElement,
): void {
  const currentType = getModuleCurrentAnimationType(module);

  if (!currentType) return;

  rememberAnimationTypeDraft(memoryKey, currentType, module);
}

function buildDraftAnimationConfig(
  type: V5GAnimationType,

  draft: V5GAnimationTypeDraft,
): V5GAnimationConfig {
  return {
    id: "draft_memory",

    type,

    name: getAnimationTypeDisplayName(type),

    startTime: draft.startTime,

    duration: draft.duration,

    enabled: true,

    seed: 0,

    params: { ...draft.params },
  };
}

function rememberCommittedAnimationTypeDraft(
  memoryKey: string,

  animation: V5GAnimationConfig,
): void {
  getAnimationTypeDraftMap(memoryKey).set(animation.type, {
    startTime: animation.startTime,

    duration: animation.duration,

    easing: String(animation.params.easing ?? "linear"),

    params: { ...animation.params },
  });
}

function restoreAnimationTypeDraft(
  memoryKey: string | undefined,

  layer: V5GLayerConfig,

  type: V5GAnimationType,

  module: HTMLElement,

  options: { updatePresetInfo?: HTMLElement | null } = {},
): void {
  const easingSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-easing]",
  );

  const startInput = module.querySelector<HTMLInputElement>(
    "[data-animation-start]",
  );

  const durationInput = module.querySelector<HTMLInputElement>(
    "[data-animation-duration]",
  );

  const paramContainer = module.querySelector<HTMLElement>(
    "[data-animation-param-fields]",
  );

  if (!easingSelect || !startInput || !durationInput || !paramContainer) {
    return;
  }

  const draft = memoryKey
    ? animationTypeDrafts.get(memoryKey)?.get(type)
    : null;

  const preset = getAnimationPreset(type);

  easingSelect.disabled = false;

  populateEasingSelect(
    easingSelect,

    draft?.easing ?? preset?.defaultEasing ?? "linear",
  );

  if (draft) {
    startInput.value = String(draft.startTime);

    durationInput.value = String(draft.duration);
  }

  appendAnimationParamFields(
    paramContainer,

    layer,

    type,

    draft ? buildDraftAnimationConfig(type, draft) : undefined,
  );

  if (options.updatePresetInfo) {
    options.updatePresetInfo.textContent =
      `${preset?.description ?? ""} ${preset?.recommendedDuration ?? ""}`.trim();
  }

  module.dataset.currentAnimationType = type;
}

function applyProjectDurationFromInput(
  options: { silentIfUnchanged?: boolean } = {},
): void {
  const previousDuration = state.project.stage.duration;
  const requestedDuration = roundTo(
    clampNumber(
      readNumberInput(els.durationSeconds, previousDuration),
      MIN_PROJECT_DURATION_SECONDS,
      MAX_PROJECT_DURATION_SECONDS,
    ),
    TIMELINE_TIME_DECIMALS,
  );
  const longestAnimationEnd = getLongestAnimationEndTime();
  const nextDuration = roundTo(
    clampNumber(
      Math.max(
        requestedDuration,
        longestAnimationEnd,
        MIN_PROJECT_DURATION_SECONDS,
      ),
      MIN_PROJECT_DURATION_SECONDS,
      MAX_PROJECT_DURATION_SECONDS,
    ),
    TIMELINE_TIME_DECIMALS,
  );
  els.durationSeconds.value = formatTimelineSeconds(nextDuration);
  if (nextDuration === previousDuration) {
    if (!options.silentIfUnchanged) {
      showStatus(
        `总时长仍为 ${formatTimelineSeconds(nextDuration)}s。`,
        "info",
      );
    }
    return;
  }

  pushUndoSnapshot();
  state.project.stage.duration = nextDuration;
  state.playheadSeconds = clampNumber(state.playheadSeconds, 0, nextDuration);
  clampTimelineScrollLeft();
  renderAll();
  scheduleAutoSave(0);
  if (nextDuration > requestedDuration) {
    showStatus(
      `总时长已自动扩展到 ${formatTimelineSeconds(nextDuration)}s，以容纳现有动画。`,
      "success",
    );
  } else {
    showStatus(
      `总时长已更新为 ${formatTimelineSeconds(nextDuration)}s。`,
      "success",
    );
  }
}

function normalizeProjectDurationToAnimationEnd(
  options: { silent?: boolean } = {},
): number {
  const longestAnimationEnd = getLongestAnimationEndTime();
  const nextDuration = roundTo(
    clampNumber(
      Math.max(
        state.project.stage.duration,
        longestAnimationEnd,
        MIN_PROJECT_DURATION_SECONDS,
      ),
      MIN_PROJECT_DURATION_SECONDS,
      MAX_PROJECT_DURATION_SECONDS,
    ),
    TIMELINE_TIME_DECIMALS,
  );
  if (nextDuration !== state.project.stage.duration) {
    state.project.stage.duration = nextDuration;
    if (state.playheadSeconds > nextDuration)
      state.playheadSeconds = nextDuration;
    if (!options.silent) {
      showStatus(
        `总时长已自动扩展到 ${formatTimelineSeconds(nextDuration)}s，以容纳现有动画。`,
        "success",
      );
    }
    scheduleAutoSave();
  }
  return state.project.stage.duration;
}

function getLongestAnimationEndTime(): number {
  let longest = MIN_PROJECT_DURATION_SECONDS;
  for (const layer of state.project.layers) {
    for (const animation of layer.animations) {
      longest = Math.max(longest, animation.startTime + animation.duration);
    }
  }
  return ceilToTimelineStep(longest);
}

function ceilToTimelineStep(seconds: number): number {
  return roundTo(
    Math.ceil((seconds - Number.EPSILON) / TIMELINE_MINOR_TICK_SECONDS) *
      TIMELINE_MINOR_TICK_SECONDS,
    TIMELINE_TIME_DECIMALS,
  );
}

function handleTimelineWheel(event: WheelEvent): void {
  event.preventDefault();
  const viewportRect = getTimelineViewportRect(event);
  const mouseX = clampNumber(
    event.clientX - viewportRect.left,
    0,
    viewportRect.width,
  );
  const timeAtMouse = timelineXToTime(timelineScrollLeft + mouseX);
  const zoomFactor =
    event.deltaY < 0 ? TIMELINE_ZOOM_STEP : 1 / TIMELINE_ZOOM_STEP;
  timelinePixelsPerSecond = roundTo(
    clampNumber(
      timelinePixelsPerSecond * zoomFactor,
      MIN_TIMELINE_PX_PER_SECOND,
      MAX_TIMELINE_PX_PER_SECOND,
    ),
    3,
  );
  timelineScrollLeft = timeToTimelineX(timeAtMouse) - mouseX;
  clampTimelineScrollLeft();
  renderTimelineAnimations();
  showStatus(
    `时间轴缩放：${Math.round((timelinePixelsPerSecond / DEFAULT_TIMELINE_PX_PER_SECOND) * 100)}%。`,
    "info",
  );
}

function handleTimelineTrackWheel(): void {
  // 下方动画图层区的滚轮只交给浏览器原生纵向滚动处理；
  // 没有纵向滚动条时不缩放、不拦截，避免和上方时间尺缩放混在一起。
  if (els.timelineTrack.scrollHeight <= els.timelineTrack.clientHeight + 1)
    return;
}

function startTimelinePointerInteraction(event: PointerEvent): void {
  if (event.button !== 0) return;
  if (isTimelineControlTarget(event.target)) return;
  if (isTimelineVerticalScrollbarTarget(event)) return;
  event.preventDefault();
  els.timelineTrack.setPointerCapture(event.pointerId);
  timelineDragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: timelineScrollLeft,
    hasPanned: false,
  };
  const layerId = getTimelineLayerIdFromPointerEvent(event);
  if (layerId) state.selectedLayerId = layerId;
  stopPlayback({ silent: true, keepPlayhead: true });
}

function startTimelineAnimationDrag(
  event: PointerEvent,
  layerId: string,
  animationId: string,
  mode: "move" | "resize-duration",
): void {
  if (event.button !== 0) return;
  const layer = findLayer(layerId);
  const animation = layer?.animations.find((item) => item.id === animationId);
  if (!layer || !animation) return;
  event.preventDefault();
  event.stopPropagation();
  els.timelineTrack.setPointerCapture(event.pointerId);
  timelineAnimationDragState = {
    pointerId: event.pointerId,
    layerId,
    animationId,
    mode,
    startClientX: event.clientX,
    originalStartTime: animation.startTime,
    originalDuration: animation.duration,
    hasChanged: false,
  };
  state.selectedLayerId = layerId;
  selectedAnimationId = animationId;
  expandedTimelineLayerIds.add(layerId);
  collapsedAnimationIds.delete(animationId);
  stopPlayback({ silent: true, keepPlayhead: true });
  scrollSelectedAnimationModuleIntoView();
  showStatus(
    mode === "move"
      ? "拖动动画块：开始秒按 0.05s 吸附。"
      : "拖动右侧把手：持续秒按 0.05s 吸附。",
    "info",
  );
}

function updateTimelineAnimationDrag(event: PointerEvent): void {
  if (
    !timelineAnimationDragState ||
    timelineAnimationDragState.pointerId !== event.pointerId
  ) {
    return;
  }
  event.preventDefault();
  const layer = findLayer(timelineAnimationDragState.layerId);
  const animation = layer?.animations.find(
    (item) => item.id === timelineAnimationDragState?.animationId,
  );
  if (!layer || !animation) return;

  const deltaSeconds = snapTimelineSeconds(
    (event.clientX - timelineAnimationDragState.startClientX) /
      timelinePixelsPerSecond,
  );
  if (timelineAnimationDragState.mode === "move") {
    const nextStart = snapTimelineSeconds(
      clampNumber(
        timelineAnimationDragState.originalStartTime + deltaSeconds,
        0,
        Math.max(0, state.project.stage.duration - animation.duration),
      ),
    );
    if (nextStart !== animation.startTime) {
      animation.startTime = nextStart;
      timelineAnimationDragState.hasChanged = true;
    }
  } else {
    const nextDuration = snapTimelineSeconds(
      clampNumber(
        timelineAnimationDragState.originalDuration + deltaSeconds,
        TIMELINE_MINOR_TICK_SECONDS,
        Math.max(
          TIMELINE_MINOR_TICK_SECONDS,
          state.project.stage.duration - animation.startTime,
        ),
      ),
    );
    if (nextDuration !== animation.duration) {
      animation.duration = nextDuration;
      timelineAnimationDragState.hasChanged = true;
    }
  }

  if (!timelineAnimationDragState.hasChanged) return;
  layer.animations.sort((a, b) => a.startTime - b.startTime);
  setPlayheadSeconds(animation.startTime);
  renderTimelineAnimations();
  showStatus(
    `动画时间已吸附到 ${formatTimelineSeconds(animation.startTime)}s，持续 ${formatTimelineSeconds(animation.duration)}s。`,
    "info",
  );
}

function finishTimelineAnimationDrag(event: PointerEvent): void {
  if (
    !timelineAnimationDragState ||
    timelineAnimationDragState.pointerId !== event.pointerId
  ) {
    return;
  }
  const changed = timelineAnimationDragState.hasChanged;
  const layerId = timelineAnimationDragState.layerId;
  timelineAnimationDragState = null;
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
  if (!changed) return;
  normalizeProjectDurationToAnimationEnd({ silent: true });
  clearLayerPreview(layerId);
  renderAll();
  scheduleAutoSave(0);
  showStatus("动画时间已更新并按 0.05s 对齐。", "success");
}

function cancelTimelineAnimationDrag(event: PointerEvent): void {
  if (timelineAnimationDragState?.pointerId === event.pointerId) {
    timelineAnimationDragState = null;
  }
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
}

function startTimelinePlayheadDrag(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  els.timelineTrack.setPointerCapture(event.pointerId);
  timelinePlayheadDragState = { pointerId: event.pointerId };
  stopPlayback({ silent: true, keepPlayhead: true });
  scrubTimelineFromPointer(event);
}

function updateTimelinePlayheadDrag(event: PointerEvent): void {
  if (
    !timelinePlayheadDragState ||
    timelinePlayheadDragState.pointerId !== event.pointerId
  ) {
    return;
  }
  event.preventDefault();
  scrubTimelineFromPointer(event);
}

function finishTimelinePlayheadDrag(event: PointerEvent): void {
  if (
    !timelinePlayheadDragState ||
    timelinePlayheadDragState.pointerId !== event.pointerId
  ) {
    return;
  }
  timelinePlayheadDragState = null;
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
}

function cancelTimelinePlayheadDrag(event: PointerEvent): void {
  if (timelinePlayheadDragState?.pointerId === event.pointerId) {
    timelinePlayheadDragState = null;
  }
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
}

function updateTimelinePointerInteraction(event: PointerEvent): void {
  if (!timelineDragState || timelineDragState.pointerId !== event.pointerId) {
    return;
  }
  const deltaX = event.clientX - timelineDragState.startX;
  if (Math.abs(deltaX) >= TIMELINE_PAN_THRESHOLD_PX) {
    timelineDragState.hasPanned = true;
  }
  if (!timelineDragState.hasPanned) return;
  event.preventDefault();
  timelineScrollLeft = timelineDragState.startScrollLeft - deltaX;
  clampTimelineScrollLeft();
  renderTimelineAnimations();
}

function finishTimelinePointerInteraction(event: PointerEvent): void {
  if (!timelineDragState || timelineDragState.pointerId !== event.pointerId) {
    return;
  }
  const shouldSeek = !timelineDragState.hasPanned;
  timelineDragState = null;
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
  if (!shouldSeek) return;
  const layerId = getTimelineLayerIdFromPointerEvent(event);
  if (layerId) state.selectedLayerId = layerId;
  seekTimelineFromPointer(event);
}

function cancelTimelinePointerInteraction(event: PointerEvent): void {
  if (timelineDragState?.pointerId === event.pointerId) {
    timelineDragState = null;
  }
  if (els.timelineTrack.hasPointerCapture(event.pointerId)) {
    els.timelineTrack.releasePointerCapture(event.pointerId);
  }
}

function seekTimelineFromPointer(event: PointerEvent): void {
  const rect = getTimelineViewportRect(event);
  const x =
    timelineScrollLeft + clampNumber(event.clientX - rect.left, 0, rect.width);
  setPlayheadSeconds(timelineXToTime(x));
  showStatus(`时间轴预览：${state.playheadSeconds.toFixed(2)}s`, "info");
}

function scrubTimelineFromPointer(event: PointerEvent): void {
  const rect = getTimelineViewportRect(event);
  const x =
    timelineScrollLeft + clampNumber(event.clientX - rect.left, 0, rect.width);
  setPlayheadSeconds(timelineXToTime(x));
}

function getTimelineViewportRect(event?: PointerEvent | WheelEvent): DOMRect {
  if (event) {
    const target = event.target as HTMLElement | null;
    const viewport = target?.closest<HTMLElement>("[data-timeline-viewport]");
    if (viewport) return viewport.getBoundingClientRect();
  }
  const lanes = Array.from(
    els.timelineItems.querySelectorAll<HTMLElement>("[data-timeline-lane]"),
  );
  return (lanes[0] ?? els.timelineRulerTrack).getBoundingClientRect();
}

function getTimelineViewportWidth(): number {
  return Math.max(1, getTimelineViewportRect().width);
}

function getTimelineContentWidth(
  viewportWidth = getTimelineViewportWidth(),
): number {
  return Math.max(
    viewportWidth,
    state.project.stage.duration * timelinePixelsPerSecond,
  );
}

function clampTimelineScrollLeft(
  viewportWidth = getTimelineViewportWidth(),
  contentWidth = getTimelineContentWidth(viewportWidth),
): void {
  timelineScrollLeft = clampNumber(
    timelineScrollLeft,
    0,
    Math.max(0, contentWidth - viewportWidth),
  );
}

function timeToTimelineX(seconds: number): number {
  return roundTo(seconds * timelinePixelsPerSecond, 3);
}

function timelineXToTime(x: number): number {
  return snapTimelineSeconds(
    clampNumber(x / timelinePixelsPerSecond, 0, state.project.stage.duration),
  );
}

function snapTimelineSeconds(seconds: number): number {
  return roundTo(
    Math.round(seconds / TIMELINE_MINOR_TICK_SECONDS) *
      TIMELINE_MINOR_TICK_SECONDS,
    TIMELINE_TIME_DECIMALS,
  );
}

function formatTimelineSeconds(seconds: number): string {
  const snapped = snapTimelineSeconds(seconds);
  return snapped.toFixed(snapped % 1 === 0 ? 1 : TIMELINE_TIME_DECIMALS);
}

function isTimelineControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest("input, textarea, select, button") !== null;
}

function isTimelineVerticalScrollbarTarget(event: PointerEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target !== els.timelineTrack && !target?.closest("#timeline-track")) {
    return false;
  }
  if (els.timelineTrack.scrollHeight <= els.timelineTrack.clientHeight + 1) {
    return false;
  }
  const rect = els.timelineTrack.getBoundingClientRect();
  const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom;
  const inScrollbarHitArea =
    event.clientX >= rect.right - TIMELINE_SCROLLBAR_HIT_AREA_PX &&
    event.clientX <= rect.right;
  return insideY && inScrollbarHitArea;
}

function setPlayheadSeconds(seconds: number): void {
  state.playheadSeconds = roundTo(
    clampNumber(seconds, 0, state.project.stage.duration),
    3,
  );
  applyAnimatedLayersAtTime(state.playheadSeconds);
  renderStaticUi();
  renderProperties();
  void pixiStage.render(state);
}

function syncAnimationPanel(layer: V5GLayerConfig): void {
  if (pendingAnimationDraft && pendingAnimationDraft.layerId !== layer.id) {
    animationTypeDrafts.delete(pendingAnimationDraft.memoryKey);

    pendingAnimationDraft = null;
  }

  els.animCountLabel.textContent = String(layer.animations.length);

  syncAnimationToolbarButtons(layer);

  renderAnimationList(layer);
}

function syncAnimationToolbarButtons(layer: V5GLayerConfig): void {
  const hasSingleAnimationClipboard = animationClipboard?.kind === "single";

  const showingConfirm = isPendingAnimationPasteFor(
    layer.id,

    "animation-toolbar",
  );

  els.animToolbar.classList.remove("grid-cols-1");

  els.animToolbar.classList.add("grid-cols-2");

  els.btnAnimCategoryAnimation.classList.toggle("hidden", showingConfirm);

  els.btnAnimCategoryParticle.classList.toggle("hidden", showingConfirm);

  els.btnPasteCopiedAnim.classList.toggle(
    "hidden",

    !hasSingleAnimationClipboard || showingConfirm,
  );

  els.btnConfirmPasteCopiedAnim.classList.toggle("hidden", !showingConfirm);

  els.btnCancelPasteCopiedAnim.classList.toggle("hidden", !showingConfirm);
}

function showAnimationDraftModule(category: V5GAnimationCategory): void {
  const layer = getSelectedLayer(state);

  if (!layer) {
    showStatus("请先选择一个图层再添加动画或粒子。", "error");

    return;
  }

  pendingAnimationPaste = null;

  pendingAnimationDraft = {
    layerId: layer.id,

    category,

    memoryKey: createId("anim_draft"),
  };

  selectedAnimationId = null;

  renderAll();

  window.requestAnimationFrame(() => {
    els.animList

      .querySelector<HTMLElement>("[data-animation-draft]")

      ?.scrollIntoView({ block: "center", inline: "nearest" });
  });

  showStatus(
    category === "particle"
      ? "已创建空粒子模块，请在模块内选择粒子类型并填写参数。"
      : "已创建空动画模块，请在模块内选择动画类型并填写参数。",

    "info",
  );
}

function cancelAnimationDraftModule(): void {
  if (!pendingAnimationDraft) return;

  animationTypeDrafts.delete(pendingAnimationDraft.memoryKey);

  pendingAnimationDraft = null;

  renderAll();

  showStatus("已取消新建动画模块。", "info");
}

function appendAnimationDraftModule(layer: V5GLayerConfig): void {
  if (!pendingAnimationDraft || pendingAnimationDraft.layerId !== layer.id) {
    return;
  }

  const category = pendingAnimationDraft.category;

  const details = document.createElement("details");

  details.open = true;

  details.dataset.animationDraft = category;

  details.dataset.animationMemoryKey = pendingAnimationDraft.memoryKey;

  details.className =
    category === "particle"
      ? "rounded-lg border-2 border-sky-300 bg-zinc-700/60 p-2 text-slate-300 shadow-inner shadow-sky-300/20"
      : "rounded-lg border-2 border-amber-300 bg-zinc-700/60 p-2 text-slate-300 shadow-inner shadow-amber-300/20";

  details.innerHTML = `

    <summary class="flex cursor-pointer list-none items-center justify-between gap-2">

      <div class="min-w-0">

        <div class="flex min-w-0 items-center gap-1.5">

          <i class="fa-solid fa-chevron-right text-[9px] text-slate-500 transition details-open:rotate-90"></i>

          <span class="truncate text-[11px] font-semibold text-zinc-100">新建${getAnimationCategoryLabel(category)}模块</span>

          <span class="rounded bg-zinc-900 px-1 py-0.5 text-[9px] ${getAnimationCategoryLabelClass(category)}">未保存</span>

        </div>

        <div class="mt-0.5 text-[9px] text-zinc-500">先选择类型，再填写时间和参数。</div>

      </div>

      <button type="button" data-draft-action="cancel" class="rounded bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950" title="取消新建">

        <i class="fa-solid fa-xmark"></i>

      </button>

    </summary>

    <div class="mt-2 space-y-1.5 border-t border-white/10 pt-2">

      <label class="block text-[10px] ${getAnimationCategoryLabelClass(category)}" data-animation-type-label>${getAnimationCategoryLabel(category)}<select data-animation-type class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400"></select></label>

      <div data-animation-preset-info class="rounded bg-zinc-900/80 px-2 py-1 text-[10px] leading-4 text-zinc-500">请选择一个${getAnimationCategoryLabel(category)}类型。</div>

      <div class="grid grid-cols-2 gap-1.5">

        <label class="text-[10px] text-zinc-400">开始秒<input data-animation-start type="number" min="0" step="0.05" placeholder="${formatTimelineSeconds(state.playheadSeconds)}" class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400" /></label>

        <label class="text-[10px] text-zinc-400">持续秒<input data-animation-duration type="number" min="0.05" step="0.05" placeholder="默认" class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400" /></label>

      </div>

      <label class="block text-[10px] text-zinc-400">缓动<select data-animation-easing disabled class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400 disabled:opacity-50"></select></label>

      <div data-animation-param-fields class="grid grid-cols-2 gap-1.5"></div>

      <button type="button" data-draft-action="create" class="w-full rounded-md bg-zinc-100 px-2 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-white">

        <i class="fa-solid fa-check mr-1"></i>创建此${getAnimationCategoryLabel(category)}模块

      </button>

    </div>

  `;

  const typeSelect = details.querySelector<HTMLSelectElement>(
    "[data-animation-type]",
  );

  const easingSelect = details.querySelector<HTMLSelectElement>(
    "[data-animation-easing]",
  );

  const startInput = details.querySelector<HTMLInputElement>(
    "[data-animation-start]",
  );

  const durationInput = details.querySelector<HTMLInputElement>(
    "[data-animation-duration]",
  );

  const paramContainer = details.querySelector<HTMLElement>(
    "[data-animation-param-fields]",
  );

  const presetInfo = details.querySelector<HTMLElement>(
    "[data-animation-preset-info]",
  );

  if (!typeSelect || !easingSelect || !paramContainer) return;

  populateAnimationSelect(typeSelect, null, category, {
    includePlaceholder: true,
  });

  populateEasingSelect(easingSelect, "linear", { includePlaceholder: true });

  typeSelect.addEventListener("click", (event) => event.stopPropagation());

  typeSelect.addEventListener("change", () => {
    rememberCurrentAnimationTypeDraft(
      details.dataset.animationMemoryKey,

      details,
    );

    if (!isV5GAnimationType(typeSelect.value)) {
      easingSelect.disabled = true;

      populateEasingSelect(easingSelect, "linear", {
        includePlaceholder: true,
      });

      paramContainer.innerHTML = "";

      delete details.dataset.currentAnimationType;

      if (presetInfo) {
        presetInfo.textContent = `请选择一个${getAnimationCategoryLabel(category)}类型。`;
      }

      return;
    }

    restoreAnimationTypeDraft(
      details.dataset.animationMemoryKey,

      layer,

      typeSelect.value,

      details,

      { updatePresetInfo: presetInfo },
    );
  });

  easingSelect.addEventListener("click", (event) => event.stopPropagation());

  for (const input of [startInput, durationInput]) {
    input?.addEventListener("click", (event) => event.stopPropagation());

    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;

      event.preventDefault();

      createAnimationFromDraft(layer.id, details);
    });
  }

  for (const button of details.querySelectorAll<HTMLButtonElement>(
    "[data-draft-action]",
  )) {
    button.addEventListener("click", (event) => {
      event.preventDefault();

      event.stopPropagation();

      if (button.dataset.draftAction === "cancel") {
        cancelAnimationDraftModule();
      } else {
        createAnimationFromDraft(layer.id, details);
      }
    });
  }

  els.animList.appendChild(details);
}

function appendAnimationParamFields(
  container: HTMLElement,
  layer: V5GLayerConfig,
  type: V5GAnimationType,
  animation: V5GAnimationConfig | undefined,
): void {
  const preset = getAnimationPreset(type);
  if (!preset) return;
  container.innerHTML = "";
  const defaultParams = createDefaultAnimationParams(type, {
    transform: layer.transform,
    opacity: layer.opacity,
  });
  for (const param of preset.params) {
    const value =
      animation?.params[param.key] ??
      defaultParams[param.key] ??
      param.defaultValue;
    const label = document.createElement("label");
    label.className =
      param.inputType === "checkbox"
        ? "col-span-2 flex items-center justify-between gap-2 rounded border border-white/10 bg-[#050505] px-2 py-1.5 text-[10px] text-zinc-400"
        : "text-[10px] text-zinc-400";
    label.title = param.recommendedRange;
    if (param.inputType === "checkbox") {
      label.innerHTML = `<span>${escapeHtml(param.label)}</span>`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.animParam = param.key;
      input.checked = value === true;
      input.title = param.recommendedRange;
      input.className = "h-4 w-4 accent-zinc-100";
      label.appendChild(input);
    } else {
      label.innerHTML = `<span>${escapeHtml(param.label)}</span>`;
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.animParam = param.key;
      input.value = String(value);
      if (typeof param.min === "number") input.min = String(param.min);
      if (typeof param.max === "number") input.max = String(param.max);
      if (typeof param.step === "number") input.step = String(param.step);
      input.title = param.recommendedRange;
      input.className =
        "mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400";
      label.appendChild(input);
    }
    container.appendChild(label);
  }
}

function scrollSelectedAnimationModuleIntoView(): void {
  if (!selectedAnimationId) return;

  window.requestAnimationFrame(() => {
    const selectedModule = Array.from(
      els.animList.querySelectorAll<HTMLElement>("[data-animation-id]"),
    ).find((module) => module.dataset.animationId === selectedAnimationId);

    selectedModule?.scrollIntoView({
      block: "center",

      inline: "nearest",

      behavior: "smooth",
    });
  });
}

function getAnimationCategoryLabel(category: V5GAnimationCategory): string {
  return category === "particle" ? "粒子" : "动画";
}

function getAnimationCategoryLabelClass(
  category: V5GAnimationCategory,
): string {
  return category === "particle" ? "text-sky-300" : "text-amber-300";
}

function getAnimationCategoryButtonClass(
  buttonCategory: V5GAnimationCategory,

  activeCategory: V5GAnimationCategory,
): string {
  if (buttonCategory === activeCategory) {
    return buttonCategory === "particle"
      ? "rounded-md bg-sky-300 px-2 py-1 text-[10px] font-semibold text-sky-950 transition hover:bg-sky-200"
      : "rounded-md bg-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-950 transition hover:bg-amber-200";
  }

  return "rounded-md bg-zinc-950 px-2 py-1 text-[10px] font-semibold text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100";
}

function syncAnimationModuleCategoryUi(
  module: HTMLElement,

  category: V5GAnimationCategory,
): void {
  for (const button of module.querySelectorAll<HTMLButtonElement>(
    "[data-animation-category]",
  )) {
    const buttonCategory = button.dataset.animationCategory;

    if (buttonCategory !== "animation" && buttonCategory !== "particle") {
      continue;
    }

    button.className = getAnimationCategoryButtonClass(
      buttonCategory,

      category,
    );
  }

  const label = module.querySelector<HTMLElement>(
    "[data-animation-type-label]",
  );

  if (!label) return;

  label.className = `block text-[10px] ${getAnimationCategoryLabelClass(
    category,
  )}`;

  const select = label.querySelector("select");

  const firstNode = label.firstChild;

  if (firstNode) {
    firstNode.textContent = getAnimationCategoryLabel(category);
  } else {
    label.prepend(document.createTextNode(getAnimationCategoryLabel(category)));
  }

  if (select && select.parentElement !== label) label.appendChild(select);
}

function renderAnimationList(layer: V5GLayerConfig): void {
  const layerHasSelectedAnimation =
    selectedAnimationId !== null &&
    layer.animations.some((animation) => animation.id === selectedAnimationId);

  if (selectedAnimationId && !layerHasSelectedAnimation) {
    selectedAnimationId = null;
  }

  els.animList.innerHTML = "";

  appendAnimationDraftModule(layer);

  if (layer.animations.length === 0) {
    if (!pendingAnimationDraft || pendingAnimationDraft.layerId !== layer.id) {
      els.animList.insertAdjacentHTML(
        "beforeend",

        '<div class="rounded-lg bg-zinc-800/80 p-2 text-zinc-500">当前图层还没有动画。点击上方“添加动画”或“添加粒子”创建空模块。</div>',
      );
    }

    return;
  }

  const orderedAnimations = [...layer.animations].sort(
    (a, b) => a.startTime - b.startTime,
  );
  for (const animation of orderedAnimations) {
    const details = document.createElement("details");
    const selected = animation.id === selectedAnimationId;
    details.dataset.animationId = animation.id;

    details.dataset.animationMemoryKey = getAnimationModuleMemoryKey(
      layer.id,

      animation.id,
    );

    details.dataset.currentAnimationType = animation.type;

    rememberCommittedAnimationTypeDraft(
      details.dataset.animationMemoryKey,

      animation,
    );

    details.open = selected || !collapsedAnimationIds.has(animation.id);

    details.className = selected
      ? "rounded-lg border-2 border-amber-300 bg-zinc-700/60 p-2 text-slate-300 shadow-inner shadow-amber-300/20"
      : "rounded-lg border border-white/10 bg-zinc-700/60 p-2 text-slate-300 shadow-inner shadow-black/10";

    const animationCategory = getAnimationCategory(animation.type);

    const categoryLabel = getAnimationCategoryLabel(animationCategory);

    const categoryLabelClass =
      getAnimationCategoryLabelClass(animationCategory);

    details.innerHTML = `
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="flex min-w-0 items-center gap-1.5">
            <i class="fa-solid fa-chevron-right text-[9px] text-slate-500 transition details-open:rotate-90"></i>
            <span data-animation-title class="truncate text-[11px] font-semibold text-zinc-100">${escapeHtml(getAnimationDisplayName(animation))}</span>
            ${animation.enabled ? "" : '<span data-animation-disabled-badge class="rounded bg-zinc-700 px-1 py-0.5 text-[9px] text-zinc-400">停用</span>'}
          </div>
          <div class="mt-0.5 font-mono text-[9px] text-zinc-500">${animation.startTime.toFixed(2)}s 起 · ${animation.duration.toFixed(2)}s</div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <label class="flex h-6 items-center gap-1 rounded bg-zinc-900 px-1.5 text-[10px] text-zinc-400" title="启用 / 停用动画">
            <input type="checkbox" data-animation-enabled class="h-3.5 w-3.5 accent-zinc-100" ${animation.enabled ? "checked" : ""} />
            <span>启用</span>
          </label>
          <button type="button" data-animation-action="copy" class="rounded bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-950" title="复制这个动画模块；复制后可用上方“粘贴动画”粘贴到当前选中图层">
            <i class="fa-solid fa-copy"></i>
          </button>
          <button type="button" data-animation-action="delete" class="rounded bg-zinc-900 px-1.5 py-1 text-[10px] text-zinc-400 transition hover:bg-red-950/70 hover:text-red-200" title="删除动画模块">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </summary>
      <div class="mt-2 space-y-1.5 border-t border-white/10 pt-2">

        <div class="grid grid-cols-2 gap-1.5" data-animation-category-tabs>

          <button type="button" data-animation-category="animation" class="rounded-md px-2 py-1 text-[10px] font-semibold transition">动画</button>

          <button type="button" data-animation-category="particle" class="rounded-md px-2 py-1 text-[10px] font-semibold transition">粒子</button>

        </div>

        <label class="block text-[10px] ${categoryLabelClass}" data-animation-type-label>${categoryLabel}<select data-animation-type class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400"></select></label>

        <div class="grid grid-cols-2 gap-1.5">
          <label class="text-[10px] text-zinc-400">开始秒<input data-animation-start type="number" min="0" step="0.05" value="${formatTimelineSeconds(animation.startTime)}" class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400" /></label>
          <label class="text-[10px] text-zinc-400">持续秒<input data-animation-duration type="number" min="0.05" step="0.05" value="${formatTimelineSeconds(animation.duration)}" class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400" /></label>
        </div>
        <label class="block text-[10px] text-zinc-400">缓动<select data-animation-easing class="mt-1 h-7 w-full rounded-md border border-white/10 bg-[#050505] px-2 text-xs text-zinc-100 outline-none focus:border-zinc-400"></select></label>
        <div data-animation-param-fields class="grid grid-cols-2 gap-1.5"></div>
        ${isOffsetReversibleAnimation(animation.type) ? '<div class="grid grid-cols-2 gap-1.5"><button type="button" data-animation-action="reverse-offset-x" class="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 transition hover:border-amber-300/70 hover:bg-amber-300 hover:text-amber-950" title="把此位移动画的 X 偏移整体取反，例如 0→10 变成 0→-10"><i class="fa-solid fa-left-right mr-1"></i>反转 X</button><button type="button" data-animation-action="reverse-offset-y" class="rounded-md border border-white/10 bg-zinc-900 px-2 py-1.5 text-[10px] font-semibold text-zinc-300 transition hover:border-amber-300/70 hover:bg-amber-300 hover:text-amber-950" title="把此位移动画的 Y 偏移整体取反，例如 0→10 变成 0→-10"><i class="fa-solid fa-up-down mr-1"></i>反转 Y</button></div>' : ""}
      </div>
    `;

    details.addEventListener("toggle", () => {
      if (details.open) {
        collapsedAnimationIds.delete(animation.id);
      } else if (animation.id !== selectedAnimationId) {
        collapsedAnimationIds.add(animation.id);
      }
    });
    details.addEventListener("click", () => {
      selectedAnimationId = animation.id;
      expandedTimelineLayerIds.add(layer.id);
      collapsedAnimationIds.delete(animation.id);
      renderTimelineAnimations();
    });

    const typeSelect = details.querySelector<HTMLSelectElement>(
      "[data-animation-type]",
    );
    const easingSelect = details.querySelector<HTMLSelectElement>(
      "[data-animation-easing]",
    );
    const enabledInput = details.querySelector<HTMLInputElement>(
      "[data-animation-enabled]",
    );
    const title = details.querySelector<HTMLElement>("[data-animation-title]");
    const paramContainer = details.querySelector<HTMLElement>(
      "[data-animation-param-fields]",
    );

    if (typeSelect && easingSelect && paramContainer) {
      populateAnimationSelect(typeSelect, animation.type, animationCategory);

      populateEasingSelect(
        easingSelect,

        String(animation.params.easing ?? "linear"),
      );

      appendAnimationParamFields(
        paramContainer,

        layer,

        animation.type,

        animation,
      );

      updateAnimationModuleHeader(animation, title);

      syncAnimationModuleCategoryUi(details, animationCategory);

      typeSelect.addEventListener("click", (event) => event.stopPropagation());

      typeSelect.addEventListener("change", () => {
        if (!isV5GAnimationType(typeSelect.value)) return;

        rememberCurrentAnimationTypeDraft(
          details.dataset.animationMemoryKey,

          details,
        );

        restoreAnimationTypeDraft(
          details.dataset.animationMemoryKey,

          layer,

          typeSelect.value,

          details,
        );

        syncAnimationModuleCategoryUi(
          details,

          getAnimationCategory(typeSelect.value),
        );

        bindAnimationModuleAutoApply(details, layer.id, animation.id);

        updateAnimationFromModule(layer.id, animation.id, details);
      });

      easingSelect.addEventListener("click", (event) =>
        event.stopPropagation(),
      );

      easingSelect.addEventListener("change", () => {
        updateAnimationFromModule(layer.id, animation.id, details);
      });

      for (const categoryButton of details.querySelectorAll<HTMLButtonElement>(
        "[data-animation-category]",
      )) {
        categoryButton.addEventListener("click", (event) => {
          event.preventDefault();

          event.stopPropagation();

          const nextCategory = categoryButton.dataset.animationCategory;

          if (nextCategory !== "animation" && nextCategory !== "particle") {
            return;
          }

          const firstPreset = getAnimationPresetsByCategory(nextCategory)[0];

          if (!firstPreset) return;

          rememberCurrentAnimationTypeDraft(
            details.dataset.animationMemoryKey,

            details,
          );

          populateAnimationSelect(typeSelect, firstPreset.type, nextCategory);

          restoreAnimationTypeDraft(
            details.dataset.animationMemoryKey,

            layer,

            firstPreset.type,

            details,
          );

          syncAnimationModuleCategoryUi(details, nextCategory);

          bindAnimationModuleAutoApply(details, layer.id, animation.id);

          updateAnimationFromModule(layer.id, animation.id, details);
        });
      }

      bindAnimationModuleAutoApply(details, layer.id, animation.id);
    }

    enabledInput?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    enabledInput?.addEventListener("change", () => {
      updateAnimationEnabledFromHeader(
        layer.id,
        animation.id,
        enabledInput.checked,
      );
    });

    for (const actionButton of details.querySelectorAll<HTMLButtonElement>(
      "[data-animation-action]",
    )) {
      actionButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = actionButton.dataset.animationAction;
        if (action === "delete") {
          deleteAnimationFromLayer(layer.id, animation.id);
        } else if (action === "copy") {
          copySingleAnimation(layer.id, animation.id);
        } else if (action === "reverse-offset-x") {
          reverseOffsetAnimationAxis(layer.id, animation.id, "x");
        } else if (action === "reverse-offset-y") {
          reverseOffsetAnimationAxis(layer.id, animation.id, "y");
        }
      });
    }

    els.animList.appendChild(details);
  }
}

function bindAnimationModuleAutoApply(
  module: HTMLElement,

  layerId: string,

  animationId: string,
): void {
  const applyFromModule = () => {
    updateAnimationFromModule(layerId, animationId, module, {
      silentIfUnchanged: true,
    });
  };

  for (const input of module.querySelectorAll<HTMLInputElement>(
    "[data-animation-start], [data-animation-duration], [data-anim-param]",
  )) {
    input.addEventListener("click", (event) => event.stopPropagation());

    if (input.type === "checkbox") {
      input.addEventListener("change", applyFromModule);

      continue;
    }

    input.addEventListener("blur", applyFromModule);

    input.addEventListener("change", applyFromModule);

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;

      event.preventDefault();

      input.blur();
    });
  }
}

function populateAnimationSelect(
  select: HTMLSelectElement,

  selectedType: V5GAnimationType | null,

  category: V5GAnimationCategory = selectedType
    ? getAnimationCategory(selectedType)
    : "animation",

  options: { includePlaceholder?: boolean } = {},
): void {
  select.innerHTML = "";

  const presets = getAnimationPresetsByCategory(category);

  if (options.includePlaceholder) {
    const option = document.createElement("option");

    option.value = "";

    option.textContent = `选择${getAnimationCategoryLabel(category)}类型`;

    option.style.backgroundColor = "#050505";

    option.style.color = "#a1a1aa";

    select.appendChild(option);
  }

  for (const preset of presets) {
    const option = document.createElement("option");

    option.value = preset.type;

    option.textContent = preset.label;

    option.style.backgroundColor = "#050505";

    option.style.color = "#f4f4f5";

    select.appendChild(option);
  }

  const selectedPresetInCategory =
    selectedType !== null &&
    presets.some((preset) => preset.type === selectedType);

  select.value = selectedPresetInCategory
    ? selectedType
    : options.includePlaceholder
      ? ""
      : (presets[0]?.type ?? "idle");
}

function updateAnimationModuleHeader(
  animation: V5GAnimationConfig,
  title: HTMLElement | null,
): void {
  if (title) {
    title.textContent = getAnimationDisplayName(animation);
  }
}

function populateEasingSelect(
  select: HTMLSelectElement,

  selectedEasing: string,

  options: { includePlaceholder?: boolean } = {},
): void {
  select.innerHTML = "";

  if (options.includePlaceholder) {
    const option = document.createElement("option");

    option.value = "";

    option.textContent = "选择类型后自动填入";

    option.style.backgroundColor = "#050505";

    option.style.color = "#a1a1aa";

    select.appendChild(option);
  }

  for (const easing of V5G_EASINGS) {
    const option = document.createElement("option");

    option.value = easing.value;

    option.textContent = easing.label;

    option.style.backgroundColor = "#050505";

    option.style.color = "#f4f4f5";

    select.appendChild(option);
  }

  select.value = V5G_EASINGS.some((item) => item.value === selectedEasing)
    ? selectedEasing
    : options.includePlaceholder
      ? ""
      : "linear";
}

function updateAnimationEnabledFromHeader(
  layerId: string,
  animationId: string,
  enabled: boolean,
): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  const animation = layer.animations.find((item) => item.id === animationId);
  if (!animation || animation.enabled === enabled) return;

  pushUndoSnapshot();
  animation.enabled = enabled;
  clearLayerPreview(layer.id);
  if (!enabled) {
    applyAnimatedLayersAtTime(state.playheadSeconds);
    renderAll();
    void pixiStage.render(state);
  } else {
    setPlayheadSeconds(state.playheadSeconds);
  }
  scheduleAutoSave(0);
  showStatus(enabled ? "动画模块已启用。" : "动画模块已停用。", "success");
}

function updateAnimationFromModule(
  layerId: string,

  animationId: string,

  module: HTMLElement,

  options: { silentIfUnchanged?: boolean } = {},
): void {
  const layer = findLayer(layerId);

  if (!layer) return;

  const animationIndex = layer.animations.findIndex(
    (animation) => animation.id === animationId,
  );

  const currentAnimation = layer.animations[animationIndex];

  if (!currentAnimation) return;

  const typeSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-type]",
  );

  const easingSelect = module.querySelector<HTMLSelectElement>(
    "[data-animation-easing]",
  );

  const startInput = module.querySelector<HTMLInputElement>(
    "[data-animation-start]",
  );

  const durationInput = module.querySelector<HTMLInputElement>(
    "[data-animation-duration]",
  );

  const enabledInput = module.querySelector<HTMLInputElement>(
    "[data-animation-enabled]",
  );

  const paramContainer = module.querySelector<HTMLElement>(
    "[data-animation-param-fields]",
  );

  if (
    !typeSelect ||
    !easingSelect ||
    !startInput ||
    !durationInput ||
    !enabledInput ||
    !paramContainer ||
    !isV5GAnimationType(typeSelect.value)
  ) {
    showStatus("动画模块字段不完整，无法应用修改。", "error");

    return;
  }

  const animationType = typeSelect.value;

  const params = readAnimationParamsFromContainer(
    animationType,

    paramContainer,
  );

  params.easing = easingSelect.value;

  const nextAnimation: V5GAnimationConfig = {
    ...currentAnimation,

    type: animationType,

    name: getAnimationTypeDisplayName(animationType),

    startTime: snapTimelineSeconds(
      readAnimationStart(startInput, currentAnimation.startTime),
    ),

    duration: snapTimelineSeconds(
      readAnimationDuration(durationInput, currentAnimation.duration),
    ),

    enabled: enabledInput.checked,

    params,
  };

  rememberCommittedAnimationTypeDraft(
    getAnimationModuleMemoryKey(layer.id, nextAnimation.id),

    nextAnimation,
  );

  if (areAnimationConfigsEquivalent(currentAnimation, nextAnimation)) {
    if (!options.silentIfUnchanged) {
      showStatus("动画模块没有变化。", "info");
    }

    return;
  }

  pushUndoSnapshot();

  layer.animations[animationIndex] = nextAnimation;

  layer.animations.sort((a, b) => a.startTime - b.startTime);

  selectedAnimationId = nextAnimation.id;

  expandedTimelineLayerIds.add(layer.id);

  collapsedAnimationIds.delete(nextAnimation.id);

  normalizeProjectDurationToAnimationEnd({ silent: true });

  clearPreviewBaseCache();

  setPlayheadSeconds(nextAnimation.startTime);

  renderAll();

  scheduleAutoSave(0);

  showStatus(
    `已更新「${layer.name}」的 ${getAnimationDisplayName(nextAnimation)} 动画模块。`,

    "success",
  );
}

function areAnimationConfigsEquivalent(
  left: V5GAnimationConfig,

  right: V5GAnimationConfig,
): boolean {
  if (
    left.id !== right.id ||
    left.type !== right.type ||
    left.name !== right.name ||
    left.startTime !== right.startTime ||
    left.duration !== right.duration ||
    left.enabled !== right.enabled ||
    left.seed !== right.seed
  ) {
    return false;
  }

  const leftKeys = Object.keys(left.params);

  const rightKeys = Object.keys(right.params);

  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => left.params[key] === right.params[key]);
}

function reverseOffsetAnimationAxis(
  layerId: string,

  animationId: string,

  axis: "x" | "y",
): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  const animation = layer.animations.find((item) => item.id === animationId);
  if (!animation) return;
  if (!isOffsetReversibleAnimation(animation.type)) {
    showStatus("只有 Move / Slide 位移动画支持一键反转。", "error");
    return;
  }

  const fromKey = axis === "x" ? "fromX" : "fromY";
  const toKey = axis === "x" ? "toX" : "toY";
  const fromValue = readAnimationParamNumber(animation, fromKey, 0);
  const toValue = readAnimationParamNumber(animation, toKey, 0);

  pushUndoSnapshot();
  animation.params[fromKey] = roundTo(-fromValue, 4);
  animation.params[toKey] = roundTo(-toValue, 4);
  selectedAnimationId = animation.id;
  expandedTimelineLayerIds.add(layer.id);
  collapsedAnimationIds.delete(animation.id);
  clearLayerPreview(layer.id);
  setPlayheadSeconds(animation.startTime);
  renderAll();
  scheduleAutoSave(0);
  showStatus(
    axis === "x"
      ? `已反转「${layer.name}」的 ${animation.type} X：${fromValue}→${toValue} 变为 ${-fromValue}→${-toValue}。`
      : `已反转「${layer.name}」的 ${animation.type} Y：${fromValue}→${toValue} 变为 ${-fromValue}→${-toValue}。`,
    "success",
  );
}

function isOffsetReversibleAnimation(type: V5GAnimationType): boolean {
  return type === "move" || type === "slide_in" || type === "slide_out";
}

function readAnimationParamNumber(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function deleteAnimationFromLayer(layerId: string, animationId: string): void {
  const layer = findLayer(layerId);
  if (!layer) return;
  const animationIndex = layer.animations.findIndex(
    (animation) => animation.id === animationId,
  );
  const animation = layer.animations[animationIndex];
  if (!animation) return;

  pushUndoSnapshot();

  layer.animations.splice(animationIndex, 1);

  animationTypeDrafts.delete(
    getAnimationModuleMemoryKey(layer.id, animationId),
  );

  collapsedAnimationIds.delete(animationId);

  if (selectedAnimationId === animationId) selectedAnimationId = null;
  clearLayerPreview(layer.id);
  renderAll();
  void pixiStage.render(state);
  scheduleAutoSave(0);
  showStatus(
    `已删除「${layer.name}」的 ${animation.type} 动画模块。`,
    "success",
  );
}

function applyAnimatedLayersAtTime(time: number): void {
  const nextPreviewLayers: Record<string, V5GPreviewLayerState> = {};
  for (const layer of state.project.layers) {
    const sampled = sampleLayerAnimationsAtTime(
      {
        transform: cloneTransform(layer.transform),
        opacity: layer.opacity,
      },
      layer.animations,
      time,
    );

    // 图层有启用的动画、但当前时间不在任何动画覆盖范围内时，隐藏图层。
    // 避免图层在动画开始前就出现在画布中。
    const hasAnyEnabled = layer.animations.some((a) => a.enabled);
    const hasActiveCoverage = hasAnyEnabled
      ? layer.animations.some(
          (a) =>
            a.enabled &&
            time >= a.startTime &&
            time <= a.startTime + a.duration,
        )
      : true;
    const effectiveOpacity =
      hasAnyEnabled && !hasActiveCoverage ? 0 : sampled.opacity;

    nextPreviewLayers[layer.id] = {
      transform: sampled.transform,
      opacity: effectiveOpacity,
    };
  }
  state.previewLayers = nextPreviewLayers;
}

function clearPreviewBaseCache(): void {
  clearPreviewLayers();
}

function clearPreviewLayers(): void {
  state.previewLayers = {};
}

function clearLayerPreview(layerId: string): void {
  if (!state.previewLayers?.[layerId]) return;
  const { [layerId]: _removed, ...nextPreviewLayers } = state.previewLayers;
  void _removed;
  state.previewLayers = nextPreviewLayers;
}

function cloneTransform(transform: V5GTransformConfig): V5GTransformConfig {
  return { ...transform };
}

function scheduleAutoSave(delayMs = 500): void {
  if (!workspaceIndex || !currentProjectId) return;
  setAutoSaveLabel("保存中…", "info");
  clearAutoSaveTimer();
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = 0;
    void performAutoSave();
  }, delayMs);
}

async function flushAutoSave(): Promise<void> {
  if (!workspaceIndex || !currentProjectId) return;
  clearAutoSaveTimer();
  await performAutoSave();
}

async function performAutoSave(): Promise<void> {
  if (!workspaceIndex || !currentProjectId) return;
  const runId = saveRunId + 1;
  saveRunId = runId;
  try {
    updateCurrentProjectSummary();
    await saveProjectRecord(currentProjectId, state.project);
    if (assetsDirty) {
      await saveRuntimeAssets(currentProjectId, state.runtimeAssets, {
        skipExisting: true,
      });
      assetsDirty = false;
    }
    saveWorkspaceIndex(workspaceIndex);
    if (runId === saveRunId) {
      setAutoSaveLabel("已自动保存", "success");
    }
  } catch (error) {
    setAutoSaveLabel("保存失败", "error");
    showStatus(`自动保存失败：${getErrorMessage(error)}`, "error");
  }
}

function clearAutoSaveTimer(): void {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
    autoSaveTimer = 0;
  }
}

function updateCurrentProjectSummary(): void {
  const summary = getCurrentProjectSummary();
  if (!summary) return;
  summary.name = state.project.name;
  summary.updatedAt = Date.now();
}

function saveCurrentProjectViewport(viewport: V5GViewportState): void {
  const summary = getCurrentProjectSummary();
  if (!summary || !workspaceIndex) return;
  summary.viewport = viewport;
  summary.updatedAt = Date.now();
  saveWorkspaceIndex(workspaceIndex);
}

function getCurrentProjectSummary(): V5GProjectSummary | null {
  if (!workspaceIndex || !currentProjectId) return null;
  return (
    workspaceIndex.projects.find(
      (project) => project.id === currentProjectId,
    ) ?? null
  );
}

function syncProjectControls(): void {
  els.projectSelect.innerHTML = "";
  els.projectOptions.innerHTML = "";
  const projects = workspaceIndex?.projects ?? [];
  for (const project of projects) {
    const selectOption = document.createElement("option");
    selectOption.value = project.id;
    selectOption.textContent = project.name;
    selectOption.style.backgroundColor = "#0c0c0d";
    selectOption.style.color = "#f4f4f5";
    els.projectSelect.appendChild(selectOption);

    const nameOption = document.createElement("option");
    nameOption.value = project.name;
    nameOption.label =
      project.id === currentProjectId ? "当前项目" : "切换项目";
    els.projectOptions.appendChild(nameOption);
  }
  els.projectSelect.value = currentProjectId;
}

function renameCurrentProjectFromInput(
  options: { silentIfUnchanged?: boolean } = {},
): void {
  const nextName = els.projectName.value.trim();
  if (!nextName) {
    els.projectName.value = state.project.name;
    showStatus("项目名不能为空，已恢复当前项目名。", "error");
    return;
  }

  if (nextName === state.project.name) {
    if (!options.silentIfUnchanged) {
      showStatus(`当前项目名仍为：${state.project.name}`, "info");
    }
    return;
  }

  const matchingOtherProject = workspaceIndex?.projects.find(
    (project) => project.id !== currentProjectId && project.name === nextName,
  );
  if (matchingOtherProject) {
    els.projectName.value = state.project.name;
    showStatus(
      "项目名已存在。请使用右侧下拉框切换项目，或输入一个新名称。",
      "error",
    );
    return;
  }

  state.project.name = nextName;
  updateCurrentProjectSummary();
  syncProjectControls();
  els.zipName.value = sanitizeZipFilename(nextName).replace(/\.zip$/i, "");
  scheduleAutoSave(0);
  showStatus(`项目名已更新为：${state.project.name}`, "success");
}

function syncProjectFields(): void {
  els.projectName.value = state.project.name;
  els.zipName.value = state.project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  syncStageInputs();
}

function createEditorState(
  project: V5GEditorState["project"],
  runtimeAssets: V5GEditorState["runtimeAssets"],
): V5GEditorState {
  normalizeProjectLayerGroups(project);
  normalizeProjectMasks(project);
  normalizeProjectBlendModes(project);
  return {
    project,
    runtimeAssets,
    selectedLayerId: project.layers[0]?.id ?? null,
    isPlaying: false,
    playheadSeconds: 0,
    showSelectionOutline: true,
    previewLayers: {},
  };
}

function normalizeProjectBlendModes(project: V5GProjectConfig): void {
  for (const layer of project.layers) {
    layer.blendMode = normalizeBlendMode(layer.blendMode);
  }
}

function normalizeBlendMode(value: unknown): V5GBlendMode {
  if (
    value === "add" ||
    value === "screen" ||
    value === "multiply" ||
    value === "lighten"
  ) {
    return value;
  }
  return "normal";
}

function revokeRuntimeAssetUrls(): void {
  for (const asset of state.runtimeAssets) {
    URL.revokeObjectURL(asset.objectUrl);
  }
}

function getPlaybackRangeFromInputs(): { start: number; end: number } | null {
  const duration = normalizeProjectDurationToAnimationEnd({ silent: true });
  if (!els.cbPlaySegment.checked) {
    return { start: 0, end: duration };
  }

  const fallbackStart = clampNumber(state.playheadSeconds, 0, duration);
  let start = readNumberInput(els.playStartSeconds, fallbackStart);
  let end = readNumberInput(els.playEndSeconds, duration);

  start = snapTimelineSeconds(clampNumber(start, 0, duration));
  end = snapTimelineSeconds(clampNumber(end, 0, duration));

  if (els.cbPlaySegment.checked && end <= start) {
    end = snapTimelineSeconds(
      clampNumber(start + TIMELINE_MINOR_TICK_SECONDS, 0, duration),
    );
    if (end <= start) {
      showStatus("时间段结束时间必须大于开始时间。", "error");
      syncPlaybackRangeInputs({ silent: true });
      return null;
    }
    showStatus("时间段结束时间已自动调整到开始时间之后。", "info");
  }

  els.playStartSeconds.value = formatTimelineSeconds(start);
  els.playEndSeconds.value = formatTimelineSeconds(end);
  return { start, end };
}

function syncPlaybackRangeInputs(options: { silent?: boolean } = {}): void {
  const isSegmentEnabled = els.cbPlaySegment.checked;
  els.playStartSeconds.disabled = !isSegmentEnabled;
  els.playEndSeconds.disabled = !isSegmentEnabled;
  els.playStartSeconds.classList.toggle("opacity-45", !isSegmentEnabled);
  els.playEndSeconds.classList.toggle("opacity-45", !isSegmentEnabled);

  if (!isSegmentEnabled) {
    renderTimelineAnimations();
    return;
  }

  const duration = normalizeProjectDurationToAnimationEnd({ silent: true });
  const start = snapTimelineSeconds(
    clampNumber(readNumberInput(els.playStartSeconds, 0), 0, duration),
  );
  let end = snapTimelineSeconds(
    clampNumber(readNumberInput(els.playEndSeconds, duration), 0, duration),
  );
  const minEnd = snapTimelineSeconds(
    clampNumber(start + TIMELINE_MINOR_TICK_SECONDS, 0, duration),
  );
  if (end <= start) end = minEnd > start ? minEnd : duration;
  els.playStartSeconds.value = formatTimelineSeconds(start);
  els.playEndSeconds.value = formatTimelineSeconds(end);
  renderTimelineAnimations();
  if (!options.silent) {
    showStatus(
      `已设置播放时间段：${formatTimelineSeconds(start)}s - ${formatTimelineSeconds(end)}s。`,
      "info",
    );
  }
}

function togglePlayback(): void {
  if (state.isPlaying) {
    pausePlayback();
    return;
  }

  startPlaybackFromCurrentPosition();
}

function startPlaybackFromCurrentPosition(): void {
  const range = getPlaybackRangeFromInputs();
  if (!range) return;

  activePlaybackRange = range;
  state.isPlaying = true;
  const isAtRangeEnd = state.playheadSeconds >= range.end - 0.0001;
  const startTime = isAtRangeEnd
    ? range.start
    : clampNumber(state.playheadSeconds, range.start, range.end);
  setPlayheadSeconds(startTime);
  playStartedAt = performance.now() - startTime * 1000;
  pixiStage.stopDemo();
  setPlaybackButtonState(true);
  tickPlayhead();
  showStatus(
    els.cbPlaySegment.checked
      ? `正在播放 ${formatTimelineSeconds(range.start)}s - ${formatTimelineSeconds(range.end)}s 时间段。`
      : "正在播放代码驱动动画。",
    "info",
  );
}

function pausePlayback(options: { silent?: boolean } = {}): void {
  state.isPlaying = false;
  activePlaybackRange = null;
  cancelAnimationFrame(animationFrame);
  pixiStage.stopDemo();
  setPlaybackButtonState(false);
  renderAll();
  if (!options.silent) {
    showStatus(`已暂停在 ${state.playheadSeconds.toFixed(2)}s。`, "info");
  }
}

function tickPlayhead(): void {
  cancelAnimationFrame(animationFrame);
  const run = () => {
    if (!state.isPlaying) return;
    const range = activePlaybackRange ?? {
      start: 0,
      end: state.project.stage.duration,
    };
    const nextTime = (performance.now() - playStartedAt) / 1000;
    setPlayheadSeconds(nextTime);
    if (state.playheadSeconds >= range.end) {
      if (els.cbLoopPlay.checked) {
        playStartedAt = performance.now() - range.start * 1000;
        setPlayheadSeconds(range.start);
        animationFrame = requestAnimationFrame(run);
        return;
      }
      state.isPlaying = false;
      setPlayheadSeconds(range.end);
      activePlaybackRange = null;
      setPlaybackButtonState(false);
      showStatus(
        els.cbPlaySegment.checked
          ? "时间段播放完成。"
          : "代码驱动动画播放完成。",
        "success",
      );
      return;
    }
    animationFrame = requestAnimationFrame(run);
  };
  animationFrame = requestAnimationFrame(run);
}

function stopPlayback(
  options: { silent?: boolean; keepPlayhead?: boolean } = {},
): void {
  state.isPlaying = false;
  activePlaybackRange = null;
  if (!options.keepPlayhead) {
    state.playheadSeconds = 0;
    clearPreviewLayers();
  }
  cancelAnimationFrame(animationFrame);
  pixiStage.stopDemo();
  setPlaybackButtonState(false);
  renderAll();
  if (!options.silent) {
    showStatus("播放已停止。", "info");
  }
}

async function applyStageSizeFromInputs(
  options: { silent?: boolean } = {},
): Promise<void> {
  const width = Math.round(
    clampNumber(
      readNumberInput(els.stageWidth, state.project.stage.width),
      MIN_STAGE_SIZE,
      MAX_STAGE_SIZE,
    ),
  );
  const height = Math.round(
    clampNumber(
      readNumberInput(els.stageHeight, state.project.stage.height),
      MIN_STAGE_SIZE,
      MAX_STAGE_SIZE,
    ),
  );
  const changed =
    width !== state.project.stage.width ||
    height !== state.project.stage.height;

  if (changed) pushUndoSnapshot();
  state.project.stage.width = width;
  state.project.stage.height = height;
  syncStageInputs();

  if (!changed) return;

  stopPlayback({ silent: true });
  pixiStage.resetView();
  updateZoomLabel(pixiStage.getViewportState().scale);
  await renderAllAsync();
  scheduleAutoSave();
  if (!options.silent) {
    showStatus(`舞台尺寸已更新为 ${height}×${width}。`, "success");
  }
}

function syncStageInputs(): void {
  els.stageWidth.value = String(state.project.stage.width);
  els.stageHeight.value = String(state.project.stage.height);
  els.stageSizeLabel.textContent = `${state.project.stage.height}×${state.project.stage.width}`;
}

function updateZoomLabel(scale: number): void {
  els.zoomInput.value = String(Math.round(scale * 100));
}

function applyZoomPercentFromInput(): void {
  const percent = Math.round(
    clampNumber(
      readNumberInput(els.zoomInput, pixiStage.getViewportState().scale * 100),
      MIN_ZOOM_PERCENT,
      MAX_ZOOM_PERCENT,
    ),
  );
  els.zoomInput.value = String(percent);
  pixiStage.setViewportScale(percent / 100);
  showStatus(`显示比例已调整为 ${percent}%。`, "success");
}

function handleGlobalShortcut(event: KeyboardEvent): void {
  if (isEditableShortcutTarget(event.target)) return;

  if (
    event.code === "Space" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    togglePlayback();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    void undoLastChange();
    return;
  }

  if (event.key !== "Delete") return;
  const selectedLayerId = state.selectedLayerId;
  if (!selectedLayerId) return;
  const index = state.project.layers.findIndex(
    (layer) => layer.id === selectedLayerId,
  );
  if (index === -1) return;

  event.preventDefault();
  deleteLayerAt(index);
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function pushUndoSnapshot(): void {
  undoStack.push(cloneProjectConfig(state.project));
  if (undoStack.length > MAX_UNDO_STEPS) {
    undoStack.splice(0, undoStack.length - MAX_UNDO_STEPS);
  }
}

async function undoLastChange(): Promise<void> {
  const previousProject = undoStack.pop();
  if (!previousProject) {
    showStatus("没有可撤销的步骤。", "info");
    return;
  }

  stopPlayback({ silent: true });
  state.project = cloneProjectConfig(previousProject);
  const lastLayer = state.project.layers[state.project.layers.length - 1];
  if (
    state.selectedLayerId &&
    !state.project.layers.some((layer) => layer.id === state.selectedLayerId)
  ) {
    state.selectedLayerId = lastLayer?.id ?? null;
  }
  if (!state.selectedLayerId) {
    state.selectedLayerId = lastLayer?.id ?? null;
  }
  clearPreviewBaseCache();
  syncProjectControls();
  syncProjectFields();
  await renderAllAsync();
  scheduleAutoSave(0);
  showStatus(`已撤销上一步。还可撤销 ${undoStack.length} 步。`, "success");
}

function clearUndoHistory(): void {
  undoStack.length = 0;
}

function findLayer(layerId: string): V5GLayerConfig | null {
  return state.project.layers.find((layer) => layer.id === layerId) ?? null;
}

function sanitizeSelectedAnimation(): void {
  if (!selectedAnimationId) return;
  const exists = state.project.layers.some((layer) =>
    layer.animations.some((animation) => animation.id === selectedAnimationId),
  );
  if (!exists) selectedAnimationId = null;
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片无法读取"));
    };
    image.src = url;
  });
}

function readNumberInput(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function readExportAssetScale(): number {
  const value = Number(els.exportAssetScale.value);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(1, Math.max(0.01, value));
}

function formatCursorCoordinate(value: number): string {
  if (!Number.isFinite(value)) return "    0.0";
  return value.toFixed(1).padStart(7, " ");
}

function setPlaybackButtonState(isPlaying: boolean): void {
  els.btnRun.disabled = false;
  els.btnRun.classList.remove("opacity-70", "cursor-wait");
  if (isPlaying) {
    els.btnRun.innerHTML = '<i class="fa-solid fa-pause mr-1"></i>暂停';
    els.btnRun.classList.remove(
      "bg-zinc-100",
      "text-zinc-950",
      "hover:bg-white",
    );
    els.btnRun.classList.add(
      "bg-slate-800",
      "text-slate-100",
      "hover:bg-slate-700",
    );
  } else {
    els.btnRun.innerHTML = '<i class="fa-solid fa-play mr-1"></i>播放';
    els.btnRun.classList.remove(
      "bg-slate-800",
      "text-slate-100",
      "hover:bg-slate-700",
    );
    els.btnRun.classList.add("bg-zinc-100", "text-zinc-950", "hover:bg-white");
  }
}

function setButtonLoading(
  button: HTMLButtonElement,
  loading: boolean,
  loadingText = "处理中",
): void {
  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("opacity-70", "cursor-wait");
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i>${loadingText}`;
  } else {
    button.disabled = false;
    button.classList.remove("opacity-70", "cursor-wait");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    }
  }
}

function setAutoSaveLabel(
  message: string,
  type: "info" | "success" | "error",
): void {
  const colorClass =
    type === "error"
      ? "text-red-300"
      : type === "success"
        ? "text-zinc-300"
        : "text-zinc-400";
  els.autoSaveLabel.className = `ml-auto min-w-20 text-right text-[10px] ${colorClass}`;
  els.autoSaveLabel.textContent = message;
}

function showStatus(message: string, type: "info" | "success" | "error"): void {
  const colorClass =
    type === "error"
      ? "text-red-300"
      : type === "success"
        ? "text-zinc-300"
        : "text-zinc-400";
  els.status.className = `h-7 shrink-0 border-t border-white/10 bg-[#0c0c0d] px-3 py-1 text-[11px] ${colorClass}`;
  els.status.textContent = message;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function getButton(id: string): HTMLButtonElement {
  const element = getElement(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`#${id} is not a button`);
  }
  return element;
}

function getInput(id: string): HTMLInputElement {
  const element = getElement(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`#${id} is not an input`);
  }
  return element;
}

function getSelect(id: string): HTMLSelectElement {
  const element = getElement(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`#${id} is not a select`);
  }
  return element;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
