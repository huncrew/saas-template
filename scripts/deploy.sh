#!/bin/bash

# Terraform deployment helper

set -euo pipefail

STAGE="dev"
PROJECT_NAME="simple-saas-template"
APPLY=false

usage() {
  cat <<USAGE
Usage: $0 [--stage <stage>] [--project <name>] [--apply]

Options:
  --stage       Deployment stage (default: dev)
  --project     Terraform project_name variable (default: simple-saas-template)
  --apply       Run terraform apply after planning
  --help        Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="$2"
      shift 2
      ;;
    --project)
      PROJECT_NAME="$2"
      shift 2
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

printf '\n🚀 Deploying infrastructure (stage=%s, project=%s)\n' "$STAGE" "$PROJECT_NAME"

pushd backend >/dev/null
make build
popd >/dev/null

pushd infra/terraform >/dev/null
terraform init
terraform plan -var "stage=$STAGE" -var "project_name=$PROJECT_NAME"

if [ "$APPLY" = true ]; then
  terraform apply -auto-approve -var "stage=$STAGE" -var "project_name=$PROJECT_NAME"
fi
popd >/dev/null

printf '\n✅ Deployment workflow complete\n'
