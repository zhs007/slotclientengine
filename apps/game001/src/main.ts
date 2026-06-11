import { Application, Assets, Sprite, Text, type Texture } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import compositeManifest from "../../../assets/symbols/symbol-composites.json";
import backgroundUrl from "../../../assets/game001/bk.jpg?url";
import logoUrl from "../../../assets/game001/logo.png?url";
import mainReelsBackgroundUrl from "../../../assets/game001/reels1bk.png?url";
import secondaryReelsBackgroundUrl from "../../../assets/game001/reels2bk.png?url";
import {
  createGame001SymbolAssetMapFromModules,
  loadGame001SymbolTextures,
} from "./assets.js";
import { parseGame001Env } from "./env.js";
import { createGame001Client, type Game001Client } from "./game-client.js";
import {
  GAME_ASSET_SIZE,
  GAME_STAGE_SIZE,
  calculateGame001FrameScale,
  createGame001Layout,
} from "./game-layout.js";
import { createGame001ReelRuntime } from "./game-demo.js";
import { createGame001SpinButton } from "./spin-button.js";
import "./styles.css";

const rawSymbolAssetModules = import.meta.glob(
  "../../../assets/symbols/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  const frame = createPageFrame(root);
  const app = new Application();
  await app.init({
    width: GAME_STAGE_SIZE.width,
    height: GAME_STAGE_SIZE.height,
    antialias: true,
    autoDensity: false,
    resolution: 1,
  });
  frame.appendChild(app.canvas);

  const layout = createGame001Layout();
  const staticTextures = await loadStaticTextures();
  app.stage.addChild(
    createPositionedSprite(staticTextures.background, layout.background),
  );
  app.stage.addChild(createPositionedSprite(staticTextures.logo, layout.logo));
  app.stage.addChild(
    createPositionedSprite(
      staticTextures.mainReelsBackground,
      layout.mainReelsBackground,
    ),
  );

  const assetUrls = createGame001SymbolAssetMapFromModules({
    modules: rawSymbolAssetModules,
    stateTextureManifest,
    compositeManifest,
  });
  const symbolTextures = await loadGame001SymbolTextures(assetUrls);
  const runtime = createGame001ReelRuntime({
    rawGameConfig,
    symbolAssets: symbolTextures,
  });
  app.stage.addChild(runtime.mainReelsLayer);

  app.stage.addChild(
    createPositionedSprite(
      staticTextures.secondaryReelsBackground,
      layout.secondaryReelsBackground,
    ),
  );

  const statusText = createStatusText();
  let client: Game001Client | null = null;
  const spinButton = createGame001SpinButton({
    x: layout.spinButton.x,
    y: layout.spinButton.y,
    onSpin: async () => {
      if (!client) {
        setStatus(statusText, "ERROR: LIVE CLIENT IS NOT READY");
        throw new Error("game001 live client is not ready.");
      }
      setStatus(statusText, "REQUESTING LIVE SPIN");
      const spinResult = await client.spin();
      runtime.spinToScene(spinResult.scene);
      spinButton.setState("spinning");
      setStatus(statusText, `SPINNING: TOTALWIN ${spinResult.totalwin}`);
    },
  });
  app.stage.addChild(statusText, spinButton);

  try {
    const config = parseGame001Env(import.meta.env);
    client = createGame001Client(config);
    setStatus(statusText, "CONNECTING LIVE SERVER");
    const initialState = await client.connect();
    if (initialState.defaultScene) {
      runtime.applyScene(initialState.defaultScene, "live defaultScene");
      setStatus(statusText, "READY: LIVE DEFAULT SCENE");
    } else {
      setStatus(statusText, "READY: NO LIVE DEFAULT SCENE");
    }
    spinButton.setState("ready");
  } catch (error) {
    spinButton.setState("error");
    setStatus(statusText, `ERROR: ${formatError(error)}`);
  }

  app.ticker.add((ticker) => {
    try {
      if (!runtime.isSpinning()) {
        return;
      }
      const result = runtime.update(ticker.deltaMS / 1000);
      if (result.completed) {
        spinButton.setState("ready");
        setStatus(statusText, "READY");
      }
    } catch (error) {
      spinButton.setState("error");
      setStatus(statusText, `ERROR: ${formatError(error)}`);
      app.ticker.stop();
    }
  });

  window.addEventListener("beforeunload", () => {
    client?.disconnect();
    app.destroy();
  });
}

function createPageFrame(root: HTMLElement): HTMLElement {
  root.replaceChildren();
  const page = document.createElement("main");
  page.className = "game001-page";
  const frame = document.createElement("div");
  frame.className = "game001-frame";
  page.appendChild(frame);
  root.appendChild(page);
  syncFrameScale(frame);
  window.addEventListener("resize", () => syncFrameScale(frame));
  return frame;
}

function syncFrameScale(frame: HTMLElement): void {
  frame.style.setProperty(
    "--game001-scale",
    String(calculateGame001FrameScale(window.innerWidth, window.innerHeight)),
  );
}

async function loadStaticTextures(): Promise<{
  readonly background: Texture;
  readonly logo: Texture;
  readonly mainReelsBackground: Texture;
  readonly secondaryReelsBackground: Texture;
}> {
  const [background, logo, mainReelsBackground, secondaryReelsBackground] =
    await Promise.all([
      loadTextureWithSize("bk.jpg", backgroundUrl, GAME_ASSET_SIZE.background),
      loadTextureWithSize("logo.png", logoUrl, GAME_ASSET_SIZE.logo),
      loadTextureWithSize(
        "reels1bk.png",
        mainReelsBackgroundUrl,
        GAME_ASSET_SIZE.mainReelsBackground,
      ),
      loadTextureWithSize(
        "reels2bk.png",
        secondaryReelsBackgroundUrl,
        GAME_ASSET_SIZE.secondaryReelsBackground,
      ),
    ]);
  return Object.freeze({
    background,
    logo,
    mainReelsBackground,
    secondaryReelsBackground,
  });
}

async function loadTextureWithSize(
  label: string,
  url: string,
  expected: { readonly width: number; readonly height: number },
): Promise<Texture> {
  const texture = await Assets.load<Texture>(url);
  const width =
    texture.width || texture.source?.width || texture.orig?.width || 0;
  const height =
    texture.height || texture.source?.height || texture.orig?.height || 0;
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `${label} size must be ${expected.width} x ${expected.height}, got ${width} x ${height}.`,
    );
  }
  return texture;
}

function createPositionedSprite(
  texture: Texture,
  point: { readonly x: number; readonly y: number },
): Sprite {
  const sprite = new Sprite(texture);
  sprite.x = point.x;
  sprite.y = point.y;
  return sprite;
}

function createStatusText(): Text {
  const status = new Text({
    text: "LOADING",
    style: {
      fontFamily: "Arial, sans-serif",
      fontSize: 20,
      fontWeight: "700",
      fill: 0xffffff,
      align: "center",
      wordWrap: true,
      wordWrapWidth: 820,
    },
  });
  status.anchor.set(0.5);
  status.x = GAME_STAGE_SIZE.width / 2;
  status.y = 1495;
  return status;
}

function setStatus(status: Text, value: string): void {
  status.text = value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

bootstrap().catch((error) => {
  const root = document.getElementById("app");
  if (root) {
    root.textContent = formatError(error);
  }
  throw error;
});
