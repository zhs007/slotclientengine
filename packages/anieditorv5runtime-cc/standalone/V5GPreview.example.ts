import { _decorator, Component, JsonAsset, Node, SpriteFrame } from "cc";
import {
  assertV5GProject,
  createV5GCocosPlayer,
  validateCocosV5GProject,
  type V5GCocosAssetResolver,
  type V5GCocosPlayer,
  type V5GProjectConfig,
} from "./anieditorv5runtime-cc";

const { ccclass, property } = _decorator;

@ccclass("V5GPreview")
export class V5GPreview extends Component {
  @property(Node)
  root: Node | null = null;

  @property(JsonAsset)
  projectJson: JsonAsset | null = null;

  @property([String])
  assetIds: string[] = [];

  @property([SpriteFrame])
  spriteFrames: SpriteFrame[] = [];

  private player: V5GCocosPlayer | null = null;
  private lastPlaybackEventId = "";
  private completedPlaybackTasks = 0;

  start(): void {
    if (!this.root) {
      throw new Error("V5GPreview.root must be assigned.");
    }
    if (!this.projectJson) {
      throw new Error("V5GPreview.projectJson must be assigned by host code.");
    }

    const project = assertV5GProject(this.projectJson.json);
    validateCocosV5GProject(project);
    const spriteFramesByAssetId = this.createSpriteFrameMap(project);
    const resolver: V5GCocosAssetResolver = {
      getSpriteFrame(_assetPath, assetId) {
        return spriteFramesByAssetId.get(assetId) ?? null;
      },
    };

    this.player = createV5GCocosPlayer({
      root: this.root,
      project,
      assets: resolver,
      loop: true,
    });
    this.player.init();

    const previewEndTime = Math.min(project.stage.duration, 4);
    const previewFps = 60;
    const midpointFrame = Math.floor((previewEndTime / 2) * previewFps);
    if (midpointFrame > 0) {
      this.player.addPlaybackEvent({
        id: "preview-midpoint-frame",
        at: { unit: "frame", at: midpointFrame, fps: previewFps },
        once: true,
        listener: (event) => {
          this.lastPlaybackEventId = event.id;
        },
      });
    }
    this.player.addPlaybackEvent({
      id: "preview-end-time",
      at: { unit: "time", at: previewEndTime },
      once: true,
      listener: (event) => {
        this.lastPlaybackEventId = event.id;
      },
    });
    this.player.onPlaybackComplete(() => {
      this.completedPlaybackTasks += 1;
    });
    this.player.playRange({
      range: { unit: "time", start: 0, end: previewEndTime },
      loop: false,
    });
  }

  update(deltaTime: number): void {
    this.player?.update(deltaTime);
  }

  onDestroy(): void {
    this.player?.destroy();
    this.player = null;
  }

  private createSpriteFrameMap(
    project: V5GProjectConfig,
  ): ReadonlyMap<string, SpriteFrame> {
    if (this.assetIds.length !== this.spriteFrames.length) {
      throw new Error(
        "V5GPreview.assetIds and spriteFrames must have the same length.",
      );
    }

    const spriteFramesByAssetId = new Map<string, SpriteFrame>();
    this.assetIds.forEach((assetId, index) => {
      if (!assetId) {
        throw new Error(`V5GPreview.assetIds[${index}] must be non-empty.`);
      }
      if (spriteFramesByAssetId.has(assetId)) {
        throw new Error(`Duplicate V5GPreview asset id binding: ${assetId}.`);
      }
      const spriteFrame = this.spriteFrames[index];
      if (!spriteFrame) {
        throw new Error(
          `Missing SpriteFrame binding for V5G asset ${assetId}.`,
        );
      }
      spriteFramesByAssetId.set(assetId, spriteFrame);
    });

    for (const asset of project.assets) {
      if (!spriteFramesByAssetId.has(asset.id)) {
        throw new Error(
          `Missing SpriteFrame binding for V5G asset "${asset.id}" at "${asset.path}".`,
        );
      }
    }

    return spriteFramesByAssetId;
  }
}
