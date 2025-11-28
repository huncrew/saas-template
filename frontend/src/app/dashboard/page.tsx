"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AgentActionResponsePayload,
  AgentChatResult,
  AgentBackend,
  AgentDefinition,
  AgentTrainingJob,
  CloudAccount,
  CloudAction,
  CloudAgentType,
  CloudFinding,
  ProposedAction,
  ToolExecution,
  TrainingJobStatus,
} from "@/types";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  RefreshCw,
  UploadCloud,
  Cpu,
  GitPullRequest,
  Download,
  HardDrive,
  ShieldCheck,
  MessageSquare,
  FolderGit2,
  ListChecks,
  CircuitBoard,
} from "lucide-react";
import { AGENT_BLUEPRINTS } from "@/constants/agents";

const QUICK_PROMPTS = [
  {
    label: "Top WA gaps",
    text: "Summarize the three highest-risk Well-Architected gaps for this account and cite the services affected.",
  },
  {
    label: "Cost opportunity",
    text: "Identify one concrete cost-optimization opportunity with estimated monthly savings and an outline of the change.",
  },
  {
    label: "Ship a fix",
    text: "Propose a remediation plan with Terraform-ready detail I can approve immediately. Include rollback guidance.",
  },
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolRuns?: ToolExecution[];
};

type StoredChatMessage = Omit<ChatMessage, "timestamp"> & { timestamp: string };

const CHAT_THREADS_STORAGE_KEY = "cloudops-agent-threads-v1";

type InspectorTabKey = "insights" | "training" | "sandbox" | "telemetry";

