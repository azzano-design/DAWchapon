import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import GUI from "lil-gui";

import { getToy, TOYS, VARIANTS } from "../toyData.js";
import { makeToyMesh, preloadToyModels } from "./toyMesh.js";

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

// Studio backdrop palette: a soft, slightly-lit patch roughly where a
// softbox would hit a paper sweep, fading to shadow at the edges/corners
// — used for both the background and the floor so they read as one
// continuous surface instead of two flat, differently colored blocks
// meeting at a hard horizon line.
const BACKDROP_SHADOW = 0x0e0e13;
const BACKDROP_LIT = 0x2b2b35;
const GOLD = new THREE.Color(0xffd36b);

// The two flanking machines are flattened to this near-black for every
// part except their glass bins — silhouettes, not competing products.
const NEAR_BLACK = 0x0a0a0d;
// X offset for the flanking machines. Clears both the real machine's own
// footprint (its widest part, the pedestal, has a ~0.9 half-width) and the
// sidebar "currently active toy" display (which sits around x = 1.5).
// Halving the raw center-to-center distance (3.0) would put the two
// pedestals (half-width ~0.9 each) overlapping by 0.3 units, so this
// halves the visible gap between them instead (1.2 -> 0.6) — closer, but
// without the machines poking through each other.
const SIDE_MACHINE_OFFSET = 2.4;
// Sits in the middle of the gap between the real machine's footprint and
// the flanking machine's near edge — since both have the same half-width,
// that midpoint always works out to half the center-to-center offset,
// regardless of how wide either machine actually is. Keeps the toy clear
// of both instead of sinking into the flanking machine's pedestal.
const SIDEBAR_TOY_X = SIDE_MACHINE_OFFSET / 2;
// 2x the original decorative-icon scale — it's meant to be a prominent,
// spinnable showcase piece now, not a small side detail. (Was 4x before
// the real per-toy models replaced the shared placeholder shape; halved
// since the real models read as too large at that scale.)
const SIDEBAR_TOY_SCALE = 0.22 * 2;
// Pulled well forward of FRONT_Z/the pedestal's own front face (0.65) so
// the now much bigger toy clears every machine's silhouette in depth,
// even where its wider footprint overlaps one of them in X.
const SIDEBAR_TOY_Z = 0.9;
// Radians of toy rotation per CSS pixel of pointer movement while
// dragging it.
const TOY_DRAG_SENSITIVITY = 0.01;
// Star-burst size for a normal reveal; a Silver/Gold reveal uses the full,
// doubled pool instead (see _burstParticles) — so the pool itself has to
// be sized for the doubled case up front.
const PARTICLE_BURST_COUNT = 260;
const PARTICLE_POOL_COUNT = PARTICLE_BURST_COUNT * 2;
// Converts "radians moved on the drag's last pointer event" into
// "radians per second of carried-over spin" once released — see endDrag
// in _initPointerHandling.
const TOY_SPIN_MOMENTUM_PER_SECOND = 60;

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
    ctx.fillText("DAWCHAPON", w / 2, h / 2);
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

