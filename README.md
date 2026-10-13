# Caption Mirror

Prototype for a Fontys research project. Captions that show **how** something is said, not only **what** is said.
It is a Next.js (App Router, TS, Tailwind) player with three test conditions:

| | Condition | What the viewer sees |
|---|---|---|
| **A** | Plain | Standard subtitles, at most 2 lines of about 42 characters |
| **B** | Tags | Subtitles plus sparse bracket tags derived from the audio |
| **C** | Prosody typography | Subtle variable-font styling driven by the audio (see below) |

## Setup (macOS, recommended)
```bash
brew install node ffmpeg deno python@3.12      # deno is needed by yt-dlp for YouTube
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt                # faster-whisper, librosa, praat-parselmouth, soundfile, numpy, yt-dlp
npm install
npm run dev                                    # http://localhost:3000  (run in the terminal where the venv is active)
```
To make Next.js use a specific Python, run `PYTHON=.venv/bin/python npm run dev`. Use Python 3.12, because 3.13 and newer can break audio dependencies.
**Updating from an older version:** activate the venv and run `pip install -r requirements.txt` again. The new dependency is `praat-parselmouth`. Then re-run `analyze.py` on old clips, because the JSON format changed (v2: `cues`).

## Demo (home page) vs. test library
- **Home = demo only.** Paste a YouTube link and choose the length (first 15–60 s). The clip is analyzed into a temporary folder (`public/_tmp/`). Each new link replaces the previous demo clip, and demo clips are never added to the test library. You can try A/B/C, the intensity slider and the expression on/off switch here.
- **Test library** (`/test/library`): add clips with a YouTube link (the same pipeline), see thumbnails, set the **intended delivery** for each clip, and delete clips. The library ships **empty**.
- Downloaded source files in `data/uploads/` are deleted after analysis.
- **Command line:**
  ```bash
  python analyze.py clip.mp4 --name scene1 [--language en] [--model small|medium] [--root public/_tmp]
  ```
  Without `--root`, the clip goes into the test library (`public/`). The default Whisper model is `small`. Set `WHISPER_MODEL=medium` for higher accuracy, which is slower: roughly 1–2× realtime on a recent Mac CPU.

## Analysis pipeline (`analyze.py`)
1. **Transcription:** faster-whisper with word timestamps, beam 5, VAD filter, `condition_on_previous_text=False`. Word edges are then snapped to the actual sound energy so real pauses are not hidden.
2. **Features**, all **relative to the clip's own speech baseline**, so normal speech counts as 0:
   - loudness = RMS in dB, smoothed over 50 ms, relative to the clip's typical word (`relDb`)
   - pitch = Praat autocorrelation (falls back to librosa pyin), in semitones relative to the median speech pitch (`relSt`), plus pitch slope and rise within each word
   - speech rate = syllables per second of speaking time (inner pauses removed), relative to the clip median (`rate`)
   - pauses between words (`pauseBefore`)
3. **Segmentation into cues:** at most 2 balanced lines of about 42 characters each. Cues break at pauses of 0.5 s or more, at sentence punctuation, at long commas, and after 6 s at most. Each cue shows for at least 1 s plus a 0.6 s hold, and never overlaps the next one.
4. **Emphasis:** within each phrase, at most about 1 in 6 words is marked as emphasized. A word qualifies when it is clearly louder and/or higher than the rest of the phrase.
5. **Tags (Condition B)** are computed **per phrase**. Loudness uses hysteresis (separate thresholds for entering and leaving a state, measured in dB against the clip baseline), and a tag is only shown when the state changes. Each cue gets at most 2 tags.
   Vocabulary: `[whispering]` `[quietly]` `[loudly]` `[shouting]` `[pause]` `[fast]` `[slowly]` `[questioning]` `[trailing off]`.
   The thresholds are at the top of the tag section in `analyze.py`.

