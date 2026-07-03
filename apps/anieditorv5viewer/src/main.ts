import "./styles.css";
import { bundledProjects, getBundledProject } from "./config/bundled-projects";
import {
  VNIPlayer,
  type VNITextLayerTextBinding,
} from "@slotclientengine/vnicore/pixi";
import { Application } from "pixi.js";
import { createViewerControls } from "./ui/controls";

const VIEWER_INSERTED_NODE_ID = "viewer-group-slot-image";
const VIEWER_TEXT_LAYER_REPLACEMENT_ID = "viewer-text-layer-replacement";
const STAGE_CANVAS_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const DEFAULT_STAGE_CANVAS_SCALE_INDEX = 2;
const DEFAULT_PROJECT_ID = "roundreel";

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

  let player: VNIPlayer | null = null;
  let pixiApp: Application | null = null;
  let disposeResize: (() => void) | null = null;
  let disposeInsertedNode: (() => void) | null = null;
  let disposeTextReplacement: (() => void) | null = null;
  let activeTextBinding: VNITextLayerTextBinding | null = null;
  let stageCanvasScaleIndex = DEFAULT_STAGE_CANVAS_SCALE_INDEX;
  let loadToken = 0;
  let activeProject = getBundledProject(DEFAULT_PROJECT_ID);
  const controls = createViewerControls({
    projects: bundledProjects,
    selectedProjectId: DEFAULT_PROJECT_ID,
    container: controlsMount,
    onProjectChange: (projectId) => {
      void loadProject(projectId).catch(showFatalError);
    },
    onTogglePlay: () => {
      if (!player) return;
      if (player.isPlaying()) player.pause();
      else player.play();
      syncPlaybackState();
    },
    onRestart: () => {
      player?.restart();
      syncPlaybackState();
    },
    onLoopChange: (loop) => {
      player?.setLoop(loop);
      syncPlaybackState();
    },
    onSeekStart: () => {
      player?.pause();
      syncPlaybackState();
    },
    onSeek: (time) => {
      player?.seek(time);
      syncPlaybackState();
    },
    onSegmentedStart: (advanced) => {
      if (!player) return;
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
        controls.setAdvancedError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    onSegmentedEnd: () => {
      if (!player) return;
      try {
        player.requestSegmentedPlaybackEnd();
        controls.setAdvancedError(null);
        syncPlaybackState();
      } catch (error) {
        controls.setAdvancedError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    onInsertBetweenGroups: (insertion) => {
      const currentPlayer = player;
      if (!currentPlayer) return;
      void (async () => {
        const attachOptions = {
          id: VIEWER_INSERTED_NODE_ID,
          afterGroupId: insertion.afterGroupId,
          beforeGroupId: insertion.beforeGroupId,
          x: activeProject.project.stage.width / 2,
          y: activeProject.project.stage.height / 2,
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
        controls.setInsertionError(
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    onClearInsertedNodes: () => {
      try {
        disposeInsertedNode?.();
        disposeInsertedNode = null;
        controls.setInsertedNodeActive(false);
        controls.setInsertionError(null);
      } catch (error) {
        controls.setInsertionError(
          error instanceof Error ? error.message : String(error),
        );
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
        controls.setTextReplacementError(
          error instanceof Error ? error.message : String(error),
        );
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
        controls.setTextReplacementError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });

  function syncPlaybackState(): void {
    if (!player) return;
    controls.setPlaybackState(player.getPlaybackState());
  }

  async function loadProject(projectId: string): Promise<void> {
    const selectedProject = getBundledProject(projectId);
    const token = (loadToken += 1);
    activeProject = selectedProject;

    disposeInsertedNode?.();
    disposeInsertedNode = null;
    clearTextReplacement();
    player?.destroy();
    player = null;
    disposeResize?.();
    disposeResize = null;
    pixiApp?.destroy({ removeView: true });
    pixiApp = null;
    stageCanvasLayer.replaceChildren();
    controls.setProject(selectedProject);
    controls.setPlaying(false);
    controls.setTime(0);

    const nextApp = new Application();
    await nextApp.init({
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    stageCanvasLayer.appendChild(nextApp.canvas);
    const nextViewport = applyStageCanvasViewport(nextApp, null);

    const nextPlayer = new VNIPlayer({
      parent: nextApp.stage,
      diagnosticsElement: stageMount,
      viewport: nextViewport,
      requestRender: () => nextApp.render(),
      projectId: selectedProject.id,
      bundleId: selectedProject.bundleId,
      profileId: selectedProject.profileId,
      profilePurpose: selectedProject.purpose,
      assetScale: selectedProject.assetScale,
      project: selectedProject.project,
      assetUrls: selectedProject.assetUrls,
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
      return;
    }
    player = nextPlayer;
    pixiApp = nextApp;
    disposeResize = observeStageMount(stageMount, () => {
      applyStageCanvasViewport(nextApp, nextPlayer);
    });
    controls.setLayerGroupSlots(player.getLayerGroupSlots());
    controls.setInsertedNodeActive(false);
    controls.setTextReplacementActive(false);
    controls.setLoop(player.getLoop());
    controls.setTime(player.getTime());
    syncPlaybackState();
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
    stageMount.style.setProperty("--stage-canvas-scale", String(scale));
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
  await loadProject(DEFAULT_PROJECT_ID);

  function applyStageCanvasViewport(
    app: Application,
    viewportPlayer: VNIPlayer | null,
  ): { readonly width: number; readonly height: number } {
    const viewport = getScaledMountViewport(
      stageMount,
      getStageCanvasScale(stageCanvasScaleIndex),
    );
    stageCanvasLayer.style.width = `${viewport.width}px`;
    stageCanvasLayer.style.height = `${viewport.height}px`;
    app.renderer.resize(viewport.width, viewport.height);
    viewportPlayer?.setViewportSize(viewport.width, viewport.height);
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

function getScaledMountViewport(
  stageMount: HTMLElement,
  scale: number,
): { readonly width: number; readonly height: number } {
  const viewport = getMountViewport(stageMount);
  return {
    width: viewport.width * scale,
    height: viewport.height * scale,
  };
}

function showFatalError(error: unknown): void {
  console.error(error);
  const appRoot = document.querySelector<HTMLDivElement>("#app");
  const message = error instanceof Error ? error.message : String(error);
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
