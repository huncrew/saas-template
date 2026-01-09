output "api_id" {
  description = "API Gateway ID."
  value       = aws_apigatewayv2_api.this.id
}

output "api_arn" {
  description = "API Gateway ARN."
  value       = aws_apigatewayv2_api.this.arn
}

output "execution_arn" {
  description = "Execution ARN of the API."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "api_endpoint" {
  description = "Invoke URL for the stage."
  value       = aws_apigatewayv2_stage.this.invoke_url
}

output "stage_name" {
  description = "Deployed stage name."
  value       = aws_apigatewayv2_stage.this.name
}
