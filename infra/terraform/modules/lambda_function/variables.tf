variable "function_name" {
  description = "Name of the Lambda function."
  type        = string
}

variable "description" {
  description = "Description of the Lambda function."
  type        = string
  default     = ""
}

variable "handler" {
  description = "Lambda handler entrypoint."
  type        = string
}

variable "runtime" {
  description = "Lambda runtime."
  type        = string
  default     = "python3.11"
}

variable "package_path" {
  description = "Path to the Lambda deployment package zip."
  type        = string
}

variable "timeout" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 15
}

variable "memory_size" {
  description = "Lambda memory in MB."
  type        = number
  default     = 512
}

variable "environment" {
  description = "Environment variables for the function."
  type        = map(string)
  default     = {}
}

variable "policy_statements" {
  description = "IAM policy statements attached to the Lambda role."
  type = list(object({
    sid       = optional(string)
    actions   = list(string)
    resources = list(string)
    effect    = optional(string, "Allow")
    condition = optional(map(any))
  }))
  default = []
}

variable "layers" {
  description = "List of Lambda layer ARNs."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Additional tags for Lambda function resources."
  type        = map(string)
  default     = {}
}

variable "publish" {
  description = "Publish a new version on update."
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "Retention for the CloudWatch log group."
  type        = number
  default     = 30
}

variable "architectures" {
  description = "Lambda function architectures."
  type        = list(string)
  default     = ["x86_64"]
}
