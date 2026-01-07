version: "0.1"
name: "Prod-Ready SaaS App Builder (Chat + Preview + Deploy)"
codename: "Factory"
created_at: "2025-12-29"
owner: "Dale"
defaults:
  iac: "terraform"
  cloud: "aws"
  primary_goal: "Chat -> build -> preview -> deploy -> iterate with rollback"
  sprint_goal:
    duration_days: 14
    ship_definition:
      - "1 template end-to-end (SaaS CRUD or Document Q&A)"
      - "hosted preview URL"
      - "1-click deploy to platform AWS account"
      - "iteration via chat produces new preview + redeploy"
      - "basic security gates + clear logs + retry/rollback"

product_positioning:
  promise: "Shippable apps, not demos"
  tagline_candidates:
    - "Prompt → Production"
    - "Build fast. Ship safely."
    - "The AI builder for apps that must work."
  target_users:
    primary: "Indie founders + agencies + internal tool builders who want production-ready output"
    secondary: "Teams who prototype in Lovable/Replit and then need real deployment + guardrails"
  differentiation:
    - "Opinionated, production-ready templates"
    - "Terraform-based deploy with environments + auditable plans"
    - "Security + architecture artifacts generated per build"
    - "Deterministic build pipeline (artifacts, logs, diffs, rollback)"

ux:
  layout:
    left: "Chat (guided Q&A + freeform)"
    right:
      tabs:
        - "Preview"
        - "Changes"
        - "Architecture"
        - "Checks"
        - "Deploy"
  interaction_model:
    - "User chats -> system proposes plan/spec -> user confirms -> build starts"
    - "Build produces preview URL + changes summary"
    - "User iterates via chat -> new build -> preview updates"
    - "User clicks Deploy -> terraform plan/apply -> prod URL"
  key_ui_objects:
    project:
      fields: [project_id, name, template_id, created_at, last_build_id, status]
    build:
      fields:
        - build_id
        - project_id
        - type: ["preview", "deploy"]
        - status: ["queued", "running", "failed", "succeeded"]
        - started_at
        - finished_at
        - artifacts: [repo_ref, preview_url, deploy_urls, logs_url, tf_plan_url, checks_report_url]
    env_vars:
      ui_behavior:
        - "Detect required env vars from template + integrations"
        - "Prompt user to set missing values"
        - "Store secrets securely (never print raw values)"
    actions:
      - "Build Preview"
      - "Deploy"
      - "Redeploy"
      - "Rollback to previous build"
      - "Export repo"

templates:
  strategy:
    - "Templates are the moat; start with 1 and nail the pipeline."
    - "Every template ships with: app skeleton, tests, lint, Terraform module(s), security baselines, runbook."
  v1_template_choices:
    - id: "saas-crud"
      description: "Teams/orgs, auth, CRUD resource, admin page, audit log, billing stub"
      preview_mode: "static (preferred) or preview-env"
    - id: "doc-qa"
      description: "Upload docs, index, chat Q&A, optional voice; team auth"
      preview_mode: "preview-env recommended if server-side features required"
  template_requirements:
    repo_layout:
      - "apps/web (Next.js)"
      - "services/api (if separate)"
      - "infra/terraform (modules + env stacks)"
      - "docs/runbook.md"
      - "checks/ (policies + scanning config)"
    must_have:
      - "Health endpoint + smoke test"
      - "Request correlation IDs"
      - "Structured logs"
      - "Basic authz checks on privileged routes"
      - "Terraform plan/apply works from clean state"

