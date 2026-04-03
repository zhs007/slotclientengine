// @ts-expect-error: PIXI is loaded via ESM from esm.sh
import * as PIXI from "https://esm.sh/pixi.js@7.3.2";
// @ts-expect-error: GSAP is loaded via ESM from esm.sh
import gsap from "https://esm.sh/gsap@3.12.2";
// @ts-expect-error: JSZip is loaded via ESM from esm.sh
import JSZip from "https://esm.sh/jszip@3.10.1";

/**
 * ProAniWin - Victory Animation Editor v2 (PixiAni)
 * v13.00 - Fixed Infinite Playback & Real-time Seek
 */

interface AnimConfig {
  type: string;
  startTime: number;
  duration: number;
  script?: string;
  params?: Record<string, string | number | boolean>;
  showParams?: boolean;
}

interface LayerConfig {
  id: string;
  type: "pic" | "font";
  asset: string;
  text?: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode?: string;
  visible: boolean;
  locked: boolean;
  maskId?: string | null;
  animations: AnimConfig[];
}

interface PixiAniConfig {
  version: string;
  name: string;
  duration: number;
  layers: LayerConfig[];
}

const BLEND_MODE_MAP: Record<string, number> = {
  normal: 0,
  add: 1,
  multiply: 2,
  screen: 3,
};

