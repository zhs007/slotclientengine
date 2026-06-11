import { Application } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import { createStatefulReelAssetMapFromModules, loadReelSymbolTextures } from "./assets.js";
import { createReelsDemo } from "./reels-demo.js";
import { REELS_VIEWER_REQUIRED_STATE_TEXTURES } from "./reels-config.js";
import { bindReelsControls } from "./ui.js";
import "./styles.css";

const STAGE_WIDTH = 1180;
const STAGE_HEIGHT = 760;
const STAGE_PADDING = 44;

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  const shell = document.createElement("main");
  shell.className = "app-shell";
  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  const spinButton = createButton("Spin");
  spinButton.dataset.testid = "spin-button";
  const resetButton = createButton("Reset");
  resetButton.dataset.testid = "reset-button";
  const status = document.createElement("div");
  status.className = "status-line";
  status.dataset.testid = "reels-status";
  toolbar.append(spinButton, resetButton, status);

  const stageHost = document.createElement("section");
  stageHost.className = "stage-host";
  shell.append(toolbar, stageHost);
  root.appendChild(shell);

  const rawSymbolAssetModules = import.meta.glob("../../../assets/symbols/*.png", {
    eager: true,
    import: "default",
    query: "?url"
  }) as Record<string, string>;
  const assetUrls = createStatefulReelAssetMapFromModules({
    modules: rawSymbolAssetModules,
    manifest: stateTextureManifest,
    requiredStates: REELS_VIEWER_REQUIRED_STATE_TEXTURES
  });
  const textures = await loadReelSymbolTextures(assetUrls);
  const demo = createReelsDemo({
    rawGameConfig,
    symbolAssets: textures
  });

  const app = new Application();
  await app.init({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    antialias: true,
    background: "#10131b",
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });
  stageHost.appendChild(app.canvas);
  app.stage.addChild(demo.reelSet);
  fitReelSet(demo);

  const controls = bindReelsControls({
    spinButton,
    resetButton,
    status,
    demo
  });

  app.ticker.add((ticker) => {
    demo.update(ticker.deltaMS / 1000);
    controls.sync();
  });
}

function fitReelSet(demo: ReturnType<typeof createReelsDemo>): void {
  const firstReel = demo.reelSet.reels[0];
  const layout = firstReel.layout;
  const contentWidth = layout.reelCount * layout.cellWidth + (layout.reelCount - 1) * layout.columnGap;
  const contentHeight = layout.visibleRows * layout.cellHeight;
  const scale = Math.min(
    1,
    (STAGE_WIDTH - STAGE_PADDING * 2) / contentWidth,
    (STAGE_HEIGHT - STAGE_PADDING * 2) / contentHeight
  );
  demo.reelSet.scale.set(scale);
  demo.reelSet.x = (STAGE_WIDTH - contentWidth * scale) / 2;
  demo.reelSet.y = (STAGE_HEIGHT - contentHeight * scale) / 2;
}

function createButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}

bootstrap().catch((error) => {
  const root = document.getElementById("app");
  if (root) {
    root.textContent = error instanceof Error ? error.message : String(error);
  }
  throw error;
});
