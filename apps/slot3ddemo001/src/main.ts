import { createRandomScene, formatScene } from "./scene-data.js";
import { MegalithWallRenderer } from "./scene.js";
import { loadMegalithSymbolLibrary } from "./symbol.js";
import { MegalithOverlayUi } from "./ui.js";
import "./styles.css";

async function bootstrap(): Promise<void> {
  const appRoot = document.getElementById("app");
  if (!appRoot) throw new Error("Missing #app root.");

  const stage = document.createElement("main");
  stage.className = "megalith-stage";
  appRoot.replaceChildren(stage);

  const ui = new MegalithOverlayUi();
  let wall: MegalithWallRenderer | null = null;
  let destroyed = false;

  const startRandomDrop = () => {
    if (!wall || destroyed) return;
    const randomScene = createRandomScene();
    ui.setScene(formatScene(randomScene));
    ui.setStatus("THE WALL IS FALLING");
    ui.setEnabled(false);
    wall.startDrop(randomScene, {
      onImpact: (settled, total) => {
        ui.setStatus(
          `IMPACT ${settled.toString().padStart(2, "0")} / ${total}`,
        );
      },
      onComplete: () => {
        ui.setStatus("WALL COMPLETE");
        ui.setEnabled(true);
      },
    });
  };

  await ui.init(stage, startRandomDrop);
  ui.setStatus("LOADING 4K MEGALITHS");
  const symbols = await loadMegalithSymbolLibrary();
  if (destroyed) {
    symbols.dispose();
    return;
  }
  wall = new MegalithWallRenderer(stage, symbols);

  const resize = () => {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    wall?.resize(width, height);
    ui.resize(width, height);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();
  startRandomDrop();

  window.addEventListener(
    "beforeunload",
    () => {
      destroyed = true;
      resizeObserver.disconnect();
      wall?.destroy();
      symbols.dispose();
      ui.destroy();
    },
    { once: true },
  );
}

void bootstrap().catch((error) => {
  console.error("slot3ddemo001 bootstrap failed", error);
  const root = document.getElementById("app");
  if (root) {
    const message = document.createElement("pre");
    message.className = "fatal-error";
    message.textContent =
      error instanceof Error ? error.message : String(error);
    root.replaceChildren(message);
  }
});
