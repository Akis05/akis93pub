import { SignupForm } from "./signup-form";
import { Zap } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Créer un compte — SMS Gateway Pro",
  description: "Créez votre compte administrateur SMS Gateway Pro.",
};

export default function SignupPage() {
  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-lg">
          <Zap className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">SMS Gateway Pro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Créez votre compte administrateur</p>
        </div>
      </div>

      <SignupForm />

      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
