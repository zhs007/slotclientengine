import { Application, Assets, Container, Text, type Texture } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createNamedSymbolAnimationResolver,
  createSymbolCatalog,
  SymbolStateSequenceController,
  type RenderSymbol,
  type SymbolAssetInput,
  type SymbolAssetMap,
  type SymbolNormalTextureSource,
  type SymbolSequenceStep,
  type SymbolStateId,
  type SymbolTextureSet
} from "@slotclientengine/rendercore";
import { createGameConfig } from "@slotclientengine/logiccore";
import {
  createStatefulSymbolAssetMapFromModules,
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
} from "./symbol-assets.js";
import { SYMBOL_VIEWER_ANIMATION_PROFILES } from "./symbol-animation-config.js";
import { DEFAULT_VIEWER_SEQUENCE, VIEWER_STATE_ORDER } from "./viewer-sequence.js";
import "./styles.css";

const STAGE_WIDTH = 1080;
const STAGE_HEIGHT = 520;
const SYMBOL_CELL_WIDTH = 184;
const SYMBOL_Y = 250;

interface RenderedViewerSymbol {
  readonly renderSymbol: RenderSymbol;
  readonly label: Text;
}

interface SequenceDom {
  readonly list: HTMLElement;
  readonly addSelect: HTMLSelectElement;
  readonly addButton: HTMLButtonElement;
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Missing #app root.");
  }

  const statePreset = createDefaultSymbolStatePreset();
  const rawSymbolAssetModules = import.meta.glob("../../../assets/symbols/*.png", {
    eager: true,
    import: "default",
    query: "?url"
  }) as Record<string, string>;
  const symbolAssetUrls = createStatefulSymbolAssetMapFromModules({
    modules: rawSymbolAssetModules,
    manifest: stateTextureManifest,
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
  });
  const textures = await loadSymbolTextures(symbolAssetUrls);
  const catalog = createSymbolCatalog({
    gameConfig: createGameConfig(rawGameConfig),
    assets: textures,
    statePreset,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: SYMBOL_VIEWER_ANIMATION_PROFILES,
      fallback: createDefaultSymbolAnimationResolver()
    }),
    texturePolicy: {
      requiredStateTextures: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
    }
  });
  const validation = catalog.getValidation();

  const shell = document.createElement("main");
  shell.className = "app-shell";

  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  const playButton = createButton("Pause");
  playButton.dataset.testid = "play-toggle";
  const nextButton = createButton("Next");
  nextButton.dataset.testid = "next-state";
  const resetButton = createButton("Reset");
  resetButton.dataset.testid = "reset-sequence";
  const defaultStateSelect = createSelect(
    statePreset.states.filter((state) => state.phase === "stable").map((state) => state.id)
  );
  defaultStateSelect.dataset.testid = "default-state";
  toolbar.append(playButton, nextButton, resetButton, createLabel("Default", defaultStateSelect));

  const body = document.createElement("section");
  body.className = "viewer-body";
  const stageHost = document.createElement("div");
  stageHost.className = "stage-host";
  const sidePanel = document.createElement("aside");
  sidePanel.className = "side-panel";

  const sequenceDom = createSequenceDom([...DEFAULT_VIEWER_SEQUENCE]);
  const statusPanel = document.createElement("div");
  statusPanel.className = "status-panel";
  statusPanel.dataset.testid = "status-panel";
  sidePanel.append(sequenceDom.list, sequenceDom.addSelect, sequenceDom.addButton, statusPanel);
  body.append(stageHost, sidePanel);
  shell.append(toolbar, body);
  root.appendChild(shell);

  const app = new Application();
  await app.init({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    antialias: true,
    background: "#12141d",
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });
  stageHost.appendChild(app.canvas);

  const symbolsRoot = new Container();
  app.stage.addChild(symbolsRoot);
  const renderedSymbols = createRenderedSymbols(catalog, validation.displayableSymbols, symbolsRoot);
  let sequenceController = new SymbolStateSequenceController({
    statePreset,
    steps: DEFAULT_VIEWER_SEQUENCE,
    autoplay: true
  });

  const broadcastState = (state: SymbolStateId) => {
    for (const item of renderedSymbols) {
      item.renderSymbol.requestState(state);
    }
  };

  const syncSequenceDom = () => {
    const currentSteps = sequenceController.getSteps();
    sequenceDom.list.replaceChildren(...createSequenceStepRows(currentSteps, sequenceController));
  };

  const rebuildSequence = (steps: readonly SymbolSequenceStep[]) => {
    const wasPlaying = sequenceController.isPlaying();
    sequenceController = new SymbolStateSequenceController({
      statePreset,
      steps,
      autoplay: wasPlaying
    });
    if (!wasPlaying) {
      sequenceController.pause();
    }
    syncSequenceDom();
    broadcastState(sequenceController.getCurrentStep().state);
  };

  sequenceDom.addButton.addEventListener("click", () => {
    rebuildSequence([...sequenceController.getSteps(), { state: sequenceDom.addSelect.value }]);
  });
  playButton.addEventListener("click", () => {
    if (sequenceController.isPlaying()) {
      sequenceController.pause();
      playButton.textContent = "Play";
    } else {
      sequenceController.play();
      playButton.textContent = "Pause";
    }
  });
  nextButton.addEventListener("click", () => {
    const step = sequenceController.next();
    broadcastState(step.state);
    syncSequenceDom();
  });
  resetButton.addEventListener("click", () => {
    sequenceController.reset();
    for (const item of renderedSymbols) {
      item.renderSymbol.reset();
    }
    broadcastState(sequenceController.getCurrentStep().state);
    syncSequenceDom();
  });
  defaultStateSelect.addEventListener("change", () => {
    for (const item of renderedSymbols) {
      item.renderSymbol.setDefaultState(defaultStateSelect.value);
    }
  });

  function createSequenceStepRows(
    steps: readonly SymbolSequenceStep[],
    controller: SymbolStateSequenceController
  ): HTMLElement[] {
    return steps.map((step, index) => {
      const row = document.createElement("div");
      row.className = index === controller.getCurrentIndex() ? "sequence-row is-current" : "sequence-row";
      row.dataset.testid = `sequence-row-${index}`;
      const stateSelect = createSelect([...VIEWER_STATE_ORDER], step.state);
      stateSelect.dataset.testid = `sequence-state-${index}`;
      const holdInput = document.createElement("input");
      holdInput.type = "number";
      holdInput.step = "0.1";
      holdInput.min = "0";
      holdInput.value = String(step.holdSeconds ?? 0);
      holdInput.disabled = statePreset.states.find((state) => state.id === step.state)?.phase === "once";
      holdInput.dataset.testid = `sequence-hold-${index}`;
      const upButton = createButton("Up");
      upButton.dataset.testid = `sequence-up-${index}`;
      const downButton = createButton("Down");
      downButton.dataset.testid = `sequence-down-${index}`;
      const removeButton = createButton("Remove");
      removeButton.dataset.testid = `sequence-remove-${index}`;

      stateSelect.addEventListener("change", () => {
        const nextStep = normalizeViewerStep(stateSelect.value, Number.parseFloat(holdInput.value));
        const nextSteps = controller.getSteps().map((current, currentIndex) =>
          currentIndex === index ? nextStep : current
        );
        rebuildSequence(nextSteps);
      });
      holdInput.addEventListener("change", () => {
        const nextStep = normalizeViewerStep(stateSelect.value, Number.parseFloat(holdInput.value));
        const nextSteps = controller.getSteps().map((current, currentIndex) =>
          currentIndex === index ? nextStep : current
        );
        rebuildSequence(nextSteps);
      });
      upButton.addEventListener("click", () => {
        if (index > 0) {
          const nextSteps = [...controller.getSteps()];
          const [moving] = nextSteps.splice(index, 1);
          nextSteps.splice(index - 1, 0, moving);
          rebuildSequence(nextSteps);
        }
      });
      downButton.addEventListener("click", () => {
        if (index < controller.getSteps().length - 1) {
          const nextSteps = [...controller.getSteps()];
          const [moving] = nextSteps.splice(index, 1);
          nextSteps.splice(index + 1, 0, moving);
          rebuildSequence(nextSteps);
        }
      });
      removeButton.addEventListener("click", () => {
        if (controller.getSteps().length > 1) {
          rebuildSequence(controller.getSteps().filter((_current, currentIndex) => currentIndex !== index));
        }
      });
      row.append(stateSelect, holdInput, upButton, downButton, removeButton);
      return row;
    });
  }

  function updateStatusPanel(): void {
    const currentStep = sequenceController.getCurrentStep();
    const lines = renderedSymbols.map((item) => {
      const snapshot = item.renderSymbol.getStateSnapshot();
      return `${item.renderSymbol.symbol}: ${snapshot.requestedState} -> ${snapshot.resolvedState} / ${snapshot.defaultState}${snapshot.pendingState ? ` / ${snapshot.pendingState}` : ""}`;
    });
    statusPanel.replaceChildren(
      createStatusLine(`Index ${sequenceController.getCurrentIndex()} · ${currentStep.state}`),
      createStatusLine(sequenceController.isPlaying() ? "Playing" : "Paused"),
      ...lines.map(createStatusLine)
    );
  }

  let elapsedSincePanelUpdate = 0;
  broadcastState(sequenceController.getCurrentStep().state);
  syncSequenceDom();
  updateStatusPanel();

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaMS / 1000;
    const currentStep = sequenceController.getCurrentStep();
    const currentState = statePreset.states.find((state) => state.id === currentStep.state);
    const results = renderedSymbols.map((item) => item.renderSymbol.update(deltaSeconds));
    const onceCompleted =
      currentState?.phase === "once" &&
      results.length > 0 &&
      results.every((result) => result.onceCompleted || result.requestedState !== currentStep.state);
    const sequenceResult = sequenceController.update({
      deltaSeconds,
      onceCompleted
    });
    if (sequenceResult.shouldRequestState) {
      broadcastState(sequenceResult.state);
      syncSequenceDom();
    }

    elapsedSincePanelUpdate += deltaSeconds;
    if (elapsedSincePanelUpdate >= 0.1) {
      elapsedSincePanelUpdate = 0;
      updateStatusPanel();
    }
  });
}

