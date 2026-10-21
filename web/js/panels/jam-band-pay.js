// A key that spends credits asks first: the first press arms it (the key says what it will cost and to press again), the second
// within a few seconds does it. Nothing that costs starts from one press. Shared by the band's and the edit's keys.
import { changed } from "../store.js";

let armed = null;
let timer = 0;

/** Whether this key (by its id) is waiting for its second press. */
export const isArmed = (id) => armed === id;

/** The press of a key that costs: arms it, or, when it is armed, does `run`. A free action (`cost` null) runs at once. */
export function pay(id, cost, run) {
  if (cost === null || cost === undefined || armed === id) {
    armed = null;
    clearTimeout(timer);
    changed("jam");
    return run();
  }
  armed = id;
  clearTimeout(timer);
  timer = setTimeout(() => {
    armed = null;
    changed("jam");
  }, 6000);
  changed("jam");
}

/** Puts every armed key away (a page left, a window closed). */
export function disarm() {
  if (armed === null) return;
  armed = null;
  clearTimeout(timer);
}
