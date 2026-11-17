export const TOYS = [
  { index: 0, name: "Robo-Pal", color: 0x8a94a6, shape: "box", effect: "Turns your sound robotic" },
  { index: 1, name: "Zyxar", color: 0x6ee7c7, shape: "icosahedron", effect: "Blends in an alien synth layer" },
  { index: 2, name: "Crumble", color: 0xd97757, shape: "octahedron", effect: "Crunchy distortion grit" },
  { index: 3, name: "Echo Spirit", color: 0xc3b6f2, shape: "sphere", effect: "Haunting filtered echoes" },
  { index: 4, name: "Lo-Fi Bot", color: 0xf2d06e, shape: "box", effect: "Heavy lo-fi bitcrush" },
];

export function getToy(index) {
  return TOYS[((index % TOYS.length) + TOYS.length) % TOYS.length];
}
