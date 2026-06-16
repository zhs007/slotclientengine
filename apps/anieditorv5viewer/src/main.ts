import "./styles.css";
import {
  bundledProject,
  bundledProjectAssetUrls,
} from "./config/bundled-project";
import { V5GPlayer } from "./runtime/v5g-player";
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

  let player: V5GPlayer | null = null;
  const controls = createViewerControls({
    project: bundledProject,
    container: controlsMount,
    onTogglePlay: () => {
      if (!player) return;
      if (player.isPlaying()) player.pause();
      else player.play();
    },
    onRestart: () => {
      player?.restart();
    },
    onLoopChange: (loop) => {
      player?.setLoop(loop);
    },
    onSeekStart: () => {
      player?.pause();
    },
    onSeek: (time) => {
      player?.seek(time);
    },
  });

  player = new V5GPlayer({
    container: stageMount,
    project: bundledProject,
    assetUrls: bundledProjectAssetUrls,
    onTimeChange: (time) => controls.setTime(time),
    onPlayingChange: (isPlaying) => controls.setPlaying(isPlaying),
  });
  await player.init();
  controls.setLoop(player.getLoop());
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
    title.textContent = "V5G viewer failed";
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
