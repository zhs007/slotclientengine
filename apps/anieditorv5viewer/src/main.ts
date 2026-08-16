import "./styles.css";
import {
  openUploadedVNIProjectBundle,
  type LoadedUploadedVNIProject,
  type UploadedVNIProjectBundle,
} from "./runtime/uploaded-zip-project";
import {
  VNIViewer,
  VNIViewerPoolManager,
  type VNIAnimationRuntimeRef,
  type VNIManualPlaybackSession,
  type VNIParticleComboViewerLease,
  type VNIPlaybackOperation,
  type VNIViewerPool,
  type VNITextLayerTextBinding,
} from "@slotclientengine/vnicore/viewer";
import { Application } from "pixi.js";
import { createViewerControls } from "./ui/controls";

const VIEWER_INSERTED_NODE_ID = "viewer-group-slot-image";
const VIEWER_TEXT_LAYER_REPLACEMENT_ID = "viewer-text-layer-replacement";
const STAGE_CANVAS_SCALES = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4,
] as const;
const DEFAULT_STAGE_CANVAS_SCALE_INDEX = 6;

async function bootstrap(): Promise<void> {
  const appRoot = document.querySelector<HTMLDivElement>("#app");
  if (!appRoot) {
    throw new Error("Missing #app root element.");
  }

  appRoot.replaceChildren();
  const shell = document.createElement("main");
  shell.className = "viewer-shell";
  const stage = document.createElement("section");
  stage.className = "stage-panel";
  const stageToolbar = document.createElement("div");
  stageToolbar.className = "stage-toolbar";
  const zoomControls = document.createElement("div");
  zoomControls.className = "stage-zoom-controls";
  const zoomOutButton = createStageZoomButton("-", "缩小画布");
  const zoomResetButton = createStageZoomButton("1:1", "重置画布缩放");
  const zoomInButton = createStageZoomButton("+", "放大画布");
  const zoomReadout = document.createElement("span");
  zoomReadout.className = "stage-zoom-readout";
  zoomControls.append(
    zoomOutButton,
    zoomReadout,
    zoomInButton,
    zoomResetButton,
  );
  stageToolbar.appendChild(zoomControls);
  const stageMount = document.createElement("div");
  stageMount.className = "stage-mount";
  const stageCanvasLayer = document.createElement("div");
  stageCanvasLayer.className = "stage-canvas-layer";
  stageMount.appendChild(stageCanvasLayer);
  const controlsMount = document.createElement("section");
  controlsMount.className = "controls-panel";

  stage.append(stageToolbar, stageMount);
  shell.append(stage, controlsMount);
  appRoot.appendChild(shell);

  let player: VNIViewer | null = null;
  let pixiApp: Application | null = null;
  let disposeResize: (() => void) | null = null;
  let disposeInsertedNode: (() => void) | null = null;
  let disposeTextReplacement: (() => void) | null = null;
  let activeTextBinding: VNITextLayerTextBinding | null = null;
  let activeBundle: UploadedVNIProjectBundle | null = null;
  let activeProject: LoadedUploadedVNIProject | null = null;
  let stageCanvasScaleIndex = DEFAULT_STAGE_CANVAS_SCALE_INDEX;
  let loadToken = 0;
  let manualPreviewToken = 0;
  let manualPreviewSession: VNIManualPlaybackSession | null = null;
  let manualPreviewOperation: VNIPlaybackOperation | null = null;
  const playerPoolManager = new VNIViewerPoolManager({
    maxIdleInstancesPerPlayer: 2,
  });
  let targetPreviewPool: VNIViewerPool | null = null;
  let targetPreviewLease: VNIParticleComboViewerLease | null = null;
  let targetPreviewToken = 0;

  const controls = createViewerControls({
    container: controlsMount,
    onZipUpload: (file) => {
      void loadUploadedZip(file).catch(showFatalError);
    },
    onProfileChange: (profileId) => {
      void loadUploadedProfile(profileId).catch(showFatalError);
    },
    onTogglePlay: () => {
      if (!player) return;
      disposeTargetPreview();
      disposeManualPreview();
      if (player.isPlaying()) player.pause();
      else player.play();
      syncPlaybackState();
    },
    onRestart: () => {
      disposeTargetPreview();
      disposeManualPreview();
      player?.restart();
      syncPlaybackState();
    },
    onLoopChange: (loop) => {
      player?.setLoop(loop);
      syncPlaybackState();
    },
    onSeekStart: () => {
      disposeTargetPreview();
      disposeManualPreview();
      player?.pause();
      syncPlaybackState();
    },
    onSeek: (time) => {
      disposeTargetPreview();
      disposeManualPreview();
      player?.seek(time);
      syncPlaybackState();
    },
    onSegmentedStart: (advanced) => {
      if (!player) return;
      disposeTargetPreview();
      disposeManualPreview();
      try {
        player.play({
          mode: "segmented",
          loopStart: { unit: "time", at: advanced.loopStart },
          loopEnd: { unit: "time", at: advanced.loopEnd },
          keepParticlesAlive: advanced.keepParticlesAlive,
        });
        controls.setAdvancedError(null);
        syncPlaybackState();
      } catch (error) {
        controls.setAdvancedError(getErrorMessage(error));
      }
    },
    onSegmentedEnd: () => {
      if (!player) return;
      try {
        player.requestSegmentedPlaybackEnd();
        controls.setAdvancedError(null);
        syncPlaybackState();
      } catch (error) {
        controls.setAdvancedError(getErrorMessage(error));
      }
    },
    onCyclicPreview: ({ ref, durationSeconds }) => {
      disposeTargetPreview();
      void runCyclicPreview(ref, durationSeconds);
    },
    onTargetPreview: (preview) => {
      void runTargetPreview(preview);
    },
    onInsertBetweenGroups: (insertion) => {
      const currentPlayer = player;
      const currentProject = activeProject;
      if (!currentPlayer || !currentProject) return;
      void (async () => {
        const attachOptions = {
          id: VIEWER_INSERTED_NODE_ID,
          afterGroupId: insertion.afterGroupId,
          beforeGroupId: insertion.beforeGroupId,
          x: currentProject.project.stage.width / 2,
          y: currentProject.project.stage.height / 2,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 1,
        };
        const dispose = insertion.projectAssetId
          ? currentPlayer.attachImageBetweenLayerGroups({
              ...attachOptions,
              assetId: insertion.projectAssetId,
            })
          : await currentPlayer.attachExternalImageBetweenLayerGroups({
              ...attachOptions,
              imageUrl: insertion.assetUrl,
              label: insertion.assetPath,
            });
        if (currentPlayer !== player) {
          dispose();
          return;
        }
        disposeInsertedNode?.();
        disposeInsertedNode = dispose;
        controls.setInsertedNodeActive(true);
        controls.setInsertionError(null);
      })().catch((error: unknown) => {
        if (currentPlayer !== player) return;
        controls.setInsertionError(getErrorMessage(error));
      });
    },
    onClearInsertedNodes: () => {
      try {
        disposeInsertedNode?.();
        disposeInsertedNode = null;
        controls.setInsertedNodeActive(false);
        controls.setInsertionError(null);
      } catch (error) {
        controls.setInsertionError(getErrorMessage(error));
      }
    },
    onApplyTextLayerReplacement: (replacement) => {
      const currentPlayer = player;
      if (!currentPlayer) return;
      void (async () => {
        clearTextReplacement();
        if (replacement.mode === "text") {
          const binding = currentPlayer.attachTextToTextLayer({
            id: VIEWER_TEXT_LAYER_REPLACEMENT_ID,
            layerId: replacement.layerId,
            text: replacement.text ?? "",
          });
          activeTextBinding = binding;
          disposeTextReplacement = binding.dispose;
        } else if (replacement.projectAssetId) {
          disposeTextReplacement = await currentPlayer.attachImageToTextLayer({
            id: VIEWER_TEXT_LAYER_REPLACEMENT_ID,
            layerId: replacement.layerId,
            assetId: replacement.projectAssetId,
            label: replacement.assetPath,
          });
        } else {
          disposeTextReplacement = await currentPlayer.attachImageToTextLayer({
            id: VIEWER_TEXT_LAYER_REPLACEMENT_ID,
            layerId: replacement.layerId,
            imageUrl: replacement.assetUrl,
            label: replacement.assetPath,
          });
        }
        if (currentPlayer !== player) {
          clearTextReplacement();
          return;
        }
        controls.setTextReplacementActive(true);
        controls.setTextReplacementError(null);
      })().catch((error: unknown) => {
        if (currentPlayer !== player) return;
        controls.setTextReplacementError(getErrorMessage(error));
        controls.setTextReplacementActive(false);
      });
    },
    onTextLayerReplacementTextInput: (text) => {
      activeTextBinding?.setText(text);
    },
    onClearTextLayerReplacement: () => {
      try {
        clearTextReplacement();
        controls.setTextReplacementActive(false);
        controls.setTextReplacementError(null);
      } catch (error) {
        controls.setTextReplacementError(getErrorMessage(error));
      }
    },
  });

  function syncPlaybackState(): void {
    if (!player) return;
    controls.setPlaybackState(player.getPlaybackState());
  }

  async function loadUploadedZip(file: File): Promise<void> {
    const token = beginLoad();
    disposeActivePlayback();
    activeBundle = null;
    controls.clearUploadedBundle();
    controls.clearProject();
    controls.setUploadError(null);

    try {
      const bundle = await openUploadedVNIProjectBundle(file, {
        fileName: file.name,
      });
      if (token !== loadToken) return;
      activeBundle = bundle;
      controls.setUploadedBundle({
        fileName: bundle.fileName,
        bundleId: bundle.bundleId,
        profiles: bundle.profiles,
        selectedProfileId: bundle.defaultProfileId,
      });
      if (bundle.defaultProfileId) {
        await loadUploadedProfile(bundle.defaultProfileId, token);
      }
    } catch (error) {
      if (token !== loadToken) return;
      activeBundle = null;
      controls.clearUploadedBundle();
      controls.clearProject();
      controls.setUploadError(getErrorMessage(error));
    }
  }

  async function loadUploadedProfile(
    profileId: string,
    existingToken?: number,
  ): Promise<void> {
    const bundle = activeBundle;
    if (!bundle) return;
    const token = existingToken ?? beginLoad();
    disposeActivePlayback();
    controls.clearProject();
    controls.setUploadError(null);
    controls.setUploadedBundle({
      fileName: bundle.fileName,
      bundleId: bundle.bundleId,
      profiles: bundle.profiles,
      selectedProfileId: profileId,
    });

    let loadedProject: LoadedUploadedVNIProject | null = null;
    try {
      loadedProject = bundle.loadProfile(profileId);
      await mountLoadedProject(loadedProject, token);
    } catch (error) {
      loadedProject?.dispose();
      if (token !== loadToken) return;
      controls.clearProject();
      controls.setUploadError(getErrorMessage(error));
    }
  }

  async function mountLoadedProject(
    loadedProject: LoadedUploadedVNIProject,
    token: number,
  ): Promise<void> {
    const nextApp = new Application();
    let nextPlayer: VNIViewer | null = null;
    try {
      await nextApp.init({
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });
      stageCanvasLayer.appendChild(nextApp.canvas);
      const nextViewport = applyStageCanvasViewport(nextApp, null);

      nextPlayer = new VNIViewer({
        parent: nextApp.stage,
        diagnosticsElement: stageMount,
        viewport: nextViewport,
        viewportScale: getStageCanvasScale(stageCanvasScaleIndex),
        requestRender: () => nextApp.render(),
        projectId: loadedProject.projectId,
        bundleId: loadedProject.bundleId,
        profileId: loadedProject.profileId,
        profilePurpose: loadedProject.profilePurpose,
        assetScale: loadedProject.assetScale,
        project: loadedProject.project,
        assetUrls: loadedProject.assetUrls,
        onTimeChange: (time) => {
          controls.setTime(time);
          syncPlaybackState();
        },
        onPlayingChange: (isPlaying) => {
          controls.setPlaying(isPlaying);
          syncPlaybackState();
        },
      });
      await nextPlayer.init();
      if (token !== loadToken) {
        nextPlayer.destroy();
        nextApp.destroy({ removeView: true });
        loadedProject.dispose();
        return;
      }
      player = nextPlayer;
      pixiApp = nextApp;
      activeProject = loadedProject;
      disposeResize = observeStageMount(stageMount, () => {
        applyStageCanvasViewport(nextApp, nextPlayer);
      });
      controls.setProject({
        projectId: loadedProject.projectId,
        sourcePath: loadedProject.sourcePath,
        bundleId: loadedProject.bundleId,
        profileId: loadedProject.profileId,
        purpose: loadedProject.profilePurpose,
        assetScale: loadedProject.assetScale,
        project: loadedProject.project,
        insertionAssets: loadedProject.insertionAssets,
      });
      controls.setLayerGroupSlots(player.getLayerGroupSlots());
      controls.setInsertedNodeActive(false);
      controls.setTextReplacementActive(false);
      controls.setLoop(player.getLoop());
      controls.setTime(player.getTime());
      syncPlaybackState();
      inspectCyclicAnimations(player);
      targetPreviewPool = playerPoolManager.getPool(player);
      controls.setTargetAnimations(
        targetPreviewPool.listParticleComboAnimations(),
      );
    } catch (error) {
      nextPlayer?.destroy();
      nextApp.destroy({ removeView: true });
      loadedProject.dispose();
      throw error;
    }
  }

  function beginLoad(): number {
    loadToken += 1;
    return loadToken;
  }

  function disposeActivePlayback(): void {
    disposeTargetPreview();
    disposeManualPreview();
    disposeInsertedNode?.();
    disposeInsertedNode = null;
    clearTextReplacement();
    if (player) {
      playerPoolManager.destroyPool(player);
      player.destroy();
    }
    player = null;
    targetPreviewPool = null;
    disposeResize?.();
    disposeResize = null;
    pixiApp?.destroy({ removeView: true });
    pixiApp = null;
    stageCanvasLayer.replaceChildren();
    activeProject?.dispose();
    activeProject = null;
    controls.setPlaying(false);
    controls.setTime(0);
    controls.setLayerGroupSlots([]);
    controls.setInsertedNodeActive(false);
    controls.setTextReplacementActive(false);
    controls.setCyclicAnimations([]);
    controls.setCyclicState(null);
    controls.setCyclicError(null);
    controls.setTargetAnimations([]);
    controls.setTargetPreviewState(null, null);
    controls.setTargetError(null);
    targetPreviewPool = null;
  }

  function inspectCyclicAnimations(currentPlayer: VNIViewer): void {
    const session = currentPlayer.createManualPlaybackSession();
    try {
      const animations = session.listAnimations({
        capability: "cyclic-selection",
      });
      controls.setCyclicAnimations(
        animations.map((animation) => ({
          ref: animation.ref,
          label: `${animation.layerName} / ${animation.animationName}`,
          descriptor: session
            .getAnimation(animation.ref)
            .requireCyclicSelection()
            .getAuthoredPreviewDescriptor(),
        })),
      );
    } finally {
      session.destroy();
    }
  }

  async function runCyclicPreview(
    ref: VNIAnimationRuntimeRef,
    durationSeconds: number,
  ): Promise<void> {
    const currentPlayer = player;
    if (!currentPlayer) return;
    disposeManualPreview();
    const token = ++manualPreviewToken;
    const session = currentPlayer.createManualPlaybackSession();
    manualPreviewSession = session;
    controls.setCyclicError(null);
    try {
      const cyclic = session.getAnimation(ref).requireCyclicSelection();
      const descriptor = cyclic.getAuthoredPreviewDescriptor();
      cyclic.adoptAuthoredItems();
      controls.setCyclicState(session.getState());

      manualPreviewOperation = session.playRange({
        range: descriptor.introRange,
      });
      await manualPreviewOperation.completed;
      assertCurrentManualPreview(token, currentPlayer, session);

      const hold = session.holdTimeline({
        at: descriptor.continuousHoldPoint,
      });
      cyclic.startContinuousPhase({
        phaseId: descriptor.continuousPhaseId,
      });
      controls.setCyclicState(session.getState());
      if (durationSeconds > 0) {
        manualPreviewOperation = session.advanceFor({ durationSeconds });
        await manualPreviewOperation.completed;
        assertCurrentManualPreview(token, currentPlayer, session);
      }

      await cyclic.prepareAuthoredSelection().committed;
      assertCurrentManualPreview(token, currentPlayer, session);
      hold.release();
      cyclic.startResolvePhase();
      manualPreviewOperation = session.playRange({
        range: descriptor.endingRange,
        preserveRuntimeAnimationState: true,
      });
      controls.setCyclicState(session.getState());
      await manualPreviewOperation.completed;
      assertCurrentManualPreview(token, currentPlayer, session);
      manualPreviewOperation = null;
      controls.setCyclicState(session.getState());
    } catch (error) {
      if (
        token === manualPreviewToken &&
        currentPlayer === player &&
        session === manualPreviewSession
      ) {
        controls.setCyclicError(getErrorMessage(error));
        controls.setCyclicState(session.getState());
      }
    }
  }

  async function runTargetPreview(preview: {
    animation: {
      readonly layerId: string;
      readonly animationId: string;
    };
    target: { readonly x: number; readonly y: number };
    timing:
      | { readonly mode: "preserve-authored-speed" }
      | {
          readonly mode: "fixed-duration";
          readonly durationSeconds: number;
        };
  }): Promise<void> {
    const currentPlayer = player;
    const currentPool = targetPreviewPool;
    if (!currentPlayer || !currentPool) return;
    disposeTargetPreview();
    disposeManualPreview();
    const token = ++targetPreviewToken;
    currentPlayer.pause();
    currentPlayer.seek(0);
    currentPlayer.getDisplayObject().visible = false;
    controls.setTargetError(null);
    try {
      const lease = await currentPool.acquire(preview);
      if (
        token !== targetPreviewToken ||
        currentPlayer !== player ||
        currentPool !== targetPreviewPool
      ) {
        lease.release();
        return;
      }
      targetPreviewLease = lease;
      controls.setTargetPreviewState(lease.timing, currentPool.getStats());
      await lease.playOnce();
      if (
        token !== targetPreviewToken ||
        currentPlayer !== player ||
        currentPool !== targetPreviewPool
      ) {
        return;
      }
      targetPreviewLease = null;
      currentPlayer.getDisplayObject().visible = true;
      currentPlayer.seek(0);
      controls.setTargetPreviewState(lease.timing, currentPool.getStats());
    } catch (error) {
      if (
        token === targetPreviewToken &&
        currentPlayer === player &&
        currentPool === targetPreviewPool
      ) {
        targetPreviewLease = null;
        currentPlayer.getDisplayObject().visible = true;
        currentPlayer.seek(0);
        controls.setTargetError(getErrorMessage(error));
        controls.setTargetPreviewState(null, currentPool.getStats());
      }
    }
  }

  function assertCurrentManualPreview(
    token: number,
    currentPlayer: VNIViewer,
    session: VNIManualPlaybackSession,
  ): void {
    if (
      token !== manualPreviewToken ||
      currentPlayer !== player ||
      session !== manualPreviewSession
    ) {
      throw new Error("Stale VNI manual preview.");
    }
  }

  function disposeManualPreview(): void {
    manualPreviewToken += 1;
    manualPreviewOperation?.cancel();
    manualPreviewOperation = null;
    manualPreviewSession?.destroy();
    manualPreviewSession = null;
    controls.setCyclicState(null);
  }

  function disposeTargetPreview(): void {
    const hadPreview =
      targetPreviewLease !== null ||
      player?.getDisplayObject().visible === false;
    targetPreviewToken += 1;
    targetPreviewLease?.release();
    targetPreviewLease = null;
    if (player && hadPreview) {
      player.getDisplayObject().visible = true;
      player.seek(0);
    }
    if (hadPreview) {
      controls.setTargetPreviewState(
        null,
        targetPreviewPool?.getStats() ?? null,
      );
    }
  }

  function clearTextReplacement(): void {
    disposeTextReplacement?.();
    disposeTextReplacement = null;
    activeTextBinding = null;
  }

  zoomOutButton.addEventListener("click", () => {
    setStageCanvasScaleIndex(stageCanvasScaleIndex - 1);
  });
  zoomInButton.addEventListener("click", () => {
    setStageCanvasScaleIndex(stageCanvasScaleIndex + 1);
  });
  zoomResetButton.addEventListener("click", () => {
    setStageCanvasScaleIndex(DEFAULT_STAGE_CANVAS_SCALE_INDEX);
  });

  function setStageCanvasScaleIndex(index: number): void {
    stageCanvasScaleIndex = Math.min(
      STAGE_CANVAS_SCALES.length - 1,
      Math.max(0, index),
    );
    const scale = getStageCanvasScale(stageCanvasScaleIndex);
    stageMount.dataset.viewerCanvasScale = scale.toFixed(2);
    zoomReadout.textContent = `${Math.round(scale * 100)}%`;
    zoomOutButton.disabled = stageCanvasScaleIndex === 0;
    zoomInButton.disabled =
      stageCanvasScaleIndex === STAGE_CANVAS_SCALES.length - 1;
    zoomResetButton.disabled =
      stageCanvasScaleIndex === DEFAULT_STAGE_CANVAS_SCALE_INDEX;
    if (pixiApp) {
      applyStageCanvasViewport(pixiApp, player);
    }
  }

  setStageCanvasScaleIndex(stageCanvasScaleIndex);
  window.addEventListener(
    "beforeunload",
    () => {
      disposeActivePlayback();
      playerPoolManager.destroy();
    },
    {
      once: true,
    },
  );

  function applyStageCanvasViewport(
    app: Application,
    viewportPlayer: VNIViewer | null,
  ): { readonly width: number; readonly height: number } {
    const viewport = getMountViewport(stageMount);
    stageCanvasLayer.style.width = `${viewport.width}px`;
    stageCanvasLayer.style.height = `${viewport.height}px`;
    app.renderer.resize(viewport.width, viewport.height);
    viewportPlayer?.setViewportSize(viewport.width, viewport.height);
    viewportPlayer?.setViewportScale(
      getStageCanvasScale(stageCanvasScaleIndex),
    );
    return viewport;
  }
}

