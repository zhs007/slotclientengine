import { createGameConfig } from "@slotclientengine/gameframeworks";
import { createGame002Adapter } from "./game-adapter.js";
import {
  GAME002_CRAVE_RESOURCE_ID_PREFIX,
  createGame002LoadingResources,
  readGame002CravePackageFiles,
} from "./loading-resources.js";
import { parseGame002SkinQuery } from "./skin-id.js";
import { prepareGame002SkinConfig } from "./skin-config.js";

declare global {
  interface Window {
    __game002VisualFixture?: Readonly<{
      ready: boolean;
      skin: string;
      scene: readonly (readonly number[])[];
      destroy(): Promise<void>;
    }>;
  }
}

const root = requireElement("app");
const status = requireElement("status");

void start().catch((error: unknown) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  status.textContent = failure.stack ?? failure.message;
  console.error(failure);
});

async function start(): Promise<void> {
  const skinId = parseGame002SkinQuery(window.location.search);
  const loadedResources =
    skinId === "2" ? await loadCravePackageResources() : new Map();
  const prepared = await prepareGame002SkinConfig(
    skinId,
    skinId === "2"
      ? { craveFiles: readGame002CravePackageFiles(loadedResources) }
      : {},
  );
  const gameConfig = createGameConfig(prepared.skin.rawGameConfig);
  const reels = gameConfig.getReels(prepared.skin.reelsName);
  const scene = Object.freeze(
    Array.from({ length: reels.getReelCount() }, (_, x) =>
      Object.freeze(Array.from({ length: 9 }, (_, y) => reels.get(x, y))),
    ),
  );
  const adapter = createGame002Adapter({ skin: prepared.skin });
  try {
    const frameDesignSize = readFrameSize();
    await adapter.mount!({
      frame: document.createElement("div"),
      gameLayer: root,
      overlay: document.createElement("div"),
      getState: () => ({
        connected: true,
        spinState: "idle",
        balance: 0,
        win: 0,
        betIndex: 0,
        betOption: { bet: 5, lines: 30, times: 1 },
        muted: false,
        fastMode: false,
        autoMode: false,
        error: null,
      }),
      getViewport: () => ({
        pageSize: frameDesignSize,
        frameDesignSize,
        scale: 1,
        cssSize: frameDesignSize,
        offsetX: 0,
        offsetY: 0,
      }),
      onViewportChange: () => () => undefined,
    });
    adapter.applyInitialState!({
      userInfo: {},
      balance: 0,
      defaultScene: scene,
    });
    status.textContent = `ready skin=${skinId} ${frameDesignSize.width}x${frameDesignSize.height}`;
    window.__game002VisualFixture = Object.freeze({
      ready: true,
      skin: skinId,
      scene,
      async destroy(): Promise<void> {
        adapter.destroy?.();
        await prepared.valuePresentationResourceBundle.destroy();
      },
    });
  } catch (error) {
    adapter.destroy?.();
    await prepared.valuePresentationResourceBundle.destroy();
    throw error;
  }
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`game002 visual fixture #${id} is missing.`);
  }
  return element;
}

async function loadCravePackageResources(): Promise<
  ReadonlyMap<string, unknown>
> {
  const resources = createGame002LoadingResources("2").filter((resource) =>
    resource.id.startsWith(GAME002_CRAVE_RESOURCE_ID_PREFIX),
  );
  return new Map(
    await Promise.all(
      resources.map(async (resource) => {
        if (!resource.url) {
          throw new Error(
            `visual fixture resource "${resource.id}" has no URL.`,
          );
        }
        const response = await fetch(resource.url);
        if (!response.ok) {
          throw new Error(
            `visual fixture failed to load "${resource.id}": HTTP ${response.status}.`,
          );
        }
        return [resource.id, await response.arrayBuffer()] as const;
      }),
    ),
  );
}

function readFrameSize(): Readonly<{ width: number; height: number }> {
  const params = new URLSearchParams(window.location.search);
  return Object.freeze({
    width: readPositiveNumber(params, "width", 1125),
    height: readPositiveNumber(params, "height", 2000),
  });
}

function readPositiveNumber(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
  return value;
}
