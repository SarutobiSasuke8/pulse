import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clampChainPosition, MAX_CHAIN_LENGTH } from "./chain";
import { normalisePatternSet, type PatternSet } from "./pattern-set";
import { clampBpm, clampSwing } from "./timing";
import type { MuteMap, Pattern, PatternBank, TrackId, VolumeMap } from "./types";
import {
  BANKS,
  clonePattern,
  defaultMutes,
  defaultPattern,
  defaultVolumes,
  emptyPattern,
  STEP_COUNT,
} from "./types";

function boomBap(): Pattern {
  return {
    kick: flag([0, 7, 10]),
    snare: flag([4, 12]),
    hats: flag([0, 2, 3, 4, 6, 8, 10, 11, 12, 14]),
    perc: flag([6, 14]),
  };
}

function breakbeat(): Pattern {
  return {
    kick: flag([0, 3, 6, 10]),
    snare: flag([4, 12, 13]),
    hats: flag([0, 1, 2, 4, 6, 8, 9, 10, 12, 14]),
    perc: flag([2, 11]),
  };
}

function flag(indices: number[]): boolean[] {
  const row = Array.from({ length: STEP_COUNT }, () => false);
  for (const i of indices) row[i] = true;
  return row;
}

function musicalRandom(): Pattern {
  const kick = Array.from({ length: STEP_COUNT }, (_, i) => {
    if (i === 0) return true;
    if (i % 4 === 0) return Math.random() < 0.72;
    if (i % 2 === 0) return Math.random() < 0.22;
    return Math.random() < 0.08;
  });
  const snare = Array.from({ length: STEP_COUNT }, (_, i) => {
    if (i === 4 || i === 12) return Math.random() < 0.95;
    if (i === 13) return Math.random() < 0.25;
    return Math.random() < 0.05;
  });
  const hats = Array.from({ length: STEP_COUNT }, (_, i) => {
    if (i % 2 === 0) return Math.random() < 0.88;
    return Math.random() < 0.35;
  });
  const perc = Array.from({ length: STEP_COUNT }, (_, i) => {
    if (i % 4 === 3) return Math.random() < 0.45;
    return Math.random() < 0.08;
  });
  return { kick, snare, hats, perc };
}

export type SequencerState = {
  banks: Record<PatternBank, Pattern>;
  bank: PatternBank;
  bpm: number;
  swing: number;
  master: number;
  mutes: MuteMap;
  solos: MuteMap;
  volumes: VolumeMap;
  /** Banks played in order, one bar each, when chainEnabled is on. */
  chain: PatternBank[];
  chainEnabled: boolean;
  /** Chain entry currently playing, or -1 when stopped or not chaining. */
  chainPosition: number;
  playing: boolean;
  currentStep: number;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setMaster: (master: number) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentStep: (step: number) => void;
  selectBank: (bank: PatternBank) => void;
  toggleStep: (track: TrackId, step: number) => void;
  setStep: (track: TrackId, step: number, on: boolean) => void;
  toggleMute: (track: TrackId) => void;
  toggleSolo: (track: TrackId) => void;
  clearSolos: () => void;
  appendToChain: (bank: PatternBank) => void;
  removeFromChain: (index: number) => void;
  clearChain: () => void;
  setChainEnabled: (enabled: boolean) => void;
  setChainPosition: (position: number) => void;
  exportSet: () => PatternSet;
  applySet: (set: PatternSet) => void;
  setVolume: (track: TrackId, value: number) => void;
  clearPattern: () => void;
  randomize: () => void;
  loadPattern: (pattern: Pattern, bpm?: number, swing?: number) => void;
  pattern: () => Pattern;
};

const defaultBanks = (): Record<PatternBank, Pattern> => ({
  A: defaultPattern(),
  B: boomBap(),
  C: breakbeat(),
  D: emptyPattern(),
});

