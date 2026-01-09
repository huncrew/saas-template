data "aws_caller_identity" "current" {}

locals {
  name_prefix        = "${var.project_name}-${var.stage}"
  sanitized_prefix   = replace(local.name_prefix, "_", "-")
  ssm_prefix         = startswith(var.ssm_path_prefix, "/") ? var.ssm_path_prefix : "/${var.ssm_path_prefix}"
  lambda_package_dir = "${path.module}/../../backend/dist"

  ssm_parameters = {
    stripe_secret_key   = "${local.ssm_prefix}/stripe/secret_key"
    stripe_webhook_key  = "${local.ssm_prefix}/stripe/webhook_secret"
    bedrock_default_arm = "${local.ssm_prefix}/ai/default_model"
  }

  common_lambda_env = {
    STAGE           = var.stage
    AWS_REGION      = var.region
    LOG_LEVEL       = "INFO"
    ALLOWED_ORIGINS = join(",", var.allowed_origins)
    SSM_PATH_PREFIX = local.ssm_prefix
    PROJECT_NAME    = var.project_name
  }
}

locals {
  ssm_parameter_arns = {
    for key, name in local.ssm_parameters :
    key => "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${name}"
  }
}

module "uploads_bucket" {
  source = "./modules/s3_bucket"

  bucket_name         = var.uploads_bucket_name
  force_destroy       = true
  enable_versioning   = true
  kms_master_key_id   = ""
  block_public_access = true
  tags = {
    Purpose = "uploads"
  }
}

module "curated_bucket" {
  count  = var.curated_bucket_name != "" ? 1 : 0
  source = "./modules/s3_bucket"

  bucket_name         = var.curated_bucket_name != "" ? var.curated_bucket_name : "${local.sanitized_prefix}-curated"
  force_destroy       = true
  enable_versioning   = true
  block_public_access = true
  tags = {
    Purpose = "curated"
  }
}

resource "aws_dynamodb_table" "app" {
  name         = "${local.sanitized_prefix}-app"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }
}

resource "aws_cognito_user_pool" "users" {
  name = "${local.sanitized_prefix}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.sanitized_prefix}-web"
  user_pool_id = aws_cognito_user_pool.users.id

  prevent_user_existence_errors = "ENABLED"
  generate_secret               = false

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]

  callback_urls = [
    "http://localhost:3000/api/auth/callback/cognito"
  ]

  logout_urls = [
    "http://localhost:3000"
  ]
}

resource "aws_ssm_parameter" "stripe_secret_key" {
  name        = local.ssm_parameters.stripe_secret_key
  description = "Stripe secret key for API calls."
  type        = "SecureString"
  value       = var.stripe_secret_key
  overwrite   = true
}

resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name        = local.ssm_parameters.stripe_webhook_key
  description = "Stripe webhook signing secret."
  type        = "SecureString"
  value       = var.stripe_webhook_secret
  overwrite   = true
}

resource "aws_ssm_parameter" "bedrock_default_model" {
  name        = local.ssm_parameters.bedrock_default_arm
  description = "Default Bedrock model identifier."
  type        = "String"
  value       = var.bedrock_model_id
  overwrite   = true
}

resource "aws_sqs_queue" "dlq" {
  count = var.enable_async_queue ? 1 : 0

  name                      = "${local.sanitized_prefix}-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "async" {
  count = var.enable_async_queue ? 1 : 0

  name                      = "${local.sanitized_prefix}-async"
  message_retention_seconds = 1209600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[0].arn
    maxReceiveCount     = 5
  })
}

module "http_api" {
  source = "./modules/api_gateway_http"

  name              = "${local.sanitized_prefix}-api"
  description       = "Serverless API for ${var.project_name}"
  stage_name        = var.stage
  allowed_origins   = var.allowed_origins
  allowed_headers   = ["content-type", "authorization", "x-requested-with"]
  allowed_methods   = ["GET", "POST", "OPTIONS"]
  allow_credentials = true
  tags = {
    Project = var.project_name
    Stage   = var.stage
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.sanitized_prefix}-api-5xx"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = module.http_api.api_id
    Stage = module.http_api.stage_name
  }
}

resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  count = var.enable_async_queue ? 1 : 0

  alarm_name          = "${local.sanitized_prefix}-dlq-depth"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq[0].name
  }
}

