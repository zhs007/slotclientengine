import { _decorator, Component, JsonAsset, Node, SpriteAtlas } from "cc";
import {
  assertV5GProject,
  createV5GCocosPlayer,
  validateCocosV5GProject,
  type V5GCocosPlaybackState,
  type V5GCocosPlayer,
} from "./anieditorv5runtime-cc";

const { ccclass, property } = _decorator;

@ccclass("V5GPreview")
export class V5GPreview extends Component {
  @property(Node)
  root: Node | null = null;

  @property(JsonAsset)
  projectJson: JsonAsset | null = null;

  @property(SpriteAtlas)
  atlas: SpriteAtlas | null = null;

  @property(Boolean)
  segmentedPreview = false;

  @property(Number)
  segmentedLoopStart = 0;

  @property(Number)
  segmentedLoopEnd = 0;

  private player: V5GCocosPlayer | null = null;
  private lastPlaybackEventId = "";
  private completedPlaybackTasks = 0;

  start(): void {
    if (!this.root) {
      throw new Error("V5GPreview.root must be assigned.");
    }
    if (!this.projectJson) {
      throw new Error(
        "V5GPreview.projectJson must be assigned to the selected V5G/VNI project, for example runtime_50/project.json.",
      );
    }
    if (!this.atlas) {
      throw new Error("V5GPreview.atlas must be assigned.");
    }

    const project = assertV5GProject(this.projectJson.json);
    validateCocosV5GProject(project);

    this.player = createV5GCocosPlayer({
      root: this.root,
      project,
      assets: {
        atlas: this.atlas,
      },
      loop: true,
    });
    // All image assets used by project.assets must exist in this atlas as the asset.path filename without extension.
    // The runtime fails fast when a frame is missing; it never guesses resource names.
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
    if (this.segmentedPreview) {
      const loopStart = Math.max(
        0,
        Math.min(project.stage.duration, this.segmentedLoopStart),
      );
      const loopEnd = Math.max(
        loopStart,
        Math.min(project.stage.duration, this.segmentedLoopEnd),
      );
      this.player.play({
        mode: "segmented",
        loopStart: { unit: "time", at: loopStart },
        loopEnd: { unit: "time", at: loopEnd },
        keepParticlesAlive: true,
      });
    } else {
      this.player.playRange({
        range: { unit: "time", start: 0, end: previewEndTime },
        loop: false,
      });
    }
  }

  update(deltaTime: number): void {
    this.player?.update(deltaTime);
  }

  requestSegmentedPlaybackEnd(): void {
    this.player?.requestSegmentedPlaybackEnd();
  }

  getPlaybackState(): V5GCocosPlaybackState | null {
    return this.player?.getPlaybackState() ?? null;
  }

  onDestroy(): void {
    this.player?.destroy();
    this.player = null;
  }
}
