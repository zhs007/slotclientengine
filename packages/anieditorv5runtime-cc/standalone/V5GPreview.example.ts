import { _decorator, Component, JsonAsset, Node, SpriteAtlas } from "cc";
import {
  assertV5GProject,
  createV5GCocosPlayer,
  validateCocosV5GProject,
  type V5GCocosPlaybackEventContext,
  type V5GCocosManualPlaybackSession,
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

  @property(Boolean)
  manualBambooPreview = false;

  // Each entry is a host-owned complex subtree:
  // Card Content Root -> art Sprite + value Label + decoration child Node.
  @property([Node])
  bambooCarrierNodes: Node[] = [];

  // Optional new server-result card. Leave empty to select existing card 07.
  @property(Node)
  bambooReplacementNode: Node | null = null;

  private player: V5GCocosPlayer | null = null;
  private manualSession: V5GCocosManualPlaybackSession<Node> | null = null;
  private slotProbeDispose: (() => void) | null = null;
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

    const firstSlot = this.player.getLayerGroupSlots()[0];
    if (firstSlot) {
      const slotProbe = new Node("V5GPreview Slot Probe");
      this.slotProbeDispose = this.player.attachNodeBetweenLayerGroups({
        id: "preview-slot-probe",
        afterGroupId: firstSlot.afterGroupId,
        beforeGroupId: firstSlot.beforeGroupId,
        node: slotProbe,
      });
    }

    const previewEndTime = Math.min(project.stage.duration, 4);
    const previewFps = 60;
    const midpointFrame = Math.floor((previewEndTime / 2) * previewFps);
    if (midpointFrame > 0) {
      this.player.addPlaybackEvent({
        id: "preview-midpoint-frame",
        at: { unit: "frame", at: midpointFrame, fps: previewFps },
        once: true,
        listener: (event: V5GCocosPlaybackEventContext) => {
          this.lastPlaybackEventId = event.id;
        },
      });
    }
    this.player.addPlaybackEvent({
      id: "preview-end-time",
      at: { unit: "time", at: previewEndTime },
      once: true,
      listener: (event: V5GCocosPlaybackEventContext) => {
        this.lastPlaybackEventId = event.id;
      },
    });
    this.player.onPlaybackComplete(() => {
      this.completedPlaybackTasks += 1;
    });
    if (this.manualBambooPreview) {
      void this.runBambooManualPreview();
    } else if (this.segmentedPreview) {
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

  private async runBambooManualPreview(): Promise<void> {
    const player = this.player;
    if (!player) throw new Error("V5GPreview player is not initialized.");
    if (this.bambooCarrierNodes.length !== 13) {
      throw new Error(
        "V5GPreview manual Bamboo fixture requires exactly 13 complex carrier Nodes.",
      );
    }
    const session = player.createManualPlaybackSession();
    this.manualSession = session;
    try {
      const cyclic = session
        .getAnimation({
          layerId: "layer_sequence_mrupvsr0_7",
          animationId: "anim_module_mrupw05e_8",
        })
        .requireCyclicSelection();
      const descriptor = cyclic.getAuthoredPreviewDescriptor();
      await cyclic.setInitialItems(
        this.bambooCarrierNodes.map((node, index) => ({
          key: `bamboo-card-${index < 10 ? "0" : ""}${index}`,
          visual: {
            kind: "node",
            node,
            width: 720,
            height: 720,
            revision: "initial-v1",
          },
        })),
      ).ready;

      await session.playRange({ range: descriptor.introRange }).completed;
      const hold = session.holdTimeline({
        at: descriptor.continuousHoldPoint,
      });
      cyclic.startContinuousPhase({
        phaseId: descriptor.continuousPhaseId,
      });

      // Fixture for waiting on user/server work without timers: update(deltaTime)
      // advances this operation while the authored timeline remains at 1.5s.
      await session.advanceFor({ durationSeconds: 1.5 }).completed;
      const transaction = this.bambooReplacementNode
        ? cyclic.prepareSelection({
            selectedItem: {
              key: "bamboo-server-result-new",
              visual: {
                kind: "node",
                node: this.bambooReplacementNode,
                width: 720,
                height: 720,
                revision: "result-v1",
              },
            },
          })
        : cyclic.prepareSelection({
            selectedItem: { key: "bamboo-card-07" },
          });
      await transaction.committed;

      hold.release();
      cyclic.startResolvePhase();
      await session.playRange({
        range: descriptor.endingRange,
        preserveRuntimeAnimationState: true,
      }).completed;
    } finally {
      session.destroy();
      if (this.manualSession === session) {
        this.manualSession = null;
      }
    }
  }

  update(deltaTime: number): void {
    this.player?.update(deltaTime);
  }

  requestSegmentedPlaybackEnd(): void {
    this.player?.requestSegmentedPlaybackEnd();
  }

  requestSegmentedPlaybackEndAndForceStopParticles(): void {
    this.player?.requestSegmentedPlaybackEnd({ forceStopParticles: true });
  }

  forceStopAllParticles(): void {
    this.player?.forceStopAllParticles();
  }

  getPlaybackState(): V5GCocosPlaybackState | null {
    return this.player?.getPlaybackState() ?? null;
  }

  getRuntimeDiagnostics(): ReturnType<
    V5GCocosPlayer["getRuntimeDiagnostics"]
  > | null {
    return this.player?.getRuntimeDiagnostics() ?? null;
  }

  onDestroy(): void {
    this.slotProbeDispose?.();
    this.slotProbeDispose = null;
    this.manualSession?.destroy();
    this.manualSession = null;
    this.player?.destroy();
    this.player = null;
  }
}
