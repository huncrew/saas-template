locals {
  inline_policy_statements = [
    for statement in var.policy_statements : merge(
      {
        Effect   = statement.effect
        Action   = statement.actions
        Resource = statement.resources
      },
      statement.sid != null ? { Sid = statement.sid } : {},
      statement.condition != null ? { Condition = statement.condition } : {}
    )
  ]
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "this" {
  name_prefix        = "${var.function_name}-role-"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "inline" {
  count = length(locals.inline_policy_statements) > 0 ? 1 : 0

  name = "${var.function_name}-inline"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = locals.inline_policy_statements
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description
  filename      = var.package_path
  role          = aws_iam_role.this.arn
  handler       = var.handler
  runtime       = var.runtime
  memory_size   = var.memory_size
  timeout       = var.timeout
  publish       = var.publish
  layers        = var.layers
  architectures = var.architectures
  tags          = var.tags

  source_code_hash = try(filebase64sha256(var.package_path), null)

  environment {
    variables = var.environment
  }

  depends_on = [
    aws_iam_role_policy_attachment.basic_execution,
  ]
}
