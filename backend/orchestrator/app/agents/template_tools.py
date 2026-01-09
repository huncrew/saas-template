"""
Template Tools - Provide AI with information about the template.

These are simple helper functions that return information about
what's available in the template. This is a stepping stone towards
full agentic tool use.

Future: These will become actual tools the AI can call during generation.
"""

from typing import Optional

# Template file contents cache (populated on startup or first use)
_TEMPLATE_FILES: dict[str, str] = {}


# UI Components available in the template
UI_COMPONENTS = {
    "accordion": ["Accordion", "AccordionContent", "AccordionItem", "AccordionTrigger"],
    "alert": ["Alert", "AlertDescription", "AlertTitle"],
    "avatar": ["Avatar", "AvatarFallback", "AvatarImage"],
    "badge": ["Badge"],
    "button": ["Button"],
    "card": ["Card", "CardContent", "CardDescription", "CardFooter", "CardHeader", "CardTitle"],
    "carousel": ["Carousel", "CarouselContent", "CarouselItem", "CarouselNext", "CarouselPrevious"],
    "checkbox": ["Checkbox"],
    "dialog": ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle", "DialogTrigger"],
    "dropdown-menu": ["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel", "DropdownMenuSeparator", "DropdownMenuTrigger"],
    "form": ["Form", "FormControl", "FormDescription", "FormField", "FormItem", "FormLabel", "FormMessage"],
    "input": ["Input"],
    "label": ["Label"],
    "popover": ["Popover", "PopoverContent", "PopoverTrigger"],
    "progress": ["Progress"],
    "radio-group": ["RadioGroup", "RadioGroupItem"],
    "scroll-area": ["ScrollArea", "ScrollBar"],
    "select": ["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"],
    "separator": ["Separator"],
    "sheet": ["Sheet", "SheetContent", "SheetDescription", "SheetFooter", "SheetHeader", "SheetTitle", "SheetTrigger"],
    "skeleton": ["Skeleton"],
    "slider": ["Slider"],
    "sonner": ["Toaster"],
    "switch": ["Switch"],
    "table": ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"],
    "tabs": ["Tabs", "TabsContent", "TabsList", "TabsTrigger"],
    "textarea": ["Textarea"],
    "tooltip": ["Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"],
}


# API methods available
API_METHODS = {
    "apiClient.getUser": {
        "signature": "getUser(userId: string): Promise<APIResponse<User>>",
        "description": "Get user by ID",
    },
    "apiClient.createUser": {
        "signature": "createUser(userData: Partial<User>): Promise<APIResponse<User>>",
        "description": "Create a new user",
    },
    "apiClient.getSubscriptionStatus": {
        "signature": "getSubscriptionStatus(userId: string): Promise<APIResponse<SubscriptionStatus>>",
        "description": "Get subscription status for user",
    },
    "apiClient.createCheckoutSession": {
        "signature": "createCheckoutSession(priceId: string, userId?: string): Promise<APIResponse<{ clientSecret: string }>>",
        "description": "Create Stripe checkout session",
    },
}


# Types available from @/types
AVAILABLE_TYPES = {
    "User": {
        "fields": ["id", "email", "name", "createdAt", "updatedAt", "subscriptionStatus", "subscriptionId?", "cognitoId"],
        "import": "import { User } from '@/types'"
    },
    "Subscription": {
        "fields": ["id", "userId", "stripeSubscriptionId", "status", "currentPeriodStart", "currentPeriodEnd", "planId", "createdAt", "updatedAt"],
        "import": "import { Subscription } from '@/types'"
    },
    "PricingPlan": {
        "fields": ["id", "name", "price", "interval", "features", "stripePriceId", "popular?"],
        "import": "import { PricingPlan } from '@/types'"
    },
    "APIResponse": {
        "fields": ["success", "data?", "error?", "message?"],
        "import": "import { APIResponse } from '@/types'"
    },
    "SubscriptionStatus": {
        "fields": ["subscription?", "subscriptionStatus", "hasActiveSubscription", "stripePriceId?"],
        "import": "import { SubscriptionStatus } from '@/types'"
    },
}


def get_ui_component_info(component_name: str) -> Optional[dict]:
    """Get information about a UI component."""
    if component_name in UI_COMPONENTS:
        return {
            "name": component_name,
            "exports": UI_COMPONENTS[component_name],
            "import_path": f"@/components/ui/{component_name}",
            "example": f"import {{ {', '.join(UI_COMPONENTS[component_name][:3])} }} from '@/components/ui/{component_name}'"
        }
    return None


def list_ui_components() -> list[str]:
    """List all available UI components."""
    return sorted(UI_COMPONENTS.keys())


def get_component_exports(component_name: str) -> list[str]:
    """Get the exports available from a UI component."""
    return UI_COMPONENTS.get(component_name, [])


