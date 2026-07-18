"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/core/lib/utils";
import {
  LayoutDashboard, Send, MessageSquare, History, CheckCircle2,
  Users, FolderOpen, FileText, Megaphone, ListOrdered, Database,
  Plug, Building2, Tag, Route, BarChart3, CreditCard,
  Shield, Settings, BookOpen, Key, Webhook, Bell,
  ScrollText, ChevronLeft, Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/core/components/ui/button";
import { ScrollArea } from "@/core/components/ui/scroll-area";
import { Separator } from "@/core/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/core/components/ui/tooltip";

const navSections = [
  {
    label: "Overview",
    items: [
      { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    label: "Messaging",
    items: [
      { href: "/sms/send", icon: Send, label: "Send SMS" },
      { href: "/sms/bulk", icon: MessageSquare, label: "Bulk SMS" },
      { href: "/sms/history", icon: History, label: "SMS History" },
      { href: "/sms/dlr", icon: CheckCircle2, label: "Delivery Reports" },
      { href: "/sms/queue", icon: ListOrdered, label: "Message Queue" },
      { href: "/sms/store", icon: Database, label: "SMSC Store" },
      { href: "/sms/templates", icon: FileText, label: "Templates" },
    ],
  },
  {
    label: "Campaigns",
    items: [
      { href: "/campaigns", icon: Megaphone, label: "Campaigns" },
    ],
  },
  {
    label: "Contacts",
    items: [
      { href: "/contacts", icon: Users, label: "Contacts" },
      { href: "/contacts/groups", icon: FolderOpen, label: "Groups" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { href: "/connectors", icon: Plug, label: "SMPP Connectors" },
     
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/reports", icon: BarChart3, label: "Reports" },
      { href: "/billing", icon: CreditCard, label: "Billing" },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/api-docs", icon: BookOpen, label: "API Docs" },
      { href: "/api-keys", icon: Key, label: "API Keys" },
   
    ],
  },
  {
    label: "System",
    items: [
      { href: "/users", icon: Shield, label: "Users & Roles" },
       
      { href: "/audit-log", icon: ScrollText, label: "Audit Log" },
      { href: "/settings", icon: Settings, label: "Settings" },
    ],
  },
];

function getActiveHref(pathname: string): string {
  let best = "";
  for (const section of navSections) {
    for (const item of section.items) {
      const matches =
        pathname === item.href ||
        (item.href !== "/" && pathname.startsWith(item.href + "/"));
      if (matches && item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const activeHref = getActiveHref(pathname);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "relative flex h-screen flex-col border-r bg-card transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight">SMS Gateway</span>
              <span className="text-[10px] font-medium text-muted-foreground">PRO</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1 py-2">
          <nav className="flex w-full flex-col gap-1 px-2 pb-4">
            {navSections.map((section) => (
              <div key={section.label}>
                {!collapsed && (
                  <p className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-2">
                    {section.label}
                  </p>
                )}
                {collapsed && <Separator className="my-2" />}
                {section.items.map((item) => {
                  const isActive = item.href === activeHref;
                  const linkContent = (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        collapsed && "justify-center px-2"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return linkContent;
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse toggle */}
        <div className="shrink-0 border-t bg-card p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
