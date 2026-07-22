import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_FILES = Object.freeze([
  "styles.css",
  "assets/font/Anton-Regular.woff2",
  "assets/font/NotoSansR.woff2",
  "assets/controls/addbet.png",
  "assets/controls/removbet.png",
  "assets/controls/image-play.png",
  "assets/controls/image-autoplay.png",
  "assets/controls/image-fastplays.png",
  "assets/controls/image-fasplays-off.png",
  "assets/controls/image-background-music.png",
  "assets/controls/image-background-music-off.png",
]);

for (const relativePath of STATIC_FILES) {
  const sourcePath = join(PACKAGE_ROOT, "src", relativePath);
  const destinationPath = join(PACKAGE_ROOT, "dist", relativePath);
  mkdirSync(dirname(destinationPath), { recursive: true });
  copyFileSync(sourcePath, destinationPath);
}
