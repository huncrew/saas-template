# Simple SaaS Template

A production-ready SaaS starter built with **Next.js 15**, **Terraform**, and **Python 3.11** Lambdas. It ships with Stripe billing, Cognito auth, and scaffolding for AI document analysis so you can launch finance/compliance products quickly.

## Features

- 🎯 Modern Next.js 15 frontend with Tailwind + shadcn/ui
- 🔐 Cognito + NextAuth for authentication (unchanged from the SST origin)
- 💳 Stripe checkout + webhook flows handled by Python Lambdas
- ☁️ Terraform-managed AWS stack (API Gateway HTTP API, Lambda, DynamoDB, S3)
- 🤖 AI endpoints ready for Bedrock-powered RAG pipelines (`/upload-url`, `/query`, `/ai/generate`)
- 📚 Extensive docs, steering files, and CI workflows for teams + agents

## Architecture Overview

```
Next.js ➜ API Gateway (HTTP) ➜ Lambda (Python 3.11) ➜ DynamoDB / S3 / Bedrock
```

- **Terraform** in `infra/terraform/` owns all AWS resources.
- **Python Lambdas** live in `backend/lambdas` and map 1:1 with API routes.
- **S3 uploads** trigger an optional `analyse_doc` Lambda for pipeline fan-out.
- **SSM Parameter Store** delivers secrets (Stripe keys, default Bedrock model, etc.).

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11
- Terraform 1.6+
- AWS CLI credentials with permissions for API Gateway, Lambda, S3, DynamoDB, Cognito, SSM
- Stripe account + API keys

### 1. Install frontend dependencies

```bash
cd frontend
npm install
```

### 2. Prepare environment variables

```bash
cp ../.env.example .env.local
```

Populate `frontend/.env.local` with your API base URL, AWS region/stage, Stripe keys, and (optionally) existing Cognito settings.

### 3. Build Lambda artifacts

```bash
cd ../backend
make build   # creates dist/*.zip for Terraform
```

> `make test` runs pytest; `make format` runs ruff + black.

### 4. Deploy infrastructure with Terraform

```bash
cd ../infra/terraform
terraform init
terraform plan -var "project_name=saas-template" -var "stage=dev"
terraform apply -var "project_name=saas-template" -var "stage=dev"
```

Outputs include the API base URL and bucket names. Sync them back to `.env.local` (e.g. `NEXT_PUBLIC_API_BASE_URL`).

### 5. Run the Next.js frontend

```bash
cd ../frontend
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) and the app will call the Terraform-backed API.

## Backend Development

- Code lives in `backend/lambdas/api/*/handler.py` with shared helpers under `backend/lambdas/common/`.
- `backend/pyproject.toml` configures black/ruff/pytest.
- `backend/Makefile` commands:
  - `make build` – installs pinned deps under `.build/` and packages zips into `dist/`
  - `make test` – runs pytest
  - `make format` – ruff (fix) + black
  - `make lint` – ruff check

The build uses constraint files to ensure deterministic dependencies for each Lambda.

## Infrastructure Layout (`infra/terraform`)

- `versions.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `main.tf`
- Modules:
  - `modules/api_gateway_http`
  - `modules/lambda_function`
  - `modules/s3_bucket`
- Resources provisioned:
  - API Gateway HTTP API + stage + access logs
  - Lambda functions for legacy SaaS routes (`/auth/session`, `/stripe/*`, `/ai/*`, `/subscription/status`) and new AI endpoints
  - S3 buckets (uploads + optional curated)
  - DynamoDB table, Cognito pool/client, SSM parameters, optional SQS queues
  - CloudWatch alarms for API 5XX and DLQ depth

Run `terraform fmt`, `terraform validate`, and `terraform plan` before committing.

## CI/CD

- `.github/workflows/ci.yml` runs linting, tests, and Terraform validation on push/PR.
- `.github/workflows/deploy.yml` offers a `workflow_dispatch` pipeline that builds Lambda artifacts, assumes an AWS role, and runs `terraform plan` / `terraform apply` (controlled via inputs).

Configure repository secrets:
- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `PROJECT_NAME` (optional override for Terraform var)

## Project Structure

```
.
├── backend/
│   ├── lambdas/
│   │   ├── common/
│   │   └── api/...
│   ├── Makefile
│   ├── pyproject.toml
│   └── tests/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── next.config.ts
│   └── postcss.config.mjs
├── infra/
│   └── terraform/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── providers.tf
│       ├── versions.tf
│       └── modules/
├── docs/
│   ├── context/context.md
│   └── architecture/architecture.md
├── .kiro/steering/
│   ├── project_goals.md
│   ├── coding_standards.md
│   ├── security_checklist.md
│   └── review_checklist.md
├── scripts/
│   └── deploy.sh
├── warp.md
├── codex.md
└── README.md
```

## Environment Variables

Key variables used across the stack:

- `NODE_ENV`, `STAGE`, `AWS_REGION`
- `NEXT_PUBLIC_API_BASE_URL` – consumed by the frontend
- `UPLOADS_BUCKET` – provided to Lambdas + frontend for presigned uploads
- `STRIPE_PUBLIC_KEY` / `STRIPE_SECRET_KEY` – stored in SSM (secret key) and front-end env (public key)
- `STRIPE_WEBHOOK_SECRET` – stored in SSM
- `ALLOWED_ORIGINS` – comma-delimited list for CORS responses

## Deployment Notes

1. Run `backend/make build` prior to any Terraform operation so the zip artifacts exist.
2. Ensure SSM parameters contain real secrets before switching to production.
3. Update Cognito callback/logout URLs in Terraform when deploying beyond localhost.
4. Stripe webhook endpoint: `${API_BASE_URL}/stripe/webhook` (set in Dashboard).

## Contributing

1. Fork & branch (`feat/...` or `fix/...`).
2. Run `make format` (backend) + `npm run lint` (frontend) before pushing.
3. Ensure `terraform fmt` and `terraform validate` succeed.
4. Submit PR with notes on Terraform outputs/env changes.

## License

MIT License. See `LICENSE` for details.
