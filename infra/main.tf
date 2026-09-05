/**
 * MyHabits reminder infrastructure.
 *
 * Nine resources, no database, no VPC, no load balancer. One user means one JSON
 * object in a bucket; a Firestore collection would be pure ceremony until there
 * is a second person, which ADR 0001 flags as a different product anyway.
 */

locals {
  # Two identities, because they are trusted for different things: the service
  # may touch one bucket and one secret, the scheduler may only ring the bell.
  service_sa_name   = "${var.name}-run"
  scheduler_sa_name = "${var.name}-cron"

  # The OIDC audience is an agreed constant, not the service URL.
  #
  # The obvious choice — audience = the Cloud Run URI — cannot be expressed here:
  # the service would need its own URI as an environment variable to verify it,
  # and Terraform would refuse the cycle. The audience's only job is to bind the
  # token to this consumer, and any string does that as long as both ends agree,
  # so both ends read this one line. It is deliberately not resolvable.
  oidc_audience = "https://${var.name}.invalid/tick"
}

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
  ])

  service = each.key
  # Disabling an API on destroy can break unrelated things in a project that is
  # not exclusively this app's.
  disable_on_destroy = false
}

# --- State -------------------------------------------------------------------

# One object, `state.json`. Versioned, because it is the only durable state in
# the system: losing the subscription means re-enabling notifications on the
# phone, and losing `sent` means one duplicate reminder.
resource "google_storage_bucket" "state" {
  name                        = "${var.project_id}-${var.name}-state"
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = var.state_version_retention_days
    }
    action {
      type = "Delete"
    }
  }

  # A stray older version is worth nothing and costs storage forever.
  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Secret ------------------------------------------------------------------

# The VAPID private key. Created OUT OF BAND and added as a version by hand, so
# the key never enters Terraform state — see README.md step 2. Losing it
# invalidates every existing subscription.
resource "google_secret_manager_secret" "vapid_private" {
  secret_id = "${var.name}-vapid-private"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# --- Identities --------------------------------------------------------------

resource "google_service_account" "service" {
  account_id   = local.service_sa_name
  display_name = "MyHabits reminder service"
}

resource "google_service_account" "scheduler" {
  account_id   = local.scheduler_sa_name
  display_name = "MyHabits reminder scheduler"
}

# Scoped to this bucket, not to the project: `objectAdmin` here can read and
# overwrite one JSON file and nothing else in the account.
resource "google_storage_bucket_iam_member" "service_state" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.service.email}"
}

resource "google_secret_manager_secret_iam_member" "service_vapid" {
  secret_id = google_secret_manager_secret.vapid_private.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service.email}"
}

# --- Image registry ----------------------------------------------------------

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = var.name
  format        = "DOCKER"
  description   = "Container image for the MyHabits reminder service."

  depends_on = [google_project_service.apis]
}

# --- The service -------------------------------------------------------------

resource "google_cloud_run_v2_service" "service" {
  name     = var.name
  location = var.region
  # `/state` is called from a browser, which cannot present a Cloud Run identity
  # token, so the ingress cannot be restricted to internal traffic.
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.service.email
    timeout         = "60s"

    scaling {
      # Scale to zero: the service is awake for about a second, 288 times a day.
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
        # Throttle the CPU between requests. There is no background work.
        cpu_idle = true
      }

      env {
        name  = "STATE_BUCKET"
        value = google_storage_bucket.state.name
      }
      env {
        name  = "STATE_OBJECT"
        value = "state.json"
      }
      env {
        name  = "APP_ORIGIN"
        value = var.app_origin
      }
      env {
        name  = "ALLOWED_EMAIL"
        value = var.allowed_email
      }
      env {
        name  = "OAUTH_CLIENT_ID"
        value = var.oauth_client_id
      }
      env {
        name  = "SCHEDULER_SA_EMAIL"
        value = google_service_account.scheduler.email
      }
      # Cloud Scheduler mints its OIDC token for this audience. The service
      # rejects any token whose `aud` is anything else. See `local.oidc_audience`.
      env {
        name  = "OIDC_AUDIENCE"
        value = local.oidc_audience
      }
      env {
        name  = "WINDOW_MINUTES"
        value = tostring(var.window_minutes)
      }
      env {
        name  = "VAPID_SUBJECT"
        value = var.vapid_subject
      }
      env {
        name  = "VAPID_PUBLIC_KEY"
        value = var.vapid_public_key
      }
      # Mounted as an environment variable, resolved once at instance start —
      # NOT read per request. Secret Manager gives 10 000 free access operations
      # a month and the cron alone makes 8 640 ticks.
      env {
        name = "VAPID_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.vapid_private.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.service_vapid,
    google_storage_bucket_iam_member.service_state,
  ]
}

# The browser has no Google identity token, so `/state` must be reachable
# unauthenticated at the network level. Both routes authenticate in the
# application instead: `/state` verifies the caller's Google access token
# (email AND audience), `/tick` verifies the scheduler's OIDC token (issuer,
# audience AND service-account email). See server/index.js.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.service.name
  location = google_cloud_run_v2_service.service.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Belt and braces: if the service is ever locked down, the scheduler keeps
# working without a second debugging session.
resource "google_cloud_run_v2_service_iam_member" "scheduler" {
  name     = google_cloud_run_v2_service.service.name
  location = google_cloud_run_v2_service.service.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# --- The tick ----------------------------------------------------------------

resource "google_cloud_scheduler_job" "tick" {
  name        = "${var.name}-tick"
  region      = var.region
  description = "Wakes the reminder service; it decides whether anything is warranted."
  schedule    = var.schedule
  # UTC: the service resolves the user's own IANA zone from stored state, which
  # is what keeps 21:30 at 21:30 across a DST change.
  time_zone        = "Etc/UTC"
  attempt_deadline = "60s"

  retry_config {
    # One retry. A missed tick is five minutes late, and the `sent` guard in
    # decide.js makes a retry that already succeeded a no-op.
    retry_count = 1
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.service.uri}/tick"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = local.oidc_audience
    }
  }

  depends_on = [google_project_service.apis]
}
