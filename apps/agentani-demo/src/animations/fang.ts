import layer00Url from "../assets/fang/layer-00.png";
import layer01Url from "../assets/fang/layer-01.png";
import layer04Url from "../assets/fang/layer-04.png";
import layer06Url from "../assets/fang/layer-06.png";
import layer07Url from "../assets/fang/layer-07.png";
import layer08Url from "../assets/fang/layer-08.png";
import type { CodeAnimationProject } from "./types.js";

export const fangProject: CodeAnimationProject = {
  id: "fang",
  label: "fang",
  duration: 1,
  size: { width: 1200, height: 600 },
  layers: [
    {
      id: "guang",
      type: "pic",
      texture: layer00Url,
      x: 831,
      y: 360,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 0,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "pulse",
          startTime: 0.5,
          duration: 0.5,
          params: {
            minAlpha: 20,
            maxAlpha: 0,
            speed: 0.8,
            scale: 1,
          },
        },
      ],
    },
    {
      id: "fassan",
      type: "pic",
      texture: layer01Url,
      x: 848,
      y: 348,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 0,
      alpha: 0.3,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "particleBurst",
          startTime: 0.45,
          duration: 0.2,
          params: {
            count: 60,
            range: 200,
            speed: 3,
            emissionTime: 0.05,
          },
        },
      ],
    },
    {
      id: "hua",
      type: "pic",
      texture: layer04Url,
      x: 847,
      y: 357.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      mergedLayerIds: ["hua_copy_1", "hua_copy_6", "hua"],
      animations: [
        {
          type: "pulse",
          startTime: 0,
          duration: 0.5,
          params: {
            speed: 0,
            scale: 1.3,
            minAlpha: 30,
            maxAlpha: 30,
          },
        },
      ],
    },
    {
      id: "fang",
      type: "pic",
      texture: layer06Url,
      x: 845.5,
      y: 398.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      mergedLayerIds: ["fang_copy_3", "fang"],
      animations: [
        {
          type: "pulse",
          startTime: 0,
          duration: 0.5,
          params: {
            scale: 1.3,
          },
        },
      ],
    },
    {
      id: "Layer_007",
      type: "pic",
      texture: layer07Url,
      x: 841,
      y: 387,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 0,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "pulse",
          startTime: 0.4,
          duration: 0.5,
          params: {
            speed: 2,
            scale: 1.02,
            maxAlpha: 50,
          },
        },
      ],
    },
    {
      id: "bg",
      type: "pic",
      texture: layer08Url,
      x: 844.5,
      y: 386,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [],
    },
  ],
};
