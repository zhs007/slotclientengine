import layer00Url from "../assets/bamboo1/layer-00.png";
import layer01Url from "../assets/bamboo1/layer-01.png";
import layer02Url from "../assets/bamboo1/layer-02.png";
import layer03Url from "../assets/bamboo1/layer-03.png";
import layer04Url from "../assets/bamboo1/layer-04.png";
import layer05Url from "../assets/bamboo1/layer-05.png";
import layer06Url from "../assets/bamboo1/layer-06.png";
import layer07Url from "../assets/bamboo1/layer-07.png";
import layer08Url from "../assets/bamboo1/layer-08.png";
import layer09Url from "../assets/bamboo1/layer-09.png";
import layer10Url from "../assets/bamboo1/layer-10.png";
import layer11Url from "../assets/bamboo1/layer-11.png";
import layer12Url from "../assets/bamboo1/layer-12.png";
import layer13Url from "../assets/bamboo1/layer-13.png";
import layer14Url from "../assets/bamboo1/layer-14.png";
import layer15Url from "../assets/bamboo1/layer-15.png";
import layer16Url from "../assets/bamboo1/layer-16.png";
import layer17Url from "../assets/bamboo1/layer-17.png";
import type { CodeAnimationProject } from "./types.js";

export const bamboo1Project: CodeAnimationProject = {
  id: "竹子1",
  label: "竹子1",
  duration: 5,
  size: { width: 1200, height: 600 },
  layers: [
    {
      id: "ui框",
      type: "pic",
      texture: layer00Url,
      x: 859,
      y: 370,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "fadeOut",
          startTime: 1.1,
          duration: 0.5,
        },
      ],
    },
    {
      id: "前竹5",
      type: "pic",
      texture: layer01Url,
      x: 901,
      y: 442,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 7,
            speed: 6,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
          params: {
            ease: "sine.out",
            toX: 600,
          },
        },
      ],
    },
    {
      id: "前竹3",
      type: "pic",
      texture: layer02Url,
      x: 725,
      y: 405,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 9,
            speed: 7,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
          params: {
            toX: -550,
          },
        },
      ],
    },
    {
      id: "前竹4",
      type: "pic",
      texture: layer03Url,
      x: 1055,
      y: 395,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 8,
            speed: 7,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
          params: {
            toX: 400,
          },
        },
      ],
    },
    {
      id: "前竹2",
      type: "pic",
      texture: layer04Url,
      x: 607,
      y: 368,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 9,
            speed: 7,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
          params: {
            toX: -150,
          },
        },
      ],
    },
    {
      id: "前竹1",
      type: "pic",
      texture: layer05Url,
      x: 922,
      y: 365,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 10,
            speed: 6,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
        },
      ],
    },
    {
      id: "Layer_020",
      type: "pic",
      texture: layer06Url,
      x: 800,
      y: -50,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "fadeIn",
          startTime: 0.4,
          duration: 0.5,
        },
        {
          type: "leafFall",
          startTime: 0.4,
          duration: 1.1,
          params: {
            speed: 5,
            count: 30,
            swing: 50,
          },
        },
      ],
    },
    {
      id: "后竹8",
      type: "pic",
      texture: layer07Url,
      x: 868,
      y: 377,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 10,
            speed: 6,
          },
        },
        {
          type: "slideOut",
          startTime: 0.7,
          duration: 0.5,
        },
      ],
    },
    {
      id: "后竹7",
      type: "pic",
      texture: layer08Url,
      x: 636,
      y: 377,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 9,
            speed: 5,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
          params: {
            toX: -300,
          },
        },
      ],
    },
    {
      id: "后竹6",
      type: "pic",
      texture: layer09Url,
      x: 1112,
      y: 376,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 10,
            speed: 8,
          },
        },
        {
          type: "slideOut",
          startTime: 0.6,
          duration: 0.5,
        },
      ],
    },
    {
      id: "后竹3",
      type: "pic",
      texture: layer10Url,
      x: 922,
      y: 344,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "slideOut",
          startTime: 0.8,
          duration: 0.5,
        },
      ],
    },
    {
      id: "后竹2",
      type: "pic",
      texture: layer11Url,
      x: 736,
      y: 375,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "float",
          startTime: 0,
          duration: 0.5,
          params: {
            amplitude: 9,
            speed: 9,
          },
        },
        {
          type: "slideOut",
          startTime: 0.7,
          duration: 0.5,
          params: {
            toX: -400,
          },
        },
      ],
    },
    {
      id: "后竹1",
      type: "pic",
      texture: layer12Url,
      x: 1206,
      y: 344,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "slideOut",
          startTime: 0.7,
          duration: 0.5,
        },
      ],
    },
    {
      id: "后竹4",
      type: "pic",
      texture: layer13Url,
      x: 1031,
      y: 302,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "slideOut",
          startTime: 0.7,
          duration: 0.5,
        },
      ],
    },
    {
      id: "后竹5",
      type: "pic",
      texture: layer14Url,
      x: 776,
      y: 400,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "slideOut",
          startTime: 0.7,
          duration: 0.5,
          params: {
            toX: -350,
          },
        },
      ],
    },
    {
      id: "发光",
      type: "pic",
      texture: layer15Url,
      x: 850,
      y: 368,
      scaleX: 2.5,
      scaleY: 2.5,
      rotation: 0,
      alpha: 0.85,
      blendMode: "normal",
      visible: true,
      maskId: "遮罩",
      animations: [
        {
          type: "zoomIn",
          startTime: 0.7,
          duration: 0.3,
          params: {
            ease: "none",
          },
        },
        {
          type: "fadeOut",
          startTime: 0.9,
          duration: 0.4,
        },
      ],
    },
    {
      id: "遮罩",
      type: "pic",
      texture: layer16Url,
      x: 859,
      y: 371,
      scaleX: 0.8,
      scaleY: 0.8,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [],
    },
    {
      id: "bg",
      type: "pic",
      texture: layer17Url,
      x: 859,
      y: 370,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      alpha: 1,
      blendMode: "normal",
      visible: true,
      animations: [
        {
          type: "fadeOut",
          startTime: 1.1,
          duration: 0.5,
        },
      ],
    },
  ],
};
