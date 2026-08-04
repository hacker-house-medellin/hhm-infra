terraform {
  required_version = ">= 1.8.0"
  required_providers {
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
}

resource "random_id" "deployment" { byte_length = 8 }

output "deployment_id" {
  value = "hhm-${random_id.deployment.hex}"
}
