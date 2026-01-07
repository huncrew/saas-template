"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (v: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be used within <Tabs />");
  return ctx;
}

type TabsProps = {
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
};

const Tabs = ({ defaultValue, className, children }: TabsProps) => {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

type TabsListProps = React.HTMLAttributes<HTMLDivElement>;
const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn("inline-flex h-10 items-center justify-center rounded-md bg-gray-100 p-1 text-gray-600", className)}
    {...props}
  />
));
TabsList.displayName = "TabsList";

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string };
const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className, value, ...props }, ref) => {
  const ctx = useTabsContext();
  const active = ctx.value === value;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      data-state={active ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

type TabsContentProps = React.HTMLAttributes<HTMLDivElement> & { value: string };
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(({ className, value, ...props }, ref) => {
  const ctx = useTabsContext();
  if (ctx.value !== value) return null;
  return (
    <div
      ref={ref}
      role="tabpanel"
      className={cn(
        "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        className
      )}
      {...props}
    />
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };


