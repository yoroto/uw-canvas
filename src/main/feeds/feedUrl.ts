/**
 * Accepts what people paste for a calendar feed and returns the https URL to
 * fetch. `webcal://` and `webcals://` are the same feed over https. Anything
 * else (http, file, javascript, ...) is rejected: feed URLs often carry a
 * secret token, so they only travel over https.
 */
export function normaliseFeedUrl(input: string): string {
  const text = input.trim()
  if (!text) throw new Error('Enter a calendar feed URL')
  const swapped = text.replace(/^webcals?:\/\//i, 'https://')
  let url: URL
  try {
    url = new URL(swapped)
  } catch {
    throw new Error('That does not look like a URL')
  }
  if (url.protocol !== 'https:') throw new Error('Only webcal:// and https:// feeds are supported')
  if (!url.hostname) throw new Error('That does not look like a URL')
  return url.toString()
}