architecture:
  diagram_mermaid: |
    flowchart LR
      U[User] -->|Chat + Q&A| UI[Web App UI]
      UI -->|Spec/Change Req| ORCH[Orchestrator API (ECS/Fargate)]
      ORCH -->|Create Job| DB[(DynamoDB: projects/builds)]
      ORCH -->|Store Artifacts| S3[(S3: artifacts)]
      ORCH -->|Start Build| CB[CodeBuild: build/preview/deploy]

      CB -->|Checkout template + project repo| GIT[(Git repo per project)]
      CB -->|Run codegen step (Codex CLI or Patch)| GEN[Codegen]
      CB -->|Tests/Lint/Build| ART[Build Artifacts]
      ART --> S3
      CB -->|Publish Preview| CF[CloudFront + S3 Preview]
      CB -->|Terraform Plan/Apply| TF[Terraform]
      TF --> AWS[(AWS Account: platform deploy)]
      CB -->|Logs| CW[(CloudWatch Logs)]
      UI <-->|Status + URLs| ORCH

  key_decisions:
    preview:
      v1: "Hosted preview URL via CloudFront + S3 (static) OR preview environment deploy"
      rationale: "Matches Lovable/Replit UX; user sees visual result quickly."
    orchestration_compute:
      v1: "ECS/Fargate service for orchestrator"
      why_not_lambda: "Streaming + long orchestration + tool calls + retries = painful in Lambda."
    builds:
      v1: "CodeBuild for deterministic, isolated build/test/deploy runs."
    terraform_execution:
      v1: "Terraform runs inside CodeBuild (plan/apply), outputs persisted to S3."

implementation:
  services:
    web_ui:
      purpose: "Chat + Preview + Build status + Env var management + Deploy controls"
      stack:
        frontend: "Next.js"
        hosting_v1: "S3 + CloudFront (static export) OR container hosting later"
      routes:
        - "/projects"
        - "/projects/:id"
        - "/projects/:id/builds/:build_id"
        - "/projects/:id/settings/env"
    orchestrator_api:
      purpose: "Turns chat into specs/patches; triggers builds; aggregates artifacts; streams status."
      compute: "ECS/Fargate"
      api_style: "REST + SSE (or WebSocket) for build logs/status streaming"
      endpoints:
        - "POST /v1/projects"
        - "GET  /v1/projects/:id"
        - "POST /v1/projects/:id/chat"          # produces spec/change_spec
        - "POST /v1/projects/:id/build-preview" # enqueue preview build
        - "POST /v1/projects/:id/deploy"        # enqueue deploy build
        - "POST /v1/projects/:id/rollback"      # set target build + redeploy
        - "GET  /v1/builds/:build_id"           # status + artifacts
        - "GET  /v1/builds/:build_id/logs"      # proxied logs (optional)
        - "PUT  /v1/projects/:id/env"           # set env vars/secrets
    build_runner:
      purpose: "Runs in CodeBuild; performs codegen + test + build + preview publish + terraform deploy"
      system: "AWS CodeBuild"

  data:
    dynamodb_tables:
      - name: "projects"
        keys: {pk: "project_id"}
      - name: "builds"
        keys: {pk: "build_id"}
        gsi:
          - name: "gsi_project_builds"
            pk: "project_id"
            sk: "created_at"
      - name: "envvars"
        keys: {pk: "project_id", sk: "key"}
        note: "Store only metadata here; secrets in Secrets Manager/SSM"
    artifact_storage_s3:
      bucket_prefix: "factory-artifacts"
      layout:
        - "s3://{bucket}/projects/{project_id}/specs/{spec_id}.json"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/repo.zip"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/preview/"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/reports/checks.json"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/reports/architecture.md"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/reports/terraform-plan.txt"
        - "s3://{bucket}/projects/{project_id}/builds/{build_id}/outputs/outputs.json"

  repo_strategy:
    canonical_state: "git"
    options:
      - "GitHub repos under platform org (private by default)"
      - "Self-hosted git later; V1 can be GitHub-only to move fast"
    workflow:
      - "Project created from template repo"
      - "Each build results in a commit (or a tag) with build_id"
      - "Rollback = checkout previous tag/commit and redeploy"
    export:
      v1: "Export by granting access or mirroring to user GitHub org"
      note: "Avoid editing user arbitrary repos in V1; reduces weird restrictions."

