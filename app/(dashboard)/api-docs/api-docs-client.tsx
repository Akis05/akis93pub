"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Badge } from "@/core/components/ui/badge";
import { Button } from "@/core/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/core/components/ui/tabs";
import { Separator } from "@/core/components/ui/separator";
import {
  Copy, Check, Key, Send, Shield, Trash2, List,
  ArrowRight, ExternalLink, Zap, Globe,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import Link from "next/link";

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative group">
      <pre className="rounded-lg bg-[#1e1e2e] p-4 text-sm text-gray-200 overflow-x-auto">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity",
          "bg-white/10 hover:bg-white/20 text-gray-300",
          copied && "opacity-100 text-emerald-400"
        )}
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    DELETE: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    PATCH: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  };
  return (
    <Badge variant="outline" className={cn("font-mono text-xs font-bold", colors[method])}>
      {method}
    </Badge>
  );
}

function ParamRow({ name, type, required, description }: {
  name: string; type: string; required?: boolean; description: string;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <div className="flex items-center gap-2 min-w-[140px]">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{name}</code>
        {required && <Badge variant="destructive" className="h-4 px-1 text-[9px]">requis</Badge>}
      </div>
      <span className="text-xs text-muted-foreground min-w-[60px]">{type}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </div>
  );
}

