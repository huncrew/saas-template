#!/usr/bin/env bash
set -euo pipefail

# Deploy the Factory Next.js app to AWS Amplify via AWS CLI (no console clicks).
#
# Requirements:
# - aws cli configured (credentials + region)
# - a GitHub access token (fine-grained PAT works) exported as GITHUB_TOKEN
#
# Safe default:
# - Deploys to Amplify default domain only.
# - To migrate oasify.ai, set MIGRATE_DOMAIN=1 (this will replace the current site).
#
# Example:
#   export GITHUB_TOKEN="..."; \
#   export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."; \
#   export CLERK_SECRET_KEY="sk_live_..."; \
#   export BACKEND_API_URL="https://xxxx.execute-api.us-east-1.amazonaws.com/dev"; \
#   export ORCHESTRATOR_API_URL="http://xxxx.elb.amazonaws.com"; \
#   bash scripts/amplify_deploy_factory.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

AWS_REGION="${AWS_REGION:-us-east-1}"
APP_NAME="${AMPLIFY_APP_NAME:-factory}"
REPO_URL="${GITHUB_REPO_URL:-https://github.com/huncrew/saas-template}"
BRANCH_NAME="${GITHUB_BRANCH_NAME:-factory}"

MIGRATE_DOMAIN="${MIGRATE_DOMAIN:-0}"
DOMAIN_NAME="${DOMAIN_NAME:-oasify.ai}"
DOMAIN_BRANCH="${DOMAIN_BRANCH_NAME:-factory}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: ${name}" >&2
    exit 1
  fi
}

require_env GITHUB_TOKEN
require_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
require_env CLERK_SECRET_KEY
require_env BACKEND_API_URL
require_env ORCHESTRATOR_API_URL

if [[ ! -f "amplify.yml" ]]; then
  echo "Missing amplify.yml at repo root. Aborting." >&2
  exit 1
fi

echo "Creating Amplify app '${APP_NAME}' (repo=${REPO_URL} branch=${BRANCH_NAME}) in ${AWS_REGION}..."
APP_ID="$(
  aws amplify create-app \
    --name "${APP_NAME}" \
    --repository "${REPO_URL}" \
    --access-token "${GITHUB_TOKEN}" \
    --platform WEB_COMPUTE \
    --build-spec file://amplify.yml \
    --enable-branch-auto-build \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --output json \
  | python -c 'import json,sys; print(json.load(sys.stdin)["app"]["appId"])'
)"

echo "Amplify appId=${APP_ID}"

echo "Creating branch '${BRANCH_NAME}'..."
aws amplify create-branch \
  --app-id "${APP_ID}" \
  --branch-name "${BRANCH_NAME}" \
  --enable-auto-build \
  --stage PRODUCTION \
  --region "${AWS_REGION}" \
  --no-cli-pager \
  --output json >/dev/null

echo "Setting environment variables on branch '${BRANCH_NAME}'..."
aws amplify update-branch \
  --app-id "${APP_ID}" \
  --branch-name "${BRANCH_NAME}" \
  --environment-variables \
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}" \
    "CLERK_SECRET_KEY=${CLERK_SECRET_KEY}" \
    "CLERK_SIGN_IN_URL=/auth/signin" \
    "CLERK_SIGN_UP_URL=/auth/signup" \
    "CLERK_AFTER_SIGN_IN_URL=/projects" \
    "CLERK_AFTER_SIGN_UP_URL=/projects" \
    "BACKEND_API_URL=${BACKEND_API_URL}" \
    "NEXT_PUBLIC_API_BASE_URL=${BACKEND_API_URL}" \
    "ORCHESTRATOR_API_URL=${ORCHESTRATOR_API_URL}" \
    "NEXT_PUBLIC_ORCHESTRATOR_API_URL=${ORCHESTRATOR_API_URL}" \
    "FACTORY_DEV_NO_AUTH=0" \
    "NEXT_PUBLIC_FACTORY_DEV_NO_AUTH=0" \
  --region "${AWS_REGION}" \
  --no-cli-pager \
  --output json >/dev/null

