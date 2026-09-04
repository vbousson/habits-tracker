/**
 * Réglages — where the app is connected to Google and the spreadsheet is born.
 *
 * This screen is the only place that talks to `googleAuth` and `bootstrap`
 * directly: everywhere else, data access goes through the repository.
 */
import { useState } from 'react'
import { applyTheme } from '../../lib/settings'
import { getAccessToken, getAuthState, signIn, signOut } from '../../lib/googleAuth'
import { createTrackerSpreadsheet, ensureSchema } from '../../adapters/sheets/bootstrap'
import { spreadsheetUrlOf } from '../../adapters/sheets/sheetsApi'
import { IconRefresh, IconSheet } from '../components/Icons'
import type { BackendChoice, Settings, ThemeChoice } from '../../lib/settings'
import type { SettingsScreenProps } from './types'

const REPO_URL = 'https://github.com/vbousson/habits-tracker'
const SETUP_DOC_URL = `${REPO_URL}/blob/main/docs/GOOGLE_SETUP.md`

type Busy = null | 'signin' | 'create' | 'repair' | 'reload'

const BACKENDS: { value: BackendChoice; label: string }[] = [
  { value: 'local', label: 'Cet appareil (démo)' },
  { value: 'sheets', label: 'Google Sheets' },
]

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

