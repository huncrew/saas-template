import type { FactoryBuild, FactoryProject } from "@/types/factory";

export const mockStore = {
  projects: [] as FactoryProject[],
  builds: new Map<string, FactoryBuild>(),
};

export function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}








