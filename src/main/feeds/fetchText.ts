const TIMEOUT_MS = 15_000
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * Downloads a feed as text. https only (also across redirects), a timeout, and a
 * size cap. Error messages never contain the URL, because it may hold a secret token.
 */
export async function fetchFeedText(startUrl: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let url = startUrl
  for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
    if (new URL(url).protocol !== 'https:') throw new Error('The feed redirected to a non-https address')

    let res: Response
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.5' }
      })
    } catch (e) {
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error('The feed took too long to respond')
      throw new Error('Could not connect to the feed')
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error(`The feed returned HTTP ${res.status} without a location`)
      url = new URL(location, url).toString()
      continue
    }
    if (!res.ok) throw new Error(`The feed returned HTTP ${res.status}`)

    return readCapped(res)
  }
  throw new Error('The feed redirected too many times')
}

async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (declared > MAX_BYTES) throw new Error('The feed is larger than 5 MB')
  if (!res.body) return res.text()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new Error('The feed is larger than 5 MB')
    }
    chunks.push(value)
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}
