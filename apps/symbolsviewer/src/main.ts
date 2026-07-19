import { Application, Assets, Container, Text, type Texture } from "pixi.js";
import {
  createRenderSymbolValueController,
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolCatalog,
  SymbolStateSequenceController,
  type RenderSymbol,
  type SymbolAssetInput,
  type SymbolAssetMap,
  type SymbolCatalog,
  type SymbolCatalogValidation,
  type SymbolNormalTextureSource,
  type SymbolSequenceStep,
  type SymbolStateId,
  type SymbolStatePreset,
  type SymbolTextureSet,
} from "@slotclientengine/rendercore";
import { createGameConfig } from "@slotclientengine/logiccore";
import {
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerStandaloneCatalog,
} from "./symbol-assets.js";
import {
  getSymbolSetConfig,
  prepareSymbolSetConfig,
  resolveViewerStateForSymbol,
  SYMBOL_SET_CONFIGS,
  type SymbolSetConfig,
} from "./symbol-set-config.js";
import { createViewerStateOrder } from "./viewer-sequence.js";
import "./styles.css";

const STAGE_WIDTH = 860;
const STAGE_HEIGHT = 980;
const MAX_SYMBOL_COLUMNS = 6;
const STAGE_HORIZONTAL_PADDING = 50;
const STAGE_TOP_PADDING = 46;
const STAGE_BOTTOM_PADDING = 30;
const SYMBOL_LABEL_GAP = 16;
const MIN_SYMBOL_CELL_GAP = 24;

interface RenderedViewerSymbol {
  readonly symbol: string;
  readonly renderSymbol: RenderSymbol;
  readonly label: Text;
  readonly cellWidth: number;
  readonly cellHeight: number;
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

  let activeSymbolSet = getSymbolSetConfig(SYMBOL_SET_CONFIGS[0].id);
  let statePreset: SymbolStatePreset = activeSymbolSet.statePreset;
  const shell = document.createElement("main");
  shell.className = "app-shell";

  const toolbar = document.createElement("header");
  toolbar.className = "toolbar";
  const symbolSetSelect = createSelect(
    SYMBOL_SET_CONFIGS.map((config) => config.id),
  );
  symbolSetSelect.dataset.testid = "symbol-set";
  const playButton = createButton("Pause");
  playButton.dataset.testid = "play-toggle";
  const nextButton = createButton("Next");
  nextButton.dataset.testid = "next-state";
  const resetButton = createButton("Reset");
  resetButton.dataset.testid = "reset-sequence";
  const defaultStateSelect = createSelect(
    statePreset.states
      .filter((state) => state.phase === "stable")
      .map((state) => state.id),
  );
  defaultStateSelect.dataset.testid = "default-state";
  const valueSymbolSelect = createSelect([]);
  valueSymbolSelect.dataset.testid = "value-symbol";
  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.min = "1";
  valueInput.step = "1";
  valueInput.value = "25";
  valueInput.dataset.testid = "value-input";
  const applyValueButton = createButton("Apply Value");
  applyValueButton.dataset.testid = "apply-value";
  const clearValueButton = createButton("Clear Value");
  clearValueButton.dataset.testid = "clear-value";
  const valueControls = document.createElement("span");
  valueControls.className = "value-controls";
  valueControls.append(
    createLabel("Value Symbol", valueSymbolSelect),
    createLabel("Value", valueInput),
    applyValueButton,
    clearValueButton,
  );
  toolbar.append(
    createLabel("Set", symbolSetSelect),
    playButton,
    nextButton,
    resetButton,
    createLabel("Default", defaultStateSelect),
    valueControls,
  );

  const body = document.createElement("section");
  body.className = "viewer-body";
  const stageHost = document.createElement("div");
  stageHost.className = "stage-host";
  const sidePanel = document.createElement("aside");
  sidePanel.className = "side-panel";

