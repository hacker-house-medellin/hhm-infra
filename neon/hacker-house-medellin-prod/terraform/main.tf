terraform {
  required_version = ">= 1.12.0, < 2.0.0"

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "= 0.15.0"
    }
  }
}

provider "neon" {} # NEON_API_KEY comes from ores-sops at reviewed plan/apply time; never commit it.

resource "neon_project" "prod" {
  name                     = "hacker-house-medellin-prod"
  org_id                   = var.neon_org_id
  region_id                = "aws-us-east-2"
  default_branch_protected = true

  branch {
    name          = "production"
    database_name = "canonical"
    role_name     = "hacker_house_medellin_app"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "neon_role" "auth" {
  project_id = neon_project.prod.id
  branch_id  = neon_project.prod.default_branch_id
  name       = "hacker_house_medellin_auth"
}

resource "neon_database" "auth" {
  project_id = neon_project.prod.id
  branch_id  = neon_project.prod.default_branch_id
  name       = "auth"
  owner_name = neon_role.auth.name
}
