terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source = "hashicorp/google"
      # Pinned to a major: a provider that upgrades itself on a Tuesday is how a
      # plan that has not changed suddenly wants to replace a Cloud Run service.
      version = "~> 6.20"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
