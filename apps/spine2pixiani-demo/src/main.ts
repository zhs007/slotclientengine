import { Application, Assets, Container } from "pixi.js";
import { cabinAnimationData, cabinAnimationNames } from "./data/cabin-animation-data.js";
import { cabinAtlasText } from "./data/cabin-atlas.js";
import cabinAtlasImageUrl from "./assets/cabin.png";
import { computeCanvasLayout } from "./layout.js";
import { loadAtlasTextures } from "./runtime/atlas.js";
import { CabinAnimationEntity } from "./ani/cabin/cabin-animation.js";
import { createAnimationSelect } from "./ui/animation-select.js";
import "./styles.css";

async function bootstrap() {
  const designWidth = 1280;
  const designHeight = 900;

  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing #app container");
  }

  const shell = document.createElement("main");
  shell.className = "shell";

  const controls = createAnimationSelect(cabinAnimationNames);
  const stageShell = document.createElement("section");
  stageShell.className = "stage-shell";

  const stageHost = document.createElement("div");
  stageHost.className = "stage";
  stageShell.appendChild(stageHost);

  shell.append(controls.root, stageShell);
  appRoot.appendChild(shell);

  await Assets.init({});

  const app = new Application();
  await app.init({
    width: designWidth,
    height: designHeight,
    antialias: true,
    background: "#081019"
  });
  stageHost.appendChild(app.canvas);

  const stageRoot = new Container();
  app.stage.addChild(stageRoot);

  const textures = await loadAtlasTextures(cabinAtlasText, cabinAtlasImageUrl);
  const cabinEntity = new CabinAnimationEntity(cabinAnimationData, textures);
  stageRoot.addChild(cabinEntity);

  const skeletonScale = Math.min(
    (designWidth * 0.72) / cabinAnimationData.skeleton.width,
    (designHeight * 0.82) / cabinAnimationData.skeleton.height
  );
  cabinEntity.position.set(designWidth * 0.52, designHeight * 0.84);
  cabinEntity.scale.set(skeletonScale, skeletonScale);
  cabinEntity.play("cabin");

  function applyLayout() {
    const layout = computeCanvasLayout({
      designWidth,
      designHeight,
      viewportWidth: stageHost.clientWidth,
      viewportHeight: stageHost.clientHeight
    });
    app.canvas.style.width = `${layout.width}px`;
    app.canvas.style.height = `${layout.height}px`;
    app.canvas.style.left = `${layout.offsetX}px`;
    app.canvas.style.top = `${layout.offsetY}px`;
  }

  controls.select.value = "cabin";
  controls.select.addEventListener("change", () => {
    cabinEntity.play(controls.select.value);
  });
  controls.replayButton.addEventListener("click", () => {
    cabinEntity.replay();
  });
  controls.loopCheckbox.addEventListener("change", () => {
    cabinEntity.setLoop(controls.loopCheckbox.checked);
  });

  app.ticker.add((ticker) => {
    cabinEntity.update(ticker.deltaMS / 1000);
  });

  applyLayout();
  window.addEventListener("resize", applyLayout);
}

void bootstrap().catch((error) => {
  console.error("spine2pixiani demo bootstrap failed", error);
});