## The three caption conditions (`components/Caption.tsx`)
- **A (Plain):** a standard subtitle in white system text on a dark box.
- **B (Tags):** plain text plus bracket tags in italic small caps, coloured Sky Blue (#2997ff, the design system's on-dark accent). Tags come from the audio: `[whispering]` `[quietly]` `[loudly]` `[shouting]` `[pause]` `[fast]` `[slowly]` `[questioning]` `[trailing off]`. A loudness tag is repeated on every phrase spoken in that state, and an inline `[pause]` marks gaps of 0.8 s or more inside a phrase.
- **C (Expressive):** kinetic typography in Roboto Flex (variable: weight 100–1000, width 25–151). Each word's level is 65 % phrase loudness plus 35 % its own loudness, measured against the clip baseline.
  - whisper: 0.75 em, weight 250, about 62 % opacity, wide letter-spacing
  - normal: 1 em, weight 400
  - loud: about 1.5 em, weight 800
  - shout: up to 1.9 em, weight 1000, with a small scale-pop when the word starts
  - emphasized words: +250 weight and ×1.15 size
  - pauses: a visible "…" gap
  - rising ending: the final word is lifted and tilted
  - fast: condensed and tight; slow: expanded and loose
  - karaoke-style reveal: spoken words are full strength and upcoming words are dimmed
  - The intensity slider blends C back to plain text, and 0 % or the off switch gives plain text. `prefers-reduced-motion` turns off transitions and the pop.

## Player and fullscreen
The custom YouTube-style controls are play, a red scrubber, time, volume, CC, a ⚙ menu (condition, intensity, off switch) and fullscreen.
Fullscreen applies to the **wrapper** that holds the video, captions and controls. It uses `requestFullscreen` and falls back to `webkitRequestFullscreen`, listening for both `fullscreenchange` and `webkitfullscreenchange`. The caption layer has a z-index and its own compositing layer, so Safari's video layer cannot paint over it. Caption size is measured from the player box, not the viewport, and re-measured on resize and on fullscreen changes. If a browser fullscreens the bare `<video>` (iOS Safari, native menus), a WebVTT track with the same text, and the tags in Condition B, is shown instead.
Keyboard: space/k play, f fullscreen, c captions, ←/→ seek.


## Running a test (on this laptop)
1. Run `npm run build && npm start`, then open http://localhost:3000. Videos always start **muted**; during a test the sound stays off.
2. **Prepare:** in **Test library**, add at least 3 clips (4 or more is better) and set each clip's intended delivery. This is the correct answer for the comprehension check. **Start test** stays locked until at least 3 clips have an intended delivery.
3. Click **Start test** and enter the participant's **full name**. Then hand the laptop to the participant.
4. **Assignment (random + balanced):**
   - The server randomly draws 3 clips that have an intended delivery and assigns conditions A, B and C once each.
   - Within every block of 6 participants, each of the 6 possible condition orders is used exactly once, in random order. This balances the conditions over positions.
   - It also draws one extra random clip for the agency round. A 4th clip is used when the library has one; otherwise one of the three is reused.
   - The clip and condition for each trial are stored with the participant and with every answer.
5. **The participant's flow:**
   - **Pre-survey (RQ1):** in which situations they watch muted (multi-select, with "other" text), how often, and what they miss in standard subtitles.
   - **3 clips:** for each, "How did the speaker sound?", then 1–7 scales for clarity, readability, "I could keep up with reading the captions", comfort and "The text was tiring or distracting", plus a comment.
   - **Agency round (A4):** one more clip in Condition C, with an intensity slider and an on/off switch for the effect. The app logs every change, plus the final intensity and on/off state, and asks which intensity felt best.
   - **Post-survey:** preferred style A/B/C (shown with small visual examples), why, and "Would you use this?" (1–7).
   - Then **Thank you** → **Back to home**.
6. **Results** (`/results`):
   - Per-condition charts and mean ± SD, including keep-up per condition.
   - Comprehension accuracy and interaction metrics.
   - RQ1 summaries: situations, frequency, and "what do you miss" quotes.
   - Preference distribution and mean "would use".
   - Agency stats: mean final intensity, % who turned the effect off, mean "best" intensity.
   - Participant cards, each with a **Delete participant** button.
   - **Exports:**
     - **Trials CSV:** one row per trial, plus the participant's key survey fields.
     - **Participants CSV:** all survey answers, assignment and agency data, including the event log.
     - **JSON:** `{participants, responses}`, i.e. everything.

### What is logged per trial (saved with the answers)
Play, pause, seek, rewind, replay, caption on/off, fullscreen on/off, intensity and styling changes, mute changes, ended, and watch time. Every event has a millisecond timestamp (in `events`), and the counts are in `metrics`. The agency round adds `intensity` and `off` events to the participant's `agency.events`.

### Local data files (in `data/`)
`participants.json` (name, sequence number, assigned trials, agency clip, pre/post survey, agency round), `clip-settings.json` (intended delivery) and `responses.jsonl` (one trial per line). To reset all data, delete these files. Participant names are personal data: keep the laptop and the exports private, and delete them when the project ends.

## Design
The UI follows `DESIGN.md` (Apple-style system):
- black 44 px global nav
- alternating parchment, dark and white full-bleed sections
- one accent, Action Blue (#0066cc), with Sky Blue on dark surfaces
- pill buttons with a scale(0.95) press state
- SF Pro via `system-ui` (Inter elsewhere), 17 px body text, 600-weight headlines with tight tracking
- 18 px utility cards with hairline borders and no shadows on chrome

## Hosting online (Vercel + Supabase): optional
Analysis (Whisper, ffmpeg, yt-dlp) always runs **locally**. The hosted site only plays the published clips and collects responses.
1. Create a Supabase project. In the SQL editor, run `supabase/migrations/0001_caption_mirror.sql`. It creates the tables `cm_clips`, `cm_clip_settings`, `cm_participants` and `cm_responses` (with RLS on) and a public storage bucket `clips`.
2. Locally, create `.env.local` (see `.env.example`):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```
3. Analyze clips locally, then run `npm run publish-clips` (or `npm run publish-clips -- scene1 scene2`). This uploads `<name>.json`, `videos/<name>.mp4` and `thumbs/<name>.jpg` to the bucket, registers each clip in `cm_clips`, and copies the intended-delivery settings.
   **Important:** while `.env.local` contains these variables, `npm run dev` also runs in hosted mode. Remove or rename the file to go back to local mode.
4. Push the project to GitHub and import it in Vercel. Add the same two environment variables in Vercel (Project → Settings → Environment Variables) and deploy.
5. When hosted, the link fields are hidden and the analysis API returns 403. Participants, clip settings and responses are stored in Supabase. Tests then run in any browser at `https://<your-app>.vercel.app/test`.
   The service-role key stays on the server and is never sent to the browser. Note that the home page and /results are not password-protected, so don't share those URLs.

## Included clips
None. The test library starts empty: add your own clips in `/test/library`. On a box where YouTube is blocked, clips can also be added with `analyze.py` from local files.

**Upgrading an existing Supabase project:** `cm_participants` now stores the whole record in `data jsonb`; the old `clips` column is no longer used. Re-run the migration on a fresh project, or run `alter table cm_participants add column data jsonb; alter table cm_participants drop column clips;`.

## Limitations
- There is no speaker diarization, so baselines are per clip. In multi-speaker clips a naturally loud speaker can be tagged `[loudly]` more often. Emphasis and the questioning rise use within-phrase comparisons, so they are not affected by this.
- Feature thresholds are tuned by hand on a few clips. Old or noisy audio lowers pitch reliability.
- Whisper can still misplace short words. Using `--model medium` helps.
- The researcher pages (home, /results) have no login. Locally that is fine. When hosted, keep those URLs private.
- Adding clips needs Python, ffmpeg and yt-dlp on the machine that runs Next.js, so run it locally, not on Vercel. Job progress is kept in memory.
- YouTube may require a JS runtime (deno) or block some networks ("Sign in to confirm you're not a bot"). Only use clips you are allowed to use.
