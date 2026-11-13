import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter none
    const srcStart = y * width * 4;
    raw.set(rgba.subarray(srcStart, srcStart + width * 4), rowStart + 1);
  }

  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function blendPixel(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  if (x < 0 || y < 0 || x >= width) return;
  const idx = (y * width + x) * 4;
  if (idx + 3 >= buf.length) return;
  const alpha = a / 255;
  const inv = 1 - alpha;
  buf[idx] = Math.round(r * alpha + buf[idx]! * inv);
  buf[idx + 1] = Math.round(g * alpha + buf[idx + 1]! * inv);
  buf[idx + 2] = Math.round(b * alpha + buf[idx + 2]! * inv);
  buf[idx + 3] = Math.min(255, Math.round(a + buf[idx + 3]! * inv));
}

function insideRoundedRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  radius: number
): boolean {
  if (px < rx || px > rx + rw || py < ry || py > ry + rh) return false;
  const cx = px < rx + radius ? rx + radius : px > rx + rw - radius ? rx + rw - radius : px;
  const cy = py < ry + radius ? ry + radius : py > ry + rh - radius ? ry + rh - radius : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size: number, maskable: boolean): Buffer {
  const buf = new Uint8Array(size * size * 4);
  const scale = size / 512;
  const pad = maskable ? 0.14 : 0.0;
  const contentScale = 1 - pad * 2;
  const offset = size * pad;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Background indigo (#4338CA = 67, 56, 202)
      const inBg = maskable
        ? true
        : insideRoundedRect(x, y, 0, 0, size, size, 112 * scale);

      if (inBg) {
        blendPixel(buf, size, x, y, 67, 56, 202, 255);
      }

      // Map to 512 coordinate space inside safe zone
      const vx = (x - offset) / (scale * contentScale);
      const vy = (y - offset) / (scale * contentScale);

      // White paper sheet
      if (insideRoundedRect(vx, vy, 116, 96, 232, 320, 24)) {
        blendPixel(buf, size, x, y, 255, 255, 255, 255);

        // Indigo ruled lines
        const lines = [
          { y: 168, x2: 300 },
          { y: 220, x2: 280 },
          { y: 272, x2: 252 },
          { y: 324, x2: 224 },
        ];
        for (const line of lines) {
          if (insideRoundedRect(vx, vy, 152, line.y - 12, line.x2 - 140, 24, 12)) {
            blendPixel(buf, size, x, y, 67, 56, 202, 255);
          }
        }
      }

      // Amber badge circle (#F59E0B = 245, 158, 11)
      const dx = vx - 348;
      const dy = vy - 348;
      if (dx * dx + dy * dy <= 76 * 76) {
        blendPixel(buf, size, x, y, 245, 158, 11, 255);

        // Checkmark segments: (316,348)->(338,370) and (338,370)->(382,324)
        const distSeg = (ax: number, ay: number, bx: number, by: number) => {
          const abx = bx - ax;
          const aby = by - ay;
          const t = Math.max(0, Math.min(1, ((vx - ax) * abx + (vy - ay) * aby) / (abx * abx + aby * aby)));
          const px = ax + t * abx;
          const py = ay + t * aby;
          return Math.hypot(vx - px, vy - py);
        };
        if (Math.min(distSeg(316, 348, 338, 370), distSeg(338, 370, 382, 324)) <= 12) {
          blendPixel(buf, size, x, y, 255, 255, 255, 255);
        }
      }
    }
  }

  return encodePng(size, size, buf);
}

const outDir = path.resolve(process.cwd(), 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'pwa-192x192.png'), renderIcon(192, false));
writeFileSync(path.join(outDir, 'pwa-512x512.png'), renderIcon(512, false));
writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), renderIcon(512, true));
writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180, false));
console.log('Generated PWA PNG icons in public/');
