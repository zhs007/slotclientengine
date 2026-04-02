import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { applySlotVisual, createSlotSprite } from "../../runtime/display-factory.js";
import {
  computeBoneSelectionBounds,
  computeSlotSelectionBounds,
  createBoneFallbackSelectionBounds,
  createBoneSubtreeSlotIndex,
  type ScenePoint,
  type SelectionBounds
} from "../../runtime/debug-bounds.js";
import {
  composeAttachmentTransform,
  computeWorldBoneTransforms,
  sampleAnimationPose
} from "../../runtime/timeline-sampler.js";
import type { SampledAnimationPose, SpineModel, WorldTransform } from "../../runtime/spine-types.js";
import { getBoneDebugNodeId } from "../../runtime/debug-tree.js";

export class CabinScene {
  readonly view = new Container();
  private boneLayer = new Container();
  private slotLayer = new Container();
  private debugLayer = new Container();
  private boneNodes = new Map<string, Container>();
  private slotNodes = new Map<string, ReturnType<typeof createSlotSprite>>();
  private boneMarkers = new Map<string, Sprite>();
  private selectionOverlay = new Graphics();
  private boneSubtreeSlots = new Map<string, string[]>();
  private currentPose: SampledAnimationPose | null = null;
  private currentWorldBones: Record<string, WorldTransform> = {};
  private selectedNodeId: string | null = null;
  private pickEnabled = true;
  private selectionListeners = new Set<(boneName: string) => void>();

  constructor(
    private readonly model: SpineModel,
    private readonly textures: Record<string, Texture>
  ) {
    this.view.addChild(this.boneLayer);
    this.view.addChild(this.slotLayer);
    this.view.addChild(this.debugLayer);
    this.createBones();
    this.createSlots();
    this.boneSubtreeSlots = createBoneSubtreeSlotIndex(this.model);
    this.selectionOverlay.visible = false;
    this.debugLayer.addChild(this.selectionOverlay);
  }

  private createBones() {
    for (const bone of this.model.bones) {
      const node = new Container();
      node.name = bone.name;
      this.boneNodes.set(bone.name, node);

      const marker = new Sprite(Texture.WHITE);
      marker.name = getBoneDebugNodeId(bone.name);
      marker.anchor.set(0.5);
      marker.width = 12;
      marker.height = 12;
      marker.rotation = Math.PI / 4;
      marker.alpha = 0.36;
      marker.tint = 0x7ad8ff;
      marker.eventMode = "static";
      marker.cursor = "pointer";
      marker.on("pointertap", () => {
        if (!this.pickEnabled) {
          return;
        }
        this.emitBoneSelected(bone.name);
      });
      this.boneMarkers.set(bone.name, marker);
      this.debugLayer.addChild(marker);
    }

    for (const bone of this.model.bones) {
      const node = this.boneNodes.get(bone.name);
      if (!node) {
        continue;
      }
      if (!bone.parentName) {
        this.boneLayer.addChild(node);
        continue;
      }

      const parent = this.boneNodes.get(bone.parentName);
      parent?.addChild(node);
    }
  }

  private createSlots() {
    for (const slotName of this.model.slotOrder) {
      const sprite = createSlotSprite(Texture.EMPTY);
      this.slotNodes.set(slotName, sprite);
      this.slotLayer.addChild(sprite);
    }
  }

  applyPose(pose: SampledAnimationPose) {
    this.currentPose = pose;
    for (const bone of this.model.bones) {
      const node = this.boneNodes.get(bone.name);
      const local = pose.bones[bone.name];
      if (!node || !local) {
        continue;
      }
      node.position.set(local.x, -local.y);
      node.rotation = (-local.rotation * Math.PI) / 180;
      node.scale.set(local.scaleX, local.scaleY);
    }

    this.currentWorldBones = computeWorldBoneTransforms(this.model, pose.bones);
    for (const bone of this.model.bones) {
      const marker = this.boneMarkers.get(bone.name);
      const world = this.currentWorldBones[bone.name];
      if (!marker || !world) {
        continue;
      }

      marker.position.set(world.x, -world.y);
    }

    for (const slotName of pose.drawOrder) {
      const slotPose = pose.slots[slotName];
      const sprite = this.slotNodes.get(slotName);
      if (!slotPose || !sprite) {
        continue;
      }

      applySlotVisual(sprite, slotPose, this.textures);
      if (!slotPose.attachment) {
        continue;
      }

      const world = composeAttachmentTransform(this.currentWorldBones[slotPose.boneName], slotPose.attachment);
      sprite.position.set(world.x, -world.y);
      sprite.rotation = (-world.rotation * Math.PI) / 180;
      sprite.scale.set(world.scaleX, world.scaleY);
    }

    this.refreshSelectionHighlight();
  }

  reset(animationName = "cabin") {
    this.applyPose(sampleAnimationPose(this.model, animationName, 0, true));
  }

  setPickingEnabled(enabled: boolean) {
    this.pickEnabled = enabled;
    for (const marker of this.boneMarkers.values()) {
      marker.eventMode = enabled ? "static" : "none";
      marker.cursor = enabled ? "pointer" : "default";
    }
  }

