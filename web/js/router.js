// Five sections, in the order a film is made, one address each (#/story, #/stage, #/shot,
// #/cut, #/library), and the welcome screen with every project (#/home, where the app opens):
// plain hash routing, so it works on any static host and under a sub-path.

export const PAGES = { story: "Story", stage: "Stage", shot: "Shot", cut: "Cut", library: "Library" };

// the addresses the sections had before they were renamed still lead to them
const OLD = { create: "shot", director: "story", edit: "cut", control: "stage" };

export const currentPage = () => {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  return name in PAGES ? name : OLD[name] ?? "home";
};

export const go = (page) => {
  if (currentPage() !== page || !location.hash) location.hash = `#/${page}`;
};