async function loadSymbolTextures(symbolAssetUrls: SymbolAssetMap): Promise<SymbolAssetMap> {
  const entries = await Promise.all(
    Object.entries(symbolAssetUrls).map(async ([symbol, asset]) => {
      return [symbol, await loadSymbolAssetInput(asset)] as const;
    })
  );
  return Object.freeze(Object.fromEntries(entries));
}

async function loadSymbolAssetInput(asset: SymbolAssetInput): Promise<SymbolAssetInput> {
  if (isSymbolTextureSet(asset)) {
    const stateEntries = await Promise.all(
      Object.entries(asset.states ?? {})
        .filter((entry): entry is [string, Texture | string] => entry[1] !== undefined)
        .map(async ([state, urlOrTexture]) => {
          return [state, await loadTexture(urlOrTexture)] as const;
        })
    );
    return Object.freeze({
      normal: await loadNormalTextureSource(asset.normal),
      states: Object.freeze(Object.fromEntries(stateEntries))
    });
  }

  return loadTexture(asset);
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"]
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: await loadTexture(normal.texture)
      });
    }
    const layers = await Promise.all(
      normal.layers.map(async (layer) =>
        Object.freeze({
          index: layer.index,
          texture: await loadTexture(layer.texture)
        })
      )
    );
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(layers)
    });
  }

  return loadTexture(normal);
}

