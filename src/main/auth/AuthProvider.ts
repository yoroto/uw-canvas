/**
 * How requests to Canvas get authenticated. The rest of the app only talks to
 * this interface, so the cookie session can later be replaced by an OAuth
 * provider without touching the client or the features built on it.
 */
export interface AuthProvider {
  /** True if the stored credentials are currently accepted by Canvas. */
  isSignedIn(): Promise<boolean>
  /** Interactive login. Resolves true once signed in, false if the user gave up. */
  signIn(): Promise<boolean>
  signOut(): Promise<void>
  /** Authenticated fetch. Only URLs on the Canvas origin are allowed. Never follows redirects. */
  fetch(url: string, init?: RequestInit): Promise<Response>
}
