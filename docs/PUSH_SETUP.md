# Mettre en place les rappels push

Comment déployer le service de rappel, le brancher sur l'application, et vérifier
qu'il marche — sans attendre 07:20.

Le raisonnement derrière tout ça est dans
[`adr/0002-reminders.md`](adr/0002-reminders.md), et en particulier son
**Amendement (2026-09)**. Le Terraform est décrit côté technique dans
[`../infra/README.md`](../infra/README.md). Ce document-ci est la procédure.

---

## 0. « Comment je m'assure que je suis le seul à pouvoir me connecter ? »

C'est la vraie question, alors elle passe avant la procédure. La réponse tient en
deux couches, et **la première est déjà en place aujourd'hui**.

### Couche 1 — L'écran de consentement OAuth reste en « Test »

Dans Google Cloud Console, `APIs & Services` → `OAuth consent screen`, l'état de
publication est **Testing**, et la liste `Test users` contient **une seule
adresse : la tienne**.

Conséquence : **Google refuse tout autre compte avant que l'application ne voie
quoi que ce soit.** Quelqu'un qui ouvre le site, colle ton identifiant client et
clique sur « Se connecter » reçoit `access_denied` de Google directement. Aucune
requête n'atteint ta feuille de calcul, aucune ne touche le service de rappel.

C'est le vrai verrou. Il ne coûte rien, il n'y a rien à écrire, et **c'est déjà
la configuration actuelle**. La seule chose à ne pas faire est de cliquer sur
« Publish app » : ça ouvrirait la connexion à n'importe quel compte Google.

> Note : un projet OAuth en mode Test expire ses jetons de rafraîchissement au
> bout de 7 jours. Sans objet ici — l'application n'utilise que des jetons
> d'accès d'une heure, obtenus dans une popup (voir `src/lib/googleAuth.ts`).

### Couche 2 — L'API vérifie l'e-mail **et** l'audience du jeton

À chaque appel de `/state`, le service :

1. envoie le jeton d'accès reçu à `https://oauth2.googleapis.com/tokeninfo` —
   Google valide la signature et renvoie les revendications ;
2. exige que `email` soit **exactement** l'adresse autorisée
   (`allowed_email` dans Terraform) ;
3. exige que `aud` soit **exactement** l'identifiant client OAuth de
   l'application (`oauth_client_id`).

Le point 3 est celui qu'on oublie et qui coûte cher. Sans lui, un jeton Google
valide **émis pour une toute autre application** — n'importe quel site où tu t'es
connecté avec Google — pourrait être rejoué ici pour écrire l'état du service.
Avec lui, le jeton est lié à cette application-ci.

Et `/tick` n'accepte que le jeton OIDC de Cloud Scheduler : bon émetteur, bonne
audience, bon compte de service. Tout le reste reçoit un 403.

### Ce que ça ne fait **pas**

**Le site statique reste lisible par tout le monde.** GitHub Pages sert
`index.html` et le bundle JavaScript à qui les demande, et il n'y a aucun moyen
de mettre un mot de passe devant sans quitter GitHub Pages.

C'est sans conséquence : **le site ne contient aucune donnée**. Pas une réponse,
pas une note, pas un identifiant de feuille de calcul, pas un secret. Un visiteur
voit une application vide qui lui demande de se connecter à Google, et Google lui
dit non (couche 1). L'identifiant client OAuth, lui, est public par nature dans
une application web — ce n'est pas un secret, et il ne sert à rien sans un compte
autorisé.

Autrement dit : **la page est publique, les données ne le sont pas.**

---

## 1. Ce qu'il faut avoir sous la main

- Un projet GCP avec un compte de facturation attaché (le coût réel est en §9,
  il est nul, mais GCP exige la facturation pour Cloud Run).
- `gcloud` connecté à ce projet, et `terraform` ≥ 1.5.
- Node ≥ 20, uniquement pour générer les clés VAPID.
- L'identifiant client OAuth de l'application (le même que
  `VITE_GOOGLE_CLIENT_ID`).

