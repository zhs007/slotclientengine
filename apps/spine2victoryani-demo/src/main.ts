import { Application, Assets, Container } from "pixi.js";
import { normalizeProjectConfig } from "./config/victory-project.js";
import type { VictoryProjectConfigRaw } from "./config/victory-types.js";
import { computeCanvasLayout } from "./layout.js";
import { loadProjectTextures } from "./preview/asset-loader.js";
import { ExportPreviewPlayer } from "./preview/player.js";
import type { ExportManifest } from "./runtime/export-types.js";
import { createViewportState } from "./runtime/viewport-controller.js";
import {
  activateViewportInteraction,
  applyViewportTransform,
  beginViewportDrag,
  createViewportInteractionState,
  deactivateViewportInteraction,
  endViewportDrag,
  updateViewportDrag,
  zoomViewportWithWheel
} from "./runtime/viewport-interaction.js";
import "./styles.css";

async function fetchJson<T>(input: string | URL): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`Failed to load JSON from ${response.url || String(input)}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function bootstrap() {
  const designWidth = 1280;
  const designHeight = 900;

  const appRoot = document.getElementById("app");
  if (!appRoot) {
    throw new Error("Missing #app container");
  }

  const shell = document.createElement("main");
  shell.className = "shell";
  const sidebar = document.createElement("aside");
  sidebar.className = "panel sidebar";
  sidebar.innerHTML = `
    <div class="eyebrow">Spine -> VictoryAni</div>
    <h1>spine2victoryani-demo</h1>
    <p>页面只回放导出结果，不直接消费原始 Spine 数据。</p>
    <div class="controls">
      <div class="control-group">
        <label for="animation-select">Animation</label>
        <select id="animation-select"></select>
      </div>
      <div class="control-row">
        <button id="play-toggle" type="button">Pause</button>
        <button id="replay-button" type="button">Replay</button>
      </div>
      <label class="toggle">
        <input id="loop-toggle" type="checkbox" checked />
        <span>Loop playback</span>
      </label>
    </div>
    <div class="debug-state" id="summary"></div>
  `;

  const detailPanel = document.createElement("aside");
  detailPanel.className = "panel detail-panel";
  detailPanel.innerHTML = `
    <div class="eyebrow">Export Notes</div>
    <h2>Exported Files</h2>
    <p>导出结果默认位于 <strong>public/exported</strong>。重新生成请执行 <strong>pnpm --filter spine2victoryani-demo export</strong>。</p>
    <div class="debug-state" id="details"></div>
  `;

  const stageShell = document.createElement("section");
  stageShell.className = "stage-shell";

  const stageHost = document.createElement("div");
  stageHost.className = "stage";
  stageShell.appendChild(stageHost);

  shell.append(sidebar, stageShell, detailPanel);
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

  const viewportRoot = new Container();
  const sceneRoot = new Container();
  viewportRoot.addChild(sceneRoot);
  app.stage.addChild(viewportRoot);

  let viewportState = createViewportState();
  let viewportInteraction = createViewportInteractionState();

  const applyViewport = () => {
    applyViewportTransform(viewportRoot, viewportState);
  };

  const syncStageState = () => {
    stageHost.classList.toggle("is-active", viewportInteraction.isActive);
    stageHost.classList.toggle("is-dragging", viewportInteraction.isDragging);
  };

  const finishDrag = (pointerId?: number) => {
    if (pointerId !== undefined && stageHost.hasPointerCapture(pointerId)) {
      stageHost.releasePointerCapture(pointerId);
    }

    viewportInteraction = endViewportDrag(viewportInteraction, pointerId);
    syncStageState();
  };

  const getCanvasAnchor = (event: MouseEvent | PointerEvent | WheelEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const width = rect.width || designWidth;
    const height = rect.height || designHeight;

    return {
      x: ((event.clientX - rect.left) / width) * designWidth,
      y: ((event.clientY - rect.top) / height) * designHeight
    };
  };

  const isPointerInsideCanvas = (event: MouseEvent | PointerEvent | WheelEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };

  applyViewport();
  syncStageState();

  const animationSelect = sidebar.querySelector<HTMLSelectElement>("#animation-select");
  const playToggle = sidebar.querySelector<HTMLButtonElement>("#play-toggle");
  const replayButton = sidebar.querySelector<HTMLButtonElement>("#replay-button");
  const loopToggle = sidebar.querySelector<HTMLInputElement>("#loop-toggle");
  const summary = sidebar.querySelector<HTMLDivElement>("#summary");
  const details = detailPanel.querySelector<HTMLDivElement>("#details");

  if (!animationSelect || !playToggle || !replayButton || !loopToggle || !summary || !details) {
    throw new Error("Missing preview controls");
  }

  const manifestUrl = new URL("./exported/manifest.json", window.location.href);
  const exportedRootUrl = new URL("./", manifestUrl);
  const manifest = await fetchJson<ExportManifest>(manifestUrl);
  const defaultAnimationProjectPath = manifest.animations.find((item) => item.name === manifest.defaultAnimation)?.projectPath;
  const defaultProjectUrl = defaultAnimationProjectPath
    ? new URL(defaultAnimationProjectPath, manifestUrl).toString()
    : manifest.animations[0]
      ? new URL(manifest.animations[0].projectPath, manifestUrl).toString()
      : new URL("./project.json", manifestUrl).toString();

  for (const animation of manifest.animations) {
    const option = document.createElement("option");
    option.value = new URL(animation.projectPath, manifestUrl).toString();
    option.textContent = `${animation.name} (${animation.duration.toFixed(2)}s)`;
    animationSelect.appendChild(option);
  }

  animationSelect.value = defaultProjectUrl;

  let player: ExportPreviewPlayer | null = null;

  const resolveProjectAsset = (assetPath: string, projectUrl: string) => {
    const projectAssetUrl = new URL(assetPath, projectUrl);
    const exportedAssetUrl = new URL(assetPath.replace(/^\.\//, ""), exportedRootUrl);

    if (projectAssetUrl.pathname.includes("/animations/assets/") && assetPath.startsWith("./assets/")) {
      return exportedAssetUrl.toString();
    }

    return projectAssetUrl.toString();
  };

  const renderSummary = (projectName: string, layerCount: number, duration: number) => {
    summary.innerHTML = `
      <div class="debug-stat"><span class="debug-stat-label">Project</span><span class="debug-stat-value">${projectName}</span></div>
      <div class="debug-stat"><span class="debug-stat-label">Layers</span><span class="debug-stat-value">${layerCount}</span></div>
      <div class="debug-stat"><span class="debug-stat-label">Duration</span><span class="debug-stat-value">${duration.toFixed(2)}s</span></div>
      <div class="debug-stat"><span class="debug-stat-label">Assets</span><span class="debug-stat-value">${manifest.assetCount}</span></div>
    `;
  };

  details.innerHTML = `
    <div class="debug-stat"><span class="debug-stat-label">Source Skeleton</span><span class="debug-stat-value">${manifest.source.bones} bones / ${manifest.source.slots} slots</span></div>
    <div class="debug-stat"><span class="debug-stat-label">Atlas Strategy</span><span class="debug-stat-value">Export-time slicing with standalone PNG assets</span></div>
    <div class="debug-stat"><span class="debug-stat-label">Mirror Strategy</span><span class="debug-stat-value">Preserve negative scaleX in exported timeline frames</span></div>
    <div class="debug-stat"><span class="debug-stat-label">Mirror Checks</span><span class="debug-stat-value">${manifest.mirrorChecks.map((pair) => `${pair.leftLayerId} <-> ${pair.rightLayerId}`).join("<br />")}</span></div>
  `;

  const loadProject = async (projectPath: string) => {
    player?.stop();
    if (player) {
      sceneRoot.removeChild(player.root);
      player.root.destroy({ children: true });
    }

    const raw = await fetchJson<VictoryProjectConfigRaw>(projectPath);
    const project = normalizeProjectConfig(raw, (assetPath) => resolveProjectAsset(assetPath, projectPath), designWidth, designHeight);
    const textures = await loadProjectTextures(project);
    player = new ExportPreviewPlayer(app, project, textures);
    player.setLoop(loopToggle.checked);
    sceneRoot.addChild(player.root);
    player.play();
    playToggle.textContent = "Pause";
    renderSummary(project.name, project.layers.length, project.duration);
  };

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

  animationSelect.addEventListener("change", () => {
    void loadProject(animationSelect.value);
  });

  stageHost.addEventListener("pointerdown", (event) => {
    viewportInteraction = activateViewportInteraction(viewportInteraction);
    syncStageState();

    if (event.button !== 0 || !event.isPrimary || !isPointerInsideCanvas(event)) {
      return;
    }

    viewportInteraction = beginViewportDrag(viewportInteraction, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: viewportState.panX,
      panY: viewportState.panY
    });
    stageHost.setPointerCapture(event.pointerId);
    syncStageState();
    event.preventDefault();
  });

  stageHost.addEventListener("pointermove", (event) => {
    const next = updateViewportDrag(viewportInteraction, viewportState, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    viewportInteraction = next.interactionState;
    viewportState = next.viewportState;
    applyViewport();
  });

  stageHost.addEventListener("pointerup", (event) => {
    finishDrag(event.pointerId);
  });

  stageHost.addEventListener("pointercancel", (event) => {
    finishDrag(event.pointerId);
  });

  stageHost.addEventListener("lostpointercapture", () => {
    finishDrag();
  });

  stageHost.addEventListener(
    "wheel",
    (event) => {
      const next = zoomViewportWithWheel(viewportState, viewportInteraction, {
        deltaY: event.deltaY,
        anchor: getCanvasAnchor(event),
        isPointerInsideStage: isPointerInsideCanvas(event)
      });
      if (!next.handled) {
        return;
      }

      viewportState = next.viewportState;
      applyViewport();
      event.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && stageHost.contains(target)) {
      return;
    }

    viewportInteraction = deactivateViewportInteraction(viewportInteraction);
    syncStageState();
  });

  window.addEventListener("blur", () => {
    finishDrag();
  });

  playToggle.addEventListener("click", () => {
    if (!player) {
      return;
    }

    if (player.isPlaying()) {
      player.stop();
      playToggle.textContent = "Play";
      return;
    }

    player.play();
    playToggle.textContent = "Pause";
  });

  replayButton.addEventListener("click", () => {
    player?.replay();
    playToggle.textContent = "Pause";
  });

  loopToggle.addEventListener("change", () => {
    player?.setLoop(loopToggle.checked);
  });

  app.ticker.add((ticker) => {
    player?.update(ticker.deltaMS / 1000);
  });

  applyLayout();
  await loadProject(animationSelect.value);
  window.addEventListener("resize", applyLayout);
}

void bootstrap().catch((error) => {
  console.error("spine2victoryani demo bootstrap failed", error);
});
