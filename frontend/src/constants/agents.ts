import { CloudAgentType } from "@/types";

export const AGENT_BLUEPRINTS: Array<{
  type: CloudAgentType;
  title: string;
  description: string;
  highlights: string[];
}> = [
  {
    type: "WellArchitectedAgent",
    title: "Well-Architected Advisor",
    description:
      "Reliability and security heuristics blended with Bedrock reasoning to uncover observability and hardening gaps.",
    highlights: ["X-Ray coverage", "Public access scan", "Pillar-aligned guidance"],
  },
  {
    type: "CostAgent",
    title: "FinOps Strategist",
    description:
      "FinOps agent combining Cost Explorer signals and heuristics to surface savings, forecast impact, and ship IaC fixes.",
    highlights: ["Lifecycle gaps", "Idle compute", "Savings planner"],
  },
  {
    type: "AIWorkflowAgent",
    title: "AI Workflow Designer",
    description:
      "Maps manual processes into AI-assisted pipelines and scaffolds Bedrock-powered workflows for production teams.",
    highlights: ["Playbook drafting", "Prompt critique", "Serverless topology"],
  },
];

