import { Application } from "pixi.js";
import {
  animationRegistry,
  getAnimationEntry,
  getReadyAnimation,
} from "./animations/pixi/registry.js";
import type { PixiAnimationInstance } from "./animations/pixi/types.js";
import { createControlPanel } from "./ui/controls.js";
import "./styles.css";

async function bootstrap() {
  const mount = document.getElementById("app");
  if (!mount) {
    throw new Error("Missing #app root.");
  }

  const shell = document.createElement("main");
  shell.className = "app-shell";
  const stageFrame = document.createElement("section");
  stageFrame.className = "stage-frame";
  const stageHost = document.createElement("div");
  stageHost.className = "stage-host";
  stageFrame.appendChild(stageHost);

  const panel = createControlPanel(animationRegistry);
  shell.append(panel.root, stageFrame);
  mount.appendChild(shell);

  const app = new Application();
  await app.init({
    width: 1200,
    height: 600,
    antialias: true,
    background: "#07080d",
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  stageHost.appendChild(app.canvas);

  let current: PixiAnimationInstance | null = null;

  const fitCanvas = () => {
    const width = stageHost.clientWidth;
    const height = stageHost.clientHeight;
    const scale = Math.min(width / 1200, height / 600);
    app.canvas.style.width = `${1200 * scale}px`;
    app.canvas.style.height = `${600 * scale}px`;
  };

  const loadSelected = async () => {
    const entry = getAnimationEntry(panel.select.value);
    if (!entry || entry.status !== "ready") {
      panel.status.textContent = "该动画尚未转换为 Pixi TypeScript。";
      return;
    }

    const ready = getReadyAnimation(entry.id);
    if (!ready?.module) {
      panel.status.textContent = "该动画尚未转换为 Pixi TypeScript。";
      return;
    }

    panel.status.textContent = "加载中";
    current?.destroy();
    current = await ready.module.create(app);
    current.setLoop(panel.loop.checked);
    app.stage.removeChildren();
    app.stage.addChild(current.root);
    panel.title.textContent = `${ready.label} / ${ready.module.duration.toFixed(1)}s`;
    panel.status.textContent = "已加载 bg，可播放、暂停、重播。";
  };

  panel.select.addEventListener("change", () => void loadSelected());
  panel.play.addEventListener("click", () => current?.play());
  panel.pause.addEventListener("click", () => current?.pause());
  panel.replay.addEventListener("click", () => current?.replay());
  panel.loop.addEventListener("change", () =>
    current?.setLoop(panel.loop.checked),
  );
  window.addEventListener("resize", fitCanvas);

  fitCanvas();
  await loadSelected();
}

void bootstrap();
