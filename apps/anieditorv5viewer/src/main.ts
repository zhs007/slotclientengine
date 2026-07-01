import "./styles.css";
import { bundledProjects, getBundledProject } from "./config/bundled-projects";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { Application } from "pixi.js";
import { createViewerControls } from "./ui/controls";

const VIEWER_INSERTED_NODE_ID = "viewer-group-slot-image";

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
  const stageMount = document.createElement("div");
  stageMount.className = "stage-mount";
  const controlsMount = document.createElement("section");
  controlsMount.className = "controls-panel";

  stage.appendChild(stageMount);
  shell.append(stage, controlsMount);
  appRoot.appendChild(shell);

  let player: VNIPlayer | null = null;
  let pixiApp: Application | null = null;
  let disposeResize: (() => void) | null = null;
  let loadToken = 0;
  let activeProject = getBundledProject("project");
  const controls = createViewerControls({
    projects: bundledProjects,
    selectedProjectId: "project",
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
      if (!player) return;
      try {
        player.clearMountedNodes();
        controls.setInsertedNodeActive(false);
        controls.setInsertionError(null);
      } catch (error) {
        controls.setInsertionError(
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

    player?.destroy();
    player = null;
    disposeResize?.();
    disposeResize = null;
    pixiApp?.destroy({ removeView: true });
    pixiApp = null;
    stageMount.replaceChildren();
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
    stageMount.appendChild(nextApp.canvas);
    resizePixiAppToMount(nextApp, stageMount);

    const nextPlayer = new VNIPlayer({
      parent: nextApp.stage,
      diagnosticsElement: stageMount,
      viewport: getMountViewport(stageMount),
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
    disposeResize = observeStageMount(stageMount, nextApp, nextPlayer);
    controls.setLayerGroupSlots(player.getLayerGroupSlots());
    controls.setInsertedNodeActive(false);
    controls.setLoop(player.getLoop());
    controls.setTime(player.getTime());
    syncPlaybackState();
  }

  await loadProject("project");
}

function observeStageMount(
  stageMount: HTMLElement,
  app: Application,
  player: VNIPlayer,
): () => void {
  const resize = (): void => {
    resizePixiAppToMount(app, stageMount);
    const viewport = getMountViewport(stageMount);
    player.setViewportSize(viewport.width, viewport.height);
  };
  if (typeof ResizeObserver === "undefined") {
    return () => undefined;
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageMount);
  return () => resizeObserver.disconnect();
}

function resizePixiAppToMount(app: Application, stageMount: HTMLElement): void {
  const viewport = getMountViewport(stageMount);
  app.renderer.resize(viewport.width, viewport.height);
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
