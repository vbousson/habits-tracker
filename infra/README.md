# `infra/` — the reminder infrastructure

Terraform for the Cloud Run service in [`../server/`](../server/). The
user-facing, French, click-by-click version of all this is
[`../docs/PUSH_SETUP.md`](../docs/PUSH_SETUP.md); this file is the reference for
the Terraform itself.

## What it creates

| Resource | Why |
| --- | --- |
| `google_storage_bucket.state` | One object, `state.json`. Uniform access, public access prevented, versioning on, old versions expired. |
| `google_secret_manager_secret.vapid_private` | The VAPID private key. **Terraform creates the secret, never a version** — the key is added by hand so it stays out of state. |
| `google_service_account.service` | The service's identity. Holds `storage.objectAdmin` on that one bucket and `secretmanager.secretAccessor` on that one secret. Nothing else. |
| `google_service_account.scheduler` | The cron's identity. Its only power is minting an OIDC token the service recognises. |
| `google_artifact_registry_repository.images` | Where the container image lives. |
| `google_cloud_run_v2_service.service` | Scale to zero, 1 vCPU / 256 MiB, CPU throttled between requests. |
| `google_cloud_run_v2_service_iam_member.public` | `allUsers` invoker — see the note below. |
| `google_cloud_scheduler_job.tick` | `*/5 * * * *`, OIDC, one retry. |

## The `allUsers` note, read it once

The service **is** invokable by anyone at the network level. It has to be:
`/state` is called from the browser, and a browser holds no Google-signed Cloud
Run identity token. IAM is per-service, not per-path, so there is no way to make
`/tick` private and `/state` public in the same service.

Both routes therefore authenticate **in the application**:

- `/tick` verifies the incoming OIDC token's issuer, its audience
  (`local.oidc_audience`) and its `email` claim against the scheduler service
  account. Anything else gets a 403 and does nothing.
- `/state` verifies the caller's Google access token against Google's
  `tokeninfo`, and requires **both** `email == allowed_email` **and**
  `aud == oauth_client_id`.

## Sequence

Terraform cannot create the Cloud Run service before an image exists, and the
image cannot be pushed before Artifact Registry exists. So the first apply is
in two steps; every later one is a single `apply`.

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars   # then fill it in

# 1. Generate the VAPID keypair (needs Node; nothing is installed permanently).
npx web-push generate-vapid-keys
#    -> put the PUBLIC key in terraform.tfvars as vapid_public_key
#    -> keep the PRIVATE key in the clipboard for step 3

terraform init

# 2. First pass: APIs, bucket, secret, identities, registry — everything the
#    image and the service depend on.
terraform apply \
  -target=google_project_service.apis \
  -target=google_storage_bucket.state \
  -target=google_secret_manager_secret.vapid_private \
  -target=google_service_account.service \
  -target=google_service_account.scheduler \
  -target=google_artifact_registry_repository.images

# 3. The private key, by hand, so it never touches Terraform state.
printf %s 'THE_PRIVATE_KEY' | gcloud secrets versions add \
  myhabits-reminders-vapid-private --project=PROJECT_ID --data-file=-

# 4. Build and push the image, then record its tag in terraform.tfvars.
gcloud builds submit ../server \
  --project=PROJECT_ID \
  --tag=europe-west1-docker.pkg.dev/PROJECT_ID/myhabits-reminders/service:$(date +%Y-%m-%d)

# 5. Everything else.
terraform plan
terraform apply

terraform output push_api_url        # -> VITE_PUSH_API_URL
terraform output vapid_public_key    # -> VITE_VAPID_PUBLIC_KEY
```

Redeploying a code change afterwards is step 4 with a new tag, then
`terraform apply -var="image=...:NEW_TAG"`.

## State

The backend is local by default, which is right for one operator on one machine.
`terraform.tfstate`, `.terraform/` and `terraform.tfvars` are gitignored. If the
state is ever worth protecting from a dead laptop, add a `backend "gcs"` block
pointing at a *second* bucket — never `google_storage_bucket.state`, which
Terraform manages and would then be deleting under itself.

## What is deliberately not here

- **No database.** One user, one JSON object. Firestore starts being worth its
  weight at the second user, which ADR 0001 already flags as a different product.
- **No monitoring or alerting.** The visible failure mode is "the phone stops
  buzzing", and the Settings screen shows whether the subscription is live. An
  uptime check on a service that is meant to be asleep is noise.
- **No custom domain, no load balancer.** The `run.app` URL is called by exactly
  one browser and one cron.
