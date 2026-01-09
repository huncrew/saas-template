variable "bucket_name" {
  description = "Name of the S3 bucket."
  type        = string
}

variable "force_destroy" {
  description = "Allow Terraform to delete objects when destroying the bucket."
  type        = bool
  default     = false
}

variable "enable_versioning" {
  description = "Enable bucket versioning."
  type        = bool
  default     = true
}

variable "kms_master_key_id" {
  description = "Optional KMS key for bucket encryption."
  type        = string
  default     = ""
}

variable "block_public_access" {
  description = "When true, block all public access to the bucket."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for the bucket."
  type        = map(string)
  default     = {}
}
