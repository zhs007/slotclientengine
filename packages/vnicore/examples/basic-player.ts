import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";
import { VNIPlayer } from "@slotclientengine/vnicore/pixi";
import { Application } from "pixi.js";

export interface BasicPlayerArgs {
  container: HTMLElement;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  textReplacement?: {
    layerId: string;
    text: string;
  };
}

export interface BasicPlayerHandle {
  readonly app: Application;
  readonly player: VNIPlayer;
  readonly disposeTextReplacement?: () => void;
}

export async function createBasicPlayer(
  args: BasicPlayerArgs,
): Promise<BasicPlayerHandle> {
  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  args.container.replaceChildren(app.canvas);
  const viewport = {
    width: args.container.clientWidth || 1,
    height: args.container.clientHeight || 1,
  };
  app.renderer.resize(viewport.width, viewport.height);
  const player = new VNIPlayer({
    parent: app.stage,
    diagnosticsElement: args.container,
    viewport,
    requestRender: () => app.render(),
    projectId: args.project.name,
    bundleId: "example",
    profileId: args.project.exportProfile?.id ?? "full",
    profilePurpose: args.project.exportProfile?.purpose ?? "legacy",
    assetScale: args.project.exportProfile?.assetScale ?? 1,
    project: args.project,
    assetUrls: args.assetUrls,
  });

  await player.init();
  const textBinding = args.textReplacement
    ? player.attachTextToTextLayer({
        id: "basic-player-text-replacement",
        layerId: args.textReplacement.layerId,
        text: args.textReplacement.text,
      })
    : null;
  player.play();
  player.seek(0);
  return { app, player, disposeTextReplacement: textBinding?.dispose };
}

export function destroyBasicPlayer(handle: BasicPlayerHandle): void {
  handle.disposeTextReplacement?.();
  handle.player.pause();
  handle.player.destroy();
  handle.app.destroy({ removeView: true });
}
