import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-border">
        <p className="font-mono text-[0.65rem] tracking-[0.28em] text-subtle uppercase">
          Sequencer
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in to PULSE</h1>
        <p className="mt-2 text-sm text-muted">
          Save named patterns to your library. The machine still works as a guest.
        </p>
        <div className="mt-6 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center text-sm text-muted transition-colors hover:text-fg"
        >
          Back to the machine
        </Link>
      </div>
    </main>
  );
}
