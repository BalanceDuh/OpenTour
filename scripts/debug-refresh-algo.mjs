import fs from 'fs';

const FILE = process.env.OPENTOUR_MODEL_PATH || '/Users/duheng/Development/OpenCode/OpenTour/Resource/3dgs_compressed.ply';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const TYPE_SIZE = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4, double: 8, float64: 8
};

const readNumber = (view, offset, type) => {
  switch (type) {
    case 'char':
    case 'int8': return view.getInt8(offset);
    case 'uchar':
    case 'uint8': return view.getUint8(offset);
    case 'short':
    case 'int16': return view.getInt16(offset, true);
    case 'ushort':
    case 'uint16': return view.getUint16(offset, true);
    case 'int':
    case 'int32': return view.getInt32(offset, true);
    case 'uint':
    case 'uint32': return view.getUint32(offset, true);
    case 'double':
    case 'float64': return view.getFloat64(offset, true);
    default: return view.getFloat32(offset, true);
  }
};

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
};

const parsePly = (buffer) => {
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let marker = -1;
  for (let i = 0; i < bytes.length - 10; i++) {
    if (
      bytes[i] === 101 && bytes[i + 1] === 110 && bytes[i + 2] === 100 && bytes[i + 3] === 95 &&
      bytes[i + 4] === 104 && bytes[i + 5] === 101 && bytes[i + 6] === 97 && bytes[i + 7] === 100
    ) {
      marker = i;
      break;
    }
  }
  if (marker < 0) return [];
  let headerEnd = marker + 10;
  if (bytes[marker + 8] === 13 && bytes[marker + 9] === 10) headerEnd = marker + 10;
  else if (bytes[marker + 8] === 10) headerEnd = marker + 9;

  const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
  const lines = headerText.split(/\r?\n/);
  const formatLine = lines.find((l) => l.startsWith('format ')) || '';
  const isAscii = formatLine.includes('ascii');
  const vertexLine = lines.find((l) => l.startsWith('element vertex ')) || '';
  const vertexCount = Number(vertexLine.split(/\s+/)[2] || 0);
  if (!Number.isFinite(vertexCount) || vertexCount <= 0 || isAscii) return [];

  const props = [];
  let inVertex = false;
  for (const line of lines) {
    if (line.startsWith('element ')) {
      inVertex = line.startsWith('element vertex ');
      continue;
    }
    if (!inVertex) continue;
    if (line.startsWith('property list')) continue;
    if (line.startsWith('property ')) {
      const seg = line.trim().split(/\s+/);
      if (seg.length >= 3) props.push({ type: seg[1], name: seg[2] });
    }
  }
  const chunkLine = lines.find((l) => l.startsWith('element chunk ')) || '';
  const chunkCount = Number(chunkLine.split(/\s+/)[2] || 0);

  const idx = {
    x: props.findIndex((p) => p.name === 'x' || p.name === 'means_0' || p.name === 'position_x'),
    y: props.findIndex((p) => p.name === 'y' || p.name === 'means_1' || p.name === 'position_y'),
    z: props.findIndex((p) => p.name === 'z' || p.name === 'means_2' || p.name === 'position_z'),
    opacity: props.findIndex((p) => p.name === 'opacity' || p.name === 'alpha'),
    state: props.findIndex((p) => p.name === 'state')
  };
  const packedPosIdx = props.findIndex((p) => p.name === 'packed_position');
  const packedColorIdx = props.findIndex((p) => p.name === 'packed_color');

  const hasPlain = idx.x >= 0 && idx.y >= 0 && idx.z >= 0;
  const hasPacked = packedPosIdx >= 0 && packedColorIdx >= 0 && chunkCount > 0;
  if (!hasPlain && !hasPacked) return [];

  const view = new DataView(buffer.buffer, buffer.byteOffset + headerEnd, buffer.byteLength - headerEnd);

  const chunkProps = [];
  let inChunk = false;
  inVertex = false;
  for (const line of lines) {
    if (line.startsWith('element ')) {
      inVertex = line.startsWith('element vertex ');
      inChunk = line.startsWith('element chunk ');
      continue;
    }
    if (!inChunk) continue;
    if (line.startsWith('property list')) continue;
    if (line.startsWith('property ')) {
      const seg = line.trim().split(/\s+/);
      if (seg.length >= 3) chunkProps.push({ type: seg[1], name: seg[2] });
    }
  }
  const chunkStride = chunkProps.reduce((acc, p) => acc + (TYPE_SIZE[p.type] || 4), 0);
  const chunkOffsets = [];
  let cRun = 0;
  for (const p of chunkProps) {
    chunkOffsets.push(cRun);
    cRun += TYPE_SIZE[p.type] || 4;
  }
  const chunkIndex = (name) => chunkProps.findIndex((p) => p.name === name);
  const cMinX = chunkIndex('min_x');
  const cMinY = chunkIndex('min_y');
  const cMinZ = chunkIndex('min_z');
  const cMaxX = chunkIndex('max_x');
  const cMaxY = chunkIndex('max_y');
  const cMaxZ = chunkIndex('max_z');
  const stride = props.reduce((acc, p) => acc + (TYPE_SIZE[p.type] || 4), 0);
  const propOffsets = [];
  let run = 0;
  for (const p of props) {
    propOffsets.push(run);
    run += TYPE_SIZE[p.type] || 4;
  }

  const points = [];
  const step = 1;

  if (!hasPlain && hasPacked) {
    const chunks = [];
    for (let ci = 0; ci < chunkCount; ci++) {
      const base = ci * chunkStride;
      if (base + chunkStride > view.byteLength) break;
      const readC = (pi) => Number(readNumber(view, base + chunkOffsets[pi], chunkProps[pi].type));
      chunks.push({
        minX: readC(cMinX), minY: readC(cMinY), minZ: readC(cMinZ),
        maxX: readC(cMaxX), maxY: readC(cMaxY), maxZ: readC(cMaxZ)
      });
    }
    const unpack = (v, bits) => v / ((1 << bits) - 1);
    const vertexBase = chunkCount * chunkStride;
    for (let vi = 0; vi < vertexCount; vi++) {
      if (vi % step !== 0) continue;
      const base = vertexBase + vi * stride;
      if (base + stride > view.byteLength) break;
      const pp = Number(readNumber(view, base + propOffsets[packedPosIdx], props[packedPosIdx].type));
      const pc = Number(readNumber(view, base + propOffsets[packedColorIdx], props[packedColorIdx].type));
      const chunk = chunks[Math.floor(vi / 256)];
      if (!chunk) continue;
      const x = chunk.minX + unpack((pp >>> 21) & 0x7ff, 11) * (chunk.maxX - chunk.minX);
      const y = chunk.minY + unpack((pp >>> 11) & 0x3ff, 10) * (chunk.maxY - chunk.minY);
      const z = chunk.minZ + unpack(pp & 0x7ff, 11) * (chunk.maxZ - chunk.minZ);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (Math.abs(x) > 500 || Math.abs(y) > 500 || Math.abs(z) > 500) continue;
      const opacity = (pc & 0xff) / 255;
      if (opacity < 0.1) continue;
      points.push({ x, y, z, opacity });
    }
    return points;
  }
  for (let vi = 0; vi < vertexCount; vi++) {
    if (vi % step !== 0) continue;
    const base = vi * stride;
    if (base + stride > view.byteLength) break;
    const x = Number(readNumber(view, base + propOffsets[idx.x], props[idx.x].type));
    const y = Number(readNumber(view, base + propOffsets[idx.y], props[idx.y].type));
    const z = Number(readNumber(view, base + propOffsets[idx.z], props[idx.z].type));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (idx.state >= 0) {
      const s = Number(readNumber(view, base + propOffsets[idx.state], props[idx.state].type));
      if (s !== 0) continue;
    }
    const opRaw = idx.opacity >= 0 ? Number(readNumber(view, base + propOffsets[idx.opacity], props[idx.opacity].type)) : 1;
    const opacity = idx.opacity >= 0 ? 1 / (1 + Math.exp(-opRaw)) : 1;
    if (opacity < 0.1) continue;
    points.push({ x, y, z, opacity });
  }
  return points;
};

