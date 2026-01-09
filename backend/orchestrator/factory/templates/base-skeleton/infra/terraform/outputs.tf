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

output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool."
  value       = aws_cognito_user_pool.users.id
}

output "cognito_user_pool_client_id" {
  description = "ID of the Cognito User Pool client for the frontend."
  value       = aws_cognito_user_pool_client.web.id
}
