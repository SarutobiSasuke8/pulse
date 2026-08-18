import { useEffect, useState } from "react";
import { FolderOpen, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deletePattern, listPatterns, savePattern, type SavedPattern } from "@/lib/patterns";
import { useSequencer } from "@/lib/sequencer/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PatternLibrary() {
  const { user, isPending } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SavedPattern[] | null>(null);
  const [name, setName] = useState("Untitled");
  const [busy, setBusy] = useState(false);
  const bpm = useSequencer((s) => s.bpm);
  const swing = useSequencer((s) => s.swing);
  const banks = useSequencer((s) => s.banks);
  const bank = useSequencer((s) => s.bank);
  const loadPattern = useSequencer((s) => s.loadPattern);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    listPatterns()
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  if (isPending || !user) return null;

  async function onSave() {
    setBusy(true);
    try {
      await savePattern({ data: { name, bpm, swing, tracks: banks[bank] } });
      const rows = await listPatterns();
      setItems(rows);
      toast.success("Pattern saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deletePattern({ data: id });
      setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <FolderOpen className="size-4" />
        <span className="hidden sm:inline">Library</span>
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            aria-label="Close library"
            className="absolute inset-0 bg-bg/70"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-surface p-4 shadow-border">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Pattern library</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mb-4 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Name this pattern"
                className="h-10 min-w-0 flex-1 rounded-md bg-elevated px-3 text-sm text-fg shadow-border outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <Button variant="primary" size="md" onClick={() => void onSave()} disabled={busy}>
                <Save className="size-4" />
                Save
              </Button>
            </div>
            <ul className="min-h-24 flex-1 space-y-1 overflow-y-auto">
              {items === null ? (
                <li className="h-10 animate-pulse rounded-md bg-elevated" />
              ) : items.length === 0 ? (
                <li className="px-1 py-6 text-center text-sm text-muted">
                  Nothing saved yet. Name the current bank and save it.
                </li>
              ) : (
                items.map((item) => (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5",
                      "hover:bg-elevated",
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        loadPattern(item.tracks, item.bpm, item.swing);
                        setOpen(false);
                        toast.success(`Loaded ${item.name}`);
                      }}
                    >
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">
                        {item.bpm} BPM · {item.swing}% swing
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      className="grid size-9 place-items-center rounded-md text-subtle hover:bg-pad hover:text-fg"
                      onClick={() => void onDelete(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