def check_import_valid(import_path: str, import_names: list[str]) -> dict:
    """
    Check if an import statement would be valid.

    Returns dict with 'valid' bool and 'error' string if invalid.
    """
    # Check UI component imports
    if import_path.startswith("@/components/ui/"):
        component = import_path.replace("@/components/ui/", "")
        if component not in UI_COMPONENTS:
            return {
                "valid": False,
                "error": f"UI component '{component}' doesn't exist",
                "suggestion": f"Available: {', '.join(sorted(UI_COMPONENTS.keys())[:10])}..."
            }

        available_exports = UI_COMPONENTS[component]
        for name in import_names:
            if name not in available_exports:
                return {
                    "valid": False,
                    "error": f"'{name}' is not exported from {import_path}",
                    "suggestion": f"Available exports: {', '.join(available_exports)}"
                }
        return {"valid": True}

    # Check @/lib/api
    if import_path == "@/lib/api":
        for name in import_names:
            if name not in ["apiClient", "ApiClient"]:
                return {
                    "valid": False,
                    "error": f"'{name}' is not exported from @/lib/api",
                    "suggestion": "Only 'apiClient' is exported. Use fetch() for custom API calls."
                }
        return {"valid": True}

    # Check @/lib/utils
    if import_path == "@/lib/utils":
        for name in import_names:
            if name not in ["cn"]:
                return {
                    "valid": False,
                    "error": f"'{name}' is not exported from @/lib/utils",
                    "suggestion": "Only 'cn' (className merger) is exported."
                }
        return {"valid": True}

    # Check @/types
    if import_path in ["@/types", "@/types/index"]:
        for name in import_names:
            if name not in AVAILABLE_TYPES:
                return {
                    "valid": False,
                    "error": f"Type '{name}' is not exported from @/types",
                    "suggestion": f"Available types: {', '.join(AVAILABLE_TYPES.keys())}"
                }
        return {"valid": True}

    # Unknown import path - assume it's user-generated
    return {"valid": True, "note": "Assuming this is a generated file"}


def get_template_context_for_prompt() -> str:
    """
    Get a formatted string of template context to include in prompts.
    This tells the AI what's available to import.
    """
    ui_list = ", ".join(sorted(UI_COMPONENTS.keys()))

    type_list = "\n".join([
        f"  - {name}: {', '.join(info['fields'][:5])}..."
        for name, info in AVAILABLE_TYPES.items()
    ])

    api_list = "\n".join([
        f"  - {name}({info['signature'].split('(')[1]}"
        for name, info in API_METHODS.items()
    ])

    return f"""
## Template Resources Available

### UI Components (@/components/ui/*)
{ui_list}

### API Client (@/lib/api)
{api_list}

### Types (@/types)
{type_list}

### Utils (@/lib/utils)
  - cn(...classes): Merge Tailwind class names
"""


# Tool definitions for future Claude tool use
TOOL_DEFINITIONS = [
    {
        "name": "list_ui_components",
        "description": "List all available shadcn/ui components in the template",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_component_exports",
        "description": "Get the named exports available from a specific UI component",
        "input_schema": {
            "type": "object",
            "properties": {
                "component_name": {
                    "type": "string",
                    "description": "Name of the component (e.g., 'button', 'card', 'table')"
                }
            },
            "required": ["component_name"]
        }
    },
    {
        "name": "check_import_valid",
        "description": "Check if an import statement would be valid in this template",
        "input_schema": {
            "type": "object",
            "properties": {
                "import_path": {
                    "type": "string",
                    "description": "The import path (e.g., '@/components/ui/button')"
                },
                "import_names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of names being imported"
                }
            },
            "required": ["import_path", "import_names"]
        }
    },
    {
        "name": "get_api_methods",
        "description": "Get available methods on apiClient",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
]


def execute_tool(tool_name: str, tool_input: dict) -> dict:
    """
    Execute a tool and return the result.
    This is the handler for when the AI calls a tool.
    """
    if tool_name == "list_ui_components":
        return {"components": list_ui_components()}

    elif tool_name == "get_component_exports":
        component = tool_input.get("component_name", "")
        exports = get_component_exports(component)
        if exports:
            return {"exports": exports, "import_example": f"import {{ {', '.join(exports[:3])} }} from '@/components/ui/{component}'"}
        return {"error": f"Component '{component}' not found", "available": list_ui_components()[:10]}

    elif tool_name == "check_import_valid":
        return check_import_valid(
            tool_input.get("import_path", ""),
            tool_input.get("import_names", [])
        )

    elif tool_name == "get_api_methods":
        return {"methods": API_METHODS}

    return {"error": f"Unknown tool: {tool_name}"}