export function ApiDocsClient() {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Vue d'ensemble
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-primary" />
                Base URL
              </div>
              <code className="mt-2 block rounded bg-muted px-2 py-1 font-mono text-xs">
                {baseUrl}/api
              </code>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Shield className="h-4 w-4 text-primary" />
                Authentification
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bearer Token via header <code className="text-[10px]">Authorization</code>
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Send className="h-4 w-4 text-primary" />
                Format
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                JSON (Content-Type: application/json)
              </p>
            </div>
          </div>

          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
            <p className="text-sm">
              <strong>Pour commencer :</strong> Créez un token sur la page{" "}
              <Link href="/api-keys" className="text-primary underline underline-offset-2 hover:text-primary/80">
                API Keys
              </Link>
              , puis utilisez-le dans le header <code className="rounded bg-muted px-1 py-0.5 text-xs">Authorization: Bearer votre_token</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Guide: Postman */}
      <Card id="postman-guide">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Comment utiliser l'API avec Postman
          </CardTitle>
          <CardDescription>Guide pas à pas pour tester l'API depuis Postman</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">1</span>
              <span>
                Créez un token API sur la page{" "}
                <Link href="/api-keys" className="text-primary underline underline-offset-2 hover:text-primary/80">
                  API Keys
                </Link>{" "}
                (ou via <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/auth/token</code>, voir plus bas). Copiez le token <code className="text-xs">sgp_...</code>, il n'est affiché qu'une seule fois.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">2</span>
              <span>Dans Postman, créez une nouvelle requête avec la méthode (GET/POST) et l'URL de l'endpoint, ex: <code className="rounded bg-muted px-1 py-0.5 text-xs">{baseUrl}/api/sms/send</code>.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">3</span>
              <span>Onglet <strong>Authorization</strong> → Type <strong>Bearer Token</strong> → collez votre token <code className="text-xs">sgp_...</code> (sans le préfixe "Bearer", Postman l'ajoute automatiquement).</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">4</span>
              <span>Pour les requêtes POST : onglet <strong>Body</strong> → <strong>raw</strong> → format <strong>JSON</strong>, puis collez le corps de la requête (voir exemples sous chaque endpoint ci-dessous).</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">5</span>
              <span>Cliquez <strong>Send</strong>. Une réponse <code className="text-xs">success: true</code> avec un <code className="text-xs">messageId</code> confirme l'envoi — utilisez ce <code className="text-xs">messageId</code> avec <code className="text-xs">GET /api/sms/status</code> pour suivre le statut.</span>
            </li>
          </ol>
          <div className="rounded-lg border-2 border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            Astuce : créez une variable d'environnement Postman <code className="rounded bg-muted px-1 py-0.5">token</code> et utilisez <code className="rounded bg-muted px-1 py-0.5">{"{{token}}"}</code> dans l'onglet Authorization pour ne pas le recoller à chaque requête.
          </div>
        </CardContent>
      </Card>

      {/* Endpoint 1: Create Token */}
      <Card id="create-token">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/auth/token</code>
          </div>
          <CardDescription>Créer un nouveau token d'authentification API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (body JSON)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="name" type="string" required description="Nom du token (1-100 caractères)" />
              <ParamRow name="expiresInHours" type="number" description="Durée de validité en heures. Omettez pour un token permanent." />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="postman">Postman</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Mon Token Postman",
    "expiresInHours": 72
  }'`} />
            </TabsContent>
            <TabsContent value="postman" className="mt-3">
              <div className="rounded-lg border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-700 border-blue-500/30 font-mono">POST</Badge>
                  <code className="text-xs">{baseUrl}/api/auth/token</code>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Body (raw JSON) :</p>
                  <CodeBlock code={`{
  "name": "Mon Token Postman",
  "expiresInHours": 72
}`} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Nécessite une session connectée. Le token est lié à votre organisation.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch("${baseUrl}/api/auth/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Mon Token",
    expiresInHours: 72,
  }),
});
const { data } = await res.json();
console.log(data.token); // sgp_...`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (201 Created)</p>
            <CodeBlock code={`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "sgp_a1b2c3d4e5f6...",
    "name": "Mon Token Postman",
    "createdAt": "2026-06-21T10:00:00.000Z",
    "expiresAt": "2026-06-24T10:00:00.000Z"
  },
  "message": "Token created. Save it now — it won't be shown again."
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint 2: Send SMS */}
      <Card id="send-sms">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/sms/send</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>Envoyer un SMS via SMPP</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Headers</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="Authorization" type="string" required description='Bearer sgp_votre_token' />
              <ParamRow name="Content-Type" type="string" required description="application/json" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (body JSON)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="to" type="string" required description="Numéro destinataire E.164 (ex: +33612345678 ou 33612345678)" />
              <ParamRow name="text" type="string" required description="Contenu du message (max 306 caractères, 2 segments)" />
              <ParamRow name="from" type="string" description="Sender ID (max 11 chars alphanumériques). Défaut: source du connecteur." />
              <ParamRow name="connectorId" type="string" description="ID du connecteur SMPP. Défaut: premier connecteur disponible." />
              <ParamRow name="requestDlr" type="boolean" description="Demander un accusé de réception (DLR). Défaut: true." />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="postman">Postman</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/sms/send \\
  -H "Authorization: Bearer sgp_votre_token" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+33612345678",
    "text": "Hello depuis l'API!",
    "from": "MYBRAND"
  }'`} />
            </TabsContent>
            <TabsContent value="postman" className="mt-3">
              <div className="rounded-lg border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-700 border-blue-500/30 font-mono">POST</Badge>
                  <code className="text-xs">{baseUrl}/api/sms/send</code>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Authorization :</p>
                  <p className="text-xs text-muted-foreground">Type: Bearer Token → Collez votre <code>sgp_...</code></p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Body (raw JSON) :</p>
                  <CodeBlock code={`{
  "to": "+33612345678",
  "text": "Hello depuis Postman!",
  "from": "MYBRAND"
}`} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch("${baseUrl}/api/sms/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer sgp_votre_token",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "+33612345678",
    text: "Hello depuis l'API!",
    from: "MYBRAND",
  }),
});
const result = await res.json();
console.log(result.data.messageId);`} />
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse succès (200)</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "messageId": "uuid",
    "providerMessageId": "smsc_123",
    "to": "+33612345678",
    "from": "MYBRAND",
    "segments": 1,
    "encoding": "GSM7",
    "mode": "smpp",
    "status": "sent"
  }
}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse erreur (422)</p>
              <CodeBlock code={`{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "to",
      "message": "Numéro invalide"
    }
  ]
}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMS Status */}
      <Card id="sms-status">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/sms/status</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>
            Récupérer le statut d'un SMS à partir du <code>messageId</code> reçu lors de l'envoi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (query string)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="messageId" type="string" required description="ID renvoyé par POST /api/sms/send (alias: id)." />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="postman">Postman</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl "${baseUrl}/api/sms/status?messageId=MESSAGE_ID" \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="postman" className="mt-3">
              <div className="rounded-lg border p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 font-mono">GET</Badge>
                  <code className="text-xs">{baseUrl}/api/sms/status?messageId=MESSAGE_ID</code>
                </div>
                <p className="text-xs text-muted-foreground">Authorization → Bearer Token → collez votre <code>sgp_...</code>. Pas de body.</p>
              </div>
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch(
  "${baseUrl}/api/sms/status?messageId=" + messageId,
  { headers: { "Authorization": "Bearer sgp_votre_token" } }
);
const { data } = await res.json();
console.log(data.status, data.delivered);`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "data": {
    "messageId": "uuid",
    "providerMessageId": "smsc_123",
    "to": "+33612345678",
    "from": "MYBRAND",
    "status": "DELIVERED",
    "dlrStatus": "DELIVRD",
    "delivered": true,
    "errorCode": null,
    "segments": 1,
    "createdAt": "2026-06-21T10:00:00.000Z",
    "sentAt": "2026-06-21T10:00:01.000Z",
    "deliveredAt": "2026-06-21T10:00:04.000Z",
    "dlrReceivedAt": "2026-06-21T10:00:04.000Z"
  }
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP State */}
      <Card id="smpp-state">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/smpp/state</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>Consulter l'état de la connexion SMPP (santé de la passerelle)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl ${baseUrl}/api/smpp/state \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch("${baseUrl}/api/smpp/state", {
  headers: { "Authorization": "Bearer sgp_votre_token" },
});
const { data } = await res.json();
console.log(data.connected, data.state);`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "data": {
    "connected": true,
    "state": "bound",
    "sessionCount": 1,
    "boundCount": 1,
    "default": {
      "state": "bound",
      "connected": true,
      "host": "smsc.example.com",
      "port": 2775,
      "systemId": "myuser",
      "bindMode": "transceiver",
      "tls": false
    },
    "sessions": [
      { "key": "__env__", "state": "bound", "connected": true, "host": "...", "port": 2775 }
    ]
  }
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMS DLR */}
      <Card id="sms-dlr">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/sms/dlr</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>Récupérer l'accusé de réception (DLR) d'un ou plusieurs SMS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (query string)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="id" type="string" description="ID interne du message (messageId renvoyé par /api/sms/send)." />
              <ParamRow name="providerMessageId" type="string" description="ID retourné par le SMSC. Alternative à id." />
              <ParamRow name="limit" type="number" description="Mode liste : nombre de résultats (défaut 50, max 200)." />
              <ParamRow name="dlrStatus" type="string" description="Mode liste : filtre par statut DLR (DELIVRD, EXPIRED, UNDELIV...)." />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`# DLR d'un message précis
curl "${baseUrl}/api/sms/dlr?id=MESSAGE_UUID" \\
  -H "Authorization: Bearer sgp_votre_token"

# Derniers DLR (mode liste)
curl "${baseUrl}/api/sms/dlr?limit=20&dlrStatus=DELIVRD" \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch(
  "${baseUrl}/api/sms/dlr?id=" + messageId,
  { headers: { "Authorization": "Bearer sgp_votre_token" } }
);
const { data } = await res.json();
console.log(data.dlrStatus, data.delivered);`} />
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse - un message (200)</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "messageId": "uuid",
    "providerMessageId": "smsc_123",
    "to": "+33612345678",
    "status": "DELIVERED",
    "dlrStatus": "DELIVRD",
    "delivered": true,
    "errorCode": null,
    "sentAt": "2026-06-21T10:00:01.000Z",
    "deliveredAt": "2026-06-21T10:00:04.000Z",
    "dlrReceivedAt": "2026-06-21T10:00:04.000Z"
  }
}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse - liste (200)</p>
              <CodeBlock code={`{
  "success": true,
  "count": 2,
  "data": [
    { "messageId": "uuid1", "dlrStatus": "DELIVRD", "delivered": true },
    { "messageId": "uuid2", "dlrStatus": "UNDELIV", "delivered": false }
  ]
}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint 3: List Tokens */}
      <Card id="list-tokens">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/auth/token</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>Lister tous les tokens actifs</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl ${baseUrl}/api/auth/token \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch("${baseUrl}/api/auth/token", {
  headers: { "Authorization": "Bearer sgp_votre_token" },
});
const { data } = await res.json();
console.log(data); // Array of tokens`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Mon Token",
      "tokenPreview": "sgp_a1b2...f6g7",
      "createdAt": "2026-06-21T10:00:00.000Z",
      "lastUsedAt": "2026-06-21T12:30:00.000Z",
      "expiresAt": null
    }
  ]
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint 4: Revoke Token */}
      <Card id="revoke-token">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="DELETE" />
            <code className="font-mono text-sm font-medium">/api/auth/token</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>Révoquer un token par son ID</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (body JSON)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="id" type="string" required description="L'ID du token à révoquer (champ id renvoyé à la création / par GET)." />
            </div>
          </div>

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X DELETE ${baseUrl}/api/auth/token \\
  -H "Authorization: Bearer sgp_votre_token" \\
  -H "Content-Type: application/json" \\
  -d '{"id": "TOKEN_ID_A_REVOQUER"}'`} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Endpoint: SMS CDR */}
      <Card id="sms-cdr">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/sms/cdr</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>
            Récupérer le CDR (Call Detail Record) d’un SMS ou un résumé du store
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (query string)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="id" type="string" description="messageId interne OU providerMessageId du SMSC. Omettre pour obtenir le résumé du store." />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`# CDR d'un SMS précis
curl "${baseUrl}/api/sms/cdr?id=MESSAGE_ID" \\
  -H "Authorization: Bearer sgp_votre_token"

