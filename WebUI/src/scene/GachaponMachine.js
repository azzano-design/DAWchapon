import * as THREE from "three";

import { getToy, TOYS } from "../toyData.js";
import { makeToyMesh } from "./toyMesh.js";

// Machine proportions (world units), front panel centered on local X=0,
// front face at Z = FRONT_Z. Modeled loosely on a classic capsule-vending
// "gashapon" machine: pedestal, white body with a dial knob + dispensing
// window, and a large clear capsule bin on top.
const PEDESTAL = { width: 1.8, height: 0.35, depth: 1.3 };
const BODY = { width: 1.55, height: 1.9, depth: 1.05 };
const BIN = { width: 1.5, height: 1.7, depth: 1.0 };
const BADGE = { width: 1.2, height: 0.32, depth: 0.9 };
const FRONT_Z = BODY.depth / 2;

const PEDESTAL_TOP_Y = PEDESTAL.height;
const BODY_CENTER_Y = PEDESTAL_TOP_Y + BODY.height / 2;
const BODY_TOP_Y = PEDESTAL_TOP_Y + BODY.height;
const BIN_CENTER_Y = BODY_TOP_Y + BIN.height / 2;
const BIN_TOP_Y = BODY_TOP_Y + BIN.height;
const BADGE_CENTER_Y = BIN_TOP_Y + BADGE.height / 2;

const KNOB_Y = PEDESTAL_TOP_Y + BODY.height * 0.58;
const WINDOW_Y = PEDESTAL_TOP_Y + BODY.height * 0.17;
const COIN_SLOT_Y = PEDESTAL_TOP_Y + BODY.height * 0.86;

const MACHINE_TOTAL_HEIGHT = BADGE_CENTER_Y + BADGE.height / 2;

const SCENE_BACKGROUND = 0x15151a;
const GOLD = new THREE.Color(0xffd36b);
const BACKLIGHT_COLOR = 0x7aa2ff;

function makeCanvasTexture(draw, width = 256, height = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeBadgeTexture() {
  return makeCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e0455b";
    ctx.font = "bold 46px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DAWTCHAPON", w / 2, h / 2);
  }, 512, 160);
}

function makeSidePillarTexture() {
  return makeCanvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#e0455b";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 6;
    ctx.setLineDash([2, 14]);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 10);
    ctx.lineTo(w * 0.5, h - 10);
    ctx.stroke();

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("D A W T C H A P O N   S T A T I O N", 0, 0);
    ctx.restore();
  }, 128, 1024);
}

// A soft 4-point sparkle, used for the reveal's particle burst.
function makeStarTexture() {
  return makeCanvasTexture((ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.35, "rgba(255,255,255,0.85)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const drawSpike = (length, width) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - length);
      ctx.lineTo(cx + width, cy);
      ctx.lineTo(cx, cy + length);
      ctx.lineTo(cx - width, cy);
      ctx.closePath();
      ctx.fill();
    };

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    drawSpike(w * 0.48, w * 0.05);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-cx, -cy);
    drawSpike(w * 0.3, w * 0.03);
    ctx.restore();
  }, 64, 64);
}

// A plain soft round glow (no spikes), used for the beat-pulse backlight.
function makeGlowTexture() {
  return makeCanvasTexture((ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, 128, 128);
}

// Classic two-tone capsule: a colored top half and a second half, built
// from two hemisphere shells sharing one center so they read as a single
// closed sphere until animated apart.
function makeCapsuleHalves(topColor, bottomColor, radius = 0.22, { castShadow = true, transparent = false } = {}) {
  const group = new THREE.Group();

  const topGeo = new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const bottomGeo = new THREE.SphereGeometry(radius, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

  // DoubleSide: these are open hemisphere shells, so without it the
  // concave inner surface is backface-culled — invisible from angles that
  // look into the open half, making it read as a flat sliver instead of a
  // proper hollow bowl.
  // transparent stays false for the (many, densely packed) bin capsules —
  // WebGL's transparency sort gets visibly glitchy with that many
  // overlapping transparent objects. Only the single falling prize
  // capsule opts into transparent, for its fade-out.
  const top = new THREE.Mesh(
    topGeo,
    new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.35, side: THREE.DoubleSide, transparent })
  );
  const bottom = new THREE.Mesh(
    bottomGeo,
    new THREE.MeshStandardMaterial({ color: bottomColor, roughness: 0.5, side: THREE.DoubleSide, transparent })
  );
  top.castShadow = castShadow;
  bottom.castShadow = castShadow;

  group.add(top, bottom);
  return { group, top, bottom };
}

