provider "aws" {
  region  = var.region
  profile = var.aws_profile != "" ? var.aws_profile : null

  default_tags {
    tags = merge(
      {
        Project = var.project_name
        Stage   = var.stage
      },
      var.default_tags
    )
  }
}
