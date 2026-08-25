import {
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text,
} from "pixi.js";
import {
  FateThreadSimulation,
  type PointLike,
} from "../physics/fate-thread-simulation.js";
import { FateThreadMesh } from "../render/fate-thread-mesh.js";

export const DESIGN_WIDTH = 1440;
export const DESIGN_HEIGHT = 900;

const INITIAL_ANCHORS: readonly PointLike[] = [
  { x: 176, y: 396 },
  { x: 392, y: 330 },
  { x: 606, y: 438 },
  { x: 836, y: 350 },
  { x: 1060, y: 430 },
  { x: 1264, y: 342 },
];

interface DragState {
  anchorIndex: number;
  pointerId: number;
}

export interface FateThreadScene {
  root: Container;
  update(deltaSeconds: number): void;
  pluck(): void;
  reset(): void;
}

export function createFateThreadScene(): FateThreadScene {
  const root = new Container();
  root.label = "fate-thread-scene";
  root.eventMode = "static";
  root.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

  root.addChild(createBackdrop(), createDustLayer());

  const simulation = new FateThreadSimulation(INITIAL_ANCHORS, {
    segmentsPerSpan: 12,
    sag: 54,
    gravity: 255,
    wind: 44,
    constraintIterations: 11,
  });
  const mesh = new FateThreadMesh(simulation.points.length);
  root.addChild(mesh);

  const handles = INITIAL_ANCHORS.map((_, index) => createAnchorHandle(index));
  root.addChild(...handles);

  let elapsedSeconds = 0;
  let drag: DragState | null = null;

  handles.forEach((handle, anchorIndex) => {
    handle.on("pointerdown", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      drag = { anchorIndex, pointerId: event.pointerId };
      handle.cursor = "grabbing";
      handle.scale.set(1.12);
    });
  });

  root.on("globalpointermove", (event: FederatedPointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const local = event.getLocalPosition(root);
    simulation.setAnchor(drag.anchorIndex, {
      x: clamp(local.x, 92, DESIGN_WIDTH - 92),
      y: clamp(local.y, 210, DESIGN_HEIGHT - 145),
    });
  });

  const releaseDrag = (event: FederatedPointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    handles[drag.anchorIndex].cursor = "grab";
    handles[drag.anchorIndex].scale.set(1);
    drag = null;
  };
  root.on("pointerup", releaseDrag);
  root.on("pointerupoutside", releaseDrag);
  root.on("pointercancel", releaseDrag);

  const syncHandles = () => {
    handles.forEach((handle, index) => {
      const anchor = simulation.getAnchor(index);
      handle.position.set(anchor.x, anchor.y);
      const halo = handle.getChildByLabel("halo");
      if (halo) {
        halo.alpha = 0.2 + Math.sin(elapsedSeconds * 2.3 + index) * 0.07;
        const pulse = 1 + Math.sin(elapsedSeconds * 1.7 + index * 0.8) * 0.08;
        halo.scale.set(pulse);
      }
    });
  };

  syncHandles();
  mesh.update(simulation.points, elapsedSeconds);

  return {
    root,
    update(deltaSeconds) {
      elapsedSeconds += deltaSeconds;
      simulation.step(deltaSeconds, elapsedSeconds);
      mesh.update(simulation.points, elapsedSeconds);
      syncHandles();
      animateDust(root.getChildByLabel("dust"), elapsedSeconds);
    },
    pluck() {
      simulation.pluck(22);
    },
    reset() {
      simulation.reset();
      syncHandles();
    },
  };
}

