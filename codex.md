# Codex Agent Usage

Guide for using AI coding agents (Codex, Cursor, etc.) with this repository.

## Entry Points

Primary files to start understanding the codebase:

### Backend (Python Lambda)
- `backend/lambdas/*/handler.py` - Lambda function handlers
- `backend/lambdas/common/` - Shared utilities (DynamoDB, responses, config)
- `backend/Makefile` - Build system

### Infrastructure (Terraform)
- `infra/terraform/main.tf` - Main infrastructure definitions
- `infra/terraform/variables.tf` - Configuration variables
- `infra/terraform/outputs.tf` - Deployment outputs

### Frontend (Next.js)
- `src/app/` - Next.js app router pages
- `src/components/` - React components
- `src/lib/` - Utility functions

## Context Files

Load these files to understand the system:

1. `docs/context/context.md` - Problem space and business context
2. `docs/architecture/architecture.md` - Technical architecture and data flows
3. `warp.md` - Quick commands and workflows
4. `.kiro/steering/` - Project standards and guidelines

## Common Tasks

### Adding a New Lambda Function

1. Create directory: `backend/lambdas/new_function/`
2. Create handler: `backend/lambdas/new_function/handler.py`
3. Create requirements: `backend/lambdas/new_function/requirements.txt`
4. Update Makefile: Add to `LAMBDA_DIRS`
5. Add to Terraform: Create Lambda resource in `infra/terraform/main.tf`
6. Add API route: Create integration and route in Terraform

### Modifying API Contracts

1. Update handler in `backend/lambdas/*/handler.py`
2. Update `docs/architecture/architecture.md` with new contract
3. Test with curl or Postman
4. Update frontend API calls if needed

### Adding New Infrastructure

1. Add Terraform resource in `infra/terraform/main.tf`
2. Add variables if needed in `variables.tf`
3. Add outputs if needed in `outputs.tf`
4. Run `terraform validate` and `terraform plan`
5. Document in `docs/architecture/architecture.md`

## Guardrails

**IAM & Security:**
- Always use least-privilege IAM policies
- Specify explicit resource ARNs (no wildcards)
- Never commit secrets to version control
- Use SSM Parameter Store for sensitive configuration
- Keep Lambda handlers idempotent

**Code Quality:**
- Type hints for Python functions
- Error handling with try/except
- Logging with print() for CloudWatch
- Return proper HTTP status codes
- Test Lambda handlers locally when possible

**Infrastructure:**
- Always run `terraform validate` before commit
- Use variables for reusable values
- Tag all resources with Project, Stage, ManagedBy
- Set appropriate CloudWatch log retention
- Enable encryption for data at rest

**Documentation:**
- Update `docs/` when changing APIs or architecture
- Keep `warp.md` current with new commands
- Add comments for complex business logic
- Update steering docs for new patterns or decisions

## Agent Prompts

### For Code Changes
```
Context: [Describe what you're building]
Entry point: backend/lambdas/[function]/handler.py
Requirements:
- Follow existing patterns in common/ modules
- Add proper error handling
- Update docs/architecture/architecture.md
- Follow .kiro/steering/coding_standards.md
```

### For Infrastructure
```
Context: [What infrastructure you need]
Entry point: infra/terraform/main.tf
Requirements:
- Use variables from variables.tf
- Follow existing resource naming conventions
- Add CloudWatch logging
- Use least-privilege IAM
- Follow .kiro/steering/security_checklist.md
```

## Testing with Agents

Ask agents to:
1. Validate syntax: `terraform validate`, `python -m py_compile`
2. Check formatting: `terraform fmt`, `black`
3. Review against checklists in `.kiro/steering/`
4. Generate test cases for Lambda handlers
5. Create curl commands for API testing

## Best Practices

- Load relevant steering documents before major changes
- Reference existing patterns (don't reinvent)
- Ask agent to explain tradeoffs for architectural decisions
- Have agent update documentation alongside code
- Use agent to generate CloudWatch queries for debugging
- Request agent review code against security checklist

## Example Agent Workflow

1. **Understand**: Load context.md and architecture.md
2. **Plan**: Ask agent to outline approach and check steering docs
3. **Implement**: Code with agent, following existing patterns
4. **Document**: Update architecture.md and comments
5. **Validate**: Run terraform validate, make lint, make build
6. **Review**: Ask agent to check against review_checklist.md