  const sequenceDom = createSequenceDom(
    activeSymbolSet.defaultSequence,
    createViewerStateOrder(statePreset),
  );
  const statusPanel = document.createElement("div");
  statusPanel.className = "status-panel";
  statusPanel.dataset.testid = "status-panel";
  sidePanel.append(
    sequenceDom.list,
    sequenceDom.addSelect,
    sequenceDom.addButton,
    statusPanel,
  );
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
    resolution: window.devicePixelRatio || 1,
  });
  stageHost.appendChild(app.canvas);

  const symbolsRoot = new Container();
  app.stage.addChild(symbolsRoot);
  let renderedSymbols: RenderedViewerSymbol[] = [];
  let activeValidation: SymbolCatalogValidation | null = null;
  let activeValueSymbols: readonly string[] = [];
  let loadVersion = 0;
  let destroyActiveSymbolSetResources: (() => Promise<void>) | null = null;
  let sequenceController = new SymbolStateSequenceController({
    statePreset,
    steps: activeSymbolSet.defaultSequence,
    autoplay: true,
  });

  const broadcastState = (state: SymbolStateId) => {
    for (const item of renderedSymbols) {
      item.renderSymbol.requestState(
        resolveViewerStateForSymbol(
          activeSymbolSet,
          item.renderSymbol.symbol,
          state,
        ),
      );
    }
  };

  const syncSequenceDom = () => {
    const currentSteps = sequenceController.getSteps();
    sequenceDom.list.replaceChildren(
      ...createSequenceStepRows(currentSteps, sequenceController),
    );
  };

  const rebuildSequence = (steps: readonly SymbolSequenceStep[]) => {
    const wasPlaying = sequenceController.isPlaying();
    sequenceController = new SymbolStateSequenceController({
      statePreset,
      steps,
      autoplay: wasPlaying,
    });
    if (!wasPlaying) {
      sequenceController.pause();
    }
    syncSequenceDom();
    broadcastState(sequenceController.getCurrentStep().state);
  };

  const loadSymbolSet = async (id: string) => {
    const version = ++loadVersion;
    const preparedConfig = await prepareSymbolSetConfig(id);
    const config = preparedConfig.config;
    symbolSetSelect.disabled = true;
    statusPanel.replaceChildren(createStatusLine(`Loading ${config.label}`));

    let catalogResult;
    try {
      catalogResult = await createCatalogForSymbolSet(config);
    } catch (error) {
      await preparedConfig.destroy();
      throw error;
    }
    if (version !== loadVersion) {
      await preparedConfig.destroy();
      return;
    }
    const { catalog, validation } = catalogResult;

    destroyRenderedSymbols(renderedSymbols);
    await destroyActiveSymbolSetResources?.();
    destroyActiveSymbolSetResources = preparedConfig.destroy;
    symbolsRoot.removeChildren();
    activeSymbolSet = config;
    statePreset = config.statePreset;
    activeValidation = validation;
    renderedSymbols = createRenderedSymbols(
      catalog,
      validation.displayableSymbols,
      symbolsRoot,
      config,
    );
    activeValueSymbols = Object.freeze(
      Object.keys(config.symbolValuePresentationResources ?? {}),
    );
    valueSymbolSelect.replaceChildren(
      ...activeValueSymbols.map((symbol) => {
        const option = document.createElement("option");
        option.value = symbol;
        option.textContent = symbol;
        return option;
      }),
    );
    valueControls.hidden = activeValueSymbols.length === 0;
    defaultStateSelect.replaceChildren(
      ...statePreset.states
        .filter((state) => state.phase === "stable")
        .map((state) => {
          const option = document.createElement("option");
          option.value = state.id;
          option.textContent = state.id;
          return option;
        }),
    );
    defaultStateSelect.value = statePreset.defaultState;
    sequenceDom.addSelect.replaceChildren(
      ...createViewerStateOrder(statePreset).map((state) => {
        const option = document.createElement("option");
        option.value = state;
        option.textContent = state;
        return option;
      }),
    );
    sequenceController = new SymbolStateSequenceController({
      statePreset,
      steps: config.defaultSequence,
      autoplay: true,
    });
    playButton.textContent = "Pause";
    symbolSetSelect.value = config.id;
    symbolSetSelect.disabled = false;
    syncSequenceDom();
    broadcastState(sequenceController.getCurrentStep().state);
    updateStatusPanel();
  };

  sequenceDom.addButton.addEventListener("click", () => {
    rebuildSequence([
      ...sequenceController.getSteps(),
      { state: sequenceDom.addSelect.value },
    ]);
  });
  symbolSetSelect.addEventListener("change", () => {
    const previousId = activeSymbolSet.id;
    void loadSymbolSet(symbolSetSelect.value).catch((error) => {
      console.error("symbolsviewer symbol set switch failed", error);
      symbolSetSelect.value = previousId;
      symbolSetSelect.disabled = false;
      statusPanel.replaceChildren(
        createStatusLine(
          error instanceof Error ? error.message : String(error),
        ),
      );
    });
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
      item.renderSymbol.setPresentationValue(null);
      item.renderSymbol.reset();
    }
    broadcastState(sequenceController.getCurrentStep().state);
    syncSequenceDom();
  });
  applyValueButton.addEventListener("click", () => {
    const symbolIndex = activeValueSymbols.indexOf(valueSymbolSelect.value);
    const value = Number(valueInput.value);
    if (
      symbolIndex < 0 ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      !activeSymbolSet.rawGameConfig
    ) {
      statusPanel.replaceChildren(
        createStatusLine("Value must be a positive safe integer."),
      );
      return;
    }
    const symbol = activeValueSymbols[symbolIndex];
    const rendered = renderedSymbols.find((item) => item.symbol === symbol);
    if (!rendered) throw new Error(`symbolsviewer cannot find ${symbol}.`);
    for (const item of renderedSymbols) {
      if (item !== rendered && activeValueSymbols.includes(item.symbol)) {
        item.renderSymbol.setPresentationValue(null);
      }
    }
    rendered.renderSymbol.setPresentationValue(value);
    updateStatusPanel();
  });
  clearValueButton.addEventListener("click", () => {
    for (const item of renderedSymbols) {
      item.renderSymbol.setPresentationValue(null);
    }
    updateStatusPanel();
  });
  defaultStateSelect.addEventListener("change", () => {
    for (const item of renderedSymbols) {
      item.renderSymbol.setDefaultState(defaultStateSelect.value);
    }
  });

  function createSequenceStepRows(
    steps: readonly SymbolSequenceStep[],
    controller: SymbolStateSequenceController,
  ): HTMLElement[] {
    return steps.map((step, index) => {
      const row = document.createElement("div");
      row.className =
        index === controller.getCurrentIndex()
          ? "sequence-row is-current"
          : "sequence-row";
      row.dataset.testid = `sequence-row-${index}`;
      const stateSelect = createSelect(
        createViewerStateOrder(statePreset),
        step.state,
      );
      stateSelect.dataset.testid = `sequence-state-${index}`;
      const holdInput = document.createElement("input");
      holdInput.type = "number";
      holdInput.step = "0.1";
      holdInput.min = "0";
      holdInput.value = String(step.holdSeconds ?? 0);
      holdInput.disabled =
        statePreset.states.find((state) => state.id === step.state)?.phase ===
        "once";
      holdInput.dataset.testid = `sequence-hold-${index}`;
      const upButton = createButton("Up");
      upButton.dataset.testid = `sequence-up-${index}`;
      const downButton = createButton("Down");
      downButton.dataset.testid = `sequence-down-${index}`;
      const removeButton = createButton("Remove");
      removeButton.dataset.testid = `sequence-remove-${index}`;

      stateSelect.addEventListener("change", () => {
        const nextStep = normalizeViewerStep(
          stateSelect.value,
          Number.parseFloat(holdInput.value),
          statePreset,
        );
        const nextSteps = controller
          .getSteps()
          .map((current, currentIndex) =>
            currentIndex === index ? nextStep : current,
          );
        rebuildSequence(nextSteps);
      });
      holdInput.addEventListener("change", () => {
        const nextStep = normalizeViewerStep(
          stateSelect.value,
          Number.parseFloat(holdInput.value),
          statePreset,
        );
        const nextSteps = controller
          .getSteps()
          .map((current, currentIndex) =>
            currentIndex === index ? nextStep : current,
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
          rebuildSequence(
            controller
              .getSteps()
              .filter((_current, currentIndex) => currentIndex !== index),
          );
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
      const renderPriority = getSymbolRenderPriority(
        activeSymbolSet,
        item.renderSymbol.symbol,
      );
      return `${item.renderSymbol.symbol}: ${snapshot.requestedState} -> ${snapshot.resolvedState} / ${snapshot.defaultState}${snapshot.pendingState ? ` / ${snapshot.pendingState}` : ""} / priority ${renderPriority}`;
    });
    statusPanel.replaceChildren(
      createStatusLine(`Set ${activeSymbolSet.label}`),
      createStatusLine(
        `Index ${sequenceController.getCurrentIndex()} · ${currentStep.state}`,
      ),
      createStatusLine(sequenceController.isPlaying() ? "Playing" : "Paused"),
      createStatusLine(
        `Displayable ${activeValidation?.displayableSymbols.length ?? 0}`,
      ),
      ...lines.map(createStatusLine),
    );
  }

  let elapsedSincePanelUpdate = 0;
  await loadSymbolSet(symbolSetSelect.value);

  app.ticker.add((ticker) => {
    const deltaSeconds = ticker.deltaMS / 1000;
    const currentStep = sequenceController.getCurrentStep();
    const currentState = statePreset.states.find(
      (state) => state.id === currentStep.state,
    );
    const results = renderedSymbols.map((item) =>
      item.renderSymbol.update(deltaSeconds),
    );
    const onceCompleted =
      currentState?.phase === "once" &&
      results.length > 0 &&
      results.every(
        (result) =>
          result.onceCompleted || result.requestedState !== currentStep.state,
      );
    const sequenceResult = sequenceController.update({
      deltaSeconds,
      onceCompleted,
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
  window.addEventListener("beforeunload", () => {
    destroyRenderedSymbols(renderedSymbols);
    void destroyActiveSymbolSetResources?.();
  });
}

async function loadSymbolTextures(
  symbolAssetUrls: SymbolAssetMap,
): Promise<SymbolAssetMap> {
  const entries = await Promise.all(
    Object.entries(symbolAssetUrls).map(async ([symbol, asset]) => {
      return [symbol, await loadSymbolAssetInput(asset)] as const;
    }),
  );
  return Object.freeze(Object.fromEntries(entries));
}

async function loadSymbolAssetInput(
  asset: SymbolAssetInput,
): Promise<SymbolAssetInput> {
  if (isSymbolTextureSet(asset)) {
    const stateEntries = await Promise.all(
      Object.entries(asset.states ?? {})
        .filter(
          (entry): entry is [string, Texture | string] =>
            entry[1] !== undefined,
        )
        .map(async ([state, urlOrTexture]) => {
          return [state, await loadTexture(urlOrTexture)] as const;
        }),
    );
    return Object.freeze({
      normal: await loadNormalTextureSource(asset.normal),
      states: Object.freeze(Object.fromEntries(stateEntries)),
    });
  }

  return loadTexture(asset);
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: await loadTexture(normal.texture),
      });
    }
    if (normal.kind === "transparent") {
      return normal;
    }
    const layers = await Promise.all(
      normal.layers.map(async (layer) => {
        const keyframes = await Promise.all(
          (layer.keyframes ?? []).map((keyframe) => loadTexture(keyframe)),
        );
        return Object.freeze({
          index: layer.index,
          texture: await loadTexture(layer.texture),
          ...(keyframes.length > 0
            ? { keyframes: Object.freeze(keyframes) }
            : {}),
        });
      }),
    );
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(layers),
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

function isSymbolTextureSet(
  asset: SymbolAssetInput,
): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): normal is SymbolNormalTextureSource<Texture | string> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" ||
      normal.kind === "layered" ||
      normal.kind === "transparent")
  );
}