---

## 2. Générer la paire de clés VAPID

```sh
npx web-push generate-vapid-keys
```

Sortie :

```
Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFZzXbLDLZfj...

Private Key:
UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls
```

- **La clé publique n'est pas un secret.** Elle part dans le bundle du navigateur
  (`VITE_VAPID_PUBLIC_KEY`) et dans `terraform.tfvars`.
- **La clé privée ne doit jamais entrer dans Terraform.** Elle est ajoutée à la
  main dans Secret Manager à l'étape 5.
- **Ne la perds pas.** Régénérer la paire invalide tous les abonnements
  existants : il faudra réactiver les notifications sur chaque appareil.

---

## 3. Remplir les variables Terraform

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars
```

| Variable | Valeur | Où la trouver |
| --- | --- | --- |
| `project_id` | ton projet GCP | `gcloud config get project` |
| `region` | `europe-west1` | au choix, garde la même partout |
| `app_origin` | `https://<compte>.github.io` | **sans slash final**, sinon CORS échoue |
| `allowed_email` | ton adresse Google | la seule autorisée à écrire |
| `oauth_client_id` | `…apps.googleusercontent.com` | identique à `VITE_GOOGLE_CLIENT_ID` |
| `vapid_public_key` | la clé publique de l'étape 2 | |
| `vapid_subject` | `mailto:ton@adresse` | exigé par la RFC 8292 |
| `image` | à remplir à l'étape 6 | |

`terraform.tfvars` est dans `.gitignore` : il contient une vraie adresse et un
vrai identifiant client.

---

## 4. Premier passage : les fondations

L'image ne peut pas être poussée avant qu'Artifact Registry existe, et le service
ne peut pas démarrer sans image. Le premier déploiement se fait donc en deux
temps ; tous les suivants sont un simple `terraform apply`.

```sh
terraform init

terraform apply \
  -target=google_project_service.apis \
  -target=google_storage_bucket.state \
  -target=google_secret_manager_secret.vapid_private \
  -target=google_service_account.service \
  -target=google_service_account.scheduler \
  -target=google_artifact_registry_repository.images
```

---

## 5. Déposer la clé privée dans Secret Manager

À la main, pour qu'elle n'apparaisse jamais dans l'état Terraform :

```sh
printf %s 'LA_CLE_PRIVEE' | gcloud secrets versions add \
  myhabits-reminders-vapid-private \
  --project=TON_PROJET \
  --data-file=-
```

`printf` plutôt que `echo` : `echo` ajoute un saut de ligne, que `web-push`
refusera ensuite comme clé invalide.

---

## 6. Construire et pousser l'image

```sh
gcloud builds submit ../server \
  --project=TON_PROJET \
  --tag=europe-west1-docker.pkg.dev/TON_PROJET/myhabits-reminders/service:$(date +%Y-%m-%d)
```

Reporte l'URL complète (avec le tag) dans `image` dans `terraform.tfvars`.

---

## 7. Deuxième passage : le service et le cron

```sh
terraform plan
terraform apply

terraform output push_api_url       # → VITE_PUSH_API_URL
terraform output vapid_public_key   # → VITE_VAPID_PUBLIC_KEY
```

### Brancher les deux valeurs sur la compilation GitHub Actions

1. Dépôt GitHub → `Settings` → `Secrets and variables` → `Actions` →
   `New repository secret`. Créer :
   - `VITE_PUSH_API_URL` = la sortie `push_api_url`
     (`https://myhabits-reminders-….run.app`, **sans slash final**)
   - `VITE_VAPID_PUBLIC_KEY` = la clé publique
2. Dans `.github/workflows/deploy.yml`, ajouter les deux lignes dans le bloc
   `env:` de l'étape `Build`, à côté de `VITE_GOOGLE_CLIENT_ID` :

   ```yaml
           VITE_PUSH_API_URL: ${{ secrets.VITE_PUSH_API_URL }}
           VITE_VAPID_PUBLIC_KEY: ${{ secrets.VITE_VAPID_PUBLIC_KEY }}
   ```

   Ce ne sont pas des secrets au sens strict — les deux finissent dans le bundle
   public. Ils passent par `secrets` uniquement pour ne pas figer une URL de
   déploiement dans le dépôt.
