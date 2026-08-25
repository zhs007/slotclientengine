import { Application } from "pixi.js";
import {
  createFateThreadScene,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
} from "./scene/fate-thread-scene.js";
import "./styles.css";

async function bootstrap(): Promise<void> {
  const mount = document.getElementById("app");
  if (!mount) {
    throw new Error("Missing #app container");
  }

  const shell = document.createElement("main");
  shell.className = "demo-shell";
  shell.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">PIXIJS · PROCEDURAL RIBBON STUDY</p>
        <h1>命运丝线 <span>Fate Thread</span></h1>
      </div>
      <div class="status"><i></i> VERLET SOLVER / LIVE</div>
    </header>
    <section class="stage-shell" aria-label="命运丝线交互演示">
      <div class="stage-host"></div>
      <div class="legend" aria-hidden="true">
        <span><b>06</b> DRAGGABLE ANCHORS</span>
        <span><b>60</b> DYNAMIC SEGMENTS</span>
        <span><b>03</b> RIBBON LAYERS</span>
      </div>
    </section>
    <footer class="toolbar">
      <p><strong>无物理引擎</strong><span>Verlet 积分 · 距离约束 · Mesh UV 流光</span></p>
      <div class="actions">
        <button type="button" data-action="pluck">拨动丝线</button>
        <button type="button" class="secondary" data-action="reset">重置节点</button>
      </div>
    </footer>
  `;
  mount.appendChild(shell);

  const stageHost = shell.querySelector<HTMLElement>(".stage-host");
  if (!stageHost) {
    throw new Error("Missing stage host");
  }

  const app = new Application();
  await app.init({
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    antialias: true,
    background: "#070713",
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  stageHost.appendChild(app.canvas);

  const scene = createFateThreadScene();
  app.stage.addChild(scene.root);
  app.ticker.add((ticker) => {
    scene.update(Math.min(ticker.deltaMS / 1000, 1 / 20));
  });

  shell
    .querySelector<HTMLButtonElement>('[data-action="pluck"]')
    ?.addEventListener("click", () => scene.pluck());
  shell
    .querySelector<HTMLButtonElement>('[data-action="reset"]')
    ?.addEventListener("click", () => scene.reset());
}

void bootstrap();