function createRenderedSymbols(
  catalog: SymbolCatalog,
  symbols: readonly string[],
  root: Container,
  config: SymbolSetConfig,
): RenderedViewerSymbol[] {
  const entries = symbols.map((symbol) => {
    const resource = config.symbolValuePresentationResources?.[symbol];
    const renderSymbol = catalog.createRenderSymbol(symbol, {
      ...(resource
        ? {
            valueControllerFactory: (root) =>
              createRenderSymbolValueController({ root, resource }),
          }
        : {}),
    });
    const maxTextureSize = getRenderSymbolMaxTextureSize(renderSymbol);
    const scale = getSymbolScale(config, symbol);
    return { symbol, renderSymbol, maxTextureSize, scale };
  });
  const maxScaledTextureSize = Math.max(
    1,
    ...entries.map((entry) => entry.maxTextureSize * entry.scale),
  );
  const columns = getSymbolColumnCount(symbols.length, maxScaledTextureSize);
  const rows = Math.max(1, Math.ceil(symbols.length / columns));
  const cellWidth = (STAGE_WIDTH - STAGE_HORIZONTAL_PADDING * 2) / columns;
  const cellHeight =
    (STAGE_HEIGHT - STAGE_TOP_PADDING - STAGE_BOTTOM_PADDING) / rows;

  return entries.map(
    ({ symbol, renderSymbol, maxTextureSize, scale }, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowLength = Math.min(columns, symbols.length - row * columns);
      const rowStartX = STAGE_WIDTH / 2 - ((rowLength - 1) * cellWidth) / 2;
      const x = rowStartX + cellWidth * column;
      const y = STAGE_TOP_PADDING + cellHeight * row + cellHeight / 2;
      const scaledSize = maxTextureSize * scale;
      renderSymbol.position.set(x, y);
      renderSymbol.scale.set(scale);

      const label = new Text({
        text: symbol,
        style: {
          fill: "#f8fafc",
          fontSize: 18,
          fontFamily: "Inter, Arial, sans-serif",
          fontWeight: "700",
        },
      });
      label.anchor.set(0.5);
      label.position.set(
        renderSymbol.x,
        Math.min(STAGE_HEIGHT - 18, y + scaledSize / 2 + SYMBOL_LABEL_GAP),
      );

      root.addChild(renderSymbol, label);
      return { symbol, renderSymbol, label, cellWidth, cellHeight };
    },
  );
}