export default function CloudOpsDashboard() {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [customAgents, setCustomAgents] = useState<AgentDefinition[]>([]);
  const [activeCustomAgentId, setActiveCustomAgentId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [accountInput, setAccountInput] = useState<string>("");
  const [activeAgent, setActiveAgent] = useState<CloudAgentType>("WellArchitectedAgent");
  const [agentBackend, setAgentBackend] = useState<AgentBackend>("langgraph");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string>("");
  const [resourceCounts, setResourceCounts] = useState<Record<string, number>>({});
  const [chatThreads, setChatThreads] = useState<Record<string, ChatMessage[]>>({});
  const [isChatting, setIsChatting] = useState(false);
  const [latestActions, setLatestActions] = useState<ProposedAction[]>([]);
  const [findings, setFindings] = useState<CloudFinding[]>([]);
  const [actionLog, setActionLog] = useState<CloudAction[]>([]);
  const [toolRuns, setToolRuns] = useState<ToolExecution[]>([]);
  const [codeSnippet, setCodeSnippet] = useState<string>("");
  const [codeDescription, setCodeDescription] = useState<string>("");
  const [codeLanguage, setCodeLanguage] = useState<string>("python");
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeResult, setCodeResult] = useState<Record<string, unknown> | null>(null);
  const [trainingJobs, setTrainingJobs] = useState<AgentTrainingJob[]>([]);
  const [isLoadingTrainingJobs, setIsLoadingTrainingJobs] = useState(false);
  const [isLaunchingTraining, setIsLaunchingTraining] = useState(false);
  const [trainingProvider, setTrainingProvider] = useState<"sagemaker" | "bedrock">("bedrock");
  const [trainingBaseModel, setTrainingBaseModel] = useState("anthropic.claude-3-5-sonnet-20240620-v1:0");
  const [trainingDomainAdaptation, setTrainingDomainAdaptation] = useState(true);
  const [trainingNotes, setTrainingNotes] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedbackOutput, setFeedbackOutput] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTabKey>("insights");
  const trainingStatusRef = useRef<Record<string, TrainingJobStatus>>({});

  const currentAgentKey = useMemo(
    () => (activeAgent === "Custom" && activeCustomAgentId ? `custom:${activeCustomAgentId}` : `blueprint:${activeAgent}`),
    [activeAgent, activeCustomAgentId],
  );

  const chatMessages = useMemo(() => chatThreads[currentAgentKey] ?? [], [chatThreads, currentAgentKey]);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiClient.listAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to load accounts", error);
      toast.error("Unable to load accounts. Trigger a sync to register one.");
    }
  }, []);

  const loadCustomAgents = useCallback(async () => {
    try {
      const definitions = await apiClient.listAgents();
      setCustomAgents(definitions);
      if (definitions.length === 0) {
        setActiveCustomAgentId(null);
        if (activeAgent === "Custom") {
          setActiveAgent("WellArchitectedAgent");
          setAgentBackend("langgraph");
          setLatestActions([]);
          setToolRuns([]);
        }
      } else if (
        !activeCustomAgentId ||
        !definitions.some((agent) => agent.agentId === activeCustomAgentId)
      ) {
        const fallback = definitions[0];
        setActiveCustomAgentId(fallback.agentId);
        if (activeAgent === "Custom") {
          setAgentBackend(fallback.backend);
          setLatestActions([]);
          setToolRuns([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch custom agents", error);
    }
  }, [activeAgent, activeCustomAgentId]);

  const selectedAccount = useMemo(
    () => accounts.find((acct) => acct.account_id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  const selectedCustomAgent = useMemo(
    () => customAgents.find((agent) => agent.agentId === activeCustomAgentId) ?? null,
    [customAgents, activeCustomAgentId],
  );

  const loadTrainingJobs = useCallback(async () => {
    if (activeAgent !== "Custom" || !selectedCustomAgent) {
      setTrainingJobs([]);
      return;
    }
    setIsLoadingTrainingJobs(true);
    try {
      const data = await apiClient.listAgentTrainingJobs(selectedCustomAgent.agentId);
      setTrainingJobs(data);
    } catch (error) {
      console.error("Failed to load training jobs", error);
      toast.error("Unable to load training jobs.");
    } finally {
      setIsLoadingTrainingJobs(false);
    }
  }, [activeAgent, selectedCustomAgent]);

  const resolveBackend = (): AgentBackend =>
    activeAgent === "Custom" && selectedCustomAgent ? selectedCustomAgent.backend : agentBackend;

  const resolveAgentId = (): string | undefined =>
    activeAgent === "Custom" && selectedCustomAgent ? selectedCustomAgent.agentId : undefined;

  const buildAgentContext = (extra?: Record<string, unknown>) => {
    const base: Record<string, unknown> = {};
    if (activeAgent === "Custom" && selectedCustomAgent) {
      base.agentId = selectedCustomAgent.agentId;
    }
    return { ...base, ...(extra ?? {}) };
  };

  const activeAgentLabel =
    activeAgent === "Custom" && selectedCustomAgent
      ? selectedCustomAgent.name
      : activeAgent.replace("Agent", " Agent");

  const activeBlueprint = useMemo(
    () => AGENT_BLUEPRINTS.find((blueprint) => blueprint.type === activeAgent),
    [activeAgent],
  );

  const agentSummary = useMemo(() => {
    if (activeAgent === "Custom" && selectedCustomAgent) {
      return {
        title: selectedCustomAgent.name,
        subtitle: selectedCustomAgent.description || "Custom AWS specialist",
        backend: selectedCustomAgent.backend === "agentcore" ? "Agentcore" : "LangGraph",
        status: selectedCustomAgent.status ?? "draft",
        modelStatus: selectedCustomAgent.modelStatus ?? "NOT TRAINED",
        modelVersion: selectedCustomAgent.modelVersion ?? "—",
        modelEndpoint: selectedCustomAgent.modelEndpoint ?? "—",
      };
    }
    return {
      title: activeBlueprint?.title ?? activeAgentLabel,
      subtitle: activeBlueprint?.description ?? "Preset CloudOps agent",
      backend: agentBackend === "agentcore" ? "Agentcore" : "LangGraph",
      status: "ready",
      modelStatus: null,
      modelVersion: null,
      modelEndpoint: null,
    };
  }, [activeAgent, activeAgentLabel, activeBlueprint, agentBackend, selectedCustomAgent]);

  const totalResources = useMemo(
    () => Object.values(resourceCounts).reduce((acc, value) => acc + value, 0),
    [resourceCounts],
  );

  const postureStats = [
    {
      label: "Resources tracked",
      value: totalResources ? totalResources.toLocaleString() : "—",
      hint:
        Object.keys(resourceCounts).length > 0
          ? `${Object.keys(resourceCounts).length} services`
          : "Awaiting ingest",
      icon: HardDrive,
    },
    {
      label: "Open findings",
      value: findings.length.toString(),
      hint: "Persisted across runs",
      icon: ShieldCheck,
    },
    {
      label: "Proposed actions",
      value: latestActions.length.toString(),
      hint: "Ready for approval",
      icon: FolderGit2,
    },
    {
      label: "Action log",
      value: actionLog.length.toString(),
      hint: "Tracked in DynamoDB",
      icon: ListChecks,
    },
  ];

  const inspectorTabs: Array<{ key: InspectorTabKey; label: string }> = [
    { key: "insights", label: "Insights" },
    { key: "training", label: "Training" },
    { key: "sandbox", label: "Sandbox" },
    { key: "telemetry", label: "Telemetry" },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(CHAT_THREADS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, StoredChatMessage[]>;
      const hydrated = Object.fromEntries(
        Object.entries(parsed).map(([key, messages]) => [
          key,
          messages.map((message) => ({
            ...message,
            timestamp: new Date(message.timestamp),
          })),
        ]),
      );
      setChatThreads(hydrated);
    } catch (error) {
      console.error("Failed to load cached chat threads", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const serializable = Object.fromEntries(
      Object.entries(chatThreads).map(([key, messages]) => [
        key,
        messages.map((message) => ({
          ...message,
          timestamp: message.timestamp.toISOString(),
        })),
      ]),
    );
    localStorage.setItem(CHAT_THREADS_STORAGE_KEY, JSON.stringify(serializable));
  }, [chatThreads]);

  const updateThread = useCallback(
    (updater: (messages: ChatMessage[]) => ChatMessage[]) => {
      setChatThreads((prev) => {
        const current = prev[currentAgentKey] ?? [];
        const nextMessages = updater(current);
        if (nextMessages === current) {
          return prev;
        }
        return { ...prev, [currentAgentKey]: nextMessages };
      });
    },
    [currentAgentKey],
  );

  const appendMessage = useCallback(
    (message: ChatMessage) => {
      updateThread((current) => [...current, message]);
    },
    [updateThread],
  );

  const clearCurrentThread = useCallback(() => {
    updateThread(() => []);
  }, [updateThread]);

  const appendSystemEvent = useCallback(
    (content: string, runs?: ToolExecution[]) => {
      appendMessage({
        id: `${Date.now()}-event`,
        role: "assistant",
        content,
        timestamp: new Date(),
        toolRuns: runs,
      });
    },
    [appendMessage],
  );

  const renderInspectorContent = () => {
    if (inspectorTab === "insights") {
      if (latestActions.length === 0) {
        return (
          <p className="text-sm text-slate-500">
            Ask the agent to inspect posture or propose remediations to populate insights.
          </p>
        );
      }
      return (
        <div className="space-y-4">
          {latestActions.map((action) => (
            <div key={action.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{action.title}</p>
                  <p className="text-xs text-slate-500">
                    Risk {action.risk} · Mode {action.kind}
                  </p>
                </div>
                <Badge className="rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                  {action.estCostDeltaUsdMonth >= 0 ? "+" : ""}
                  {action.estCostDeltaUsdMonth.toFixed(1)} $/mo
                </Badge>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{action.rationale}</p>
              {action.impactedResources.length > 0 && (
                <p className="text-xs text-slate-500">
                  Resources · {action.impactedResources.join(", ")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                  onClick={() => handleAction(action, "PR")}
                >
                  <GitPullRequest className="mr-2 h-4 w-4" /> Approve PR
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(action, "DIRECT")}
                  className="rounded-lg border-slate-300 text-slate-700 hover:border-slate-400"
                >
                  <Download className="mr-2 h-4 w-4" /> Direct Op
                </Button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (inspectorTab === "training") {
      if (activeAgent !== "Custom" || !selectedCustomAgent) {
        return <p className="text-sm text-slate-500">Select a custom agent to manage training jobs.</p>;
      }
      return (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <Badge className="rounded-full border border-cyan-100 bg-cyan-50 text-cyan-700">
                {selectedCustomAgent.modelStatus ?? "NOT TRAINED"}
              </Badge>
            </div>
            <p className="mt-2">
              Endpoint · <span className="text-slate-900">{selectedCustomAgent.modelEndpoint ?? "—"}</span>
            </p>
            <p>
              Version · <span className="text-slate-900">{selectedCustomAgent.modelVersion ?? "—"}</span>
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider</label>
            <select
              value={trainingProvider}
              onChange={(event) => setTrainingProvider(event.target.value as "sagemaker" | "bedrock")}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
            >
              <option value="bedrock">Bedrock fine-tune</option>
                  <option value="sagemaker">SageMaker (custom endpoint)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Base model</label>
            <Input
              value={trainingBaseModel}
              onChange={(event) => setTrainingBaseModel(event.target.value)}
              className="rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="Model ID"
            />
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 accent-cyan-500"
              checked={trainingDomainAdaptation}
              onChange={(event) => setTrainingDomainAdaptation(event.target.checked)}
            />
            Emphasize domain adaptation (use feedback + curated docs)
          </label>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</label>
            <textarea
              value={trainingNotes}
              onChange={(event) => setTrainingNotes(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
              placeholder="What should this training run focus on?"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={handleStartTraining}
              disabled={isLaunchingTraining}
              className="flex-1 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            >
              {isLaunchingTraining ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Launching…
                </>
              ) : (
                "Start Training"
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshTrainingJobs}
              disabled={isLoadingTrainingJobs}
              className="rounded-xl border-slate-300 text-slate-700 hover:border-slate-400"
            >
              {isLoadingTrainingJobs ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Recent jobs</p>
            <div className="max-h-32 space-y-2 overflow-y-auto">
              {trainingJobs.length === 0 ? (
                <p className="text-xs text-slate-500">Launch a training run to populate history.</p>
              ) : (
                trainingJobs.slice(0, 3).map((job) => (
                  <div key={job.jobId} className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>{job.modelVersion ?? job.jobId}</span>
                      <Badge
                        variant={job.status === "FAILED" ? "destructive" : "outline"}
                        className="rounded-full border border-slate-200 text-[0.6rem]"
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-[0.65rem] text-slate-500">{new Date(job.createdAt).toLocaleString()}</p>
                    {job.trainingDataUri && (
                      <p className="text-[0.65rem] text-slate-500 break-all">
                        Dataset · {job.trainingDataUri}
                      </p>
                    )}
                    {job.outputLocation && (
                      <p className="text-[0.65rem] text-slate-500 break-all">
                        Output · {job.outputLocation}
                      </p>
                    )}
                    {job.failureReason && (
                      <p className="text-[0.65rem] text-rose-500">Failed: {job.failureReason}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <form onSubmit={handleSubmitFeedback} className="space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Capture WA feedback</p>
            <textarea
              value={feedbackInput}
              onChange={(event) => setFeedbackInput(event.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-cyan-400 focus:outline-none"
              placeholder="Prompt / situation"
            />
            <textarea
              value={feedbackOutput}
              onChange={(event) => setFeedbackOutput(event.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-900 focus:border-cyan-400 focus:outline-none"
              placeholder="Ideal agent response"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingFeedback}
              className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 hover:border-slate-400"
            >
              {isSubmittingFeedback ? "Saving…" : "Save Feedback"}
            </Button>
          </form>
        </div>
      );
    }

    if (inspectorTab === "sandbox") {
      return (
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
              Snippet (Python)
            </label>
            <textarea
              rows={6}
              value={codeSnippet}
              onChange={(event) => setCodeSnippet(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:border-cyan-400 focus:outline-none"
              placeholder="import boto3\n\nlambda_client = boto3.client('lambda')\nprint(len(lambda_client.list_functions()['Functions']))"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1 space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
                Description
              </label>
              <Input
                value={codeDescription}
                onChange={(event) => setCodeDescription(event.target.value)}
                placeholder="What does this run do?"
                className="rounded-2xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div className="w-full md:w-[130px]">
              <label className="text-xs font-medium uppercase tracking-[0.25em] text-slate-500">
                Language
              </label>
              <select
                value={codeLanguage}
                onChange={(event) => setCodeLanguage(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
              >
                <option value="python">Python</option>
              </select>
            </div>
          </div>
          <Button
            className="w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={handleExecuteCode}
            disabled={isRunningCode || !codeSnippet.trim()}
          >
            {isRunningCode ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
            Run in Sandbox
          </Button>
          {codeResult && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <Badge
                  className={cn(
                    "rounded-full border px-3 py-0.5",
                    (codeResult.status as string) === "success"
                      ? "border-cyan-500/40 bg-cyan-50 text-cyan-700"
                      : "border-rose-400/40 bg-rose-50 text-rose-600",
                  )}
                >
                  {(codeResult.status as string)?.toUpperCase?.() ?? "UNKNOWN"}
                </Badge>
              </div>
              {codeResult.runId && (
                <div className="flex justify-between text-slate-500">
                  <span>Run ID</span>
                  <span className="text-right">{String(codeResult.runId)}</span>
                </div>
              )}
              <div className="space-y-1">
                <span className="text-slate-500">Logs</span>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-700">
                  {codeResult.logs ? String(codeResult.logs) : "—"}
                </pre>
              </div>
              {codeResult.error && (
                <div className="space-y-1 text-rose-600">
                  <span>Error</span>
                  <pre className="whitespace-pre-wrap rounded-xl bg-rose-50 p-3 text-rose-600">
                    {String(codeResult.error)}
                  </pre>
                </div>
              )}
              {codeResult.reply && (
                <div className="space-y-1 text-slate-600">
                  <span>Agent Summary</span>
                  <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-700">
                    {String(codeResult.reply)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (inspectorTab === "telemetry") {
      if (toolRuns.length === 0) {
        return <p className="text-sm text-slate-500">No tool executions yet for this session.</p>;
      }
      return (
        <div className="space-y-3 text-sm">
          {toolRuns.map((run, index) => (
            <div key={`${run.tool}-${index}`} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-900">{run.tool}</p>
                <Badge
                  variant={run.status === "success" ? "outline" : "destructive"}
                  className={cn(
                    "rounded-full border",
                    run.status === "success"
                      ? "border-cyan-500/40 bg-cyan-50 text-cyan-700"
                      : "border-rose-400/40 bg-rose-50 text-rose-600",
                  )}
                >
                  {run.status.toUpperCase()}
                </Badge>
              </div>
              {run.status === "error" ? (
                <p className="text-sm text-rose-600">{run.error || "Tool execution failed"}</p>
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(run.data ?? {}, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  useEffect(() => {
    void loadAccounts();
    void loadCustomAgents();
  }, [loadAccounts, loadCustomAgents]);

  useEffect(() => {
    if (!selectedAccountId && accounts.length) {
      setSelectedAccountId(accounts[0].account_id);
    }
  }, [accounts, selectedAccountId]);

  useEffect(() => {
    if (selectedAccountId) {
      void refreshFindings(selectedAccountId);
      void refreshActions(selectedAccountId);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void loadTrainingJobs();
  }, [loadTrainingJobs]);

  async function refreshFindings(accountId: string) {
    try {
      const data = await apiClient.listFindings(accountId);
      setFindings(data);
    } catch (error) {
      console.error("Failed to fetch findings", error);
    }
  }

  async function refreshActions(accountId: string) {
    try {
      const data = await apiClient.listActions(accountId);
      setActionLog(data);
    } catch (error) {
      console.error("Failed to fetch actions", error);
    }
  }

  async function invokeAgent(payload: AgentChatPayload) {
    const response = await apiClient.agentChat(payload);
    if (response.success && response.data) {
      setLatestActions(response.data.proposedActions || []);
      setToolRuns(response.data.tools || []);
      return response.data;
    }
    return undefined;
  }

  const handleSync = async () => {
    const targetAccountId = accountInput.trim() || selectedAccountId;
    if (!targetAccountId) {
      toast.error("Provide an AWS account ID to sync.");
      return;
    }

    setIsSyncing(true);
    try {
      const response = await apiClient.ingestAccount({
        accountId: targetAccountId,
        metadata: { source: "dashboard" },
      });
      if (response.success && response.data) {
        const resourceTotal = Object.values(response.data.resourceCounts).reduce(
          (acc, value) => acc + value,
          0,
        );
        setResourceCounts(response.data.resourceCounts);
        setSyncSummary(
          `Snapshot stored ➞ ${response.data.snapshotS3Uri}. ${resourceTotal} resources captured across ${Object.keys(
            response.data.resourceCounts,
          ).length} services.`,
        );
        toast.success("Ingest complete. Snapshot stored in S3.");
        await loadAccounts();
        setSelectedAccountId(targetAccountId);
        await refreshFindings(targetAccountId);
        await refreshActions(targetAccountId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Ingest failed. Check Lambda logs.";
      toast.error(message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExecuteCode = async () => {
    if (!selectedAccountId) {
      toast.error("Sync an account before executing code.");
      return;
    }
    if (!codeSnippet.trim()) {
      toast.error("Paste a code snippet to execute.");
      return;
    }
    if (activeAgent === "Custom" && !selectedCustomAgent) {
      toast.error("Select a custom agent from the quick-pick menu.");
      return;
    }

    const userConfirmed = typeof window !== "undefined"
      ? window.confirm(
          "The sandbox will execute this snippet with your project credentials. Continue?",
        )
      : true;
    if (!userConfirmed) {
      return;
    }

    setIsRunningCode(true);
    setCodeResult(null);
    try {
      const backend = resolveBackend();
      const agentId = resolveAgentId();
      const context = buildAgentContext({ entrypoint: "code-executor" });
      const result = await invokeAgent({
        accountId: selectedAccountId,
        agentType: activeAgent,
        message: codeDescription.trim() || "Execute the provided code snippet in the sandbox.",
        conversation: chatMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        context,
        toolInvocations: [
          {
            name: "run_code",
            args: {
              code: codeSnippet,
              language: codeLanguage,
              description: codeDescription,
              requested_by: "dashboard",
            },
          },
        ],
        backend,
        agentId,
      });

      if (result) {
        if (backend === "agentcore") {
          setCodeResult({
            status: "success",
            reply: result.reply,
            events: result.tools ?? [],
          } as Record<string, unknown>);
          await refreshActions(selectedAccountId);
          toast.success("Agentcore execution complete.");
          appendSystemEvent("Agentcore sandbox execution completed.", result.tools ?? []);
          return;
        }
        const run = (result.tools ?? []).find((tool) => tool.tool === "run_code");
        const runData = {
          ...(run?.data ?? {}),
          status: run?.status ?? (run?.error ? "error" : "success"),
          error: run?.error,
          reply: result.reply,
        } as Record<string, unknown>;
        setCodeResult(runData);
        await refreshActions(selectedAccountId);
        toast[run?.status === "error" ? "error" : "success"](
          run?.status === "error" ? "Sandbox run failed." : "Sandbox run completed.",
        );
        if (run) {
          appendSystemEvent(
            run.status === "error"
              ? `Sandbox run failed: ${run.error ?? "see telemetry for details."}`
              : "Sandbox run completed successfully.",
            [run],
          );
        }
      }
    } catch (error) {
      console.error("Code execution failed", error);
      const message = error instanceof Error ? error.message : "Code execution failed.";
      toast.error(message);
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleSendChat = async (message: string) => {
    if (!selectedAccountId) {
      toast.error("Sync an account before chatting.");
      return;
    }
    if (!message.trim()) return;
    if (activeAgent === "Custom" && !selectedCustomAgent) {
      toast.error("Select a custom agent from the quick-pick menu.");
      return;
    }

    const outbound: ChatMessage = {
      id: `${Date.now()}`,
      role: "user",
      content: message.trim(),
      timestamp: new Date(),
    };
    appendMessage(outbound);
    setIsChatting(true);
    setToolRuns([]);

    try {
      const backend = resolveBackend();
      const agentId = resolveAgentId();
      const context = buildAgentContext();
      const result = await invokeAgent({
        accountId: selectedAccountId,
        agentType: activeAgent,
        message: message.trim(),
        conversation: chatMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        context,
        backend,
        agentId,
      });
      if (result) {
        appendAssistantReply(result);
        await refreshFindings(selectedAccountId);
      }
    } catch (error) {
      console.error("Agent chat failed", error);
      const message = error instanceof Error ? error.message : "Agent failed to respond.";
      toast.error(message);
    } finally {
      setIsChatting(false);
    }
  };

  const appendAssistantReply = (result: AgentChatResult) => {
    const inbound: ChatMessage = {
      id: `${Date.now()}-assistant`,
      role: "assistant",
      content: result.reply,
      timestamp: new Date(),
      toolRuns: result.tools ?? [],
    };
    appendMessage(inbound);
  };

  const handleAction = async (action: ProposedAction, mode: "PR" | "DIRECT") => {
    if (!selectedAccountId) return;
    try {
      const response = await apiClient.triggerAgentAction({
        accountId: selectedAccountId,
        actionId: action.id,
        mode,
      });
      if (response.success && response.data) {
        notifyActionResult(action, response.data, mode);
        await refreshActions(selectedAccountId);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to execute action";
      toast.error(message);
    }
  };

  const notifyActionResult = (
    action: ProposedAction,
    result: AgentActionResponsePayload,
    mode: "PR" | "DIRECT",
  ) => {
    if (result.status === "FAILED") {
      toast.error(`${mode} failed for ${action.title}: ${result.message}`);
      return;
    }
    if (mode === "PR") {
      const prUrlValue = result.details?.prUrl;
      const prUrl = typeof prUrlValue === "string" ? prUrlValue : "";
      toast.success(`PR created for ${action.title}`);
      if (prUrl) {
        setSyncSummary(`Latest PR ➞ ${prUrl}`);
      }
    } else {
      toast.success(`Direct change applied for ${action.title}`);
    }
  };

  const handleRefreshTrainingJobs = () => {
    void loadTrainingJobs();
  };

  const handleStartTraining = async () => {
    if (activeAgent !== "Custom" || !selectedCustomAgent) {
      toast.error("Select a custom agent to launch training.");
      return;
    }
    setIsLaunchingTraining(true);
    try {
      const job = await apiClient.startAgentTraining(selectedCustomAgent.agentId, {
        provider: trainingProvider,
        baseModelId: trainingBaseModel || undefined,
        domainAdaptation: trainingDomainAdaptation,
        notes: trainingNotes || undefined,
      });
      toast.success("Training job queued.");
      appendSystemEvent(
        `Training job ${job.jobId} launched on ${job.provider} targeting ${job.baseModelId ?? "default model"} (${job.status}).`,
      );
      setTrainingNotes("");
      setTrainingJobs((previous) => [job, ...previous.filter((entry) => entry.jobId !== job.jobId)]);
      await loadTrainingJobs();
      await loadCustomAgents();
    } catch (error) {
      console.error("Failed to launch training", error);
      toast.error("Unable to start training job.");
    } finally {
      setIsLaunchingTraining(false);
    }
  };

  const handleSubmitFeedback = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (activeAgent !== "Custom" || !selectedCustomAgent) {
      toast.error("Select a custom agent before logging feedback.");
      return;
    }
    if (!feedbackInput.trim() || !feedbackOutput.trim()) {
      toast.error("Provide both the prompt and desired response.");
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      await apiClient.submitAgentFeedback(selectedCustomAgent.agentId, {
        input: feedbackInput.trim(),
        output: feedbackOutput.trim(),
      });
      toast.success("Feedback captured.");
      setFeedbackInput("");
      setFeedbackOutput("");
    } catch (error) {
      console.error("Failed to save feedback", error);
      toast.error("Unable to save feedback example.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  useEffect(() => {
    if (activeAgent !== "Custom" || !selectedCustomAgent) return;
    const hasActiveJobs = trainingJobs.some(
      (job) => job.status === "IN_PROGRESS" || job.status === "QUEUED",
    );
    if (!hasActiveJobs) return;
    const id = window.setInterval(() => {
      void loadTrainingJobs();
      void loadCustomAgents();
    }, 10000);
    return () => window.clearInterval(id);
  }, [activeAgent, selectedCustomAgent, trainingJobs, loadTrainingJobs, loadCustomAgents]);

  useEffect(() => {
    if (trainingJobs.length === 0) return;
    const nextStatuses: Record<string, TrainingJobStatus> = { ...trainingStatusRef.current };
    trainingJobs.forEach((job) => {
      const previous = trainingStatusRef.current[job.jobId];
      if (previous && previous !== job.status && job.status === "COMPLETED") {
        appendSystemEvent(
          `Training job ${job.jobId} completed. Endpoint ${job.modelEndpoint ?? "pending"} is ready.`,
        );
      }
      nextStatuses[job.jobId] = job.status;
    });
    trainingStatusRef.current = nextStatuses;
  }, [trainingJobs, appendSystemEvent]);

  return (
    <div className="space-y-8 pb-12 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white px-8 py-10 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">CloudOps Agent Studio</p>
            <h1 className="text-3xl font-semibold leading-tight md:text-[2.5rem]">
              Chat, inspect tooling, and retrain AWS specialists from a single console.
            </h1>
            <p className="text-base text-slate-600">
              Each agent blends Bedrock reasoning, heuristics, and direct AWS tooling. Toggle personas instantly, then
              review insights, code execution, and training telemetry without leaving the chat.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
              >
                {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Sync account
              </Button>
              <Button variant="outline" className="rounded-full border-slate-300 text-slate-700 hover:bg-white" asChild>
                <Link href="/dashboard/agents">Open authoring studio</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Active agent</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{activeAgentLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Last sync</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {selectedAccount?.last_ingest_at
                  ? new Date(selectedAccount.last_ingest_at).toLocaleString()
                  : "Not yet synced"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border-slate-200 bg-white/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Target account</CardTitle>
              <CardDescription className="text-slate-500">
                Switch AWS accounts or trigger an ingest snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Active account</label>
                <select
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-inner focus:border-cyan-400 focus:outline-none"
                >
                  {accounts.length === 0 && <option value="">No accounts yet</option>}
                  {accounts.map((account) => (
                    <option key={account.account_id} value={account.account_id}>
                      {account.account_name || account.account_id}
                    </option>
                  ))}
                </select>
                {selectedAccount?.last_snapshot_s3 && (
                  <Badge className="rounded-full border border-slate-200 bg-white text-xs text-cyan-600">
                    Snapshot {selectedAccount.last_snapshot_s3.split("/").pop()}
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Override account ID"
                  value={accountInput}
                  onChange={(event) => setAccountInput(event.target.value)}
                  className="rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                />
                <Button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  Sync snapshot
                </Button>
                <p className="text-xs text-slate-500">{syncSummary || "Ready for an ingest run."}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Agent quick-pick</CardTitle>
              <CardDescription className="text-slate-500">
                Choose a persona or one of your custom specialists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Execution backend</label>
                <select
                  value={resolveBackend()}
                  onChange={(event) => {
                    if (activeAgent === "Custom") return;
                    const backend = event.target.value as AgentBackend;
                    setAgentBackend(backend);
                    clearCurrentThread();
                    setLatestActions([]);
                    setToolRuns([]);
                  }}
                  disabled={activeAgent === "Custom"}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <option value="langgraph">LangGraph Orchestrator</option>
                  <option value="agentcore">Bedrock Agentcore</option>
                </select>
                {activeAgent === "Custom" && (
                  <p className="text-xs text-slate-500">Backend is managed by the selected custom agent definition.</p>
                )}
              </div>
              <div className="grid gap-2">
                {AGENT_BLUEPRINTS.map((agent) => (
                  <button
                    key={agent.type}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-2 text-left transition",
                      activeAgent === agent.type
                        ? "border-cyan-400/60 bg-cyan-50 text-cyan-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-cyan-400/40 hover:bg-cyan-50",
                    )}
                    onClick={() => handleBlueprintLaunch(agent.type)}
                  >
                    <span>{agent.title}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
              {customAgents.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Custom agents</label>
                  <div className="grid gap-2">
                    {customAgents.map((agent) => {
                      const isActive = activeAgent === "Custom" && activeCustomAgentId === agent.agentId;
                      return (
                        <button
                          key={agent.agentId}
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-4 py-2 text-left transition",
                            isActive
                              ? "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-emerald-400/40 hover:bg-emerald-50",
                          )}
                          onClick={() => {
                            setActiveAgent("Custom");
                            setActiveCustomAgentId(agent.agentId);
                            setAgentBackend(agent.backend);
                            setLatestActions([]);
                            setToolRuns([]);
                            void loadTrainingJobs();
                          }}
                        >
                          <span className="flex flex-col">
                            <span className="font-medium">{agent.name}</span>
                            <span className="text-xs text-slate-500">{agent.backend}</span>
                          </span>
                          <Badge
                            variant={agent.status === "published" ? "outline" : "secondary"}
                            className="uppercase tracking-[0.25em]"
                          >
                            {agent.status}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Posture snapshot</CardTitle>
              <CardDescription className="text-slate-500">Live stats for the selected account.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {postureStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <stat.icon className="h-4 w-4 text-cyan-400" />
                    <div>
                      <p className="text-slate-900">{stat.value}</p>
                      <p className="text-xs text-slate-500">{stat.label}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{stat.hint}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-[600px] flex-col border-slate-200 bg-white shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <MessageSquare className="h-5 w-5 text-cyan-500" />
                Agent Conversation
              </CardTitle>
              <CardDescription className="text-slate-500">
                Ask posture questions, request remediations, or trigger tools inline.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold uppercase text-white">
                  {agentSummary.title.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{agentSummary.title}</p>
                  <p className="text-sm text-slate-500 line-clamp-2">{agentSummary.subtitle}</p>
                </div>
                <Badge className="rounded-full border border-slate-200 bg-white text-xs text-slate-700">
                  {agentSummary.backend}
                </Badge>
                <Badge className="rounded-full border border-emerald-100 bg-emerald-50 text-xs text-emerald-700">
                  {agentSummary.status.toUpperCase()}
                </Badge>
              </div>
              {activeAgent === "Custom" && selectedCustomAgent && (
                <div className="mt-4 grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
                  <div>
                    <p className="uppercase tracking-[0.3em] text-slate-400">Model</p>
                    <p className="font-semibold text-slate-900">{agentSummary.modelStatus}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.3em] text-slate-400">Version</p>
                    <p className="font-semibold text-slate-900">{agentSummary.modelVersion}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.3em] text-slate-400">Endpoint</p>
                    <p className="font-semibold text-slate-900 truncate">{agentSummary.modelEndpoint}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-6 xl:flex-row">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt.label}
                      size="sm"
                      variant="outline"
                      disabled={isChatting}
                      className="rounded-full border-slate-200 bg-white text-xs text-slate-600 hover:border-cyan-400 hover:text-cyan-700"
                      onClick={() => handleSendChat(prompt.text)}
                    >
                      {prompt.label}
                    </Button>
                  ))}
                </div>
                <div className="space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  {chatMessages.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500">
                      Ask the {activeAgentLabel} something like “Highlight high-risk gaps for this account.”
                    </div>
                  ) : (
                    chatMessages.map((message) => (
                      <div key={message.id} className="space-y-2">
                        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                          <span className="font-semibold text-slate-600">
                            {message.role === "user" ? "Operator" : "Agent"}
                          </span>
                          <span>{message.timestamp.toLocaleTimeString()}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{message.content}</p>
                        {message.toolRuns && message.toolRuns.length > 0 && (
                          <div className="space-y-2">
                            {message.toolRuns.map((tool, index) => (
                              <div
                                key={`${tool.tool}-${index}`}
                                className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-900">{tool.tool}</span>
                                  <Badge
                                    className={cn(
                                      "rounded-full border px-3 py-0.5 text-[0.6rem]",
                                      tool.status === "success"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : tool.status === "pending_confirmation"
                                          ? "border-amber-200 bg-amber-50 text-amber-700"
                                          : "border-rose-300 bg-rose-50 text-rose-600",
                                    )}
                                  >
                                    {tool.status.replace("_", " ")}
                                  </Badge>
                                </div>
                                {tool.error && (
                                  <p className="mt-2 text-sm text-rose-600">{tool.error}</p>
                                )}
                                {!tool.error && tool.data && Object.keys(tool.data).length > 0 && (
                                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[0.7rem] text-slate-700">
                                    {JSON.stringify(tool.data, null, 2)}
                                  </pre>
                                )}
                                {tool.status === "pending_confirmation" && (
                                  <p className="mt-2 text-xs text-amber-700">
                                    Awaiting operator approval before executing.
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {isChatting && <div className="text-sm text-slate-500">Agent is thinking…</div>}
                </div>
                <ChatComposer disabled={isChatting} onSend={handleSendChat} />
              </div>
              <div className="w-full space-y-4 xl:w-[320px]">
                <div className="flex flex-wrap gap-2">
                  {inspectorTabs.map((tab) => {
                    const isActive = inspectorTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setInspectorTab(tab.key)}
                        className={cn(
                          "rounded-full border px-4 py-1.5 text-xs font-medium transition",
                          isActive
                            ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                            : "border-slate-200 text-slate-500 hover:border-cyan-400/60 hover:text-cyan-700",
                        )}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {renderInspectorContent()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

    <section className="grid gap-6 lg:grid-cols-2">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <ShieldCheck className="h-5 w-5 text-cyan-500" />
            Findings Feed
          </CardTitle>
          <CardDescription className="text-slate-500">
            Recent findings from all agents for the selected account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[320px] overflow-y-auto">
              {findings.length === 0 ? (
            <p className="text-sm text-slate-500">No findings yet. Chat with an agent to populate this feed.</p>
              ) : (
                findings.map((finding) => (
              <div key={finding.finding_id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900">{finding.title}</p>
                  <Badge className="rounded-full border border-slate-200 bg-slate-50 text-xs text-cyan-700">
                        {finding.severity}
                      </Badge>
                    </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{finding.description}</p>
                    <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                        {finding.agent_type}
                      </Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                        {finding.proposed_actions.length} actions
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <GitPullRequest className="h-5 w-5 text-cyan-500" />
                Actions &amp; PR Log
              </CardTitle>
          <CardDescription className="text-slate-500">
                Audit trail of PRs and direct changes produced by CloudOps Agents.
              </CardDescription>
            </CardHeader>
        <CardContent className="space-y-3 max-h-[320px] overflow-y-auto text-sm">
              {actionLog.length === 0 ? (
            <p className="text-slate-500">No actions recorded yet.</p>
              ) : (
                actionLog.map((action) => {
                  const logExcerpt =
                    typeof action.details?.logExcerpt === "string"
                      ? action.details.logExcerpt
                      : undefined;
                  const prUrl =
                    typeof action.details?.prUrl === "string"
                      ? action.details.prUrl
                      : undefined;
                  const runDescription =
                    typeof action.details?.description === "string"
                      ? action.details.description
                      : undefined;
                  const requestedBy =
                    typeof action.details?.requestedBy === "string"
                      ? action.details.requestedBy
                      : undefined;
                  return (
                <div key={action.action_id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-slate-900">{action.action_id}</p>
                      <Badge
                        variant={action.status === "FAILED" ? "destructive" : action.mode === "CODE" ? "secondary" : "outline"}
                        className={cn(
                          "rounded-full border",
                          action.status === "FAILED"
                          ? "border-rose-400/40 bg-rose-50 text-rose-600"
                            : action.mode === "CODE"
                            ? "border-emerald-400/40 bg-emerald-50 text-emerald-700"
                            : "border-cyan-500/40 bg-cyan-50 text-cyan-700"
                        )}
                      >
                        {action.status}
                      </Badge>
                    </div>
                  <p className="text-slate-600">Mode · {action.mode}</p>
                    {runDescription && (
                    <p className="text-xs text-slate-500">Summary · {runDescription}</p>
                    )}
                    {requestedBy && (
                    <p className="text-xs text-slate-500">Requested by · {requestedBy}</p>
                    )}
                    {action.mode === "CODE" && logExcerpt && (
                    <pre className="whitespace-pre-wrap rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-xs text-emerald-700">
                        {logExcerpt}
                      </pre>
                    )}
                    {prUrl && (
                      <a
                        href={prUrl}
                        target="_blank"
                        rel="noreferrer"
                      className="inline-flex items-center gap-2 text-cyan-700 hover:text-cyan-600"
                      >
                        View PR
                        <ArrowRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  );
                })
              )}
            </CardContent>
          </Card>
      </section>
    </div>
  );
}

function ChatComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };
  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <Input
        placeholder="Ask the agent…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        className="rounded-2xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400"
      />
      <Button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
      >
        Send
      </Button>
    </form>
  );
}
