// Generate VAPID key pair for Web Push (P-256 / prime256v1).
// Usage: node scripts/web/gen-vapid-keys.mjs
// Requires Node 22 (built-in crypto, no dependencies).
import crypto from 'node:crypto'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
})

const jwkPub = publicKey.export({ format: 'jwk' })
const jwkPriv = privateKey.export({ format: 'jwk' })

if (!jwkPub.x || !jwkPub.y || !jwkPriv.d) {
  console.error('Failed to export key pair as JWK')
  process.exit(1)
}

function pad32(buf) {
  if (buf.length === 32) return buf
  if (buf.length < 32) {
    const padded = Buffer.alloc(32)
    buf.copy(padded, 32 - buf.length)
    return padded
  }
  return buf.subarray(buf.length - 32)
}

// 65-byte uncompressed point: 0x04 || x (32 bytes) || y (32 bytes)
const xBuf = pad32(Buffer.from(jwkPub.x, 'base64url'))
const yBuf = pad32(Buffer.from(jwkPub.y, 'base64url'))
const dBuf = pad32(Buffer.from(jwkPriv.d, 'base64url'))

const uncompressedPub = Buffer.concat([Buffer.from([0x04]), xBuf, yBuf])
const vapidPublicKey = uncompressedPub.toString('base64url')
const vapidPrivateKey = dBuf.toString('base64url')

console.log(`VAPID_PUBLIC_KEY=${vapidPublicKey}`)
console.log(`VAPID_PRIVATE_KEY=${vapidPrivateKey}`)
console.log('')
console.log('# REMINDER: VAPID_PRIVATE_KEY is a secret and goes ONLY into Supabase function secrets.')
console.log('# Never commit it and never expose it to client-side code.')
console.log('# Set function secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...')
console.log('# Web client config: set NEXT_PUBLIC_VAPID_PUBLIC_KEY in web/.env.local')