# Résumé du store (SMS en attente)
curl "${baseUrl}/api/sms/cdr" \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch(
  "${baseUrl}/api/sms/cdr?id=" + messageId,
  { headers: { "Authorization": "Bearer sgp_votre_token" } }
);
const { data } = await res.json();
console.log(data.status, data.cost);`} />
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse - CDR détaillé (200)</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "messageId": "uuid",
    "providerMessageId": "smsc_123",
    "direction": "OUTBOUND",
    "from": "MYBRAND",
    "to": "+33612345678",
    "content": "Hello!",
    "encoding": "GSM7",
    "segments": 1,
    "status": "DELIVERED",
    "dlrStatus": "DELIVRD",
    "delivered": true,
    "errorCode": null,
    "inStore": false,
    "storeAgeMs": null,
    "expired": false,
    "cost": "0.05",
    "connectorName": "Default",
    "campaignName": null,
    "createdAt": "2026-06-21T10:00:00.000Z",
    "sentAt": "2026-06-21T10:00:01.000Z",
    "deliveredAt": "2026-06-21T10:00:04.000Z",
    "dlrReceivedAt": "2026-06-21T10:00:04.000Z"
  }
}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse - résumé store (200)</p>
              <CodeBlock code={`{
  "success": true,
  "data": {
    "inStore": 12,
    "byStatus": {
      "QUEUED": 4,
      "SENDING": 1,
      "SENT": 7
    },
    "expiredInStore": 0,
    "maxValidityDays": 7
  }
}`} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Query */}
      <Card id="smpp-query">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/smpp/query</code>
            <Badge variant="outline" className="text-[10px]">
              <Shield className="mr-1 h-3 w-3" /> Auth requise
            </Badge>
          </div>
          <CardDescription>
            Envoie un <code>query_sm</code> SMPP au SMSC pour obtenir l’état live d’un message
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (query string)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="id" type="string" required description="providerMessageId retourné par submit_sm (ex: 19ef853e209000027f77c434c5218039)." />
              <ParamRow name="from" type="string" description="Adresse source utilisée à l’envoi (sender ID). Optionnel." />
            </div>
          </div>

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl "${baseUrl}/api/smpp/query?id=SMSC_MESSAGE_ID&from=MYBRAND" \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch(
  "${baseUrl}/api/smpp/query?id=" + smscId,
  { headers: { "Authorization": "Bearer sgp_votre_token" } }
);
const { data } = await res.json();`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Codes d’erreur spécifiques</p>
            <div className="rounded-lg border divide-y text-xs">
              <div className="px-3 py-2"><code>503</code> — SMPP non bound (session indisponible)</div>
              <div className="px-3 py-2"><code>504</code> — Timeout query_sm au SMSC</div>
              <div className="px-3 py-2"><code>502</code> — Erreur SMSC générique</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Connect */}
      <Card id="smpp-connect">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/smpp/connect</code>
          </div>
          <CardDescription>
            Ouvre la session SMPP par défaut (idempotent : réutilise une session existante)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="js">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/smpp/connect \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
            <TabsContent value="js" className="mt-3">
              <CodeBlock code={`const res = await fetch("${baseUrl}/api/smpp/connect", {
  method: "POST",
  headers: { "Authorization": "Bearer sgp_votre_token" },
});
const data = await res.json();
console.log(data.state, data.reused);`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "message": "Connecté",
  "state": "bound",
  "reused": false
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Disconnect */}
      <Card id="smpp-disconnect">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/smpp/disconnect</code>
          </div>
          <CardDescription>Ferme la session SMPP par défaut (les autres sessions ne sont pas impactées)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/smpp/disconnect \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "message": "Session SMPP déconnectée",
  "state": "disconnected"
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Disconnect by key */}
      <Card id="smpp-disconnect-key">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/smpp/disconnect/{`{key}`}</code>
          </div>
          <CardDescription>
            Ferme une session SMPP ciblée par sa clé (connectorId ou <code>__env__</code> pour la session par défaut)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Paramètres (URL path)</p>
            <div className="rounded-lg border divide-y">
              <ParamRow name="key" type="string" required description="Clé de la session à fermer (connectorId ou __env__)." />
            </div>
          </div>

          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/smpp/disconnect/CONNECTOR_ID \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "key": "<connectorId>",
  "remaining": 0
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Restart */}
      <Card id="smpp-restart">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="POST" />
            <code className="font-mono text-sm font-medium">/api/smpp/restart</code>
          </div>
          <CardDescription>Déconnecte puis reconnecte la session SMPP par défaut</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl -X POST ${baseUrl}/api/smpp/restart \\
  -H "Authorization: Bearer sgp_votre_token"`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "success": true,
  "message": "Restart réussi",
  "state": "bound"
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Endpoint: SMPP Status (dashboard) */}
      <Card id="smpp-status">
        <CardHeader>
          <div className="flex items-center gap-3">
            <MethodBadge method="GET" />
            <code className="font-mono text-sm font-medium">/api/smpp/status</code>
          </div>
          <CardDescription>
            Inventaire live des sessions SMPP (endpoint utilisé par le header du dashboard).
            Préférez <code>/api/smpp/state</code> pour les intégrations externes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-3">
              <CodeBlock code={`curl ${baseUrl}/api/smpp/status`} />
            </TabsContent>
          </Tabs>

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Réponse (200)</p>
            <CodeBlock code={`{
  "state": "bound",
  "connected": true,
  "host": "smsc.example.com",
  "port": 2775,
  "systemId": "myuser",
  "bindMode": "transceiver",
  "tls": false,
  "sessions": [
    { "key": "__env__", "state": "bound", "connected": true, "host": "...", "port": 2775 }
  ],
  "count": 1,
  "boundCount": 1
}`} />
          </div>
        </CardContent>
      </Card>

      {/* Error codes */}
      <Card id="errors">
        <CardHeader>
          <CardTitle className="text-base">Codes d'erreur HTTP</CardTitle>
          <CardDescription>Référence des codes de statut retournés par l'API</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border divide-y">
            {[
              { code: "200", label: "OK", desc: "Requête réussie (SMS envoyé via SMPP)" },
              { code: "201", label: "Created", desc: "Ressource créée (token)" },
              { code: "202", label: "Accepted", desc: "SMS accepté en mode demo (SMPP indisponible)" },
              { code: "400", label: "Bad Request", desc: "Corps de requête invalide ou malformé" },
              { code: "401", label: "Unauthorized", desc: "Token manquant, invalide ou expiré" },
              { code: "404", label: "Not Found", desc: "Connecteur ou ressource introuvable" },
              { code: "422", label: "Unprocessable Entity", desc: "Validation échouée (numéro invalide, message vide...)" },
            ].map((err) => (
              <div key={err.code} className="flex items-center gap-4 px-4 py-2.5">
                <Badge variant="outline" className={cn(
                  "font-mono min-w-[48px] justify-center",
                  err.code.startsWith("2") && "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
                  err.code.startsWith("4") && "bg-red-500/10 text-red-700 border-red-500/30",
                )}>
                  {err.code}
                </Badge>
                <span className="text-sm font-medium min-w-[160px]">{err.label}</span>
                <span className="text-xs text-muted-foreground">{err.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Encoding reference */}
      <Card id="encoding">
        <CardHeader>
          <CardTitle className="text-base">Encodage SMS</CardTitle>
          <CardDescription>Référence des limites de caractères par segment</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">GSM-7 (standard)</h4>
              <p className="mt-1 text-xs text-muted-foreground">Caractères latins, chiffres, ponctuation courante</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-muted p-2">
                  <p className="text-lg font-bold">160</p>
                  <p className="text-[10px] text-muted-foreground">chars / segment unique</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-lg font-bold">153</p>
                  <p className="text-[10px] text-muted-foreground">chars / segment concaténé</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <h4 className="font-medium text-sm">UCS-2 (unicode)</h4>
              <p className="mt-1 text-xs text-muted-foreground">Emojis, arabe, chinois, caractères spéciaux</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-muted p-2">
                  <p className="text-lg font-bold">70</p>
                  <p className="text-[10px] text-muted-foreground">chars / segment unique</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-lg font-bold">67</p>
                  <p className="text-[10px] text-muted-foreground">chars / segment concaténé</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
