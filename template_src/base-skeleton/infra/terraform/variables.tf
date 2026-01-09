variable "project_name" {
  description = "Base name for all resources."
  type        = string
}

variable "stage" {
  description = "Deployment stage (e.g. dev, prod)."
  type        = string
}

variable "region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile to use."
  type        = string
  default     = ""
}

variable "default_tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}

variable "uploads_bucket_name" {
  description = "Name of the S3 bucket used for user uploads."
  type        = string
}

variable "curated_bucket_name" {
  description = "Optional name of the S3 bucket used for curated data."
  type        = string
  default     = ""
}

variable "allowed_origins" {
  description = "List of allowed origins for API CORS configuration."
  type        = list(string)
  default = [
    "http://localhost:3000",
  ]
}

variable "logs_retention_days" {
  description = "Retention for CloudWatch log groups created by this stack."
  type        = number
  default     = 30
}

variable "ssm_path_prefix" {
  description = "Prefix for SSM Parameter Store keys that hold runtime configuration."
  type        = string
  default     = "/saas-template"
}

variable "stripe_secret_key" {
  description = "Stripe secret key stored in Parameter Store."
  type        = string
  default     = "REPLACE_ME"
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret stored in Parameter Store."
  type        = string
  default     = "REPLACE_ME"
  sensitive   = true
}

variable "bedrock_model_id" {
  description = "Default Bedrock model identifier used for AI generation."
  type        = string
  # NOTE: Bedrock model IDs are provider-specific strings. If you want a different
  # Claude Opus variant/version, set this to the exact Bedrock model id you have enabled.
  default     = "anthropic.claude-3-opus-20240229-v1:0"
}

variable "enable_async_queue" {
  description = "When true, provisions SQS queue and DLQ for future async fan-out."
  type        = bool
  default     = false
}

variable "analyse_doc_trigger_enabled" {
  description = "Enable S3 event notifications to the analyse_doc lambda."
  type        = bool
  default     = true
}
