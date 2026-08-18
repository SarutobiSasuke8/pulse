import { Link } from "@tanstack/react-router";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return <div className="size-9 animate-pulse rounded-full bg-elevated" />;
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-muted shadow-border transition-[color,background-color] duration-150 ease-out hover:bg-elevated hover:text-fg"
      >
        Sign in
      </Link>
    );
  }

  const label = user.displayName ?? user.primaryEmail ?? "Account";

  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img
          src={user.profileImageUrl}
          alt=""
          className="size-8 rounded-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-elevated text-xs font-medium text-fg">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-28 truncate text-sm text-muted sm:inline">{label}</span>
      {authEnabled && (
        <button
          type="button"
          onClick={() => void signOut()}
          className="h-9 rounded-md px-2 text-sm text-subtle transition-colors duration-150 hover:text-fg"
        >
          Sign out
        </button>
      )}
    </div>
  );
}