async function loadTexture(texture: Texture | string): Promise<Texture> {
  if (typeof texture === "string") {
    return Assets.load<Texture>(texture);
  }
  return texture;
}

function isSymbolTextureSet(asset: SymbolAssetInput): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: SymbolTextureSet["normal"]
): normal is SymbolNormalTextureSource<Texture | string> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" || normal.kind === "layered")
  );
}

function createRenderedSymbols(
  catalog: ReturnType<typeof createSymbolCatalog>,
  symbols: readonly string[],
  root: Container
): RenderedViewerSymbol[] {
  const startX = STAGE_WIDTH / 2 - ((symbols.length - 1) * SYMBOL_CELL_WIDTH) / 2;
  return symbols.map((symbol, index) => {
    const renderSymbol = catalog.createRenderSymbol(symbol);
    const scale = Math.min(1, 126 / getRenderSymbolMaxTextureSize(renderSymbol));
    renderSymbol.position.set(startX + SYMBOL_CELL_WIDTH * index, SYMBOL_Y);
    renderSymbol.scale.set(scale);

    const label = new Text({
      text: symbol,
      style: {
        fill: "#f8fafc",
        fontSize: 18,
        fontFamily: "Inter, Arial, sans-serif",
        fontWeight: "700"
      }
    });
    label.anchor.set(0.5);
    label.position.set(renderSymbol.x, SYMBOL_Y + 112);

    root.addChild(renderSymbol, label);
    return { renderSymbol, label };
  });
}

function getRenderSymbolMaxTextureSize(renderSymbol: RenderSymbol): number {
  return Math.max(
    1,
    ...renderSymbol
      .getLayerSprites()
      .map((layer) => Math.max(layer.texture.width || 1, layer.texture.height || 1))
  );
}

function createSequenceDom(steps: readonly SymbolSequenceStep[]): SequenceDom {
  const list = document.createElement("div");
  list.className = "sequence-list";
  list.dataset.testid = "sequence-list";
  const addSelect = createSelect([...VIEWER_STATE_ORDER]);
  addSelect.dataset.testid = "sequence-add-select";
  const addButton = createButton("Add");
  addButton.dataset.testid = "sequence-add";
  addSelect.value = steps.at(-1)?.state ?? VIEWER_STATE_ORDER[0];
  return { list, addSelect, addButton };
}

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  return button;
}

function createSelect(values: readonly string[], selected = values[0]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  select.value = selected;
  return select;
}

function createLabel(label: string, control: HTMLElement): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "control-label";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function createStatusLine(text: string): HTMLElement {
  const line = document.createElement("div");
  line.className = "status-line";
  line.textContent = text;
  return line;
}

function normalizeViewerStep(state: string, holdSeconds: number): SymbolSequenceStep {
  if (state === "appear" || state === "win") {
    return Object.freeze({ state });
  }
  return Object.freeze({
    state,
    holdSeconds: Number.isFinite(holdSeconds) && holdSeconds >= 0 ? holdSeconds : 0.5
  });
}

void bootstrap().catch((error) => {
  console.error("symbolsviewer bootstrap failed", error);
});
