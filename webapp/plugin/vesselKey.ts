import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject
} from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KEY_FILE = 'key.pem'
const PUBLIC_KEY_FILE = 'key.pub.pem'
const VESSEL_FILE = 'vessel.json'
const DEFAULT_TOKEN_LIFETIME_SECONDS = 300

interface StoredVessel {
  vesselId: string
  status: string
}

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Mints an ES256 JWT — the plugin's proof that it holds the private key matching
 * the public key it registered with. Must match
 * cloud/src/LcarsHelm.Cloud.Api/Auth/VesselJwt.cs byte-for-byte: the same three
 * dot-joined base64url segments, `dsaEncoding: 'ieee-p1363'` on the .NET side
 * corresponding to Node's own default raw R||S signature format.
 */
export function mintToken(vesselId: string, privateKey: KeyObject, lifetimeSeconds: number): string {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })))
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = base64Url(
    Buffer.from(
      JSON.stringify({
        iss: vesselId,
        sub: vesselId,
        iat: issuedAt,
        exp: issuedAt + lifetimeSeconds,
        jti: randomUUID()
      })
    )
  )
  const signingInput = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  })
  return `${signingInput}.${base64Url(signature)}`
}

/**
 * The vessel's identity: an ECDSA P-256 key pair generated on first start and kept
 * under the plugin's data directory (outside `node_modules`, so it survives every
 * update), plus whichever vessel id and approval status the cloud last told this
 * installation about.
 */
export class VesselKey {
  private readonly dir: string
  private readonly privateKey: KeyObject
  readonly publicKeyPem: string
  private vesselId: string | null = null
  private status: string | null = null

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'vessel')
    mkdirSync(this.dir, { recursive: true })

    const keyPath = join(this.dir, KEY_FILE)
    const publicKeyPath = join(this.dir, PUBLIC_KEY_FILE)

    if (existsSync(keyPath)) {
      this.privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'))
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, {
        mode: 0o600
      })
      try {
        chmodSync(keyPath, 0o600)
      } catch {
        // Not every filesystem has POSIX permissions (a Windows dev box, say); the
        // key is still readable only by whoever can already read the data dir.
      }
      writeFileSync(publicKeyPath, publicKey.export({ type: 'spki', format: 'pem' }) as string)
      this.privateKey = privateKey
    }

    this.publicKeyPem = existsSync(publicKeyPath)
      ? readFileSync(publicKeyPath, 'utf8')
      : (createPublicKey(this.privateKey).export({ type: 'spki', format: 'pem' }) as string)

    const stored = this.loadVessel()
    this.vesselId = stored?.vesselId ?? null
    this.status = stored?.status ?? null
  }

  /** Null until this installation has registered (or been re-provisioned onto an
   *  existing key, which the cloud recognises and hands back the same id for). */
  get id(): string | null {
    return this.vesselId
  }

  get lastKnownStatus(): string | null {
    return this.status
  }

  setVessel(vesselId: string, status: string): void {
    this.vesselId = vesselId
    this.status = status
    this.saveVessel({ vesselId, status })
  }

  setStatus(status: string): void {
    this.status = status
    if (this.vesselId) this.saveVessel({ vesselId: this.vesselId, status })
  }

  mintToken(lifetimeSeconds = DEFAULT_TOKEN_LIFETIME_SECONDS): string {
    if (!this.vesselId) {
      throw new Error('Cannot mint a token before this vessel has registered.')
    }
    return mintToken(this.vesselId, this.privateKey, lifetimeSeconds)
  }

  private loadVessel(): StoredVessel | null {
    try {
      const path = join(this.dir, VESSEL_FILE)
      if (!existsSync(path)) return null
      return JSON.parse(readFileSync(path, 'utf8')) as StoredVessel
    } catch {
      return null
    }
  }

  private saveVessel(vessel: StoredVessel): void {
    try {
      writeFileSync(join(this.dir, VESSEL_FILE), JSON.stringify(vessel))
    } catch {
      // Retried at the next registration or status check; not fatal on its own.
    }
  }
}