export class GachaponMachine {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = {
      onSpinRequested: () => {},
      onRumble: () => {},
      onChime: () => {},
      onGlowChange: () => {},
      onToyShown: () => {},
      onReveal: () => {},
      onStateChange: () => {},
      onRattleStart: () => {},
      onRattleStop: () => {},
      ...callbacks,
    };

    this.knobAngle = 0;
    this.dragStartAngle = 0;
    this.accumulatedRotation = 0;
    this.dragging = false;

    this.prizeCapsuleGroup = null;
    this.prizeCapsuleTop = null;
    this.prizeCapsuleBottom = null;
    this.capsuleFall = null;
    this.shakeTime = 0;

    // The persistent display of "whichever toy is currently active,"
    // sitting beside the machine — separate from the transient capsule
    // reveal. Fades in once the reveal card is dismissed, fades out the
    // moment the next capsule drops.
    this.sidebarToyMesh = null;
    this.sidebarFade = null;
    this._binBounceAmount = 0;
    this._rattlePlaying = false;
    this._time = 0;

    this._hemiBaseSky = new THREE.Color(0xffffff);
    this._keyBaseColor = new THREE.Color(0xfff6e8);
    this._hemiBaseIntensity = 0.65;
    this._keyBaseIntensity = 1.1;
    this._fillBaseIntensity = 0.3;
    this._glowAmount = 0;
    this._glowTarget = 0;

    // Dims the whole scene's lighting to near-black when the plugin is
    // inactive (host bypass/power button off), fading softly up to the
    // normal lighting below when it's reactivated. Starts "active" since
    // hosts insert plugins enabled by default.
    this._activeAmount = 1;
    this._activeTarget = 1;

    // Beat-synced backlight pulse, driven by host transport/tempo info
    // (see setPlaybackInfo). Free-runs between updates from the backend,
    // resynced each time a fresh one arrives.
    this._beatIsPlaying = false;
    this._beatBpm = 120;
    this._beatPosition = 0;
    this._beatPositionTimestampMs = 0;
    this._beatPulseGateAmount = 0;

    this._initScene();
    this._initMachine();
    this._initKnob();
    this._initParticles();
    this._initBacklight();
    this._initPointerHandling();

    this._setState("idle");

    this._onResize = () => this._handleResize();
    window.addEventListener("resize", this._onResize);
    this._handleResize();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _setState(next) {
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_BACKGROUND);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const targetY = MACHINE_TOTAL_HEIGHT * 0.52;
    this.camera.position.set(0, targetY + 0.3, 6.4);
    this.camera.lookAt(0, targetY, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    // Soft overall fill (sky/ground) plus a shadow-casting key light and a
    // gentle opposite-side fill light for a clean studio-product look.
    this.ambientLight = new THREE.HemisphereLight(this._hemiBaseSky, 0xd9d2c4, this._hemiBaseIntensity);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(this._keyBaseColor, this._keyBaseIntensity);
    this.keyLight.position.set(2.6, 5.2, 4.2);
    this.keyLight.target.position.set(0, BODY_CENTER_Y, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -2.4;
    this.keyLight.shadow.camera.right = 2.4;
    this.keyLight.shadow.camera.top = 5.2;
    this.keyLight.shadow.camera.bottom = -0.5;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 13;
    this.keyLight.shadow.bias = -0.002;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.fillLight.position.set(-3, 2.6, 2.2);
    this.scene.add(this.fillLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1e1e24, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _initMachine() {
    this.machineGroup = new THREE.Group();
    this.scene.add(this.machineGroup);

    const white = 0xf4f4f2;

    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(PEDESTAL.width, PEDESTAL.height, PEDESTAL.depth),
      new THREE.MeshStandardMaterial({ color: white, roughness: 0.6 })
    );
    pedestal.position.y = PEDESTAL.height / 2;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    this.machineGroup.add(pedestal);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BODY.width, BODY.height, BODY.depth),
      new THREE.MeshStandardMaterial({ color: white, roughness: 0.5 })
    );
    body.position.y = BODY_CENTER_Y;
    body.castShadow = true;
    body.receiveShadow = true;
    this.machineGroup.add(body);

    const bin = new THREE.Mesh(
      new THREE.BoxGeometry(BIN.width, BIN.height, BIN.depth),
      new THREE.MeshPhysicalMaterial({
        color: 0xdff1fb,
        transparent: true,
        opacity: 0.25,
        roughness: 0.08,
        transmission: 0.88,
        thickness: 0.4,
      })
    );
    bin.position.y = BIN_CENTER_Y;
    this.machineGroup.add(bin);

    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(BADGE.width, BADGE.height, BADGE.depth),
      new THREE.MeshStandardMaterial({ map: makeBadgeTexture(), color: white, roughness: 0.6 })
    );
    badge.position.y = BADGE_CENTER_Y;
    badge.castShadow = true;
    this.machineGroup.add(badge);

