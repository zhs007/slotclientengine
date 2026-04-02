import { Application, Container, Rectangle } from "pixi.js";
import { entityManager } from "./core/entitymanager.js";
import { computeCanvasLayout } from "./layout.js";

async function bootstrap() {
  const designResolution = {
    width: 800,
    height: 800
  } as const;
  const htmlElement = document.documentElement;
  htmlElement.style.margin = "0";
  htmlElement.style.padding = "0";
  htmlElement.style.height = "100%";
  htmlElement.style.overflow = "hidden";

  const bodyElement = document.body;
  bodyElement.style.margin = "0";
  bodyElement.style.padding = "0";
  bodyElement.style.width = "100vw";
  bodyElement.style.height = "100vh";
  bodyElement.style.backgroundColor = "#ffffff";
  bodyElement.style.display = "flex";
  bodyElement.style.justifyContent = "center";
  bodyElement.style.alignItems = "center";
  bodyElement.style.overflow = "hidden";
  const app = new Application();
  await app.init({
    width: designResolution.width,
    height: designResolution.height,
    background: "#000000"
  });

  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing #app container");
  }
  appRoot.style.position = "relative";
  appRoot.style.width = "100vw";
  appRoot.style.height = "100vh";
  appRoot.style.overflow = "hidden";
  appRoot.style.background = "#000000";
  appRoot.style.border = "0";
  appRoot.style.boxSizing = "border-box";
  appRoot.appendChild(app.canvas);

  app.canvas.style.position = "absolute";
  app.canvas.style.display = "block";

  const rootStage = new Container();
  rootStage.eventMode = "static";
  rootStage.hitArea = new Rectangle(0, 0, designResolution.width, designResolution.height);

  const groundLayer = new Container();
  const mainLayer = new Container();
  const topLayer = new Container();

  app.stage.addChild(rootStage);
  // Keep a simple three-layer structure by default.
  // Add real entities and resources only when the task requires them.
  rootStage.addChild(groundLayer, mainLayer, topLayer);

  function applyLayout() {
    const { width, height, offsetX, offsetY } = computeCanvasLayout({
      designWidth: designResolution.width,
      designHeight: designResolution.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    app.canvas.style.width = `${width}px`;
    app.canvas.style.height = `${height}px`;
    app.canvas.style.left = `${offsetX}px`;
    app.canvas.style.top = `${offsetY}px`;
  }

  applyLayout();
  window.addEventListener("resize", applyLayout);

  app.ticker.add((ticker) => {
    // The shared manager drives entity lifecycle and pooled cleanup.
    entityManager.update(ticker.deltaMS / 1000);
  });
}

void bootstrap().catch((error) => {
  console.error("Pixi bootstrap failed:", error);
});