const PRESET_ANIMATIONS: Record<string, string> = {
  custom: "// Write your own GSAP/PIXI code here",
  sweepLight:
    "gsap.fromTo(target, { x: params.startX || -200 }, { x: params.endX || 800, duration: params.cycle || 1, repeat: Math.max(0, Math.floor(duration / (params.cycle || 1)) - 1), ease: 'none' })",
  swing:
    "gsap.fromTo(target, { rotation: -(params.angle || 0.2) }, { rotation: params.angle || 0.2, duration: params.cycle || 1.0, repeat: Math.max(0, Math.floor(duration / (params.cycle || 1.0)) - 1), yoyo: true, ease: 'sine.inOut' })",

  slideIn:
    "gsap.from(target, { x: params.fromX ?? target.x - 500, y: params.fromY ?? target.y, duration, ease: params.ease || 'power2.out' })",
  slideOut:
    "gsap.to(target, { x: params.toX ?? target.x + 500, y: params.toY ?? target.y, duration, ease: params.ease || 'power1.in' })",
  fadeIn:
    "gsap.from(target, { alpha: params.fromAlpha ?? 0, duration, ease: params.ease || 'power2.out' })",
  fadeOut:
    "gsap.to(target, { alpha: params.toAlpha ?? 0, duration, ease: params.ease || 'power2.in' })",
  bounceIn:
    "gsap.from(target.scale, { x: 0, y: 0, duration, ease: `elastic.out(1, ${params.elasticity || 0.3})` })",
  zoomIn:
    "gsap.from(target.scale, { x: 0, y: 0, duration, ease: 'back.out(1.7)' })",
  float:
    "gsap.to(target, { y: `-=${params.amplitude || 20}`, duration: 0.5, repeat: Math.max(0, Math.floor(duration / 0.5) - 1), yoyo: true, ease: 'sine.inOut' })",
  pulse:
    "gsap.to(target.scale, { x: `*=${params.scale || 1.1}`, y: `*=${params.scale || 1.1}`, duration: 0.5, repeat: Math.max(0, Math.floor(duration / 0.5) - 1), yoyo: true, ease: 'sine.inOut' })",
  rotate:
    "gsap.to(target, { rotation: '+=6.28', duration: params.cycle || 1, repeat: Math.max(0, Math.floor(duration / (params.cycle || 1)) - 1), ease: 'none' })",
  wave: "gsap.to(target, { y: `+=${params.amplitude || 30}`, x: `+=${params.horizontal || 10}`, rotation: params.rotate || 0.05, duration: 0.5, repeat: Math.max(0, Math.floor(duration / 0.5) - 1), yoyo: true, ease: 'sine.inOut' })",
  flipX:
    "gsap.fromTo(target.scale, { x: target.scale.x }, { x: -target.scale.x, duration: 0.5, repeat: Math.max(0, Math.floor(duration / 0.5) - 1), yoyo: true, ease: 'power1.inOut' })",
  flipY:
    "gsap.fromTo(target.scale, { y: target.scale.y }, { y: -target.scale.y, duration: 0.5, repeat: Math.max(0, Math.floor(duration / 0.5) - 1), yoyo: true, ease: 'power1.inOut' })",

  plexus: `(() => {
    const tl = gsap.timeline();
    const count = params.count || 20;
    const dist = params.distance || 120;
    const g = new PIXI.Graphics();
    if (target.blendMode !== undefined) g.blendMode = target.blendMode;
    container.addChild(g);
    const dots = [];

    const range = params.range || 300;
    for(let i=0; i<count; i++) {
      dots.push({ 
        x: target.x + (Math.random()-0.5)*range, 
        y: target.y + (Math.random()-0.5)*range, 
        vx: (Math.random()-0.5)*2 * (params.speed || 1), 
        vy: (Math.random()-0.5)*2 * (params.speed || 1) 
      });
    }
    tl.to({}, {
      duration: duration,
      onUpdate: () => {
        g.clear();
        dots.forEach(d => {
          d.x += d.vx; d.y += d.vy;
          if(Math.abs(d.x - target.x) > range/2) d.vx *= -1;
          if(Math.abs(d.y - target.y) > range/2) d.vy *= -1;
          g.beginFill(0x6366f1, 0.8);
          g.drawCircle(d.x, d.y, 2);
          g.endFill();
        });
        for(let i=0; i<dots.length; i++) {
          for(let j=i+1; j<dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const d2 = dx*dx + dy*dy;
            if(d2 < dist*dist) {
              g.lineStyle(1, 0x6366f1, 1 - Math.sqrt(d2)/dist);
              g.moveTo(dots[i].x, dots[i].y);
              g.lineTo(dots[j].x, dots[j].y);
            }
          }
        }
      }
    });
    tl.add(() => { g.destroy(); });
    return tl;
  })()`,
  shatter: `(() => {
    const tl = gsap.timeline();
    const rows = params.rows || 8;
    const cols = params.cols || 8;
    const force = params.force || 400;
    const gravity = params.gravity || 300;
    if (!(target instanceof PIXI.Sprite)) return tl;
    const tex = target.texture;
    if (!tex || tex === PIXI.Texture.WHITE) return tl;
    
    tl.to(target, { alpha: 0, duration: 0.1 });
    tl.add(() => {
      const frame = tex.frame;
      const w = frame.width / cols;
      const h = frame.height / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const rect = new PIXI.Rectangle(frame.x + c * w, frame.y + r * h, w, h);
          const subTex = new PIXI.Texture(tex.baseTexture, rect);
          const s = new PIXI.Sprite(subTex);
          s.anchor.set(0.5);
          s.x = target.x + (c - cols/2 + 0.5) * w * target.scale.x;
          s.y = target.y + (r - rows/2 + 0.5) * h * target.scale.y;
          s.scale.copyFrom(target.scale);
          container.addChild(s);
          const angle = Math.random() * Math.PI * 2;
          const f = Math.random() * force;
          gsap.to(s, {
            x: s.x + Math.cos(angle) * f,
            y: s.y + Math.sin(angle) * f + gravity,
            rotation: (Math.random() - 0.5) * 10,
            alpha: 0,
            duration: duration,
            ease: "power2.out",
            onComplete: () => { s.destroy(); }
          });
        }
      }
    });
    return tl;
  })()`,

  glitch: `(() => {
    const cycle = (params.delay || 1) + 0.4;
    const tl = gsap.timeline({ repeat: Math.max(0, Math.floor(duration / cycle) - 1), repeatDelay: params.delay || 1 });
    const intensity = params.intensity || 1;
    for(let i=0; i<5; i++) {
      tl.to(target, { 
        x: target.x + (Math.random()-0.5) * 0.5 * intensity,
        alpha: 0.5 + Math.random() * 0.5,
        duration: 0.05 
      });
      tl.to(target, { x: target.x, skewX: 0, alpha: 1, duration: 0.03 });
    }
    return tl;
  })()`,
  magicShine: `(() => {
    const cycle = (params.delay || 0.5) + (params.shineDur || 1.0);
    const tl = gsap.timeline({ repeat: Math.max(0, Math.floor(duration / cycle) - 1), repeatDelay: params.delay || 0.5 });

    const shine = new PIXI.Graphics();
    const w = 200;
    shine.beginFill(0xffffff, 0.5);
    shine.drawRect(-w/2, -100, w, 2000);
    shine.endFill();
    shine.rotation = Math.PI / 4;
    shine.x = -1000;
    
    container.addChild(shine);
    shine.mask = target;
    
    tl.fromTo(shine, { x: -500 }, { x: 1500, duration: duration, ease: "power1.inOut" });
    tl.add(() => {
      gsap.killTweensOf(shine);
      if(shine.parent) container.removeChild(shine);
      if(!shine.destroyed) shine.destroy();
    });

    return tl;
  })()`,
  cloudSea: `(() => {
    const tl = gsap.timeline();
    const strength = params.strength || 40;
    const speed = params.speed || 0.5;
    const freq = params.frequency || 1.0;
    const noiseSize = params.noiseSize || 64;
    
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gridSize = Math.max(2, Math.floor(noiseSize));
    
    for(let i=0; i<512; i+=gridSize) {
      for(let j=0; j<512; j+=gridSize) {
        const c = Math.floor(Math.random() * 255);
        ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
        ctx.fillRect(i, j, gridSize, gridSize);
      }
    }
    
    const blurRadius = Math.max(1, gridSize / 2);
    ctx.filter = 'blur(' + blurRadius + 'px)';
    ctx.drawImage(canvas, 0, 0);

    const noiseTex = PIXI.Texture.from(canvas);
    const noiseSprite = new PIXI.Sprite(noiseTex);
    noiseSprite.name = 'cloudSeaNoise';
    noiseSprite.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    
    const noiseScale = 4.0 / freq; 
    noiseSprite.scale.set(noiseScale); 
    
    const filter = new PIXI.DisplacementFilter(noiseSprite);
    filter.scale.set(strength);
    
    noiseSprite.alpha = 0; 
    container.addChild(noiseSprite);
    
    target.filters = (target.filters || []).concat([filter]);

    tl.to(noiseSprite, {
      x: "+=" + (512 * speed),
      y: "+=" + (256 * speed),
      duration: duration,
      ease: 'none'
    }, 0);

    tl.to(filter.scale, {
      x: strength * 1.3,
      y: strength * 0.7,
      duration: 0.5,
      repeat: Math.max(0, Math.floor(duration / 0.5) - 1),
      yoyo: true,
      ease: 'sine.inOut'
    }, 0);


    tl.add(() => {
       if (target.filters) {
         target.filters = target.filters.filter(f => f !== filter);
       }
       gsap.killTweensOf(noiseSprite);
       gsap.killTweensOf(filter.scale);
       if (!noiseSprite.destroyed) {
         const tex = noiseSprite.texture;
         if (noiseSprite.parent) noiseSprite.parent.removeChild(noiseSprite);
         noiseSprite.destroy({ children: true, texture: false });
         if (tex && tex !== PIXI.Texture.WHITE) tex.destroy(true);
       }
    }, duration);

    
    return tl;
  })()`,

  firework: `(() => {
    const tl = gsap.timeline();
    const startX = params.startX ?? target.x;
    const startY = params.startY ?? (target.y + 400);
    const count = params.count || 40;
    const texture = (target instanceof PIXI.Sprite) ? target.texture : PIXI.Texture.WHITE;
    tl.fromTo(target, { x: startX, y: startY, alpha: 1, scale: {x: 0.2, y: 0.2} }, { 
      x: target.x, y: target.y, alpha: 1, scale: {x: 0.5, y: 0.5},
      duration: duration * 0.4, ease: 'power2.out' 
    });
    tl.to(target, { alpha: 0, duration: 0.01 });
    tl.add(() => {
      const bm = target.blendMode;
      for(let i=0; i<count; i++){
         const p = new PIXI.Sprite(texture);
         p.anchor.set(0.5);
         p.scale.set(params.size || 0.15);
         p.x = target.x; p.y = target.y;
         if (bm !== undefined) p.blendMode = bm;
         container.addChild(p);

         const ang = Math.random() * Math.PI * 2;
         const dist = (params.range || 250) * (0.5 + Math.random()*0.5);
         gsap.to(p, {
           x: target.x + Math.cos(ang) * dist,
           y: target.y + Math.sin(ang) * dist,
           alpha: 0,
           rotation: Math.random() * 10,
           duration: duration * 0.6,
           ease: 'power3.out',
           onComplete: () => {
             container.removeChild(p);
             if(!p.destroyed) p.destroy({ children: true, texture: false });
           }
         });
      }
    });
    return tl;
})()`,
  particleBurst: `(() => { 
    const tl = gsap.timeline(); 

    const count = params.count || 30; 
    const emTime = params.emissionTime || 0;
    const texture = (target instanceof PIXI.Sprite) ? target.texture : PIXI.Texture.WHITE;
    
    const bm = target.blendMode;
    for(let i=0; i<count; i++){ 
       const p = new PIXI.Sprite(texture);
       p.anchor.set(0.5);
       p.scale.set(params.size || 0.2);
       p.x = target.x; p.y = target.y; p.alpha = 0;
       if (bm !== undefined) p.blendMode = bm;
       container.addChild(p); 

       
       const ang = Math.random()*Math.PI*2; 
       const dist = (params.range || 200) * (0.4 + Math.random()*0.6); 
       const delay = Math.random() * emTime;
       
       tl.to(p, { 
         x: target.x + Math.cos(ang)*dist, 
         y: target.y + Math.sin(ang)*dist, 
         alpha: 1, rotation: Math.random() * 6.28,
         duration: 0.2, ease: 'power1.out' 
       }, delay);

       tl.to(p, { 
         alpha: 0, scaleX: 0, scaleY: 0,
         duration: duration / (params.speed || 1), 
         ease: 'power2.in', onComplete: () => {
           container.removeChild(p);
           if(!p.destroyed) p.destroy({ children: true, texture: false });
         } 
       }, delay + 0.2); 
    } 
    return tl; 
  })()`,
  starlight: `(() => {
    const tl = gsap.timeline();
    const count = params.count || 20;
    const range = params.range || 400;
    const flashDur = params.flashDuration || 1.0;
    const interval = params.interval || 0.5;
    const size = params.size || 20; 
    const bm = target.blendMode;
    const texture = (target instanceof PIXI.Sprite && target.texture !== PIXI.Texture.WHITE) ? target.texture : PIXI.Texture.WHITE;

    const stars = [];
    const cycle = flashDur + interval;
    for(let i=0; i<count; i++) {
      const star = new PIXI.Sprite(texture);
      star.anchor.set(0.5);
      if (texture === PIXI.Texture.WHITE) {
        star.width = star.height = size;
      } else {
        const ratio = size / Math.max(texture.width, texture.height);
        star.scale.set(ratio);
      }
      star.alpha = 0;
      if (bm !== undefined) star.blendMode = bm;
      container.addChild(star);
      stars.push(star);

      const delay = Math.random() * duration;
      const repeats = Math.floor((duration - delay) / cycle);
      
      const starTl = gsap.timeline({ repeat: Math.max(0, repeats), delay });
      starTl.add(() => {
         star.x = target.x + (Math.random() - 0.5) * range;
         star.y = target.y + (Math.random() - 0.5) * range;
      });
      starTl.to(star, { alpha: 1, duration: flashDur/2, ease: "sine.inOut" });
      starTl.to(star, { alpha: 0, duration: flashDur/2, ease: "sine.inOut" });
      starTl.to({}, { duration: interval }); 

      tl.add(starTl, 0);
    }

    tl.add(() => {
      stars.forEach(s => {
        if (!s.destroyed) {
          gsap.killTweensOf(s);
          if(s.parent) s.parent.removeChild(s);
          s.destroy({ children: true, texture: false });
        }
      });
    }, duration);


    return tl;
})()`,
  sequenceScale: `(() => {
    const tl = gsap.timeline();
    const p = params;
    
    const s1_dur = p.s1_dur || 0.6;
    const s2_dur = p.s2_dur || 2.5;
    const s3_dur = p.s3_dur || 0.4;
    
    tl.fromTo(target.scale, 
      { x: p.s1_startScale ?? 0.2, y: p.s1_startScale ?? 0.2 },
      { x: p.s1_endScale ?? 1.0, y: p.s1_endScale ?? 1.0, duration: s1_dur, ease: "power2.out" }
    );
    tl.fromTo(target, 
      { alpha: p.s1_startAlpha ?? 0 },
      { alpha: p.s1_endAlpha ?? 1, duration: s1_dur, ease: "power2.out" }, 0
    );

    tl.to(target.scale, { 
      x: p.s2_endScale ?? 1.15, y: p.s2_endScale ?? 1.15, 
      duration: s2_dur, ease: "none" 
    });
    tl.to(target, { 
      alpha: p.s2_endAlpha ?? 1, 
      duration: s2_dur, ease: "none" 
    }, "<");

    tl.to(target.scale, { 
      x: p.s3_endScale ?? 2.5, y: p.s3_endScale ?? 2.5, 
      duration: s3_dur, ease: "power2.in" 
    });
    tl.to(target, { 
      alpha: p.s3_endAlpha ?? 0, 
      duration: s3_dur, ease: "power2.in" 
    }, "<");

    return tl;
})()`,
  fireDistortion: `(() => {
    const tl = gsap.timeline();
    const strength = params.strength || 30;

    const speed = params.speed || 1.2;
    const freq = params.frequency || 1.5;
    const noiseSize = params.noiseSize || 32;
    
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gridSize = Math.max(2, Math.floor(noiseSize));
    
    for(let i=0; i<512; i+=gridSize) {
      for(let j=0; j<512; j+=gridSize) {
        const c = Math.floor(Math.random() * 255);
        ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
        ctx.fillRect(i, j, gridSize, gridSize);
      }
    }
    
    ctx.filter = 'blur(' + (gridSize) + 'px)';
    ctx.drawImage(canvas, 0, 0);

    const noiseTex = PIXI.Texture.from(canvas);
    const noiseSprite = new PIXI.Sprite(noiseTex);
    noiseSprite.texture.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    noiseSprite.scale.set(4.0 / freq); 
    
    const filter = new PIXI.DisplacementFilter(noiseSprite);
    filter.scale.set(strength);
    
    container.addChild(noiseSprite);
    noiseSprite.alpha = 0; 
    
    target.filters = (target.filters || []).concat([filter]);

    tl.to(noiseSprite, {
      y: "-=" + (512 * speed),
      x: "+=" + (128 * speed * 0.2),
      duration: duration,
      ease: 'none'
    }, 0);

    tl.to(filter.scale, {
      x: strength * 1.2,
      y: strength * 0.8,
      duration: 0.5,
      repeat: Math.max(0, Math.floor(duration / 0.5) - 1),
      yoyo: true,
      ease: 'sine.inOut'
    }, 0);


    tl.add(() => {
       if (target && !target.destroyed && target.filters) {
         target.filters = target.filters.filter(f => f !== filter);
       }
       gsap.killTweensOf(noiseSprite);
       gsap.killTweensOf(filter.scale);
       if (noiseSprite && !noiseSprite.destroyed) {
         const tex = noiseSprite.texture;
         if (noiseSprite.parent) noiseSprite.parent.removeChild(noiseSprite);
         noiseSprite.destroy({ children: true, texture: false });
         if (tex && tex !== PIXI.Texture.WHITE) tex.destroy(true);
       }
    }, duration);

    return tl;
  })()`,
};

