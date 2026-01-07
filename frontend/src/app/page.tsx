import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check, Shield, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <main className="pt-24">
        <section className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-b from-white to-gray-50">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-24 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
                <div className="absolute -bottom-28 left-1/2 h-64 w-[42rem] -translate-x-1/2 rounded-full bg-green-200/30 blur-3xl" />
              </div>

              <div className="relative px-6 py-16 sm:px-10 sm:py-20">
                <div className="mx-auto max-w-3xl text-center">
                  <div className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1 text-xs text-gray-700 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Factory • Prompt → Production
                  </div>

                  <h1 className="mt-6 text-4xl font-semibold tracking-tight text-gray-900 sm:text-6xl">
                    Build real apps.
                    <span className="block bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                      Not demos.
                    </span>
                  </h1>

                  <p className="mt-5 text-lg text-gray-600 sm:text-xl">
                    Chat to generate a plan and code changes, get a hosted preview, then deploy to AWS with Terraform.
                  </p>

                  <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Button asChild size="lg" className="gap-2">
                      <Link href="/projects">
                        Open Factory <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/auth/signin">Sign in</Link>
                    </Button>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-600">
                    <span className="inline-flex items-center gap-2">
                      <Shield className="h-4 w-4 text-emerald-600" /> Guardrails + artifacts
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-600" /> Hosted previews
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" /> Deterministic deploys
                    </span>
                  </div>
                </div>

                <div className="mt-12 grid gap-4 px-0 sm:grid-cols-3">
                  <Card className="bg-white/80 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-base">Chat-first workflow</CardTitle>
                      <CardDescription>Guided plan → confirm → build.</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className="bg-white/80 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-base">Preview in seconds</CardTitle>
                      <CardDescription>CloudFront URL per build.</CardDescription>
                    </CardHeader>
                  </Card>
                  <Card className="bg-white/80 backdrop-blur">
                    <CardHeader>
                      <CardTitle className="text-base">Deploy with rollback</CardTitle>
                      <CardDescription>Terraform outputs + artifacts.</CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 sm:px-6 lg:px-8 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">V1 template: SaaS CRUD</CardTitle>
                  <CardDescription>Teams/orgs, auth, CRUD resource, admin page, audit log, billing stub.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  Optimized for quick iteration and static previews.
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AWS by default</CardTitle>
                  <CardDescription>Serverless + ECS orchestrator + CodeBuild + Terraform.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-gray-600">
                  Real infra, real builds, clear logs.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <footer className="border-t bg-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">© {new Date().getFullYear()} Factory</div>
              <div className="text-sm text-gray-600">Prompt → Production</div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
