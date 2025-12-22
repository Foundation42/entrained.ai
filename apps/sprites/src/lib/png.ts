// PNG processing utilities for Workers environment
// Handles decoding and encoding PNGs with alpha channel support

// CRC32 for PNG chunk validation
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

// Adler32 for zlib
function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

interface PNGInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  pixels: Uint8Array; // RGBA format, 4 bytes per pixel
}

// Decompress zlib data using DecompressionStream
async function zlibDecompress(data: Uint8Array): Promise<Uint8Array> {
  // Skip zlib header (2 bytes) and adler32 footer (4 bytes)
  const deflateData = data.slice(2, -4);

  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(deflateData);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Paeth predictor for PNG filtering
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decode PNG to RGBA pixels
export async function decodePNG(data: Uint8Array): Promise<PNGInfo> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Verify PNG signature
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (data[i] !== signature[i]) {
      throw new Error('Invalid PNG signature');
    }
  }

  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];

  // Read chunks
  while (offset < data.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
    const chunkData = data.slice(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      const ihdrView = new DataView(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength);
      width = ihdrView.getUint32(0, false);
      height = ihdrView.getUint32(4, false);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length; // 4 length + 4 type + data + 4 crc
  }

  if (width === 0 || height === 0) {
    throw new Error('Invalid PNG: missing IHDR');
  }

  // Combine IDAT chunks
  const totalIdatLength = idatChunks.reduce((sum, c) => sum + c.length, 0);
  const compressedData = new Uint8Array(totalIdatLength);
  let idatOffset = 0;
  for (const chunk of idatChunks) {
    compressedData.set(chunk, idatOffset);
    idatOffset += chunk.length;
  }

  // Decompress
  const rawData = await zlibDecompress(compressedData);

  // Determine bytes per pixel based on color type
  let bytesPerPixel: number;
  switch (colorType) {
    case 0: bytesPerPixel = 1; break; // Grayscale
    case 2: bytesPerPixel = 3; break; // RGB
    case 3: bytesPerPixel = 1; break; // Indexed
    case 4: bytesPerPixel = 2; break; // Grayscale + Alpha
    case 6: bytesPerPixel = 4; break; // RGBA
    default: throw new Error(`Unsupported color type: ${colorType}`);
  }

  // Unfilter and convert to RGBA
  const pixels = new Uint8Array(width * height * 4);
  const scanlineLength = width * bytesPerPixel;

  let rawOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = rawData[rawOffset++];
    const scanline = rawData.slice(rawOffset, rawOffset + scanlineLength);
    rawOffset += scanlineLength;

    // Apply reverse filter
    const prevLine = y > 0 ?
      pixels.slice((y - 1) * width * 4, y * width * 4) :
      new Uint8Array(width * 4);

    for (let x = 0; x < scanlineLength; x++) {
      const a = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const b = y > 0 ? getPixelComponent(prevLine, x, bytesPerPixel, colorType) : 0;
      const c = (x >= bytesPerPixel && y > 0) ?
        getPixelComponent(prevLine, x - bytesPerPixel, bytesPerPixel, colorType) : 0;

      let value: number;
      switch (filterType) {
        case 0: value = scanline[x]; break; // None
        case 1: value = (scanline[x] + a) & 0xff; break; // Sub
        case 2: value = (scanline[x] + b) & 0xff; break; // Up
        case 3: value = (scanline[x] + Math.floor((a + b) / 2)) & 0xff; break; // Average
        case 4: value = (scanline[x] + paethPredictor(a, b, c)) & 0xff; break; // Paeth
        default: value = scanline[x];
      }
      scanline[x] = value;
    }

    // Convert to RGBA
    for (let x = 0; x < width; x++) {
      const srcOffset = x * bytesPerPixel;
      const dstOffset = (y * width + x) * 4;

      switch (colorType) {
        case 0: // Grayscale
          pixels[dstOffset] = scanline[srcOffset];
          pixels[dstOffset + 1] = scanline[srcOffset];
          pixels[dstOffset + 2] = scanline[srcOffset];
          pixels[dstOffset + 3] = 255;
          break;
        case 2: // RGB
          pixels[dstOffset] = scanline[srcOffset];
          pixels[dstOffset + 1] = scanline[srcOffset + 1];
          pixels[dstOffset + 2] = scanline[srcOffset + 2];
          pixels[dstOffset + 3] = 255;
          break;
        case 4: // Grayscale + Alpha
          pixels[dstOffset] = scanline[srcOffset];
          pixels[dstOffset + 1] = scanline[srcOffset];
          pixels[dstOffset + 2] = scanline[srcOffset];
          pixels[dstOffset + 3] = scanline[srcOffset + 1];
          break;
        case 6: // RGBA
          pixels[dstOffset] = scanline[srcOffset];
          pixels[dstOffset + 1] = scanline[srcOffset + 1];
          pixels[dstOffset + 2] = scanline[srcOffset + 2];
          pixels[dstOffset + 3] = scanline[srcOffset + 3];
          break;
      }
    }
  }

  return { width, height, bitDepth, colorType, pixels };
}

