import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  Gauge,
  Layers,
  Cloud,
  GitPullRequest,
  ShieldCheck,
  Sparkles,
  Workflow,
  BrainCircuit,
  Rocket,
  Radar,
  ServerCog,
  BookOpen,
  Zap,
  Grid3x3,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navigation />
      <main className="relative overflow-hidden pt-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-20%] left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[140px]" />
        </div>

        <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-24">
          <div className="flex flex-col gap-8 rounded-3xl border border-white/10 bg-slate-900/60 p-10 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-1.5 text-sm text-cyan-200">
                <Sparkles className="h-4 w-4" />
                AWS-native AI Operations
              </span>
              <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Design, test, and deploy CloudOps agents in one orchestration studio
          </h1>
              <p className="text-lg text-slate-300">
                CloudOps Agent Studio ingests live AWS metadata, spins up embedded Well-Architected
                and Cost specialists, and recommends guarded actions you can ship as GitHub PRs or
                reversible direct changes.
          </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/30 hover:from-cyan-300 hover:to-emerald-300"
                  asChild
                >
              <Link href="/dashboard">
                    Launch Console
                    <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-slate-600 text-slate-200 hover:bg-slate-900"
                  asChild
                >
                  <Link href="#workflow">See how it works</Link>
            </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureChip icon={Gauge} label="Sync → Chat → Action loop" />
              <FeatureChip icon={GitPullRequest} label="Terraform-ready patches" />
              <FeatureChip icon={ShieldCheck} label="Guard-railed AWS operations" />
              <FeatureChip icon={BrainCircuit} label="LangGraph + Bedrock orchestration" />
            </div>
          </div>
        </section>

        <section id="platform" className="relative mx-auto mt-0 w-full max-w-6xl px-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <HighlightCard
              title="Single-pass AWS ingest"
              description="Lambda inventory across EC2, Lambda, S3, DynamoDB, RDS, and API Gateway lands snapshots in S3 and structured metadata in DynamoDB."
              icon={Cloud}
            />
            <HighlightCard
              title="Composable agent roster"
              description="Well-Architected, Cost, AI Workflow, and custom agents with heuristics, tool calls, and Bedrock summarisation."
              icon={Layers}
            />
            <HighlightCard
              title="IaC-first remediation"
              description="Proposed actions arrive with Terraform patch suggestions, risk context, rollback, and cost deltas."
              icon={GitPullRequest}
            />
            <HighlightCard
              title="Direct change with rails"
              description="Feature flag unlocks reversible ops such as enabling Lambda X-Ray, DynamoDB TTL, or S3 lifecycle policies."
              icon={ShieldCheck}
            />
          </div>
        </section>

        <section id="agents" className="relative mx-auto mt-24 w-full max-w-6xl px-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <span className="text-sm uppercase tracking-[0.2em] text-cyan-200">Agent Catalog</span>
              <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
                Specialists tuned for CloudOps workloads
              </h2>
            </div>
            <p className="max-w-xl text-slate-300">
              Each agent ships with a curated toolkit, heuristics library, and Bedrock prompt. Extend
              the roster with bespoke Graph nodes or plug in additional AWS APIs without leaving the studio.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <AgentCard
              title="Well-Architected Advisor"
              badge="Reliability · Security"
              description="Surfaces observability and security gaps, recommends remediation guardrails, and tracks alignment against AWS pillars."
              highlights={["Lambda tracing coverage", "Public access scans", "Audit-ready findings"]}
            />
            <AgentCard
              title="Cost Strategist"
              badge="FinOps"
              description="Blends Cost Explorer, usage heuristics, and AI insights to flag waste, forecast impact, and automate IaC savings."
              highlights={["Right-size signals", "Lifecycle gaps", "Commitment opportunities"]}
            />
            <AgentCard
              title="AI Workflow Designer"
              badge="Automation"
              description="Maps manual data flows, designs Bedrock-based pipelines, and scaffolds serverless glue to productionize prototypes."
              highlights={["AI playbooks", "Bedrock prompt critique", "Pipeline topology"]}
            />
          </div>
        </section>

        <section
          id="workflow"
          className="relative mx-auto mt-28 w-full max-w-6xl rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/80 to-slate-950 px-6 py-12 shadow-[0_20px_80px_rgba(8,47,73,0.35)]"
        >
          <div className="mx-auto max-w-5xl space-y-8 text-center">
            <span className="text-sm uppercase tracking-[0.25em] text-cyan-200">Workflow</span>
            <h2 className="text-3xl font-semibold text-white md:text-4xl">
              Build, evaluate, and ship agents with a four-stage flywheel
            </h2>
            <div className="grid gap-4 md:grid-cols-4">
              <WorkflowStep
                icon={Zap}
                title="1 · Snapshot"
                description="On-demand ingest captures live AWS posture and saves deterministic state to DynamoDB + S3."
              />
              <WorkflowStep
                icon={BrainCircuit}
                title="2 · Reason"
                description="LangGraph orchestrator blends heuristics, tool calls, and Bedrock summaries for grounded conversations."
              />
              <WorkflowStep
                icon={Workflow}
                title="3 · Propose"
                description="Agents emit structured actions with diff previews, risk commentary, cost delta, and rollback."
              />
              <WorkflowStep
                icon={Rocket}
                title="4 · Act"
                description="Select PR-first delivery via GitHub App or enable reversible direct changes for rapid iteration."
              />
            </div>
                </div>
        </section>

        <section
          id="integrations"
          className="relative mx-auto mt-28 w-full max-w-6xl px-6 pb-24"
        >
          <div className="grid gap-8 lg:grid-cols-[1.4fr,1fr]">
            <Card className="border-white/10 bg-slate-900/70 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-2xl text-white">Integrated operator stack</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-slate-300">
                <StackRow
                  icon={ServerCog}
                  title="API & Execution"
                  description="API Gateway HTTP APIs front FastAPI Lambdas packaged with shared CloudOps utilities."
                />
                <StackRow
                  icon={Grid3x3}
                  title="State & Snapshots"
                  description="DynamoDB tables track accounts, resources, costs, findings, and actions; S3 snapshots archive ingest payloads."
                />
                <StackRow
                  icon={Radar}
                  title="Telemetry"
                  description="CloudWatch wiring captures Lambda metrics, while tool runtimes expose observability inside the console."
                />
                <StackRow
                  icon={BookOpen}
                  title="Configuration"
                  description="Terraform modules provision IAM, SSM parameters, feature flags, and GitHub App wiring for PR automation."
                />
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-slate-900/50 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Why teams adopt CloudOps Agent Studio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-300">
                <Benefit
                  title="Faster remediation loops"
                  description="Ship IaC pull requests with embedded rationale in minutes, not days."
                />
                <Benefit
                  title="Audit-ready trail"
                  description="Every chat, action, and tool invocation is persisted for compliance and handoff."
                />
                <Benefit
                  title="Extensible design"
                  description="Bring your own tools, models, and heuristics while retaining centralized governance."
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200 backdrop-blur">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/80">
        <Icon className="h-4 w-4 text-cyan-300" />
      </span>
      {label}
    </div>
  );
}

function HighlightCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-white/10 bg-slate-900/60 backdrop-blur">
      <CardHeader className="space-y-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800/80">
          <Icon className="h-5 w-5 text-cyan-300" />
        </span>
        <CardTitle className="text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-300">{description}</CardContent>
    </Card>
  );
}

function AgentCard({
  title,
  description,
  highlights,
  badge,
}: {
  title: string;
  description: string;
  highlights: string[];
  badge: string;
}) {
  return (
    <Card className="flex flex-col justify-between border-white/10 bg-slate-900/60 p-6 backdrop-blur">
      <div className="space-y-3">
        <span className="inline-flex w-fit items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">
          {badge}
        </span>
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="text-sm text-slate-300">{description}</p>
      </div>
      <ul className="mt-6 space-y-2 text-sm text-slate-200/90">
        {highlights.map((highlight) => (
          <li key={highlight} className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-800/80">
              <Sparkles className="h-3 w-3 text-cyan-300" />
            </span>
            {highlight}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WorkflowStep({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 text-left backdrop-blur">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </div>
  );
}

function StackRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-slate-900/60 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 text-cyan-300">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-sm text-slate-300">{description}</p>
      </div>
    </div>
  );
}

function Benefit({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </div>
  );
}
