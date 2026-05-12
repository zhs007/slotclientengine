import layer00Url from "../assets/bg/layer-00.png";
import layer01Url from "../assets/bg/layer-01.png";
import layer02Url from "../assets/bg/layer-02.png";
import layer03Url from "../assets/bg/layer-03.png";
import layer04Url from "../assets/bg/layer-04.png";
import layer05Url from "../assets/bg/layer-05.png";
import layer06Url from "../assets/bg/layer-06.png";
import layer07Url from "../assets/bg/layer-07.png";
import layer08Url from "../assets/bg/layer-08.png";
import layer09Url from "../assets/bg/layer-09.png";
import layer10Url from "../assets/bg/layer-10.png";
import layer11Url from "../assets/bg/layer-11.png";
import layer12Url from "../assets/bg/layer-12.png";
import layer13Url from "../assets/bg/layer-13.png";
import layer14Url from "../assets/bg/layer-14.png";
import type { CodeAnimationProject } from "./types.js";

export const bgProject: CodeAnimationProject = {
  id: "bg",
  label: "bg",
  duration: 3,
  size: { width: 1200, height: 600 },
  layers: [
    {
      id: "刷光",
      type: "pic",
      texture: layer00Url,
      x: 255,
      y: 170,
      scaleX: 0.6,
      scaleY: 3,
      rotation: 0.5235987755982988,
      alpha: 1,
      blendMode: "add",
      visible: true,
      maskId: "隐形框_copy_7",
      animations: [
        {
          type: "sweepLight",
          startTime: 0.5,
          duration: 1,
          params: {
            startX: 255,
            endX: 1100,
            startAlpha: 0.5,
            midAlpha: 1,
            endAlpha: 0.8,
          },
        },
      ],
    },
    {
      id: "隐形框_copy_7",
      type: "pic",
      texture: layer01Url,
      x: 600,
      y: 300,
      scaleX: 1.597,
      scaleY: 1.597,
      rotation: 0,
      alpha: 0,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "pulse",
          startTime: 0.5,
          duration: 0.7,
          params: {
            speed: 7,
            scale: 1.01,
            minAlpha: 100,
          },
        },
      ],
    },
    {
      id: "隐形框",
      type: "pic",
      texture: layer02Url,
      x: 600,
      y: 300,
      scaleX: 1.597,
      scaleY: 1.597,
      rotation: 0,
      alpha: 0,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "pulse",
          startTime: 0.5,
          duration: 0.7,
          params: {
            speed: 7,
            scale: 1.01,
            minAlpha: 100,
          },
        },
      ],
    },
    {
      id: "ui框",
      type: "pic",
      texture: layer03Url,
      x: 600,
      y: 300,
      scaleX: 0.4,
      scaleY: 0.4,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "pulse",
          startTime: 0.5,
          duration: 0.7,
          params: {
            speed: 7,
            scale: 1.01,
            minAlpha: 100,
          },
        },
      ],
    },
    {
      id: "光球",
      type: "pic",
      texture: layer04Url,
      x: 600,
      y: 300,
      scaleX: 1.9,
      scaleY: 1.9,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "fadeIn",
          startTime: 0.8,
          duration: 1,
        },
        {
          type: "fadeOut",
          startTime: 1,
          duration: 1,
        },
      ],
    },
    {
      id: "光_copy_9",
      type: "pic",
      texture: layer05Url,
      x: 800,
      y: 310,
      scaleX: -0.9,
      scaleY: 0.9,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "fadeIn",
          startTime: 0.5,
          duration: 0.7,
          params: {
            ease: "power4.inOut",
          },
        },
        {
          type: "swing",
          startTime: 0.5,
          duration: 1,
        },
        {
          type: "fadeOut",
          startTime: 1,
          duration: 0.7,
        },
      ],
    },
    {
      id: "光",
      type: "pic",
      texture: layer06Url,
      x: 400,
      y: 310,
      scaleX: 0.9,
      scaleY: 0.9,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "fadeIn",
          startTime: 0.5,
          duration: 0.7,
          params: {
            ease: "power4.inOut",
          },
        },
        {
          type: "swing",
          startTime: 0.5,
          duration: 1,
        },
        {
          type: "fadeOut",
          startTime: 1,
          duration: 0.7,
        },
      ],
    },
    {
      id: "底光_copy_8",
      type: "pic",
      texture: layer07Url,
      x: 800,
      y: 350,
      scaleX: -0.5,
      scaleY: 0.5,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "fadeIn",
          startTime: 0.5,
          duration: 0.7,
          params: {
            ease: "power4.inOut",
          },
        },
        {
          type: "swing",
          startTime: 0.5,
          duration: 1,
        },
        {
          type: "fadeOut",
          startTime: 1,
          duration: 0.7,
        },
      ],
    },
    {
      id: "底光",
      type: "pic",
      texture: layer08Url,
      x: 400,
      y: 350,
      scaleX: 0.5,
      scaleY: 0.5,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      visible: true,
      animations: [
        {
          type: "fadeIn",
          startTime: 0.5,
          duration: 0.7,
          params: {
            ease: "power4.inOut",
          },
        },
        {
          type: "swing",
          startTime: 0.5,
          duration: 1,
        },
        {
          type: "fadeOut",
          startTime: 1,
          duration: 0.7,
        },
      ],
    },
    {
      id: "底1",
      type: "pic",
      texture: layer09Url,
      x: 600,
      y: 300,
      scaleX: 0.4,
      scaleY: 0.4,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "fadeOut",
          startTime: 0.5,
          duration: 1,
        },
      ],
    },
    {
      id: "Layer_003_copy_4_copy_6_copy_7",
      type: "pic",
      texture: layer10Url,
      x: 318,
      y: 394,
      scaleX: -1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "starlight",
          startTime: 1.2,
          duration: 2,
          params: {
            range: 30,
            count: 15,
            size: 15,
          },
        },
      ],
    },
    {
      id: "Layer_003_copy_4_copy_6",
      type: "pic",
      texture: layer11Url,
      x: 882,
      y: 391,
      scaleX: -1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "starlight",
          startTime: 1,
          duration: 2,
          params: {
            range: 30,
            count: 15,
            size: 15,
          },
        },
      ],
    },
    {
      id: "Layer_003_copy_4",
      type: "pic",
      texture: layer12Url,
      x: 940,
      y: 455,
      scaleX: -1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "starlight",
          startTime: 1.1,
          duration: 2,
          params: {
            range: 100,
            count: 30,
            size: 23,
          },
        },
      ],
    },
    {
      id: "Layer_003",
      type: "pic",
      texture: layer13Url,
      x: 262,
      y: 465,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "starlight",
          startTime: 1,
          duration: 2,
          params: {
            range: 100,
            count: 20,
            size: 20,
          },
        },
      ],
    },
    {
      id: "底2",
      type: "pic",
      texture: layer14Url,
      x: 600,
      y: 300,
      scaleX: 0.4,
      scaleY: 0.4,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [],
    },
  ],
};
