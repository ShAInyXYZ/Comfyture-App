// Small pure helpers the workspaces' specs share (no DOM, no page state: the server, the tests and the page all import them).

/** A number that is a number (not NaN, not infinite). */
export const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** A writer that answers the JSON as text sometimes escapes a line break twice: it is meant as a break. */
export const breaks = (s) => s.replace(/\\n/g, "\n");

/** A string field of an action: its longest allowed length, and what it is for. */
export const str = (maxLength, description) => ({ type: "string", maxLength, ...(description ? { description } : {}) });

/** A list-of-words field: up to `maxItems` short lines. */
export const list = (description, maxItems = 8) => ({ type: "array", items: { type: "string", maxLength: 140 }, maxItems, description });

/** A number field, kept between two bounds. */
export const num = (description, minimum, maximum) => ({ type: "number", ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}), description });
