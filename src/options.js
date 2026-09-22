// Tuning options shared by the Sender and the Simulator.
export const CHUNK_SIZE_OPTIONS = [
  [500, '500 B (Low-end camera)'],
  [800, '800 B (Recommended / balanced)'],
  [1200, '1200 B (Good camera, steady)'],
  [1600, '1600 B (Maximum density)']
];
export const INTERVAL_OPTIONS = [
  [150, '150 ms (Very fast / 6.6 fps)'],
  [200, '200 ms (Fast / 5 fps)'],
  [250, '250 ms (Recommended / 4 fps)'],
  [400, '400 ms (Safe / 2.5 fps)'],
  [800, '800 ms (Slow / high reliability)']
];
export const PER_FRAME_OPTIONS = [
  [1, '1 (Any browser)'],
  [2, '2 side by side (2x data)'],
  [4, '4 in a grid (4x data, needs Android/Mac Chrome receiver)']
];

export const DEFAULTS = { chunkSize: 800, interval: 250, perFrame: 4 };
