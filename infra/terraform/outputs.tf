output "api_base_url" {
  description = "Base invoke URL for the deployed HTTP API."
  value       = module.http_api.api_endpoint
}

output "uploads_bucket_name" {
  description = "Name of the S3 bucket used for uploads."
  value       = module.uploads_bucket.bucket_name
}

output "curated_bucket_name" {
  description = "Name of the curated data bucket (if created)."
  value       = local.curated_bucket_name
}

output "dynamodb_table_name" {
  description = "Primary DynamoDB table used by the application."
  value       = aws_dynamodb_table.app.name
}

output "factory_projects_table_name" {
  description = "DynamoDB table name for Factory projects."
  value       = aws_dynamodb_table.factory_projects.name
}

output "factory_builds_table_name" {
  description = "DynamoDB table name for Factory builds."
  value       = aws_dynamodb_table.factory_builds.name
}

output "factory_artifacts_bucket_name" {
  description = "S3 bucket used for Factory build artifacts."
  value       = module.factory_artifacts_bucket.bucket_name
}

output "factory_preview_bucket_name" {
  description = "S3 bucket used for Factory static previews."
  value       = module.factory_preview_bucket.bucket_name
}

output "factory_preview_cloudfront_domain" {
  description = "CloudFront domain for Factory previews."
  value       = aws_cloudfront_distribution.factory_preview.domain_name
}

output "factory_orchestrator_base_url" {
  description = "Base URL (HTTPS) for the Factory orchestrator (orchestrator.<domain>)"
  value       = "https://${local.factory_orchestrator_fqdn}"
}

output "factory_frontend_url" {
  description = "Primary URL for the Factory frontend."
  value       = "https://${var.factory_domain_name}"
}

output "factory_frontend_ecr_repository_url" {
  description = "ECR repository URL for the frontend image."
  value       = aws_ecr_repository.factory_frontend.repository_url
}

output "factory_codebuild_frontend_build_project_name" {
  description = "CodeBuild project name that builds/pushes the frontend image (if enabled)."
  value       = var.factory_frontend_build_enabled ? aws_codebuild_project.factory_frontend_build[0].name : ""
}

output "factory_orchestrator_ecr_repository_url" {
  description = "ECR repository URL for the orchestrator image."
  value       = aws_ecr_repository.factory_orchestrator.repository_url
}

output "factory_codebuild_preview_project_name" {
  description = "CodeBuild project name for Factory preview builds (if enabled)."
  value       = var.factory_codebuild_enabled ? aws_codebuild_project.factory_preview[0].name : ""
}

output "factory_codebuild_deploy_project_name" {
  description = "CodeBuild project name for Factory deploy builds (if enabled)."
  value       = var.factory_codebuild_enabled ? aws_codebuild_project.factory_deploy[0].name : ""
}

output "factory_codebuild_orchestrator_build_project_name" {
  description = "CodeBuild project name that builds/pushes the orchestrator image (if enabled)."
  value       = var.factory_orchestrator_build_enabled ? aws_codebuild_project.factory_orchestrator_build[0].name : ""
}

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Cognito User Pool client for the frontend."
  value       = aws_cognito_user_pool_client.web.id
}
