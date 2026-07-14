import resource0Url from "../../../../assets/game002-s3/CN.spinBlur.png?url";
import resource1Url from "../../../../assets/game002-s3/CN.disabled.png?url";
import resource2Data from "../../../../assets/game002-s3/CN_1.json";
import resource2Url from "../../../../assets/game002-s3/CN_1.json?url";
import resource3Raw from "../../../../assets/game002-s3/Symbol.atlas?raw";
import resource3Url from "../../../../assets/game002-s3/Symbol.atlas?url";
import resource4Url from "../../../../assets/game002-s3/Symbol.png?url";
import resource5Data from "../../../../assets/game002-s3/CN_2.json";
import resource5Url from "../../../../assets/game002-s3/CN_2.json?url";
import resource6Data from "../../../../assets/game002-s3/CN_3.json";
import resource6Url from "../../../../assets/game002-s3/CN_3.json?url";
import resource7Data from "../../../../assets/game002-s3/CN_4.json";
import resource7Url from "../../../../assets/game002-s3/CN_4.json?url";

// 此文件由 generate-symbol-value-vite-resources.mjs 生成，禁止手改。
export const symbolValueSpineSkeletonModules = Object.freeze({
  "./CN_1.json": resource2Data,
  "./CN_2.json": resource5Data,
  "./CN_3.json": resource6Data,
  "./CN_4.json": resource7Data,
});
export const symbolValueSpineAtlasModules = Object.freeze({
  "./Symbol.atlas": resource3Raw,
});
export const symbolValueSpineTextureModules = Object.freeze({
  "./Symbol.png": resource4Url,
});
export const symbolValueReelStateTextureModules = Object.freeze({
  "./CN.spinBlur.png": resource0Url,
  "./CN.disabled.png": resource1Url,
});
export const symbolValueLoadingResources = Object.freeze([
  Object.freeze({
    path: "./CN.spinBlur.png",
    kind: "state-texture",
    url: resource0Url,
  }),
  Object.freeze({
    path: "./CN.disabled.png",
    kind: "state-texture",
    url: resource1Url,
  }),
  Object.freeze({
    path: "./CN_1.json",
    kind: "skeleton",
    url: resource2Url,
  }),
  Object.freeze({
    path: "./Symbol.atlas",
    kind: "atlas",
    url: resource3Url,
  }),
  Object.freeze({
    path: "./Symbol.png",
    kind: "texture",
    url: resource4Url,
  }),
  Object.freeze({
    path: "./CN_2.json",
    kind: "skeleton",
    url: resource5Url,
  }),
  Object.freeze({
    path: "./CN_3.json",
    kind: "skeleton",
    url: resource6Url,
  }),
  Object.freeze({
    path: "./CN_4.json",
    kind: "skeleton",
    url: resource7Url,
  }),
]);
