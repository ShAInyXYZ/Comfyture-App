// The app's limits in one place: the server enforces them and the assistant's manual quotes them.
export const LIMITS = {
  seconds: { min: 2, max: 10 },
  takes: { min: 1, max: 4 },
  shots: 4,
  keyframes: 6,
  dialogue: 6,
  video: { seconds: 20, pixels: 1280 },
  film: { clips: 24, dissolve: 0.5 },
};