codegen:
  philosophy:
    - "Templates + patches; avoid freeform codegen from nothing."
    - "Orchestrator produces structured change_spec; builder applies it."
  engines:
    v1_preferred: "Codex CLI inside CodeBuild (simple)"
    v2: "Model API generates patches; CodeBuild applies deterministically"
  codex_cli_mode:
    where: "inside CodeBuild workspace"
    responsibilities:
      - "Read change_spec.json"
      - "Edit files in-place"
      - "Generate/modify routes/components"
      - "Update tests"
    guardrails:
      - "Allowlist directories it can modify"
      - "Reject edits that touch forbidden paths (e.g., infra baseline modules) unless explicitly requested"
      - "Max iterations per build (e.g., 2 fix attempts)"

preview_and_deploy:
  preview_modes:
    static_preview:
      description: "Upload built static frontend to S3 and serve via CloudFront under /p/{project}/{build}/"
      best_for: ["SaaS CRUD if API is mocked or uses public demo endpoints"]
      terraform: "preview distribution + S3"
    preview_environment:
      description: "Deploy a 'preview' environment with Terraform (cheaper/simpler than per-user ECS preview)"
      best_for: ["doc-qa", "anything requiring server-side API runtime"]
      envs: ["preview", "prod"]
  deploy_mode_v1:
    deploy_target: "platform AWS account"
    later: "deploy to user's AWS account (assume-role, BYOA)"
  environment_vars:
    storage:
      secrets: "AWS Secrets Manager (or SSM SecureString)"
      non_secrets: "DynamoDB metadata + SSM plain params"
    injection:
      - "CodeBuild reads secrets at runtime and passes to terraform/app as needed"
      - "Never log raw secret values"

security_and_checks:
  stance: "Baseline gates + transparency; not 'perfect security'."
  build_gates:
    fail_on:
      - "secrets detected in repo"
      - "critical dependency vulnerabilities (configurable)"
      - "terraform misconfig criticals (public buckets, 0.0.0.0/0 inbound on sensitive ports, etc.)"
    warn_on:
      - "missing rate limiting"
      - "CORS too permissive"
      - "missing audit log events"
  checks_pipeline_steps:
    - "gitleaks (or equivalent) secrets scan"
    - "npm audit / pip audit (depending on stack)"
    - "terraform validate"
    - "tfsec / checkov (choose one for V1)"
    - "basic authz route scan (template-defined checks)"
  artifacts:
    - "checks report JSON"
    - "human-readable checklist markdown"

pipelines:
  build_types:
    - name: "preview_build"
      triggers: ["user clicks Build Preview", "chat change accepted"]
    - name: "deploy_build"
      triggers: ["user clicks Deploy", "auto after preview success (optional)"]
  codebuild_projects:
    - id: "factory-preview"
      description: "Build + checks + publish preview"
    - id: "factory-deploy"
      description: "Build (if needed) + checks + terraform plan/apply + outputs"
  buildspec_templates:
    preview_buildspec_yml: |
      version: 0.2
      phases:
        install:
          commands:
            - echo "Install deps/tooling"
            - node --version
            - npm --version
            - terraform --version
            # install codex CLI or your codegen runner here
        pre_build:
          commands:
            - echo "Fetch project repo + spec"
            - ./scripts/fetch_repo.sh "$PROJECT_ID" "$TARGET_REF"
            - ./scripts/fetch_spec.sh "$SPEC_S3_URI" ./spec.json
            - ./scripts/inject_env_metadata.sh "$PROJECT_ID"
        build:
          commands:
            - echo "Apply changes (codegen) if change_spec present"
            - ./scripts/run_codegen.sh ./spec.json
            - echo "Run tests"
            - ./scripts/test.sh
            - echo "Build frontend"
            - ./scripts/build_web.sh
        post_build:
          commands:
            - echo "Run security checks"
            - ./scripts/run_checks.sh
            - echo "Publish preview"
            - ./scripts/publish_preview.sh "$PROJECT_ID" "$BUILD_ID"
            - echo "Persist artifacts"
            - ./scripts/persist_artifacts.sh "$PROJECT_ID" "$BUILD_ID"
      artifacts:
        files:
          - "**/*"
        discard-paths: yes

    deploy_buildspec_yml: |
      version: 0.2
      phases:
        install:
          commands:
            - terraform --version
            - node --version
        pre_build:
          commands:
            - ./scripts/fetch_repo.sh "$PROJECT_ID" "$TARGET_REF"
            - ./scripts/fetch_spec.sh "$SPEC_S3_URI" ./spec.json
            - ./scripts/load_secrets.sh "$PROJECT_ID"   # pull from Secrets Manager/SSM securely
        build:
          commands:
            - ./scripts/run_codegen.sh ./spec.json
            - ./scripts/test.sh
            - ./scripts/run_checks.sh
        post_build:
          commands:
            - echo "Terraform plan/apply"
            - cd infra/terraform/envs/$ENV
            - terraform init -input=false
            - terraform plan -out=tfplan -input=false
            - terraform show -no-color tfplan > /tmp/terraform-plan.txt
            - terraform apply -auto-approve -input=false tfplan
            - terraform output -json > /tmp/outputs.json
            - ./scripts/upload_deploy_outputs.sh "$PROJECT_ID" "$BUILD_ID" /tmp/outputs.json /tmp/terraform-plan.txt

