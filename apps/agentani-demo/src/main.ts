import { Application } from "pixi.js";
import { animationRegistry, getReadyAnimation } from "./animations/registry.js";
import { AgentAnimationPlayer } from "./runtime/player.js";
import { createControlPanel } from "./ui/controls.js";
import "./styles.css";

async function bootstrap() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const stageShell = document.createElement("section");
  stageShell.className = "stage-shell";
  const stageHost = document.createElement("div");
  stageHost.className = "stage-host";
  stageShell.appendChild(stageHost);

  const panel = createControlPanel(animationRegistry);
  shell.append(panel.root, stageShell);
  root.appendChild(shell);

  const app = new Application();
  await app.init({
    width: 1200,
    height: 600,
    antialias: true,
    background: "#08090d",
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  stageHost.appendChild(app.canvas);

  const player = new AgentAnimationPlayer(app);

  const loadSelected = async () => {
    const entry = getReadyAnimation(panel.select.value);
    if (!entry) {
      panel.statusLabel.textContent = "该动画尚未转换为 TypeScript 代码。";
      return;
    }
    panel.title.textContent = `${entry.label} / ${entry.project.duration.toFixed(1)}s`;
    panel.statusLabel.textContent = "加载中";
    await player.load(entry.project);
    panel.statusLabel.textContent = "已加载，可播放、暂停或重播。";
  };

  const applyLayout = () => {
    const width = stageHost.clientWidth;
    const height = stageHost.clientHeight;
    const scale = Math.min(width / 1200, height / 600);
    const canvasWidth = 1200 * scale;
    const canvasHeight = 600 * scale;
    app.canvas.style.width = `${canvasWidth}px`;
    app.canvas.style.height = `${canvasHeight}px`;
    app.canvas.style.left = `${(width - canvasWidth) / 2}px`;
    app.canvas.style.top = `${(height - canvasHeight) / 2}px`;
  };

  panel.select.addEventListener("change", () => {
    void loadSelected();
  });
  panel.playButton.addEventListener("click", () => player.play());
  panel.pauseButton.addEventListener("click", () => player.pause());
  panel.replayButton.addEventListener("click", () => player.replay());
  panel.loopCheckbox.addEventListener("change", () => {
    player.setLoop(panel.loopCheckbox.checked);
  });
  window.addEventListener("resize", applyLayout);

  applyLayout();
  await loadSelected();
}

void bootstrap().catch((error) => {
  console.error("agentani demo bootstrap failed", error);
});
