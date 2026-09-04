# Guide d'installation

Le chemin complet, dans l'ordre, depuis un dépôt fraîchement forké jusqu'à une
application déployée qui écrit dans ta propre feuille Google.

Ce guide est le **fil conducteur**. Deux étapes ont leur propre document détaillé,
appelé au bon moment :

| Détail | Document |
|---|---|
| Créer le projet Google Cloud et l'identifiant OAuth | [GOOGLE_SETUP.md](GOOGLE_SETUP.md) |
| Héberger ailleurs que sur GitHub Pages | [DEPLOYMENT.md](DEPLOYMENT.md) |

> **Combien de temps ?** Environ 30 minutes, dont une vingtaine côté Google Cloud
> la première fois. Tout le reste est de la configuration par clics.

---

## Ce que l'application fait toute seule

Il est utile de savoir ce que tu n'as **pas** à faire à la main :

- Tu n'as pas à créer la feuille de calcul. L'application la crée dans ton Drive,
  crée les sept onglets, écrit les en-têtes, la remplit d'un jeu d'indicateurs de
  départ et y ajoute un onglet `Guide` qui documente chaque colonne.
- Tu n'as pas à écrire de code pour ajouter un indicateur. Tu ajoutes une ligne
  dans l'onglet `Config` de ta feuille.
- Tu n'as pas de serveur à administrer. Il n'y en a pas.

Et ce que **toi seul** peux faire, parce que cela engage tes comptes : créer le
projet Google Cloud, activer GitHub Pages, et déposer le secret de build. C'est
l'objet de ce guide.

---

## Étape 0 — Prérequis

- [ ] Un compte Google (celui dont tu veux utiliser le Drive).
- [ ] Un compte GitHub, et le dépôt (le tien ou un fork de celui-ci).
- [ ] Node.js 20 ou plus, **uniquement** si tu veux lancer l'application en local.
      Pour un simple déploiement, GitHub s'en charge.

---

## Étape 1 — (facultatif) Faire tourner l'application en local

Utile pour voir à quoi elle ressemble avant de configurer quoi que ce soit. Le
mode démo fonctionne **sans compte Google** : il charge une configuration de
départ et quatre mois d'historique fictif, stockés dans ton navigateur.

```bash
npm ci
npm run dev      # http://localhost:5173
```

Autres commandes utiles :

```bash
npm run test        # la suite de tests
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm run build       # build de production dans dist/
```

---

## Étape 2 — Google Cloud

Cette étape produit **un identifiant client OAuth**, la seule valeur que tu auras
à recopier ensuite.

Suis [GOOGLE_SETUP.md](GOOGLE_SETUP.md) intégralement. En résumé :

- [ ] Créer un projet Google Cloud.
- [ ] Activer **Google Sheets API** et **Google Drive API**.
- [ ] Configurer l'écran de consentement : type **Externe**, portée
      `https://www.googleapis.com/auth/drive.file`, et **ajouter ton adresse
      comme utilisateur de test**.
- [ ] Créer un **ID client OAuth** de type **Application Web**.
- [ ] Renseigner les **origines JavaScript autorisées** :

      https://<ton-compte>.github.io
      http://localhost:5173

- [ ] Copier l'identifiant client (il ressemble à `1234-abcd.apps.googleusercontent.com`).

> ### Les deux pièges de cette étape
>
> **L'origine, c'est le schéma et le domaine, sans chemin.** On écrit
> `https://vbousson.github.io`, **jamais** `https://vbousson.github.io/habits-tracker/`.
> Google refuse le chemin, et l'erreur qui en résulte (`origin_mismatch`) ne dit
> pas laquelle des deux valeurs est en cause.
>
> **L'identifiant client n'est pas un secret.** Il est public par construction
> dans une application navigateur, et c'est l'origine autorisée — pas sa
> confidentialité — qui protège l'accès. Il n'existe aucun *client secret* dans
> ce projet, et il ne faut surtout pas en créer un.

---

## Étape 3 — Déployer sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` fait tout le travail à chaque `push`
sur `main`. Il te reste à l'autoriser.

- [ ] **Pousser le code** sur la branche `main`.

- [ ] **Settings → Pages → Build and deployment → Source : `GitHub Actions`.**

      C'est l'étape qui casse tout en silence si on l'oublie : le workflow passe
      au vert, l'artefact est bien construit, et rien n'est publié.

- [ ] **Settings → Secrets and variables → Actions → New repository secret**

      | Nom | Valeur |
      |---|---|
      | `VITE_GOOGLE_CLIENT_ID` | l'identifiant client de l'étape 2 |

      Ce secret est **facultatif**. Sans lui l'application se déploie quand même
      et te demandera l'identifiant dans son écran *Réglages* — ce qui est même
      préférable si tu partages le déploiement avec quelqu'un qui a son propre
      projet Google.

- [ ] **Relancer le workflow** (Actions → Deploy to GitHub Pages → *Run workflow*).

      Vite intègre les variables `VITE_*` **au moment du build** : un déploiement
      antérieur à l'ajout du secret ne le verra jamais.

- [ ] Ouvrir `https://<ton-compte>.github.io/<nom-du-depot>/` et vérifier que
      l'application s'affiche en mode démo.

---

## Étape 4 — Créer ta feuille de calcul

Depuis l'application déployée :

