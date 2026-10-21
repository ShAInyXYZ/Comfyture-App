// What a design can start as, by family of format (Create's "New design"): a flyer, a banner, a share image... Plain data with no
// imports, so the page (the starters window) and the tests read the same list. Each is a design from the kit: a name, the format
// it is made in, the layout that suits that format, what it is for, the words it has when the brand has none of its own, and a
// call to action for the formats that carry one.

/**
 * What a design can start as: a name, the format it is made in, the layout that suits that format, what it is for, the words it
 * has when the brand has none of its own, and a call to action for the formats that carry one. Each is a design from the kit.
 */
export const STARTERS = [
  { id: "post", name: "Social post", family: "social", format: "4:5", layout: "left", purpose: "Launch", texts: { headline: "Say it in a line.", sub: "A few words on why it is worth a look." } },
  { id: "story", name: "Story", family: "social", format: "9:16", layout: "poster", purpose: "Feature", texts: { headline: "Say it in a line.", sub: "Swipe up for the rest." } },
  { id: "flyer", name: "Flyer", family: "print", format: "a4", layout: "left", purpose: "Launch", texts: { headline: "Come and see it.", sub: "What, when and where, in a few clear lines." }, cta: "Find out more" },
  { id: "poster", name: "Poster", family: "print", format: "a2", layout: "poster", purpose: "Brand", texts: { headline: "One big line.", sub: "And a smaller one under it." } },
  { id: "banner", name: "Banner ad", family: "ads", format: "ad-300x250", layout: "split", purpose: "Offer", texts: { headline: "Try it today.", sub: "One reason to click." }, cta: "Shop now" },
  { id: "leaderboard", name: "Leaderboard banner", family: "ads", format: "ad-728x90", layout: "strip", purpose: "Offer", texts: { headline: "Try it today.", sub: "" }, cta: "Shop now" },
  { id: "skyscraper", name: "Skyscraper banner", family: "ads", format: "ad-160x600", layout: "stack", purpose: "Offer", texts: { headline: "Try it today.", sub: "One reason to click." }, cta: "Shop now" },
  { id: "hero", name: "Web hero", family: "web", format: "hero", layout: "split", purpose: "Launch", texts: { headline: "Say it in a line.", sub: "What it is and who it is for." }, cta: "Get started" },
  { id: "share", name: "Share image", family: "web", format: "og", layout: "split", purpose: "Brand", texts: { headline: "Say it in a line.", sub: "" } },
  { id: "email", name: "Email header", family: "web", format: "email", layout: "strip", purpose: "Feature", texts: { headline: "This week at the brand.", sub: "" }, cta: "Read" },
  { id: "store", name: "App store screenshot", family: "app", format: "store", layout: "left", purpose: "Feature", texts: { headline: "The one thing it does best.", sub: "A line to say how." } },
  { id: "screen", name: "App screen", family: "app", format: "phone", layout: "stack", purpose: "Feature", texts: { headline: "Your screen.", sub: "What this screen is for." } },
  { id: "cover", name: "Video cover", family: "video", format: "16:9", layout: "split", purpose: "Motion", texts: { headline: "Say it in a line.", sub: "" } },
];
export const starterById = (id) => STARTERS.find((s) => s.id === id) ?? STARTERS[0];
/** The starter whose format a family opens with: the one a dashed "make one" prompt makes. */
export const starterOf = (family) => STARTERS.find((s) => s.family === family) ?? STARTERS[0];
