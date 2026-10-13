export type Word = {
  w: string; start: number; end: number;
  relDb: number;          // dB relative to the clip's typical word (0 = normal)
  relSt: number | null;   // semitones relative to clip speech median
  slope: number;          // pitch slope within word, semitones/sec
  rise: number;           // pitch change across the word (end - start), semitones
  voicedRatio: number;
  pauseBefore: number;    // seconds since previous word (0 for the first word of a cue)
  emph: boolean;          // local loudness/pitch peak inside the phrase
};
export type Cue = { start: number; end: number; showUntil: number; br: number | null; level: number; pitch: number; rate: number; tags: string[]; words: Word[] };
export type Clip = { version: number; name: string; video: string; videoUrl?: string; language?: string; baseline: Record<string, number>; cues: Cue[] };
export type Condition = "A" | "B" | "C";

export const DELIVERIES = ["calm", "angry", "whispering / intimate", "sarcastic", "anxious", "excited", "sad"] as const;
export type ClipMeta = { name: string; title: string; words: number; duration: number; thumb: string | null; intended?: string | null };
export type PreSurvey = { situations: string[]; otherSituation: string; frequency: string; miss: string };
export type PostSurvey = { preferred: Condition | ""; why: string; wouldUse: number };
export type Agency = { clip: string; finalIntensity: number; finalOn: boolean; bestIntensity: number; comment: string; intensityChanges: number; offToggles: number;
  events: { type: string; at: number; [k: string]: unknown }[]; watchTime: number };
export type Participant = { id: string; name: string; pnum: number; createdAt: string; trials: { clip: string; condition: Condition }[]; agencyClip: string;
  pre?: PreSurvey; post?: PostSurvey; agency?: Agency; completedAt?: string };
export type TrialResponse = {
  id?: string; createdAt?: string; participantId: string; participant: string; pnum: number; trialIndex: number; clip: string; condition: Condition;
  emotionClarity: number; readability: number; keepUp: number; comfort: number; distraction: number;
  perceived: string; intended: string | null; correct: boolean | null; comment: string;
  metrics: { watchTime: number; pauses: number; seeks: number; rewinds: number; replays: number; captionToggles: number; fullscreen: number; intensityChanges: number; ended: boolean };
  events: { type: string; at: number; [k: string]: unknown }[];
};
