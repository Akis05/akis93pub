"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Badge } from "@/core/components/ui/badge";
import { Separator } from "@/core/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/core/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/core/components/ui/dialog";
import {
  Plus, Copy, Check, Trash2, Key, Clock, Shield,
  AlertTriangle, Eye, EyeOff, Loader2, BookOpen,
} from "lucide-react";
import { cn } from "@/core/lib/utils";
import { createTokenAction, revokeTokenByIdAction } from "@/core/actions/api-keys";
import Link from "next/link";

interface TokenDisplay {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
}

interface Props {
  initialTokens: TokenDisplay[];
}

export function ApiKeysClient({ initialTokens }: Props) {
  const [tokens, setTokens] = useState<TokenDisplay[]>(initialTokens);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [expiry, setExpiry] = useState<string>("never");
  const [isPending, startTransition] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function handleCreate() {
    if (!tokenName.trim()) return;
    const expiresInHours = expiry === "never" ? undefined
      : expiry === "1h" ? 1
      : expiry === "24h" ? 24
      : expiry === "7d" ? 168
      : expiry === "30d" ? 720
      : expiry === "90d" ? 2160
      : undefined;

    startTransition(async () => {
      const result = await createTokenAction(tokenName.trim(), expiresInHours);
      if (result.success && result.token) {
        setNewToken(result.token);
        setTokens((prev) => [
          {
            id: result.id!,
            name: result.name!,
            tokenPreview: `${result.token!.slice(0, 8)}...${result.token!.slice(-4)}`,
            createdAt: new Date(),
            expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
          },
          ...prev,
        ]);
      }
    });
  }

  function handleCopy() {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCloseCreate() {
    setIsCreateOpen(false);
    setTokenName("");
    setExpiry("never");
    setNewToken(null);
    setShowToken(false);
    setCopied(false);
  }

  function handleRevoke(tokenId: string) {
    setRevokingId(tokenId);
    startTransition(async () => {
      const result = await revokeTokenByIdAction(tokenId);
      if (result.success) {
        setTokens((prev) => prev.filter((t) => t.id !== tokenId));
      }
      setRevokingId(null);
    });
  }

  function formatDate(date: Date | string | null | undefined) {
    if (!date) return "";
    return new Date(date).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isExpired(date?: Date | null) {
    return date ? new Date(date) < new Date() : false;
  }

  return (
    <div className="space-y-6">
      {/* Actions bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">
            {tokens.length} token{tokens.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/api-docs">
              <BookOpen className="mr-2 h-4 w-4" />
              API Docs
            </Link>
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            if (!open) handleCloseCreate();
            else setIsCreateOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Nouveau token
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              {!newToken ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Créer un token API</DialogTitle>
                    <DialogDescription>
                      Ce token sera utilisé pour authentifier les requêtes API.
                      Vous ne pourrez le voir qu'une seule fois.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="token-name">Nom du token</Label>
                      <Input
                        id="token-name"
                        placeholder="ex: Postman, Production, CI/CD..."
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="token-expiry">Expiration</Label>
                      <Select value={expiry} onValueChange={setExpiry}>
                        <SelectTrigger id="token-expiry">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1h">1 heure</SelectItem>
                          <SelectItem value="24h">24 heures</SelectItem>
                          <SelectItem value="7d">7 jours</SelectItem>
                          <SelectItem value="30d">30 jours</SelectItem>
                          <SelectItem value="90d">90 jours</SelectItem>
                          <SelectItem value="never">Jamais</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCreate}>Annuler</Button>
                    <Button onClick={handleCreate} disabled={!tokenName.trim() || isPending}>
                      {isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création...</>
                      ) : (
                        <><Key className="mr-2 h-4 w-4" /> Créer le token</>
                      )}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-emerald-600" />
                      Token créé avec succès
                    </DialogTitle>
                    <DialogDescription>
                      Copiez ce token maintenant. Il ne sera plus affiché après fermeture.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Sauvegardez ce token en lieu sûr
                      </div>
                      <div className="flex items-center gap-2">
                        <code className={cn(
                          "flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all",
                          !showToken && "select-none blur-sm hover:blur-none transition-all"
                        )}>
                          {newToken}
                        </code>
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setShowToken(!showToken)}
                          >
                            {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className={cn("h-8 w-8", copied && "border-emerald-500 text-emerald-600")}
                            onClick={handleCopy}
                          >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">Utilisation avec Postman :</p>
                      <p>Header: <code className="rounded bg-muted px-1 py-0.5">Authorization: Bearer {newToken?.slice(0, 12)}...</code></p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseCreate}>Fermer</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tokens list */}
      {tokens.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Key className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Aucun token API</h3>
            <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
              Créez votre premier token pour commencer à utiliser l'API REST
              avec Postman ou tout autre client HTTP.
            </p>
            <Button className="mt-6" onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Créer un token
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens actifs</CardTitle>
            <CardDescription>
              Vos tokens d'authentification pour l'API REST. Chaque token donne un accès complet à l'API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tokens.map((token, index) => (
                <div key={token.id}>
                  {index > 0 && <Separator className="mb-3" />}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        isExpired(token.expiresAt)
                          ? "bg-red-500/10 text-red-600"
                          : "bg-primary/10 text-primary"
                      )}>
                        <Key className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{token.name}</p>
                          {isExpired(token.expiresAt) && (
                            <Badge variant="destructive" className="text-[10px] h-5">
                              Expiré
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                            {token.tokenPreview}
                          </code>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Créé {formatDate(token.createdAt)}
                          </span>
                          {token.expiresAt && !isExpired(token.expiresAt) && (
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Expire {formatDate(token.expiresAt)}
                            </span>
                          )}
                          {token.lastUsedAt && (
                            <span>Utilisé {formatDate(token.lastUsedAt)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                    >
                      {revokingId === token.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick start guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guide rapide</CardTitle>
          <CardDescription>Comment utiliser vos tokens API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                1
              </div>
              <h4 className="mt-3 font-medium text-sm">Créer un token</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Cliquez sur "Nouveau token" et copiez la clé générée.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                2
              </div>
              <h4 className="mt-3 font-medium text-sm">Configurer Postman</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Dans l'onglet Authorization, choisissez "Bearer Token" et collez votre clé.
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                3
              </div>
              <h4 className="mt-3 font-medium text-sm">Envoyer des SMS</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Faites un POST sur <code className="text-[10px]">/api/sms/send</code> avec votre message.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
