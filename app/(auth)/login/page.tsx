import { LoginForm } from "./login-form";
import { Zap } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Connexion — SMS Gateway Pro",
  description: "Connectez-vous à votre compte SMS Gateway Pro.",
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg">
          <Zap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">SMS Gateway Pro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Connectez-vous à votre compte</p>
        </div>
      </div>

      <LoginForm />

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