terraform:
  module_layout:
    root: "infra/terraform"
    modules:
      - name: "platform-core"
        purpose: "Orchestrator + UI + artifact storage + CodeBuild + IAM"
      - name: "preview-hosting"
        purpose: "S3 + CloudFront for previews"
      - name: "app-saas-crud"
        purpose: "Generated app infrastructure (API + DB + hosting) for SaaS CRUD template"
      - name: "app-doc-qa"
        purpose: "Generated app infrastructure (uploads + indexing + Q&A runtime)"
    environments:
      - name: "platform"
        description: "Runs the builder platform itself"
      - name: "preview"
        description: "Optional environment for runtime preview"
      - name: "prod"
        description: "Deployed user apps (platform-managed in V1)"
  iam_principles:
    - "Separate IAM role per CodeBuild project"
    - "Least privilege on S3 prefixes per project"
    - "Terraform apply role constrained to expected resources via policy where feasible"
    - "No long-lived credentials exposed to generated code"

operational:
  logging:
    - "Orchestrator: structured logs + request IDs"
    - "Builds: CloudWatch Logs; link surfaced in UI"
    - "Apps: structured logging baseline in template"
  retries:
    build_retry_policy:
      max_attempts: 2
      on_failure:
        - "Summarize error"
        - "Attempt small patch fix (bounded)"
        - "Rerun build"
  rollback:
    mechanism: "git tag per build + terraform redeploy from previous tag"
    user_flow: "Select build -> Rollback -> Deploy"
  constraints_v1:
    - "One template only (ship first)."
    - "One cloud account (platform AWS)."
    - "One preview mode (static or preview env, pick one)."
    - "One model integration mode (Codex CLI in CodeBuild)."

v1_scope_recommendation:
  choose_template_now:
    recommended: "saas-crud"
    reason: "Fastest to demo, easiest to preview, broad appeal."
  preview_choice:
    recommended: "static_preview"
    reason: "Lowest complexity in 2 weeks."
  deploy_choice:
    recommended: "deploy_build to platform AWS"
    reason: "Avoid BYOA complexity; still gives real URLs."

deliverables_by_day_14:
  must_ship:
    - "Chat UI + project creation + build button"
    - "One working template end-to-end"
    - "CodeBuild pipeline that builds + publishes preview URL"
    - "Terraform deploy pipeline that produces prod URL"
    - "Checks tab with at least: secrets scan + terraform validate + vuln scan summary"
    - "Rollback to previous build"
    - "Export repo (even if manual in V1)"
  success_metrics:
    - ">= 5 external users try it"
    - ">= 2 users iterate (2nd change request) successfully"
    - ">= 1 user deploys and shares a live URL"

open_questions_to_resolve_later:
  - "BYOA deploy (assume-role into user AWS)"
  - "Multi-template marketplace"
  - "Per-user isolated preview environments"
  - "Advanced security posture (SOC2 controls, SAST/DAST pipelines)"
  - "Cost controls / quotas per user/project"
