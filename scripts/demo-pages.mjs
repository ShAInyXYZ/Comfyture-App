// The pages the live demo has to show, and how a tour is played to its end. Shared by the build (scripts/demo-site.ts), which records what
// each page asks for, and by its test (tests/demo-site.browser.mjs), which plays them again from the static files.

/** Every page, by its hash, with the name of the example it opens on (or null where it is the home or a frame). */
export const PAGES = [
  { hash: "#/home", name: null },
  { hash: "#/kitchen", name: "A Little Jar, A Full Table" },
  { hash: "#/story", name: null },
  { hash: "#/stage", name: null },
  { hash: "#/shot", name: null },
  { hash: "#/cut", name: null },
  { hash: "#/library", name: null },
  { hash: "#/mixer", name: null },
  { hash: "#/jam", name: "Moonlit Oolong Walk" },
  { hash: "#/macaron", name: null },
  { hash: "#/spice", name: null },
  { hash: "#/spice?bay", name: "The yard at dusk" },
  { hash: "#/toaster", name: null },
  { hash: "#/utensils", name: null },
];
export const VIEWPORTS = [
  { width: 1600, height: 950 },
  { width: 1280, height: 720 },
];

/** Plays the page's tour to its end: the key starts it, "show me" is pressed where there is one, then Next, up to `cap` steps. Returns the steps seen, or -1 if it never ended. */
export async function playTour(page, cap = 40) {
  const key = page.locator("#tour-key");
  if (!(await key.isVisible().catch(() => false))) return 0;
  await key.click();
  await page.waitForSelector(".tour-card", { timeout: 20000 });
  for (let step = 1; step <= cap; step++) {
    // (a step that waits for the person moves on by itself, or by the key; the card is read again each time)
    await page.waitForTimeout(250);
    const show = page.locator(".tour-show");
    if (await show.isVisible().catch(() => false)) await show.click({ timeout: 5000 }).catch(() => {});
    const next = page.locator(".tour-next");
    if (await next.isVisible().catch(() => false)) await next.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(250);
    if (!(await page.locator(".tour-card").count())) return step;
  }
  return -1;
}
