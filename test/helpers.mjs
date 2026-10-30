// Shared test helpers. Only *.test.mjs files are executed by `node --test`, so
// this module is imported, never run directly.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const fixtures = join(import.meta.dirname, 'fixtures')

/** Copy a fixture repository into a fresh temp directory. */
export function makeRepo(fixture = 'demo') {
  const dir = mkdtempSync(join(tmpdir(), 'market-card-test-'))
  cpSync(join(fixtures, fixture), dir, { recursive: true })
  return dir
}

export function cleanup(t, dir) {
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch (error) {
      // Windows can still hold a file; a leftover temp directory is not a test failure.
    }
  })
}

/** A structurally valid PNG (CRCs are zero: the readers here only need IHDR). */
export function fakePng(width, height) {
  const head = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0)
  head.writeUInt32BE(13, 8)
  head.write('IHDR', 12, 'ascii')
  head.writeUInt32BE(width, 16)
  head.writeUInt32BE(height, 20)
  head[24] = 8
  head[25] = 6
  const tail = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([head, tail])
}

export function fakeJpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, // SOF0, length, precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ])
}
