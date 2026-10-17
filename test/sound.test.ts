import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerSoundFor,
  COMBO_EVERY,
  DEFAULT_SOUND_SETTINGS,
  getSoundSettings,
  nextCombo,
  playAnswerSound,
  playSound,
  playWrongTry,
  resetSoundSession,
  saveSoundSettings,
  SOUND_SETTINGS_KEY,
} from "@/services/sound";

const g = globalThis as Record<string, unknown>;

// sound.ts keeps the first AudioContext it creates: every fake records into this one list
const started: number[] = [];

/** A minimal AudioContext that counts the oscillators started */
function installFakeAudio() {
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  class FakeContext {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: "sine",
        frequency: param(),
        connect: (n: unknown) => n,
        start: (t: number) => started.push(t),
        stop: vi.fn(),
      };
    }
    createGain() {
      return { gain: param(), connect: (n: unknown) => n };
    }
    resume() {
      return Promise.resolve();
    }
    suspend() {
      return Promise.resolve();
    }
  }
  g.AudioContext = FakeContext;
  return started;
}

afterEach(() => {
  delete g.AudioContext;
  delete g.document;
});

describe("combo counter", () => {
  it("counts right answers in a row and fires at every COMBO_EVERY", () => {
    let streak = 0;
    const combos: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const r = nextCombo(streak, true);
      streak = r.streak;
      if (r.combo) combos.push(i);
    }
    expect(COMBO_EVERY).toBe(5);
    expect(combos).toEqual([5, 10]);
  });

  it("a wrong answer resets the run", () => {
    let streak = 0;
    for (let i = 0; i < 4; i++) streak = nextCombo(streak, true).streak;
    expect(nextCombo(streak, false)).toEqual({ streak: 0, combo: false });
    // Four more right answers after the miss are not a combo yet, the fifth is
    streak = 0;
    for (let i = 0; i < 4; i++) {
      const r = nextCombo(streak, true);
      expect(r.combo).toBe(false);
      streak = r.streak;
    }
    expect(nextCombo(streak, true).combo).toBe(true);
  });

  it("picks the sound for each answer", () => {
    expect(answerSoundFor(0, true)).toEqual({ streak: 1, sound: "correct" });
    expect(answerSoundFor(3, false)).toEqual({ streak: 0, sound: "wrong" });
    expect(answerSoundFor(4, true)).toEqual({ streak: 5, sound: "combo" });
    expect(answerSoundFor(5, true)).toEqual({ streak: 6, sound: "correct" });
  });

  it("a card already missed by a wrong try gets no second tone and restarts the run", () => {
    expect(answerSoundFor(4, false, true)).toEqual({ streak: 0, sound: null });
    expect(answerSoundFor(4, true, true)).toEqual({ streak: 0, sound: null });
  });
});

describe("sound settings", () => {
  it("defaults to on", () => {
    expect(getSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(DEFAULT_SOUND_SETTINGS.enabled).toBe(true);
  });

  it("saves and reads back, keeping the volume within 0…1", () => {
    saveSoundSettings({ enabled: false });
    expect(getSoundSettings()).toEqual({ enabled: false, volume: DEFAULT_SOUND_SETTINGS.volume });
    saveSoundSettings({ volume: 3 });
    expect(getSoundSettings()).toEqual({ enabled: false, volume: 1 });
  });

  it("falls back to the defaults on a broken value", () => {
    localStorage.setItem(SOUND_SETTINGS_KEY, "{not json");
    expect(getSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ enabled: "yes", volume: "loud" }));
    expect(getSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });
});

// The AudioContext is created once per module: these run in order against one fake context
describe("playSound", () => {
  it("does nothing (and does not throw) without Web Audio", () => {
    expect(() => playSound("correct")).not.toThrow();
    expect(() => playAnswerSound(true)).not.toThrow();
  });

  it("plays the tones when on, nothing when turned off or the window is hidden", () => {
    const started = installFakeAudio();
    playSound("correct");
    const afterOne = started.length;
    expect(afterOne).toBe(2);

    saveSoundSettings({ enabled: false });
    playSound("combo");
    playSound("complete");
    expect(started.length).toBe(afterOne);

    saveSoundSettings({ enabled: true });
    g.document = { visibilityState: "hidden" };
    playSound("wrong");
    expect(started.length).toBe(afterOne);
  });

  it("plays the combo on the 5th right answer in a row and keeps silent after a wrong try", () => {
    const started = installFakeAudio();
    resetSoundSession();
    const notes = (fn: () => void) => {
      const before = started.length;
      fn();
      return started.length - before;
    };
    for (let i = 0; i < 4; i++) expect(notes(() => playAnswerSound(true))).toBe(2); // correct: 2 notes
    expect(notes(() => playAnswerSound(true))).toBe(5); // combo: 5 notes
    expect(notes(() => playWrongTry())).toBe(1); // wrong: 1 note
    expect(notes(() => playAnswerSound(false))).toBe(0); // the card's grade after the miss
    expect(notes(() => playAnswerSound(false))).toBe(1); // a plain wrong answer
    for (let i = 0; i < 4; i++) playAnswerSound(true);
    expect(notes(() => playAnswerSound(true))).toBe(5);
  });
});
