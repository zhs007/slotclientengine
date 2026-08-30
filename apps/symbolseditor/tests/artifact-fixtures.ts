const PNG_FIXTURES = {
  H1: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  H2: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
} as const;

export function readSymbolArtifactFixtureBytes(
  name: string,
): Uint8Array<ArrayBuffer> {
  if (name === "H1.png" || name === "Symbol.png")
    return decodeBase64(PNG_FIXTURES.H1);
  if (name === "H2.png") return decodeBase64(PNG_FIXTURES.H2);
  if (name === "H1.json")
    return encode({
      skeleton: { spine: "4.3.23", width: 160, height: 160 },
      bones: [{ name: "root" }],
      slots: ["Number", "Num"].map((slot) => ({ name: slot, bone: "root" })),
      skins: [{ name: "default", attachments: {} }],
      animations: { Idle: {}, Loop: {}, Win: {} },
    });
  if (name === "Symbol.atlas")
    return new TextEncoder().encode(
      "Symbol.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\n",
    );
  if (name === "L1-wins.json") return encode(runtimeVniProject());
  throw new Error(`Unknown Symbols Editor test fixture: ${name}.`);
}

function runtimeVniProject() {
  return {
    schemaVersion: "VNI_0.087",
    editor: { name: "VNI", version: "VNI_0.087" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "symbol-win",
    stage: {
      width: 160,
      height: 160,
      coordinate: "center",
      duration: 1,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset-image",
        type: "image",
        path: "assets/vni-image.png",
        originalName: "A.png",
        width: 1,
        height: 1,
        fileWidth: 1,
        fileHeight: 1,
        fileScale: 1,
      },
    ],
    layerGroups: [
      {
        id: "group-default",
        name: "default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [],
    particles: [],
    exportProfile: { id: "runtime", purpose: "runtime", assetScale: 1 },
    maskCompositeMode: "precompose_light_alpha",
  };
}

function encode(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const character of value.replace(/=+$/u, "")) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Invalid embedded base64 fixture.");
    bits = (bits << 6) | digit;
    bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    output.push((bits >> bitCount) & 0xff);
  }
  return Uint8Array.from(output);
}
