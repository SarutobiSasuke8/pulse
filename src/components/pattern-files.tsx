import { type ChangeEvent, useRef, useState } from "react";
import { Download, HardDrive, Save, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteFromLocalLibrary,
  type LocalEntry,
  readLocalLibrary,
  saveToLocalLibrary,
} from "@/lib/sequencer/local-library";
import {
  parsePatternSetFile,
  patternFileName,
  toPatternSetFile,
} from "@/lib/sequencer/pattern-set";
import { useSequencer } from "@/lib/sequencer/store";

/**
 * Save and load whole sessions (all banks, chain, tempo, swing, mixer) in
 * this browser, and export or import them as JSON files. No account needed.
 */
export function PatternFiles() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LocalEntry[]>([]);
  const [name, setName] = useState("My groove");
  const fileRef = useRef<HTMLInputElement>(null);
  const exportSet = useSequencer((s) => s.exportSet);
  const applySet = useSequencer((s) => s.applySet);

  function show() {
    setItems(readLocalLibrary());
    setOpen(true);
  }

  function onSave() {
    try {
      setItems(saveToLocalLibrary(name, exportSet()));
      toast.success(`Saved "${name.trim()}" in this browser`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  function onLoad(entry: LocalEntry) {
    applySet(entry.set);
    setName(entry.name);
    setOpen(false);
    toast.success(`Loaded ${entry.name}`);
  }

  function onDelete(id: string) {
    try {
      setItems(deleteFromLocalLibrary(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  function onExport() {
    const file = toPatternSetFile(exportSet(), name);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = patternFileName(file.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 512 * 1024) throw new Error("File is too large");
      const { name: imported, set } = parsePatternSetFile(await file.text());
      applySet(set);
      setName(imported);
      setOpen(false);
      toast.success(`Imported ${imported}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={show}>
        <HardDrive className="size-4" />
        <span className="hidden sm:inline">Patterns</span>
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
          <button
            type="button"
            aria-label="Close patterns"
            className="absolute inset-0 bg-bg/70"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Patterns on this device"
            className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-surface p-4 shadow-border"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Patterns on this device</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-md text-muted hover:bg-elevated hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="mb-4 text-xs text-muted">
              Saves all four banks, the chain, tempo, swing and the mixer in this browser.
            </p>
            <div className="mb-3 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Name this session"
                aria-label="Session name"
                className="h-10 min-w-0 flex-1 rounded-md bg-elevated px-3 text-sm text-fg shadow-border outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <Button variant="primary" size="md" onClick={onSave} disabled={!name.trim()}>
                <Save className="size-4" />
                Save
              </Button>
            </div>
            <div className="mb-4 flex gap-2">
              <Button variant="secondary" size="sm" onClick={onExport} className="flex-1">
                <Download className="size-4" />
                Export JSON
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="flex-1"
              >
                <Upload className="size-4" />
                Import JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label="Import pattern file"
                onChange={(e) => void onImport(e)}
              />
            </div>
            <ul className="min-h-24 flex-1 space-y-1 overflow-y-auto">
              {items.length === 0 ? (
                <li className="px-1 py-6 text-center text-sm text-muted">
                  Nothing saved in this browser yet.
                </li>
              ) : (
                items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onLoad(item)}
                    >
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">
                        {item.set.bpm} BPM · {item.set.swing}% swing
                        {item.set.chain.length > 0 ? ` · chain ${item.set.chain.join("")}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      className="grid size-9 place-items-center rounded-md text-subtle hover:bg-pad hover:text-fg"
                      onClick={() => onDelete(item.id)}
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