function getSymbolScale(config: SymbolSetConfig, symbol: string): number {
  const scale = config.symbolScales[symbol];
  if (scale === undefined) {
    throw new Error(
      `Symbol set "${config.id}" is missing manifest scale for "${symbol}".`,
    );
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(
      `Symbol set "${config.id}" scale for "${symbol}" must be a finite positive number.`,
    );
  }
  return scale;
}

function getSymbolRenderPriority(
  config: SymbolSetConfig,
  symbol: string,
): number {
  const renderPriority = config.symbolRenderPriorities[symbol];
  if (renderPriority === undefined) {
    throw new Error(
      `Symbol set "${config.id}" is missing manifest renderPriority for "${symbol}".`,
    );
  }
  if (!Number.isSafeInteger(renderPriority) || renderPriority < 0) {
    throw new Error(
      `Symbol set "${config.id}" renderPriority for "${symbol}" must be a non-negative safe integer.`,
    );
  }
  return renderPriority;
}

function getSymbolColumnCount(
  symbolCount: number,
  maxScaledTextureSize: number,
): number {
  const availableWidth = STAGE_WIDTH - STAGE_HORIZONTAL_PADDING * 2;
  const maxColumnsByWidth = Math.max(
    1,
    Math.floor(
      (availableWidth + MIN_SYMBOL_CELL_GAP) /
        (maxScaledTextureSize + MIN_SYMBOL_CELL_GAP),
    ),
  );
  return Math.max(
    1,
    Math.min(MAX_SYMBOL_COLUMNS, symbolCount, maxColumnsByWidth),
  );
}

