import { createPublicKey, verify } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { VesselKey } from '../../plugin/vesselKey.js'

function base64UrlToBuffer(value: string): Buffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64')
}

describe('VesselKey', () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'lcars-helm-vesselkey-'))
  })

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('generates a key pair on first use, unregistered', () => {
    const key = new VesselKey(dataDir)

    expect(key.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    expect(key.id).toBeNull()
    expect(key.lastKnownStatus).toBeNull()
  })

  it('reuses the same key across instances pointed at the same data directory', () => {
    const first = new VesselKey(dataDir)
    const second = new VesselKey(dataDir)

    expect(second.publicKeyPem).toBe(first.publicKeyPem)
  })

  it('persists the vessel id and status across instances', () => {
    const first = new VesselKey(dataDir)
    first.setVessel('11111111-1111-1111-1111-111111111111', 'Pending')

    const second = new VesselKey(dataDir)

    expect(second.id).toBe('11111111-1111-1111-1111-111111111111')
    expect(second.lastKnownStatus).toBe('Pending')
  })

  it('updates only the status when told, keeping the vessel id', () => {
    const key = new VesselKey(dataDir)
    key.setVessel('vessel-1', 'Pending')

    key.setStatus('Approved')

    expect(key.id).toBe('vessel-1')
    expect(key.lastKnownStatus).toBe('Approved')
    expect(new VesselKey(dataDir).lastKnownStatus).toBe('Approved')
  })

  it('refuses to mint a token before registering', () => {
    const key = new VesselKey(dataDir)

    expect(() => key.mintToken()).toThrow()
  })

  it('mints a token whose signature verifies against its own public key', () => {
    const key = new VesselKey(dataDir)
    key.setVessel('vessel-1', 'Approved')

    const token = key.mintToken()
    const [header, payload, signature] = token.split('.') as [string, string, string]
    const signingInput = `${header}.${payload}`

    const ok = verify(
      'sha256',
      Buffer.from(signingInput),
      { key: createPublicKey(key.publicKeyPem), dsaEncoding: 'ieee-p1363' },
      base64UrlToBuffer(signature)
    )
    expect(ok).toBe(true)

    const decodedHeader = JSON.parse(base64UrlToBuffer(header).toString('utf8'))
    expect(decodedHeader).toEqual({ alg: 'ES256', typ: 'JWT' })

    const decodedPayload = JSON.parse(base64UrlToBuffer(payload).toString('utf8'))
    expect(decodedPayload.iss).toBe('vessel-1')
    expect(decodedPayload.sub).toBe('vessel-1')
    expect(typeof decodedPayload.jti).toBe('string')
    expect(decodedPayload.exp - decodedPayload.iat).toBe(300)
  })

  it('rejects a token signature checked against a different key', () => {
    const key = new VesselKey(dataDir)
    key.setVessel('vessel-1', 'Approved')
    const other = new VesselKey(mkdtempSync(join(tmpdir(), 'lcars-helm-vesselkey-other-')))

    const token = key.mintToken()
    const [header, payload, signature] = token.split('.') as [string, string, string]

    const ok = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: createPublicKey(other.publicKeyPem), dsaEncoding: 'ieee-p1363' },
      base64UrlToBuffer(signature)
    )
    expect(ok).toBe(false)
  })
})
