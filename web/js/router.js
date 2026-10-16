// Four sections, one address each (#/create, #/director, #/library, #/edit): plain hash routing,
// so it works on any static host and under a sub-path.

export const PAGES = { create: "Create", director: "Director", library: "Library", edit: "Edit" };

export const currentPage = () => {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  return name in PAGES ? name : "create";
};

export const go = (page) => {
  if (currentPage() !== page || !location.hash) location.hash = `#/${page}`;
};
