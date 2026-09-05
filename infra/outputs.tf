output "push_api_url" {
  description = "Feed this into the site build as VITE_PUSH_API_URL."
  value       = google_cloud_run_v2_service.service.uri
}

output "vapid_public_key" {
  description = "Feed this into the site build as VITE_VAPID_PUBLIC_KEY. Public by design — it ships in the bundle."
  value       = var.vapid_public_key
}

output "state_bucket" {
  description = "Bucket holding state.json. Read it with `gcloud storage cat` when debugging."
  value       = google_storage_bucket.state.name
}

output "vapid_secret_id" {
  description = "Secret holding the VAPID private key. Add a version by hand; see README.md step 2."
  value       = google_secret_manager_secret.vapid_private.secret_id
}

output "image_repository" {
  description = "Artifact Registry path to push the service image to."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
}

output "scheduler_service_account" {
  description = "The only identity whose OIDC token /tick accepts."
  value       = google_service_account.scheduler.email
}
