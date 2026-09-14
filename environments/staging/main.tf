terraform {
  required_version = ">= 1.16.0, < 2.0.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.24.0, < 6.0.0"
    }
  }
  backend "s3" {}
}

provider "cloudflare" {}

variable "cloudflare_account_id" {
  type    = string
  default = ""
}

variable "enable_cloudflare_worker" {
  type    = bool
  default = false
}

locals {
  environment = "staging"
  project     = "hhm"
  worker_name = "${local.project}-coordinator-${local.environment}"
}

module "cloudflare_worker_shell" {
  source       = "../../modules/cloudflare/terraform/worker-shell"
  enabled      = var.enable_cloudflare_worker
  account_id   = var.cloudflare_account_id
  worker_name  = local.worker_name
  workers_dev  = false
  preview_urls = false
  tags = [
    "managed-by:terraform",
    "project:${local.project}",
    "environment:${local.environment}",
  ]
}
