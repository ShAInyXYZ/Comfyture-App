// Every character of ours that can be cast: Mixer's crew, then Ketkout and the rest of the cast.
// Each has a face for the pickers and a clean front view for the picture models.
import { CREW, crewFace, crewPicture } from "./mixer-trends.js";

const CAST = [
  { id: "ketkout", name: "Ketkout", role: "Mascot", look: "the butter-yellow baby chick with three crown feathers and an apricot neckerchief" },
  { id: "bagel", name: "Bagel", role: "Goofball", look: "the chubby golden-brown corgi puppy with a white chest, big ears and a plum bandana" },
  { id: "truffle", name: "Truffle", role: "Bandit", look: "the round grey raccoon with a dark eye mask and a ringed tail" },
  { id: "tofu", name: "Tofu", role: "Unbothered", look: "the calm barrel-shaped capybara with an orange slice on its head" },
  { id: "pickle", name: "Pickle", role: "Dancer", look: "the small glossy bright-green frog with huge round eyes" },
  { id: "brioche", name: "Brioche", role: "Sweetheart", look: "the fluffy cream-and-white lop-eared bunny with a pink nose" },
];

export const CHARACTERS = [
  ...CREW.map((c) => ({ ...c, group: "crew", face: crewFace(c.id), picture: crewPicture(c.id) })),
  ...CAST.map((c) => ({ ...c, group: "cast", face: `brand/cast/${c.id}-face.webp`, picture: `brand/cast/${c.id}-ref.png` })),
];
export const characterById = (id) => CHARACTERS.find((c) => c.id === id) ?? null;
