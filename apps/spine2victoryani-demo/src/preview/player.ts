import { Container, Sprite, Texture, type Application } from "pixi.js";
import type { VictoryLayerConfig, VictoryProjectConfig } from "../config/victory-types.js";
import { sampleTimelineLayer } from "./timeline.js";

type LayerInstance = {
  index: number;
  layer: VictoryLayerConfig;
  sprite: Sprite;
};

const DRAW_ORDER_STRIDE = 1000;

function resolveBlendMode(blendMode: string) {
  if (blendMode === "additive") {
    return "add";
  }
  return blendMode || "normal";
}

export class ExportPreviewPlayer {
  readonly root = new Container();
  private readonly instances: LayerInstance[];
  private time = 0;
  private playing = false;
  private loop = true;

  constructor(
    private readonly app: Application,
    private readonly project: VictoryProjectConfig,
    textures: Map<string, Texture>
  ) {
    this.root.sortableChildren = true;
    this.instances = [...project.layers]
      .map((layer, index) => {
        const sprite = new Sprite(textures.get(layer.asset) ?? Texture.WHITE);
        sprite.anchor.set(0.5);
        sprite.blendMode = resolveBlendMode(layer.blendMode) as never;
        this.root.addChild(sprite);
        return {
          index,
          layer,
          sprite
        };
      });

    this.applyTime(0);
  }

  setLoop(loop: boolean) {
    this.loop = loop;
  }

  play() {
    this.playing = true;
  }

  stop() {
    this.playing = false;
    this.time = 0;
    this.applyTime(0);
  }

  replay() {
    this.time = 0;
    this.applyTime(0);
    this.play();
  }

  isPlaying() {
    return this.playing;
  }

  update(deltaSeconds: number) {
    if (this.playing) {
      this.time += deltaSeconds;
      if (this.time > this.project.duration) {
        if (this.loop && this.project.duration > 0) {
          this.time %= this.project.duration;
        } else {
          this.time = this.project.duration;
          this.playing = false;
        }
      }

      this.applyTime(this.time);
    }

    this.app.renderer.render(this.app.stage);
  }

  private applyTime(time: number) {
    for (const instance of this.instances) {
      const sample = sampleTimelineLayer(instance.layer, time);
      instance.sprite.position.set(sample.x, sample.y);
      instance.sprite.scale.set(sample.scaleX, sample.scaleY);
      instance.sprite.rotation = sample.rotation;
      instance.sprite.alpha = sample.alpha;
      instance.sprite.visible = sample.visible;
      instance.sprite.zIndex = sample.drawOrder * DRAW_ORDER_STRIDE + instance.index;
    }

    this.root.sortChildren();
  }
}