function createBackdrop(): Container {
  const backdrop = new Container();
  const sky = new Graphics()
    .rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)
    .fill(0x070713)
    .rect(0, 170, DESIGN_WIDTH, 730)
    .fill({ color: 0x10101f, alpha: 0.95 });
  backdrop.addChild(sky);

  const aura = new Graphics()
    .ellipse(720, 370, 610, 330)
    .fill({ color: 0x31203e, alpha: 0.24 })
    .ellipse(720, 455, 430, 220)
    .fill({ color: 0x7d4224, alpha: 0.08 });
  backdrop.addChild(aura);

  const architecture = new Graphics();
  architecture
    .rect(0, 722, DESIGN_WIDTH, 178)
    .fill(0x090811)
    .rect(0, 720, DESIGN_WIDTH, 3)
    .fill({ color: 0x9b642c, alpha: 0.3 });

  for (const x of [72, 270, 1118, 1316]) {
    architecture
      .roundRect(x - 34, 192, 68, 530, 6)
      .fill({ color: 0x171525, alpha: 0.92 })
      .rect(x - 45, 188, 90, 18)
      .fill({ color: 0x262035, alpha: 0.92 })
      .rect(x - 50, 704, 100, 18)
      .fill({ color: 0x211b2c, alpha: 0.96 })
      .rect(x - 25, 220, 5, 460)
      .fill({ color: 0xb47a45, alpha: 0.08 });
  }

  architecture
    .moveTo(270, 260)
    .bezierCurveTo(430, 76, 1010, 76, 1170, 260)
    .stroke({ color: 0x34283c, width: 42, alpha: 0.72 })
    .moveTo(270, 260)
    .bezierCurveTo(430, 96, 1010, 96, 1170, 260)
    .stroke({ color: 0x8d6036, width: 3, alpha: 0.22 });
  backdrop.addChild(architecture);

  const title = new Text({
    text: "THE THREADS REMEMBER",
    style: {
      fill: 0xbfa474,
      fontFamily: "Georgia, serif",
      fontSize: 15,
      letterSpacing: 6,
    },
  });
  title.anchor.set(0.5);
  title.position.set(DESIGN_WIDTH / 2, 178);
  title.alpha = 0.72;
  backdrop.addChild(title);

  const hint = new Text({
    text: "拖动任意命运节点 · 丝线会保留惯性并重新收束",
    style: {
      fill: 0xa799b0,
      fontFamily: "system-ui, sans-serif",
      fontSize: 16,
      letterSpacing: 1.5,
    },
  });
  hint.anchor.set(0.5);
  hint.position.set(DESIGN_WIDTH / 2, 778);
  backdrop.addChild(hint);

  return backdrop;
}

function createAnchorHandle(index: number): Container {
  const handle = new Container();
  handle.label = `anchor-${index + 1}`;
  handle.eventMode = "static";
  handle.cursor = "grab";
  handle.hitArea = new Rectangle(-30, -30, 60, 60);

  const halo = new Graphics()
    .circle(0, 0, 28)
    .fill({ color: 0xf2a13d, alpha: 0.2 });
  halo.label = "halo";
  const outer = new Graphics()
    .circle(0, 0, 17)
    .fill({ color: 0x1b111e, alpha: 0.92 })
    .stroke({ color: 0xe7b85a, width: 2, alpha: 0.92 });
  const inner = new Graphics()
    .circle(0, 0, 7)
    .fill(0xffe7a1)
    .circle(0, 0, 3)
    .fill(0xffffff);
  const label = new Text({
    text: String(index + 1).padStart(2, "0"),
    style: {
      fill: 0x8f7d91,
      fontFamily: "system-ui, sans-serif",
      fontSize: 10,
      fontWeight: "600",
      letterSpacing: 1,
    },
  });
  label.anchor.set(0.5, 0);
  label.position.set(0, 33);
  handle.addChild(halo, outer, inner, label);
  return handle;
}

function createDustLayer(): Container {
  const dust = new Container();
  dust.label = "dust";
  for (let index = 0; index < 44; index += 1) {
    const seed = pseudoRandom(index + 1);
    const mote = new Graphics()
      .circle(0, 0, 0.7 + seed * 1.7)
      .fill({ color: index % 3 === 0 ? 0xffd989 : 0xa982c0, alpha: 0.35 });
    mote.label = `${index}`;
    mote.position.set(
      110 + pseudoRandom(index * 3 + 8) * 1220,
      220 + pseudoRandom(index * 5 + 21) * 470,
    );
    dust.addChild(mote);
  }
  return dust;
}

function animateDust(dust: Container | null, elapsedSeconds: number): void {
  if (!dust) {
    return;
  }
  dust.children.forEach((mote, index) => {
    mote.y += Math.sin(elapsedSeconds * 0.5 + index) * 0.055;
    mote.x += Math.cos(elapsedSeconds * 0.32 + index * 1.7) * 0.025;
    mote.alpha = 0.14 + (Math.sin(elapsedSeconds * 0.9 + index) + 1) * 0.13;
  });
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 91.345) * 47453.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
