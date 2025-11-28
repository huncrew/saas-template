"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import {
  AgentBackend,
  AgentDefinition,
  AgentDefinitionCreatePayload,
  AgentDefinitionUpdatePayload,
  AgentMemoryEntry,
  AgentMessage,
  AgentStatus,
  AgentToolDefinition,
  AgentTrainingJob,
  AgentVersion,
  AgentChatResult,
  ToolExecution,
  CloudAccount,
  CloudAgentType,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AGENT_BLUEPRINTS } from "@/constants/agents";

const DEFAULT_TOOL_CATALOG: AgentToolDefinition[] = [
  { name: "get_cost_breakdown", description: "Cost Breakdown" },
  { name: "list_resource_summary", description: "Resource Summary" },
  { name: "get_lambda_error_metrics", description: "Lambda Error Metrics" },
  { name: "create_action_pr", description: "Create Action PR" },
  { name: "apply_direct_change", description: "Apply Direct Change" },
  { name: "run_code", description: "Sandbox Code Execution" },
];

const READONLY_TOOL_NAMES = new Set(["get_cost_breakdown", "list_resource_summary", "get_lambda_error_metrics"]);

const CORE_AGENT_BLUEPRINTS = AGENT_BLUEPRINTS.map((blueprint) => ({
  agentType: blueprint.type,
  name: blueprint.title,
  description: blueprint.description,
  highlights: blueprint.highlights,
}));

type StudioPanel = "design" | "test" | "training" | "memory" | "versions";
type TestSubject = "custom" | CloudAgentType;

interface EditableAgent
  extends AgentDefinitionCreatePayload,
    Pick<AgentDefinition, "agentId" | "status" | "version" | "createdAt" | "updatedAt"> {}

interface ChatTranscriptEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const EMPTY_AGENT: EditableAgent = {
  agentId: "",
  name: "",
  description: "",
  basePrompt: "",
  allowedTools: [],
  backend: "langgraph",
  directChangeAllowed: false,
  requireApproval: false,
  status: "draft",
  version: 0,
  createdAt: undefined,
  updatedAt: undefined,
  agentcoreAgentId: "",
  agentcoreAgentAliasId: "",
  modelEndpoint: "",
  modelProvider: "",
  modelVersion: "",
  modelStatus: "",
  modelArtifactUri: "",
};

const PANEL_OPTIONS: Array<{ key: StudioPanel; label: string }> = [
  { key: "design", label: "Design" },
  { key: "test", label: "Test" },
  { key: "training", label: "Training" },
  { key: "memory", label: "Memory" },
  { key: "versions", label: "Versions" },
];

const makeEntryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatTimestamp = (timestamp: Date) =>
  timestamp.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });

