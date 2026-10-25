// What the shared bar (panels/assistant.js) needs of a product's own module: the conversation it keeps, how to ask, to say yes or
// no, to take back, and the few things only that product has. The bar is loaded with the app and the products are not, so each
// product's assistant module registers its part here as it loads (app.js loads it with the product's panel) and the bar asks for
// it by page.

const registered = new Map();
const waiting = new Map();
// what the bar finds for a product that has not come yet
const NONE = { pictures: [], items: () => [], lookup: () => null, addPictures() {}, addPhoto() {}, removePicture() {}, undo() {} };

/** `make()` answers the bar's surface for the page, read at each draw (the conversation, the room); `extras` is the rest. */
export function registerSurface(page, make, extras = {}) {
  registered.set(page, { make, extras });
  waiting.get(page)?.forEach((done) => done());
  waiting.delete(page);
}

/** The surface a product's module registered, or null while it has not come. */
export const surfaceOf = (page) => registered.get(page)?.make() ?? null;

/** The rest a product's module registered (Toaster's photo and its @names, the undo of a design); inert until it has come. */
export const extrasOf = (page) => registered.get(page)?.extras ?? NONE;

/** Once a product's module has registered. */
export const surfaceReady = (page) => (registered.has(page) ? Promise.resolve() : new Promise((done) => waiting.set(page, [...(waiting.get(page) ?? []), done])));
