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
    LOG_LEVEL       = "INFO"
    ALLOWED_ORIGINS = join(",", var.allowed_origins)
    SSM_PATH_PREFIX = local.ssm_prefix
    PROJECT_NAME    = var.project_name
  }
}

module "factory_artifacts_bucket" {
  source = "./modules/s3_bucket"

  bucket_name         = var.factory_artifacts_bucket_name != "" ? var.factory_artifacts_bucket_name : "${local.sanitized_prefix}-factory-artifacts"
  force_destroy       = true
  enable_versioning   = true
  kms_master_key_id   = ""
  block_public_access = true
  tags = {
    Purpose = "factory-artifacts"
  }
}

module "factory_preview_bucket" {
  source = "./modules/s3_bucket"

  bucket_name         = var.factory_preview_bucket_name != "" ? var.factory_preview_bucket_name : "${local.sanitized_prefix}-factory-preview"
  force_destroy       = true
  enable_versioning   = true
  kms_master_key_id   = ""
  block_public_access = true
  tags = {
    Purpose = "factory-preview"
  }
}

resource "aws_cloudfront_origin_access_control" "factory_preview" {
  name                              = "${local.sanitized_prefix}-factory-preview-oac"
  description                       = "OAC for Factory preview bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "factory_preview" {
  enabled             = true
  comment             = "Factory static previews"
  default_root_object = "index.html"

  origin {
    domain_name              = module.factory_preview_bucket.bucket_name != "" ? "${module.factory_preview_bucket.bucket_name}.s3.amazonaws.com" : ""
    origin_id                = "factory-preview-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.factory_preview.id
  }

  default_cache_behavior {
    target_origin_id       = "factory-preview-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "factory_preview_bucket_policy" {
  statement {
    sid = "AllowCloudFrontRead"
    actions = [
      "s3:GetObject"
    ]
    resources = ["${module.factory_preview_bucket.bucket_arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.factory_preview.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "factory_preview" {
  bucket = module.factory_preview_bucket.bucket_name
  policy = data.aws_iam_policy_document.factory_preview_bucket_policy.json
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "factory" {
  count = var.factory_vpc_id == "" ? 1 : 0

  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_internet_gateway" "factory" {
  count  = var.factory_vpc_id == "" ? 1 : 0
  vpc_id = aws_vpc.factory[0].id
}

resource "aws_route_table" "factory_public" {
  count  = var.factory_vpc_id == "" ? 1 : 0
  vpc_id = aws_vpc.factory[0].id
}

resource "aws_route" "factory_public_internet" {
  count                  = var.factory_vpc_id == "" ? 1 : 0
  route_table_id         = aws_route_table.factory_public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.factory[0].id
}

resource "aws_subnet" "factory_public" {
  count = var.factory_vpc_id == "" ? 2 : 0

  vpc_id                  = aws_vpc.factory[0].id
  cidr_block              = count.index == 0 ? "10.42.0.0/24" : "10.42.1.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
}

resource "aws_route_table_association" "factory_public" {
  count          = var.factory_vpc_id == "" ? 2 : 0
  subnet_id      = aws_subnet.factory_public[count.index].id
  route_table_id = aws_route_table.factory_public[0].id
}

locals {
  factory_vpc_id     = var.factory_vpc_id != "" ? var.factory_vpc_id : aws_vpc.factory[0].id
  factory_subnet_ids = length(var.factory_subnet_ids) > 0 ? var.factory_subnet_ids : aws_subnet.factory_public[*].id
}

resource "aws_ecr_repository" "factory_orchestrator" {
  name                 = "${local.sanitized_prefix}-factory-orchestrator"
  image_tag_mutability = "MUTABLE"
}

resource "aws_ecs_cluster" "factory" {
  name = "${local.sanitized_prefix}-factory"
}

resource "aws_cloudwatch_log_group" "factory_orchestrator" {
  name              = "/ecs/${local.sanitized_prefix}/factory-orchestrator"
  retention_in_days = var.logs_retention_days
}

resource "aws_iam_role" "factory_task_execution" {
  name = "${local.sanitized_prefix}-factory-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "factory_task_execution" {
  role       = aws_iam_role.factory_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "factory_task" {
  name = "${local.sanitized_prefix}-factory-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

data "aws_iam_policy_document" "factory_task" {
  statement {
    sid = "DynamoFactoryTables"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query"
    ]
    resources = [
      aws_dynamodb_table.factory_projects.arn,
      aws_dynamodb_table.factory_builds.arn
    ]
  }

  statement {
    sid = "CodeBuildStartAndPoll"
    actions = [
      "codebuild:StartBuild",
      "codebuild:BatchGetBuilds"
    ]
    resources = var.factory_codebuild_enabled ? [
      aws_codebuild_project.factory_preview[0].arn,
      aws_codebuild_project.factory_deploy[0].arn
    ] : ["*"]
  }
}

resource "aws_iam_role_policy" "factory_task" {
  name   = "${local.sanitized_prefix}-factory-task"
  role   = aws_iam_role.factory_task.id
  policy = data.aws_iam_policy_document.factory_task.json
}

resource "aws_security_group" "factory_alb" {
  name        = "${local.sanitized_prefix}-factory-alb"
  description = "ALB for Factory orchestrator"
  vpc_id      = local.factory_vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "factory_orchestrator" {
  name        = "${local.sanitized_prefix}-factory-orchestrator"
  description = "Security group for Factory orchestrator tasks"
  vpc_id      = local.factory_vpc_id

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.factory_alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "factory" {
  name               = "${local.sanitized_prefix}-factory"
  load_balancer_type = "application"
  subnets            = local.factory_subnet_ids
  security_groups    = [aws_security_group.factory_alb.id]
}

resource "aws_lb_target_group" "factory_orchestrator" {
  name        = "${local.sanitized_prefix}-factory-orch"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = local.factory_vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "factory_http" {
  load_balancer_arn = aws_lb.factory.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.factory_orchestrator.arn
  }
}

resource "aws_ecs_task_definition" "factory_orchestrator" {
  family                   = "${local.sanitized_prefix}-factory-orchestrator"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

  execution_role_arn = aws_iam_role.factory_task_execution.arn
  task_role_arn      = aws_iam_role.factory_task.arn

  container_definitions = jsonencode([
    {
      name      = "orchestrator"
      image     = var.factory_orchestrator_image != "" ? var.factory_orchestrator_image : "${aws_ecr_repository.factory_orchestrator.repository_url}:latest"
      essential = true
      portMappings = [
        { containerPort = 8000, hostPort = 8000, protocol = "tcp" }
      ]
      environment = [
        { name = "ALLOWED_ORIGINS", value = join(",", var.allowed_origins) },
        { name = "FACTORY_PROJECTS_TABLE", value = aws_dynamodb_table.factory_projects.name },
        { name = "FACTORY_BUILDS_TABLE", value = aws_dynamodb_table.factory_builds.name },
        { name = "FACTORY_PREVIEW_BASE_URL", value = "https://${aws_cloudfront_distribution.factory_preview.domain_name}" },
        { name = "CODEBUILD_PREVIEW_PROJECT", value = var.factory_codebuild_enabled ? aws_codebuild_project.factory_preview[0].name : "" },
        { name = "CODEBUILD_DEPLOY_PROJECT", value = var.factory_codebuild_enabled ? aws_codebuild_project.factory_deploy[0].name : "" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.factory_orchestrator.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "factory_orchestrator" {
  name            = "${local.sanitized_prefix}-factory-orchestrator"
  cluster         = aws_ecs_cluster.factory.id
  task_definition = aws_ecs_task_definition.factory_orchestrator.arn
  desired_count   = var.factory_orchestrator_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.factory_subnet_ids
    security_groups  = [aws_security_group.factory_orchestrator.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.factory_orchestrator.arn
    container_name   = "orchestrator"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.factory_http]
}

resource "aws_iam_role" "factory_codebuild" {
  count = var.factory_codebuild_enabled ? 1 : 0
  name  = "${local.sanitized_prefix}-factory-codebuild"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "codebuild.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

data "aws_iam_policy_document" "factory_codebuild" {
  count = var.factory_codebuild_enabled ? 1 : 0

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["*"]
  }

  statement {
    sid = "S3FactoryArtifacts"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      module.factory_artifacts_bucket.bucket_arn,
      "${module.factory_artifacts_bucket.bucket_arn}/*",
      module.factory_preview_bucket.bucket_arn,
      "${module.factory_preview_bucket.bucket_arn}/*"
    ]
  }
}

resource "aws_iam_role_policy" "factory_codebuild" {
  count  = var.factory_codebuild_enabled ? 1 : 0
  name   = "${local.sanitized_prefix}-factory-codebuild"
  role   = aws_iam_role.factory_codebuild[0].id
  policy = data.aws_iam_policy_document.factory_codebuild[0].json
}

data "aws_iam_policy_document" "factory_orchestrator_build" {
  count = var.factory_orchestrator_build_enabled ? 1 : 0

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["*"]
  }

  statement {
    sid = "ReadOrchestratorSource"
    actions = [
      "s3:GetObject",
      "s3:ListBucket"
    ]
    resources = [
      module.factory_artifacts_bucket.bucket_arn,
      "${module.factory_artifacts_bucket.bucket_arn}/*"
    ]
  }

  statement {
    sid = "EcrAuth"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ]
    resources = [aws_ecr_repository.factory_orchestrator.arn]
  }
}

resource "aws_iam_role_policy" "factory_orchestrator_build" {
  count  = var.factory_orchestrator_build_enabled ? 1 : 0
  name   = "${local.sanitized_prefix}-factory-orchestrator-build"
  role   = aws_iam_role.factory_codebuild[0].id
  policy = data.aws_iam_policy_document.factory_orchestrator_build[0].json
}

resource "aws_codebuild_project" "factory_orchestrator_build" {
  count = (var.factory_orchestrator_build_enabled && var.factory_codebuild_enabled) ? 1 : 0

  name         = "${local.sanitized_prefix}-factory-orchestrator-build"
  description  = "Build and push the Factory orchestrator container image to ECR from an S3 source archive."
  service_role = aws_iam_role.factory_codebuild[0].arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    privileged_mode             = true
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "AWS_REGION"
      value = var.region
    }
    environment_variable {
      name  = "ECR_REPO"
      value = aws_ecr_repository.factory_orchestrator.repository_url
    }
  }

  source {
    type      = "S3"
    location  = "${module.factory_artifacts_bucket.bucket_name}/${var.factory_orchestrator_source_key}"
    buildspec = <<-YAML
      version: 0.2
      phases:
        pre_build:
          commands:
            - echo "Logging into ECR"
            - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPO"
        build:
          commands:
            - echo "Building orchestrator image"
            - docker build -t "$ECR_REPO:latest" .
        post_build:
          commands:
            - echo "Pushing orchestrator image"
            - docker push "$ECR_REPO:latest"
      YAML
  }
}

resource "aws_codebuild_project" "factory_preview" {
  count = var.factory_codebuild_enabled ? 1 : 0

  name         = "${local.sanitized_prefix}-factory-preview"
  description  = "Factory preview build: writes a placeholder preview into S3 (V1 scaffold)."
  service_role = aws_iam_role.factory_codebuild[0].arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    privileged_mode             = false
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "PREVIEW_BUCKET"
      value = module.factory_preview_bucket.bucket_name
    }
    environment_variable {
      name  = "ARTIFACTS_BUCKET"
      value = module.factory_artifacts_bucket.bucket_name
    }
    environment_variable {
      name  = "CLOUDFRONT_DOMAIN"
      value = aws_cloudfront_distribution.factory_preview.domain_name
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = <<-YAML
      version: 0.2
      phases:
        build:
          commands:
            - echo "Factory preview scaffold"
            - echo "<html><body><h1>Factory Preview</h1><p>PROJECT_ID=$PROJECT_ID BUILD_ID=$BUILD_ID</p></body></html>" > index.html
            - aws s3 cp index.html "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/index.html" --content-type "text/html"
      YAML
  }
}

resource "aws_codebuild_project" "factory_deploy" {
  count = var.factory_codebuild_enabled ? 1 : 0

  name         = "${local.sanitized_prefix}-factory-deploy"
  description  = "Factory deploy build scaffold (V1 placeholder)."
  service_role = aws_iam_role.factory_codebuild[0].arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    privileged_mode             = false
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "ARTIFACTS_BUCKET"
      value = module.factory_artifacts_bucket.bucket_name
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = <<-YAML
      version: 0.2
      phases:
        build:
          commands:
            - echo "Factory deploy scaffold"
            - echo "PROJECT_ID=$PROJECT_ID BUILD_ID=$BUILD_ID" > deploy.txt
            - aws s3 cp deploy.txt "s3://$ARTIFACTS_BUCKET/projects/$PROJECT_ID/builds/$BUILD_ID/reports/deploy.txt"
      YAML
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

resource "aws_dynamodb_table" "factory_projects" {
  name         = "${local.sanitized_prefix}-factory-projects"
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
}

resource "aws_dynamodb_table" "factory_builds" {
  name         = "${local.sanitized_prefix}-factory-builds"
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
  throttling_rate_limit  = 25
  throttling_burst_limit = 50
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
      package_filename  = "${local.lambda_package_dir}/auth_session.zip"
      additional_env    = {}
      policy_statements = [local.policy_library.dynamodb_read_write]
    }
    stripe_checkout = {
      description      = "Create Stripe checkout sessions."
      timeout          = 30
      memory_size      = 512
      package_filename = "${local.lambda_package_dir}/stripe_checkout.zip"
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
      package_filename = "${local.lambda_package_dir}/stripe_webhook.zip"
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
      package_filename = "${local.lambda_package_dir}/subscription_status.zip"
      additional_env = {
        DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
      }
      policy_statements = [local.policy_library.dynamodb_read]
    }
    ai_generate = {
      description      = "Proxy AI generate requests to Bedrock."
      timeout          = 60
      memory_size      = 1024
      package_filename = "${local.lambda_package_dir}/ai_generate.zip"
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
      package_filename = "${local.lambda_package_dir}/ai_history.zip"
      additional_env = {
        DATABASE_TABLE_NAME = aws_dynamodb_table.app.name
      }
      policy_statements = [local.policy_library.dynamodb_read]
    }
    upload_url = {
      description      = "Generate presigned S3 upload URLs."
      timeout          = 10
      memory_size      = 256
      package_filename = "${local.lambda_package_dir}/upload_url.zip"
      additional_env = {
        UPLOADS_BUCKET = module.uploads_bucket.bucket_name
      }
      policy_statements = []
    }
    query = {
      description       = "Handle semantic query requests."
      timeout           = 30
      memory_size       = 512
      package_filename  = "${local.lambda_package_dir}/query.zip"
      additional_env    = {}
      policy_statements = []
    }
    analyse_doc = {
      description      = "Placeholder analyse-doc processor triggered by S3."
      timeout          = 120
      memory_size      = 1024
      package_filename = "${local.lambda_package_dir}/analyse_doc.zip"
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
