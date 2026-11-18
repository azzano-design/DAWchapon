export const TOYS = [
  { index: 0, name: "BroBot", model: "BroBot.glb", color: 0x8a94a6, effect: "Turns your sound robotic" },
  { index: 1, name: "Zyxar", model: "Zyxar.glb", color: 0x6ee7c7, effect: "Blends in an alien synth layer" },
  { index: 2, name: "DistorTRON", model: "DistorTRON.glb", color: 0xd97757, effect: "Crunchy distortion grit" },
  { index: 3, name: "Howler", model: "Howler.glb", color: 0xc3b6f2, effect: "Haunting filtered echoes" },
  { index: 4, name: "Nostolgon", model: "Nostolgon.glb", color: 0xf2d06e, effect: "Heavy lo-fi bitcrush" },
];

export function getToy(index) {
  return TOYS[((index % TOYS.length) + TOYS.length) % TOYS.length];
}

// Every toy can be pulled in three finishes. Keep these string ids in sync
// with ToyRegistry::variantId on the backend — they're what "variant"
// fields on native-function results and events actually contain.
export const VARIANTS = {
  ORIGINAL: "original",
  SILVER: "silver",
  GOLD: "gold",
};

// Pull-rate weights, independent of which toy is picked alongside them —
// Gold is the rarest, Silver uncommon, Original the usual pull. Only used
// by the standalone (no-plugin-backend) demo fallback in main.js; the real
// backend has its own authoritative copy in ToyRegistry::variantWeights,
// which these are meant to mirror.
export const VARIANT_WEIGHTS = {
  [VARIANTS.ORIGINAL]: 85,
  [VARIANTS.SILVER]: 12,
  [VARIANTS.GOLD]: 3,
};

export function pickVariant() {
  const total = Object.values(VARIANT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;

  for (const [variant, weight] of Object.entries(VARIANT_WEIGHTS)) {
    roll -= weight;
    if (roll < 0) return variant;
  }

  return VARIANTS.ORIGINAL;
}
