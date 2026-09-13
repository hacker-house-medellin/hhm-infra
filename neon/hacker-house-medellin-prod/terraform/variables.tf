variable "neon_org_id" {
  description = "Provider-read Neon organization ID for hacker-house-medellin; never guess it or commit a credential."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^org-[a-z0-9-]+$", var.neon_org_id))
    error_message = "neon_org_id must be a provider-read Neon organization ID beginning with org-."
  }
}