export function SettingsScreen({ tracker, settings, onChange }: SettingsScreenProps) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [auth, setAuth] = useState(() => getAuthState(settings.clientId))
  const [clientIdDraft, setClientIdDraft] = useState(settings.clientId)
  const [sheetIdDraft, setSheetIdDraft] = useState(settings.spreadsheetId)
  const [sheetTitle, setSheetTitle] = useState('Habits Tracker')
  const [editingSheetId, setEditingSheetId] = useState(false)

  const clientId = settings.clientId.trim()
  const connected = auth.connected
  const usingSheets = settings.backend === 'sheets'

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch })

  const run = async (task: Busy, work: () => Promise<string | null>) => {
    setBusy(task)
    setError(null)
    setNotice(null)
    try {
      const message = await work()
      if (message) setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      setProgress(null)
      setAuth(getAuthState(settings.clientId))
    }
  }

  const handleSignIn = () =>
    run('signin', async () => {
      await signIn(clientId)
      return 'Connexion à Google réussie.'
    })

  const handleSignOut = () => {
    signOut()
    setAuth(getAuthState(settings.clientId))
    setNotice('Session Google oubliée sur cet appareil.')
    setError(null)
  }

  const handleCreate = () =>
    run('create', async () => {
      const created = await createTrackerSpreadsheet(
        () => getAccessToken(clientId),
        sheetTitle,
        setProgress,
      )
      setSheetIdDraft(created.spreadsheetId)
      setEditingSheetId(false)
      update({ backend: 'sheets', spreadsheetId: created.spreadsheetId })
      return 'Feuille de calcul créée et prête à l’emploi.'
    })

  const handleRepair = () =>
    run('repair', async () => {
      const report = await ensureSchema(settings.spreadsheetId, () => getAccessToken(clientId))
      if (!report.addedTabs.length && !report.repairedHeaders.length) {
        return 'Structure vérifiée : rien à réparer.'
      }
      const parts: string[] = []
      if (report.addedTabs.length) parts.push(`onglets ajoutés : ${report.addedTabs.join(', ')}`)
      if (report.repairedHeaders.length) {
        parts.push(`en-têtes restaurés : ${report.repairedHeaders.join(', ')}`)
      }
      return `Structure réparée (${parts.join(' ; ')}).`
    })

  const handleReload = () =>
    run('reload', async () => {
      await tracker.reload()
      return 'Données rechargées.'
    })

  return (
    <div className="stack">
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="banner banner--ok" role="status">
          {notice}
        </div>
      )}

      {/* --- Stockage ----------------------------------------------------- */}
      <section className="card stack--tight stack">
        <h2 className="section-title">Stockage des données</h2>
        <div className="segmented" role="group" aria-label="Choix du stockage">
          {BACKENDS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__opt"
              aria-pressed={settings.backend === option.value}
              onClick={() => update({ backend: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="small muted">
          <strong>Cet appareil</strong> — tout reste dans ce navigateur. Rien n’est synchronisé, et
          vider les données du navigateur (ou changer de téléphone) efface définitivement l’historique.
          À utiliser pour essayer l’application.
        </p>
        <p className="small muted">
          <strong>Google Sheets</strong> — les données sont écrites dans une feuille de calcul de
          <em> ton</em> Google Drive. Elles te suivent d’un appareil à l’autre et restent lisibles,
          exportables et sauvegardées même sans l’application.
        </p>
        <div className="row row--wrap">
          <button
            type="button"
            className="btn btn--sm"
            onClick={handleReload}
            disabled={busy !== null}
          >
            {busy === 'reload' ? <span className="spinner" /> : <IconRefresh size={16} />}
            Recharger les données
          </button>
          <span className="tiny faint">Source actuelle : {tracker.repo.label}</span>
        </div>
      </section>

      {usingSheets && (
        <>
          {/* --- Connexion Google ----------------------------------------- */}
          <section className="card stack">
            <div className="row row--between">
              <h2 className="section-title">Connexion Google</h2>
              <span className="badge">{connected ? 'Connecté' : 'Non connecté'}</span>
            </div>

            {connected && auth.expiresAt && (
              <p className="tiny faint">
                Session valide jusqu’à{' '}
                <span className="numeric">
                  {new Date(auth.expiresAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                . Elle est renouvelée automatiquement tant que tu restes connecté à Google.
              </p>
            )}

            <div className="field">
              <label className="field__label" htmlFor="google-client-id">
                Identifiant client OAuth
              </label>
              <input
                id="google-client-id"
                className="input"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
                value={clientIdDraft}
                onChange={(e) => setClientIdDraft(e.target.value)}
              />
              <p className="field__help">
                Ce n’est pas un secret : dans une application web, l’identifiant client est public par
                nature. Aucun « client secret » n’est nécessaire.{' '}
                <a href={SETUP_DOC_URL} target="_blank" rel="noreferrer noopener">
                  Comment l’obtenir en 5 minutes
                </a>
                .
              </p>
              {clientIdDraft.trim() !== settings.clientId && (
                <div className="row row--wrap">
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    onClick={() => {
                      signOut()
                      update({ clientId: clientIdDraft.trim() })
                      setAuth(getAuthState(clientIdDraft.trim()))
                      setNotice('Identifiant client enregistré.')
                    }}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setClientIdDraft(settings.clientId)}
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>

            <div className="row row--wrap">
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleSignIn}
                disabled={busy !== null || !clientId}
              >
                {busy === 'signin' && <span className="spinner" />}
                {connected ? 'Se reconnecter' : 'Se connecter'}
              </button>
              {connected && (
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={handleSignOut}
                  disabled={busy !== null}
                >
                  Se déconnecter
                </button>
              )}
            </div>
            {!clientId && (
              <p className="small muted">
                Renseigne d’abord l’identifiant client ci-dessus pour activer la connexion.
              </p>
            )}
            <p className="tiny faint">
              L’autorisation demandée est <code>drive.file</code> : l’application ne voit que les
              fichiers qu’elle a elle-même créés. Elle ne peut pas lire le reste de ton Drive.
            </p>
          </section>

          {/* --- Feuille de calcul ---------------------------------------- */}
          <section className="card stack">
            <h2 className="section-title">Feuille de calcul</h2>

            {settings.spreadsheetId && !editingSheetId ? (
              <>
                <div className="field">
                  <span className="field__label">Feuille utilisée</span>
                  <code className="small muted truncate">{settings.spreadsheetId}</code>
                </div>
                <div className="row row--wrap">
                  <a
                    className="btn btn--sm"
                    href={spreadsheetUrlOf(settings.spreadsheetId)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <IconSheet size={16} />
                    Ouvrir dans Google Sheets
                  </a>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={handleRepair}
                    disabled={busy !== null || !clientId}
                  >
                    {busy === 'repair' ? <span className="spinner" /> : <IconRefresh size={16} />}
                    Vérifier / réparer la structure
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      setSheetIdDraft(settings.spreadsheetId)
                      setEditingSheetId(true)
                    }}
                  >
                    Changer de feuille
                  </button>
                </div>
                <p className="tiny faint">
                  « Vérifier / réparer » recrée les onglets ou les en-têtes manquants. Aucune donnée
                  existante n’est modifiée.
                </p>
              </>
            ) : (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="sheet-title">
                    Nom du nouveau fichier
                  </label>
                  <input
                    id="sheet-title"
                    className="input"
                    type="text"
                    value={sheetTitle}
                    onChange={(e) => setSheetTitle(e.target.value)}
                  />
                  <p className="field__help">
                    Créé dans ton Google Drive, avec un onglet « Guide » qui explique comment
                    l’adapter à tes besoins.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  onClick={handleCreate}
                  disabled={busy !== null || !clientId}
                >
                  {busy === 'create' && <span className="spinner" />}
                  Créer ma feuille de calcul
                </button>
                {progress && <p className="small muted">{progress}</p>}

                <hr className="divider" />

                <div className="field">
                  <label className="field__label" htmlFor="sheet-id">
                    …ou utiliser une feuille existante
                  </label>
                  <input
                    id="sheet-id"
                    className="input"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="1AbCdEfGh…"
                    value={sheetIdDraft}
                    onChange={(e) => setSheetIdDraft(e.target.value)}
                  />
                  <p className="field__help">
                    L’identifiant est la partie de l’URL entre <code>/d/</code> et <code>/edit</code>.
                  </p>
                </div>
                <div className="banner">
                  Attention : l’application ne peut ouvrir que les feuilles <strong>qu’elle a
                  créées elle-même</strong>. Une feuille créée à la main dans Google Drive sera
                  refusée par Google (erreur 404 ou 403), même si elle t’appartient. Dans ce cas,
                  laisse l’application en créer une.
                </div>
                <div className="row row--wrap">
                  <button
                    type="button"
                    className="btn btn--sm btn--primary"
                    disabled={!sheetIdDraft.trim() || sheetIdDraft.trim() === settings.spreadsheetId}
                    onClick={() => {
                      update({ spreadsheetId: sheetIdDraft.trim() })
                      setEditingSheetId(false)
                      setNotice('Feuille de calcul enregistrée.')
                    }}
                  >
                    Utiliser cette feuille
                  </button>
                  {settings.spreadsheetId && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        setSheetIdDraft(settings.spreadsheetId)
                        setEditingSheetId(false)
                      }}
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* --- Apparence ------------------------------------------------------ */}
      <section className="card stack--tight stack">
        <h2 className="section-title">Apparence</h2>
        <div className="segmented" role="group" aria-label="Thème">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              className="segmented__opt"
              aria-pressed={settings.theme === option.value}
              onClick={() => {
                applyTheme(option.value)
                update({ theme: option.value })
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="tiny faint">
          « Système » suit le réglage clair / sombre de ton téléphone.
        </p>
      </section>

      {/* --- À propos ------------------------------------------------------- */}
      <section className="card stack--tight stack">
        <h2 className="section-title">À propos</h2>
        <p className="small muted">
          Habits Tracker — un suivi d’habitudes libre et sans serveur : tes données restent chez toi,
          dans ton navigateur ou dans ton propre Google Drive.
        </p>
        <p className="small">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            Code source et documentation sur GitHub
          </a>
        </p>
      </section>
    </div>
  )
}
