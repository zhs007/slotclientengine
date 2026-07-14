import backgroundManifest from "../../../assets/game002-s3/background.manifest.json";
import backgroundSkeleton from "../../../assets/game002-s3/BG.json";
import backgroundAtlasRaw from "../../../assets/game002-s3/BG.atlas?raw";
import { createSpineBackgroundResource } from "@slotclientengine/rendercore/background";

const rawBackgroundTextureModules = import.meta.glob(
  "../../../assets/game002-s3/{BG,BG_2,BG_3,BG_4,BG_5,BG_6,BG_7,BG_8}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const backgroundTextureModules = createAtlasPageUrlModules(
  rawBackgroundTextureModules,
);

export const GAME002_BACKGROUND_RESOURCE = createSpineBackgroundResource({
  manifest: backgroundManifest,
  skeletonModules: Object.freeze({
    "../../../assets/game002-s3/BG.json": backgroundSkeleton,
  }),
  atlasModules: Object.freeze({
    "../../../assets/game002-s3/BG.atlas": backgroundAtlasRaw,
  }),
  textureModules: backgroundTextureModules,
});

export const GAME002_BACKGROUND_MANIFEST = GAME002_BACKGROUND_RESOURCE.manifest;

function createAtlasPageUrlModules(
  modules: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules).map(([modulePath, url]) => {
        const page = modulePath.split("/").at(-1);
        if (!page) {
          throw new Error(
            `Cannot derive background atlas page: ${modulePath}.`,
          );
        }
        const separator = url.includes("?") ? "&" : "?";
        return [
          modulePath,
          `${url}${separator}spineAtlasPage=${encodeURIComponent(page)}`,
        ];
      }),
    ),
  );
}