3. Pousser sur `main` pour relancer la compilation.

### Activer dans l'application

1. Ouvrir l'application. **Sur iPhone ou iPad : d'abord l'installer** — menu
   Partager → « Sur l'écran d'accueil » — puis la rouvrir depuis l'icône. Sans
   ça, `Notification` n'existe même pas dans Safari et l'écran Réglages le dira.
2. Réglages → Connexion Google → **Se connecter**. Le consentement réapparaît
   une fois : la portée demandée a été élargie à `openid email`, pour que le
   service puisse vérifier qui appelle. Les deux restent des portées non
   sensibles.
3. Réglages → Rappels → **Activer les notifications**. Le navigateur demande
   l'autorisation, l'abonnement part vers le service.

---

## 8. Tester tout de suite, sans attendre 07:20

Trois façons, de la plus rapide à la plus complète.

### a) Régler une heure dans deux minutes

Dans Réglages → Rappels, mets « Le soir » à l'heure qu'il sera dans 2–3 minutes,
attends le prochain tick (le cron passe toutes les 5 minutes), puis remets
`21:30`. C'est le test de bout en bout : cron → OIDC → décision → push →
service worker → notification.

Attention : le rappel du soir n'est envoyé que si la journée n'est **pas**
remplie. Si tu viens de remplir aujourd'hui, il ne se passera rien — et c'est le
comportement correct.

### b) Déclencher un tick à la main

```sh
curl -X POST "$(terraform -chdir=infra output -raw push_api_url)/tick" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token \
       --audiences=https://myhabits-reminders.invalid/tick)"
```

Ça renverra **403** : ton jeton personnel n'est pas celui du compte de service du
scheduler, et c'est exactement ce qu'on veut vérifier. Pour un vrai tick, force
le job :

```sh
gcloud scheduler jobs run myhabits-reminders-tick \
  --location=europe-west1 --project=TON_PROJET
```

### c) Lire l'état et les journaux

```sh
gcloud storage cat gs://$(terraform -chdir=infra output -raw state_bucket)/state.json

gcloud run services logs read myhabits-reminders \
  --region=europe-west1 --project=TON_PROJET --limit=20
```

Les journaux disent `tick: nothing warranted`, `tick: sent evening for
2026-09-06`, ou `state: updated (…)`. **Ils ne contiennent jamais le contenu du
message ni l'endpoint d'abonnement** : le premier est une donnée de santé, le
second est un identifiant suffisant pour envoyer un push à ton téléphone.

---

## 9. Le coût réel

Toutes les valeurs sont mensuelles, pour un utilisateur, avec le cron à `*/5`
(8 640 ticks par mois).