function createStageZoomButton(
  label: string,
  ariaLabel: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage-zoom-button";
  button.textContent = label;
  button.title = ariaLabel;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function getStageCanvasScale(index: number): number {
  return STAGE_CANVAS_SCALES[index] ?? 1;
}

function observeStageMount(
  stageMount: HTMLElement,
  resize: () => void,
): () => void {
  if (typeof ResizeObserver === "undefined") {
    return () => undefined;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageMount);
  return () => resizeObserver.disconnect();
}

function getMountViewport(stageMount: HTMLElement): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: stageMount.clientWidth || 1,
    height: stageMount.clientHeight || 1,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showFatalError(error: unknown): void {
  console.error(error);
  const appRoot = document.querySelector<HTMLDivElement>("#app");
  const message = getErrorMessage(error);
  if (appRoot) {
    appRoot.replaceChildren();
    const shell = document.createElement("main");
    shell.className = "viewer-shell error-shell";
    const panel = document.createElement("section");
    panel.className = "fatal-error";
    const title = document.createElement("h1");
    title.textContent = "VNI viewer failed";
    const detail = document.createElement("pre");
    detail.textContent = message;
    panel.append(title, detail);
    shell.appendChild(panel);
    appRoot.appendChild(shell);
  }
  setTimeout(() => {
    throw error;
  });
}

void bootstrap().catch(showFatalError);