locals {
  curated_bucket_name = length(module.curated_bucket) > 0 ? module.curated_bucket[0].bucket_name : ""

  dynamodb_table_arns = [
    aws_dynamodb_table.app.arn,
    "${aws_dynamodb_table.app.arn}/index/*"
  ]

  policy_library = {
    dynamodb_read = {
      sid       = "DynamoRead"
      actions   = ["dynamodb:GetItem", "dynamodb:Query"]
      resources = local.dynamodb_table_arns
    }
    dynamodb_read_write = {
      sid       = "DynamoReadWrite"
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query"]
      resources = local.dynamodb_table_arns
    }
    ssm_stripe = {
      sid     = "ReadStripeSecrets"
      actions = ["ssm:GetParameter"]
      resources = [
        local.ssm_parameter_arns.stripe_secret_key,
        local.ssm_parameter_arns.stripe_webhook_key
      ]
    }
    ssm_bedrock = {
      sid       = "ReadBedrockDefaults"
      actions   = ["ssm:GetParameter"]
      resources = [local.ssm_parameter_arns.bedrock_default_arm]
    }
    kms_ssm_default = {
      sid       = "DecryptParameterStore"
      actions   = ["kms:Decrypt"]
      resources = ["arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
    }
    bedrock_invoke = {
      sid = "InvokeBedrock"
      actions = [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ]
      resources = ["*"]
    }
    s3_put_uploads = {
      sid     = "UploadObjects"
      actions = ["s3:PutObject", "s3:GetObject"]
      resources = concat(
        ["${module.uploads_bucket.bucket_arn}/*"],
        local.curated_bucket_name != "" ? ["arn:aws:s3:::${local.curated_bucket_name}/*"] : []
      )
    }
  }
}

locals {
  lambda_definitions = {
    auth_session = {
      description       = "Handle user session actions backed by DynamoDB."
      timeout           = 15
      memory_size       = 512
      package_filename  = "${locals.lambda_package_dir}/auth_session.zip"
      additional_env    = {}
      policy_statements = [local.policy_library.dynamodb_read_write]
    }
    stripe_checkout = {
      description      = "Create Stripe checkout sessions."
      timeout          = 30
      memory_size      = 512
      package_filename = "${locals.lambda_package_dir}/stripe_checkout.zip"
      additional_env = {
        STRIPE_SECRET_PARAM = local.ssm_parameters.stripe_secret_key
      }
      policy_statements = [
        local.policy_library.ssm_stripe,
        local.policy_library.kms_ssm_default
      ]
    }
    stripe_webhook = {
      description      = "Process Stripe webhook callbacks."
      timeout          = 30
      memory_size      = 512
      package_filename = "${locals.lambda_package_dir}/stripe_webhook.zip"
      additional_env = {
        STRIPE_SECRET_PARAM  = local.ssm_parameters.stripe_secret_key
        STRIPE_WEBHOOK_PARAM = local.ssm_parameters.stripe_webhook_key
        DATABASE_TABLE_NAME  = aws_dynamodb_table.app.name
      }
      policy_statements = [
        local.policy_library.ssm_stripe,
        local.policy_library.dynamodb_read_write,
        local.policy_library.kms_ssm_default
      ]
    }
    subscription_status = {
      description      = "Provide subscription status for a user."
      timeout          = 15
      memory_size      = 512
      package_filename = "${locals.lambda_package_dir}/subscription_status.zip"
      additional_env = {
        DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
      }
      policy_statements = [local.policy_library.dynamodb_read]
    }
    ai_generate = {
      description      = "Proxy AI generate requests to Bedrock."
      timeout          = 60
      memory_size      = 1024
      package_filename = "${locals.lambda_package_dir}/ai_generate.zip"
      additional_env = {
        DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
        BEDROCK_MODEL_PARAM = local.ssm_parameters.bedrock_default_arm
      }
      policy_statements = [
        local.policy_library.dynamodb_read,
        local.policy_library.ssm_bedrock,
        local.policy_library.bedrock_invoke,
        local.policy_library.kms_ssm_default
      ]
    }
    ai_history = {
      description      = "Return AI session history records."
      timeout          = 15
      memory_size      = 512
      package_filename = "${locals.lambda_package_dir}/ai_history.zip"
      additional_env = {
        DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
      }
      policy_statements = [local.policy_library.dynamodb_read]
    }
    upload_url = {
      description      = "Generate presigned S3 upload URLs."
      timeout          = 10
      memory_size      = 256
      package_filename = "${locals.lambda_package_dir}/upload_url.zip"
      additional_env = {
        UPLOADS_BUCKET = module.uploads_bucket.bucket_name
      }
      policy_statements = []
    }
    query = {
      description       = "Handle semantic query requests."
      timeout           = 30
      memory_size       = 512
      package_filename  = "${locals.lambda_package_dir}/query.zip"
      additional_env    = {}
      policy_statements = []
    }
    analyse_doc = {
      description      = "Placeholder analyse-doc processor triggered by S3."
      timeout          = 120
      memory_size      = 1024
      package_filename = "${locals.lambda_package_dir}/analyse_doc.zip"
      additional_env = {
        CURATED_BUCKET = local.curated_bucket_name
      }
      policy_statements = [
        local.policy_library.s3_put_uploads
      ]
    }
  }
}

module "lambda_functions" {
  source   = "./modules/lambda_function"
  for_each = local.lambda_definitions

  function_name = "${local.sanitized_prefix}-${replace(each.key, "_", "-")}"
  description   = each.value.description
  handler       = "handler.handler"
  runtime       = "python3.11"
  package_path  = each.value.package_filename
  timeout       = each.value.timeout
  memory_size   = each.value.memory_size
  environment = merge(
    local.common_lambda_env,
    {
      UPLOADS_BUCKET      = module.uploads_bucket.bucket_name
      CURATED_BUCKET      = local.curated_bucket_name
      DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
    },
    each.value.additional_env
  )
  policy_statements  = each.value.policy_statements
  log_retention_days = var.logs_retention_days

  tags = {
    Project = var.project_name
    Stage   = var.stage
    Lambda  = each.key
  }
}

locals {
  api_routes = {
    auth_session = {
      lambda_key = "auth_session"
      method     = "POST"
      path       = "/auth/session"
    }
    stripe_checkout = {
      lambda_key = "stripe_checkout"
      method     = "POST"
      path       = "/stripe/checkout"
    }
    stripe_webhook = {
      lambda_key = "stripe_webhook"
      method     = "POST"
      path       = "/stripe/webhook"
    }
    subscription_status = {
      lambda_key = "subscription_status"
      method     = "GET"
      path       = "/subscription/status"
    }
    ai_generate = {
      lambda_key = "ai_generate"
      method     = "POST"
      path       = "/ai/generate"
    }
    ai_history = {
      lambda_key = "ai_history"
      method     = "GET"
      path       = "/ai/history"
    }
    upload_url = {
      lambda_key = "upload_url"
      method     = "POST"
      path       = "/upload-url"
    }
    query = {
      lambda_key = "query"
      method     = "POST"
      path       = "/query"
    }
  }
}

resource "aws_apigatewayv2_integration" "http_lambda" {
  for_each = local.api_routes

  api_id                 = module.http_api.api_id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
  integration_uri        = module.lambda_functions[each.value.lambda_key].invoke_arn
}

resource "aws_apigatewayv2_route" "http_lambda" {
  for_each = local.api_routes

  api_id    = module.http_api.api_id
  route_key = "${each.value.method} ${each.value.path}"
  target    = "integrations/${aws_apigatewayv2_integration.http_lambda[each.key].id}"
}

resource "aws_lambda_permission" "http_api" {
  for_each = local.api_routes

  statement_id  = "AllowInvokeByHttpApi-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_functions[each.value.lambda_key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "analyse_doc_s3" {
  count = var.analyse_doc_trigger_enabled ? 1 : 0

  statement_id  = "AllowS3InvokeAnalyseDoc"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_functions["analyse_doc"].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = module.uploads_bucket.bucket_arn
}

resource "aws_s3_bucket_notification" "uploads" {
  count = var.analyse_doc_trigger_enabled ? 1 : 0

  bucket = module.uploads_bucket.bucket_name

  lambda_function {
    lambda_function_arn = module.lambda_functions["analyse_doc"].function_arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [
    aws_lambda_permission.analyse_doc_s3,
  ]
}
