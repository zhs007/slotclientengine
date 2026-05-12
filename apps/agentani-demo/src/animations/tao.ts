import layer00Url from "../assets/tao/layer-00.png";
import layer01Url from "../assets/tao/layer-01.png";
import layer04Url from "../assets/tao/layer-04.png";
import layer06Url from "../assets/tao/layer-06.png";
import layer07Url from "../assets/tao/layer-07.png";
import layer08Url from "../assets/tao/layer-08.png";
import type { CodeAnimationProject } from "./types.js";

export const taoProject: CodeAnimationProject = {
  id: "tao",
  label: "tao",
  duration: 1.5,
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
            minAlpha: 30,
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
      alpha: 0.21,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "particleBurst",
          startTime: 0.45,
          duration: 0.2,
          params: {
            count: 60,
            range: 210,
            speed: 3,
            emissionTime: 0.05,
          },
        },
      ],
    },
    {
      id: "flowers",
      type: "pic",
      texture: layer04Url,
      x: 857,
      y: 357.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      mergedLayerIds: ["flowers_copy_24", "flowers_copy_25", "flowers"],
      animations: [
        {
          type: "pulse",
          startTime: 0,
          duration: 0.5,
          params: {
            scale: 1.35,
            minAlpha: 80,
            maxAlpha: 80,
          },
        },
      ],
    },
    {
      id: "tao",
      type: "pic",
      texture: layer06Url,
      x: 849,
      y: 398,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      mergedLayerIds: ["mei_copy_26", "tao"],
      animations: [
        {
          type: "pulse",
          startTime: 0,
          duration: 0.5,
          params: {
            scale: 1.2,
          },
        },
      ],
    },
    {
      id: "shangguang",
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
            scale: 1.02,
            minAlpha: 0,
            maxAlpha: 50,
            speed: 2,
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
