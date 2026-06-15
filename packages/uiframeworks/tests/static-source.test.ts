import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("static source restrictions", () => {
  it("keeps the framework free of canvas, image HUD assets, icon fonts, and old CSS icons", () => {
    const source = readSourceFiles();

    expect(source).not.toMatch(
      /createElement\(['"]canvas|new OffscreenCanvas|<canvas/,
    );
    expect(source).not.toMatch(/\.png|\.jpg|\.jpeg/);
    expect(source).not.toMatch(/icon-font|@font-face/);
    expect(source).not.toMatch(
      /slot-ui-speaker|slot-ui-sound-wave|slot-ui-fast-bolt|slot-ui-spin-ring|slot-ui-info-button|slot-ui-settings-button/,
    );
    expect(source).not.toMatch(/slot-ui-bet-block\s+\.slot-ui-value-number/);
    expect(source).toMatch(
      /\.slot-ui-menu-button\s*\{[\s\S]*?color:\s*#ffffff;[\s\S]*?background:\s*transparent;/,
    );
    expect(source).toMatch(
      /\.slot-ui-win-block\s*\{[\s\S]*?grid-column:\s*1 \/ 6;[\s\S]*?text-align:\s*center;/,
    );
  });
});

function readSourceFiles(): string {
  const sourceDir = resolve(__dirname, "../src");
  return readdirSync(sourceDir)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".css"))
    .map((file) => readFileSync(resolve(sourceDir, file), "utf8"))
    .join("\n");
}
