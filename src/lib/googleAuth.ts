/**
 * Google sign-in, without an SDK package.
 *
 * The app is a static site: there is no server, therefore no client secret and
 * no refresh token. The only OAuth flow available to us is the browser-side
 * *token flow* of Google Identity Services (GIS), which hands back a short-lived
 * access token (≈1 h) obtained in a popup. GIS itself is loaded lazily from
 * https://accounts.google.com/gsi/client — the one script tag this app injects.
 *
 * ---------------------------------------------------------------------------
 * Why the scope is `drive.file` and not `spreadsheets`
 * ---------------------------------------------------------------------------
 * `https://www.googleapis.com/auth/drive.file` is a NON-SENSITIVE scope: it
 * grants access only to the files this very app created, or that the user
 * explicitly opened with it through the Google Picker. Google therefore does not
 * require the OAuth app verification / security assessment that the broad
 * `.../auth/spreadsheets` scope triggers, and the consent screen stays friendly.
 *
 * Because the app creates the spreadsheet itself (see
 * `src/adapters/sheets/bootstrap.ts`), `drive.file` is enough to read *and*
 * write it through the Sheets API.
 *
 * CONSEQUENCE, and it bites: a spreadsheet the user created by hand in Drive is
 * NOT covered by this grant. Pasting such an id returns 404 (or 403) from
 * Google, not because the file is missing but because this app is not allowed to
 * see it. The fix is always the same — let the app create the spreadsheet. The
 * Settings screen says so in French, and `docs/GOOGLE_SETUP.md` documents it.
 */
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

/** Renew this early, so a request never leaves with a token about to expire. */
const EXPIRY_MARGIN_MS = 60_000

/** The GIS script is small, but a captive portal can make it hang forever. */
const SCRIPT_TIMEOUT_MS = 15_000

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

interface GisError {
  type?: string
  message?: string
}

interface TokenClientConfig {
  client_id: string
  scope: string
  prompt?: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: GisError) => void
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: TokenClientConfig): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

export interface AuthState {
  connected: boolean
  /** Epoch ms at which the current token stops being usable, `null` if none. */
  expiresAt: number | null
  /** The client id the current token was issued for. */
  clientId: string | null
}

// --- Script loading ---------------------------------------------------------

let gisPromise: Promise<GoogleOAuth2> | null = null

function loadGis(): Promise<GoogleOAuth2> {
  const ready = window.google?.accounts?.oauth2
  if (ready) return Promise.resolve(ready)
  if (gisPromise) return gisPromise

  gisPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const fail = (message: string) => {
      // Allow a later retry: a transient network failure must not be permanent.
      gisPromise = null
      reject(new Error(message))
    }
    const timer = setTimeout(
      () => fail('Le service Google met trop de temps à répondre. Vérifie ta connexion, puis réessaie.'),
      SCRIPT_TIMEOUT_MS,
    )
    const settle = () => {
      clearTimeout(timer)
      const api = window.google?.accounts?.oauth2
      if (api) resolve(api)
      else fail("Le service d'authentification Google s'est chargé mais reste indisponible. Réessaie dans un instant.")
    }

    const selector = `script[data-google-identity="1"]`
    const existing = document.querySelector<HTMLScriptElement>(selector)
    if (existing) {
      existing.addEventListener('load', settle, { once: true })
      existing.addEventListener('error', () => fail(networkFailureMessage()), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.dataset.googleIdentity = '1'
    script.addEventListener('load', settle, { once: true })
    script.addEventListener('error', () => fail(networkFailureMessage()), { once: true })
    document.head.appendChild(script)
  })

  return gisPromise
}

function networkFailureMessage(): string {
  return (
    "Impossible de charger le service d'authentification Google " +
    '(accounts.google.com). Vérifie ta connexion, ton bloqueur de publicités ou ton extension de confidentialité, puis réessaie.'
  )
}

// --- Token cache ------------------------------------------------------------

interface CachedToken {
  clientId: string
  token: string
  expiresAt: number
}

let cached: CachedToken | null = null
/**
 * Keyed by client id, not a single slot: changing the client id in Settings while
 * a request is in flight must not hand the caller a token issued for the previous
 * project.
 */
const inFlight = new Map<string, Promise<string>>()

/** Deliberately not a type predicate: expiry is a runtime fact, not a type. */
function isUsable(entry: CachedToken | null, clientId: string): boolean {
  return !!entry && entry.clientId === clientId && entry.expiresAt - EXPIRY_MARGIN_MS > Date.now()
}

/**
 * One token request. A fresh client is created per request so that two
 * overlapping requests can never resolve each other's promise.
 *
 * `prompt: ''` asks Google to reuse the existing grant without showing anything;
 * `prompt: 'consent'` always shows the account chooser / consent screen and is
 * the only variant safe to call outside a user gesture-free context.
 */
