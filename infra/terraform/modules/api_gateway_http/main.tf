resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  description   = var.description
  protocol_type = "HTTP"
  tags          = var.tags

  cors_configuration {
    allow_headers     = var.allowed_headers
    allow_methods     = var.allowed_methods
    allow_origins     = var.allowed_origins
    allow_credentials = var.allow_credentials
  }
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}-${var.stage_name}"
  retention_in_days = 30
  tags              = var.tags
}

resource "aws_apigatewayv2_stage" "this" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = var.stage_name
  auto_deploy = true
  tags        = var.tags

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format          = var.access_log_format
  }

  default_route_settings {
    detailed_metrics_enabled = true
    # IMPORTANT: leaving these as 0 effectively throttles everything (HTTP API stage behavior).
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }
}