const evaluate = (points) => {
  const cleaned = points.filter((p) => p.opacity >= 0.1);
  const yVals = cleaned.map((p) => p.y);
  const candidates = [[0.5, 2.5], [0.3, 2.3], [0.8, 2.8], [1.0, 3.0]];
  const report = candidates.map(([a, b]) => {
    const kept = cleaned.filter((p) => p.y >= a && p.y <= b).length;
    const band = Math.max(0.1, b - a);
    const score = kept / Math.max(1, cleaned.length) - Math.abs(band - 2) * 0.08;
    return { slice: [a, b], kept, ratio: +(kept / Math.max(1, cleaned.length)).toFixed(4), score: +score.toFixed(4) };
  }).sort((a,b)=>b.score-a.score);

  let selected = report[0];
  let sliced = cleaned.filter((p) => p.y >= selected.slice[0] && p.y <= selected.slice[1]);
  if (sliced.length < 300) {
    selected = { slice: [percentile(yVals, 0.05), percentile(yVals, 0.95)], kept: cleaned.length, ratio: 1, score: 0 };
    sliced = cleaned.filter((p) => p.y >= selected.slice[0] && p.y <= selected.slice[1]);
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of sliced) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const padX = Math.max(0.08, (maxX - minX) * 0.08);
  const padZ = Math.max(0.08, (maxZ - minZ) * 0.08);
  minX -= padX; maxX += padX; minZ -= padZ; maxZ += padZ;

  const W = 420, H = 210;
  const map = new Float32Array(W * H);
  const front = new Float32Array(W * H);
  let mapAccepted = 0;
  let frontAccepted = 0;
  for (const p of sliced) {
    const u = (p.x - minX) / Math.max(1e-6, (maxX - minX));
    const vm = 1 - (p.z - minZ) / Math.max(1e-6, (maxZ - minZ));
    const vf = 1 - (p.y - selected.slice[0]) / Math.max(1e-6, (selected.slice[1] - selected.slice[0]));
    if (u >= 0 && u <= 1 && vm >= 0 && vm <= 1) {
      const px = clamp(Math.floor(u * (W - 1)), 0, W - 1);
      const py = clamp(Math.floor(vm * (H - 1)), 0, H - 1);
      map[py * W + px] += p.opacity;
      mapAccepted++;
    }
    if (u >= 0 && u <= 1 && vf >= 0 && vf <= 1) {
      const px = clamp(Math.floor(u * (W - 1)), 0, W - 1);
      const py = clamp(Math.floor(vf * (H - 1)), 0, H - 1);
      front[py * W + px] += p.opacity;
      frontAccepted++;
    }
  }

  const stat = (arr) => {
    let sum=0,max=0; for (const v of arr){sum+=v; if(v>max) max=v;}
    const avg = sum / arr.length;
    let varr=0; for (const v of arr){const d=v-avg; varr+=d*d;}
    const std = Math.sqrt(varr / arr.length);
    return { avg:+avg.toFixed(6), std:+std.toFixed(6), threshold:+(avg+2*std).toFixed(6), max:+max.toFixed(6) };
  };

  return {
    cleaned: cleaned.length,
    sliceCandidates: report,
    selectedSlice: selected.slice,
    bounds: { minX:+minX.toFixed(3), maxX:+maxX.toFixed(3), minZ:+minZ.toFixed(3), maxZ:+maxZ.toFixed(3) },
    mapAccepted,
    frontAccepted,
    mapStat: stat(map),
    frontStat: stat(front)
  };
};

const buf = fs.readFileSync(FILE);
const points = parsePly(buf);
const out = evaluate(points);
console.log(JSON.stringify({ total: points.length, ...out }, null, 2));
