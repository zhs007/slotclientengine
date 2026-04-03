import { Application, Container } from "pixi.js";
import rawProject from "./assets/project.json";
import { DEFAULT_STAGE_HEIGHT, DEFAULT_STAGE_WIDTH, normalizeProjectConfig } from "./config/victory-project.js";
import { createSceneCameraController } from "./interaction/camera-controller.js";
import type { VictoryProjectConfigRaw } from "./config/victory-types.js";
import { computeCanvasLayout } from "./layout.js";
import { createProjectAssetResolver, loadProjectTextures } from "./runtime/asset-loader.js";
import { ANIMATION_SUPPORT_MATRIX } from "./runtime/support-matrix.js";
import { VictoryPlayer } from "./scene/victory-player.js";
import { createControlPanel } from "./ui/control-panel.js";
import "./styles.css";

async function bootstrap() {
  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing #app root.");
  }

  const assetModules = import.meta.glob("./assets/assets/*", {
    eager: true,
    import: "default",
    query: "?url"
  }) as Record<string, string>;
  const assetManifest = Object.fromEntries(
    Object.entries(assetModules).map(([modulePath, url]) => {
      const filename = modulePath.split("/").at(-1);
      return [`./assets/${filename}`, url];
    })
  );

  const project = normalizeProjectConfig(
    rawProject as VictoryProjectConfigRaw,
    createProjectAssetResolver(assetManifest),
    DEFAULT_STAGE_WIDTH,
    DEFAULT_STAGE_HEIGHT
  );
  const textures = await loadProjectTextures(project);

  const shell = document.createElement("main");
  shell.className = "app-shell";
  const stageShell = document.createElement("section");
  stageShell.className = "stage-shell";
  const stageHost = document.createElement("div");
  stageHost.className = "stage-host";
  stageShell.appendChild(stageHost);

  const panel = createControlPanel(project, ANIMATION_SUPPORT_MATRIX);
  shell.append(panel.root, stageShell);
  appRoot.appendChild(shell);

  const app = new Application();
  await app.init({
    width: project.width,
    height: project.height,
    antialias: true,
    background: "#040611",
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });
  stageHost.appendChild(app.canvas);

  const viewportRoot = new Container();
  const sceneRoot = new Container();
  viewportRoot.addChild(sceneRoot);
  app.stage.addChild(viewportRoot);

  const player = new VictoryPlayer(app, project, textures);
  sceneRoot.addChild(player.root);

  let currentLayout = computeCanvasLayout({
    designWidth: project.width,
    designHeight: project.height,
    viewportWidth: stageHost.clientWidth,
    viewportHeight: stageHost.clientHeight
  });

  createSceneCameraController({
    stageHost,
    viewportRoot,
    designWidth: project.width,
    designHeight: project.height,
    controlPanel: panel,
    getLayoutScale: () => currentLayout.scale
  });

  const applyLayout = () => {
    currentLayout = computeCanvasLayout({
      designWidth: project.width,
      designHeight: project.height,
      viewportWidth: stageHost.clientWidth,
      viewportHeight: stageHost.clientHeight
    });
    app.canvas.style.width = `${currentLayout.width}px`;
    app.canvas.style.height = `${currentLayout.height}px`;
    app.canvas.style.left = `${currentLayout.offsetX}px`;
    app.canvas.style.top = `${currentLayout.offsetY}px`;
  };

  panel.playButton.addEventListener("click", () => {
    player.play();
  });
  panel.stopButton.addEventListener("click", () => {
    player.stop();
  });
  panel.replayButton.addEventListener("click", () => {
    player.replay();
  });
  panel.loopCheckbox.addEventListener("change", () => {
    player.setLoop(panel.loopCheckbox.checked);
  });

  player.onTimeChange((time) => {
    panel.timeLabel.textContent = `${time.toFixed(2)}s / ${project.duration.toFixed(2)}s`;
  });
  player.onStateChange((playing) => {
    panel.statusLabel.textContent = playing ? "Playing sample export" : "Stopped";
  });

  window.addEventListener("resize", applyLayout);
  app.ticker.add((ticker) => {
    player.update(ticker.deltaMS / 1000);
  });

  applyLayout();
  player.play();
}

void bootstrap().catch((error) => {
  console.error("victoryani demo bootstrap failed", error);
});