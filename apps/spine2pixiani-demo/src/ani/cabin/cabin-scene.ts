import { Container, Sprite, Texture } from "pixi.js";
import { applySlotVisual, createSlotSprite } from "../../runtime/display-factory.js";
import {
  composeAttachmentTransform,
  computeWorldBoneTransforms,
  sampleAnimationPose
} from "../../runtime/timeline-sampler.js";
import type { SampledAnimationPose, SpineModel } from "../../runtime/spine-types.js";
import { getBoneDebugNodeId } from "../../runtime/debug-tree.js";

export class CabinScene {
  readonly view = new Container();
  private boneLayer = new Container();
  private slotLayer = new Container();
  private debugLayer = new Container();
  private boneNodes = new Map<string, Container>();
  private slotNodes = new Map<string, ReturnType<typeof createSlotSprite>>();
  private boneMarkers = new Map<string, Sprite>();
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

    const worldBones = computeWorldBoneTransforms(this.model, pose.bones);
    for (const bone of this.model.bones) {
      const marker = this.boneMarkers.get(bone.name);
      const world = worldBones[bone.name];
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

      const world = composeAttachmentTransform(worldBones[slotPose.boneName], slotPose.attachment);
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