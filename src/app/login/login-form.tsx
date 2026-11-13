"use client";

import { useActionState } from "react";
import { sendMagicLink } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, null);
  if (state?.ok) {
    return <p className="rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">{state.message}</p>;
  }
  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        className="input w-full"
      />
      <button disabled={pending} className="btn-primary w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
