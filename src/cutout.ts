/**
 * The v2 pack is RGB with a flat backdrop (the generator did not emit alpha).
 * Edge-flood pixels near the corner color so the painted subject can sit on the map.
 * This does not redraw the art. v1 sprites are already transparent and pass through.
 */

const cache = new Map<string, Promise<string>>();
const MAX_EDGE = 512;
const KEY_THRESHOLD = 48;

export function cutoutUrl(src: string): Promise<string> {
  if (!src.includes("/rts-art-v2/")) return Promise.resolve(src);
  const cached = cache.get(src);
  if (cached) return cached;
  const pending = keyFlatBackdrop(src).catch(() => src);
  cache.set(src, pending);
  return pending;
}

async function keyFlatBackdrop(src: string): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  if (naturalW < 2 || naturalH < 2) return src;

  const scale = Math.min(1, MAX_EDGE / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const removed = floodBackdrop(image.data, w, h);
  const pixels = w * h;
  if (removed < pixels * 0.04 || removed > pixels * 0.93) return src;
  ctx.putImageData(image, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return src;
  return URL.createObjectURL(blob);
}

function floodBackdrop(data: Uint8ClampedArray, w: number, h: number): number {
  const bg = cornerColor(data, w, h);
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  let head = 0;

  const push = (x: number, y: number) => {
    const p = y * w + x;
    if (visited[p]) return;
    if (!nearBackdrop(data, p, bg)) return;
    visited[p] = 1;
    queue[tail] = p;
    tail += 1;
  };

  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head] ?? 0;
    head += 1;
    const x = p % w;
    const y = (p - x) / w;
    if (x + 1 < w) push(x + 1, y);
    if (x > 0) push(x - 1, y);
    if (y + 1 < h) push(x, y + 1);
    if (y > 0) push(x, y - 1);
  }

  let removed = 0;
  for (let p = 0; p < w * h; p += 1) {
    if (!visited[p]) continue;
    data[p * 4 + 3] = 0;
    removed += 1;
  }

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      if (visited[p]) continue;
      const edge =
        visited[p - 1] || visited[p + 1] || visited[p - w] || visited[p + w];
      if (!edge) continue;
      data[p * 4 + 3] = 190;
    }
  }

  return removed;
}

function cornerColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] {
  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const;
  return [0, 1, 2].map((channel) => {
    const values = corners
      .map(([x, y]) => data[(y * w + x) * 4 + channel] ?? 0)
      .sort((a, b) => a - b);
    const lo = values[1] ?? 0;
    const hi = values[2] ?? lo;
    return Math.round((lo + hi) / 2);
  }) as [number, number, number];
}

function nearBackdrop(data: Uint8ClampedArray, pixel: number, bg: [number, number, number]): boolean {
  const offset = pixel * 4;
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  return Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) <= KEY_THRESHOLD;
}
