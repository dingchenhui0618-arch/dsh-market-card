// Image metadata without any image library.
//
// The card embeds screenshots as data URIs, so it needs two things from a file:
// the exact MIME type and the intrinsic pixel size (the <img width height> pair
// keeps the measured page height stable before the decoder runs).

import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

export function isImagePath(file) {
  return IMAGE_EXTENSIONS.includes(extname(String(file)).toLowerCase())
}

export function mimeForPath(file) {
  switch (extname(String(file)).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return null
  }
}

function uint32be(buffer, offset) {
  return buffer.readUInt32BE(offset)
}

function pngMeta(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return { mime: 'image/png', width: uint32be(buffer, 16), height: uint32be(buffer, 20) }
}

function jpegMeta(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buffer[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2) return null
    // SOF0..SOF15, minus DHT (0xc4), JPG (0xc8) and DAC (0xcc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function webpMeta(buffer) {
  if (buffer.length < 30) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null
  const kind = buffer.toString('ascii', 12, 16)
  if (kind === 'VP8X') {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16))
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
    return { mime: 'image/webp', width, height }
  }
  if (kind === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

/** Parse an image buffer; returns null when the format is unsupported or corrupt. */
export function imageMeta(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null
  return pngMeta(buffer) || jpegMeta(buffer) || webpMeta(buffer)
}

/** Read metadata from disk. Throws on an unreadable file, returns null on unknown bytes. */
export function readImageMeta(file) {
  const meta = imageMeta(readFileSync(file))
  if (meta === null) return null
  return { ...meta, bytes: readFileSync(file).length }
}

export function dataUri(file) {
  const mime = mimeForPath(file)
  if (mime === null) throw new Error('unsupported image type: ' + file)
  return 'data:' + mime + ';base64,' + readFileSync(file).toString('base64')
}
