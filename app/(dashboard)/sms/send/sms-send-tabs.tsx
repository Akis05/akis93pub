"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs";
import { Send, MessageSquare, Clock } from "lucide-react";
import { SendSmsForm } from "./send-sms-form";
import { BulkSmsForm } from "./bulk-sms-form";
import { ScheduledSmsForm } from "./scheduled-sms-form";
import type { SmppConnector } from "@/core/types";

interface Props {
  connectors: SmppConnector[];
}

export function SmsSendTabs({ connectors }: Props) {
  return (
    <Tabs defaultValue="simple" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="simple" className="gap-2">
          <Send className="h-4 w-4" />
          SMS simple
        </TabsTrigger>
        <TabsTrigger value="bulk" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          SMS en masse
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="gap-2">
          <Clock className="h-4 w-4" />
          SMS programmé
        </TabsTrigger>
      </TabsList>

      <TabsContent value="simple">
        <SendSmsForm connectors={connectors} />
      </TabsContent>

      <TabsContent value="bulk">
        <BulkSmsForm connectors={connectors} />
      </TabsContent>

      <TabsContent value="scheduled">
        <ScheduledSmsForm connectors={connectors} />
      </TabsContent>
    </Tabs>
  );
}