// Scene backdrop: a vertical gradient (dark at top and bottom, a soft lit
// patch in the upper-middle) plus a horizontal vignette, like a plain
// paper sweep lit by one soft box rather than a flat poster color.
function makeBackdropTexture() {
  const texture = makeCanvasTexture((ctx, w, h) => {
    const vertical = ctx.createLinearGradient(0, 0, 0, h);
    vertical.addColorStop(0, "#111118");
    vertical.addColorStop(0.42, `#${new THREE.Color(BACKDROP_LIT).getHexString()}`);
    vertical.addColorStop(0.72, "#1c1c24");
    vertical.addColorStop(1, `#${new THREE.Color(BACKDROP_SHADOW).getHexString()}`);
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.65);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }, 512, 512);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Floor: a soft radial vignette, lighter where the machine actually sits
// and darker toward the edges, picking the same shadow tone as the
// backdrop's bottom edge so the two meet without a visible seam.
function makeFloorTexture() {
  const texture = makeCanvasTexture((ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "#26262d");
    gradient.addColorStop(0.55, "#1c1c22");
    gradient.addColorStop(1, `#${new THREE.Color(BACKDROP_SHADOW).getHexString()}`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, 512, 512);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

// Glossy injection-molded plastic — the machine body/pedestal/badge/knob
// and the capsules all share this look: a clearcoat layer on top of a
// fairly smooth base coat reads as polished plastic rather than chalky
// matte paint, especially once it has an environment map to reflect.
function makePlasticMaterial(color, { roughness = 0.35, transparent = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    transparent,
  });
}

// lil-gui's color controller needs a plain hex-string property to bind to,
// not a THREE.Color — this proxies one onto the real color in place.
function bindColor(folder, threeColor, label) {
  const proxy = { value: `#${threeColor.getHexString()}` };
  folder.addColor(proxy, "value").name(label).onChange((hex) => threeColor.set(hex));
  return proxy;
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
  const topMaterial = makePlasticMaterial(topColor, { roughness: 0.3, transparent });
  const bottomMaterial = makePlasticMaterial(bottomColor, { roughness: 0.4, transparent });
  topMaterial.side = THREE.DoubleSide;
  bottomMaterial.side = THREE.DoubleSide;

  const top = new THREE.Mesh(topGeo, topMaterial);
  const bottom = new THREE.Mesh(bottomGeo, bottomMaterial);
  top.castShadow = castShadow;
  bottom.castShadow = castShadow;

  group.add(top, bottom);
  return { group, top, bottom };
}

// Builds one full machine — pedestal, body, glass bin + its resting
// capsules, badge, side pillar, coin slot, dispensing window, and knob.
// With no accentColor this is the normal white-plastic machine (badge and
// side-pillar keep their printed textures, the knob keeps its colored
// rings, bin capsules keep their toy colors) — used for the real,
// interactive machine. With an accentColor, every one of those parts is
// flattened to that single color instead — textures, rings and all — for
// the two static flanking machines. The glass bin itself never changes:
// only the plastic/paint varies between versions, never the glass.
function buildMachine({ accentColor = null } = {}) {
  const group = new THREE.Group();
  const plasticColor = accentColor ?? 0xf4f4f2;

  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(PEDESTAL.width, PEDESTAL.height, PEDESTAL.depth),
    makePlasticMaterial(plasticColor, { roughness: 0.42 })
  );
  pedestal.position.y = PEDESTAL.height / 2;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(BODY.width, BODY.height, BODY.depth),
    makePlasticMaterial(plasticColor, { roughness: 0.32 })
  );
  body.position.y = BODY_CENTER_Y;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Real glass: fully opaque (transmission handles the see-through
  // effect itself, so opacity/transparent would just fight it), a
  // near-mirror-smooth surface, and a physical index of refraction.
  // attenuationColor gives it a faint blue tint that only shows up once
  // light has traveled through enough thickness, like real glass, rather
  // than flatly tinting everything the way multiplying by `color` would.
  const bin = new THREE.Mesh(
    new THREE.BoxGeometry(BIN.width, BIN.height, BIN.depth),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.03,
      transmission: 1,
      thickness: 0.6,
      ior: 1.5,
      attenuationColor: new THREE.Color(0xcfe8fb),
      attenuationDistance: 1.2,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    })
  );
  bin.position.y = BIN_CENTER_Y;
  bin.castShadow = true;
  group.add(bin);

  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(BADGE.width, BADGE.height, BADGE.depth),
    accentColor
      ? makePlasticMaterial(plasticColor, { roughness: 0.4 })
      : new THREE.MeshPhysicalMaterial({
          map: makeBadgeTexture(),
          color: plasticColor,
          roughness: 0.4,
          clearcoat: 0.6,
          clearcoatRoughness: 0.2,
        })
  );
  badge.position.y = BADGE_CENTER_Y;
  badge.castShadow = true;
  group.add(badge);

  const sidePillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, BODY.height + BIN.height, 1.0),
    accentColor
      ? makePlasticMaterial(plasticColor, { roughness: 0.5 })
      : new THREE.MeshStandardMaterial({ map: makeSidePillarTexture(), roughness: 0.5 })
  );
  sidePillar.position.set(BODY.width / 2 + 0.06, BODY_CENTER_Y + BIN.height / 2, 0);
  sidePillar.castShadow = true;
  group.add(sidePillar);

  const coinSlot = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.32, 0.04),
    new THREE.MeshStandardMaterial({ color: accentColor ?? 0x222222, roughness: 0.7 })
  );
  coinSlot.position.set(BODY.width * 0.28, COIN_SLOT_Y, FRONT_Z + 0.02);
  group.add(coinSlot);

  // Dispensing window: the "bottom hole" the prize capsule appears in.
  const windowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.5, 0.3),
    makePlasticMaterial(plasticColor, { roughness: 0.45 })
  );
  windowFrame.position.set(0, WINDOW_Y, FRONT_Z - 0.1);
  group.add(windowFrame);

  const windowHole = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.4, 0.26),
    new THREE.MeshStandardMaterial({ color: accentColor ?? 0x161616, roughness: 0.9 })
  );
  windowHole.position.set(0, WINDOW_Y, FRONT_Z - 0.07);
  group.add(windowHole);

  // Pulled forward of FRONT_Z by enough to clear the PEDESTAL's front
  // face (which sits further forward than the body's, at PEDESTAL.depth/2
  // = 0.65) plus the capsule's own radius (0.26) plus margin — not just
  // clear of the body. The "open" phase's bottom-half dip drops low
  // enough to reach pedestal height, so without this extra clearance its
  // back edge sinks into the pedestal once it's down there.
  const dispenserZ = FRONT_Z + 0.5;

  const dispenserAnchor = new THREE.Object3D();
  dispenserAnchor.position.set(0, WINDOW_Y + 0.02, dispenserZ);
  group.add(dispenserAnchor);

  const dispenserDropStart = new THREE.Object3D();
  dispenserDropStart.position.set(0, WINDOW_Y + 0.55, dispenserZ);
  group.add(dispenserDropStart);

  // Front-facing dial: flat 2D shapes in the group's local XY plane,
  // which already faces the camera since the group itself isn't rotated.
  const knobGroup = new THREE.Group();
  knobGroup.position.set(0, KNOB_Y, FRONT_Z + 0.01);
  group.add(knobGroup);

  const knobBase = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 32),
    makePlasticMaterial(accentColor ?? 0xffffff, { roughness: 0.3 })
  );
  knobGroup.add(knobBase);

  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.4, 32),
    new THREE.MeshStandardMaterial({ color: accentColor ?? 0x3aa6e0, roughness: 0.4 })
  );
  outerRing.position.z = 0.002;
  knobGroup.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: accentColor ?? 0xf2d06e, roughness: 0.4 })
  );
  innerRing.position.z = 0.003;
  knobGroup.add(innerRing);

  // A curved "turn this way" arrow arcing over the top of the dial (11
  // o'clock to 1 o'clock), with an arrowhead at its clockwise-leading
  // end — unlike the single static wedge this replaced (which pointed
  // radially in at the 9 o'clock mark, a direction unrelated to which
  // way to actually turn it), the arrowhead's tangent direction here
  // directly shows the turning direction.
  const directionArrowColor = accentColor ?? 0xe0455b;
  const ARROW_INNER_R = 0.42;
  const ARROW_OUTER_R = 0.47;
  const ARROW_TAIL_ANGLE = (120 * Math.PI) / 180;
  const ARROW_HEAD_ANGLE = (60 * Math.PI) / 180;

  const arrowTrack = new THREE.Mesh(
    new THREE.RingGeometry(ARROW_INNER_R, ARROW_OUTER_R, 24, 1, ARROW_HEAD_ANGLE, ARROW_TAIL_ANGLE - ARROW_HEAD_ANGLE),
    new THREE.MeshStandardMaterial({ color: directionArrowColor, roughness: 0.4 })
  );
  arrowTrack.position.z = 0.004;
  knobGroup.add(arrowTrack);

  const arrowheadLength = 0.1;
  const arrowheadWidth = 0.09;
  const arrowheadShape = new THREE.Shape();
  arrowheadShape.moveTo(-arrowheadLength / 2, arrowheadWidth / 2);
  arrowheadShape.lineTo(-arrowheadLength / 2, -arrowheadWidth / 2);
  arrowheadShape.lineTo(arrowheadLength / 2, 0);
  arrowheadShape.closePath();

  const arrowhead = new THREE.Mesh(
    new THREE.ShapeGeometry(arrowheadShape),
    new THREE.MeshStandardMaterial({ color: directionArrowColor, roughness: 0.4 })
  );
  const arrowMidRadius = (ARROW_INNER_R + ARROW_OUTER_R) / 2;
  arrowhead.position.set(
    arrowMidRadius * Math.cos(ARROW_HEAD_ANGLE),
    arrowMidRadius * Math.sin(ARROW_HEAD_ANGLE),
    0.0045
  );
  // Faces along the clockwise tangent at the head angle, i.e. the
  // direction of travel for decreasing angle: (sinφ, -cosφ).
  arrowhead.rotation.z = Math.atan2(-Math.cos(ARROW_HEAD_ANGLE), Math.sin(ARROW_HEAD_ANGLE));
  knobGroup.add(arrowhead);

  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 16),
    makePlasticMaterial(accentColor ?? 0xdddddd, { roughness: 0.25 })
  );
  hub.position.z = 0.005;
  knobGroup.add(hub);

  // Densely packs the clear bin with resting capsules (an elliptical
  // footprint with a little random dropout) so it reads as full rather
  // than a handful of balls floating in the glass.
  const binCapsules = new THREE.Group();
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

        // Same two-tone capsule construction as the prize capsule, so the
        // ones resting in the bin actually match the one that drops (or,
        // for a flanking machine, match its own flattened color).
        const { group: capsule } = makeCapsuleHalves(
          accentColor ?? toy.color,
          accentColor ?? 0xf4f4f2,
          radius * (0.85 + Math.random() * 0.25)
        );
        capsule.position.set(
          x + (Math.random() - 0.5) * spacing * 0.4,
          y + (Math.random() - 0.5) * spacing * 0.4,
          z + (Math.random() - 0.5) * spacing * 0.4
        );
        capsule.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        capsule.userData.basePosition = capsule.position.clone();
        capsule.userData.bouncePhase = Math.random() * Math.PI * 2;
        binCapsules.add(capsule);
      }
    }
  }
  group.add(binCapsules);

  return { group, knobGroup, knobHitTarget: knobBase, dispenserAnchor, dispenserDropStart, binCapsules };
}