function getRenderSymbolMaxTextureSize(renderSymbol: RenderSymbol): number {
  return Math.max(
    1,
    ...renderSymbol
      .getLayerSprites()
      .map((layer) =>
        Math.max(layer.texture.width || 1, layer.texture.height || 1),
      ),
  );
}

function createSequenceDom(
  steps: readonly SymbolSequenceStep[],
  stateOrder: readonly string[],
): SequenceDom {
  const list = document.createElement("div");
  list.className = "sequence-list";
  list.dataset.testid = "sequence-list";
  const addSelect = createSelect(stateOrder);
  addSelect.dataset.testid = "sequence-add-select";
  const addButton = createButton("Add");
  addButton.dataset.testid = "sequence-add";
  addSelect.value = steps.at(-1)?.state ?? stateOrder[0];
  return { list, addSelect, addButton };
}

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  return button;
}

function createSelect(
  values: readonly string[],
  selected = values[0],
): HTMLSelectElement {
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

function normalizeViewerStep(
  state: string,
  holdSeconds: number,
  statePreset: SymbolStatePreset,
): SymbolSequenceStep {
  if (
    statePreset.states.find((definition) => definition.id === state)?.phase ===
    "once"
  ) {
    return Object.freeze({ state });
  }
  return Object.freeze({
    state,
    holdSeconds:
      Number.isFinite(holdSeconds) && holdSeconds >= 0 ? holdSeconds : 0.5,
  });
}

void bootstrap().catch((error) => {
  console.error("symbolsviewer bootstrap failed", error);
});

async function createCatalogForSymbolSet(config: SymbolSetConfig): Promise<{
  readonly catalog: SymbolCatalog;
  readonly validation: SymbolCatalogValidation;
}> {
  const symbolAssetUrls = createStatefulSymbolAssetMapFromModules({
    modules: config.modules,
    manifest: config.manifest,
    requiredStates: config.requiredStates,
    displaySymbols: config.displaySymbols,
  });
  const textures = await loadSymbolTextures(symbolAssetUrls);
  const symbolAnimationCapabilities =
    createSymbolAnimationCapabilityMapFromManifest({
      manifest: config.manifest,
      requiredStates: config.requiredStates,
    });
  if (config.catalogKind === "standalone") {
    const catalog = createSymbolsViewerStandaloneCatalog({
      symbolAssets: textures,
      displaySymbols: config.displaySymbols ?? Object.keys(textures),
      symbolScales: config.symbolScales,
      symbolRenderPriorities: config.symbolRenderPriorities,
      requiredStateTextures: config.requiredStates,
      animationResolver: config.animationResolver,
      symbolAnimationCapabilities,
      statePreset: config.statePreset,
    });
    return Object.freeze({
      catalog,
      validation: catalog.getValidation(),
    });
  }
  if (config.rawGameConfig === undefined) {
    throw new Error(`Symbol set "${config.id}" is missing rawGameConfig.`);
  }
  const catalog = createSymbolCatalog({
    gameConfig: createGameConfig(config.rawGameConfig),
    assets: textures,
    symbolRenderPriorities: config.symbolRenderPriorities,
    statePreset: config.statePreset,
    animationResolver: config.animationResolver,
    symbolAnimationCapabilities,
    texturePolicy: {
      requiredStateTextures: config.requiredStates,
    },
  });
  return Object.freeze({
    catalog,
    validation: catalog.getValidation(),
  });
}

function destroyRenderedSymbols(
  renderedSymbols: readonly RenderedViewerSymbol[],
): void {
  for (const item of renderedSymbols) {
    item.renderSymbol.destroy({ children: true });
    item.label.destroy();
  }
}
