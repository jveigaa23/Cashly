import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