- [ ] Aller dans **Réglages**.
- [ ] Choisir le stockage **Google Sheets**.
- [ ] Vérifier l'identifiant client (pré-rempli s'il vient du secret de build).
- [ ] **Se connecter** avec le compte Google ajouté comme utilisateur de test.

      L'écran d'avertissement « application non validée » n'apparaît pas avec la
      portée `drive.file`. En revanche, si ton compte n'est pas dans la liste des
      utilisateurs de test, Google renverra `access_denied`.

- [ ] Cliquer sur **Créer ma feuille de calcul**.

L'application crée alors dans ton Drive une feuille complète : sept onglets,
en-têtes figés, listes déroulantes, indicateurs de départ, et un onglet `Guide`.

> ### Pourquoi tu ne peux pas réutiliser une feuille existante
>
> L'application demande la portée `drive.file`, qui ne lui donne accès **qu'aux
> fichiers qu'elle a elle-même créés**. C'est un choix délibéré : c'est la portée
> la moins intrusive possible, elle n'est pas « sensible » au sens de Google, et
> elle évite donc à la fois l'écran d'avertissement et une procédure de
> vérification.
>
> La contrepartie est qu'une feuille que tu aurais créée à la main dans Drive est
> **invisible** pour l'application, et renverra une erreur 404. La solution est
> toujours la même : laisse l'application créer la feuille, puis modifie-la.

---

## Étape 5 — Configurer tes propres indicateurs

Le modèle de départ est volontairement générique, et c'est là que le projet prend
son sens : **tu le remplaces par ce qui compte pour toi.**

Ouvre ta feuille, onglet `Config`, et modifie les lignes. L'onglet `Guide` de ta
feuille explique chaque colonne, et [DATA_MODEL.md](DATA_MODEL.md) en est la
référence complète. L'essentiel :

| Colonne | Ce qu'elle fait |
|---|---|
| `type` | `bool`, `scale`, `choice`, `number`, `text` |
| `options` | les niveaux d'une échelle ou d'un choix, séparés par `\|` |
| `schedule` | `daily`, `weekdays`, `weekends`, `never`, ou `lun,mer,ven` |
| `mode` | `daily` (posé chaque soir), `quick` (événement rare), `both` |
| `depends_on` | n'affiche cette question que si la question parente est positive |
| `tags` | thèmes, séparés par `\|` — ils pilotent les couleurs et les filtres |

Les trois colonnes qui font vraiment gagner du temps le soir :

- **`schedule`** évite qu'on te demande ton trajet domicile-travail le dimanche.
- **`mode: quick`** sort un événement rare du questionnaire quotidien tout en le
  gardant à un geste, via le bouton d'ajout rapide.
- **`depends_on`** enchaîne les questions de détail. Déclarer une crise fait
  apparaître son intensité, puis sa cause présumée — sans qu'aucune de ces trois
  questions ne pollue les jours où il ne se passe rien.

Recharge l'application après avoir modifié la feuille.

---

## Étape 6 — (facultatif) Finir de tenir le dépôt comme un projet public

À faire seulement si tu publies le dépôt.

- [ ] **Settings → General → Features → Discussions** — activé.
      `.github/ISSUE_TEMPLATE/config.yml` y renvoie ; sans ça le lien fait un 404.
- [ ] **Settings → Code security → Private vulnerability reporting** — activé.
      `SECURITY.md` y renvoie également.
- [ ] **Settings → General** — renseigner la description, l'URL du site (celle de
      Pages) et quelques sujets : `pwa`, `react`, `typescript`, `habit-tracker`,
      `google-sheets`, `privacy`.
- [ ] **Settings → Branches** — protéger `main` en exigeant que la CI soit verte.
- [ ] Ajouter des captures d'écran dans `docs/screenshots/` et décommenter le bloc
      prévu dans le `README.md`.
- [ ] Poser le tag `v0.1.0`, cohérent avec le `CHANGELOG.md`.

---

## Dépannage

| Symptôme | Cause la plus probable |
|---|---|
| Page blanche, 404 sur `/assets/…` | `BASE_PATH` incorrect, ou source Pages non réglée sur *GitHub Actions* |
| 404 en rafraîchissant une page interne | `404.html` absent — le workflow le copie, vérifie qu'il a bien tourné |
| `origin_mismatch` / `redirect_uri_mismatch` | l'origine autorisée contient un chemin, ou le domaine ne correspond pas |
| `access_denied` à la connexion | ton compte n'est pas utilisateur de test de l'écran de consentement |
| La fenêtre Google ne s'ouvre pas | bloqueur de pop-ups ; la connexion doit partir d'un clic |
| 404 sur une feuille dont tu colles l'identifiant | feuille non créée par l'application — voir l'étape 4 |
| Le champ identifiant client est vide en production | secret ajouté après le dernier build — relance le workflow |
| L'application reste sur une ancienne version | service worker ; recharge en forçant, ou vide le cache du site |

Les cas Google en détail : [GOOGLE_SETUP.md](GOOGLE_SETUP.md#6-dépannage).
Les cas d'hébergement en détail : [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting).

---

## Et tes données, dans tout ça

- Elles vivent dans **ta** feuille, dans **ton** Drive, et dans le stockage local
  de ton navigateur. Nulle part ailleurs.
- Il n'y a **pas de serveur** dans ce projet. Le navigateur parle directement à
  Google ; rien n'est relayé.
- Le jeton d'accès reste **en mémoire**, jamais sur disque.
- Tu peux révoquer l'accès à tout moment depuis
  [tes autorisations Google](https://myaccount.google.com/permissions), sans rien
  perdre : la feuille reste la tienne.
