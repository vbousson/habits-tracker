variable "project_id" {
  description = "GCP project that owns every resource here."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run, Cloud Scheduler, Artifact Registry and the state bucket."
  type        = string
  default     = "europe-west1"
}

variable "name" {
  description = "Prefix for every resource name, so a second deployment can coexist."
  type        = string
  default     = "myhabits-reminders"
}

variable "app_origin" {
  description = <<-EOT
    Exact origin of the deployed PWA, with scheme and no trailing slash — for
    example https://vbousson.github.io. The service sends it back as the only
    allowed CORS origin, so a typo here shows up as a browser CORS error and
    nothing else.
  EOT
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.app_origin))
    error_message = "app_origin must look like https://host, with no path and no trailing slash."
  }
}

variable "allowed_email" {
  description = "The single Google account allowed to write state. Every other token is refused."
  type        = string
}

variable "oauth_client_id" {
  description = <<-EOT
    The app's OAuth 2.0 web client id (the same VITE_GOOGLE_CLIENT_ID the site is
    built with). The service requires the caller's access token to carry this as
    its audience: checking the email alone would let a token minted for another
    application be replayed here.
  EOT
  type        = string
}

variable "vapid_public_key" {
  description = <<-EOT
    Public half of the VAPID keypair, base64url. Not a secret — it ships in the
    browser bundle as VITE_VAPID_PUBLIC_KEY. The private half never enters
    Terraform: a secret version is added by hand, out of band (see README.md).
  EOT
  type        = string
}

variable "vapid_subject" {
  description = "VAPID contact, as required by RFC 8292. A mailto: or https: URL."
  type        = string

  validation {
    condition     = can(regex("^(mailto:|https://)", var.vapid_subject))
    error_message = "vapid_subject must start with mailto: or https://."
  }
}

variable "image" {
  description = <<-EOT
    Full image reference for the service, e.g.
    europe-west1-docker.pkg.dev/PROJECT/myhabits-reminders/service:2026-09-06.
    Build and push it before the first full apply; see README.md step 4.
  EOT
  type        = string
}

variable "schedule" {
  description = <<-EOT
    Cron for the tick. Five minutes is the precision of every reminder, and
    Cloud Scheduler's free tier is three jobs per billing account, so a tighter
    cron costs nothing but buys nothing either.
  EOT
  type        = string
  default     = "*/5 * * * *"
}

variable "window_minutes" {
  description = "Width of the slot window, in minutes. Must be >= the cron interval or a tick can fall between two windows and skip the reminder entirely."
  type        = number
  default     = 5
}

variable "state_version_retention_days" {
  description = "How long superseded versions of state.json are kept. Versioning is on because the bucket is the only durable state in the system."
  type        = number
  default     = 30
}
