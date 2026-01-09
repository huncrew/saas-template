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
    "https://oasify.ai",
    "https://www.oasify.ai",
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
  # Claude Opus 4.5 inference profile - required for cross-region routing
  default     = "us.anthropic.claude-opus-4-5-20251101-v1:0"
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

variable "factory_artifacts_bucket_name" {
  description = "Optional name for the Factory artifacts bucket. If empty, a default is generated."
  type        = string
  default     = ""
}

variable "factory_preview_bucket_name" {
  description = "Optional name for the Factory preview hosting bucket. If empty, a default is generated."
  type        = string
  default     = ""
}

variable "factory_orchestrator_desired_count" {
  description = "Desired number of orchestrator tasks."
  type        = number
  default     = 1
}

variable "factory_orchestrator_image" {
  description = "Full image URI for the orchestrator container. If empty, uses the created ECR repo with :latest."
  type        = string
  default     = ""
}

variable "factory_codebuild_enabled" {
  description = "When true, provisions CodeBuild projects for preview/deploy pipelines."
  type        = bool
  default     = true
}

variable "factory_orchestrator_build_enabled" {
  description = "When true, provisions a CodeBuild project that builds and pushes the orchestrator container image to ECR."
  type        = bool
  default     = true
}

variable "factory_orchestrator_source_key" {
  description = "S3 key (in the artifacts bucket) for a zipped orchestrator source archive used by CodeBuild."
  type        = string
  default     = "orchestrator/source.zip"
}

variable "factory_frontend_desired_count" {
  description = "Desired number of Factory frontend tasks."
  type        = number
  default     = 1
}

variable "factory_frontend_image" {
  description = "Full image URI for the frontend container. If empty, uses the created ECR repo with :latest."
  type        = string
  default     = ""
}

variable "factory_frontend_build_enabled" {
  description = "When true, provisions a CodeBuild project that builds and pushes the frontend container image to ECR."
  type        = bool
  default     = true
}

variable "factory_frontend_source_key" {
  description = "S3 key (in the artifacts bucket) for a zipped frontend source archive used by CodeBuild."
  type        = string
  default     = "frontend/source.zip"
}

variable "factory_template_source_key" {
  description = "S3 key (in the artifacts bucket) for the project template zip used by preview/deploy builds."
  type        = string
  default     = "templates/base-skeleton.zip"
}

variable "factory_domain_name" {
  description = "Primary domain name for the Factory frontend (apex)."
  type        = string
  default     = "oasify.ai"
}

variable "factory_enable_www" {
  description = "When true, also serve www.<domain> from the Factory frontend."
  type        = bool
  default     = true
}

variable "factory_orchestrator_subdomain" {
  description = "Subdomain prefix for the orchestrator (e.g. 'orchestrator' => orchestrator.<domain>)."
  type        = string
  default     = "orchestrator"
}

variable "factory_temp_frontend_subdomain" {
  description = "Temporary subdomain for the new Factory frontend during cutover (e.g. 'builder' => builder.<domain>)."
  type        = string
  default     = "builder"
}

variable "factory_cutover_enabled" {
  description = "When true, points apex/www to the ALB (replaces current site). Keep false until frontend is healthy."
  type        = bool
  default     = false
}

variable "factory_hosted_zone_id" {
  description = "Optional Route53 hosted zone ID for the domain. If empty, Terraform looks up by name."
  type        = string
  default     = ""
}

variable "clerk_publishable_key" {
  description = "Clerk publishable key (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) for the frontend."
  type        = string
  default     = ""
}

variable "clerk_secret_key" {
  description = "Clerk secret key (CLERK_SECRET_KEY) for the frontend."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_api_key_ssm_arn" {
  description = "Optional SSM Parameter ARN (SecureString) that stores OPENAI_API_KEY. If set, it will be injected into the frontend ECS task as a secret."
  type        = string
  default     = ""
}

variable "openai_api_key_ssm_name" {
  description = "Optional SSM parameter name (SecureString) for OPENAI_API_KEY. If set, it can be injected into CodeBuild as a PARAMETER_STORE env var."
  type        = string
  default     = ""
}

variable "factory_vpc_id" {
  description = "Optional existing VPC ID to deploy the Factory orchestrator into. If empty, Terraform creates a dedicated VPC."
  type        = string
  default     = ""
}

variable "factory_subnet_ids" {
  description = "Optional existing subnet IDs (typically public) for ALB/ECS. If empty, Terraform uses the created VPC subnets."
  type        = list(string)
  default     = []
}