const ANIM_CATEGORY_COLORS: Record<string, string> = {
  fadeIn: "#22c55e",
  bounceIn: "#22c55e",
  slideIn: "#22c55e",
  zoomIn: "#22c55e", // 进入: 绿
  fadeOut: "#ef4444",
  slideOut: "#ef4444", // 退出: 红
  float: "#3b82f6",
  pulse: "#3b82f6",
  rotate: "#3b82f6",
  swing: "#3b82f6",
  wave: "#3b82f6",
  flipX: "#3b82f6",
  flipY: "#3b82f6", // 循环: 蓝
  shatter: "#a855f7",
  plexus: "#a855f7",
  cloudSea: "#a855f7",
  glitch: "#a855f7",
  magicShine: "#a855f7",
  firework: "#a855f7",
  particleBurst: "#a855f7",
  starlight: "#a855f7",
  fireDistortion: "#a855f7", // 特效: 紫
  sequenceScale: "#f59e0b",
  custom: "#f59e0b", // 自定义/特殊: 橙
};

const ANIM_LABELS: Record<string, string> = {
  custom: "自定义 (Custom)",

  sweepLight: "扫光 (Sweep)",
  swing: "摇摆 (Swing)",
  slideIn: "进入 (SlideIn)",
  slideOut: "退出 (SlideOut)",
  fadeIn: "淡入 (FadeIn)",
  fadeOut: "淡出 (FadeOut)",
  bounceIn: "回弹进入 (BounceIn)",
  zoomIn: "缩放进入 (ZoomIn)",
  float: "悬浮 (Float)",
  pulse: "呼吸 (Pulse)",
  rotate: "旋转 (Rotate)",
  shatter: "碎裂 (Shatter V2)",
  glitch: "故障 (Glitch)",
  magicShine: "魔光 (Shine)",
  wave: "海浪起伏 (Wave)",
  cloudSea: "云海 (CloudSea)",
  firework: "烟花爆炸 (Firework)",
  particleBurst: "粒子发散 (ParticleBurst)",
  flipX: "水平翻转 (FlipX)",
  flipY: "垂直翻转 (FlipY)",
  plexus: "粒子连线 (Plexus)",
  starlight: "星光闪烁 (Starlight)",
  sequenceScale: "三段式缩放 (SeqScale)",
  fireDistortion: "火焰扭曲 (FireDistortion)",
};

const ANIM_PARAMS_DEF: Record<string, string[]> = {
  shatter: ["rows", "cols", "force", "gravity"],
  plexus: ["count", "distance", "range", "speed"],
  glitch: ["intensity", "repeat", "delay"],
  magicShine: ["repeat", "delay"],
  sweepLight: ["startX", "endX", "repeat"],
  swing: ["angle"],
  slideIn: ["fromX", "fromY", "ease"],
  slideOut: ["toX", "toY", "ease"],
  fadeIn: ["fromAlpha", "ease"],
  fadeOut: ["toAlpha", "ease"],
  bounceIn: ["elasticity"],
  float: ["amplitude"],
  pulse: ["scale"],
  wave: ["amplitude", "horizontal", "rotate"],
  cloudSea: ["strength", "speed", "frequency", "noiseSize"],
  firework: ["startX", "startY", "count", "range", "size"],
  particleBurst: ["count", "range", "speed", "size", "emissionTime"],
  starlight: ["count", "range", "flashDuration", "interval", "size"],
  fireDistortion: ["strength", "speed", "frequency", "noiseSize"],
  sequenceScale: [
    "s1_dur",
    "s1_startScale",
    "s1_endScale",
    "s1_startAlpha",
    "s1_endAlpha",
    "s2_dur",
    "s2_endScale",
    "s2_endAlpha",
    "s3_dur",
    "s3_endScale",
    "s3_endAlpha",
  ],
};

