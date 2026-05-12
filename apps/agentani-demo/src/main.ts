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
    player.resetViewport();
    panel.statusLabel.textContent = "已加载，可拖动画面移动，滚轮缩放。";
  };

  const toStagePoint = (event: PointerEvent | WheelEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const scaleX = app.screen.width / rect.width;
    const scaleY = app.screen.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
      scaleX,
      scaleY,
    };
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

  let dragState: {
    pointerId: number;
    clientX: number;
    clientY: number;
  } | null = null;

  app.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    app.canvas.setPointerCapture(event.pointerId);
    app.canvas.classList.add("is-dragging");
  });

  app.canvas.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const point = toStagePoint(event);
    player.panBy(
      (event.clientX - dragState.clientX) * point.scaleX,
      (event.clientY - dragState.clientY) * point.scaleY,
    );
    dragState.clientX = event.clientX;
    dragState.clientY = event.clientY;
  });

  const stopDrag = (event: PointerEvent) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragState = null;
    app.canvas.classList.remove("is-dragging");
    if (app.canvas.hasPointerCapture(event.pointerId)) {
      app.canvas.releasePointerCapture(event.pointerId);
    }
  };

  app.canvas.addEventListener("pointerup", stopDrag);
  app.canvas.addEventListener("pointercancel", stopDrag);
  app.canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const point = toStagePoint(event);
    const factor = Math.exp(-event.deltaY * 0.001);
    player.zoomAt(point.x, point.y, factor);
  });

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