function requestToken(clientId: string, prompt: '' | 'consent'): Promise<string> {
  return loadGis().then(
    (oauth2) =>
      new Promise<string>((resolve, reject) => {
        let settled = false
        const finish = (fn: () => void) => {
          if (settled) return
          settled = true
          fn()
        }

        const client = oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.error || !response.access_token) {
              finish(() => reject(new Error(describeTokenError(response))))
              return
            }
            const token = response.access_token
            const ttl = Number(response.expires_in ?? 3600)
            const seconds = Number.isFinite(ttl) && ttl > 0 ? ttl : 3600
            cached = { clientId, token, expiresAt: Date.now() + seconds * 1000 }
            finish(() => resolve(token))
          },
          error_callback: (error) => finish(() => reject(new Error(describeGisError(error)))),
        })

        try {
          client.requestAccessToken({ prompt })
        } catch (e) {
          finish(() => reject(new Error(e instanceof Error ? e.message : String(e))))
        }
      }),
  )
}

function describeTokenError(response: TokenResponse): string {
  const detail = response.error_description ? ` (${response.error_description})` : ''
  switch (response.error) {
    case 'access_denied':
      return `Google a refusé l'accès${detail}. Si l'application est en mode « Test », ton compte doit être ajouté comme utilisateur de test dans Google Cloud Console.`
    case 'invalid_client':
      return `Identifiant client Google invalide${detail}. Vérifie la valeur collée dans Réglages.`
    case 'invalid_request':
      return `Requête d'authentification refusée${detail}. Vérifie que l'origine JavaScript autorisée du client OAuth correspond exactement à ${location.origin}.`
    case 'interaction_required':
    case 'consent_required':
    case 'login_required':
      return 'Ta session Google a expiré. Ouvre Réglages puis clique sur « Se connecter ».'
    default:
      return `Connexion Google impossible${detail || (response.error ? ` (${response.error})` : '')}.`
  }
}

function describeGisError(error: GisError): string {
  switch (error.type) {
    case 'popup_failed_to_open':
      return "La fenêtre Google n'a pas pu s'ouvrir : ton navigateur bloque les pop-ups. Autorise-les pour ce site, puis réessaie."
    case 'popup_closed':
      return 'Fenêtre Google fermée avant la fin de la connexion.'
    default:
      return error.message || 'Connexion Google interrompue.'
  }
}

// --- Public API -------------------------------------------------------------

/**
 * A valid access token, from cache when possible.
 *
 * Order matters: a silent renewal (`prompt: ''`) is tried first so the user is
 * not shown a popup every hour. Only if that fails do we fall back to the
 * interactive flow — which is itself likely to be blocked when we are not inside
 * a click handler, hence the explicit French message pointing at Réglages.
 */
export function getAccessToken(clientId: string): Promise<string> {
  const id = clientId.trim()
  if (!id) {
    return Promise.reject(
      new Error('Identifiant client Google manquant. Renseigne-le dans Réglages > Connexion Google.'),
    )
  }
  const current = cached
  if (current && isUsable(current, id)) return Promise.resolve(current.token)
  if (current && current.clientId !== id) cached = null

  const running = inFlight.get(id)
  if (running) return running

  const pending = requestToken(id, '')
    .catch(() => requestToken(id, 'consent'))
    .catch(() => {
      throw new Error(
        'Ta session Google a expiré et le renouvellement automatique a échoué. Ouvre Réglages puis clique sur « Se connecter ».',
      )
    })

  inFlight.set(id, pending)
  void pending.finally(() => {
    if (inFlight.get(id) === pending) inFlight.delete(id)
  })
  return pending
}

/**
 * Always interactive. MUST be called from a click handler: browsers block the
 * popup otherwise, and `describeGisError` will say so.
 */
export function signIn(clientId: string): Promise<string> {
  const id = clientId.trim()
  if (!id) {
    return Promise.reject(
      new Error('Renseigne d’abord l’identifiant client Google (voir docs/GOOGLE_SETUP.md).'),
    )
  }
  cached = null
  return requestToken(id, 'consent')
}

/**
 * Forgets the token held in memory.
 *
 * Deliberately does *not* call `oauth2.revoke`: revoking would also drop the
 * per-file authorisations `drive.file` accumulated, and the user would have to
 * re-authorise the spreadsheet. A full revocation belongs on
 * https://myaccount.google.com/permissions.
 */
export function signOut(): void {
  cached = null
  inFlight.clear()
}

export function hasValidToken(clientId?: string): boolean {
  const current = cached
  if (!current) return false
  return isUsable(current, clientId?.trim() || current.clientId)
}

/** Connection state, for the Settings screen. */
export function getAuthState(clientId?: string): AuthState {
  const current = cached
  const id = clientId?.trim()
  if (!current || (id && current.clientId !== id)) {
    return { connected: false, expiresAt: null, clientId: null }
  }
  return {
    connected: current.expiresAt > Date.now(),
    expiresAt: current.expiresAt,
    clientId: current.clientId,
  }
}