const PARAM_TIPS: Record<string, string> = {
  startX: "起始 X 坐标 (单位: px)",
  endX: "结束 X 坐标 (单位: px)",
  startY: "起始 Y 坐标 (单位: px)",
  repeat: "重复次数 (-1 为无限循环)",
  angle: "摆动角度 (单位: 度, 建议 15-45)",
  rotate: "旋转角度 (单位: 度, 360 为一圈)",
  fromX: "起始位置 X (相对当前偏移)",
  fromY: "起始位置 Y (相对当前偏移)",
  toX: "目标位置 X",
  toY: "目标位置 Y",
  fromAlpha: "起始透明度 (0-1)",
  toAlpha: "目标透明度 (0-1)",
  elasticity: "回弹力度 (0-1, 越大越夸张)",
  amplitude: "振幅/摆动高度 (单位: px)",
  horizontal: "水平位移量 (单位: px)",
  scale: "缩放倍率 (1.5 为放大 50%)",
  strength: "扭曲幅度 (建议 30-80)",
  speed: "扭曲速度 (建议 0.5-2.0)",
  frequency: "扭曲频率/范围 (建议 0.5-2.0)",
  noiseSize: "热浪高度/细腻度 (值越大越平滑)",
  count: "粒子数量 (建议 20-100)",
  range: "发散半径 (单位: px)",
  size: "粒子大小 (单位: px)",
  rows: "横向切割块数 (建议 5-10)",
  cols: "纵向切割块数 (建议 5-10)",
  force: "爆炸力度 (单位: px)",
  gravity: "下落重力 (单位: px, 建议 200-500)",
  distance: "连线最大距离 (单位: px)",
  intensity: "故障强度倍率 (建议 0.5-2.0)",
  flashDuration: "闪烁时长 (单位: 秒)",
  interval: "闪烁间隔 (单位: 秒)",
  s1_dur: "阶段 1 时长 (秒)",
  s1_startScale: "阶段 1 起始缩放",
  s1_endScale: "阶段 1 结束缩放",
  s1_startAlpha: "阶段 1 起始透明度",
  s1_endAlpha: "阶段 1 结束透明度",
  s2_dur: "阶段 2 时长 (秒)",
  s2_endScale: "阶段 2 结束缩放",
  s2_endAlpha: "阶段 2 结束透明度",
  s3_dur: "阶段 3 时长 (秒)",
  s3_endScale: "阶段 3 结束缩放",
  s3_endAlpha: "阶段 3 结束透明度",
  delay: "循环间隔时长 (秒)",
  emissionTime: "持续发射时长 (单位: 秒)",
  ease: "缓动曲线 (如 power2.out, bounce.out)",
  rotation: "初始旋转角度 (单位: 度)",
  scale_layer: "初始缩放比例 (1.0 为原始大小)",
};

class VictoryEditorV2 {
  private readonly STORAGE_KEY = "proaniwin_v2_project";
  private config: PixiAniConfig = {
    version: "13.00",
    name: "VictoryAnimation",

    duration: 5.0,
    layers: [],
  };

  private selectedLayerId: string | null = null;
  private dragSourceIdx: number | null = null;
  private dragOverIdx: number | null = null;
  private app: PIXI.Application;
  private sceneContainer: PIXI.Container;

  private layerContainers: Map<string, PIXI.Container> = new Map();
  private selectionGraphics: PIXI.Graphics;
  private masterTl: gsap.core.Timeline | null = null;
  private isPlaying: boolean = false;
  private isRendering: boolean = false;
  private layerCounter: number = 0;
  private renderId: number = 0;

  private history: string[] = [];
  private historyIndex: number = -1;
  private readonly MAX_HISTORY = 50;

  constructor() {
    this.selectionGraphics = new PIXI.Graphics();
    this.sceneContainer = new PIXI.Container();

    const canvas = document.createElement("canvas");
    const container = document.getElementById("canvas-container");
    if (!container) throw new Error("Canvas container not found");
    container.appendChild(canvas);

    this.app = new PIXI.Application({
      view: canvas,
      width: 800,
      height: 600,
      backgroundColor: 0x000000,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });

    this.setupEventListeners();
    if (!this.loadState()) {
      this.initDefaultScene();
    }

    this.pushHistory();
    this.renderLayerList();
    this.renderTimeline();
    this.refreshPreview();

    window.addEventListener("resize", () => this.resizeCanvas());
    setTimeout(() => this.resizeCanvas(), 100);
  }

  private initDefaultScene() {
    this.addLayer("font", "", "VICTORY!");
    const l1 = this.config.layers[0];
    l1.x = 400;
    l1.y = 300;
    l1.animations.push({ type: "bounceIn", startTime: 0, duration: 1.0 });

    this.addLayer("pic", "https://pixijs.com/assets/bunny.png");
    const l2 = this.config.layers[1] || this.config.layers[0];
    l2.x = 400;
    l2.y = 400;
    l2.animations.push({ type: "fadeIn", startTime: 0, duration: 0.5 });
  }

  private pushHistory() {
    const snapshot = JSON.stringify(this.config);
    if (this.historyIndex >= 0 && this.history[this.historyIndex] === snapshot)
      return;
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();
    this.historyIndex = this.history.length - 1;
    this.saveState();
  }

