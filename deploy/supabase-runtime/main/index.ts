import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

console.log('main function started')

const JWT_SECRET = Deno.env.get('JWT_SECRET')
const SUPABASE_JWKS_RAW = Deno.env.get('SUPABASE_JWKS')
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') === 'true'

function parseJwks(raw: string | undefined): any | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.keys && Array.isArray(parsed.keys)) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

const SUPABASE_JWKS = parseJwks(SUPABASE_JWKS_RAW)

function getAuthToken(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    throw new Error('Missing authorization header')
  }
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer') {
    throw new Error(`Auth header is not 'Bearer {token}'`)
  }
  return token
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET not available for HS256 token verification')
    return false
  }
  const encoder = new TextEncoder()
  const secretKey = encoder.encode(JWT_SECRET)
  try {
    await jose.jwtVerify(jwt, secretKey)
  } catch (e) {
    console.error('Symmetric Legacy JWT verification error', e)
    return false
  }
  return true
}

async function isValidJWT(jwt: string): Promise<boolean> {
  if (!SUPABASE_JWKS) {
    console.error('JWKS not available for ES256/RS256 token verification')
    return false
  }
  try {
    const localJwks = jose.createLocalJWKSet(SUPABASE_JWKS)
    await jose.jwtVerify(jwt, localJwks)
  } catch (e) {
    console.error('Asymmetric JWT verification error', e)
    return false
  }
  return true
}

async function isValidHybridJWT(jwt: string): Promise<boolean> {
  try {
    const { alg: jwtAlgorithm } = jose.decodeProtectedHeader(jwt)
    if (jwtAlgorithm === 'HS256') {
      console.log(`Legacy token type detected, attempting ${jwtAlgorithm} verification.`)
      return await isValidLegacyJWT(jwt)
    }
    if (jwtAlgorithm === 'ES256' || jwtAlgorithm === 'RS256') {
      return await isValidJWT(jwt)
    }
  } catch (e) {
    console.error('Error decoding JWT header', e)
  }
  return false
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'OPTIONS' && VERIFY_JWT) {
    try {
      const token = getAuthToken(req)
      const valid = await isValidHybridJWT(token)
      if (!valid) {
        return new Response(JSON.stringify({ msg: 'Invalid JWT' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
      }
    } catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ msg: String(e) }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
  }

  const url = new URL(req.url)
  const { pathname } = url
  const path_parts = pathname.split('/')
  const service_name = path_parts[1]

  if (!service_name || service_name === '') {
    return new Response(JSON.stringify({ msg: 'missing function name in request' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const servicePath = `/home/deno/functions/${service_name}`
  console.error(`serving the request with ${servicePath}`)

  const memoryLimitMb = 150
  const workerTimeoutMs = 1 * 60 * 1000
  const noModuleCache = false
  const importMapPath = `/home/deno/functions/deno.jsonc`
  const envVarsObj = { ...Deno.env.toObject(), SUPABASE_FUNCTION_SLUG: service_name }
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]])

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      importMapPath,
      envVars,
    })
    return await worker.fetch(req)
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ msg: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
