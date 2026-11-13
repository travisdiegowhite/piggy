import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Ledger" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const msg =
    error === "not-allowed"
      ? "That account isn't allowed here."
      : error === "link"
        ? "That sign-in link expired or was already used. Request a new one."
        : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-2xl font-semibold tracking-tight">Ledger</div>
          <p className="mt-1 text-sm text-zinc-500">Personal finance, privately.</p>
        </div>
        {msg && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
        <LoginForm />
      </div>
    </main>
  );
}
