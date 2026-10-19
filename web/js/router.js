// Five products, each with its own home (#/mixer, #/jam, #/macaron, #/utensils). Kitchen, the
// full-control one, opens at #/home (#/kitchen leads there too) and has five rooms, in the order a
// film is made: #/story, #/stage, #/shot, #/cut, #/library. Plain hash routing, so it works on any
// static host and under a sub-path.

export const PRODUCTS = {
  kitchen: ["Kitchen", "Where we cook"],
  mixer: ["Mixer", "Trends, in one command"],
  jam: ["Jam", "Music videos from a track"],
  macaron: ["Macaron", "Ready-to-post content for a brand"],
  utensils: ["Utensils", "One tool, one job"],
};

// Kitchen's rooms
export const PAGES = { story: "Story", stage: "Stage", shot: "Shot", cut: "Cut", library: "Library" };

// the addresses the sections had before they were renamed still lead to them
const OLD = { create: "shot", director: "story", edit: "cut", control: "stage", kitchen: "home" };

export const currentPage = () => {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  return name in PAGES || (name in PRODUCTS && name !== "kitchen") ? name : OLD[name] ?? "home";
};

/** The product a page belongs to: Kitchen's home and rooms are Kitchen's. */
export const productOf = (page) => (page in PRODUCTS ? page : "kitchen");

export const go = (page) => {
  if (currentPage() !== page || !location.hash) location.hash = `#/${page}`;
};
