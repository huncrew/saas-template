variable "name" {
  description = "Name of the API Gateway HTTP API."
  type        = string
}

variable "description" {
  description = "Description for the API."
  type        = string
  default     = ""
}

variable "stage_name" {
  description = "Deployment stage name."
  type        = string
}

variable "allowed_origins" {
  description = "Allowed origins for CORS."
  type        = list(string)
}

variable "allowed_methods" {
  description = "Allowed methods for CORS."
  type        = list(string)
  default     = ["GET", "POST", "OPTIONS"]
}

variable "allowed_headers" {
  description = "Allowed headers for CORS."
  type        = list(string)
  default     = ["content-type", "authorization"]
}

variable "allow_credentials" {
  description = "Whether cross-origin requests can include credentials."
  type        = bool
  default     = true
}

variable "access_log_format" {
  description = "Access log format for stage logging."
  type        = string
  # Note: variable defaults cannot call functions in newer Terraform versions.
  default = "{\"requestId\":\"$context.requestId\",\"sourceIp\":\"$context.identity.sourceIp\",\"requestTime\":\"$context.requestTime\",\"httpMethod\":\"$context.httpMethod\",\"path\":\"$context.path\",\"status\":\"$context.status\",\"responseLength\":\"$context.responseLength\",\"integrationError\":\"$context.integrationErrorMessage\"}"
}

variable "tags" {
  description = "Tags applied to API resources."
  type        = map(string)
  default     = {}
}

variable "throttling_rate_limit" {
  description = "Default route throttling rate limit (requests per second) for the HTTP API stage."
  type        = number
  default     = 25
}

variable "throttling_burst_limit" {
  description = "Default route throttling burst limit for the HTTP API stage."
  type        = number
  default     = 50
}