export const useSequencer = create<SequencerState>()(
  persist(
    (set, get) => ({
      banks: defaultBanks(),
      bank: "A",
      bpm: 124,
      swing: 12,
      master: 0.85,
      mutes: defaultMutes(),
      solos: defaultMutes(),
      volumes: defaultVolumes(),
      chain: [],
      chainEnabled: false,
      chainPosition: -1,
      playing: false,
      currentStep: -1,
      setBpm: (bpm) => set({ bpm: clampBpm(bpm) }),
      setSwing: (swing) => set({ swing: clampSwing(swing) }),
      setMaster: (master) => set({ master: Math.min(1, Math.max(0, master)) }),
      setPlaying: (playing) =>
        set({
          playing,
          currentStep: playing ? get().currentStep : -1,
          chainPosition: playing ? get().chainPosition : -1,
        }),
      setCurrentStep: (currentStep) => set({ currentStep }),
      selectBank: (bank) => set({ bank }),
      toggleStep: (track, step) => {
        const { banks, bank } = get();
        const next = clonePattern(banks[bank]);
        next[track][step] = !next[track][step];
        set({ banks: { ...banks, [bank]: next } });
      },
      setStep: (track, step, on) => {
        const { banks, bank } = get();
        if (banks[bank][track][step] === on) return;
        const next = clonePattern(banks[bank]);
        next[track][step] = on;
        set({ banks: { ...banks, [bank]: next } });
      },
      toggleMute: (track) => {
        const mutes = { ...get().mutes, [track]: !get().mutes[track] };
        set({ mutes });
      },
      toggleSolo: (track) => {
        set({ solos: { ...get().solos, [track]: !get().solos[track] } });
      },
      clearSolos: () => set({ solos: defaultMutes() }),
      setVolume: (track, value) => {
        const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
        set({ volumes: { ...get().volumes, [track]: v } });
      },
      appendToChain: (bank) => {
        const { chain } = get();
        if (chain.length >= MAX_CHAIN_LENGTH) return;
        set({ chain: [...chain, bank] });
      },
      removeFromChain: (index) => {
        const chain = get().chain.filter((_, i) => i !== index);
        set({
          chain,
          chainPosition:
            get().chainPosition < 0 ? -1 : clampChainPosition(get().chainPosition, chain.length),
        });
      },
      clearChain: () => set({ chain: [], chainEnabled: false, chainPosition: -1 }),
      setChainEnabled: (chainEnabled) => set({ chainEnabled, chainPosition: -1 }),
      setChainPosition: (chainPosition) => set({ chainPosition }),
      exportSet: () => {
        const s = get();
        return normalisePatternSet({
          bpm: s.bpm,
          swing: s.swing,
          banks: s.banks,
          chain: s.chain,
          chainEnabled: s.chainEnabled,
          volumes: s.volumes,
          mutes: s.mutes,
          solos: s.solos,
        });
      },
      applySet: (incoming) => {
        const next = normalisePatternSet(incoming);
        set({ ...next, chainPosition: -1 });
      },
      clearPattern: () => {
        const { banks, bank } = get();
        set({ banks: { ...banks, [bank]: emptyPattern() } });
      },
      randomize: () => {
        const { banks, bank } = get();
        set({ banks: { ...banks, [bank]: musicalRandom() } });
      },
      loadPattern: (pattern, bpm, swing) => {
        const { banks, bank } = get();
        set({
          banks: { ...banks, [bank]: clonePattern(pattern) },
          ...(bpm !== undefined ? { bpm } : {}),
          ...(swing !== undefined ? { swing } : {}),
        });
      },
      pattern: () => get().banks[get().bank],
    }),
    {
      name: "pulse.sequencer",
      skipHydration: true,
      partialize: (s) => ({
        banks: s.banks,
        bank: s.bank,
        bpm: s.bpm,
        swing: s.swing,
        master: s.master,
        mutes: s.mutes,
        solos: s.solos,
        volumes: s.volumes,
        chain: s.chain,
        chainEnabled: s.chainEnabled,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SequencerState>;
        const restored = normalisePatternSet(
          { bpm: current.bpm, swing: current.swing, ...p },
          defaultBanks(),
        );
        return {
          ...current,
          ...restored,
          bank: BANKS.includes(p.bank as PatternBank) ? (p.bank as PatternBank) : current.bank,
          master:
            typeof p.master === "number" && Number.isFinite(p.master)
              ? Math.min(1, Math.max(0, p.master))
              : current.master,
        };
      },
    },
  ),
);
