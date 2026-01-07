# Frontend Development Context - Factory (Oasify Builder)
**Last Updated:** 2025-01-07
**Claude Session:** Working on frontend completion
**Status:** Active Frontend Development

## Project Overview
**Name:** Factory (codename for "Prod-Ready SaaS App Builder")  
**Goal:** Chat í build í preview í deploy í iterate  
**Tagline:** "Prompt í Production"  
**Vision:** Shippable apps, not demos

**Product Positioning:**
- Primary users: Indie founders + agencies + internal tool builders
- Secondary: Teams who prototype in Lovable/Replit and need real deployment
- Differentiation: Production-ready templates with Terraform deployment + security gates

## Current Architecture Analysis

### Tech Stack 
- **Next.js 15.4.6** (App Router)
- **TypeScript** with full type safety
- **Tailwind CSS 4.0** (modern styling)
- **Clerk** (authentication)
- **Radix UI** (component primitives)
- **Lucide Icons**
- **Sonner** (toasts)

### Core User Experience Flow
```
Landing í Projects List í [Create Project] í Builder Interface
                                              ì
                         Chat ê í [Preview | Changes | Architecture | Checks | Deploy]
```

### Current Frontend Structure

#### <‡ **Landing Page** (`/`)
**Status:**  Well-designed  
**Content:**
- Hero section with gradient background effects
- "Build real apps. Not demos." messaging
- Clear CTAs: "Open Factory" / "Sign in"
- Feature highlights: Guardrails, Hosted previews, Deterministic deploys
- Template showcase (V1: SaaS CRUD)

#### =À **Projects List** (`/projects`) 
**Status:**  Functional, needs polish  
**Features:**
- Project creation form (name + template selection)
- Project grid with cards
- Integration with Factory API
- Empty state handling

#### <◊ **Builder Interface** (`/projects/[projectId]`)
**Status:** =6 Core structure complete, tabs need implementation  
**Layout:** Split-pane (Lovable/Replit style)

**Left Pane - Chat Interface:**
-  Factory chat component
-  Message history
-  Suggestion chips
-  Auto-preview toggle
-  User authentication display

**Right Pane - Tabs:**
-  **Preview:** iframe with hosted preview URL + build status
- =6 **Changes:** Placeholder (needs diff/commit display)
- =6 **Architecture:** Placeholder (needs architecture.md rendering)  
- =6 **Checks:** Placeholder (needs security checks display)
- =6 **Deploy:** Placeholder (needs terraform outputs)

## API Integration Status

### Factory API (`/lib/factory-api.ts`)
**Endpoints Implemented:**
-  `listProjects()` - Get user projects
-  `createProject()` - Create new project  
-  `getProject(id)` - Get project details
-  `getBuild(id)` - Get build status
-  `chatProject()` - Chat with orchestrator
-  `createPreviewBuild()` - Trigger preview build
-  `createDeployBuild()` - Trigger deploy

**Mock Mode:** Currently using mock responses (orchestrator not connected)

### Type Definitions (`/types/factory.ts`)
**Core Types:**
- `FactoryProject` - Project metadata
- `FactoryBuild` - Build status and artifacts  
- `FactoryProjectChatResponse` - Chat API response

## Visual Design Assessment

###  **Strengths**
- **Professional gradient design** with emerald/green color scheme
- **Glassmorphism effects** with backdrop blur
- **Consistent typography** using Geist fonts
- **Responsive layout** with proper mobile support
- **Modern component patterns** using Radix UI primitives
- **Smooth animations** and hover effects

### =6 **Areas for Improvement**
1. **Builder interface tabs** - Need actual content implementation
2. **Loading states** - More sophisticated skeleton loading
3. **Error boundaries** - Better error handling throughout
4. **Empty states** - More engaging illustrations
5. **Micro-interactions** - Build status animations, progress indicators

## Component Architecture

### UI Components (`/components/ui/`)
**Status:**  Complete shadcn/ui setup  
- Button, Card, Input, Label, Tabs
- Dropdown Menu, Form, Badge
- Sonner (toasts)

### Factory Components (`/components/factory/`)
-  `factory-chat.tsx` - Main chat interface
-  `dev-banner.tsx` - Development mode banner
-  `resizable-split.tsx` - Split pane layout
- =6 Missing: Build artifacts renderers, deployment status

### Layout Components
-  `navigation.tsx` - Main navigation with auth
-  `dashboard-layout.tsx` - Dashboard wrapper
-  `error-boundary.tsx` - Error boundary wrapper

## Integration Requirements for Backend Team

### = **API Contracts**
**Chat Endpoint:** `POST /v1/projects/:id/chat`
```typescript
Request: { message: string, auto_preview: boolean }
Response: {
  assistant: { content: string },
  suggested_action: "build_preview" | null,
  followups: string[]
}
```

**Build Endpoints:**
- `POST /v1/projects/:id/build-preview` í trigger CodeBuild
- `POST /v1/projects/:id/deploy` í trigger deploy build
- `GET /v1/builds/:id` í get build status + artifacts

### <Ø **Artifact Structure Needed**
```typescript
BuildArtifacts: {
  preview_url: string,
  deploy_urls: string[],
  logs_url: string,
  tf_plan_url: string,
  checks_report_url: string,
  architecture_md: string,  // Rendered in Architecture tab
  changes_diff: string,     // Rendered in Changes tab
  checks_report: {          // Rendered in Checks tab
    passed: CheckResult[],
    failed: CheckResult[],
    warnings: CheckResult[]
  }
}
```

## Next Implementation Steps

### Priority 1: Complete Builder Tabs
1. **Changes Tab**
   - Display git diff from build artifacts
   - Show commit history for project
   - File change summary

2. **Architecture Tab**  
   - Render `architecture.md` from build artifacts
   - Show system diagram if available
   - Display infrastructure overview

3. **Checks Tab**
   - Parse and display security check results
   - Color-coded pass/fail status
   - Expandable details for each check

4. **Deploy Tab**
   - Show terraform plan output
   - Display deployed URLs and resources
   - Rollback functionality UI

### Priority 2: Enhanced UX
1. **Build Progress Indicators**
   - Real-time build status updates
   - Progress bars for long operations
   - Build logs streaming

2. **Better Loading States**
   - Skeleton components for all data
   - Progressive loading of preview
   - Optimistic updates

3. **Error Handling**
   - Graceful API error handling  
   - Retry mechanisms
   - User-friendly error messages

## Current Frontend Quality Assessment

### Code Quality: PPPPP
- TypeScript throughout with proper typing
- Clean component structure
- Proper error boundaries
- Modern React patterns (hooks, context)

### Design Quality: PPPPP  
- Professional, modern design
- Consistent with Lovable/Replit inspiration
- Strong visual hierarchy
- Responsive and accessible

### Functionality: PPPP™
- Core flows working
- Main missing piece: tab implementations
- API ready, needs real backend connection

## Collaboration Notes

### For Backend Team (Cursor/Codex)
- Frontend API contracts are defined and ready
- Mock responses show expected data structure  
- Real-time build status polling implemented
- Ready for orchestrator integration

### Frontend Development Focus
- Complete the 4 main builder tabs with real functionality
- Enhance loading and error states
- Add build status animations and progress indicators
- Polish mobile responsiveness

**Current State:** Professional foundation complete, ready for feature completion and backend integration.