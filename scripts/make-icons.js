const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

function crc(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, checksum]);
}

function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const index = row + 1 + x * 4;
      const margin = size * 0.22;
      const inside = x > margin && x < size - margin && y > margin && y < size - margin;
      const band = inside && y > size * 0.42 && y < size * 0.58;
      raw[index] = band ? 255 : inside ? 15 : 12;
      raw[index + 1] = band ? 255 : inside ? 118 : 18;
      raw[index + 2] = band ? 255 : inside ? 110 : 34;
      raw[index + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const dir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "icon-192.png"), icon(192));
fs.writeFileSync(path.join(dir, "icon-512.png"), icon(512));
fs.mkdirSync(path.join(process.cwd(), "public", "uploads"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "public", "uploads", ".gitkeep"), "");
