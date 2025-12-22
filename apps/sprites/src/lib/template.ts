// Grid template generator for sprite sheets
// Creates a template image with grid lines for Gemini to fill in

// Simple PNG encoder for Workers environment (no external deps)
// Creates uncompressed PNG with DEFLATE stored blocks

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, data.length, false);

  // Type
  chunk.set(typeBytes, 4);

  // Data
  chunk.set(data, 8);

  // CRC (over type + data)
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(typeBytes, 0);
  crcData.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcData), false);

  return chunk;
}

function deflateStore(data: Uint8Array): Uint8Array {
  // Use stored blocks (no compression) - simpler and works everywhere
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(data.length / maxBlockSize);
  const output: number[] = [];

  // Zlib header
  output.push(0x78, 0x01); // CMF, FLG (no compression)

  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlockSize;
    const end = Math.min(start + maxBlockSize, data.length);
    const blockData = data.slice(start, end);
    const len = blockData.length;
    const isLast = i === numBlocks - 1;

    // Block header
    output.push(isLast ? 0x01 : 0x00); // BFINAL + BTYPE (stored)
    output.push(len & 0xff, (len >> 8) & 0xff); // LEN
    output.push((~len) & 0xff, ((~len) >> 8) & 0xff); // NLEN

    // Block data
    for (let j = 0; j < blockData.length; j++) {
      output.push(blockData[j]);
    }
  }

  // Adler32 checksum
  const adler = adler32(data);
  output.push((adler >> 24) & 0xff, (adler >> 16) & 0xff, (adler >> 8) & 0xff, adler & 0xff);

  return new Uint8Array(output);
}

export interface TemplateOptions {
  gridSize: number;
  cellSize: number;
  lineColor?: { r: number; g: number; b: number };
  lineWidth?: number;
  backgroundColor?: { r: number; g: number; b: number };
}

export function generateGridTemplate(opts: TemplateOptions): { data: Uint8Array; base64: string } {
  const {
    gridSize,
    cellSize,
    lineColor = { r: 40, g: 40, b: 40 }, // Dark gray grid lines
    lineWidth = 2,
    backgroundColor = { r: 0, g: 0, b: 0 }, // Pure black
  } = opts;

  const totalSize = gridSize * cellSize;
  const width = totalSize;
  const height = totalSize;

  // Create raw pixel data (RGB, no alpha for simplicity)
  const rawData = new Uint8Array(height * (1 + width * 3)); // +1 for filter byte per row

  let offset = 0;
  for (let y = 0; y < height; y++) {
    // Filter byte (0 = None)
    rawData[offset++] = 0;

    for (let x = 0; x < width; x++) {
      // Check if this pixel is on a grid line
      const isOnVerticalLine = x < lineWidth || x >= totalSize - lineWidth ||
        (x % cellSize < lineWidth) || (x % cellSize >= cellSize - lineWidth);
      const isOnHorizontalLine = y < lineWidth || y >= totalSize - lineWidth ||
        (y % cellSize < lineWidth) || (y % cellSize >= cellSize - lineWidth);

      if (isOnVerticalLine || isOnHorizontalLine) {
        rawData[offset++] = lineColor.r;
        rawData[offset++] = lineColor.g;
        rawData[offset++] = lineColor.b;
      } else {
        rawData[offset++] = backgroundColor.r;
        rawData[offset++] = backgroundColor.g;
        rawData[offset++] = backgroundColor.b;
      }
    }
  }

  // Create PNG
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 2;  // Color type (RGB)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk (compressed pixel data)
  const compressed = deflateStore(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', new Uint8Array(0));

  // Combine all chunks
  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdr, pos); pos += ihdr.length;
  png.set(idat, pos); pos += idat.length;
  png.set(iend, pos);

  // Convert to base64
  let binary = '';
  for (let i = 0; i < png.length; i++) {
    binary += String.fromCharCode(png[i]);
  }
  const base64 = btoa(binary);

  return { data: png, base64 };
}

// Generate a template with corner markers instead of full grid lines
// This gives Gemini more creative freedom while still providing anchors
export function generateCornerMarkerTemplate(opts: TemplateOptions): { data: Uint8Array; base64: string } {
  const {
    gridSize,
    cellSize,
    lineColor = { r: 60, g: 60, b: 60 },
    backgroundColor = { r: 0, g: 0, b: 0 },
  } = opts;

  const totalSize = gridSize * cellSize;
  const width = totalSize;
  const height = totalSize;
  const markerSize = Math.floor(cellSize * 0.1); // 10% of cell size

  const rawData = new Uint8Array(height * (1 + width * 3));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte

    for (let x = 0; x < width; x++) {
      // Check if near a grid intersection
      const cellX = x % cellSize;
      const cellY = y % cellSize;

      const nearLeft = cellX < markerSize;
      const nearRight = cellX >= cellSize - markerSize;
      const nearTop = cellY < markerSize;
      const nearBottom = cellY >= cellSize - markerSize;

      // Corner markers
      const isCornerMarker = (nearLeft || nearRight) && (nearTop || nearBottom);

      if (isCornerMarker) {
        rawData[offset++] = lineColor.r;
        rawData[offset++] = lineColor.g;
        rawData[offset++] = lineColor.b;
      } else {
        rawData[offset++] = backgroundColor.r;
        rawData[offset++] = backgroundColor.g;
        rawData[offset++] = backgroundColor.b;
      }
    }
  }

  // Create PNG (same as above)
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk('IHDR', ihdrData);

  const compressed = deflateStore(rawData);
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdr, pos); pos += ihdr.length;
  png.set(idat, pos); pos += idat.length;
  png.set(iend, pos);

  let binary = '';
  for (let i = 0; i < png.length; i++) {
    binary += String.fromCharCode(png[i]);
  }
  const base64 = btoa(binary);

  return { data: png, base64 };
}