  private undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.config = JSON.parse(this.history[this.historyIndex]);
      this.applyHistoryState();
    }
  }

  private redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.config = JSON.parse(this.history[this.historyIndex]);
      this.applyHistoryState();
    }
  }

  private applyHistoryState() {
    this.renderLayerList();
    this.renderTimeline();
    this.refreshHeader();
    if (this.selectedLayerId) {
      const layer = this.config.layers.find(
        (l) => l.id === this.selectedLayerId,
      );
      if (layer) this.renderPropertyEditor(layer);
    }
    this.refreshPreview();
    this.saveState();
  }

  private refreshHeader() {
    const nameInput = document.getElementById(
      "input-proj-name",
    ) as HTMLInputElement;
    if (nameInput) nameInput.value = this.config.name || "";

    const durInput = document.getElementById(
      "input-total-dur",
    ) as HTMLInputElement;
    if (durInput) durInput.value = (this.config.duration || 5.0).toString();

    const timeDisplay = document.getElementById("timeline-time");
    if (timeDisplay)
      timeDisplay.textContent = `0.00s / ${(this.config.duration || 5.0).toFixed(2)}s`;
  }

  private saveState() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.config));
  }

  private loadState(): boolean {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        this.config = JSON.parse(saved);
        this.config.version = "13.00";

        if (this.config.layers === undefined) this.config.layers = [];

        this.layerCounter = Math.max(
          0,
          ...this.config.layers.map((l) => {
            const parts = l.id.split("_");
            return parseInt(parts[parts.length - 1]) || 0;
          }),
        );
        this.config.layers.forEach((l) => {
          if (l.locked === undefined) l.locked = false;
          if (l.blendMode === undefined) l.blendMode = "normal";
          if (l.alpha === undefined) l.alpha = 1.0;
          // Scale X/Y migration
          /* eslint-disable @typescript-eslint/no-explicit-any */
          if ((l as any).scale !== undefined && l.scaleX === undefined) {
            l.scaleX = (l as any).scale;
            l.scaleY = (l as any).scale;
          }
          /* eslint-enable @typescript-eslint/no-explicit-any */

          if (l.scaleX === undefined) l.scaleX = 1.0;
          if (l.scaleY === undefined) l.scaleY = 1.0;
        });
        this.refreshHeader();
        return true;
      } catch (e) {
        console.error(e);
      }
    }
    return false;
  }

  private setupEventListeners() {
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        this.selectedLayerId
      ) {
        if (
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          )
        ) {
          this.deleteLayer(this.selectedLayerId);
        }
      }
    });

    document
      .getElementById("btn-undo")
      ?.addEventListener("click", () => this.undo());
    document
      .getElementById("btn-redo")
      ?.addEventListener("click", () => this.redo());
    document
      .getElementById("btn-add-layer")
      ?.addEventListener("click", () => this.addLayer());
    document
      .getElementById("btn-play")
      ?.addEventListener("click", () =>
        this.isPlaying ? this.stop() : this.play(),
      );
    document.getElementById("btn-reset")?.addEventListener("click", () => {
      if (confirm("Reset?")) {
        localStorage.removeItem(this.STORAGE_KEY);
        location.reload();
      }
    });
    document
      .getElementById("input-total-dur")
      ?.addEventListener("change", (e: Event) => {
        this.config.duration =
          parseFloat((e.target as HTMLInputElement).value) || 5.0;
        this.renderTimeline();
        this.pushHistory();
      });

    document
      .getElementById("input-proj-name")
      ?.addEventListener("change", (e: Event) => {
        this.config.name =
          (e.target as HTMLInputElement).value || "VictoryProject";
        this.pushHistory();
      });

    document

      .getElementById("btn-export-ts")
      ?.addEventListener("click", () => this.exportTS());
    document
      .getElementById("btn-copy-ts")
      ?.addEventListener("click", () => this.copyTS());

    document
      .getElementById("btn-new-proj")
      ?.addEventListener("click", () => this.newProject());
    document
      .getElementById("btn-save-zip")
      ?.addEventListener("click", () => this.exportProjectZip());
    document.getElementById("btn-import-zip")?.addEventListener("click", () => {
      document.getElementById("zip-input")?.click();
    });
    document
      .getElementById("zip-input")
      ?.addEventListener("change", (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.importProjectZip(file);
      });

    const fileInput = document.getElementById("file-input");

    if (fileInput) {
      fileInput.addEventListener("change", (e: Event) =>
        this.handleFileUpload(e),
      );
    }
  }

  private handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !this.selectedLayerId) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const layer = this.config.layers.find(
        (l) => l.id === this.selectedLayerId,
      );
      if (layer) {
        layer.asset = event.target?.result as string;
        layer.type = "pic";
        this.refreshPreview();
        this.renderPropertyEditor(layer);
        this.pushHistory();
      }
    };
    reader.readAsDataURL(file);
  }

  private addLayer(
    type: LayerConfig["type"] = "pic",
    asset: string = "",
    text: string = "",
  ) {
    this.layerCounter++;
    const id = `Layer_${String(this.layerCounter).padStart(3, "0")}`;
    const newLayer: LayerConfig = {
      id,
      type,
      asset,
      text,
      x: 400,
      y: 300,
      scaleX: 1.0,
      scaleY: 1.0,
      rotation: 0,
      alpha: 1.0,
      blendMode: "normal",
      visible: true,
      locked: false,
      maskId: null,
      animations: [],
    };
    this.config.layers.unshift(newLayer);
    this.selectLayer(id);
    this.renderLayerList();
    this.renderTimeline();
    this.refreshPreview();
    this.pushHistory();
  }

  private selectLayer(id: string) {
    this.selectedLayerId = id;
    const layer = this.config.layers.find((l) => l.id === id);
    if (!layer) {
      this.selectionGraphics.clear();
      return;
    }
    this.renderPropertyEditor(layer);
    this.renderLayerList();
    this.renderAnimList();
    this.renderTimeline();
    this.updateSelectionHighlight();
  }

  private renderPropertyEditor(layer: LayerConfig) {
    const container = document.getElementById("property-editor")!;
    const rotDeg = Math.round((layer.rotation * 180) / Math.PI);
    const alphaPct = Math.round((layer.alpha ?? 1.0) * 100);

    container.innerHTML = `
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] text-gray-500 mb-1 uppercase">类型</label>
            <select id="prop-type" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5">
              <option value="pic" ${layer.type === "pic" ? "selected" : ""}>图片</option>
              <option value="font" ${layer.type === "font" ? "selected" : ""}>文本</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-500 mb-1 uppercase">ID</label>
            <input type="text" id="prop-id" value="${layer.id}" class="w-full px-2 py-1 text-xs bg-black/40 text-indigo-300 rounded border border-white/10" />
          </div>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1 uppercase">遮罩目标 (Mask)</label>
          <select id="prop-mask" class="w-full px-2 py-1 text-xs bg-black/40 text-indigo-300 rounded border border-white/10">
            <option value="">无遮罩</option>
            ${this.config.layers
              .filter((l) => l.id !== layer.id)
              .map(
                (l) =>
                  `<option value="${l.id}" ${layer.maskId === l.id ? "selected" : ""}>${l.id}</option>`,
              )
              .join("")}
          </select>
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1 uppercase">${layer.type === "font" ? "文本内容" : "图片地址"}</label>
          <input type="text" id="prop-asset" value="${layer.type === "font" ? layer.text || "" : layer.asset}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" />
          ${layer.type === "pic" ? `<button id="btn-trigger-upload" class="mt-1 w-full py-1 border border-dashed border-indigo-500/30 rounded text-[9px] text-indigo-400">上传本地图片</button>` : ""}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[10px] text-gray-500 mb-1">X 坐标</label><input type="number" id="prop-x" value="${layer.x}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" /></div>
          <div><label class="block text-[10px] text-gray-500 mb-1">Y 坐标</label><input type="number" id="prop-y" value="${layer.y}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[10px] text-gray-500 mb-1 border-b border-dashed border-gray-600 cursor-help" title="横向缩放 (Scale X)">Scale X</label><input type="number" step="0.1" id="prop-scaleX" value="${layer.scaleX}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" /></div>
          <div><label class="block text-[10px] text-gray-500 mb-1 border-b border-dashed border-gray-600 cursor-help" title="纵向缩放 (Scale Y)">Scale Y</label><input type="number" step="0.1" id="prop-scaleY" value="${layer.scaleY}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[10px] text-gray-500 mb-1 border-b border-dashed border-gray-600 cursor-help" title="${PARAM_TIPS.rotation}">旋转 (Deg)</label><input type="number" id="prop-rotation-deg" value="${rotDeg}" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] text-gray-500 mb-1 uppercase">混合模式</label>
            <select id="prop-blend" class="w-full px-2 py-1 text-xs bg-black/40 rounded border border-white/5">
              <option value="normal" ${layer.blendMode === "normal" ? "selected" : ""}>正常</option>
              <option value="add" ${layer.blendMode === "add" ? "selected" : ""}>线性减淡 (Add)</option>
              <option value="screen" ${layer.blendMode === "screen" ? "selected" : ""}>滤色 (Screen)</option>
              <option value="multiply" ${layer.blendMode === "multiply" ? "selected" : ""}>正片叠底</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-500 mb-1 uppercase">不透明度 (%)</label>
            <input type="range" id="prop-alpha-range" min="0" max="100" value="${alphaPct}" class="w-full mt-2" />
            <div class="text-[9px] text-right text-gray-500 mt-1" id="alpha-val">${alphaPct}%</div>
          </div>
        </div>
      </div>
    `;

    document
      .getElementById("prop-id")
      ?.addEventListener("change", (e: Event) => {
        const newId = (e.target as HTMLInputElement).value;
        if (newId && !this.config.layers.some((l) => l.id === newId)) {
          layer.id = newId;
          this.selectedLayerId = newId;
          this.renderLayerList();
          this.renderTimeline();
          this.pushHistory();
        } else {
          (e.target as HTMLInputElement).value = layer.id;
        }
      });

    document
      .getElementById("btn-trigger-upload")
      ?.addEventListener("click", () =>
        document.getElementById("file-input")?.click(),
      );
    document
      .getElementById("prop-asset")
      ?.addEventListener("change", (e: Event) => {
        const val = (e.target as HTMLInputElement).value;
        if (layer.type === "font") layer.text = val;
        else layer.asset = val;
        this.refreshPreview();
        this.pushHistory();
      });

    const bindNum = (id: string, field: keyof LayerConfig) => {
      document.getElementById(id)?.addEventListener("change", (e: Event) => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        (layer as any)[field] =
          parseFloat((e.target as HTMLInputElement).value) || 0;
        this.refreshPreview();
        this.pushHistory();
      });
    };
    bindNum("prop-x", "x");
    bindNum("prop-y", "y");
    bindNum("prop-scaleX", "scaleX");
    bindNum("prop-scaleY", "scaleY");

    document
      .getElementById("prop-blend")
      ?.addEventListener("change", (e: Event) => {
        layer.blendMode = (e.target as HTMLSelectElement).value;
        this.refreshPreview();
        this.pushHistory();
      });

    document
      .getElementById("prop-alpha-range")
      ?.addEventListener("input", (e: Event) => {
        const val = parseInt((e.target as HTMLInputElement).value) || 0;
        layer.alpha = val / 100;
        const alphaVal = document.getElementById("alpha-val");
        if (alphaVal) alphaVal.textContent = `${val}%`;
        this.refreshPreview();
      });

    document
      .getElementById("prop-alpha-range")
      ?.addEventListener("change", () => {
        this.pushHistory();
      });

    document
      .getElementById("prop-rotation-deg")
      ?.addEventListener("change", (e: Event) => {
        const deg = parseFloat((e.target as HTMLInputElement).value) || 0;
        layer.rotation = (deg * Math.PI) / 180;
        this.refreshPreview();
        this.pushHistory();
      });

    document
      .getElementById("prop-type")
      ?.addEventListener("change", (e: Event) => {
        layer.type = (e.target as HTMLSelectElement).value as "pic" | "font";
        this.refreshPreview();
        this.renderPropertyEditor(layer);
        this.pushHistory();
      });
    document
      .getElementById("prop-mask")
      ?.addEventListener("change", (e: Event) => {
        layer.maskId = (e.target as HTMLSelectElement).value || null;
        this.refreshPreview();
        this.pushHistory();
      });
  }

  private renderLayerList() {
    const list = document.getElementById("layer-list")!;
    list.innerHTML = "";
    this.config.layers.forEach((layer, idx) => {
      const isSelected = layer.id === this.selectedLayerId;
      const item = document.createElement("div");
      item.draggable = true;
      item.className = `flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border relative ${
        isSelected
          ? "bg-indigo-600/20 border-indigo-500/50"
          : "bg-white/5 border-transparent"
      } ${this.dragOverIdx === idx ? "border-t-2 border-t-indigo-500" : ""}`;

      item.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden flex-1 pointer-events-none">
          <i class="fas ${
            layer.visible
              ? "fa-eye text-green-500"
              : "fa-eye-slash text-gray-600"
          } text-[10px] btn-vis pointer-events-auto"></i>
          <i class="fas ${
            layer.locked ? "fa-lock text-red-500" : "fa-unlock text-gray-600"
          } text-[10px] btn-lock pointer-events-auto"></i>
          <span class="text-xs truncate ${isSelected ? "text-white" : "text-gray-400"}">${layer.id}</span>
        </div>
        <div class="flex items-center gap-2">
          <i class="fas fa-chevron-up text-[8px] btn-up hover:text-white p-1"></i>
          <i class="fas fa-chevron-down text-[8px] btn-down hover:text-white p-1"></i>
          <i class="far fa-clone text-[8px] btn-clone hover:text-indigo-400 p-1" title="克隆图层"></i>
          <i class="fas fa-trash text-[8px] btn-del text-red-900 hover:text-red-500 p-1"></i>
        </div>
      `;

      item.onclick = (e: MouseEvent) => {
        const t = e.target as HTMLElement;
        if (t.classList.contains("btn-del")) this.deleteLayer(layer.id);
        else if (t.classList.contains("btn-clone"))
          this.duplicateLayer(layer.id);
        else if (t.classList.contains("btn-vis")) {
          layer.visible = !layer.visible;
          this.renderLayerList();
          this.refreshPreview();
          this.pushHistory();
        } else if (t.classList.contains("btn-lock")) {
          layer.locked = !layer.locked;
          this.renderLayerList();
          this.refreshPreview();
          this.pushHistory();
        } else if (
          t.classList.contains("btn-up") ||
          t.parentElement?.classList.contains("btn-up")
        )
          this.moveLayer(idx, -1);
        else if (
          t.classList.contains("btn-down") ||
          t.parentElement?.classList.contains("btn-down")
        )
          this.moveLayer(idx, 1);
        else this.selectLayer(layer.id);
        e.stopPropagation();
      };

      item.ondragstart = (e: DragEvent) => {
        this.dragSourceIdx = idx;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
        }
        item.style.opacity = "0.4";
      };
      item.ondragend = () => {
        this.dragSourceIdx = null;
        this.dragOverIdx = null;
        this.renderLayerList();
      };
      item.ondragover = (e: DragEvent) => {
        e.preventDefault();
        if (this.dragOverIdx !== idx) {
          this.dragOverIdx = idx;
          this.renderLayerList();
        }
      };
      item.ondrop = (e: DragEvent) => {
        e.preventDefault();
        if (this.dragSourceIdx !== null && this.dragSourceIdx !== idx) {
          const movedLayer = this.config.layers.splice(
            this.dragSourceIdx,
            1,
          )[0];
          this.config.layers.splice(idx, 0, movedLayer);
          this.renderLayerList();
          this.renderTimeline();
          this.refreshPreview();
          this.pushHistory();
        }
      };

      list.appendChild(item);
    });
  }

  private moveLayer(idx: number, dir: number) {
    const n = idx + dir;
    if (n >= 0 && n < this.config.layers.length) {
      const temp = this.config.layers[idx];
      this.config.layers[idx] = this.config.layers[n];
      this.config.layers[n] = temp;
      this.renderLayerList();
      this.renderTimeline();
      this.refreshPreview();
      this.pushHistory();
    }
  }

  private renderTimeline() {
    const rulerContainer = document.getElementById("timeline-ruler");
    const trackContainer = document.getElementById("timeline-tracks");
    if (!rulerContainer || !trackContainer) return;

    const totalDur = this.config.duration;

    // 1. Render Ruler Ticks
    rulerContainer.innerHTML = "";
    for (let i = 0; i <= totalDur; i += 0.5) {
      const left = (i / totalDur) * 100;
      const tick = document.createElement("div");
      tick.className =
        "absolute h-full border-l border-white/10 pointer-events-none";
      tick.style.left = `${left}%`;
      if (i % 1 === 0) {
        tick.innerHTML = `<span class="text-[8px] text-gray-500 ml-1 mt-1 block font-mono">${i}s</span>`;
        tick.className =
          "absolute h-full border-l border-white/30 pointer-events-none";
      }
      rulerContainer.appendChild(tick);
    }

    // Ruler Interaction (Scrubbing + Drag)
    const handleRulerInteraction = (e: MouseEvent) => {
      const rect = rulerContainer.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.seek(p * totalDur);
    };

    rulerContainer.onmousedown = (e) => {
      handleRulerInteraction(e);
      const move = (me: MouseEvent) => handleRulerInteraction(me);
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };

    // 2. Render Layer Tracks
    trackContainer
      .querySelectorAll(".layer-track-row")
      .forEach((el) => el.remove());

    this.config.layers.forEach((l) => {
      const row = document.createElement("div");
      row.className = `layer-track-row group flex items-center h-8 border-b border-white/5 transition-colors ${l.id === this.selectedLayerId ? "bg-indigo-500/10" : "hover:bg-white/5"}`;

      const label = document.createElement("div");
      label.className =
        "w-24 text-[9px] text-gray-500 truncate px-2 border-r border-white/5 flex-shrink-0 cursor-pointer h-full flex items-center";
      label.textContent = l.id;
      label.onclick = (e) => {
        e.stopPropagation();
        this.selectLayer(l.id);
      };

      const trackArea = document.createElement("div");
      trackArea.className = "flex-1 relative h-full cursor-crosshair";

      const handleTrackInteraction = (e: MouseEvent) => {
        const rect = trackArea.getBoundingClientRect();
        const p = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        this.seek(p * totalDur);
      };

      trackArea.onmousedown = (e) => {
        handleTrackInteraction(e);
        const move = (me: MouseEvent) => handleTrackInteraction(me);
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      };

      l.animations.forEach((anim) => {
        const bar = document.createElement("div");
        bar.className =
          "absolute h-5 top-1.5 rounded border border-white/10 text-[8px] font-bold flex items-center px-1.5 text-white/90 overflow-hidden select-none whitespace-nowrap shadow-lg transition-transform hover:scale-[1.02] cursor-default";
        bar.style.left = `${(anim.startTime / totalDur) * 100}%`;
        bar.style.width = `${(anim.duration / totalDur) * 100}%`;
        bar.style.backgroundColor =
          ANIM_CATEGORY_COLORS[anim.type] || "#6366f1";

        const labelText = (ANIM_LABELS[anim.type] || anim.type)
          .split("(")[0]
          .trim();
        bar.textContent = labelText;
        trackArea.appendChild(bar);
      });

      row.appendChild(label);
      row.appendChild(trackArea);
      trackContainer.appendChild(row);
    });
  }

  private seek(time: number) {
    if (this.isPlaying) this.stop();

    const totalDur = this.config.duration;
    const seekTime = Math.max(0, Math.min(totalDur, time));

    // 1. Logic Sync (Build and Jump)
    // We must ensure the scene is built
    if (this.layerContainers.size === 0) return;
    const tempTl = this.buildMasterTimeline();
    tempTl.seek(seekTime);

    // 2. Render Sync
    this.app.ticker.update();
    this.app.render();

    // 3. UI Sync
    this.updatePlayheadUI(seekTime);
    const timeDisplay = document.getElementById("timeline-time");
    if (timeDisplay)
      timeDisplay.textContent = `${seekTime.toFixed(2)}s / ${totalDur.toFixed(2)}s`;

    // Cleanup selection for clean scrub
    this.selectionGraphics.clear();
    this.updateSelectionHighlight();

    // Kill temp timeline
    tempTl.kill();
  }

  private updatePlayheadUI(time: number) {
    const ph = document.getElementById("playhead");
    const totalDur = this.config.duration;
    const p = Math.max(0, Math.min(1, time / totalDur));

    const tracksContainer = document.getElementById("timeline-tracks");
    const firstRow = tracksContainer?.querySelector(".layer-track-row");
    const trackArea = firstRow?.querySelector("div:nth-child(2)");

    if (ph && trackArea && tracksContainer) {
      ph.classList.remove("hidden");
      const rect = trackArea.getBoundingClientRect();
      const containerRect = tracksContainer.getBoundingClientRect();
      const leftOffset = rect.left - containerRect.left;
      const x = leftOffset + p * rect.width;
      ph.style.left = `${x}px`;
    }
  }

  private renderAnimList() {
    const container = document.getElementById("anim-list")!;
    container.innerHTML = "";
    const layer = this.config.layers.find((l) => l.id === this.selectedLayerId);
    if (!layer) return;

    layer.animations.forEach((anim, idx) => {
      if (!anim.params) anim.params = {};
      const div = document.createElement("div");
      div.className = "p-3 bg-white/5 rounded-lg space-y-2 relative";

      const pFields = (ANIM_PARAMS_DEF[anim.type] || [])
        .map((p) => {
          let val = anim.params![p] ?? "";
          if ((p === "angle" || p === "rotate") && val !== "") {
            val = Math.round((Number(val) * 180) / Math.PI);
          }
          const tip = PARAM_TIPS[p] || "";
          return `
            <div class="flex items-center justify-between gap-2">
              <span class="text-[9px] text-gray-500 uppercase border-b border-dashed border-gray-700 cursor-help" title="${tip}">${p}</span>
              <input type="${p === "ease" ? "text" : "number"}" data-param="${p}" class="anim-param w-20 bg-black/60 rounded px-1 text-[9px]" value="${val}" />
            </div>`;
        })
        .join("");

      div.innerHTML = `
        <div class="flex justify-between items-center"><select class="anim-type bg-transparent text-white text-[10px] font-bold outline-none">${Object.keys(
          PRESET_ANIMATIONS,
        )
          .map(
            (k) =>
              `<option value="${k}" ${anim.type === k ? "selected" : ""}>${ANIM_LABELS[k] || k}</option>`,
          )
          .join(
            "",
          )}</select><div class="flex gap-2"><i class="fas fa-cog text-[10px] btn-toggle-params cursor-pointer hover:text-indigo-400"></i><i class="fas fa-times text-[10px] btn-del-anim cursor-pointer hover:text-red-500"></i></div></div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex items-center gap-1"><span class="text-[8px] text-gray-600 border-b border-dashed border-gray-800 cursor-help" title="开始时间 (秒)">ST</span><input type="number" step="0.1" class="anim-start w-full bg-black/40 rounded px-1 text-[10px]" value="${anim.startTime}" /></div>
          <div class="flex items-center gap-1"><span class="text-[8px] text-gray-600 border-b border-dashed border-gray-800 cursor-help" title="动画时长 (秒)">DU</span><input type="number" step="0.1" class="anim-dur w-full bg-black/40 rounded px-1 text-[10px]" value="${anim.duration}" /></div>
        </div>
        ${anim.showParams ? `<div class="pt-2 border-t border-white/5 space-y-1">${pFields}</div>` : ""}
      `;

      div.querySelector(".btn-toggle-params")?.addEventListener("click", () => {
        anim.showParams = !anim.showParams;
        this.renderAnimList();
      });
      div.querySelectorAll(".anim-param").forEach((el) =>
        el.addEventListener("change", (e: Event) => {
          const pn = (e.target as HTMLInputElement).dataset.param!;
          const inputVal = (e.target as HTMLInputElement).value;
          let val: string | number | boolean = inputVal;

          if (pn !== "ease") {
            const num = parseFloat(inputVal);
            val = isNaN(num) ? 0 : num;
            if (pn === "angle" || pn === "rotate") val = (num * Math.PI) / 180;
          }

          if (anim.params) anim.params[pn] = val;
          this.pushHistory();
        }),
      );
      div
        .querySelector(".anim-type")
        ?.addEventListener("change", (e: Event) => {
          anim.type = (e.target as HTMLSelectElement).value;
          this.renderAnimList();
          this.renderTimeline();
          this.pushHistory();
        });
      div
        .querySelector(".anim-start")
        ?.addEventListener("change", (e: Event) => {
          anim.startTime = parseFloat((e.target as HTMLInputElement).value);
          this.renderTimeline();
          this.pushHistory();
        });
      div.querySelector(".anim-dur")?.addEventListener("change", (e: Event) => {
        anim.duration = parseFloat((e.target as HTMLInputElement).value);
        this.renderTimeline();
        this.pushHistory();
      });
      div.querySelector(".btn-del-anim")?.addEventListener("click", () => {
        layer.animations.splice(idx, 1);
        this.renderAnimList();
        this.renderTimeline();
        this.pushHistory();
      });
      container.appendChild(div);
    });

    const addBtn = document.getElementById("btn-add-anim");
    if (addBtn) {
      addBtn.onclick = () => {
        layer.animations.push({ type: "fadeIn", startTime: 0, duration: 1.0 });
        this.renderAnimList();
        this.renderTimeline();
        this.pushHistory();
      };
    }
  }

  private deleteLayer(id: string) {
    this.config.layers = this.config.layers.filter((l) => l.id !== id);
    if (this.selectedLayerId === id) this.selectedLayerId = null;
    this.renderLayerList();
    this.renderTimeline();
    this.refreshPreview();
    this.pushHistory();
  }

  private duplicateLayer(id: string) {
    const layerIdx = this.config.layers.findIndex((l) => l.id === id);
    if (layerIdx === -1) return;

    const source = this.config.layers[layerIdx];
    this.layerCounter++;
    const newId = `${source.id}_copy_${this.layerCounter}`;

    const newLayer: LayerConfig = JSON.parse(JSON.stringify(source));
    newLayer.id = newId;

    this.config.layers.splice(layerIdx, 0, newLayer);

    this.selectLayer(newId);
    this.renderLayerList();
    this.renderTimeline();
    this.refreshPreview();
    this.pushHistory();
  }

  private async refreshPreview() {
    if (this.isPlaying || this.isRendering) return;
    this.isRendering = true;
    const currentId = ++this.renderId;

    try {
      const tempContainer = new PIXI.Container();
      const tempLayerContainers: Map<string, PIXI.Container> = new Map();

      const assetsToLoad = this.config.layers
        .filter((l) => l.type === "pic" && l.asset)
        .map((l) => l.asset);

      if (assetsToLoad.length > 0) {
        try {
          await PIXI.Assets.load(assetsToLoad);
        } catch (e) {
          console.warn("Preload fail", e);
        }
      }

      for (const layer of [...this.config.layers].reverse()) {
        if (!layer.visible) continue;
        const container = new PIXI.Container();
        tempContainer.addChild(container);
        tempLayerContainers.set(layer.id, container);

        let obj: PIXI.DisplayObject;
        if (layer.type === "pic") {
          const assetUrl = layer.asset || "https://pixijs.com/assets/bunny.png";
          let tex = PIXI.Assets.cache.get(assetUrl);
          if (!tex) {
            // Fallback for immediate rendering or non-cached assets
            try {
              tex = PIXI.Texture.from(assetUrl);
            } catch {
              tex = PIXI.Texture.WHITE;
            }
          }

          obj = new PIXI.Sprite(tex || PIXI.Texture.WHITE);
          (obj as PIXI.Sprite).anchor.set(0.5);
        } else {
          obj = new PIXI.Text(layer.text || "Text", {
            fill: 0xffffff,
            fontSize: 48,
            fontWeight: "bold",
          });
          (obj as PIXI.Text).anchor.set(0.5);
        }
        obj.position.set(layer.x, layer.y);
        obj.scale.set(layer.scaleX, layer.scaleY);
        obj.rotation = layer.rotation;
        obj.alpha = layer.alpha ?? 1.0;

        container.addChild(obj);

        const bm =
          (PIXI.BLEND_MODES as any)[
            (layer.blendMode || "normal").toUpperCase()
          ] ?? BLEND_MODE_MAP[layer.blendMode || "normal"];

        // v0.12.7: Smart blend mode application
        // If layer has animations that might add filters (like cloudSea), apply blend to Container
        const hasFilters = layer.animations.some((a) =>
          ["cloudSea", "fireDistortion"].includes(a.type),
        );
        if (hasFilters) {
          (container as any).blendMode = bm;
          (obj as any).blendMode = 0;
        } else {
          (obj as any).blendMode = bm;
          (container as any).blendMode = 0;
        }

        this.enableLayerInteraction(obj, layer);
      }

      if (currentId !== this.renderId) return;

      this.sceneContainer.removeChildren();
      this.sceneContainer.addChild(tempContainer);
      this.layerContainers = tempLayerContainers;

      this.app.stage.removeChildren();
      this.app.stage.addChild(this.sceneContainer, this.selectionGraphics);

      this.applyMasks();
      this.updateSelectionHighlight();
    } finally {
      this.isRendering = false;
    }
  }

  private applyMasks() {
    this.config.layers.forEach((l) => {
      const sourceCont = this.layerContainers.get(l.id);
      if (sourceCont) {
        if (l.maskId && l.visible) {
          const targetCont = this.layerContainers.get(l.maskId);
          const targetObj = targetCont?.children[0];
          if (targetObj) {
            sourceCont.mask = targetObj;
            (targetObj as any).blendMode = 0;
          } else {
            sourceCont.mask = null;
          }
        } else {
          sourceCont.mask = null;
        }
      }
    });
  }

  private buildMasterTimeline(onUpdate?: (time: number) => void) {
    const totalDur = this.config.duration;
    const tl = gsap.timeline({
      paused: true,
      onUpdate: () => {
        const time = tl.time();
        if (onUpdate) onUpdate(time);
      },
    });

    for (const layer of this.config.layers) {
      const cont = this.layerContainers.get(layer.id);
      if (!cont) continue;
      const target = cont.children[0] as any;
      if (!target) continue;

      // Reset state before building
      gsap.killTweensOf(target);
      gsap.killTweensOf(target.scale);
      target.position.set(layer.x, layer.y);
      target.scale.set(layer.scaleX, layer.scaleY);
      target.rotation = layer.rotation;
      target.alpha = layer.alpha ?? 1.0;
      target.filters = null;

      if (!layer.visible) continue;

      layer.animations.forEach((anim) => {
        try {
          const code =
            anim.type === "custom" ? anim.script : PRESET_ANIMATIONS[anim.type];
          if (!code) return;
          const f = new Function(
            "target",
            "container",
            "PIXI",
            "gsap",
            "duration",
            "startTime",
            "params",
            "return " + code,
          );
          const tween = f(
            target,
            cont,
            PIXI,
            gsap,
            anim.duration,
            anim.startTime,
            anim.params || {},
          );
          if (tween) tl.add(tween, anim.startTime);
        } catch (e) {
          console.error("Anim error", layer.id, e);
        }
      });
    }

    // Physical hard stop at totalDur
    tl.addPause(totalDur, () => {
      if (this.isPlaying) this.stop();
    });

    // Ensure the timeline is at least totalDur long
    tl.to({}, { duration: 0 }, totalDur);

    return tl;
  }

  private async play() {
    if (this.isPlaying) {
      this.stop();
      return;
    }

    this.isPlaying = true;
    const pb = document.getElementById("btn-play")!;
    if (pb) {
      pb.innerHTML = `<i class="fas fa-stop"></i> STOP`;
      pb.classList.replace("bg-indigo-600", "bg-red-600");
    }

    this.selectionGraphics.clear();

    this.masterTl = this.buildMasterTimeline((time) => {
      this.updatePlayheadUI(time);
      const timeDisplay = document.getElementById("timeline-time");
      if (timeDisplay)
        timeDisplay.textContent = `${time.toFixed(2)}s / ${this.config.duration.toFixed(2)}s`;
    });

    this.masterTl.play(0);
  }

  private stop() {
    this.isPlaying = false;
    const pb = document.getElementById("btn-play")!;
    if (pb) {
      pb.innerHTML = `<i class="fas fa-play"></i> PLAY`;
      pb.classList.replace("bg-red-600", "bg-indigo-600");
    }

    if (this.masterTl) {
      this.masterTl.kill();
      this.masterTl = null;
    }
    this.refreshPreview();
  }

  private enableLayerInteraction(obj: PIXI.DisplayObject, config: LayerConfig) {
    if (config.locked) {
      obj.eventMode = "none";
      return;
    }
    obj.eventMode = "static";
    obj.cursor = "move";
    let dragging = false;
    obj.on("pointerdown", () => {
      this.selectLayer(config.id);
      dragging = true;
    });
    obj.on("pointermove", (e: PIXI.FederatedPointerEvent) => {
      if (dragging) {
        const p = e.getLocalPosition(obj.parent);
        obj.x = Math.round(p.x);
        obj.y = Math.round(p.y);
        config.x = obj.x;
        config.y = obj.y;
        this.updateSelectionHighlight();
      }
    });
    const end = () => {
      if (dragging) this.pushHistory();
      dragging = false;
    };
    obj.on("pointerup", end);
    obj.on("pointerupoutside", end);
  }

  private updateSelectionHighlight() {
    this.selectionGraphics.clear();
    if (!this.selectedLayerId || this.isPlaying) return;
    const c = this.layerContainers.get(this.selectedLayerId);
    if (!c || c.children.length === 0) return;
    const b = c.getBounds();
    this.selectionGraphics
      .lineStyle(2, 0x6366f1, 1)
      .drawRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8);
  }

  private resizeCanvas() {
    const p = (this.app.view as HTMLCanvasElement).parentElement;
    if (p) {
      this.app.renderer.resize(p.clientWidth, p.clientHeight);
      this.refreshPreview();
    }
  }

  private newProject() {
    if (
      !confirm(
        "Are you sure you want to create a NEW project? Unsaved changes will be lost.",
      )
    )
      return;
    this.config = {
      version: "0.12.8",
      name: "NewProject",
      duration: 5.0,
      layers: [],
    };
    this.selectedLayerId = null;
    this.layerCounter = 0;
    this.initDefaultScene();
    this.refreshHeader();
    this.renderLayerList();
    this.renderTimeline();
    this.refreshPreview();
    this.pushHistory();
  }

  private async exportProjectZip() {
    const zip = new JSZip();
    const projectCopy: PixiAniConfig = JSON.parse(JSON.stringify(this.config));
    const assetsFolder = zip.folder("assets");

    for (const layer of projectCopy.layers) {
      if (
        layer.type === "pic" &&
        layer.asset &&
        layer.asset.startsWith("data:image")
      ) {
        // Extract base64
        const parts = layer.asset.split(",");
        const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);

        const ext = mime.split("/")[1] || "png";
        const fileName = `${layer.id}.${ext}`;
        assetsFolder.file(fileName, u8arr);

        // Update JSON to use relative path for "reskinning"
        layer.asset = `./assets/${fileName}`;
      }
    }

    zip.file("project.json", JSON.stringify(projectCopy, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = `${this.config.name || "victory_project"}.zip`;
    a.click();

    this.showStatus("Project ZIP Exported!", "success");
  }

  private async importProjectZip(file: File) {
    try {
      this.showStatus("Importing project...", "info");
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const jsonFile = contents.file("project.json");
      if (!jsonFile) throw new Error("project.json not found in ZIP");

      const jsonText = await jsonFile.async("text");
      const newConfig: PixiAniConfig = JSON.parse(jsonText);

      // Restore assets from zip
      for (const layer of newConfig.layers) {
        if (
          layer.type === "pic" &&
          layer.asset &&
          layer.asset.startsWith("./assets/")
        ) {
          const fileName = layer.asset.replace("./assets/", "");
          const assetFile = contents.file(`assets/${fileName}`);
          if (assetFile) {
            const blob = await assetFile.async("blob");
            // Use DataURL instead of blob URL for persistence and Pixi compatibility
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            layer.asset = base64;
          }
        }
      }

      this.config = newConfig;
      this.config.version = "13.00";

      this.selectedLayerId = null;
      this.renderLayerList();
      this.renderTimeline();
      this.refreshPreview();
      this.pushHistory();
      this.showStatus("Project Imported Successfully!", "success");
    } catch (e) {
      console.error(e);
      alert("Import failed: " + (e as Error).message);
    }
  }

  private showStatus(msg: string, type: "info" | "success" | "error" = "info") {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = msg;
    el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-xs z-50 shadow-2xl transition-all ${
      type === "success"
        ? "bg-green-600"
        : type === "error"
          ? "bg-red-600"
          : "bg-indigo-600"
    }`;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 3000);
  }

  private copyTS() {
    navigator.clipboard.writeText(JSON.stringify(this.config, null, 2));
  }
  private exportTS() {
    const blob = new Blob([JSON.stringify(this.config, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "project.json";
    a.click();
  }
}

new VictoryEditorV2();
