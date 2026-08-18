import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MuteMap, Pattern, PatternBank, TrackId, VolumeMap } from "./types";
import {
  BANKS,
  clonePattern,
  defaultMutes,
  defaultPattern,
  defaultVolumes,
  emptyPattern,
  STEP_COUNT,
  TRACK_IDS,
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
  volumes: VolumeMap;
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
      volumes: defaultVolumes(),
      playing: false,
      currentStep: -1,
      setBpm: (bpm) => set({ bpm: Math.min(200, Math.max(40, Math.round(bpm))) }),
      setSwing: (swing) => set({ swing: Math.min(100, Math.max(0, Math.round(swing))) }),
      setMaster: (master) => set({ master: Math.min(1, Math.max(0, master)) }),
      setPlaying: (playing) => set({ playing, currentStep: playing ? get().currentStep : -1 }),
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
      setVolume: (track, value) => {
        set({ volumes: { ...get().volumes, [track]: value } });
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
        volumes: s.volumes,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SequencerState>;
        const banks = { ...defaultBanks(), ...(p.banks ?? {}) };
        for (const b of BANKS) {
          const row = banks[b] ?? emptyPattern();
          const next = emptyPattern();
          for (const id of TRACK_IDS) {
            const src = row[id] ?? [];
            next[id] = Array.from({ length: STEP_COUNT }, (_, i) => Boolean(src[i]));
          }
          banks[b] = next;
        }
        return {
          ...current,
          ...p,
          banks,
          mutes: { ...defaultMutes(), ...(p.mutes ?? {}) },
          volumes: { ...defaultVolumes(), ...(p.volumes ?? {}) },
        };
      },
    },
  ),
);
