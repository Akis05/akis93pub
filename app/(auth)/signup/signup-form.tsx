"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { Label } from "@/core/components/ui/label";
import { Input } from "@/core/components/ui/input";
import { Button } from "@/core/components/ui/button";
import { Badge } from "@/core/components/ui/badge";
import { Separator } from "@/core/components/ui/separator";
import {
  AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Shield, UserPlus,
} from "lucide-react";
import { signupAction } from "@/core/actions/auth";

export function SignupForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    setIsPending(true);

    try {
      const result = await signupAction({
        name,
        email,
        password,
        organizationName: orgName || `${name}'s Organization`,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        // Redirect after short delay to show success
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 1500);
      }
    } catch {
      setError("Une erreur inattendue est survenue.");
    } finally {
      setIsPending(false);
    }
  }

  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold">Compte créé avec succès !</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Votre compte Super Admin a été créé. Redirection vers le dashboard...
            </p>
          </div>
          <Badge className="gap-1.5">
            <Shield className="h-3 w-3" /> SUPER_ADMIN
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Créer un compte</CardTitle>
        <CardDescription>
          Votre compte sera créé avec le rôle{" "}
          <Badge variant="outline" className="text-[10px] gap-1">
            <Shield className="h-2.5 w-2.5" /> SUPER_ADMIN
          </Badge>{" "}
          et toutes les permissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Organization */}
          <div className="space-y-2">
            <Label htmlFor="orgName">Nom de l'organisation</Label>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Djibouti Telecom"
            />
            <p className="text-xs text-muted-foreground">Optionnel. Un nom par défaut sera généré si vide.</p>
          </div>

          <Separator />

          {/* User info */}
          <div className="space-y-2">
            <Label htmlFor="name">Nom complet</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ahmed Mohamed"
              required
              autoComplete="name"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-email">Adresse email</Label>
            <Input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@djib.dj"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signup-password">Mot de passe</Label>
            <div className="relative">
              <Input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 caractères"
                required
                minLength={8}
                autoComplete="new-password"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
            {password.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        level <= passwordStrength.level
                          ? passwordStrength.level <= 1 ? "bg-red-500"
                            : passwordStrength.level === 2 ? "bg-amber-500"
                            : passwordStrength.level === 3 ? "bg-blue-500"
                            : "bg-emerald-500"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${
                  passwordStrength.level <= 1 ? "text-red-600"
                    : passwordStrength.level === 2 ? "text-amber-600"
                    : passwordStrength.level === 3 ? "text-blue-600"
                    : "text-emerald-600"
                }`}>
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retapez le mot de passe"
              required
              autoComplete="new-password"
            />
            {confirmPassword.length > 0 && (
              <p className={`text-xs ${passwordsMatch ? "text-emerald-600" : "text-red-600"}`}>
                {passwordsMatch ? "✓ Les mots de passe correspondent" : "✗ Les mots de passe ne correspondent pas"}
              </p>
            )}
          </div>

          <Separator />

          {/* Permissions summary */}
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Permissions SUPER_ADMIN
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                "sms:*", "contacts:*", "groups:*", "campaigns:*", "templates:*",
                "connectors:*", "providers:*", "senderIds:*", "routes:*",
                "reports:*", "billing:*", "apiKeys:*", "webhooks:*",
                "users:*", "audit:*", "settings:*",
              ].map((p) => (
                <Badge key={p} variant="secondary" className="text-[9px] font-mono">{p}</Badge>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending || !passwordsMatch}>
            {isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Création en cours...</>
            ) : (
              <><UserPlus className="mr-2 h-4 w-4" /> Créer le compte Super Admin</>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function getPasswordStrength(password: string): { level: number; label: string } {
  if (password.length === 0) return { level: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: "Faible" };
  if (score === 2) return { level: 2, label: "Moyen" };
  if (score === 3) return { level: 3, label: "Bon" };
  return { level: 4, label: "Fort" };
}
