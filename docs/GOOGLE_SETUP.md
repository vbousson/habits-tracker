# Connecter Habits Tracker à ton Google Drive

Ce guide te fait créer, en une quinzaine de minutes et une seule fois, l’**identifiant client OAuth**
dont l’application a besoin pour écrire dans *ta* feuille de calcul.

Aucune connaissance technique n’est nécessaire : il n’y a rien à installer et rien à programmer,
uniquement des cases à cocher dans la console Google.

---

## À lire avant de commencer

**L’identifiant client n’est pas un secret.** Dans une application web qui tourne entièrement dans le
navigateur, cet identifiant est public par construction : il est visible dans le code de la page, et
c’est normal. Google le protège autrement — par la liste des **origines JavaScript autorisées**
(étape 4), qui fait qu’un identifiant volé ne sert à rien depuis un autre site.

**Tu n’auras jamais besoin d’un « client secret ».** Si un tutoriel te demande d’en copier un, c’est
qu’il décrit une application avec serveur : ce n’est pas notre cas. N’en colle jamais dans
l’application ni dans un dépôt public.

**Ce que l’application peut voir.** L’autorisation demandée est
`https://www.googleapis.com/auth/drive.file`, la plus restreinte possible : elle donne accès
**uniquement aux fichiers que l’application a elle-même créés**. Le reste de ton Drive lui est
invisible. C’est aussi pour cette raison que l’application doit créer la feuille de calcul elle-même
(voir le [dépannage](#6-dépannage), erreur 404).

---

## 1. Créer un projet Google Cloud

1. Ouvre <https://console.cloud.google.com/> et connecte-toi avec le compte Google **qui contiendra
   la feuille de calcul**.
2. En haut de la page, à droite du logo « Google Cloud », clique sur le **sélecteur de projet**
   (il affiche « Sélectionner un projet » ou le nom d’un projet existant).
3. Dans la fenêtre qui s’ouvre, clique sur **Nouveau projet** (en haut à droite).
4. **Nom du projet** : `habits-tracker` (le nom n’a aucune importance technique).
   Laisse **Emplacement** sur *Aucune organisation*.
5. Clique sur **Créer**, puis attends quelques secondes.
6. Reviens sur le sélecteur de projet et **sélectionne `habits-tracker`**.
   Vérifie qu’il est bien affiché en haut de la page : toutes les étapes suivantes s’appliquent au
   projet sélectionné.

---

## 2. Activer les deux API nécessaires

Il en faut deux : l’API Sheets pour lire et écrire les cellules, l’API Drive pour créer le fichier.

1. Dans le menu ☰ (en haut à gauche), va dans **API et services** → **Bibliothèque**.
2. Cherche `Google Sheets API`, clique sur le résultat, puis sur **Activer**.
3. Reviens à la **Bibliothèque** (bouton retour du navigateur), cherche `Google Drive API`, clique
   dessus puis sur **Activer**.

> Si tu oublies cette étape, l’application affichera plus tard une erreur *403* disant que l’API
> n’est pas activée.

---

## 3. Configurer l’écran de consentement

C’est la page que Google t’affichera au moment de la connexion (« Habits Tracker souhaite accéder
à… »).

1. Menu ☰ → **API et services** → **Écran de consentement OAuth**
   (dans les versions récentes de la console : **Google Auth Platform** → **Branding**).
2. **Type d’utilisateur** : choisis **Externe**, puis **Créer**.
   *(« Interne » n’existe que pour les comptes Google Workspace d’entreprise.)*
3. Remplis les champs obligatoires :
   - **Nom de l’application** : `Habits Tracker` — c’est ce que tu verras sur l’écran de connexion ;
   - **Adresse e-mail d’assistance utilisateur** : ta propre adresse ;
   - **Coordonnées du développeur** (tout en bas) : ta propre adresse.
   Laisse le reste vide (logo, domaine, liens) : rien n’est obligatoire pour un usage personnel.
4. **Enregistrer et continuer**.
5. Écran **Champs d’application** (*Scopes*) : clique sur **Ajouter ou supprimer des champs
   d’application**, puis, dans le filtre, colle :
   ```
   https://www.googleapis.com/auth/drive.file
   ```
   Coche la ligne correspondante (API *Google Drive API*, description « See, edit, create, and delete
   only the specific Google Drive files you use with this app »), clique sur **Mettre à jour**, puis
   **Enregistrer et continuer**.
6. Écran **Utilisateurs test** : clique sur **Ajouter des utilisateurs**, saisis **ta propre adresse
   Gmail**, valide, puis **Enregistrer et continuer**.

### Ce que veut dire le mode « Test »

Ton application reste en état **Testing** (Test), et **c’est le bon choix pour un usage personnel** :

- ✅ Elle fonctionne immédiatement, sans validation de Google.
- ✅ Elle est utilisable par les comptes listés comme utilisateurs test (jusqu’à 100).
- ⚠️ Un compte **non listé** reçoit une erreur `403 access_denied` au moment de la connexion.
- ⚠️ Google affiche un écran d’avertissement « Google n’a pas validé cette application ».
  Clique sur **Paramètres avancés** → **Accéder à Habits Tracker (non sécurisé)**. C’est attendu :
  l’« application » non vérifiée, c’est la tienne.
- ⚠️ Historiquement, les jetons d’un projet en mode Test expiraient au bout de 7 jours. Comme cette
  application demande de toute façon un nouveau jeton à chaque session, cela ne change rien pour toi.

**Publier** l’application (bouton *Publier l’application* sur l’écran de consentement) n’est utile
que pour ouvrir l’accès à n’importe qui. Avec le seul champ `drive.file`, qui est **non sensible**,
la publication ne déclenche pas de procédure de vérification lourde — mais elle n’apporte rien pour
un usage personnel. Reste en mode Test.

---

## 4. Créer l’identifiant client OAuth

1. Menu ☰ → **API et services** → **Identifiants**.
2. Clique sur **+ Créer des identifiants** → **ID client OAuth**.
3. **Type d’application** : **Application Web**. *(Ne choisis surtout pas « Application de bureau »
   ni « Android/iOS » : le flux du navigateur ne fonctionnerait pas.)*
4. **Nom** : `Habits Tracker (web)`.
5. **Origines JavaScript autorisées** — **c’est l’étape que tout le monde rate.**
   Clique sur **+ Ajouter un URI** et saisis, une entrée par ligne :

   | Pour… | Valeur exacte à saisir |
   | --- | --- |
   | le développement local (`npm run dev`) | `http://localhost:5173` |
   | ton déploiement GitHub Pages | `https://TON-COMPTE.github.io` |

   Règles à respecter à la lettre :
   - une origine, c’est **le protocole + le nom d’hôte (+ le port)**, et **rien d’autre** ;
   - **pas de barre oblique finale** : `https://moi.github.io`, jamais `https://moi.github.io/` ;
   - **pas de chemin** : même si ton application est publiée sur
     `https://moi.github.io/habits-tracker/`, l’origine à déclarer reste
     `https://moi.github.io` — le sous-chemin `/habits-tracker/` ne s’écrit **pas** ici ;
   - `localhost` s’écrit bien en `http://` (pas `https://`) et avec son port `5173`. Si tu changes
     de port, ajoute la nouvelle origine.

6. **URI de redirection autorisés** : laisse **vide**. L’application utilise le flux par jeton de
   Google Identity Services, qui ne redirige pas.
7. **Créer**. Google affiche l’**ID client**, de la forme :
   ```
   123456789012-abcdefghijklmnopqrstuvwx.apps.googleusercontent.com
   ```
   Copie-le. (Tu pourras toujours le retrouver plus tard dans **Identifiants**.)
   Ignore le « Code secret du client » affiché à côté : il ne sert pas ici.

---

## 5. Donner l’identifiant à l’application

Deux possibilités, au choix.

### a. Le coller dans l’application (le plus simple)

Ouvre Habits Tracker → **Réglages** → *Stockage des données* : **Google Sheets** →
*Connexion Google* → colle l’identifiant dans **Identifiant client OAuth** → **Enregistrer** →
**Se connecter**.

L’identifiant est mémorisé dans ce navigateur. Il faudra le recoller sur un autre appareil.

### b. Le figer au moment du build (pour ton propre déploiement)

Définis la variable d’environnement `VITE_GOOGLE_CLIENT_ID` : l’application la pré-remplit et il n’y
a plus rien à coller, sur aucun appareil.

En local, crée un fichier `.env.local` à la racine du dépôt :

```dotenv
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwx.apps.googleusercontent.com
```

Pour GitHub Pages, ajoute-le comme secret de dépôt
(**Settings** → **Secrets and variables** → **Actions** → **New repository secret**, nom
`VITE_GOOGLE_CLIENT_ID`), puis expose-le à l’étape de build du workflow :

```yaml
      - run: npm run build
        env:
          VITE_GOOGLE_CLIENT_ID: ${{ secrets.VITE_GOOGLE_CLIENT_ID }}
          BASE_PATH: /habits-tracker/
```

> Rappel : ce n’est pas un secret au sens cryptographique — il se retrouvera dans le JavaScript
> publié. Le stocker en secret GitHub évite simplement de le versionner, ce qui est une bonne
> hygiène, pas une protection.

---

## 6. Dépannage

| Ce que tu vois | Ce qui se passe | Comment corriger |
| --- | --- | --- |
| `Error 400: origin_mismatch` / `redirect_uri_mismatch` | L’adresse depuis laquelle tu ouvres l’application n’est pas dans les **origines JavaScript autorisées**. | Étape 4.5. Compare caractère par caractère avec la barre d’adresse : `http` vs `https`, port, pas de `/` final, **pas de chemin**. Un changement peut mettre quelques minutes à se propager. |
| `idpiframe_initialization_failed` | Vestige de l’ancienne bibliothèque `gapi.auth2`, ou cookies tiers bloqués. | Cette application utilise Google Identity Services et non `gapi`. Vérifie qu’aucune extension ne bloque `accounts.google.com`, et essaie en navigation normale (pas privée). |
| « La fenêtre Google n’a pas pu s’ouvrir » | Le navigateur a bloqué la pop-up. | Autorise les pop-ups pour ce site, puis relance depuis **Réglages → Se connecter**. La connexion doit toujours partir d’un clic. |
| `403 access_denied` juste après avoir choisi ton compte | Ton compte n’est pas **utilisateur test** du projet. | Étape 3.6 : ajoute l’adresse exacte du compte utilisé, puis réessaie. |
| Écran « Google n’a pas validé cette application » | Mode Test, comportement normal. | **Paramètres avancés** → **Accéder à Habits Tracker (non sécurisé)**. |
| `403` mentionnant que l’API n’est pas activée | L’API Sheets ou Drive n’est pas activée sur le projet. | Étape 2, et vérifie que le bon projet est sélectionné en haut de la console. |
| **`404` après avoir collé un identifiant de feuille** | L’application n’a le droit de voir que **les fichiers qu’elle a créés** (`drive.file`). Une feuille créée à la main dans Drive lui est invisible — Google répond 404 même si le fichier t’appartient. | Utilise **Réglages → Créer ma feuille de calcul**. Pour récupérer d’anciennes données, copie-colle les lignes depuis ton ancienne feuille vers la nouvelle, onglet par onglet. |
| « Session Google expirée » au bout d’un moment | Les jetons durent environ une heure. Le renouvellement silencieux échoue si tu t’es déconnecté de Google ou si les cookies tiers sont bloqués. | Clique sur **Se connecter** dans Réglages. |
| Quota / `429` | Trop de requêtes en peu de temps. | Attends une minute. Les limites Google (60 écritures/minute/utilisateur) sont très au-dessus d’un usage normal. |

---

## Révoquer l’accès

Le bouton **Se déconnecter** de l’application oublie simplement le jeton sur cet appareil.
Pour retirer complètement l’autorisation donnée à l’application, va sur
<https://myaccount.google.com/permissions> et supprime *Habits Tracker*.
Ta feuille de calcul, elle, reste dans ton Drive : elle t’appartient.