    const sidePillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, BODY.height + BIN.height, 1.0),
      new THREE.MeshStandardMaterial({ map: makeSidePillarTexture(), roughness: 0.5 })
    );
    sidePillar.position.set(BODY.width / 2 + 0.06, BODY_CENTER_Y + BIN.height / 2, 0);
    sidePillar.castShadow = true;
    this.machineGroup.add(sidePillar);

    const coinSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.32, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 })
    );
    coinSlot.position.set(BODY.width * 0.28, COIN_SLOT_Y, FRONT_Z + 0.02);
    this.machineGroup.add(coinSlot);

    // Dispensing window: the "bottom hole" the prize capsule appears in.
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: white, roughness: 0.6 })
    );
    windowFrame.position.set(0, WINDOW_Y, FRONT_Z - 0.1);
    this.machineGroup.add(windowFrame);

    const windowHole = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.4, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 })
    );
    windowHole.position.set(0, WINDOW_Y, FRONT_Z - 0.07);
    this.machineGroup.add(windowHole);

    // Pulled well forward of FRONT_Z (by more than the prize capsule's
    // own radius) so it sits clear in front of the body instead of
    // clipping back into it.
    const dispenserZ = FRONT_Z + 0.36;

    this.dispenserAnchor = new THREE.Object3D();
    this.dispenserAnchor.position.set(0, WINDOW_Y + 0.02, dispenserZ);
    this.machineGroup.add(this.dispenserAnchor);

    this.dispenserDropStart = new THREE.Object3D();
    this.dispenserDropStart.position.set(0, WINDOW_Y + 0.55, dispenserZ);
    this.machineGroup.add(this.dispenserDropStart);

    this._initBinCapsules();
  }

  // Densely packs the clear bin with resting capsules (an elliptical
  // footprint with a little random dropout) so it reads as full rather
  // than a handful of balls floating in the glass.
  _initBinCapsules() {
    this.binCapsules = new THREE.Group();

    const radius = 0.14;
    const spacing = radius * 1.65;
    const marginXZ = 0.14;
    const halfW = BIN.width / 2 - marginXZ;
    const halfD = BIN.depth / 2 - marginXZ;
    const fillBottom = BIN_CENTER_Y - BIN.height / 2 + 0.18;
    const fillTop = BIN_CENTER_Y + BIN.height / 2 - 0.4;

    let colorCursor = 0;
    for (let y = fillBottom; y <= fillTop; y += spacing * 0.9) {
      for (let x = -halfW; x <= halfW; x += spacing) {
        for (let z = -halfD; z <= halfD; z += spacing) {
          const nx = x / halfW;
          const nz = z / halfD;
          if (nx * nx + nz * nz > 0.92) continue;
          if (Math.random() > 0.88) continue;

          const toy = TOYS[colorCursor % TOYS.length];
          colorCursor += 1;

          // Same two-tone capsule construction as the prize capsule, so
          // the ones resting in the bin actually match the one that drops.
          const { group: capsule } = makeCapsuleHalves(
            toy.color,
            0xf4f4f2,
            radius * (0.85 + Math.random() * 0.25),
            { castShadow: false }
          );
          capsule.position.set(
            x + (Math.random() - 0.5) * spacing * 0.4,
            y + (Math.random() - 0.5) * spacing * 0.4,
            z + (Math.random() - 0.5) * spacing * 0.4
          );
          capsule.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
          capsule.userData.basePosition = capsule.position.clone();
          capsule.userData.bouncePhase = Math.random() * Math.PI * 2;
          this.binCapsules.add(capsule);
        }
      }
    }

    this.machineGroup.add(this.binCapsules);
  }

  // Front-facing dial: flat 2D shapes in the group's local XY plane, which
  // already faces the camera since the group itself isn't rotated.
  _initKnob() {
    this.knobGroup = new THREE.Group();
    this.knobGroup.position.set(0, KNOB_Y, FRONT_Z + 0.01);
    this.machineGroup.add(this.knobGroup);

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    );
    this.knobGroup.add(base);
    this.knobHitTarget = base;

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.4, 32),
      new THREE.MeshStandardMaterial({ color: 0x3aa6e0, roughness: 0.4 })
    );
    outerRing.position.z = 0.002;
    this.knobGroup.add(outerRing);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.3, 32),
      new THREE.MeshStandardMaterial({ color: 0xf2d06e, roughness: 0.4 })
    );
    innerRing.position.z = 0.003;
    this.knobGroup.add(innerRing);

    const pointerShape = new THREE.Shape();
    pointerShape.moveTo(-0.38, 0.05);
    pointerShape.lineTo(-0.38, -0.05);
    pointerShape.lineTo(-0.2, 0);
    pointerShape.closePath();
    const pointer = new THREE.Mesh(
      new THREE.ShapeGeometry(pointerShape),
      new THREE.MeshStandardMaterial({ color: 0xe0455b, roughness: 0.4 })
    );
    pointer.position.z = 0.004;
    this.knobGroup.add(pointer);

    const hub = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 })
    );
    hub.position.z = 0.005;
    this.knobGroup.add(hub);
  }

  // A reusable pool of star sprites for the reveal's explosive burst,
  // instead of a single static glow blob.
  _initParticles() {
    const starTexture = makeStarTexture();
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    this.particles = [];
    const count = 260;
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: starTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.setScalar(0.0001);
      sprite.userData.active = false;
      sprite.userData.life = 0;
      sprite.userData.maxLife = 1;
      sprite.userData.baseScale = 0.15;
      sprite.userData.velocity = new THREE.Vector3();
      sprite.userData.angularVelocity = 0;
      this.particleGroup.add(sprite);
      this.particles.push(sprite);
    }
  }

  // A soft colored light behind the machine that pulses in time with the
  // host's tempo while a track is playing — purely additive on top of the
  // default lighting, invisible (gated to zero) whenever nothing's
  // playing.
  _initBacklight() {
    const glowTexture = makeGlowTexture();
    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color: BACKLIGHT_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.backlightSprite = new THREE.Sprite(material);
    this.backlightSprite.scale.set(3.6, 3.6, 1);
    this.backlightSprite.position.set(0, MACHINE_TOTAL_HEIGHT * 0.45, -1.4);
    this.scene.add(this.backlightSprite);

    this.backlightPointLight = new THREE.PointLight(BACKLIGHT_COLOR, 0, 6);
    this.backlightPointLight.position.set(0, MACHINE_TOTAL_HEIGHT * 0.45, -1.0);
    this.scene.add(this.backlightPointLight);
  }

  // Called from the WebView bridge whenever the host's transport/tempo
  // info changes (and periodically while playing, to resync phase).
  setPlaybackInfo({ isPlaying, bpm, beatPosition }) {
    this._beatIsPlaying = Boolean(isPlaying);
    if (typeof bpm === "number" && bpm > 0) this._beatBpm = bpm;
    if (typeof beatPosition === "number") this._beatPosition = beatPosition;
    this._beatPositionTimestampMs = performance.now();
  }

  _updateBacklight(dt) {
    const target = this._beatIsPlaying ? 1 : 0;
    this._beatPulseGateAmount += (target - this._beatPulseGateAmount) * Math.min(1, dt * 4);

    let brightness = 0;
    if (this._beatPulseGateAmount > 0.001) {
      const elapsedSeconds = (performance.now() - this._beatPositionTimestampMs) / 1000;
      const elapsedBeats = this._beatIsPlaying ? (this._beatBpm / 60) * elapsedSeconds : 0;
      const currentBeat = this._beatPosition + elapsedBeats;
      const beatPhase = currentBeat - Math.floor(currentBeat);
      // Peaks the instant a beat lands, then eases off before the next.
      const pulseShape = Math.pow(1 - beatPhase, 4);
      brightness = pulseShape * this._beatPulseGateAmount;
    }

    this.backlightSprite.material.opacity = brightness * 0.45;
    this.backlightPointLight.intensity = brightness * 1.4;
  }

  _burstParticles(origin) {
    const palette = [0xffffff, 0xfff2cc, 0xffe9a8, 0xffd36b, 0xffc93c, 0xffffff];

    for (const sprite of this.particles) {
      const angle = Math.random() * Math.PI * 2;
      // Full-sphere spread (biased slightly upward) rather than a narrow
      // upward fountain, so it reads as a real explosion in all directions.
      const elevation = (Math.random() - 0.3) * Math.PI * 0.9;
      const speed = 2.2 + Math.random() * 7;

      sprite.position.copy(origin);
      sprite.userData.velocity.set(
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed + 1.0,
        Math.sin(angle) * Math.cos(elevation) * speed
      );
      sprite.userData.angularVelocity = (Math.random() - 0.5) * 10;
      sprite.userData.life = 0;
      sprite.userData.maxLife = 0.8 + Math.random() * 1.0;
      sprite.userData.baseScale = 0.07 + Math.random() * 0.32;
      sprite.userData.active = true;

      sprite.material.color.setHex(palette[Math.floor(Math.random() * palette.length)]);
      sprite.material.opacity = 1;
      sprite.material.rotation = Math.random() * Math.PI;
      sprite.scale.setScalar(sprite.userData.baseScale * 0.2);
    }
  }

  _updateParticles(dt) {
    for (const sprite of this.particles) {
      if (!sprite.userData.active) continue;

      sprite.userData.life += dt;
      const lifeT = sprite.userData.life / sprite.userData.maxLife;

      if (lifeT >= 1) {
        sprite.userData.active = false;
        sprite.material.opacity = 0;
        continue;
      }

      sprite.userData.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.8));
      sprite.userData.velocity.y -= dt * 1.1;
      sprite.position.addScaledVector(sprite.userData.velocity, dt);

      sprite.material.rotation += sprite.userData.angularVelocity * dt;

      const growT = Math.min(lifeT / 0.25, 1);
      const fadeT = Math.max(0, (lifeT - 0.6) / 0.4);
      sprite.material.opacity = growT * (1 - fadeT);
      sprite.scale.setScalar(sprite.userData.baseScale * (0.3 + growT * 0.7));
    }
  }

  _initPointerHandling() {
    const dom = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    const toPointer = (event) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    dom.addEventListener("pointerdown", (event) => {
      if (this.state !== "idle") return;

      toPointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObject(this.knobHitTarget, false);
      if (hits.length === 0) return;

      this.dragging = true;
      this.accumulatedRotation = 0;
      this.dragStartAngle = Math.atan2(this.pointer.y, this.pointer.x);
      dom.setPointerCapture(event.pointerId);
    });

    dom.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;

      toPointer(event);
      const angle = Math.atan2(this.pointer.y, this.pointer.x);
      let delta = angle - this.dragStartAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.dragStartAngle = angle;

      // The dial is a one-way ratchet, like a real gashapon crank: only
      // clockwise motion (negative delta, in our rotation.z convention)
      // turns it. Counter-clockwise motion is simply ignored rather than
      // spinning it backward or resetting progress.
      if (delta >= 0) return;

      this.accumulatedRotation += delta;
      this.knobAngle += delta;

      const fullSpinThreshold = Math.PI * 1.6;
      if (-this.accumulatedRotation >= fullSpinThreshold) {
        this.dragging = false;
        this._beginSpin();
      }
    });

    const endDrag = () => {
      this.dragging = false;
    };
    dom.addEventListener("pointerup", endDrag);
    dom.addEventListener("pointercancel", endDrag);
  }

  _beginSpin() {
    if (this.state !== "idle") return;
    this._setState("spinning");
    this.callbacks.onSpinRequested();
  }

  // Called once the chosen toy is known (from the backend, or the
  // standalone demo fallback). Runs: crank -> capsule drop (+ rumble) ->
  // capsule opens revealing the toy -> gold glow -> onReveal callback
  // (caller shows the name/effect text). The caller must call dismiss()
  // when that text is hidden, so the capsule/toy disappear in sync.
  playSpinResult(toyIndex) {
    this._setState("spinning");
    this._clearPrizeCapsule();

    this._spin = {
      phase: "crank",
      elapsed: 0,
      toyIndex,
    };
  }

  // The capsule has already fallen away off-screen by this point (see
  // _startCapsuleFall) — this just fades the just-confirmed toy in beside
  // the machine as the persistent "currently active" display, and lets
  // the gold glow fade out. Call this at the same moment the on-screen
  // name/effect text is hidden.
  dismiss() {
    if (!this._spin || this._spin.phase !== "revealed") return;

    this.showSidebarToy(this._spin.toyIndex);
    this.setGlow(false);
    this.callbacks.onGlowChange(false);

    this._spin = null;
    // Deliberately not snapping knobAngle to 0 here — it's left exactly
    // where the crank animation stopped (frozen through the whole
    // drop/open/reveal sequence since _updateKnob's decay is gated on
    // !this._spin), and now that _spin is null, that same decay takes
    // over next frame and eases it back to rest on its own.
    this._setState("idle");
  }

  _clearPrizeCapsule() {
    if (this.prizeCapsuleGroup) {
      this.dispenserAnchor.remove(this.prizeCapsuleGroup);
      this.prizeCapsuleGroup = null;
      this.prizeCapsuleTop = null;
      this.prizeCapsuleBottom = null;
    }
    this.capsuleFall = null;
  }

  // Fades in a persistent display of the given toy, sitting beside the
  // machine. Replaces (without a fade) whatever was there before — in
  // the normal flow hideSidebarToy() has already faded the old one out
  // well before this is called.
  showSidebarToy(toyIndex) {
    this._clearSidebarToy();

    const mesh = makeToyMesh(toyIndex);
    mesh.material.transparent = true;
    mesh.material.opacity = 0;
    mesh.scale.setScalar(0.22);
    mesh.position.set(BODY.width / 2 + 0.75, BODY_CENTER_Y, FRONT_Z * 0.2);
    this.machineGroup.add(mesh);

    this.sidebarToyMesh = mesh;
    this.sidebarFade = { from: 0, to: 1, duration: 0.6, elapsed: 0, removeOnComplete: false };
  }

  // Fades out the current sidebar toy display, if any.
  hideSidebarToy() {
    if (!this.sidebarToyMesh) return;
    this.sidebarFade = {
      from: this.sidebarToyMesh.material.opacity,
      to: 0,
      duration: 0.4,
      elapsed: 0,
      removeOnComplete: true,
    };
  }

  _clearSidebarToy() {
    if (this.sidebarToyMesh) {
      this.machineGroup.remove(this.sidebarToyMesh);
      this.sidebarToyMesh.geometry.dispose();
      this.sidebarToyMesh.material.dispose();
      this.sidebarToyMesh = null;
    }
    this.sidebarFade = null;
  }

  _updateSidebarToy(dt) {
    if (this.sidebarToyMesh) {
      this.sidebarToyMesh.rotation.y += dt * 0.3;
    }

    if (!this.sidebarFade || !this.sidebarToyMesh) return;

    this.sidebarFade.elapsed += dt;
    const t = Math.min(this.sidebarFade.elapsed / this.sidebarFade.duration, 1);
    this.sidebarToyMesh.material.opacity =
      this.sidebarFade.from + (this.sidebarFade.to - this.sidebarFade.from) * t;

    if (t >= 1) {
      const { removeOnComplete } = this.sidebarFade;
      this.sidebarFade = null;
      if (removeOnComplete) this._clearSidebarToy();
    }
  }

  _handleResize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / Math.max(clientHeight, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  setGlow(active) {
    this._glowTarget = active ? 1 : 0;
  }

  // Dims the scene's base lighting to near-black while the plugin is
  // inactive (host bypass/power button off), fading softly back up to
  // the normal lighting once reactivated. Independent of setPlaybackInfo
  // / the beat pulse — a bypassed-but-still-playing track can keep
  // pulsing in the dark, if the host gives us the chance to notice it's
  // still playing.
  setPluginActive(active) {
    this._activeTarget = active ? 1 : 0.06;
  }

  _updateActiveDim(dt) {
    this._activeAmount += (this._activeTarget - this._activeAmount) * Math.min(1, dt * 1.6);
  }

  _animate(nowMs) {
    requestAnimationFrame(this._animate);

    const dt = this._lastFrameMs ? Math.min((nowMs - this._lastFrameMs) / 1000, 0.05) : 0;
    this._lastFrameMs = nowMs;
    this._time += dt;

    this._updateKnob(dt);
    this._updateSpinSequence(dt);
    this._updateCapsuleFall(dt);
    this._updateShake(dt);
    this._updateActiveDim(dt);
    this._updateGlow(dt);
    this._updateBinCapsules(dt);
    this._updateParticles(dt);
    this._updateSidebarToy(dt);
    this._updateBacklight(dt);

    this.renderer.render(this.scene, this.camera);
  }

  _updateKnob(dt) {
    if (!this.dragging && !this._spin) {
      this.knobAngle *= Math.max(0, 1 - dt * 3);
    }
    this.knobGroup.rotation.z = this.knobAngle;
  }

  // The bin capsules bounce a little while the knob is being turned
  // (manually or during the scripted crank), otherwise settle to rest.
  _updateBinCapsules(dt) {
    const spinning = Boolean(this._spin && this._spin.phase === "crank");
    const target = this.dragging || spinning ? 1 : 0;
    this._binBounceAmount += (target - this._binBounceAmount) * Math.min(1, dt * 6);

    if (target === 1 && !this._rattlePlaying) {
      this._rattlePlaying = true;
      this.callbacks.onRattleStart();
    } else if (target === 0 && this._rattlePlaying) {
      this._rattlePlaying = false;
      this.callbacks.onRattleStop();
    }

    const amount = this._binBounceAmount;
    for (const capsule of this.binCapsules.children) {
      if (amount < 0.001) {
        capsule.position.copy(capsule.userData.basePosition);
        continue;
      }
      const bounce = Math.sin(this._time * 16 + capsule.userData.bouncePhase) * 0.03 * amount;
      capsule.position.copy(capsule.userData.basePosition);
      capsule.position.y += bounce;
    }
  }

  _updateGlow(dt) {
    const rate = this._glowTarget > this._glowAmount ? 6 : 2.5;
    this._glowAmount += (this._glowTarget - this._glowAmount) * Math.min(1, dt * rate);

    this.ambientLight.color.copy(this._hemiBaseSky).lerp(GOLD, this._glowAmount * 0.7);
    this.ambientLight.intensity = (this._hemiBaseIntensity + this._glowAmount * 0.5) * this._activeAmount;

    this.keyLight.color.copy(this._keyBaseColor).lerp(GOLD, this._glowAmount * 0.6);
    this.keyLight.intensity = (this._keyBaseIntensity + this._glowAmount * 0.4) * this._activeAmount;

    this.fillLight.intensity = this._fillBaseIntensity * this._activeAmount;
  }

  _updateShake(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const amount = this.shakeTime * 0.08;
      this.machineGroup.position.x = (Math.random() - 0.5) * amount;
      this.machineGroup.position.y = (Math.random() - 0.5) * amount * 0.5;
      this.machineGroup.rotation.z = (Math.random() - 0.5) * amount * 0.05;
    } else {
      this.machineGroup.position.set(0, 0, 0);
      this.machineGroup.rotation.z = 0;
    }
  }

  _updateSpinSequence(dt) {
    const spin = this._spin;
    if (!spin) return;

    spin.elapsed += dt;

    if (spin.phase === "crank") {
      const duration = 0.6;
      const t = Math.min(spin.elapsed / duration, 1);
      this.knobAngle = -t * Math.PI * 2 * 2.2;

      if (t >= 1) {
        spin.phase = "drop";
        spin.elapsed = 0;
        this.hideSidebarToy();

        const toy = getToy(spin.toyIndex);
        const { group, top, bottom } = makeCapsuleHalves(toy.color, 0xf4f4f2, 0.26, { transparent: true });
        this.prizeCapsuleGroup = group;
        this.prizeCapsuleTop = top;
        this.prizeCapsuleBottom = bottom;
        group.position.copy(this.dispenserDropStart.position.clone().sub(this.dispenserAnchor.position));
        this.dispenserAnchor.add(group);
      }
      return;
    }

    if (spin.phase === "drop") {
      const duration = 0.32;
      const t = Math.min(spin.elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const startY = this.dispenserDropStart.position.y - this.dispenserAnchor.position.y;
      this.prizeCapsuleGroup.position.y = startY * (1 - eased);
      this.prizeCapsuleGroup.rotation.z = (1 - eased) * Math.PI * 1.5;

      if (t >= 1) {
        this.prizeCapsuleGroup.position.y = 0;
        this.prizeCapsuleGroup.rotation.z = 0;
        this.shakeTime = 0.3;
        this.callbacks.onRumble();

        spin.phase = "settle";
        spin.elapsed = 0;
      }
      return;
    }

    if (spin.phase === "settle") {
      const duration = 0.3;
      if (spin.elapsed >= duration) {
        spin.phase = "open";
        spin.elapsed = 0;
      }
      return;
    }

    if (spin.phase === "open") {
      const duration = 0.5;
      const t = Math.min(spin.elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      this.prizeCapsuleTop.position.y = eased * 0.22;
      this.prizeCapsuleTop.rotation.x = -eased * 0.7;
      this.prizeCapsuleBottom.position.y = -eased * 0.18;
      this.prizeCapsuleBottom.rotation.x = eased * 0.55;

      if (t >= 1) {
        spin.phase = "glow";
        spin.elapsed = 0;
        this.setGlow(true);
        this.callbacks.onChime();
        this.callbacks.onGlowChange(true);
        // The reveal (particles/glow/DOM card/sidebar) now carries the
        // "which toy did I get" moment — this is when the real effect
        // should take over, not any earlier.
        this.callbacks.onToyShown(spin.toyIndex);

        const origin = new THREE.Vector3();
        this.dispenserAnchor.getWorldPosition(origin);
        this._burstParticles(origin);

        this._startCapsuleFall();
      }
      return;
    }

    if (spin.phase === "glow") {
      const duration = 0.35;
      if (spin.elapsed >= duration) {
        spin.phase = "revealed";
        spin.elapsed = 0;
        this.callbacks.onReveal(spin.toyIndex);
      }
      return;
    }

    // "revealed": just waits for an external dismiss() call, synced with
    // the on-screen name/effect text.
  }

  // The now-empty, opened capsule tumbles down and fades away off-screen
  // — it's no longer the thing that shows which toy was won (the particle
  // burst, DOM reveal card, and sidebar display already cover that), so
  // it doesn't need to linger.
  _startCapsuleFall() {
    if (!this.prizeCapsuleGroup) return;
    this.capsuleFall = { elapsed: 0, duration: 0.7, velocity: 0 };
  }

  _updateCapsuleFall(dt) {
    if (!this.capsuleFall || !this.prizeCapsuleGroup) return;

    this.capsuleFall.elapsed += dt;
    this.capsuleFall.velocity += dt * 6;
    this.prizeCapsuleGroup.position.y -= this.capsuleFall.velocity * dt;
    this.prizeCapsuleGroup.rotation.x += dt * 3;
    this.prizeCapsuleGroup.rotation.z += dt * 2.2;

    const t = Math.min(this.capsuleFall.elapsed / this.capsuleFall.duration, 1);
    const fadeStart = 0.55;
    if (t > fadeStart) {
      const opacity = 1 - (t - fadeStart) / (1 - fadeStart);
      this.prizeCapsuleTop.material.opacity = opacity;
      this.prizeCapsuleBottom.material.opacity = opacity;
    }

    if (t >= 1) {
      this._clearPrizeCapsule();
    }
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
