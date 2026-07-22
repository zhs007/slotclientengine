# @slotclientengine/browserartifactio

Browser-safe artifact IO primitives: bounded ZIP extraction, deterministic ZIP creation, canonical package-path validation, Web Crypto SHA-256, media sniffing, source-size preflight and revocable Object URL ownership.

Editor-facing filename-key workspace policy is owned by `@slotclientengine/editorresource`. The older logical-id suggestion APIs remain legacy compatibility only; the four editors must not call them. Directory upload is not an editor resource model.

Content-addressed payload paths use the complete lowercase digest: `assets/<64-hex>.<canonical-extension>`. This package allocates and validates physical paths but does not interpret image-string, Popup, Symbols, Scene Layout, Spine or VNI schemas.
