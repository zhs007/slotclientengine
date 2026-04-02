import { Application, Assets, Container } from "pixi.js";
import { cabinAnimationData, cabinAnimationNames } from "./data/cabin-animation-data.js";
import { cabinAtlasText } from "./data/cabin-atlas.js";
import cabinAtlasImageUrl from "./assets/cabin.png";
import { computeCanvasLayout } from "./layout.js";
import { loadAtlasTextures } from "./runtime/atlas.js";
import { CabinAnimationEntity } from "./ani/cabin/cabin-animation.js";
import { createDebugNodeIndex, buildDebugTree } from "./runtime/debug-tree.js";
import { createViewportState, panViewport, zoomViewportAtPoint } from "./runtime/viewport-controller.js";
import { createAnimationSelect, type MouseMode } from "./ui/animation-select.js";
import { createNodeTreePanel } from "./ui/node-tree.js";
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
  const nodeTree = createNodeTreePanel();
  const stageShell = document.createElement("section");
  stageShell.className = "stage-shell";

  const stageHost = document.createElement("div");
  stageHost.className = "stage";
  stageShell.appendChild(stageHost);

  shell.append(controls.root, stageShell, nodeTree.root);
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
  app.stage.addChild(viewportRoot);
  viewportRoot.addChild(sceneRoot);

  const textures = await loadAtlasTextures(cabinAtlasText, cabinAtlasImageUrl);
  const cabinEntity = new CabinAnimationEntity(cabinAnimationData, textures);
  sceneRoot.addChild(cabinEntity);

  const skeletonScale = Math.min(
    (designWidth * 0.72) / cabinAnimationData.skeleton.width,
    (designHeight * 0.82) / cabinAnimationData.skeleton.height
  );
  sceneRoot.position.set(designWidth * 0.52, designHeight * 0.84);
  sceneRoot.scale.set(skeletonScale, skeletonScale);
  cabinEntity.play("cabin");

  const debugTree = buildDebugTree(cabinAnimationData);
  const debugNodeIndex = createDebugNodeIndex(debugTree);
  const viewport = {
    state: createViewportState({
      zoom: 1,
      minZoom: 0.6,
      maxZoom: 2.4,
      panX: 0,
      panY: 0
    })
  };

  let mouseMode: MouseMode = "select";
  let selectedNodeId: string | null = null;
  let dragState:
    | {
        pointerId: number;
        originPanX: number;
        originPanY: number;
        startX: number;
        startY: number;
      }
    | null = null;

  const applyViewport = () => {
    viewportRoot.position.set(viewport.state.panX, viewport.state.panY);
    viewportRoot.scale.set(viewport.state.zoom, viewport.state.zoom);
    controls.setZoom(viewport.state.zoom);
  };

  const setMouseMode = (nextMode: MouseMode) => {
    mouseMode = nextMode;
    controls.setMouseMode(nextMode);
    stageHost.dataset.mouseMode = nextMode;
    if (dragState && nextMode !== "pan") {
      finishDragging();
    }
    cabinEntity.setPickingEnabled(nextMode === "select");
  };

  const setSelectedNode = (nodeId: string | null) => {
    selectedNodeId = nodeId;
    cabinEntity.setSelectedNode(nodeId);
    nodeTree.setSelectedNodeId(nodeId);

    const node = nodeId ? debugNodeIndex.get(nodeId) : null;
    if (!node) {
      controls.setSelection(null);
      return;
    }

    controls.setSelection({
      name: node.name,
      type: node.type,
      parentName: node.parentId ? debugNodeIndex.get(node.parentId)?.name ?? null : null
    });
  };

  const finishDragging = () => {
    if (!dragState) {
      return;
    }

    try {
      stageHost.releasePointerCapture(dragState.pointerId);
    } catch {
      // ignore release failures from cancelled gestures
    }
    dragState = null;
    stageHost.classList.remove("is-dragging");
  };

  const getStagePoint = (clientX: number, clientY: number) => {
    const rect = app.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * designWidth) / rect.width,
      y: ((clientY - rect.top) * designHeight) / rect.height
    };
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

  controls.select.value = "cabin";
  controls.onMouseModeChange(setMouseMode);
  controls.select.addEventListener("change", () => {
    cabinEntity.play(controls.select.value);
  });
  controls.replayButton.addEventListener("click", () => {
    cabinEntity.replay();
  });
  controls.loopCheckbox.addEventListener("change", () => {
    cabinEntity.setLoop(controls.loopCheckbox.checked);
  });
  nodeTree.setNodes(debugTree);
  nodeTree.setOnSelect((nodeId) => {
    setSelectedNode(nodeId);
  });
  cabinEntity.onBoneSelected((boneName) => {
    if (mouseMode !== "select") {
      return;
    }
    setSelectedNode(`bone:${boneName}`);
  });

  stageHost.addEventListener("pointerdown", (event) => {
    if (mouseMode !== "pan" || event.button !== 0) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    dragState = {
      pointerId: event.pointerId,
      originPanX: viewport.state.panX,
      originPanY: viewport.state.panY,
      startX: point.x,
      startY: point.y
    };
    stageHost.setPointerCapture(event.pointerId);
    stageHost.classList.add("is-dragging");
    event.preventDefault();
  });

  stageHost.addEventListener("pointermove", (event) => {
    if (!dragState || mouseMode !== "pan" || dragState.pointerId !== event.pointerId) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    viewport.state = panViewport(
      viewport.state,
      dragState.originPanX + (point.x - dragState.startX),
      dragState.originPanY + (point.y - dragState.startY)
    );
    applyViewport();
  });

  stageHost.addEventListener("pointerup", finishDragging);
  stageHost.addEventListener("pointercancel", finishDragging);
  stageHost.addEventListener("pointerleave", (event) => {
    if (dragState?.pointerId === event.pointerId && !stageHost.hasPointerCapture(event.pointerId)) {
      finishDragging();
    }
  });
  stageHost.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      viewport.state = zoomViewportAtPoint(viewport.state, factor, getStagePoint(event.clientX, event.clientY));
      applyViewport();
    },
    { passive: false }
  );

  app.ticker.add((ticker) => {
    cabinEntity.update(ticker.deltaMS / 1000);
  });

  setSelectedNode(selectedNodeId);
  setMouseMode(mouseMode);
  applyLayout();
  applyViewport();
  window.addEventListener("resize", applyLayout);
}

void bootstrap().catch((error) => {
  console.error("spine2pixiani demo bootstrap failed", error);
});