  setSelectedNode(nodeId: string | null) {
    this.selectedNodeId = nodeId;
    this.refreshSelectionHighlight();
  }

  onBoneSelected(listener: (boneName: string) => void) {
    this.selectionListeners.add(listener);

    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  private emitBoneSelected(boneName: string) {
    for (const listener of this.selectionListeners) {
      listener(boneName);
    }
  }

  private refreshSelectionHighlight() {
    const highlightedBone = this.getHighlightedBoneName();
    for (const [boneName, marker] of this.boneMarkers) {
      const selected = boneName === highlightedBone;
      marker.alpha = selected ? 0.96 : 0.36;
      marker.tint = selected ? 0xf5b24d : 0x7ad8ff;
      marker.width = selected ? 18 : 12;
      marker.height = selected ? 18 : 12;
    }

    this.refreshSelectionOverlay();
  }

  private refreshSelectionOverlay() {
    const selectionBounds = this.getSelectionBounds();
    this.selectionOverlay.clear();
    this.selectionOverlay.visible = selectionBounds !== null;
    if (!selectionBounds) {
      return;
    }

    const polygon = flattenPoints(selectionBounds.corners);

    this.selectionOverlay.lineStyle(0);
    this.selectionOverlay.beginFill(0xffa65c, selectionBounds.kind === "fallback" ? 0.14 : 0.18);
    this.selectionOverlay.drawPolygon(polygon);
    this.selectionOverlay.endFill();

    this.selectionOverlay.lineStyle(14, 0xff6d47, 0.18);
    this.selectionOverlay.drawPolygon(polygon);
    this.selectionOverlay.lineStyle(8, 0xffbf66, 0.72);
    this.selectionOverlay.drawPolygon(polygon);
    this.selectionOverlay.lineStyle(3, 0x8be4ff, 0.96);
    this.selectionOverlay.drawPolygon(polygon);

    this.drawCornerAccents(selectionBounds.corners);
    this.drawCenterCross(selectionBounds.center, selectionBounds.kind === "fallback" ? 18 : 12);
  }

  private drawCornerAccents(corners: readonly ScenePoint[]) {
    this.selectionOverlay.lineStyle(4, 0xfff4c1, 0.95);

    for (let index = 0; index < corners.length; index += 1) {
      const current = corners[index];
      const next = corners[(index + 1) % corners.length];
      const previous = corners[(index + corners.length - 1) % corners.length];

      drawSegment(this.selectionOverlay, current, next, 18);
      drawSegment(this.selectionOverlay, current, previous, 18);
    }
  }

  private drawCenterCross(center: ScenePoint, armLength: number) {
    this.selectionOverlay.lineStyle(3, 0x081019, 0.44);
    this.selectionOverlay.drawCircle(center.x, center.y, armLength * 0.56);
    this.selectionOverlay.lineStyle(3, 0x8be4ff, 0.98);
    this.selectionOverlay.moveTo(center.x - armLength, center.y);
    this.selectionOverlay.lineTo(center.x + armLength, center.y);
    this.selectionOverlay.moveTo(center.x, center.y - armLength);
    this.selectionOverlay.lineTo(center.x, center.y + armLength);
  }

  private getSelectionBounds(): SelectionBounds | null {
    if (!this.selectedNodeId || !this.currentPose) {
      return null;
    }

    if (this.selectedNodeId.startsWith("bone:")) {
      const boneName = this.selectedNodeId.slice("bone:".length);
      return computeBoneSelectionBounds(
        this.currentPose,
        this.currentWorldBones,
        boneName,
        this.boneSubtreeSlots.get(boneName) ?? []
      );
    }

    if (this.selectedNodeId.startsWith("slot:")) {
      const slotName = this.selectedNodeId.slice("slot:".length);
      const slotPose = this.currentPose.slots[slotName];
      if (!slotPose) {
        return null;
      }

      return (
        computeSlotSelectionBounds(this.currentWorldBones[slotPose.boneName], slotPose) ??
        createBoneFallbackSelectionBounds(this.currentWorldBones[slotPose.boneName])
      );
    }

    return null;
  }

  private getHighlightedBoneName() {
    if (!this.selectedNodeId) {
      return null;
    }

    if (this.selectedNodeId.startsWith("bone:")) {
      return this.selectedNodeId.slice("bone:".length);
    }

    if (this.selectedNodeId.startsWith("slot:")) {
      const slotName = this.selectedNodeId.slice("slot:".length);
      const slot = this.model.slots.find((item) => item.name === slotName);
      return slot?.boneName ?? null;
    }

    return null;
  }
}

function flattenPoints(points: readonly ScenePoint[]) {
  return points.flatMap((point) => [point.x, point.y]);
}

function drawSegment(graphics: Graphics, start: ScenePoint, end: ScenePoint, maxLength: number) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1e-6) {
    return;
  }

  const ratio = Math.min(maxLength, length * 0.34) / length;
  graphics.moveTo(start.x, start.y);
  graphics.lineTo(start.x + deltaX * ratio, start.y + deltaY * ratio);
}