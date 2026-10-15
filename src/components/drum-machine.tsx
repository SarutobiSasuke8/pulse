import { type ReactNode, useEffect, useRef, useState } from "react";
import { Eraser, Link2, Play, Plus, Shuffle, Square, Volume2, X } from "lucide-react";
import { Toaster } from "sonner";
import { AuthSlot } from "@/components/auth-slot";
import { PatternFiles } from "@/components/pattern-files";
import { PatternLibrary } from "@/components/pattern-library";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MAX_CHAIN_LENGTH } from "@/lib/sequencer/chain";
import { DrumEngine } from "@/lib/sequencer/engine";
import { anySolo, isAudible } from "@/lib/sequencer/mix";
import { useSequencer } from "@/lib/sequencer/store";
import {
  BANKS,
  STEP_COUNT,
  TRACK_IDS,
  TRACK_META,
  isDownbeat,
  type TrackId,
} from "@/lib/sequencer/types";
import { cn } from "@/lib/utils";

export function DrumMachine() {
  const engineRef = useRef<DrumEngine | null>(null);
  const [armed, setArmed] = useState(false);
  const paintRef = useRef<{ on: boolean } | null>(null);

  const banks = useSequencer((s) => s.banks);
  const bank = useSequencer((s) => s.bank);
  const bpm = useSequencer((s) => s.bpm);
  const swing = useSequencer((s) => s.swing);
  const master = useSequencer((s) => s.master);
  const mutes = useSequencer((s) => s.mutes);
  const solos = useSequencer((s) => s.solos);
  const volumes = useSequencer((s) => s.volumes);
  const chain = useSequencer((s) => s.chain);
  const chainEnabled = useSequencer((s) => s.chainEnabled);
  const chainPosition = useSequencer((s) => s.chainPosition);
  const playing = useSequencer((s) => s.playing);
  const currentStep = useSequencer((s) => s.currentStep);
  const setBpm = useSequencer((s) => s.setBpm);
  const setSwing = useSequencer((s) => s.setSwing);
  const setMaster = useSequencer((s) => s.setMaster);
  const setPlaying = useSequencer((s) => s.setPlaying);
  const setCurrentStep = useSequencer((s) => s.setCurrentStep);
  const selectBank = useSequencer((s) => s.selectBank);
  const setStep = useSequencer((s) => s.setStep);
  const toggleMute = useSequencer((s) => s.toggleMute);
  const toggleSolo = useSequencer((s) => s.toggleSolo);
  const appendToChain = useSequencer((s) => s.appendToChain);
  const removeFromChain = useSequencer((s) => s.removeFromChain);
  const clearChain = useSequencer((s) => s.clearChain);
  const setChainEnabled = useSequencer((s) => s.setChainEnabled);
  const setVolume = useSequencer((s) => s.setVolume);
  const clearPattern = useSequencer((s) => s.clearPattern);
  const randomize = useSequencer((s) => s.randomize);

  const pattern = banks[bank];
  const soloing = anySolo(solos);

  useEffect(() => {
    void useSequencer.persist.rehydrate();
  }, []);

  useEffect(() => {
    const s = useSequencer.getState();
    const engine = new DrumEngine({
      banks: s.banks,
      bank: s.bank,
      chain: s.chain,
      chainEnabled: s.chainEnabled,
      bpm: s.bpm,
      swing: s.swing,
      mutes: s.mutes,
      solos: s.solos,
      volumes: s.volumes,
      master: s.master,
    });
    engineRef.current = engine;
    const off = engine.onStep(({ step, bank: playingBank, chainPosition: position }) => {
      const state = useSequencer.getState();
      state.setCurrentStep(step);
      state.setChainPosition(position);
      // While a chain plays, the grid follows the bank that is sounding.
      if (step >= 0 && position >= 0 && state.bank !== playingBank) {
        state.selectBank(playingBank);
      }
    });
    return () => {
      off();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.update({
      banks,
      bank,
      chain,
      chainEnabled,
      bpm,
      swing,
      mutes,
      solos,
      volumes,
      master,
    });
  }, [banks, bank, chain, chainEnabled, bpm, swing, mutes, solos, volumes, master]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        void toggleTransport();
      }
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
        useSequencer.getState().randomize();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function endPaint() {
      paintRef.current = null;
    }
    window.addEventListener("pointerup", endPaint);
    window.addEventListener("pointercancel", endPaint);
    return () => {
      window.removeEventListener("pointerup", endPaint);
      window.removeEventListener("pointercancel", endPaint);
    };
  }, []);

  async function toggleTransport() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying) {
      engine.stop();
      setPlaying(false);
      setCurrentStep(-1);
      return;
    }
    await engine.start();
    setArmed(true);
    setPlaying(true);
  }

  function paint(track: TrackId, step: number, on: boolean) {
    setStep(track, step, on);
    if (on) engineRef.current?.preview(track);
  }

  function onPadPointerDown(track: TrackId, step: number) {
    const next = !pattern[track][step];
    paintRef.current = { on: next };
    paint(track, step, next);
  }

  function onPadEnter(track: TrackId, step: number) {
    const mode = paintRef.current;
    if (!mode) return;
    paint(track, step, mode.on);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          className: "!bg-elevated !text-fg !border-border !shadow-border",
        }}
      />
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <p className="font-mono text-xs tracking-[0.28em] text-subtle uppercase">Sequencer</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">PULSE</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <PatternFiles />
          <PatternLibrary />
          <AuthSlot />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pb-8 sm:px-6">
        <section className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button
              variant="primary"
              size="play"
              onClick={() => void toggleTransport()}
              aria-label={playing ? "Stop" : "Play"}
              className="shrink-0 self-start"
            >
              <span className="relative grid size-6 place-items-center">
                <span
                  className={cn(
                    "absolute inset-0 grid place-items-center transition-[opacity,filter,transform] duration-200 ease-out",
                    playing ? "scale-100 opacity-100 blur-0" : "scale-25 opacity-0 blur-sm",
                  )}
                >
                  <Square className="size-5 fill-current" />
                </span>
                <span
                  className={cn(
                    "grid place-items-center transition-[opacity,filter,transform] duration-200 ease-out",
                    playing ? "scale-25 opacity-0 blur-sm" : "scale-100 opacity-100 blur-0",
                  )}
                >
                  <Play className="ml-0.5 size-6 fill-current" />
                </span>
              </span>
            </Button>

            <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
              <Control label="Tempo" value={`${bpm}`} unit="BPM">
                <Slider
                  min={40}
                  max={200}
                  step={1}
                  value={[bpm]}
                  onValueChange={([v]) => setBpm(v ?? bpm)}
                  aria-label="Tempo"
                />
              </Control>
              <Control label="Swing" value={`${swing}`} unit="%">
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[swing]}
                  onValueChange={([v]) => setSwing(v ?? swing)}
                  aria-label="Swing"
                />
              </Control>
              <Control
                label="Level"
                value={`${Math.round(master * 100)}`}
                unit="%"
                icon={<Volume2 className="size-3.5" />}
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[master]}
                  onValueChange={([v]) => setMaster(v ?? master)}
                  aria-label="Master volume"
                />
              </Control>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-elevated p-1 shadow-border">
              {BANKS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectBank(id)}
                  className={cn(
                    "h-8 min-w-9 rounded-sm px-2.5 font-mono text-xs font-medium transition-colors duration-150",
                    bank === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {id}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearPattern}>
                <Eraser className="size-4" />
                Clear
              </Button>
              <Button variant="secondary" size="sm" onClick={randomize}>
                <Shuffle className="size-4" />
                Randomize
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={chainEnabled ? "primary" : "ghost"}
              size="sm"
              onClick={() => setChainEnabled(!chainEnabled)}
              disabled={chain.length === 0}
              aria-pressed={chainEnabled}
              title={chain.length === 0 ? "Add banks to the chain first" : "Play the chain in order"}
            >
              <Link2 className="size-4" />
              Chain {chainEnabled ? "on" : "off"}
            </Button>
            <ol className="flex min-h-9 flex-1 flex-wrap items-center gap-1" aria-label="Pattern chain">
              {chain.length === 0 ? (
                <li className="text-xs text-subtle">Add banks to play them one bar each, in order.</li>
              ) : (
                chain.map((id, i) => (
                  <li key={`${i}-${id}`}>
                    <button
                      type="button"
                      onClick={() => removeFromChain(i)}
                      aria-label={`Remove bank ${id} from chain position ${i + 1}`}
                      title="Remove from chain"
                      data-current={chainEnabled && chainPosition === i}
                      className={cn(
                        "group flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-sm px-2 font-mono text-xs font-medium transition-colors duration-150",
                        chainEnabled && chainPosition === i
                          ? "bg-accent text-accent-fg"
                          : "bg-elevated text-fg shadow-border hover:bg-pad",
                      )}
                    >
                      {id}
                      <X className="hidden size-3 group-hover:block" />
                    </button>
                  </li>
                ))
              )}
            </ol>
            <div className="flex items-center gap-1">
              {BANKS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => appendToChain(id)}
                  disabled={chain.length >= MAX_CHAIN_LENGTH}
                  aria-label={`Add bank ${id} to chain`}
                  className="flex h-8 items-center gap-0.5 rounded-sm px-1.5 font-mono text-xs text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg disabled:opacity-40"
                >
                  <Plus className="size-3" />
                  {id}
                </button>
              ))}
              {chain.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={clearChain} aria-label="Clear chain">
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
          <div className="mb-2 flex gap-2">
            <div className="w-14 shrink-0 sm:w-20" />
            <ol className="grid flex-1 grid-cols-8 gap-1 md:grid-cols-16">
              {Array.from({ length: STEP_COUNT }, (_, i) => (
                <li
                  key={i}
                  className={cn(
                    "text-center font-mono text-xs tabular-nums",
                    currentStep === i ? "text-fg" : isDownbeat(i) ? "text-muted" : "text-subtle",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-2">
            {TRACK_IDS.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <div className="flex w-14 shrink-0 flex-col items-stretch gap-1 sm:w-20">
                  <button
                    type="button"
                    onClick={() => engineRef.current?.preview(id)}
                    title={`${TRACK_META[id].label} · tap to preview`}
                    data-audible={isAudible(id, mutes, solos)}
                    className={cn(
                      "h-9 rounded-md px-1 text-left font-mono text-xs font-medium tracking-wide transition-colors duration-150 sm:px-2",
                      isAudible(id, mutes, solos)
                        ? "bg-elevated text-fg shadow-border hover:bg-pad"
                        : "bg-pad text-subtle line-through",
                    )}
                  >
                    {TRACK_META[id].short}
                  </button>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => toggleMute(id)}
                      aria-pressed={mutes[id]}
                      aria-label={`Mute ${TRACK_META[id].label}`}
                      title="Mute"
                      className={cn(
                        "h-7 rounded-sm font-mono text-[11px] font-semibold transition-colors duration-150",
                        mutes[id]
                          ? "bg-fg text-bg"
                          : "bg-elevated text-muted shadow-border hover:text-fg",
                      )}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSolo(id)}
                      aria-pressed={solos[id]}
                      aria-label={`Solo ${TRACK_META[id].label}`}
                      title="Solo"
                      className={cn(
                        "h-7 rounded-sm font-mono text-[11px] font-semibold transition-colors duration-150",
                        solos[id]
                          ? "bg-accent text-accent-fg"
                          : "bg-elevated text-muted shadow-border hover:text-fg",
                      )}
                    >
                      S
                    </button>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[volumes[id]]}
                    onValueChange={([v]) => setVolume(id, v ?? volumes[id])}
                    aria-label={`${TRACK_META[id].label} volume`}
                    className="hidden sm:flex"
                  />
                </div>
                <div className="grid flex-1 grid-cols-8 gap-1 md:grid-cols-16">
                  {pattern[id].map((on, step) => (
                    <button
                      key={step}
                      type="button"
                      aria-label={`${TRACK_META[id].label} step ${step + 1}`}
                      aria-pressed={on}
                      data-on={on}
                      data-beat={isDownbeat(step)}
                      data-current={currentStep === step}
                      className="pad-cell touch-none"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                        onPadPointerDown(id, step);
                      }}
                      onPointerEnter={() => onPadEnter(id, step)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="px-1 text-center text-xs text-subtle sm:text-left">
          {armed
            ? soloing
              ? "Solo is on: only soloed tracks play. Mute always wins."
              : "Space plays. Drag across pads to paint. M mutes, S solos, tap a track name to hear it."
            : "Press play to unlock audio, then tap pads or drag to paint a groove."}
        </p>
      </main>
    </div>
  );
}

function Control({
  label,
  value,
  unit,
  icon,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
          {icon}
          {label}
        </span>
        <span className="font-mono text-sm text-fg tabular-nums">
          {value}
          <span className="ml-1 text-subtle">{unit}</span>
        </span>
      </div>
      {children}
    </div>
  );
}
