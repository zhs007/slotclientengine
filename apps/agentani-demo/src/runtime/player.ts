import { Application, Assets, Container, Texture } from "pixi.js";
import type { gsap } from "gsap";
import type { CodeAnimationProject } from "../animations/types.js";
import { bindLayerMasks } from "./mask-manager.js";
import { createLayer, type BuiltLayer } from "./layer-factory.js";
import { buildProjectTimeline } from "./timeline.js";

export interface ProjectScene {
  root: Container;
  layers: BuiltLayer[];
}

export async function loadProjectTextures(project: CodeAnimationProject) {
  const pairs = await Promise.all(
    project.layers.map(
      async (layer) =>
        [layer.id, await Assets.load<Texture>(layer.texture)] as const,
    ),
  );
  return new Map(pairs);
}

export function createProjectScene(
  project: CodeAnimationProject,
  textures: Map<string, Texture>,
): ProjectScene {
  const root = new Container();
  const layers = project.layers.map((layer) => {
    const texture = textures.get(layer.id);
    if (!texture) {
      throw new Error(`Missing texture for layer "${layer.id}".`);
    }
    return createLayer(layer, texture);
  });

  for (const layer of [...layers].reverse()) {
    root.addChild(layer.container);
  }

  bindLayerMasks(layers);
  return { root, layers };
}

export class AgentAnimationPlayer {
  readonly root = new Container();

  private scene: ProjectScene | null = null;
  private timeline: gsap.core.Timeline | null = null;
  private project: CodeAnimationProject | null = null;
  private textures: Map<string, Texture> | null = null;
  private loop = true;
  private readonly minViewportScale = 0.25;
  private readonly maxViewportScale = 4;

  constructor(private readonly app: Application) {
    this.app.stage.addChild(this.root);
  }

  async load(project: CodeAnimationProject) {
    this.clear();
    this.project = project;
    this.textures = await loadProjectTextures(project);
    this.rebuildScene();
    this.timeline?.play(0);
  }

  private rebuildScene() {
    if (!this.project || !this.textures) {
      return;
    }

    this.timeline?.kill();
    this.timeline = null;
    this.scene?.root.destroy({ children: true });
    this.scene = createProjectScene(this.project, this.textures);
    this.root.removeChildren();
    this.root.addChild(this.scene.root);
    this.timeline = buildProjectTimeline(this.project, this.scene.layers);
    this.timeline.eventCallback("onComplete", () => {
      if (!this.loop) {
        return;
      }
      this.rebuildScene();
      this.timeline?.play(0);
    });
  }

  play() {
    this.timeline?.play();
  }

  pause() {
    this.timeline?.pause();
  }

  replay() {
    this.rebuildScene();
    this.timeline?.play(0);
  }

  setLoop(loop: boolean) {
    this.loop = loop;
  }

  panBy(dx: number, dy: number) {
    this.root.position.set(this.root.x + dx, this.root.y + dy);
  }

  zoomAt(stageX: number, stageY: number, factor: number) {
    const currentScale = this.root.scale.x;
    const nextScale = Math.min(
      this.maxViewportScale,
      Math.max(this.minViewportScale, currentScale * factor),
    );
    if (nextScale === currentScale) {
      return nextScale;
    }

    const localX = (stageX - this.root.x) / currentScale;
    const localY = (stageY - this.root.y) / currentScale;
    this.root.scale.set(nextScale);
    this.root.position.set(
      stageX - localX * nextScale,
      stageY - localY * nextScale,
    );
    return nextScale;
  }

  resetViewport() {
    this.root.position.set(0, 0);
    this.root.scale.set(1);
  }

  clear() {
    this.timeline?.kill();
    this.timeline = null;
    this.scene?.root.destroy({ children: true });
    this.scene = null;
    this.project = null;
    this.textures = null;
    this.root.removeChildren();
  }
}
