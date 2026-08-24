const PREFIX = "gamelayout:/";

export type GameLayoutRuntimeAddress = `gamelayout:/${string}`;

export type GameLayoutRuntimeAddressKind =
  | "layer"
  | "render-object"
  | "render-object-instance"
  | "reel"
  | "symbol-package"
  | "mode"
  | "mode-bgm"
  | "transition"
  | "popup"
  | "popup-instance"
  | "popup-layer"
  | "popup-string"
  | "audio-music"
  | "audio-effect"
  | "resource-factory"
  | "event";

export interface GameLayoutRuntimeAddressDescriptor {
  readonly address: GameLayoutRuntimeAddress;
  readonly kind: GameLayoutRuntimeAddressKind;
  readonly ownerAddress: GameLayoutRuntimeAddress | null;
  readonly authored: boolean;
  readonly capability: "structural" | "borrowed" | "caller-owned" | "event";
  readonly detail?: Readonly<Record<string, string | number | boolean | null>>;
}

export function formatGameLayoutRuntimeAddress(
  ...segments: readonly string[]
): GameLayoutRuntimeAddress {
  if (segments.length === 0)
    throw new Error(
      "Game Layout runtime address requires at least one segment.",
    );
  return parseGameLayoutRuntimeAddress(
    `${PREFIX}${segments.map(encodeSegment).join("/")}`,
  );
}

export function parseGameLayoutRuntimeAddress(
  value: string,
): GameLayoutRuntimeAddress {
  if (!value.startsWith(PREFIX))
    throw new Error(
      'Game Layout runtime address must start with "gamelayout:/".',
    );
  if (value.includes("?") || value.includes("#") || value.endsWith("/"))
    throw new Error(
      "Game Layout runtime address must not contain query, fragment, or trailing slash.",
    );
  const encoded = value.slice(PREFIX.length).split("/");
  if (encoded.length === 0 || encoded.some((segment) => segment.length === 0))
    throw new Error("Game Layout runtime address contains an empty segment.");
  for (const segment of encoded) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error(
        "Game Layout runtime address contains invalid percent encoding.",
      );
    }
    if (decoded === "." || decoded === "..")
      throw new Error(
        "Game Layout runtime address contains a forbidden segment.",
      );
    if (encodeSegment(decoded) !== segment)
      throw new Error(
        "Game Layout runtime address is not canonically encoded.",
      );
  }
  return value as GameLayoutRuntimeAddress;
}

export function splitGameLayoutRuntimeAddress(
  address: GameLayoutRuntimeAddress,
): readonly string[] {
  parseGameLayoutRuntimeAddress(address);
  return Object.freeze(
    address
      .slice(PREFIX.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment)),
  );
}

function encodeSegment(value: string): string {
  if (!value || value === "." || value === "..")
    throw new Error("Game Layout runtime address segment is invalid.");
  return encodeURIComponent(value);
}