function getPixelComponent(line: Uint8Array, x: number, bytesPerPixel: number, colorType: number): number {
  // Map the raw byte position to the RGBA pixel position
  const pixelIndex = Math.floor(x / bytesPerPixel);
  const component = x % bytesPerPixel;

  // Convert from RGBA to the original format's component
  const rgbaOffset = pixelIndex * 4;
  switch (colorType) {
    case 0: // Grayscale
      return line[rgbaOffset]; // R = G = B
    case 2: // RGB
      return line[rgbaOffset + component];
    case 4: // Grayscale + Alpha
      return component === 0 ? line[rgbaOffset] : line[rgbaOffset + 3];
    case 6: // RGBA
      return line[rgbaOffset + component];
    default:
      return 0;
  }
}

// Compress data using zlib
async function zlibCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();

  writer.write(data);
  writer.close();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }

  // Add zlib header and adler32 footer
  const adler = adler32(data);
  const result = new Uint8Array(2 + compressed.length + 4);
  result[0] = 0x78; // CMF
  result[1] = 0x9c; // FLG (default compression)
  result.set(compressed, 2);
  result[result.length - 4] = (adler >> 24) & 0xff;
  result[result.length - 3] = (adler >> 16) & 0xff;
  result[result.length - 2] = (adler >> 8) & 0xff;
  result[result.length - 1] = adler & 0xff;

  return result;
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);

  const crcData = new Uint8Array(4 + data.length);
  crcData.set(typeBytes, 0);
  crcData.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcData), false);

  return chunk;
}

// Encode RGBA pixels to PNG
export async function encodePNG(width: number, height: number, pixels: Uint8Array): Promise<Uint8Array> {
  // Add filter byte (0 = None) to each row and prepare raw data
  const rawData = new Uint8Array(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      rawData[offset++] = pixels[srcOffset];     // R
      rawData[offset++] = pixels[srcOffset + 1]; // G
      rawData[offset++] = pixels[srcOffset + 2]; // B
      rawData[offset++] = pixels[srcOffset + 3]; // A
    }
  }

  // Compress
  const compressed = await zlibCompress(rawData);

  // Build PNG
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8;  // Bit depth
  ihdrData[9] = 6;  // Color type: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', new Uint8Array(0));

  // Combine
  const png = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let pos = 0;
  png.set(signature, pos); pos += signature.length;
  png.set(ihdr, pos); pos += ihdr.length;
  png.set(idat, pos); pos += idat.length;
  png.set(iend, pos);

  return png;
}

// Saturate alpha values: 128+ becomes fully opaque, below 128 S-curves toward transparent
// This handles Gemini masks that produce gray instead of white for solid areas
function saturateAlpha(luminance: number): number {
  // Anything 128 or above is fully opaque
  if (luminance >= 128) return 255;

  // Below 128: S-curve toward 0 for anti-aliasing
  // Normalize 0-127 to 0-1
  const t = luminance / 127;

  // Apply power curve to push toward 0 (steepness > 1 pushes toward transparent)
  const curved = Math.pow(t, 2);

  // Hard threshold at the bottom
  const result = Math.round(curved * 255);
  if (result < 20) return 0;

  return result;
}

// Check if a pixel is within the border region of a cell
function isInCellBorder(x: number, y: number, width: number, height: number, gridSize: number, borderWidth: number): boolean {
  const cellWidth = width / gridSize;
  const cellHeight = height / gridSize;

  // Get position within the cell
  const cellX = x % cellWidth;
  const cellY = y % cellHeight;

  // Check if within border region of the cell
  return cellX < borderWidth || cellX >= cellWidth - borderWidth ||
         cellY < borderWidth || cellY >= cellHeight - borderWidth;
}

// Merge sprite sheet with mask to create RGBA image
export async function mergeWithMask(
  spriteData: ArrayBuffer,
  maskData: ArrayBuffer,
  gridSize: number = 3,
  borderWidth: number = 4
): Promise<Uint8Array> {
  const sprite = await decodePNG(new Uint8Array(spriteData));
  const mask = await decodePNG(new Uint8Array(maskData));

  if (sprite.width !== mask.width || sprite.height !== mask.height) {
    console.warn(`[PNG] Size mismatch: sprite ${sprite.width}x${sprite.height}, mask ${mask.width}x${mask.height}`);
    // Use sprite dimensions, mask will be used as-is (may be misaligned)
  }

  const width = sprite.width;
  const height = sprite.height;
  const result = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const srcOffset = i * 4;

    // Get RGB from sprite
    result[srcOffset] = sprite.pixels[srcOffset];     // R
    result[srcOffset + 1] = sprite.pixels[srcOffset + 1]; // G
    result[srcOffset + 2] = sprite.pixels[srcOffset + 2]; // B

    // Force transparency in cell border regions
    if (isInCellBorder(x, y, width, height, gridSize, borderWidth)) {
      result[srcOffset + 3] = 0;
      continue;
    }

    // Get alpha from mask luminance (average of RGB)
    // Handle case where mask might be smaller
    if (srcOffset < mask.pixels.length) {
      const maskR = mask.pixels[srcOffset];
      const maskG = mask.pixels[srcOffset + 1];
      const maskB = mask.pixels[srcOffset + 2];
      const luminance = Math.round((maskR + maskG + maskB) / 3);
      // Apply saturation curve to push values toward 0 and 255
      result[srcOffset + 3] = saturateAlpha(luminance);
    } else {
      result[srcOffset + 3] = 255; // Fallback to opaque
    }
  }

  console.log(`[PNG] Merged ${width}x${height} sprite with mask, grid=${gridSize}, border=${borderWidth}px`);

  return await encodePNG(width, height, result);
}
