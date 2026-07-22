export const NEUTRAL_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8QZVwAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);
