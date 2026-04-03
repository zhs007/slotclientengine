import { Application, Assets, Container } from "pixi.js";
import { animationBundles, defaultAnimationBundle, getAnimationBundle } from "./data/animation-bundles.js";
import { computeCanvasLayout } from "./layout.js";
import { loadAtlasTextures } from "./runtime/atlas.js";
import { CabinAnimationEntity } from "./ani/cabin/cabin-animation.js";
import { createDebugNodeIndex, buildDebugTree } from "./runtime/debug-tree.js";
import { computeSlotSelectionBounds, mergeAxisAlignedBounds } from "./runtime/debug-bounds.js";
import { computeWorldBoneTransforms, sampleAnimationPose } from "./runtime/timeline-sampler.js";
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

  const controls = createAnimationSelect(
    animationBundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      description: bundle.description,
      animationCount: bundle.animationNames.length
    })),
    defaultAnimationBundle.id,
    defaultAnimationBundle.animationNames
  );
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

  const textureCache = new Map<string, Awaited<ReturnType<typeof loadAtlasTextures>>>();
  let currentBundle = defaultAnimationBundle;
  let currentEntity: CabinAnimationEntity | null = null;
  let debugNodeIndex = new Map<string, ReturnType<typeof createDebugNodeIndex> extends Map<infer K, infer V> ? V : never>();
  let detachBoneListener: (() => void) | null = null;
  let bundleLoadToken = 0;
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

  const getBundleTextures = async (bundle = currentBundle) => {
    const cached = textureCache.get(bundle.id);
    if (cached) {
      return cached;
    }

    const textures = await loadAtlasTextures(bundle.atlasText, bundle.atlasImageUrl);
    textureCache.set(bundle.id, textures);
    return textures;
  };

  const estimateSceneBounds = (bundle = currentBundle, animationName = bundle.defaultAnimationName) => {
    const pose = sampleAnimationPose(bundle.model, animationName, 0, true);
    const worldBones = computeWorldBoneTransforms(bundle.model, pose.bones);
    const slotBounds = bundle.model.slotOrder
      .map((slotName) => {
        const slotPose = pose.slots[slotName];
        return slotPose ? computeSlotSelectionBounds(worldBones[slotPose.boneName], slotPose)?.aabb ?? null : null;
      })
      .filter((bounds): bounds is NonNullable<ReturnType<typeof computeSlotSelectionBounds>>["aabb"] => bounds !== null);

    const mergedBounds = mergeAxisAlignedBounds(slotBounds);
    if (mergedBounds) {
      return mergedBounds;
    }

    const xValues = Object.values(worldBones).map((bone) => bone.x);
    const yValues = Object.values(worldBones).map((bone) => -bone.y);
    const minX = Math.min(...xValues, -240);
    const maxX = Math.max(...xValues, 240);
    const minY = Math.min(...yValues, -240);
    const maxY = Math.max(...yValues, 240);

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  const applyScenePlacement = (bundle = currentBundle, animationName = bundle.defaultAnimationName) => {
    const bounds = estimateSceneBounds(bundle, animationName);
    const width = Math.max(bounds.width, 320);
    const height = Math.max(bounds.height, 320);
    const scale = Math.min((designWidth * 0.72) / width, (designHeight * 0.74) / height);
    const centerX = bounds.minX + width / 2;
    const centerY = bounds.minY + height / 2;

    sceneRoot.scale.set(scale, scale);
    sceneRoot.position.set(designWidth * 0.52 - centerX * scale, designHeight * 0.56 - centerY * scale);
  };

  const setMouseMode = (nextMode: MouseMode) => {
    mouseMode = nextMode;
    controls.setMouseMode(nextMode);
    stageHost.dataset.mouseMode = nextMode;
    if (dragState && nextMode !== "pan") {
      finishDragging();
    }
    currentEntity?.setPickingEnabled(nextMode === "select");
  };

  const setSelectedNode = (nodeId: string | null) => {
    selectedNodeId = nodeId;
    currentEntity?.setSelectedNode(nodeId);
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

  const applyBundle = async (bundleId: string) => {
    const nextBundle = getAnimationBundle(bundleId);
    const loadToken = ++bundleLoadToken;
    const textures = await getBundleTextures(nextBundle);
    if (loadToken !== bundleLoadToken) {
      return;
    }

    currentBundle = nextBundle;
    detachBoneListener?.();
    detachBoneListener = null;
    if (currentEntity) {
      sceneRoot.removeChild(currentEntity);
      currentEntity.destroy({ children: true });
      currentEntity = null;
    }

    const nextEntity = new CabinAnimationEntity(nextBundle.model, textures, nextBundle.defaultAnimationName);
    currentEntity = nextEntity;
    sceneRoot.addChild(nextEntity);
    nextEntity.setLoop(controls.loopCheckbox.checked);
    nextEntity.setPickingEnabled(mouseMode === "select");

    const debugTree = buildDebugTree(nextBundle.model);
    debugNodeIndex = createDebugNodeIndex(debugTree);
    nodeTree.setNodes(debugTree);
    controls.bundleSelect.value = nextBundle.id;
    controls.setBundleDetails({
      id: nextBundle.id,
      label: nextBundle.label,
      description: nextBundle.description,
      animationCount: nextBundle.animationNames.length
    });
    controls.setAnimationOptions(nextBundle.animationNames, nextBundle.defaultAnimationName);
    nextEntity.play(nextBundle.defaultAnimationName);
    applyScenePlacement(nextBundle, nextBundle.defaultAnimationName);
    setSelectedNode(null);

    detachBoneListener = nextEntity.onBoneSelected((boneName) => {
      if (mouseMode !== "select") {
        return;
      }
      setSelectedNode(`bone:${boneName}`);
    });
  };

  controls.onMouseModeChange(setMouseMode);
  controls.bundleSelect.addEventListener("change", () => {
    void applyBundle(controls.bundleSelect.value);
  });
  controls.select.addEventListener("change", () => {
    currentEntity?.play(controls.select.value);
  });
  controls.replayButton.addEventListener("click", () => {
    currentEntity?.replay();
  });
  controls.loopCheckbox.addEventListener("change", () => {
    currentEntity?.setLoop(controls.loopCheckbox.checked);
  });
  nodeTree.setOnSelect((nodeId) => {
    setSelectedNode(nodeId);
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
    currentEntity?.update(ticker.deltaMS / 1000);
  });

  await applyBundle(defaultAnimationBundle.id);
  setSelectedNode(selectedNodeId);
  setMouseMode(mouseMode);
  applyLayout();
  applyViewport();
  window.addEventListener("resize", applyLayout);
}

void bootstrap().catch((error) => {
  console.error("spine2pixiani demo bootstrap failed", error);
});