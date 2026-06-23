import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";

export interface BasicPlayerArgs {
  container: HTMLElement;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
}

export async function createBasicPlayer(
  args: BasicPlayerArgs,
): Promise<VNIPlayer> {
  const player = new VNIPlayer({
    container: args.container,
    projectId: args.project.name,
    bundleId: "example",
    profileId: args.project.exportProfile?.id ?? "full",
    profilePurpose: args.project.exportProfile?.purpose ?? "legacy",
    assetScale: args.project.exportProfile?.assetScale ?? 1,
    project: args.project,
    assetUrls: args.assetUrls,
  });

  await player.init();
  player.play();
  player.seek(0);
  return player;
}

export function destroyBasicPlayer(player: VNIPlayer): void {
  player.pause();
  player.destroy();
}