echo "Starting deploy job..."
JOB_ID="$(
  aws amplify start-job \
    --app-id "${APP_ID}" \
    --branch-name "${BRANCH_NAME}" \
    --job-type RELEASE \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --output json \
  | python -c 'import json,sys; print(json.load(sys.stdin)["jobSummary"]["jobId"])'
)"

echo "Deploy started. jobId=${JOB_ID}"

DEFAULT_DOMAIN="$(
  aws amplify get-app \
    --app-id "${APP_ID}" \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --output json \
  | python -c 'import json,sys; print(json.load(sys.stdin)["app"]["defaultDomain"])'
)"

echo "Once the job completes, you can access:"
echo "  https://${BRANCH_NAME}.${DEFAULT_DOMAIN}"

if [[ "${MIGRATE_DOMAIN}" != "1" ]]; then
  echo "Skipping domain migration (set MIGRATE_DOMAIN=1 to move ${DOMAIN_NAME})."
  exit 0
fi

echo "Migrating ${DOMAIN_NAME} to this Amplify app (this replaces the current site)..."
echo "Deleting any existing domain association on other apps must be done separately (provide OLD_APP_ID if needed)."

OLD_APP_ID="${OLD_APP_ID:-}"
if [[ -n "${OLD_APP_ID}" ]]; then
  aws amplify delete-domain-association \
    --app-id "${OLD_APP_ID}" \
    --domain-name "${DOMAIN_NAME}" \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --output json >/dev/null || true
fi

DA_OUT="$(aws amplify create-domain-association \
  --app-id "${APP_ID}" \
  --domain-name "${DOMAIN_NAME}" \
  --sub-domain-settings "prefix=,branchName=${DOMAIN_BRANCH}" "prefix=www,branchName=${DOMAIN_BRANCH}" \
  --region "${AWS_REGION}" \
  --no-cli-pager \
  --output json
)"

CF_DOMAIN="$(
  python - <<'PY'
import json,sys,re
da=json.loads(sys.stdin.read())["domainAssociation"]
subs=da.get("subDomains",[])
root=[s for s in subs if s.get("subDomainSetting",{}).get("prefix","")==""]
if not root: 
  print("")
  raise SystemExit(0)
dns=root[0].get("dnsRecord","")
m=re.search(r'\\sCNAME\\s+([^\\s]+)$', dns.strip())
print(m.group(1) if m else "")
PY
<<<"${DA_OUT}"
)"

if [[ -z "${CF_DOMAIN}" ]]; then
  echo "Could not parse CloudFront domain from Amplify domain association output. Aborting DNS update." >&2
  exit 1
fi

ZONE_ID="$(
  aws route53 list-hosted-zones-by-name \
    --dns-name "${DOMAIN_NAME}" \
    --region "${AWS_REGION}" \
    --no-cli-pager \
    --output json \
  | python -c 'import json,sys; z=json.load(sys.stdin)["HostedZones"][0]["Id"]; print(z.split("/")[-1])'
)"

echo "Updating Route53 (zone=${ZONE_ID}) to point ${DOMAIN_NAME} and www to ${CF_DOMAIN}..."

cat > /tmp/route53-change.json <<JSON
{
  "Comment": "Point ${DOMAIN_NAME} to Amplify (${APP_ID})",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN_NAME}.",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "${CF_DOMAIN}.",
          "EvaluateTargetHealth": false
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.${DOMAIN_NAME}.",
        "Type": "CNAME",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "${CF_DOMAIN}" }]
      }
    }
  ]
}
JSON

aws route53 change-resource-record-sets \
  --hosted-zone-id "${ZONE_ID}" \
  --change-batch file:///tmp/route53-change.json \
  --no-cli-pager \
  --output json >/dev/null

rm -f /tmp/route53-change.json

echo "Domain migration requested. Amplify will finish cert/verification automatically if needed."