| Ressource | Consommation | Palier gratuit | Coût |
| --- | --- | --- | --- |
| Cloud Scheduler | 1 job | 3 jobs / compte de facturation | **0 €** |
| Cloud Run — vCPU | ~8 640 vCPU-s | 180 000 vCPU-s | **0 €** |
| Cloud Run — mémoire | ~2 160 GiB-s | 360 000 GiB-s | **0 €** |
| Cloud Run — requêtes | ~8 700 | 2 000 000 | **0 €** |
| Cloud Storage | 1 objet, quelques Ko | 5 Go (US uniquement) | **~0 €** |
| Opérations Storage | ~9 000 lectures classe B | 50 000 classe B | **0 €** |
| Secret Manager — versions | 1 active | 6 actives | **0 €** |
| **Secret Manager — accès** | **~2 accès** (au démarrage d'instance, pas par requête) | 10 000 | **0 €** |
| Artifact Registry | ~80 Mo | 0,5 Go | **0 €** |
| Cloud Logging | quelques Mo | 50 Gio | **0 €** |
| Sortie réseau (2 pushs/jour) | ~120 Ko | — | **0 €** |
| **Total** | | | **≈ 0 €/mois** |

Deux honnêtetés sur ce tableau : les paliers « toujours gratuits » de Cloud
Storage sont limités aux régions américaines, donc en `europe-west1` les ~8 640
lectures mensuelles de `state.json` sont facturées — à environ **0,004 $ pour
10 000 opérations**, soit trois millièmes d'euro par mois. Et les tarifs Cloud
Run cités sont ceux de la facturation à la requête, qui est le mode par défaut
d'un service (et non d'un job, dont l'ADR cite les paliers plus élevés).

**La ligne à ne pas casser est celle de Secret Manager.** La clé VAPID est montée
comme **variable d'environnement** par Cloud Run, donc résolue une fois au
démarrage de l'instance. Si on la lisait par requête, ce serait 8 640 accès par
mois — encore sous le palier, mais avec le second secret d'un futur besoin, on le
dépasse et on commence à payer pour rien. Ne change pas ce montage.

**Le vrai coût n'est pas en euros** : un projet GCP à garder facturé, une image à
reconstruire quand sa base prend un CVE, une clé VAPID à ne pas perdre, et une
panne silencieuse possible. Une à deux heures par an.

---

## 10. Dépannage

| Symptôme | Cause probable | Quoi faire |
| --- | --- | --- |
| Réglages affiche « Les notifications sont bloquées pour ce site » | Permission refusée une fois ; le navigateur ne redemande plus | Chrome : cadenas dans la barre d'adresse → Notifications → Autoriser. Android : Paramètres → Applications → navigateur → Notifications. Puis réactiver dans l'application. |
| Sur iPhone : « l'application doit être installée sur l'écran d'accueil » | Web Push n'existe pas dans un onglet Safari, `Notification` y est `undefined` | Partager → « Sur l'écran d'accueil », rouvrir **depuis l'icône**, réactiver. Désinstaller l'icône détruit l'abonnement. |
| Les rappels marchaient, puis plus rien | Abonnement expiré ou tourné par le navigateur | Les journaux montrent `subscription gone (HTTP 410), dropped`. Réglages affiche « Non activées » : réactiver, c'est tout. |
| `tick: rejected, not the scheduler` dans les journaux | Le jeton OIDC ne correspond pas | Vérifier que `oidc_token.audience` du job et `OIDC_AUDIENCE` du service ont la même valeur (`local.oidc_audience` dans `main.tf` — les deux la lisent), et que `SCHEDULER_SA_EMAIL` est bien l'e-mail du compte de service du cron. Après un changement, `terraform apply` redéploie les deux. |
| Erreur CORS dans la console du navigateur | `app_origin` ne correspond pas exactement | Scheme compris, **sans slash final**, sans chemin. `https://compte.github.io`, pas `https://compte.github.io/habits-tracker/`. Corriger la variable et `terraform apply`. |
| L'activation renvoie « Le service de rappel a refusé ce compte Google » | `allowed_email` ou `oauth_client_id` faux, ou portée `email` absente du jeton | Vérifier les deux variables. Puis se déconnecter / reconnecter dans l'application : un jeton obtenu avant l'élargissement de portée ne porte pas d'e-mail. |
| `Received unexpected response code` au push | Clé VAPID privée mal déposée (saut de ligne) | Redéposer avec `printf %s`, puis redémarrer le service (`terraform apply` après un changement, ou déployer une nouvelle révision). |
| Rien ne part, journaux muets | Le cron ne tourne pas | `gcloud scheduler jobs describe myhabits-reminders-tick --location=europe-west1` — regarder `lastAttemptTime` et `status`. |
| Deux notifications identiques | Ne devrait pas arriver | Le service enregistre la date du dernier envoi par créneau dans `state.json`. Si ça se produit, c'est que l'écriture de l'état a échoué après l'envoi : chercher `write state: HTTP` dans les journaux. |