export class GachaponMachine {
  constructor(container, callbacks = {}, options = {}) {
    this.container = container;
    this.options = { enableDebugGui: false, ...options };
    this._disposed = false;
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
    // Which toy (if any) the sidebar display currently shows — null means
    // none, which is also what tells the beat-pulse backlight (below) to
    // fall back to its idle color instead of tinting to a toy's color.
    this.activeToyIndex = null;
    // The variant (see VARIANTS) of that same sidebar toy — purely
    // cosmetic (drives the mesh's metallic finish in showSidebarToy); the
    // backlight pulse below always reads activeToyIndex's own base color,
    // never this, so a Gold red toy still pulses red.
    this.activeVariant = VARIANTS.ORIGINAL;
    // Lets the user grab the sidebar toy and spin it by hand — locked to
    // horizontal (yaw) only, like spinning a figure on a turntable, rather
    // than a free trackball. While dragging, rotation is driven directly
    // from pointer movement (see _initPointerHandling); _toySpinVelocityYaw
    // carries that motion on as decaying momentum after release, so a
    // flick keeps spinning briefly instead of stopping dead, and eases
    // back into the slow idle spin once it's died down.
    this.toyDragging = false;
    this._toyLastDragYaw = 0;
    this._toySpinVelocityYaw = 0;
    this._binBounceAmount = 0;
    this._rattlePlaying = false;
    this._time = 0;

    this._hemiBaseSky = new THREE.Color(0x97b7ff);
    this._keyBaseColor = new THREE.Color(0xffd0f1);
    this._hemiBaseIntensity = 0.97;
    this._keyBaseIntensity = 0.51;
    this._fillBaseIntensity = 1.21;
    this._rimBaseIntensity = 0.93;
    this._glowAmount = 0;
    this._glowTarget = 0;

    // Dims the whole scene's lighting to near-black when the plugin is
    // inactive (host bypass/power button off), fading softly up to the
    // normal lighting below when it's reactivated. Starts "active" since
    // hosts insert plugins enabled by default.
    this._activeAmount = 1;
    this._activeTarget = 1;

    // Separate from _activeAmount above: that one has a 0.06 floor (see
    // setPluginActive) so the *lighting* dims to near-black rather than
    // literal black, but the sidebar toy's spin shouldn't carry that same
    // floor — it should actually stop, not just crawl at 6% speed forever.
    this._spinActiveAmount = 1;
    this._spinActiveTarget = 1;

    // Beat-synced backlight pulse, driven by host transport/tempo info
    // (see setPlaybackInfo). Free-runs between updates from the backend,
    // resynced each time a fresh one arrives.
    this._beatIsPlaying = false;
    this._beatBpm = 120;
    this._beatPosition = 0;
    this._beatPositionTimestampMs = 0;
    this._beatPulseGateAmount = 0;

    // The pulse's color when no toy is active (see activeToyIndex above) —
    // once a toy is set, the pulse tints to that toy's own color instead.
    // _backlightColorScratch is just a reusable THREE.Color to read a
    // toy's color into each frame without allocating a new one.
    this._backlightIdleColor = new THREE.Color(0xffffff);
    this._backlightColorScratch = new THREE.Color();
    this._backlightIntensityScale = 2.9;
    this._backlightOpacityScale = 0.24;

    this._initScene();
    this._initMachine();
    this._initSideMachines();
    this._initParticles();
    this._initBacklight();
    this._initPointerHandling();
    if (this.options.enableDebugGui) this._initLightingGUI();

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
    this.scene.background = makeBackdropTexture();
    // Fades the far reach of the floor plane into the backdrop instead of
    // letting its edge show as a hard line — near sits well past the
    // machine so the product itself is never touched by it.
    this.scene.fog = new THREE.Fog(BACKDROP_SHADOW, 10, 22);

    // Framed on the real machine only — the two flanking machines are
    // decoration and don't need to fully fit in shot.
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
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // A small procedural room, prefiltered into an IBL environment. This
    // is what actually makes the clearcoat plastic and the transmissive
    // glass read correctly — without it they have nothing to reflect or
    // refract and fall back to looking flat/matte regardless of their
    // material settings.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.06;
    pmremGenerator.dispose();

    // Three-point-ish studio setup: a warm key casts the main shadow, a
    // cool fill opens up the shadow side without flattening it, and a
    // dim rim light from behind kicks a highlight along the machine's
    // silhouette for separation from the background.
    this.ambientLight = new THREE.HemisphereLight(this._hemiBaseSky, 0x8fd9a1, this._hemiBaseIntensity);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(this._keyBaseColor, this._keyBaseIntensity);
    this.keyLight.position.set(3.3, 3.9, 4.2);
    this.keyLight.target.position.set(0, BODY_CENTER_Y, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    // Wide enough to cover the sidebar toy display off to the +X side of
    // the real machine, and both flanking machines out at
    // ±SIDE_MACHINE_OFFSET — tighter bounds clipped their shadows right
    // at the edge of the frustum.
    this.keyLight.shadow.camera.left = -3.6;
    this.keyLight.shadow.camera.right = 3.6;
    this.keyLight.shadow.camera.top = 6.5;
    this.keyLight.shadow.camera.bottom = -2;
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 13;
    this.keyLight.shadow.bias = -0.002;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.fillLight = new THREE.DirectionalLight(0x9fc3ff, this._fillBaseIntensity);
    this.fillLight.position.set(-1.4, 2.6, 0.3);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xbcd6ff, this._rimBaseIntensity);
    this.rimLight.position.set(-2.2, 4.3, -2.6);
    this.rimLight.target.position.set(0, BODY_CENTER_Y, 0);
    this.scene.add(this.rimLight, this.rimLight.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // The real, interactive machine: white plastic, printed badge/pillar,
  // colored knob rings, toy-colored bin capsules.
  _initMachine() {
    const { group, knobGroup, knobHitTarget, dispenserAnchor, dispenserDropStart, binCapsules } = buildMachine();
    this.machineGroup = group;
    this.knobGroup = knobGroup;
    this.knobHitTarget = knobHitTarget;
    this.dispenserAnchor = dispenserAnchor;
    this.dispenserDropStart = dispenserDropStart;
    this.binCapsules = binCapsules;
    this.scene.add(this.machineGroup);
  }

  // Two static, non-interactive copies flanking the real machine — same
  // geometry and glass, flattened to near-black otherwise (see
  // buildMachine). Added straight to the scene rather than to
  // machineGroup, so they don't inherit its spin-sequence shake/bounce.
  _initSideMachines() {
    this.sideMachineGroups = [-1, 1].map((side) => {
      const { group } = buildMachine({ accentColor: NEAR_BLACK });
      group.position.x = side * SIDE_MACHINE_OFFSET;
      this.scene.add(group);
      return group;
    });
  }

  // A reusable pool of star sprites for the reveal's explosive burst,
  // instead of a single static glow blob.
  _initParticles() {
    const starTexture = makeStarTexture();
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    this.particles = [];
    for (let i = 0; i < PARTICLE_POOL_COUNT; i += 1) {
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
      color: this._backlightIdleColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.backlightSprite = new THREE.Sprite(material);
    this.backlightSprite.scale.set(3.6, 3.6, 1);
    this.scene.add(this.backlightSprite);

    this.backlightPointLight = new THREE.PointLight(this._backlightIdleColor, 0, 6);
    this.backlightPointLight.position.set(-0.1, 2.4, -0.1);
    this.scene.add(this.backlightPointLight);
  }

  // A lil-gui panel for hand-tuning the scene's lighting, for dev/visual
  // work only (see the enableDebugGui option) — never wired up for the
  // real plugin UI. Binds directly to the base intensity/color fields that
  // _updateGlow reads every frame (rather than to light.intensity/.color
  // themselves), since that function overwrites those each frame.
  _initLightingGUI() {
    this.gui = new GUI({ title: "Lighting" });

    const key = this.gui.addFolder("Key light");
    key.add(this, "_keyBaseIntensity", 0, 4, 0.01).name("Intensity");
    bindColor(key, this._keyBaseColor, "Color");
    key.add(this.keyLight.position, "x", -8, 8, 0.1);
    key.add(this.keyLight.position, "y", 0, 10, 0.1);
    key.add(this.keyLight.position, "z", -8, 8, 0.1);

    const fill = this.gui.addFolder("Fill light");
    fill.add(this, "_fillBaseIntensity", 0, 2, 0.01).name("Intensity");
    bindColor(fill, this.fillLight.color, "Color");
    fill.add(this.fillLight.position, "x", -8, 8, 0.1);
    fill.add(this.fillLight.position, "y", 0, 10, 0.1);
    fill.add(this.fillLight.position, "z", -8, 8, 0.1);

    const rim = this.gui.addFolder("Rim light");
    rim.add(this, "_rimBaseIntensity", 0, 3, 0.01).name("Intensity");
    bindColor(rim, this.rimLight.color, "Color");
    rim.add(this.rimLight.position, "x", -8, 8, 0.1);
    rim.add(this.rimLight.position, "y", 0, 10, 0.1);
    rim.add(this.rimLight.position, "z", -8, 8, 0.1);

    const ambient = this.gui.addFolder("Ambient (hemisphere)");
    ambient.add(this, "_hemiBaseIntensity", 0, 3, 0.01).name("Intensity");
    bindColor(ambient, this._hemiBaseSky, "Sky color");
    bindColor(ambient, this.ambientLight.groundColor, "Ground color");

    const pulse = this.gui.addFolder("Beat pulse");
    pulse.add(this, "_backlightIntensityScale", 0, 5, 0.01).name("Intensity");
    pulse.add(this, "_backlightOpacityScale", 0, 2, 0.01).name("Glow opacity");
    bindColor(pulse, this._backlightIdleColor, "Idle color (no toy)");
    pulse.add(this.backlightPointLight.position, "x", -8, 8, 0.1);
    pulse.add(this.backlightPointLight.position, "y", 0, 10, 0.1);
    pulse.add(this.backlightPointLight.position, "z", -8, 8, 0.1);

    const env = this.gui.addFolder("Environment / exposure");
    env.add(this.scene, "environmentIntensity", 0, 2, 0.01).name("Env intensity");
    env.add(this.renderer, "toneMappingExposure", 0, 3, 0.01).name("Exposure");

    this.gui.close();
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

    // Tints to the active toy's own color once one is set, falling back
    // to the idle color (white by default) when none is — eased rather
    // than snapped, so a mid-pulse toy change doesn't jump instantly.
    const targetColor =
      this.activeToyIndex === null
        ? this._backlightIdleColor
        : this._backlightColorScratch.setHex(getToy(this.activeToyIndex).color);
    const colorLerp = Math.min(1, dt * 5);
    this.backlightSprite.material.color.lerp(targetColor, colorLerp);
    this.backlightPointLight.color.lerp(targetColor, colorLerp);

    // The glow sprite reads slightly further back than the point light
    // itself, so it tracks the light's (GUI-adjustable) position rather
    // than having its own separate, easy-to-forget position to tune.
    this.backlightSprite.position.copy(this.backlightPointLight.position);
    this.backlightSprite.position.z -= 0.4;

    this.backlightSprite.material.opacity = brightness * this._backlightOpacityScale;
    this.backlightPointLight.intensity = brightness * this._backlightIntensityScale;
  }

  // `doubled` (a Silver/Gold reveal) activates the full, doubled particle
  // pool instead of the normal burst size — see PARTICLE_BURST_COUNT /
  // PARTICLE_POOL_COUNT above.
  _burstParticles(origin, doubled = false) {
    const palette = [0xffffff, 0xfff2cc, 0xffe9a8, 0xffd36b, 0xffc93c, 0xffffff];
    const activeCount = doubled ? PARTICLE_POOL_COUNT : PARTICLE_BURST_COUNT;

    for (let i = 0; i < this.particles.length; i += 1) {
      const sprite = this.particles[i];

      if (i >= activeCount) {
        // Explicitly deactivate anything outside this burst's count, so a
        // normal reveal right after a doubled one doesn't leave the extra
        // half still mid-flight from last time.
        sprite.userData.active = false;
        sprite.material.opacity = 0;
        continue;
      }

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
      toPointer(event);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      // The knob can only be grabbed between spins — the toy, on the
      // other hand, is just a standalone display with nothing to
      // interrupt, so it's spinnable regardless of machine state.
      if (this.state === "idle") {
        const knobHits = this.raycaster.intersectObject(this.knobHitTarget, false);
        if (knobHits.length > 0) {
          this.dragging = true;
          this.accumulatedRotation = 0;
          this.dragStartAngle = Math.atan2(this.pointer.y, this.pointer.x);
          dom.setPointerCapture(event.pointerId);
          return;
        }
      }

      if (this.sidebarToyMesh) {
        const toyHits = this.raycaster.intersectObject(this.sidebarToyMesh, false);
        if (toyHits.length > 0) {
          this.toyDragging = true;
          this._toySpinVelocityYaw = 0;
          dom.setPointerCapture(event.pointerId);
        }
      }
    });

    dom.addEventListener("pointermove", (event) => {
      if (this.dragging) {
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
        return;
      }

      if (this.toyDragging && this.sidebarToyMesh) {
        // Horizontal movement only — locked to yaw (spinning like a
        // figure on a turntable) rather than a free trackball, so
        // vertical pointer movement is simply ignored.
        // movementX is the pointer's horizontal delta since the last
        // event, in CSS pixels — simpler than tracking a previous
        // position ourselves, and resolution-independent the same way.
        const yaw = event.movementX * TOY_DRAG_SENSITIVITY;
        this.sidebarToyMesh.rotation.y += yaw;
        this._toyLastDragYaw = yaw;
      }
    });

    const endDrag = () => {
      this.dragging = false;

      if (this.toyDragging) {
        this.toyDragging = false;
        // Carries the last instant's drag motion on as momentum, as if
        // flicked — roughly converting "radians moved on the last event"
        // into "radians per second" by assuming events land close to
        // every frame while actively dragging.
        this._toySpinVelocityYaw = this._toyLastDragYaw * TOY_SPIN_MOMENTUM_PER_SECOND;
      }
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
  playSpinResult({ toyIndex, variant = VARIANTS.ORIGINAL }) {
    this._setState("spinning");
    this._clearPrizeCapsule();

    this._spin = {
      phase: "crank",
      elapsed: 0,
      toyIndex,
      variant,
    };
  }

  // The capsule has already fallen away off-screen by this point (see
  // _startCapsuleFall) — this just fades the just-confirmed toy in beside
  // the machine as the persistent "currently active" display, and lets
  // the gold glow fade out. Call this at the same moment the on-screen
  // name/effect text is hidden.
  dismiss() {
    if (!this._spin || this._spin.phase !== "revealed") return;

    this.showSidebarToy(this._spin.toyIndex, this._spin.variant);
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
  showSidebarToy(toyIndex, variant = VARIANTS.ORIGINAL) {
    this._clearSidebarToy();
    this.activeToyIndex = toyIndex;
    this.activeVariant = variant;

    // This toy's model may still be loading (main.js kicks that off
    // but deliberately doesn't wait on it for anything else) — wait for
    // it here instead of assuming it's ready. By the time this resolves,
    // activeToyIndex may have moved on again (another reveal, a reset),
    // so only build the mesh if this call is still the current one.
    preloadToyModels().then(() => {
      if (this._disposed || this.activeToyIndex !== toyIndex || this.activeVariant !== variant) return;

      const mesh = makeToyMesh(toyIndex, variant);
      mesh.material.transparent = true;
      mesh.material.opacity = 0;
      mesh.scale.setScalar(SIDEBAR_TOY_SCALE);
      mesh.position.set(SIDEBAR_TOY_X, BODY_CENTER_Y, SIDEBAR_TOY_Z);
      this.machineGroup.add(mesh);

      this.sidebarToyMesh = mesh;
      this.sidebarFade = { from: 0, to: 1, duration: 0.6, elapsed: 0, removeOnComplete: false };
    });
  }

  // Fades out the current sidebar toy display, if any.
  hideSidebarToy() {
    if (!this.sidebarToyMesh) return;
    this.activeToyIndex = null;
    this.activeVariant = VARIANTS.ORIGINAL;
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
    if (this.sidebarToyMesh && !this.toyDragging) {
      // While actively dragging, rotation is driven directly from
      // pointer movement in _initPointerHandling instead — this only
      // runs once released, decaying the carried-over spin velocity and
      // blending back into the slow idle spin as it dies down, rather
      // than snapping straight back to it.
      const decay = Math.max(0, 1 - dt * 2.5);
      this._toySpinVelocityYaw *= decay;

      const idleYawSpeed = 0.3;
      const settledness = Math.min(Math.abs(this._toySpinVelocityYaw) / 0.4, 1);
      const yawSpeed = this._toySpinVelocityYaw + idleYawSpeed * (1 - settledness);

      // Scaled by _spinActiveAmount — eases fully to a stop (not just a
      // slow crawl) alongside the lights dimming, and back up to full
      // speed together with them once the plugin's active again. Uses its
      // own amount rather than _activeAmount (see its declaration) since
      // that one has a floor so the lighting stays non-literal-black.
      this.sidebarToyMesh.rotation.y += yawSpeed * dt * this._spinActiveAmount;
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
    this._spinActiveTarget = active ? 1 : 0;
  }

  _updateActiveDim(dt) {
    this._activeAmount += (this._activeTarget - this._activeAmount) * Math.min(1, dt * 1.6);
    this._spinActiveAmount += (this._spinActiveTarget - this._spinActiveAmount) * Math.min(1, dt * 1.6);
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
    this.rimLight.intensity = this._rimBaseIntensity * this._activeAmount;
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
        this.callbacks.onToyShown(spin.toyIndex, spin.variant);

        const origin = new THREE.Vector3();
        this.dispenserAnchor.getWorldPosition(origin);
        this._burstParticles(origin, spin.variant !== VARIANTS.ORIGINAL);

        this._startCapsuleFall();
      }
      return;
    }

    if (spin.phase === "glow") {
      const duration = 0.35;
      if (spin.elapsed >= duration) {
        spin.phase = "revealed";
        spin.elapsed = 0;
        this.callbacks.onReveal(spin.toyIndex, spin.variant);
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
    this._disposed = true;
    window.removeEventListener("resize", this._onResize);
    this.gui?.destroy();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