const formatIsoDate = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const formatJson = (payload: unknown) => {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

const sortAgentList = (items: AgentDefinition[]): AgentDefinition[] => {
  return [...items].sort((a, b) => {
    const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bDate - aDate;
  });
};

export default function AgentsPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [toolCatalog, setToolCatalog] = useState<AgentToolDefinition[]>(DEFAULT_TOOL_CATALOG);

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableAgent>(EMPTY_AGENT);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [memory, setMemory] = useState<AgentMemoryEntry[]>([]);

  const [activePanel, setActivePanel] = useState<StudioPanel>("design");
  const [testSubject, setTestSubject] = useState<TestSubject>("custom");

  const [memoryAccountId, setMemoryAccountId] = useState<string>("");
  const [testAccountId, setTestAccountId] = useState<string>("");

  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [isChatting, setIsChatting] = useState(false);

  const [chatInput, setChatInput] = useState<string>("");
  const [conversation, setConversation] = useState<AgentMessage[]>([]);
  const [chatTranscript, setChatTranscript] = useState<ChatTranscriptEntry[]>([]);
  const [toolRuns, setToolRuns] = useState<ToolExecution[]>([]);
  const [lastResponse, setLastResponse] = useState<AgentChatResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([]);
  const [codeSnippet, setCodeSnippet] = useState<string>("");
  const [codeDescription, setCodeDescription] = useState<string>("");
  const [codeLanguage, setCodeLanguage] = useState<string>("python");
  const [isRunningCode, setIsRunningCode] = useState(false);
const [trainingJobs, setTrainingJobs] = useState<AgentTrainingJob[]>([]);
const [isLoadingTrainingJobs, setIsLoadingTrainingJobs] = useState(false);
const [isLaunchingTraining, setIsLaunchingTraining] = useState(false);
const [trainingProvider, setTrainingProvider] = useState<"sagemaker" | "bedrock">("sagemaker");
const [trainingBaseModel, setTrainingBaseModel] = useState("anthropic.claude-3-5-sonnet-20240620-v1:0");
const [trainingDomainAdaptation, setTrainingDomainAdaptation] = useState(true);
const [trainingNotes, setTrainingNotes] = useState("");
const [feedbackInput, setFeedbackInput] = useState("");
const [feedbackOutput, setFeedbackOutput] = useState("");
const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const hasAutoSelectedRef = useRef(false);

  const loadAgents = useCallback(async () => {
    try {
      const data = await apiClient.listAgents();
      setAgents(sortAgentList(data));
      setSelectedAgentId((previous) => {
        if (previous && (previous === "new" || data.some((agent) => agent.agentId === previous))) {
          return previous;
        }
        return null;
      });
    } catch (error) {
      console.error("Failed to load agents", error);
      toast.error("Unable to load agents.");
    }
  }, []);

  const loadTools = useCallback(async () => {
    try {
      const data = await apiClient.listAgentTools();
      if (data.length > 0) {
        setToolCatalog(data);
      } else {
        setToolCatalog(DEFAULT_TOOL_CATALOG);
      }
    } catch (error) {
      console.error("Failed to load agent tools", error);
      setToolCatalog(DEFAULT_TOOL_CATALOG);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await apiClient.listAccounts();
      setAccounts(data);
      setTestAccountId((previous) => {
        if (previous) {
          return previous;
        }
        return data[0]?.account_id ?? "";
      });
    } catch (error) {
      console.error("Failed to load accounts", error);
      toast.error("Unable to load AWS accounts. Trigger an ingest first.");
    }
  }, []);

  const loadTrainingJobs = useCallback(
    async (agentIdOverride?: string | null) => {
      const targetAgentId = agentIdOverride ?? selectedAgentId;
      if (!targetAgentId || targetAgentId === "new") {
        setTrainingJobs([]);
        return;
      }
      setIsLoadingTrainingJobs(true);
      try {
        const data = await apiClient.listAgentTrainingJobs(targetAgentId);
        setTrainingJobs(data);
      } catch (error) {
        console.error("Failed to load training jobs", error);
        toast.error("Unable to fetch training jobs for this agent.");
      } finally {
        setIsLoadingTrainingJobs(false);
      }
    },
    [selectedAgentId],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const availableTestTools = useMemo(() => {
    if (testSubject === "custom") {
      return (selectedAgent?.allowedTools ?? []).filter((tool) => READONLY_TOOL_NAMES.has(tool));
    }
    return Array.from(READONLY_TOOL_NAMES);
  }, [selectedAgent, testSubject]);

  const canExecuteCode =
    testSubject === "custom" && (selectedAgent?.allowedTools ?? []).includes("run_code");

  const codeRuns = useMemo(
    () => toolRuns.filter((run) => run.tool === "run_code"),
    [toolRuns],
  );

  const blueprintUnderTest = useMemo(
    () => CORE_AGENT_BLUEPRINTS.find((blueprint) => blueprint.agentType === testSubject),
    [testSubject],
  );

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadTrainingJobs(selectedAgentId);
  }, [selectedAgentId, loadTrainingJobs]);

  useEffect(() => {
    if (selectedAgent) {
      setDraft({
        ...selectedAgent,
        agentId: selectedAgent.agentId,
        name: selectedAgent.name,
        description: selectedAgent.description,
        basePrompt: selectedAgent.basePrompt,
        allowedTools: selectedAgent.allowedTools ?? [],
        backend: selectedAgent.backend,
        directChangeAllowed: selectedAgent.directChangeAllowed,
        requireApproval: selectedAgent.requireApproval,
        status: selectedAgent.status,
        version: selectedAgent.version,
        createdAt: selectedAgent.createdAt,
        updatedAt: selectedAgent.updatedAt,
        agentcoreAgentId: selectedAgent.agentcoreAgentId ?? "",
        agentcoreAgentAliasId: selectedAgent.agentcoreAgentAliasId ?? "",
        modelEndpoint: selectedAgent.modelEndpoint ?? "",
        modelProvider: selectedAgent.modelProvider ?? "",
        modelVersion: selectedAgent.modelVersion ?? "",
        modelStatus: selectedAgent.modelStatus ?? "",
        modelArtifactUri: selectedAgent.modelArtifactUri ?? "",
      });
      void loadVersions(selectedAgent.agentId);
      setActivePanel((previous) => previous);
    } else if (selectedAgentId === "new") {
      setDraft({ ...EMPTY_AGENT, agentId: "", status: "draft", version: 0 });
      setVersions([]);
      setMemory([]);
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    if (selectedAgent && selectedAgentId && selectedAgentId !== "new" && !hasAutoSelectedRef.current) {
      setActivePanel("test");
      hasAutoSelectedRef.current = true;
    }
    if (selectedAgentId === "new") {
      hasAutoSelectedRef.current = false;
    }
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    if (!memoryAccountId && testAccountId) {
      setMemoryAccountId(testAccountId);
    }
  }, [testAccountId, memoryAccountId]);

  useEffect(() => {
    if (availableTestTools.length === 0) {
      setSelectedToolNames([]);
      return;
    }
    setSelectedToolNames((previous) =>
      previous.filter((tool) => availableTestTools.includes(tool)),
    );
  }, [availableTestTools]);

  useEffect(() => {
    // Reset chat state whenever we change the target under test
    setConversation([]);
    setChatTranscript([]);
    setToolRuns([]);
    setLastResponse(null);
    setLastError(null);
    setChatInput("");
  }, [selectedAgentId, testSubject]);

  async function loadVersions(agentId: string) {
    try {
      const data = await apiClient.listAgentVersions(agentId);
      setVersions(data);
    } catch (error) {
      console.error("Failed to load versions", error);
    }
  }

  const handleNewAgent = () => {
    setSelectedAgentId("new");
    setDraft({ ...EMPTY_AGENT, agentId: "" });
    setActivePanel("design");
    hasAutoSelectedRef.current = false;
  };

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setTestSubject("custom");
    setActivePanel("test");
    hasAutoSelectedRef.current = true;
  };

  const toggleToolSelection = (toolName: string) => {
    setSelectedToolNames((previous) =>
      previous.includes(toolName)
        ? previous.filter((name) => name !== toolName)
        : [...previous, toolName],
    );
  };

  const handleToggleTool = (tool: string, checked: boolean) => {
    setDraft((previous) => {
      const existing = new Set(previous.allowedTools ?? []);
      if (checked) {
        existing.add(tool);
      } else {
        existing.delete(tool);
      }
      return { ...previous, allowedTools: Array.from(existing) };
    });
  };

  const handleDraftChange = <Key extends keyof EditableAgent>(key: Key, value: EditableAgent[Key]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Agent name is required.");
      return;
    }
    setIsSaving(true);
    try {
      if (selectedAgentId === "new" || !selectedAgentId) {
        const payload: AgentDefinitionCreatePayload = {
          name: draft.name,
          description: draft.description,
          basePrompt: draft.basePrompt,
          allowedTools: draft.allowedTools,
          backend: draft.backend,
          directChangeAllowed: draft.directChangeAllowed,
          requireApproval: draft.requireApproval,
          agentcoreAgentId: draft.agentcoreAgentId,
          agentcoreAgentAliasId: draft.agentcoreAgentAliasId,
        };
        const created = await apiClient.createAgentDefinition(payload);
        toast.success("Agent created.");
        setAgents((previous) =>
          sortAgentList([created, ...previous.filter((agent) => agent.agentId !== created.agentId)]),
        );
        setDraft({
          ...created,
          agentcoreAgentId: created.agentcoreAgentId ?? "",
          agentcoreAgentAliasId: created.agentcoreAgentAliasId ?? "",
        });
        setSelectedAgentId(created.agentId);
        setActivePanel("test");
        hasAutoSelectedRef.current = true;
        handleResetChat();
      } else {
        const payload: AgentDefinitionUpdatePayload = {
          name: draft.name,
          description: draft.description,
          basePrompt: draft.basePrompt,
          allowedTools: draft.allowedTools,
          backend: draft.backend,
          directChangeAllowed: draft.directChangeAllowed,
          requireApproval: draft.requireApproval,
          agentcoreAgentId: draft.agentcoreAgentId,
          agentcoreAgentAliasId: draft.agentcoreAgentAliasId,
        };
        const updated = await apiClient.updateAgentDefinition(selectedAgentId, payload);
        toast.success("Agent updated.");
        setDraft({
          ...updated,
          agentId: updated.agentId,
          agentcoreAgentId: updated.agentcoreAgentId ?? "",
          agentcoreAgentAliasId: updated.agentcoreAgentAliasId ?? "",
        });
        setAgents((previous) =>
          sortAgentList(
            previous.map((agent) => (agent.agentId === updated.agentId ? updated : agent)),
          ),
        );
        void loadAgents();
      }
    } catch (error) {
      console.error("Failed to save agent", error);
      const message = error instanceof Error ? error.message : "Failed to save agent definition.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedAgentId || selectedAgentId === "new") {
      toast.error("Create the agent before publishing.");
      return;
    }
    setIsPublishing(true);
    try {
      const updated = await apiClient.publishAgentDefinition(selectedAgentId);
      toast.success(`Agent published (version ${updated.version}).`);
      setDraft({
        ...updated,
        agentcoreAgentId: updated.agentcoreAgentId ?? "",
        agentcoreAgentAliasId: updated.agentcoreAgentAliasId ?? "",
      });
      await loadAgents();
      await loadVersions(updated.agentId);
    } catch (error) {
      console.error("Failed to publish agent", error);
      const message = error instanceof Error ? error.message : "Failed to publish agent.";
      toast.error(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLoadMemory = async () => {
    if (!selectedAgentId || selectedAgentId === "new") {
      toast.error("Select an agent first.");
      return;
    }
    if (!memoryAccountId.trim()) {
      toast.error("Provide an account ID to load memory.");
      return;
    }
    setIsLoadingMemory(true);
    try {
      const data = await apiClient.listAgentMemory(selectedAgentId, memoryAccountId.trim());
      setMemory(data);
      if (data.length === 0) {
        toast.info("No memory entries recorded yet for this agent/account.");
      }
    } catch (error) {
      console.error("Failed to load memory", error);
      const message = error instanceof Error ? error.message : "Unable to load agent memory.";
      toast.error(message);
    } finally {
      setIsLoadingMemory(false);
    }
  };

  const handleStartTraining = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedAgentId || selectedAgentId === "new") {
      toast.error("Save the agent before launching training.");
      return;
    }
    setIsLaunchingTraining(true);
    try {
      const job = await apiClient.startAgentTraining(selectedAgentId, {
        provider: trainingProvider,
        baseModelId: trainingBaseModel || undefined,
        domainAdaptation: trainingDomainAdaptation,
        notes: trainingNotes || undefined,
      });
      toast.success("Training job started.");
      setTrainingJobs((previous) => [job, ...previous.filter((entry) => entry.jobId !== job.jobId)]);
      await loadTrainingJobs(selectedAgentId);
      await loadAgents();
    } catch (error) {
      console.error("Failed to start training job", error);
      toast.error("Unable to start training job.");
    } finally {
      setIsLaunchingTraining(false);
    }
  };

  const handleRefreshTrainingJobs = () => {
    void loadTrainingJobs(selectedAgentId);
  };

  const handleSubmitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAgentId || selectedAgentId === "new") {
      toast.error("Select an agent first.");
      return;
    }
    if (!feedbackInput.trim() || !feedbackOutput.trim()) {
      toast.error("Provide both the prompt and the desired response.");
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const response = await apiClient.submitAgentFeedback(selectedAgentId, {
        input: feedbackInput.trim(),
        output: feedbackOutput.trim(),
      });
      toast.success("Feedback captured for training.");
      setFeedbackInput("");
      setFeedbackOutput("");
      console.debug("Feedback stored at", response.s3Key);
    } catch (error) {
      console.error("Failed to save feedback example", error);
      toast.error("Unable to save feedback example.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleTestSubjectChange = (value: string) => {
    if (value === "custom") {
      setTestSubject("custom");
    } else {
      setTestSubject(value as CloudAgentType);
    }
  };

  const handleResetChat = () => {
    setConversation([]);
    setChatTranscript([]);
    setToolRuns([]);
    setLastResponse(null);
    setLastError(null);
    setChatInput("");
  };

  const handleSendChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed) {
      toast.error("Enter a message to send to the agent.");
      return;
    }
    if (!testAccountId.trim()) {
      toast.error("Select the AWS account to test against.");
      return;
    }

    let agentType: CloudAgentType;
    let backend: AgentBackend | undefined;
    let agentId: string | undefined;

    if (testSubject === "custom") {
      if (!selectedAgent) {
        toast.error("Select or create a custom agent to test.");
        return;
      }
      agentType = "Custom";
      backend = selectedAgent.backend;
      agentId = selectedAgent.agentId;
    } else {
      agentType = testSubject;
      backend = "langgraph";
    }

    const userMessage: AgentMessage = { role: "user", content: trimmed };
    const updatedConversation = [...conversation, userMessage];

    setChatInput("");
    setIsChatting(true);
    setConversation(updatedConversation);
    setChatTranscript((previous) => [
      ...previous,
      { id: makeEntryId(), role: "user", content: trimmed, timestamp: new Date() },
    ]);
    setLastError(null);

    try {
      const payload = {
        accountId: testAccountId,
        agentType,
        message: trimmed,
        conversation: updatedConversation,
        backend,
        agentId,
        toolInvocations:
          selectedToolNames.length > 0
            ? selectedToolNames.map((tool) => ({ name: tool, args: {} }))
            : undefined,
        context:
          selectedToolNames.length > 0
            ? { selectedTools: selectedToolNames }
            : undefined,
      };

      const response = await apiClient.agentChat(payload);
      const data = response.data;
      if (!data) {
        throw new Error("Agent returned no response.");
      }

      const assistantMessage: AgentMessage = {
        role: "assistant",
        content: data.reply ?? "Agent returned an empty response.",
      };
      const finalConversation = [...updatedConversation, assistantMessage];
      setConversation(finalConversation);
      setChatTranscript((previous) => [
        ...previous,
        {
          id: makeEntryId(),
          role: "assistant",
          content: assistantMessage.content,
          timestamp: new Date(),
        },
      ]);
      setToolRuns(data.tools ?? []);
      setLastResponse(data);

      if (agentType === "Custom" && agentId) {
        try {
          const refreshedMemory = await apiClient.listAgentMemory(agentId, testAccountId);
          setMemoryAccountId(testAccountId);
          setMemory(refreshedMemory);
        } catch (memoryError) {
          console.error("Failed to refresh agent memory", memoryError);
        }
      }
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Agent chat failed");
      setConversation(conversation);
      setChatTranscript((previous) => previous.slice(0, previous.length - 1));
      toast.error(error instanceof Error ? error.message : "Agent chat failed");
    } finally {
      setIsChatting(false);
    }
  };

  const handleExecuteCode = async () => {
    if (!canExecuteCode) {
      toast.error("Enable the sandbox tool for this agent before executing code.");
      return;
    }
    if (!testAccountId.trim()) {
      toast.error("Select the AWS account to test against.");
      return;
    }
    if (!codeSnippet.trim()) {
      toast.error("Paste a code snippet to execute.");
      return;
    }

    const proceed =
      typeof window !== "undefined"
        ? window.confirm(
            "The sandbox will execute this snippet with your project credentials. Continue?",
          )
        : true;
    if (!proceed) {
      return;
    }

    const agentType: CloudAgentType | "Custom" =
      testSubject === "custom" ? "Custom" : testSubject;
    const backend: AgentBackend =
      testSubject === "custom" && selectedAgent ? selectedAgent.backend : "langgraph";
    const agentId = testSubject === "custom" ? selectedAgent?.agentId : undefined;

    setIsRunningCode(true);
    setLastError(null);
    try {
      const payload = {
        accountId: testAccountId,
        agentType,
        message:
          codeDescription.trim() || "Execute the provided code snippet in the sandbox.",
        conversation,
        backend,
        agentId,
        context: { entrypoint: "agent-studio-code" },
        toolInvocations: [
          {
            name: "run_code",
            args: {
              code: codeSnippet,
              language: codeLanguage,
              description: codeDescription,
              requested_by: "agent-studio",
            },
          },
        ],
      };

      const response = await apiClient.agentChat(payload);
      const data = response.data;
      if (!data) {
        throw new Error("Sandbox returned no response.");
      }

      setToolRuns(data.tools ?? []);
      setLastResponse(data);

      if (agentType === "Custom" && agentId) {
        try {
          const refreshedMemory = await apiClient.listAgentMemory(agentId, testAccountId);
          setMemoryAccountId(testAccountId);
          setMemory(refreshedMemory);
        } catch (memoryError) {
          console.error("Failed to refresh agent memory", memoryError);
        }
      }

      const run = (data.tools ?? []).find((tool) => tool.tool === "run_code");
      const status = run?.status ?? (run?.error ? "error" : "success");
      if (status === "error") {
        toast.error(run?.error ?? "Sandbox run failed.");
      } else {
        toast.success("Sandbox run completed.");
      }
      setCodeSnippet("");
      setCodeDescription("");
    } catch (error) {
      console.error("Sandbox execution failed", error);
      const message = error instanceof Error ? error.message : "Sandbox execution failed.";
      toast.error(message);
    } finally {
      setIsRunningCode(false);
    }
  };

  const effectiveBackend = draft.backend;
  const selectedStatus: AgentStatus = draft.status ?? "draft";
  const toolsToDisplay = toolCatalog && toolCatalog.length > 0 ? toolCatalog : DEFAULT_TOOL_CATALOG;
  const selectedAgentName = selectedAgent?.name ?? "Custom Agent";

  const canTestCustomAgent = Boolean(selectedAgent && selectedAgent.agentId);

  const accountsOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.account_id,
        label: account.account_name ? `${account.account_name} (${account.account_id})` : account.account_id,
      })),
    [accounts],
  );

  const handleBlueprintLaunch = (agentType: CloudAgentType) => {
    router.push(`/dashboard?agent=${agentType}`);
  };

  const renderToolTelemetry = () => {
    const nonCodeRuns = toolRuns.filter((run) => run.tool !== "run_code");
    if (nonCodeRuns.length === 0) {
      return null;
    }
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-900">Tool telemetry</h4>
        <div className="space-y-3 text-sm text-slate-700">
          {nonCodeRuns.map((tool, index) => (
            <div
              key={`${tool.tool}-${index}`}
              className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">
                <span>{tool.tool}</span>
                <Badge
                  variant={
                    tool.status === "success"
                      ? "outline"
                      : tool.status === "pending_confirmation"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {tool.status}
                </Badge>
              </div>
              {tool.error && (
                <p className="text-xs text-rose-600">{tool.error}</p>
              )}
              {tool.data && (
                <pre className="max-h-48 overflow-auto rounded-lg bg-white p-3 text-xs text-slate-800">
                  {formatJson(tool.data)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFindingsAndActions = () => {
    if (!lastResponse) {
      return null;
    }

    const hasFindings = (lastResponse.findings ?? []).length > 0;
    const hasActions = (lastResponse.proposedActions ?? []).length > 0;

    if (!hasFindings && !hasActions) {
      return null;
    }

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {hasFindings && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900">Signal review</h4>
            <div className="space-y-3 text-sm text-slate-700">
              {lastResponse.findings.map((finding, index) => (
                <div key={`finding-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
                    <span>{finding.title ?? "Finding"}</span>
                    {finding.severity && <Badge variant="outline">{finding.severity}</Badge>}
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">
                    {finding.description ?? "No description provided."}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasActions && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-sm font-semibold text-slate-900">Proposed actions</h4>
            <div className="space-y-3 text-sm text-slate-700">
              {lastResponse.proposedActions.map((action) => (
                <div key={action.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{action.title}</span>
                    <Badge variant="outline">{action.risk}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{action.rationale}</p>
                  {action.impactedResources.length > 0 && (
                    <p className="text-[0.7rem] text-slate-500">
                      Resources: {action.impactedResources.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderToolSelectors = () => {
    if (availableTestTools.length === 0) {
      return null;
    }
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Tool quick-run</h4>
          <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Optional pre-chat telemetry
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Selected tools execute before the model responds. Perfect for priming custom agents with
          resource summaries or cost deltas.
        </p>
        <div className="flex flex-wrap gap-2">
          {availableTestTools.map((tool) => {
            const isActive = selectedToolNames.includes(tool);
            const catalogEntry = toolCatalog.find((candidate) => candidate.name === tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() => toggleToolSelection(tool)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  isActive
                    ? "border-cyan-400 bg-cyan-50 text-cyan-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-cyan-400 hover:text-cyan-700"
                }`}
              >
                {catalogEntry?.description ?? tool}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAgentSnapshot = () => {
    if (testSubject === "custom" && selectedAgent) {
      const summaryItems = [
        { label: "Status", value: selectedAgent.status },
        { label: "Backend", value: selectedAgent.backend === "agentcore" ? "Agentcore" : "LangGraph" },
        { label: "Allowed tools", value: (selectedAgent.allowedTools ?? []).length > 0 ? selectedAgent.allowedTools!.join(", ") : "None" },
        { label: "Direct change", value: selectedAgent.directChangeAllowed ? "Enabled" : "Disabled" },
        { label: "Requires approval", value: selectedAgent.requireApproval ? "Yes" : "No" },
        { label: "Version", value: `v${selectedAgent.version}` },
      ];
      if (selectedAgent.modelStatus) {
        summaryItems.push({ label: "Model status", value: selectedAgent.modelStatus });
      }
      if (selectedAgent.modelEndpoint) {
        summaryItems.push({ label: "Model endpoint", value: selectedAgent.modelEndpoint });
      }
      if (selectedAgent.modelVersion) {
        summaryItems.push({ label: "Model version", value: selectedAgent.modelVersion });
      }

      return (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">Agent snapshot</h4>
          <p className="text-xs text-slate-600">{selectedAgent.description || "No description provided."}</p>
          <dl className="grid gap-2 text-sm text-slate-700">
            {summaryItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-500">{item.label}</dt>
                <dd className="text-sm text-slate-900 text-right break-all">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    }

    if (testSubject !== "custom" && blueprintUnderTest) {
      return (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">{blueprintUnderTest.name}</h4>
          <p className="text-xs text-slate-600">{blueprintUnderTest.description}</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {blueprintUnderTest.highlights.map((highlight) => (
              <li key={highlight}>• {highlight}</li>
            ))}
          </ul>
        </div>
      );
    }

    return null;
  };

  const renderCodeInterpreterPanel = () => {
    if (!canExecuteCode && codeRuns.length === 0) {
      return null;
    }
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Sandbox</h4>
          <Badge variant="outline" className="uppercase tracking-[0.3em]">
            {codeRuns.length}
          </Badge>
        </div>

        {canExecuteCode ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleExecuteCode();
            }}
            className="space-y-3"
          >
            <textarea
              value={codeSnippet}
              onChange={(event) => setCodeSnippet(event.target.value)}
              rows={6}
              placeholder="Paste Python to execute in the sandbox environment."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
            />
            <div className="grid gap-3 md:grid-cols-[2fr,1fr]">
              <Input
                value={codeDescription}
                onChange={(event) => setCodeDescription(event.target.value)}
                placeholder="Optional description (appears in telemetry)"
                className="border-slate-200 bg-white text-sm text-slate-900"
              />
              <select
                value={codeLanguage}
                onChange={(event) => setCodeLanguage(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
              >
                <option value="python">python</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isRunningCode}>
                {isRunningCode ? "Running…" : "Execute in Sandbox"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCodeSnippet("");
                  setCodeDescription("");
                }}
              >
                Clear
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-slate-600">
            Enable the <code>run_code</code> tool for this agent to access the sandbox.
          </p>
        )}

        {codeRuns.length > 0 && (
          <div className="space-y-3 text-sm text-slate-700">
            {codeRuns.map((run, index) => {
              const payload = run.data ?? {};
              const status = (payload.status as string) ?? run.status;
              const logs = typeof payload.logs === "string" ? payload.logs : undefined;
              const completedAt =
                typeof payload.completedAt === "string" ? payload.completedAt : undefined;
              const description =
                typeof payload.description === "string" ? payload.description : undefined;
              return (
                <div
                  key={`code-run-${index}`}
                  className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
                    <span>run_code</span>
                    <Badge variant={status === "success" ? "outline" : "destructive"}>{status}</Badge>
                  </div>
                  {description && <p className="text-xs text-slate-600">{description}</p>}
                  {completedAt && (
                    <p className="text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
                      Completed {new Date(completedAt).toLocaleString()}
                    </p>
                  )}
                  {logs && (
                    <pre className="max-h-40 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-800">
                      {logs.trim() || "(no output)"}
                    </pre>
                  )}
                  {!logs && payload && Object.keys(payload).length > 0 && (
                    <pre className="max-h-40 overflow-auto rounded-xl bg-white p-3 text-xs text-slate-800">
                      {formatJson(payload)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderMemoryPreview = () => {
    if (memory.length === 0) {
      return null;
    }
    const preview = memory.slice(-4).reverse();
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">Memory preview</h4>
          {memoryAccountId && (
            <span className="text-xs uppercase tracking-[0.25em] text-slate-500">{memoryAccountId}</span>
          )}
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          {preview.map((entry, index) => (
            <div key={`${entry.createdAt ?? index}-${entry.role}`} className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
                <span>{entry.role}</span>
                {entry.createdAt && <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>}
              </div>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{entry.content}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-12 text-slate-900">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-white px-8 py-10 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-[0.35em] text-cyan-600">Agent Studio</Label>
            <h1 className="text-3xl font-semibold leading-tight">
              Author, test, and deploy CloudOps specialists
            </h1>
            <p className="max-w-3xl text-base text-slate-600">
              Build reusable operators that blend deterministic heuristics, Bedrock reasoning, and sandboxed tooling.
              Promote drafts into published versions, then validate outputs against live AWS metadata before shipping.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleNewAgent} className="rounded-full bg-slate-900 text-white hover:bg-slate-800">
                + New Agent
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-slate-300 text-slate-700 hover:bg-white"
                onClick={() => router.push("/dashboard")}
              >
                Open Playground
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Agents</p>
              <p className="mt-1 text-2xl font-semibold">{agents.length || "0"}</p>
              <p className="text-xs text-slate-500">Draft + published specialists</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Last training run</p>
              <p className="mt-1 text-2xl font-semibold">
                {trainingJobs[0]?.createdAt ? new Date(trainingJobs[0].createdAt).toLocaleDateString() : "—"}
              </p>
              <p className="text-xs text-slate-500">Refresh from Training tab</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {CORE_AGENT_BLUEPRINTS.map((blueprint) => (
          <Card key={blueprint.agentType} className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-slate-900">{blueprint.name}</CardTitle>
              <CardDescription className="text-slate-600">{blueprint.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-xs text-slate-600">
              <ul className="space-y-1 text-slate-500">
                {blueprint.highlights.map((highlight) => (
                  <li key={highlight}>• {highlight}</li>
                ))}
              </ul>
              <Button
                variant="ghost"
                className="self-start text-cyan-600 hover:text-cyan-500"
                onClick={() => handleBlueprintLaunch(blueprint.agentType)}
              >
                Launch in Dashboard
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Catalog</CardTitle>
            <CardDescription>Drafts and published agents available to the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[520px] overflow-y-auto">
            {agents.length === 0 ? (
              <p className="text-sm text-slate-500">No custom agents yet. Create your first specialist to get started.</p>
            ) : (
              agents.map((agent) => {
                const isActive = agent.agentId === selectedAgentId;
                return (
                  <button
                    key={agent.agentId}
                    type="button"
                    onClick={() => handleSelectAgent(agent.agentId)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-cyan-200 bg-cyan-50 text-cyan-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <Badge
                        variant={agent.status === "published" ? "outline" : "secondary"}
                        className="uppercase tracking-wide text-[0.6rem]"
                      >
                        {agent.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{agent.description}</p>
                  </button>
                );
              })
            )}
            <button
              type="button"
              onClick={handleNewAgent}
              className="w-full rounded-xl border border-dashed border-cyan-300 bg-slate-50 px-4 py-3 text-left text-sm text-cyan-700 hover:border-cyan-400"
            >
              + Draft new agent
            </button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {PANEL_OPTIONS.map((option) => {
              const isActive = activePanel === option.key;
              return (
                <Button
                  key={option.key}
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setActivePanel(option.key)}
                  className={
                    isActive
                      ? "rounded-full bg-slate-900 text-white hover:bg-slate-800"
                      : "rounded-full border-slate-200 text-slate-600 hover:border-slate-300"
                  }
                >
                  {option.label}
                </Button>
              );
            })}
          </div>

          {activePanel === "design" && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-900">
                  {selectedAgentId === "new" || !selectedAgentId ? "Create Agent" : draft.name}
                </CardTitle>
                <CardDescription>
                  Configure prompts, tool access, and execution backend. Save changes before publishing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name" className="text-slate-600">
                      Display Name
                    </Label>
                    <Input
                      id="agent-name"
                      value={draft.name}
                      onChange={(event) => handleDraftChange("name", event.target.value)}
                      placeholder="e.g., FinOps Navigator"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-backend" className="text-slate-600">
                      Backend
                    </Label>
                    <select
                      id="agent-backend"
                      value={effectiveBackend}
                      onChange={(event) => handleDraftChange("backend", event.target.value as AgentBackend)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="langgraph">LangGraph (internal orchestrator)</option>
                      <option value="agentcore">AWS Bedrock Agentcore</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-description" className="text-slate-600">
                    Description
                  </Label>
                  <textarea
                    id="agent-description"
                    value={draft.description}
                    onChange={(event) => handleDraftChange("description", event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                    placeholder="Short summary of the agent’s responsibilities."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="agent-prompt" className="text-slate-600">
                    Base Prompt / System Instructions
                  </Label>
                  <textarea
                    id="agent-prompt"
                    value={draft.basePrompt}
                    onChange={(event) => handleDraftChange("basePrompt", event.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                    placeholder="Define how the agent should behave, guardrails, tone, and output format."
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-slate-600">Tool Access</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {toolsToDisplay.map((tool) => {
                      const checked = draft.allowedTools?.includes(tool.name) ?? false;
                      return (
                        <label
                          key={tool.name}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-cyan-300"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => handleToggleTool(tool.name, event.target.checked)}
                            className="h-4 w-4 accent-cyan-500"
                          />
                          <span className="flex flex-col">
                            <span className="font-medium text-slate-900">{tool.description || tool.name}</span>
                            <span className="text-[0.65rem] uppercase tracking-wide text-slate-500">{tool.name}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.directChangeAllowed}
                      onChange={(event) => handleDraftChange("directChangeAllowed", event.target.checked)}
                      className="h-4 w-4 accent-cyan-500"
                    />
                    Allow direct-change actions without PRs
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft.requireApproval}
                      onChange={(event) => handleDraftChange("requireApproval", event.target.checked)}
                      className="h-4 w-4 accent-cyan-500"
                    />
                    Require operator approval before execution
                  </label>
                </div>

                {effectiveBackend === "agentcore" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agentcore-id" className="text-slate-600">
                        Agentcore Agent ID
                      </Label>
                      <Input
                        id="agentcore-id"
                        value={draft.agentcoreAgentId ?? ""}
                        onChange={(event) => handleDraftChange("agentcoreAgentId", event.target.value)}
                        placeholder="e.g. DRAJ6EXAMPLE"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agentcore-alias" className="text-slate-600">
                        Agentcore Alias ID
                      </Label>
                      <Input
                        id="agentcore-alias"
                        value={draft.agentcoreAgentAliasId ?? ""}
                        onChange={(event) => handleDraftChange("agentcoreAgentAliasId", event.target.value)}
                        placeholder="e.g. TSTALIASID"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <Badge
                      variant={selectedStatus === "published" ? "outline" : "secondary"}
                      className="uppercase tracking-[0.25em]"
                    >
                      {selectedStatus}
                    </Badge>
                    <span>Version {draft.version ?? 0}</span>
                    {draft.updatedAt && <span>Updated {new Date(draft.updatedAt).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving…" : "Save Draft"}
                    </Button>
                    <Button onClick={handlePublish} disabled={isPublishing || !selectedAgentId || selectedAgentId === "new"}>
                      {isPublishing ? "Publishing…" : "Publish"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activePanel === "test" && (
            <Card className="border-slate-200 bg-white shadow-lg">
              <CardHeader>
                <CardTitle className="text-slate-900">Test Harness</CardTitle>
                <CardDescription>
                  Run ad-hoc prompts against your agent or the built-in specialists. Tool telemetry and proposed actions
                  are captured below for quick validation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-slate-600">Agent under test</Label>
                    <select
                      value={testSubject === "custom" ? "custom" : testSubject}
                      onChange={(event) => handleTestSubjectChange(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                    >
                      {selectedAgent && <option value="custom">Custom • {selectedAgentName}</option>}
                      {CORE_AGENT_BLUEPRINTS.map((blueprint) => (
                        <option key={blueprint.agentType} value={blueprint.agentType}>
                          Core • {blueprint.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-600">AWS account</Label>
                    <select
                      value={testAccountId}
                      onChange={(event) => setTestAccountId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="">Select account…</option>
                      {accountsOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <Label className="text-slate-600">Backend</Label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      {testSubject === "custom" ? (
                        <span className="text-slate-900">{selectedAgent ? selectedAgent.backend : "Select an agent"}</span>
                      ) : (
                        <span className="text-slate-900">LangGraph orchestrator</span>
                      )}
                    </div>
                  </div>
                </div>

                {lastError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {lastError}
                  </div>
                )}

                {renderToolSelectors()}

                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
                        {chatTranscript.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No conversation yet. Send a prompt to kick things off.
                          </p>
                        ) : (
                          chatTranscript.map((entry) => (
                            <div
                              key={entry.id}
                              className={`flex flex-col gap-1 rounded-xl px-3 py-2 text-sm ${
                                entry.role === "user"
                                  ? "bg-cyan-50 text-cyan-900"
                                  : "bg-slate-100 text-slate-900"
                              }`}
                            >
                              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
                                <span>{entry.role === "user" ? "User" : "Agent"}</span>
                                <span>{formatTimestamp(entry.timestamp)}</span>
                              </div>
                              <p className="whitespace-pre-wrap">{entry.content}</p>
                            </div>
                          ))
                        )}
                      </div>

                      <form onSubmit={handleSendChat} className="space-y-3">
                        <textarea
                          value={chatInput}
                          onChange={(event) => setChatInput(event.target.value)}
                          rows={3}
                          placeholder="Ask the agent to summarise findings, draft remediations, or run a targeted tool."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button type="submit" disabled={isChatting || (!canTestCustomAgent && testSubject === "custom")}>
                            {isChatting ? "Running…" : "Send"}
                          </Button>
                          <Button type="button" variant="outline" onClick={handleResetChat}>
                            Reset
                          </Button>
                          {testSubject === "custom" && selectedAgent && (
                            <span className="text-xs text-slate-500">Testing draft • {selectedAgent.name}</span>
                          )}
                        </div>
                      </form>
                    </div>

                    {renderFindingsAndActions()}
                  </div>

                  <div className="space-y-4">
                    {renderAgentSnapshot()}
                    {renderCodeInterpreterPanel()}
                    {renderToolTelemetry()}
                    {renderMemoryPreview()}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activePanel === "training" && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-900">Training & Feedback</CardTitle>
                <CardDescription>
                  Launch SageMaker/Bedrock fine-tunes, review job history, and capture Well-Architected feedback
                  examples for continual learning.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedAgent || selectedAgentId === "new" ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    Save and select an agent to access training controls.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div className="space-y-6">
                      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-slate-900">Specialized model snapshot</h4>
                          <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <dt className="uppercase tracking-[0.25em] text-slate-500">Status</dt>
                              <dd className="text-sm text-slate-900">
                                {selectedAgent.modelStatus ?? "Not trained"}
                              </dd>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <dt className="uppercase tracking-[0.25em] text-slate-500">Endpoint</dt>
                              <dd className="text-sm text-slate-900 break-all">
                                {selectedAgent.modelEndpoint ?? "—"}
                              </dd>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <dt className="uppercase tracking-[0.25em] text-slate-500">Provider</dt>
                              <dd className="text-sm text-slate-900">
                                {selectedAgent.modelProvider ?? "sagemaker"}
                              </dd>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <dt className="uppercase tracking-[0.25em] text-slate-500">Version</dt>
                              <dd className="text-sm text-slate-900">
                                {selectedAgent.modelVersion ?? "—"}
                              </dd>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 sm:col-span-2">
                              <dt className="uppercase tracking-[0.25em] text-slate-500">Artifact</dt>
                              <dd className="text-sm text-slate-900 break-all">
                                {selectedAgent.modelArtifactUri ?? "—"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <form onSubmit={handleStartTraining} className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-slate-600">Provider</Label>
                              <select
                                value={trainingProvider}
                                onChange={(event) =>
                                  setTrainingProvider(event.target.value as "sagemaker" | "bedrock")
                                }
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                              >
                                <option value="sagemaker">SageMaker (custom endpoint)</option>
                                <option value="bedrock">Bedrock fine-tune</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-slate-600">Base model</Label>
                              <Input
                                value={trainingBaseModel}
                                onChange={(event) => setTrainingBaseModel(event.target.value)}
                                placeholder="anthropic.claude-3-5-sonnet-20240620-v1:0"
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-cyan-500"
                              checked={trainingDomainAdaptation}
                              onChange={(event) => setTrainingDomainAdaptation(event.target.checked)}
                            />
                            Emphasize domain adaptation (use feedback + internal docs)
                          </label>
                          <div className="space-y-1">
                            <Label className="text-slate-600">Notes (optional)</Label>
                            <textarea
                              value={trainingNotes}
                              onChange={(event) => setTrainingNotes(event.target.value)}
                              rows={3}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                              placeholder="E.g. 'Focus on Lambda reliability findings for Payments account'"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <Button type="submit" disabled={isLaunchingTraining}>
                              {isLaunchingTraining ? "Launching…" : "Start Training"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRefreshTrainingJobs}
                              disabled={isLoadingTrainingJobs}
                            >
                              {isLoadingTrainingJobs ? "Refreshing…" : "Refresh jobs"}
                            </Button>
                          </div>
                        </form>
                      </div>

                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-900">Recent training jobs</h4>
                          <span className="text-xs text-slate-500">
                            {trainingJobs.length === 0 ? "No runs yet" : `${trainingJobs.length} job(s)`}
                          </span>
                        </div>
                        <div className="max-h-80 space-y-3 overflow-y-auto">
                          {isLoadingTrainingJobs ? (
                            <p className="text-sm text-slate-500">Loading training history…</p>
                          ) : trainingJobs.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              Once a job completes it will appear here with status and artifacts.
                            </p>
                          ) : (
                            trainingJobs.map((job) => (
                              <div
                                key={job.jobId}
                                className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-slate-900">{job.provider} • {job.modelVersion ?? "v?"}</p>
                                    <p className="text-xs text-slate-500">{formatIsoDate(job.createdAt)}</p>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={
                                      job.status === "COMPLETED"
                                        ? "border-emerald-200 text-emerald-700"
                                        : job.status === "FAILED"
                                          ? "border-rose-200 text-rose-700"
                                          : "border-cyan-200 text-cyan-700"
                                    }
                                  >
                                    {job.status}
                                  </Badge>
                                </div>
                                {job.modelEndpoint && (
                                  <p className="text-xs text-slate-500 break-all">
                                    Endpoint: {job.modelEndpoint}
                                  </p>
                                )}
                                {job.artifactUri && (
                                  <p className="text-xs text-slate-500 break-all">
                                    Artifact: {job.artifactUri}
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <h4 className="text-sm font-semibold text-slate-900">Capture WA feedback</h4>
                        <p className="text-xs text-slate-600">
                          Log curated prompt/response pairs to improve the specialized Well-Architected model.
                        </p>
                        <form onSubmit={handleSubmitFeedback} className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-slate-600">Prompt / situation</Label>
                            <textarea
                              value={feedbackInput}
                              onChange={(event) => setFeedbackInput(event.target.value)}
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                              placeholder="Describe the workload, findings request, or operator question…"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-600">Ideal agent response</Label>
                            <textarea
                              value={feedbackOutput}
                              onChange={(event) => setFeedbackOutput(event.target.value)}
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                              placeholder="Provide the gold-standard answer or remediation guidance."
                            />
                          </div>
                          <Button type="submit" disabled={isSubmittingFeedback}>
                            {isSubmittingFeedback ? "Saving…" : "Save Feedback"}
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activePanel === "memory" && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-900">Conversation Memory</CardTitle>
                <CardDescription>
                  Inspect recent messages captured for a given account. Useful for validating retained context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={memoryAccountId}
                    onChange={(event) => setMemoryAccountId(event.target.value)}
                    className="sm:flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="">Account ID…</option>
                    {accountsOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" onClick={handleLoadMemory} disabled={isLoadingMemory}>
                    {isLoadingMemory ? "Loading…" : "Load Memory"}
                  </Button>
                </div>
                <div className="max-h-[320px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {memory.length === 0 ? (
                    <p className="text-slate-500">No memory entries loaded.</p>
                  ) : (
                    memory.map((entry) => (
                      <div key={`${entry.createdAt}-${entry.role}`} className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="uppercase tracking-[0.25em]">{entry.role}</span>
                          {entry.createdAt && <span>{new Date(entry.createdAt).toLocaleString()}</span>}
                        </div>
                        <p className="whitespace-pre-wrap text-slate-800">{entry.content}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {activePanel === "versions" && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-900">Version History</CardTitle>
                <CardDescription>Recently published snapshots of this agent’s configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[420px] overflow-y-auto text-sm text-slate-700">
                {versions.length === 0 ? (
                  <p className="text-slate-500">No versions published yet.</p>
                ) : (
                  versions.map((version) => (
                    <div key={version.version} className="space-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Version {version.version}</span>
                        {version.publishedAt && (
                          <span className="text-xs text-slate-500">{new Date(version.publishedAt).toLocaleString()}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">
                        {version.definition.description || "No description"}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
