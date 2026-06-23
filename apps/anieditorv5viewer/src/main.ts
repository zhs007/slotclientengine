import "./styles.css";
import { bundledProjects, getBundledProject } from "./config/bundled-projects";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { createViewerControls } from "./ui/controls";

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
  let loadToken = 0;
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
  });

  function syncPlaybackState(): void {
    if (!player) return;
    controls.setPlaybackState(player.getPlaybackState());
  }

  async function loadProject(projectId: string): Promise<void> {
    const selectedProject = getBundledProject(projectId);
    const token = (loadToken += 1);

    player?.destroy();
    player = null;
    stageMount.replaceChildren();
    controls.setProject(selectedProject);
    controls.setPlaying(false);
    controls.setTime(0);

    const nextPlayer = new VNIPlayer({
      container: stageMount,
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
      return;
    }
    player = nextPlayer;
    controls.setLoop(player.getLoop());
    controls.setTime(player.getTime());
    syncPlaybackState();
  }

  await loadProject("project");
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
