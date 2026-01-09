data "aws_caller_identity" "current" {}

locals {
  name_prefix        = "${var.project_name}-${var.stage}"
  sanitized_prefix   = replace(local.name_prefix, "_", "-")
  ssm_prefix         = startswith(var.ssm_path_prefix, "/") ? var.ssm_path_prefix : "/${var.ssm_path_prefix}"
  lambda_package_dir = "${path.module}/../../backend/dist"

  # Clerk SSM parameter paths - these are the source of truth for Clerk keys
  clerk_ssm_publishable_key_path = "/factory/${var.stage}/clerk-publishable-key"
  clerk_ssm_secret_key_path      = "/factory/${var.stage}/clerk-secret-key"
  clerk_ssm_secret_key_arn       = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${local.clerk_ssm_secret_key_path}"

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

resource "aws_cloudfront_function" "factory_preview_rewrite" {
  name    = "${local.sanitized_prefix}-factory-preview-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrite extensionless preview routes to .html (static export)"
  publish = true
  code    = <<-JS
function handler(event) {
  var request = event.request;
  var uri = request.uri || "/";

  // Root: let defaultRootObject /index.html handle it.
  if (uri === "/") {
    request.uri = "/index.html";
    return request;
  }

  // If the request is already for a file (has an extension), don't rewrite.
  if (uri.indexOf(".") !== -1) {
    return request;
  }

  // Remove trailing slash if present.
  if (uri.length > 1 && uri.charAt(uri.length - 1) === "/") {
    uri = uri.substring(0, uri.length - 1);
  }

  // Next static export outputs routes as "*.html" files.
  request.uri = uri + ".html";
  return request;
}
JS
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

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.factory_preview_rewrite.arn
    }

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

# Allow task execution role to read Clerk secrets from SSM
resource "aws_iam_role_policy" "factory_task_execution_ssm" {
  name = "${local.sanitized_prefix}-factory-task-exec-ssm"
  role = aws_iam_role.factory_task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadClerkSecrets"
        Effect = "Allow"
        Action = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/factory/${var.stage}/*"
        ]
      },
      {
        Sid      = "DecryptSSM"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = ["arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
      }
    ]
  })
}

# Read Clerk publishable key from SSM (non-sensitive, can be in environment)
data "aws_ssm_parameter" "clerk_publishable_key" {
  name = local.clerk_ssm_publishable_key_path
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
      aws_dynamodb_table.factory_builds.arn,
      aws_dynamodb_table.factory_chats.arn
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

  statement {
    sid = "FactoryArtifactsReadWrite"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket"
    ]
    resources = [
      module.factory_artifacts_bucket.bucket_arn,
      "${module.factory_artifacts_bucket.bucket_arn}/*"
    ]
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

  ingress {
    from_port   = 443
    to_port     = 443
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

data "aws_route53_zone" "factory_domain" {
  count = var.factory_hosted_zone_id == "" ? 1 : 0
  name  = "${var.factory_domain_name}."
}

locals {
  factory_hosted_zone_id = var.factory_hosted_zone_id != "" ? var.factory_hosted_zone_id : data.aws_route53_zone.factory_domain[0].zone_id
  factory_orchestrator_fqdn = "${var.factory_orchestrator_subdomain}.${var.factory_domain_name}"
  factory_temp_frontend_fqdn = "${var.factory_temp_frontend_subdomain}.${var.factory_domain_name}"
}

resource "aws_acm_certificate" "factory_site" {
  domain_name       = var.factory_domain_name
  validation_method = "DNS"

  subject_alternative_names = compact(concat(
    var.factory_enable_www ? ["www.${var.factory_domain_name}"] : [],
    [local.factory_orchestrator_fqdn],
    [local.factory_temp_frontend_fqdn]
  ))

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "factory_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.factory_site.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = local.factory_hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "factory_site" {
  certificate_arn         = aws_acm_certificate.factory_site.arn
  validation_record_fqdns = [for r in aws_route53_record.factory_cert_validation : r.fqdn]
}

resource "aws_security_group" "factory_frontend" {
  name        = "${local.sanitized_prefix}-factory-frontend"
  description = "Security group for Factory frontend tasks"
  vpc_id      = local.factory_vpc_id

  ingress {
    from_port       = 3000
    to_port         = 3000
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
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_target_group" "factory_frontend" {
  name        = "${local.sanitized_prefix}-factory-fe"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = local.factory_vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "factory_https" {
  load_balancer_arn = aws_lb.factory.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.factory_site.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.factory_frontend.arn
  }
}

resource "aws_lb_listener_rule" "factory_orchestrator_host" {
  listener_arn = aws_lb_listener.factory_https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.factory_orchestrator.arn
  }

  condition {
    host_header {
      values = [local.factory_orchestrator_fqdn]
    }
  }
}

resource "aws_route53_record" "factory_apex" {
  count   = var.factory_cutover_enabled ? 1 : 0
  allow_overwrite = true
  zone_id = local.factory_hosted_zone_id
  name    = "${var.factory_domain_name}."
  type    = "A"

  alias {
    name                   = aws_lb.factory.dns_name
    zone_id                = aws_lb.factory.zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "factory_www" {
  count   = (var.factory_enable_www && var.factory_cutover_enabled) ? 1 : 0
  allow_overwrite = true
  zone_id = local.factory_hosted_zone_id
  name    = "www.${var.factory_domain_name}."
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.factory.dns_name]
}

resource "aws_route53_record" "factory_orchestrator" {
  count   = var.factory_cutover_enabled ? 1 : 0
  allow_overwrite = true
  zone_id = local.factory_hosted_zone_id
  name    = "${local.factory_orchestrator_fqdn}."
  type    = "A"

  alias {
    name                   = aws_lb.factory.dns_name
    zone_id                = aws_lb.factory.zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "factory_temp_frontend" {
  zone_id = local.factory_hosted_zone_id
  name    = "${local.factory_temp_frontend_fqdn}."
  type    = "A"

  alias {
    name                   = aws_lb.factory.dns_name
    zone_id                = aws_lb.factory.zone_id
    evaluate_target_health = false
  }
}

resource "aws_ecr_repository" "factory_frontend" {
  name                 = "${local.sanitized_prefix}-factory-frontend"
  image_tag_mutability = "MUTABLE"
}

resource "aws_cloudwatch_log_group" "factory_frontend" {
  name              = "/ecs/${local.sanitized_prefix}/factory-frontend"
  retention_in_days = var.logs_retention_days
}

resource "aws_ecs_task_definition" "factory_frontend" {
  family                   = "${local.sanitized_prefix}-factory-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

  execution_role_arn = aws_iam_role.factory_task_execution.arn
  task_role_arn      = aws_iam_role.factory_task.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = var.factory_frontend_image != "" ? var.factory_frontend_image : "${aws_ecr_repository.factory_frontend.repository_url}:latest"
      essential = true
      portMappings = [
        { containerPort = 3000, hostPort = 3000, protocol = "tcp" }
      ]
      # Secrets pulled from SSM Parameter Store at runtime
      secrets = concat(
        # Clerk secret key (always from SSM - this is the source of truth)
        [{ name = "CLERK_SECRET_KEY", valueFrom = local.clerk_ssm_secret_key_arn }],
        # Optional OpenAI key
        var.openai_api_key_ssm_arn != "" ? [{ name = "OPENAI_API_KEY", valueFrom = var.openai_api_key_ssm_arn }] : []
      )
      environment = [
        { name = "PORT", value = "3000" },
        # Clerk publishable key from SSM (non-sensitive, safe in environment)
        { name = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", value = data.aws_ssm_parameter.clerk_publishable_key.value },
        { name = "CLERK_SIGN_IN_URL", value = "/auth/signin" },
        { name = "CLERK_SIGN_UP_URL", value = "/auth/signup" },
        { name = "CLERK_AFTER_SIGN_IN_URL", value = "/projects" },
        { name = "CLERK_AFTER_SIGN_UP_URL", value = "/projects" },
        { name = "BACKEND_API_URL", value = module.http_api.api_endpoint },
        { name = "NEXT_PUBLIC_API_BASE_URL", value = module.http_api.api_endpoint },
        { name = "ORCHESTRATOR_API_URL", value = "https://${local.factory_orchestrator_fqdn}" },
        { name = "NEXT_PUBLIC_ORCHESTRATOR_API_URL", value = "https://${local.factory_orchestrator_fqdn}" },
        { name = "FACTORY_DEV_NO_AUTH", value = "0" },
        { name = "NEXT_PUBLIC_FACTORY_DEV_NO_AUTH", value = "0" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.factory_frontend.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "factory_frontend" {
  name            = "${local.sanitized_prefix}-factory-frontend"
  cluster         = aws_ecs_cluster.factory.id
  task_definition = aws_ecs_task_definition.factory_frontend.arn
  desired_count   = var.factory_frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.factory_subnet_ids
    security_groups  = [aws_security_group.factory_frontend.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.factory_frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.factory_https]
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
        { name = "FACTORY_CHATS_TABLE", value = aws_dynamodb_table.factory_chats.name },
        { name = "FACTORY_PREVIEW_BASE_URL", value = "https://${aws_cloudfront_distribution.factory_preview.domain_name}" },
        { name = "CODEBUILD_PREVIEW_PROJECT", value = var.factory_codebuild_enabled ? aws_codebuild_project.factory_preview[0].name : "" },
        { name = "CODEBUILD_DEPLOY_PROJECT", value = var.factory_codebuild_enabled ? aws_codebuild_project.factory_deploy[0].name : "" },
        { name = "BACKEND_API_URL", value = module.http_api.api_endpoint },
        { name = "FACTORY_TEMPLATE_KEY", value = var.factory_template_source_key },
        { name = "FACTORY_ARTIFACTS_BUCKET", value = module.factory_artifacts_bucket.bucket_name }
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

data "aws_iam_policy_document" "factory_frontend_build" {
  count = var.factory_frontend_build_enabled ? 1 : 0

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
    sid = "ReadFrontendSource"
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
    resources = [aws_ecr_repository.factory_frontend.arn]
  }

  # Allow reading Clerk publishable key from SSM for Docker build
  statement {
    sid     = "ReadClerkKeysFromSSM"
    actions = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/factory/${var.stage}/*"
    ]
  }

  dynamic "statement" {
    for_each = var.openai_api_key_ssm_arn != "" ? [1] : []
    content {
      sid = "ReadOpenAIKeyFromSSM"
      actions = [
        "ssm:GetParameter"
      ]
      resources = [var.openai_api_key_ssm_arn]
    }
  }

  statement {
    sid       = "DecryptSSM"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
  }
}

resource "aws_iam_role_policy" "factory_orchestrator_build" {
  count  = var.factory_orchestrator_build_enabled ? 1 : 0
  name   = "${local.sanitized_prefix}-factory-orchestrator-build"
  role   = aws_iam_role.factory_codebuild[0].id
  policy = data.aws_iam_policy_document.factory_orchestrator_build[0].json
}

resource "aws_iam_role_policy" "factory_frontend_build" {
  count  = var.factory_frontend_build_enabled ? 1 : 0
  name   = "${local.sanitized_prefix}-factory-frontend-build"
  role   = aws_iam_role.factory_codebuild[0].id
  policy = data.aws_iam_policy_document.factory_frontend_build[0].json
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
            - TAG="cb-$${CODEBUILD_BUILD_NUMBER}"
            - echo "Tagging as $TAG and latest"
            - docker build -t "$ECR_REPO:$TAG" -t "$ECR_REPO:latest" .
        post_build:
          commands:
            - echo "Pushing orchestrator image"
            - docker push "$ECR_REPO:$TAG"
            - docker push "$ECR_REPO:latest"
      YAML
  }
}

resource "aws_codebuild_project" "factory_frontend_build" {
  count = (var.factory_frontend_build_enabled && var.factory_codebuild_enabled) ? 1 : 0

  name         = "${local.sanitized_prefix}-factory-frontend-build"
  description  = "Build and push the Factory frontend container image to ECR from an S3 source archive."
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
      value = aws_ecr_repository.factory_frontend.repository_url
    }
    environment_variable {
      name  = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
      value = local.clerk_ssm_publishable_key_path
      type  = "PARAMETER_STORE"
    }

    dynamic "environment_variable" {
      for_each = var.openai_api_key_ssm_name != "" ? [1] : []
      content {
        name  = "OPENAI_API_KEY"
        value = var.openai_api_key_ssm_name
        type  = "PARAMETER_STORE"
      }
    }
  }

  source {
    type      = "S3"
    location  = "${module.factory_artifacts_bucket.bucket_name}/${var.factory_frontend_source_key}"
    buildspec = <<-YAML
      version: 0.2
      phases:
        pre_build:
          commands:
            - echo "Logging into ECR"
            - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPO"
        build:
          commands:
            - echo "Building frontend image"
            - docker build -t "$ECR_REPO:latest" --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" -f frontend/Dockerfile frontend
        post_build:
          commands:
            - echo "Pushing frontend image"
            - docker push "$ECR_REPO:latest"
      YAML
  }
}

resource "aws_codebuild_project" "factory_preview" {
  count = var.factory_codebuild_enabled ? 1 : 0

  name         = "${local.sanitized_prefix}-factory-preview"
  description  = "Factory preview build: unzips the template, applies generated code (files.json or patch), builds, and publishes a preview report + bundle."
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
      name  = "TEMPLATE_KEY"
      value = var.factory_template_source_key
    }
    environment_variable {
      name  = "PATCH_KEY"
      value = ""
    }
    environment_variable {
      name  = "MODULE_PATCH_KEYS"
      value = ""
    }
    environment_variable {
      name  = "FILES_MANIFEST_KEY"
      value = ""
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
      env:
        shell: bash
      phases:
        install:
          runtime-versions:
            nodejs: 20
        pre_build:
          commands:
            - set -euo pipefail
            - echo "Downloading template"
            - mkdir -p /tmp/factory
            - 'aws s3 cp "s3://$ARTIFACTS_BUCKET/$TEMPLATE_KEY" /tmp/factory/template.zip'
            - mkdir -p /tmp/factory/template
            - unzip -q /tmp/factory/template.zip -d /tmp/factory/template
            - echo "Template extracted"
            - 'if [ -d /tmp/factory/template/frontend ]; then export TEMPLATE_DIR="/tmp/factory/template"; else export TEMPLATE_DIR="$(find /tmp/factory/template -mindepth 1 -maxdepth 1 -type d | head -n 1)"; fi'
            - 'if [ -z "$${TEMPLATE_DIR:-}" ]; then echo "Failed to detect TEMPLATE_DIR"; ls -la /tmp/factory/template; exit 1; fi'
            - 'echo "TEMPLATE_DIR=$TEMPLATE_DIR"'
            - "bash -lc 'set -euo pipefail; : > /tmp/factory/module_patch_errors.log; if [[ -n \"$${MODULE_PATCH_KEYS}\" ]]; then echo \"Applying module patches\"; echo \"$${MODULE_PATCH_KEYS}\" | tr \",\" \"\\n\" > /tmp/factory/module_patch_keys.txt; while read -r k; do if [[ -z \"$k\" ]]; then continue; fi; echo \"Downloading module patch s3://$ARTIFACTS_BUCKET/$k\"; aws s3 cp \"s3://$ARTIFACTS_BUCKET/$k\" \"/tmp/factory/module-$(basename \"$k\")\"; echo \"Applying module patch $k\"; cd \"$TEMPLATE_DIR\"; if git apply \"/tmp/factory/module-$(basename \"$k\")\" 2>> /tmp/factory/module_patch_errors.log; then echo \"ok:$k\" >> /tmp/factory/module_patch_applied.log; else echo \"fail:$k\" >> /tmp/factory/module_patch_applied.log; echo \"--- fail:$k ---\" >> /tmp/factory/module_patch_errors.log; fi; done < /tmp/factory/module_patch_keys.txt; else echo \"No module patches\" > /tmp/factory/module_patch_applied.log; echo \"No module patches\" > /tmp/factory/module_patch_errors.log; fi'"
            - "bash -lc 'set -euo pipefail; : > /tmp/factory/patch_apply_error.log; FILES_APPLIED=0; if [[ -n \"$${FILES_MANIFEST_KEY:-}\" ]]; then echo \"Downloading files manifest\"; if aws s3 cp \"s3://$ARTIFACTS_BUCKET/$${FILES_MANIFEST_KEY}\" /tmp/factory/files.json 2>/dev/null; then echo \"Writing files from manifest\"; cd \"$TEMPLATE_DIR\"; python3 -c \"import json,os; files=json.load(open(\\\"/tmp/factory/files.json\\\")); [os.makedirs(os.path.dirname(os.path.join(os.environ.get(\\\"TEMPLATE_DIR\\\",\\\"/tmp/factory/template\\\"),e[\\\"path\\\"])),exist_ok=True) or open(os.path.join(os.environ.get(\\\"TEMPLATE_DIR\\\",\\\"/tmp/factory/template\\\"),e[\\\"path\\\"]),\\\"w\\\").write(e[\\\"content\\\"]) or print(f\\\"Wrote: {e['path']}\\\") for e in files]; print(f\\\"Total files: {len(files)}\\\")\" 2>&1 | tee /tmp/factory/files_write.log; if [ $${PIPESTATUS[0]} -eq 0 ]; then echo \"Files written successfully\"; echo 1 > /tmp/factory/patch_applied; FILES_APPLIED=1; else echo \"Files write failed, falling back to patch\"; fi; else echo \"Files manifest download failed, falling back to patch\"; fi; fi; if [[ $FILES_APPLIED -eq 0 ]] && [[ -n \"$${PATCH_KEY:-}\" ]]; then echo \"Downloading patch\"; aws s3 cp \"s3://$ARTIFACTS_BUCKET/$${PATCH_KEY}\" /tmp/factory/patch.diff; echo \"Applying patch\"; cd \"$TEMPLATE_DIR\"; if git apply /tmp/factory/patch.diff 2> /tmp/factory/patch_apply_error.log; then echo \"Patch applied\"; echo 1 > /tmp/factory/patch_applied; else echo \"Patch failed to apply\"; echo 0 > /tmp/factory/patch_applied; fi; elif [[ $FILES_APPLIED -eq 0 ]]; then echo \"No FILES_MANIFEST_KEY or PATCH_KEY provided; building template as-is\"; echo none > /tmp/factory/patch_applied; echo \"No modifications provided\" > /tmp/factory/patch_apply_error.log; fi'"
        build:
          commands:
            - set -euo pipefail
            - echo "Building template (frontend)"
            - bash -lc 'set -euo pipefail; cd "$TEMPLATE_DIR/frontend"; npm ci'
            - bash -lc 'set -euo pipefail; cd "$TEMPLATE_DIR/frontend"; if [ -d src/app/api ]; then echo "Static preview mode - removing src/app/api (route handlers not supported in export)"; rm -rf src/app/api; fi'
            - 'bash -lc ''cd "$TEMPLATE_DIR/frontend"; set +e; FACTORY_PREVIEW_EXPORT=1 FACTORY_BASE_PATH="/p/$PROJECT_ID/$BUILD_ID/app" NEXT_PUBLIC_FACTORY_DEV_NO_AUTH=1 npm run build > /tmp/factory/build.log 2>&1; BUILD_EXIT=$?; set -e; echo $BUILD_EXIT > /tmp/factory/build_exit_code; exit 0'''
            - echo "Packaging bundle"
            - cd /tmp/factory
            - zip -qr bundle.zip template -x "template/**/node_modules/*" -x "template/**/.next/*" -x "template/**/.git/*" || true
        post_build:
          commands:
            - set -euo pipefail
            - mkdir -p /tmp/factory/report
            - test -f /tmp/factory/build.log || echo "No build.log captured (build likely failed early)." > /tmp/factory/build.log
            - 'PATCH_APPLIED=$(cat /tmp/factory/patch_applied 2>/dev/null || echo "unknown")'
            - 'BUILD_EXIT=$(cat /tmp/factory/build_exit_code 2>/dev/null || echo "unknown")'
            - 'printf "%s" "<html><head><meta charset=\\"utf-8\\" /><meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\" /><title>Factory Build Report</title></head><body><h1>Factory Build Report</h1><p>Project: $PROJECT_ID</p><p>Build: $BUILD_ID</p><p>Template: $TEMPLATE_KEY</p><p>Build exit code: $BUILD_EXIT</p><p>Files manifest: $${FILES_MANIFEST_KEY:-none}</p><p>Module patches: $${MODULE_PATCH_KEYS:-none}</p><p>Patch key: $${PATCH_KEY:-none}</p><p>Patch applied: $PATCH_APPLIED</p><p><a href=\\"../app/index.html\\">Open App Preview</a></p><ul><li><a href=\\"./files_write.log\\">files_write.log</a></li><li><a href=\\"./files.json\\">files.json</a></li><li><a href=\\"./module_patch_applied.log\\">module_patch_applied.log</a></li><li><a href=\\"./module_patch_errors.log\\">module_patch_errors.log</a></li><li><a href=\\"./patch.diff\\">patch.diff</a></li><li><a href=\\"./patch_apply_error.log\\">patch_apply_error.log</a></li><li><a href=\\"./bundle.zip\\">bundle.zip</a></li><li><a href=\\"./build.log\\">build.log</a></li></ul></body></html>" > /tmp/factory/report/index.html'
            - 'if [ "$BUILD_EXIT" = "0" ]; then printf "%s" "<!doctype html><html><head><meta charset=\"utf-8\" /><meta http-equiv=\"refresh\" content=\"0; url=./app/index.html\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Factory Preview</title></head><body><p>Redirecting to preview...</p><p><a href=\"./app/index.html\">Open Preview</a> | <a href=\"./report/index.html\">Build Report</a></p></body></html>" > /tmp/factory/index.html; else printf "%s" "<!doctype html><html><head><meta charset=\"utf-8\" /><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" /><title>Build Failed</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;background:#fef2f2}h1{color:#b91c1c}pre{background:#1f2937;color:#f3f4f6;padding:16px;border-radius:8px;overflow-x:auto;font-size:12px;max-height:400px;overflow-y:auto}</style></head><body><h1>Build Failed</h1><p>The generated code has errors. See the build log below for details.</p><p><a href=\"./report/index.html\">View Full Report</a></p><h2>Build Output</h2><pre>$(cat /tmp/factory/build.log | tail -100 | sed \"s/</\\&lt;/g\" | sed \"s/>/\\&gt;/g\")</pre></body></html>" > /tmp/factory/index.html; fi'
            - echo "Uploading report + artifacts"
            - 'aws s3 cp /tmp/factory/index.html "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/index.html" --content-type "text/html" || true'
            - 'aws s3 cp /tmp/factory/report/index.html "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/index.html" --content-type "text/html" || true'
            - 'aws s3 cp /tmp/factory/build.log "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/build.log" --content-type "text/plain" || true'
            - 'test -f /tmp/factory/module_patch_applied.log && aws s3 cp /tmp/factory/module_patch_applied.log "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/module_patch_applied.log" --content-type "text/plain" || true'
            - 'test -f /tmp/factory/module_patch_errors.log && aws s3 cp /tmp/factory/module_patch_errors.log "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/module_patch_errors.log" --content-type "text/plain" || true'
            - 'test -f /tmp/factory/patch.diff && aws s3 cp /tmp/factory/patch.diff "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/patch.diff" --content-type "text/plain" || true'
            - 'aws s3 cp /tmp/factory/patch_apply_error.log "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/patch_apply_error.log" --content-type "text/plain" || true'
            - 'test -f /tmp/factory/files_write.log && aws s3 cp /tmp/factory/files_write.log "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/files_write.log" --content-type "text/plain" || true'
            - 'test -f /tmp/factory/files.json && aws s3 cp /tmp/factory/files.json "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/files.json" --content-type "application/json" || true'
            - 'test -f /tmp/factory/bundle.zip && aws s3 cp /tmp/factory/bundle.zip "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/report/bundle.zip" --content-type "application/zip" || true'
            - 'test -d "$TEMPLATE_DIR/frontend/out" && aws s3 sync "$TEMPLATE_DIR/frontend/out" "s3://$PREVIEW_BUCKET/p/$PROJECT_ID/$BUILD_ID/app" --delete || echo "No static export found; skipping app upload"'
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

resource "aws_dynamodb_table" "factory_chats" {
  name         = "${local.sanitized_prefix}-factory-chats"
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

  ttl {
    attribute_name = "ttl"
    enabled        = true
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
