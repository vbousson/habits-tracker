# Branding

The visual identity: palette, name, mark, and how the product should talk about
itself. Written in English like the rest of the documentation; the strings it
recommends are in French, like the app.

Everything measurable in here was **computed, not eyeballed**. The contrast
ratios are WCAG 2.x relative-luminance ratios; the colour-vision numbers are
CIE ΔE\*76 distances between colours put through the Viénot–Brettel–Mollon
(1999) dichromacy simulation. The tables are generated from the values actually
committed in `src/ui/styles.css` and `src/data/starter.ts`.

---

## 1. The palette

### What was wrong with the old one

Not just "drab" — it was also failing accessibility in several places, which is
worth recording because it constrained every replacement:

| problem | old value | measured |
| --- | --- | --- |
| `--text-faint` on `--surface` — used for `.field__help`, `.section-title`, inactive nav labels | `#8b95a5` on `#ffffff` | **3.03:1** (needs 4.5) |
| same, dark theme | `#6e7d8e` on `#182029` | **3.90:1** (needs 4.5) |
| `--border` on `--surface` — the *only* boundary an `.input` or `.btn` has | `#d8dee8` on `#ffffff` | **1.35:1** (needs 3.0) |
| same, dark theme | `#2e3a47` on `#182029` | **1.42:1** (needs 3.0) |
| `--accent` on `--accent-soft` — the active bottom-nav label | `#3d6fd8` on `#e5edfd` | **4.00:1** (needs 4.5) |
| `--good` as text (`.savestate--ok`, `.banner--ok`), light theme | `#2f9e63` on `#ffffff` | **3.39:1** (needs 4.5) |
| `#fff` label on `--good` (segmented "Oui"), dark theme | `#ffffff` on `#4cbc82` | **2.38:1** (needs 4.5) |
| Six of seven tag chips, white label on the tag colour | e.g. `alimentation` `#d99022` | **2.64:1** (needs 4.5) |
| `travail` tag was **byte-identical to `--accent`** (`#3d6fd8`), so a dashboard filtered by *Travail* was tinted exactly like the unfiltered one | — | ΔE = 0 |
| `travail` vs `famille` under protanopia | `#3d6fd8` / `#a05fd4` | ΔE76 = **1.3** (indistinguishable) |

So the brief was not only "make it less grey". Three of the fourteen tokens had
almost no room to move.

### The constraints that actually pin the values

The palette is not a free choice; it is the solution to a system of
inequalities imposed by rules already in the stylesheet. Worth writing down,
because it explains why the numbers look arbitrary.

1. **Tag colours are a single value used in both themes** — they come from the
   user's spreadsheet, so there is no light/dark variant. `.chip[aria-pressed]`
   puts a hard-coded `#fff` label on them (needs ≥ 4.5:1 → relative luminance
   Y ≤ 0.183) and `TrendChart` strokes a line in them on `--surface` (needs
   ≥ 3:1 against the *dark* surface → Y ≥ 0.141). Every tag therefore has to
   sit in the band **Y ∈ [0.141, 0.183]**. That is a 1.3× luminance range: there
   is no lightness channel available for tags, only hue and chroma. It is also
   why the seven colours read as one family — they are all the same weight by
   construction.
2. **`--border` is the sole affordance of a form control.** `.input` has
   `background: var(--surface)` inside a `.card` that also has
   `background: var(--surface)`, so the 1px border is the only thing that says
   "this is a field". WCAG 1.4.11 therefore applies at 3:1, and the same token
   is reused for card edges and the `.summary` grid. See the caveat in §1.5.
3. **`--good` is both a text colour and a background.** `.banner--ok` and
   `.savestate--ok` use it as text on `--surface-2`; `.segmented__opt[data-tone='yes']`
   uses it as a background under a hard-coded `#fff`. In the light theme one
   value serves both. In the dark theme it cannot — see §1.6.

### 1.1 Direction A — *Indigo Nocturne* (recommended, implemented)

Indigo-violet accent, warm-paper light theme, ink-violet dark theme. The light
background moves off blue-grey onto a warm paper white, which is most of what
kills the drabness; the accent moves from a safe corporate blue to indigo, which
reads as evening and is the only vivid hue family left once green, amber and red
are reserved for `--good`/`--warn`/`--bad`.

| token | light | dark |
| --- | --- | --- |
| `--bg` | `#f7f4ee` | `#1a1625` |
| `--surface` | `#ffffff` | `#241e31` |
| `--surface-2` | `#efece5` | `#2e283d` |
| `--surface-3` | `#e2dcd1` | `#3d374b` |
| `--border` | `#9a8b73` | `#716688` |
| `--text` | `#271e3d` | `#e9e6f1` |
| `--text-dim` | `#514967` | `#b7afc8` |
| `--text-faint` | `#6c6484` | `#978eac` |
| `--accent` | `#7550d9` | `#a288f6` |
| `--accent-soft` | `#f3f0fd` | `#331d7b` |
| `--accent-text` | `#ffffff` | `#140f22` |
| `--good` | `#0f7a3e` | `#28a864` |
| `--warn` | `#8e570e` | `#c48423` |
| `--bad` | `#a82613` | `#e0725e` |

Tags: `santé #be4c40` · `sport #347f43` · `travail #3471c2` ·
`alimentation #876e22` · `famille #b33fb3` · `forme #257d79` · `social #c7387d`

### 1.2 Direction B — *Verger*

Petrol-teal accent, warm-sand light theme, forest-charcoal dark theme. Calmer
and more "natural health" than A. Rejected for two reasons: teal-green is the
default colour of every wellness app, so it costs distinctiveness for nothing;
and a teal accent sits close enough to `--good` (`#0f7a3e`) and to the `forme`
tag (`#257d79`) that "this is the app's accent" and "this is a positive value"
stop being separable at a glance — exactly the confusion you do not want on a
dashboard.

| token | light | dark |
| --- | --- | --- |
| `--bg` | `#f7f4eb` | `#0f1918` |
| `--surface` | `#ffffff` | `#182321` |
| `--surface-2` | `#f0ece2` | `#212e2b` |
| `--surface-3` | `#e0dccf` | `#2c3d3b` |
| `--border` | `#968d6e` | `#55706c` |
| `--text` | `#142628` | `#d9ebe8` |
| `--text-dim` | `#3b5253` | `#9bb9b4` |
| `--text-faint` | `#546d6f` | `#769994` |
| `--accent` | `#13767d` | `#23aba6` |
| `--accent-soft` | `#d4f8fa` | `#0d3635` |
| `--accent-text` | `#ffffff` | `#091412` |

`--good` / `--warn` / `--bad` and the tags as in A.

### 1.3 Direction C — *Braise*

Plum-magenta accent, ivory light theme, genuinely warm (brown-black) dark theme.
The most energetic of the three and the most distinctive; also the riskiest.
Rejected because magenta is one hue step from `--bad` and from the `social` tag,
which makes an error banner and a primary button uncomfortably related, and
because a warm dark theme at this chroma is the one most likely to feel like a
lot at 23:00 — the palette has to survive being looked at every single evening.

| token | light | dark |
| --- | --- | --- |
| `--bg` | `#f7f4f0` | `#1f1612` |
| `--surface` | `#ffffff` | `#271f1c` |
| `--surface-2` | `#f1ebe7` | `#322926` |
| `--surface-3` | `#e3dbd3` | `#443732` |
| `--border` | `#9d8a78` | `#7d675e` |
| `--text` | `#361b27` | `#efe5e1` |
| `--text-dim` | `#624553` | `#c2b0a7` |
| `--text-faint` | `#7f606e` | `#a48e85` |
| `--accent` | `#bf3073` | `#f06ca5` |
| `--accent-soft` | `#fdedf4` | `#5b1533` |
| `--accent-text` | `#ffffff` | `#1a0f0b` |

`--good` / `--warn` / `--bad` and the tags as in A.

All three directions were built against the same contrast constraints and all
three pass them; the choice between them is aesthetic and semantic, not
accessibility. **A is recommended and implemented**: it puts the accent in the
one hue region that no data colour occupies, it says "evening" without saying
"sleep tracker", and a warm paper light theme next to an indigo accent is the
cheapest way to stop looking like a blue-grey admin panel.

### 1.4 Measured contrast — the implemented palette

Every pair below corresponds to a rule that exists in `src/ui/*.css`. Floor is
4.5:1 for text (WCAG AA), 3:1 for non-text UI boundaries (WCAG 1.4.11).

#### Light

| check | pair | ratio | floor | |
| --- | --- | --- | --- | --- |
| Body text | `--text` on `--bg` | **14.28:1** | 4.5 | PASS |
| Body text on a card | `--text` on `--surface` | **15.68:1** | 4.5 | PASS |
| Text on `--surface-2` | `--text` on `--surface-2` | **13.29:1** | 4.5 | PASS |
| Segmented "Non" label | `--text` on `--surface-3` | **11.49:1** | 4.5 | PASS |
| `.muted` secondary text | `--text-dim` on `--surface` | **8.40:1** | 4.5 | PASS |
| `.muted` on page bg | `--text-dim` on `--bg` | **7.66:1** | 4.5 | PASS |
| `.badge`, segmented track | `--text-dim` on `--surface-2` | **7.12:1** | 4.5 | PASS |
| `.field__help` tertiary text | `--text-faint` on `--surface` | **5.54:1** | 4.5 | PASS |
| `.section-title` on page bg | `--text-faint` on `--bg` | **5.04:1** | 4.5 | PASS |
| Unanswered segmented label | `--text-faint` on `--surface-2` | **4.69:1** | 4.5 | PASS |
| Link, chart stroke | `--accent` on `--surface` | **5.38:1** | 4.5 | PASS |
| Focus ring | `--accent` on `--bg` | **4.90:1** | 3.0 | PASS |
| `.btn--primary` label | `--accent-text` on `--accent` | **5.38:1** | 4.5 | PASS |
| Active nav-bar label | `--accent` on `--accent-soft` | **4.79:1** | 4.5 | PASS |
| Progress-bar fill | `--accent` on `--surface-3` | **3.94:1** | 3.0 | PASS |
| Input / button edge | `--border` on `--surface` | **3.33:1** | 3.0 | PASS |
| Card edge on page bg | `--border` on `--bg` | **3.03:1** | 3.0 | PASS |
| `.savestate--ok` | `--good` on `--surface` | **5.42:1** | 4.5 | PASS |
| `--warn` as text | `--warn` on `--surface` | **5.97:1** | 4.5 | PASS |
| `.btn--danger` label | `--bad` on `--surface` | **7.11:1** | 4.5 | PASS |
| `.banner--ok` text | `--good` on `--surface-2` | **4.60:1** | 4.5 | PASS |
| `.banner--error` text | `--bad` on `--surface-2` | **6.03:1** | 4.5 | PASS |
| Segmented "Oui" label | `#fff` on `--good` | **5.42:1** | 4.5 | PASS |

#### Dark

| check | pair | ratio | floor | |
| --- | --- | --- | --- | --- |
| Body text | `--text` on `--bg` | **14.39:1** | 4.5 | PASS |
| Body text on a card | `--text` on `--surface` | **13.07:1** | 4.5 | PASS |
| Text on `--surface-2` | `--text` on `--surface-2` | **11.47:1** | 4.5 | PASS |
| Segmented "Non" label | `--text` on `--surface-3` | **9.24:1** | 4.5 | PASS |
| `.muted` secondary text | `--text-dim` on `--surface` | **7.65:1** | 4.5 | PASS |
| `.muted` on page bg | `--text-dim` on `--bg` | **8.42:1** | 4.5 | PASS |
| `.badge`, segmented track | `--text-dim` on `--surface-2` | **6.71:1** | 4.5 | PASS |
| `.field__help` tertiary text | `--text-faint` on `--surface` | **5.20:1** | 4.5 | PASS |
| `.section-title` on page bg | `--text-faint` on `--bg` | **5.72:1** | 4.5 | PASS |
| Unanswered segmented label | `--text-faint` on `--surface-2` | **4.56:1** | 4.5 | PASS |
| Link, chart stroke | `--accent` on `--surface` | **5.66:1** | 4.5 | PASS |
| Focus ring | `--accent` on `--bg` | **6.23:1** | 3.0 | PASS |
| `.btn--primary` label | `--accent-text` on `--accent` | **6.59:1** | 4.5 | PASS |
| Active nav-bar label | `--accent` on `--accent-soft` | **4.61:1** | 4.5 | PASS |
| Progress-bar fill | `--accent` on `--surface-3` | **4.00:1** | 3.0 | PASS |
| Input / button edge | `--border` on `--surface` | **3.03:1** | 3.0 | PASS |
| Card edge on page bg | `--border` on `--bg` | **3.34:1** | 3.0 | PASS |
| `.savestate--ok` | `--good` on `--surface` | **5.27:1** | 4.5 | PASS |
| `--warn` as text | `--warn` on `--surface` | **5.11:1** | 4.5 | PASS |
| `.btn--danger` label | `--bad` on `--surface` | **5.16:1** | 4.5 | PASS |
| `.banner--ok` text | `--good` on `--surface-2` | **4.62:1** | 4.5 | PASS |
| `.banner--error` text | `--bad` on `--surface-2` | **4.53:1** | 4.5 | PASS |
| Segmented "Oui" label | `#fff` on `--good` | **3.05:1** | 4.5 | see §1.6 |

#### Tags

Single value per tag, used in both themes.

| tag | hex | `#fff` on chip | vs light `--surface` | vs dark `--surface` |
| --- | --- | --- | --- | --- |
| santé | `#be4c40` | 4.89:1 | 4.89:1 | 3.29:1 |
| sport | `#347f43` | 4.93:1 | 4.93:1 | 3.27:1 |
| travail | `#3471c2` | 4.90:1 | 4.90:1 | 3.28:1 |
| alimentation | `#876e22` | 4.90:1 | 4.90:1 | 3.28:1 |
| famille | `#b33fb3` | 4.91:1 | 4.91:1 | 3.28:1 |
| forme | `#257d79` | 4.90:1 | 4.90:1 | 3.29:1 |
| social | `#c7387d` | 4.89:1 | 4.89:1 | 3.29:1 |

Old palette, same measure: `#fff`-on-chip ranged **2.64:1 – 4.70:1** with six of
seven below AA. New palette: **4.89:1 – 4.93:1**, all seven pass, and every tag
also clears 3:1 as a chart stroke on the dark surface.

As **heatmap fills** the tags are blended over `--surface-2` at 16/34/55/78/100%
by `src/core/colors.ts`. Because the base colours all sit at the same luminance,
the five heat levels have the same perceived step for every tag — which was not
true of the old palette, where `alimentation #d99022` at level 1 was already
lighter than `sport #2f9e63` at level 3.

### 1.5 Note on `--border` — the one visible trade-off

`--border` moved from **1.35:1** to **3.33:1** against `--surface` in the
light theme, and from **1.42:1** to **3.03:1** in the dark theme. This is the
change most likely to surprise: card edges and the `.summary` grid are now
clearly drawn rather than barely suggested.

It is not decoration. `.input`, `.select`, `.textarea`, `.btn`, `.segmented` and
`.chip` all sit on `--surface` inside a card that is also `--surface`, so the
border is the *only* visual information identifying the control — precisely the
case WCAG 1.4.11 covers at 3:1. The same token is reused for container edges,
so raising it to the level the controls need necessarily raises it everywhere.

If the heavier card edges are unwelcome, the clean fix is a **second token**
rather than lowering this one: add `--border-strong` at 3:1, keep `--border`
soft for containers, and point the control rules at `--border-strong`. That
touches component rules, so it was left out of this change. The chosen hue is
low-chroma and matched to the surface cast (warm grey in light, lavender grey in
dark) specifically to keep the added weight as quiet as possible.

### 1.6 Note on the dark-theme "Oui" pill

`styles.css` contains:

```css
.segmented__opt[aria-pressed='true'][data-tone='yes'] { background: var(--good); color: #fff; }
```

That hard-coded `#fff` makes the dark theme unsatisfiable. In dark mode `--good`
must be **light enough** to be readable as text on `--surface-2` (`.banner--ok`
needs Y ≥ 0.285) and **dark enough** to carry a white label at 4.5:1
(Y ≤ 0.183). Those two are mutually exclusive; no value of `--good` satisfies
both.

The value chosen (`#28a864`) resolves it in favour of the three text uses, which
all reach AA (5.27:1 on `--surface`, 4.62:1 on `--surface-2`), and leaves the
white pill label at **3.05:1** — AA-large, not AA.

To be straight about the trade rather than dress it up: the old dark `--good`
(`#4cbc82`) was *more* comfortable as text (6.91:1 on `--surface`, 6.03:1 on
`--surface-2`) and *much* worse as a pill background — the white label was at
**2.38:1**, which is not legible for a lot of people. Darkening `--good` gives
up headroom on three uses that were already passing in order to lift the one
that was failing, from 2.38:1 to 3.05:1. That is the best available answer while
the `#fff` is hard-coded; it is not a good answer.

**One-line fix, for whoever owns the component rules:** change `color: #fff` to
`color: var(--accent-text)`. `--accent-text` is `#140f22` in dark and `#ffffff`
in light, so the pill label becomes **6.13:1** in dark and stays 5.42:1 in
light — and `--good` could then be lightened back toward the old value, which
would restore the text headroom too. That single character-level change is worth
more than anything else in this section. It was deliberately not made here:
component classes were out of scope, and another agent was editing them
concurrently.

### 1.7 Colour-vision deficiency

Roughly 8% of men have a red–green deficiency (about 6% deuteranomaly, 2%
protanomaly); tritan deficiency is rarer than 0.01%. Two separate questions.

**Does colour ever carry meaning on its own?** No, and this is the load-bearing
answer rather than the hue choices. Auditing every use of the semantic and tag
colours in `src/ui/`:

| where | colour channel | redundant channel |
| --- | --- | --- |
| `.segmented__opt[data-tone='yes']` | green fill | the label reads **"Oui"**; the unselected state also differs in fill and shadow |
| `.segmented[data-answered='false']` | — | **dashed** border plus a fainter label: answered vs unanswered never relies on hue |
| `.banner--ok` / `.banner--error` | green / red text and border | the banner **contains the message text** |
| `.savestate--ok` | green | accompanied by a check glyph and the word |
| `.field__check` | green | it *is* a check glyph — shape, not colour |
| `.btn--danger` | red text and border | the button says **"Supprimer"** |
| Tag chips (`TagFilter`, `TagPicker`) | the tag colour | the chip **always shows the tag's label** next to the dot |
| Tag dots (`MetricStatCard`) | the tag colour | `title={tag.label}` |
| Heatmap cells | intensity of one tag colour | **monochrome intensity ramp**, one tag at a time, and each cell has a text tooltip |
| Trend charts | one series colour at a time | single series per chart, labelled |

Nothing in the app asks the user to tell red from green to understand it. The
heatmap in particular is a *sequential* scale in a single hue, which is the
CVD-safe form; there is no diverging red-to-green ramp anywhere.

**Are the colours nevertheless as separable as possible?** Measured, ΔE\*76
after dichromacy simulation, minimum over all pairs of the seven tags:

| vision | old palette | new palette | closest new pair |
| --- | --- | --- | --- |
| normal | 30.6 | **32.7** | famille / social |
| protanopia | 1.3 | **9.8** | travail / famille |
| deuteranopia | 15.2 | 9.2 | santé / alimentation |
| tritanopia | 3.1 | **5.9** | travail / forme |

The worst case across all four vision types goes from **1.3** (old: *travail*
and *famille* are the same colour to a protanope) to **5.9**. Deuteranopia is
the one number that got worse — 15.2 to 9.2 — and that is the direct cost of
constraint 1 in §1.2: the old palette got some of its deuteranopic separation
from lightness differences that also made six of its seven chips fail AA. Given
tags are always labelled and never the sole channel, trading 15.2 → 9.2 of
simulated separation for 2.64 → 4.89 of real, everyday text contrast is the
right way round. The hue assignment was chosen by hill-climbing the minimum
simulated ΔE over the four vision types, with the accent included as an eighth
colour so no tag can be mistaken for the app's own accent (the old `travail`
was literally the accent hex).

The semantic triad cannot be separated by lightness at all in dark mode — the
band left by §1.2's constraint 3 is Y ∈ [0.285, 0.297] — so under deuteranopia
`--warn` and `--bad` collapse to ΔE 3.1 in light and 25.2 in dark. This is
accepted, because every use of those two carries its own words.

---

## 2. The name

**Resolved after this study was written: the product is called `MyHabits`.**

The shortlist below is kept as the record of what was considered and what was
ruled out, because the checks are worth having if the name is ever revisited.
`Jalon` was the recommendation here; the owner chose an explicit, neutral name
instead, which is a defensible different objective — a descriptive name asks
nothing of the reader, where an evocative one has to be taught.

The concrete bug this study set out to fix is fixed: the `<title>` was
`Habits Tracker — suivi d'habitudes et de santé`, 45 characters and truncated in
every browser tab and search result. It is now `MyHabits`, 8 characters.
`short_name` stays `Habits`, already a good home-screen label at six.

The rename was applied to presentation fields only. The four storage keys in
§2.4 were deliberately left as `habits-tracker`, as recommended there, and so
was the repository slug.

### 2.1 Selection criteria

- two syllables ideally, ≤ 11 characters (home-screen labels truncate);
- spellable and pronounceable by a French speaker on first hearing — no
  ambiguous doubled letters, no silent-letter traps, and an accent in the name
  is a real cost (domains, typing on a phone keyboard);
- suggestive of **regularity, days, or observing oneself**, not of productivity
  or optimisation;
- not medical enough to imply a clinical claim (the README is explicit that this
  is not a medical device, and the name must not undercut that);
- able to carry a paid product — nothing diminutive or jokey;
- ideally works in both French and English, since the code and docs are English.

### 2.2 Shortlist

| name | pronunciation, gender | what it evokes | why it fits |
| --- | --- | --- | --- |
| **Cairn** | *kɛʁn* (fr), *kern* (en), m. | a trail marker built one stone at a time by everyone who passes | the single best metaphor for a daily habit: nobody builds a cairn in one go, and it is only there because people kept adding to it. Works identically in French and English, 5 characters, one syllable, no accent. Gives an obvious abstract logo. |
| **Veille** | *vɛj*, f. | double meaning: *la veille* = the evening before, and *la veille* = watching over / monitoring (as in *veille sanitaire*) | says both "the moment you fill this in" and "keeping an eye on yourself" in one French word. 6 characters. The tech sense ("standby mode") is the main risk. |
| **Jalon** | *ʒa.lɔ̃*, m. | a surveyor's marker; *poser des jalons* = to set down markers | days as markers along a path. Clean, sober, two syllables, no accent, no diminutive feel, and grown-up enough for a paid product. |
| **Sillon** | *si.jɔ̃*, m. | a furrow; *creuser son sillon* = to plough one's own furrow, i.e. steady unglamorous persistence | idiomatically almost exactly what a habit tracker is for. Strongly French-flavoured, which is a plus for a French app and a minus for English. |
| **Vigie** | *vi.ʒi*, f. | the lookout in a ship's masthead | observing rather than optimising. Distinctive, two syllables, and nobody's productivity app is called this. Slightly nautical. |
| **Repère** | *ʁə.pɛʁ*, m. | a landmark, a reference point; *se repérer* = to find one's bearings | very close to the product's purpose. The accented *è* is a genuine cost for a domain and for typing. |
| **Carnet** | *kaʁ.nɛ*, m. | a pocket notebook | the warmest and most honest option: this *is* a notebook you fill in each evening. Utterly clear to any French speaker. Also the most generic — hard to own. |
| **Cadence** | *ka.dɑ̃s* (fr), f. / *cadence* (en) | rhythm, regularity, a steady stroke rate | the concept the app is actually about — not "did you do everything" but "are you keeping a rhythm". Perfectly bilingual. See the availability finding. |
| **Tempo** | *tɛm.po*, m. | musical pace | short, bilingual, immediately understood. Almost certainly crowded. |
| **Trace** | *tʁas* (fr), f. / *trace* (en) | a mark left behind; *tracer* = to plot | bilingual, five characters, and describes both the act of recording and the resulting curve. Very generic as a trademark. |
| **Constance** | *kɔ̃s.tɑ̃s*, f. | steadiness over time; also a first name | the virtue the product is trying to support. Nine characters, three syllables — at the limit. |
| **Éphéméride** | *e.fe.me.ʁid*, f. | a tear-off day-by-day calendar | the most literally apt word in French for "one page per day". Rejected on length (11 characters, five syllables, two accents) but recorded because it is the right *idea*. |

French-only options: Veille, Jalon, Sillon, Vigie, Repère, Carnet, Constance,
Éphéméride. Bilingual: Cairn, Cadence, Tempo, Trace.

### 2.3 Availability

Checked for the top six candidates. **Method, and its limits:** the checks were
run against primary sources rather than a web search engine — Apple's iTunes
Search API and Google Play's FR and US storefronts for apps, the TMview API
against the EUIPO, INPI (France) and USPTO registers for trademarks, RDAP for
domain registration, and the French SIRENE company register. That is stronger
evidence than search snippets for stores, marks and domains, but it
**under-covers web-only products** that have no store listing and no
trademark, so treat "is there already a well-known web app called this" as only
partially answered. WIPO and Canadian registers were not searched. The remaining
six names in §2.2 were **not** checked.

One result up front: **all twelve domains checked (`.com` and `.app` for each of
the six) are registered. None is available.** Several serve only a parking or
placeholder page, which means the holder is not using it — weak evidence about
whether it could be bought, and no evidence of availability.

#### Jalon — clearest of the six

- **Apps:** nothing in health, habits or journaling. Only an iOS game
  ([Jalon, Max Unger](https://apps.apple.com/fr/app/jalon/id6785248641)) and a
  Peruvian ride-hailing app (JALON / JALON CONDUCTOR, ToolRides S.A.C.).
  Searching the FR App Store for "jalon habitudes" and "jalon journal" surfaces
  no app of that name.
- **Trademarks:** the lightest field by a wide margin — 8 exact hits across
  EUIPO + INPI, of which 3 are live, and **zero live marks in class 9
  (software), 42 (SaaS) or 44 (health services)** in France or the EU. The live
  ones are an EU figurative mark in class 1 (Luoyang Jalon Micro-nano New
  Materials, Chinese chemicals) and Spanish *Jalón* wine marks in class 33
  (Jalón is a river and comarca in Aragón). Both French "JALON" word marks are
  expired.
- **Real-world clash, unregistered:** [jalon.app](https://www.jalon.app/) is a
  **live French B2B SaaS** — a CRM and prospecting tool. Not a trademark
  problem; a discoverability and domain problem. SIRENE also lists a French
  software company named JALON (SIREN 421902701, Paris, NAF 62.01Z, active
  since 1999).
- **Domains:** `jalon.com` registered 2002, **parked** on an ad page.
  `jalon.app` registered 2023, **actively serving the CRM above**.
- **Verdict: clear.** The best legal position of the six and no clash in health
  or habits. Cost: both obvious domains are gone, so this needs `jalon.fr`,
  `usejalon.com` or similar (not checked). Note also that *jalon* is the
  standard French project-management term for a milestone, which both weakens
  anyone's exclusivity and makes it arguably descriptive for a tracker — that
  could complicate registering it yourself.

#### Sillon — crowded, head-on

- **Apps:** [**Sillon — Santé au quotidien**](https://apps.apple.com/fr/app/sillon-sant%C3%A9-au-quotidien/id6797055229)
  (publisher "DIH", iOS FR) is essentially this product. Its own description:
  *"La plupart des applications de santé sont soit un flux d'articles sans fin,
  soit un carnet qui suppose que tu sais déjà quoi faire. Sillon n'est ni l'un
  ni l'autre. Chaque matin, une carte…"* — same language, same minimalist
  daily-health pitch, same name. Also
  [**Ma Santé Sillon**](https://apps.apple.com/fr/app/ma-sant%C3%A9-sillon/id6446890600)
  (CHR Metz-Thionville, a French hospital patient app, iOS + Play), plus Sillon
  voice memo, Sillons, Radio Sillon.
- **Trademarks:** paradoxically the freest field — **no live FR or EU mark in
  class 9, 42 or 44.** Live marks sit in food and furniture (*Sillon* cl. 29/43,
  cl. 20; *LE SILLON* cl. 5/29/30/31/32 Ecotone/Bjorg, cl. 16 Deere & Company
  for John Deere's French farm publication). SILLON SAS's cl. 35/36/37/41/42
  registration is expired.
- **Domains:** `sillon.com` 302-redirects to `telepathy.com`, a premium-domain
  brokerage — for sale, probably five figures. `sillon.app` serves a bare
  Apache placeholder titled "SILLON".
- **Verdict: crowded.** Legally the freest name here, but a French minimalist
  daily-health app called Sillon already shipped. That is the clash that costs
  users, not lawyers.

#### Vigie — crowded

- **Apps:** no habit tracker, but heavily worked in French utility and safety
  software: [Vigie – Speed Camera & GPS](https://apps.apple.com/fr/app/vigie-speed-camera-gps/id6801242361)
  (Codelio), [Vigie](https://play.google.com/store/apps/details?id=com.jbopale.vigie)
  on Play, and [VigieApp pour Neovigie](https://apps.apple.com/fr/app/vigieapp-pour-neovigie/id1463362655)
  — French teleassistance, filed under **Health & Fitness**, iOS plus three Play
  apps. Also Vigie Terrain, VIGIEsip, VIGIE fi, VigiJardin/VigiApp (INRAE),
  TP-Link VIGI.
- **Trademarks:** two live **class-9** French marks — "VIGIE" (LACROIX TRAFFIC
  SAS, 2009) and "VIGIE" cl. 9/35/38/41/42/45 (SELLOR, 2021), the latter
  covering software *and* services in exactly the relevant classes. Plus a dense
  compound thicket (NEOVIGIE, PROXI VIGIE / La Poste cl. 42/44/45, Hospi-Vigie /
  Cegedim FR+EU cl. 9/35/38/42, cybervigie, HYPERVIGIE). SIRENE lists two active
  French software companies named exactly VIGIE.
- **Domains:** `vigie.com` is a live business — Vigie Informatique 2000 inc., a
  Quebec IT services company. `vigie.app` resolves but returns an empty body.
- **Verdict: crowded.** Two live French class-9 marks, a health-category French
  app, an active `vigie.com`, and — worth noting on its own — *vigie* connotes
  **surveillance**, which works directly against a privacy-first pitch.

#### Cairn — avoid

- **Apps:** the exact niche is occupied. [**Cairn: Your Milestones**](https://play.google.com/store/apps/details?id=app.cairn.milestones)
  on Play pitches itself *against* this category in its own store copy: *"Habit
  trackers show what you missed. Cairn shows what you finished."* Also
  [Cairn – Hiking Safety Tracker](https://apps.apple.com/fr/app/cairn-hiking-safety-tracker/id964300002)
  (FitClimb, Health & Fitness, the established one),
  [Cairn – Values Sort](https://apps.apple.com/fr/app/cairn-values-sort/id6790974704)
  (Health & Fitness, and it uses the same cairn-marks-the-trail metaphor),
  [Cairn: Stop Scrolling](https://apps.apple.com/fr/app/cairn-stop-scrolling/id6771791772),
  Le Cairn (a French local-currency app), Cairn: Hiking Journal, CAIRN Strength.
- **Trademarks:** bad in France specifically. **FR word mark "Cairn", class 9
  (software) plus 16/28/41, registered 2023, The Game Bakers SAS** — the French
  studio behind the 2025 video game *Cairn*. A French software company holding
  class 9 in the home market is the single worst configuration for this
  candidate. Also FR + EUTM "CAIRN" cl. 9/18/25/28 (Cairn Sport SAS), FR "CAIRN"
  cl. 3/5/16/30/41/**44** (Cairn Plantes SAS — class 44 is health services),
  EUTM (Vedanta / Cairn Oil & Gas), US cl. 9 (FitClimb) and US cl. 35
  (Northwest Planning Partners, the wealth-management Cairn).
- **Not a trademark but decisive for a French-language product:**
  [cairn.info](https://www.cairn.info) is *the* French-language humanities and
  social-sciences journal portal — an institution. Every French speaker who
  googles "cairn" lands there.
- **Domains:** `cairn.com` (registered 1995) serves a personal art/tech
  portfolio. `cairn.app` 302-redirects to `cairnme.com`, the hiking-safety app.
- **Verdict: avoid.** Painful, because it is the best metaphor on the list.

#### Cadence — avoid

- **Apps:** saturated, including direct competitors.
  [Cadence – To-Do List & Planner](https://play.google.com/store/apps/details?id=com.cadence.todo)
  on Play, and [Rappel Médicaments : Cadence](https://apps.apple.com/fr/app/rappel-m%C3%A9dicaments-cadence/id6758649306)
  — a French-localised health-tracking app with a one-time-payment pitch, i.e.
  the same market and the same business model. Plus Cadence: Bike & Run Tracker,
  My Cadence, Cadence Coach, CadenceFlow and ~20 more `*cadence*` packages on
  Play FR alone.
- **Trademarks:** fenced in from several directions.
  [Cadence Design Systems](https://en.wikipedia.org/wiki/Cadence_Design_Systems)
  holds "CADENCE" as a word mark in **EUTM cl. 9/16/42** (1996) and a fresh
  **EUTM cl. 9/42** (2025), plus US cl. 9 and cl. 42. On the merits a confusion
  claim would be weak — nobody mistakes an EDA vendor for a habit app, and
  *cadence* is a dictionary word in both languages — but the classes are exactly
  class 9 and class 42, a company that size runs trademark watch services, and
  an opposition to an INPI or EUTM filing would be fought on their budget. A
  clean registration is unlikely. Worse and more directly: **US "CADENCE"
  cl. 9/10/42/44 — Cadence Solutions, Inc. (2020)**, so a health-tech Cadence
  already owns the health classes in the US. Also live: **FR "CADENCE"
  cl. 9/35/36/38/41/42/45 — INFOMARQUE SAS (2020)**, in the home market; plus
  marks held by Smith & Nephew, Integra LifeSciences, Edwards Lifesciences,
  CooperVision, Terumo BCT, Huntington National Bank. 362 exact hits at the
  USPTO, 125 across EUIPO + INPI.
- **Domains:** `cadence.com` — Cadence Design Systems, registered 1989.
  `cadence.app` — a GoDaddy for-sale lander, buyable at a domainer's price.
- **Verdict: avoid.** The only candidate simultaneously fenced in class 9/42 by
  a multibillion-dollar software firm, in class 44 by a US health-tech firm, and
  already used by both a to-do app and a French medication tracker.

#### Veille — avoid

- **Apps:** nothing named plainly "Veille" in habits or health, but the term is
  buried in noise: [Veille vidéosurveillance](https://apps.apple.com/fr/app/veille-vid%C3%A9osurveillance/id1493990515)
  (Kiwatch), Veille Médias, Veillée, and a wall of *mode veille* standby-clock
  apps that own the term in the FR store.
- **Trademarks:** 307 near-exact FR/EU hits, and essentially **none is a bare
  "VEILLE" word mark** — they are all compounds (*Pro VEILLE* / MAAF, *PROXI
  VEILLE* / La Poste, *MULTI VEILLE*, *i-Veille* / Infogreffe, *LegiVeille*…).
  The absence of a bare mark is the signature of a word too descriptive to
  register alone. SIRENE matches 10 000+ French companies on "veille".
- **Domains:** `veille.com` (1998) serves OVH's "Site en construction"
  placeholder. `veille.app` serves a Gandi parking page. Both held, neither
  built.
- **Verdict: avoid.** *Veille* means standby, wakefulness *and*
  market-monitoring in French at once. The ambiguity that made it attractive is
  what makes it unbrandable, unregistrable alone and an SEO dead end.

#### Recommendation

**Jalon**, on the evidence: it is the only one of the six with a genuinely clear
trademark field in classes 9, 42 and 44 in France and the EU, and the only one
with no existing app in habits, health or journaling. It also happens to meet
every criterion in §2.1 — two syllables, five letters, no accent, obviously
about markers along a path rather than about productivity, and sober enough to
put a price on.

Two things to weigh before committing. First, both obvious domains are taken and
`jalon.app` is a live French B2B CRM, so the name comes with a domain hunt
(`jalon.fr`, `usejalon.com`, `jalonapp.com` — none checked). Second, *jalon* is
the standard French word for a project milestone, which is both an advantage
(instantly understood) and a risk (arguably descriptive, so harder to register
and easier for others to use).

If the domain situation is a dealbreaker, the next names to check are the six
that were **not** researched — **Repère**, **Carnet**, **Constance**,
**Trace**, **Tempo**, **Éphéméride**. Of those, *Repère* and *Constance* look
most likely to survive a check (*Trace* and *Tempo* are almost certainly
crowded, and *Carnet* is generic in French). None of the six checked names
should be adopted without also confirming the .fr situation, which was outside
this pass.

### 2.4 Rename checklist

Once a name is picked, this is the whole job. Split deliberately into "safe to
change" and "changing this breaks existing installs".

**Safe — pure presentation.**

| file | field |
| --- | --- |
| `index.html` | `<title>`, `<meta name="description">`, `<meta name="apple-mobile-web-app-title">`, `og:site_name`, `og:title`, `og:description`, `og:image:alt`, and the `<noscript>` paragraph (line 62 names the app) |
| `public/manifest.webmanifest` | `name`, `short_name`, `description` |
| `README.md` | the `<h1>`, the tagline, and the badge alt text |
| `docs/*.md` | prose references; `docs/BRANDING.md` (this file) |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` | prose references. `LICENSE` keeps the copyright holder's name, not the product's |
| `src/ui/screens/SettingsScreen.tsx` | line 430, the "about" paragraph |
| `src/adapters/sheets/bootstrap.ts` | line 114 default spreadsheet title, line 389 the `Guide` tab heading |
| `scripts/generate-icons.py` | the docstring only — the mark is abstract and does not change |
| `public/sw.js` | `CACHE_NAME` (line 23). Renaming it just orphans one cache, which the `activate` handler already sweeps |

**Careful — these are storage keys, not labels. Changing them silently loses
user data.**

| file | field | consequence |
| --- | --- | --- |
| `src/lib/settings.ts` | `KEY = 'habits-tracker:settings'` | renaming wipes every existing user's client id, theme and backend choice |
| `src/adapters/local/localRepository.ts` | `key = 'habits-tracker:local'` | renaming wipes the whole demo/offline journal |
| `src/App.tsx` | line 61, the same key passed literally | must match the above |
| `src/adapters/sheets/bootstrap.ts` | line 376, `['app', 'habits-tracker']` in the `Meta` tab | written into users' spreadsheets; check nothing reads it back before changing |

Recommendation: **leave all four alone.** They are invisible to users and a
migration is not worth writing for a cosmetic rename.

**Only if the GitHub repository is also renamed.**

| file | field |
| --- | --- |
| `package.json` | `name`, `description`, `repository.url` |
| `vite.config.ts` | nothing — `base` already comes from `$BASE_PATH` |
| `.github/workflows/deploy.yml` | the `BASE_PATH` value |
| `.github/ISSUE_TEMPLATE/config.yml` | four `github.com/vbousson/habits-tracker/...` URLs |
| `src/ui/screens/SettingsScreen.tsx` | `REPO_URL` (line 16) |
| `index.html` | `og:url`, `og:image` (absolute deployment URLs) |
| `README.md` | every `github.com/vbousson/habits-tracker` and `vbousson.github.io/habits-tracker` link |
| `public/sw.js` | the comment on line 25 mentioning the deployment sub-path |

---

## 3. The mark

Three concepts were drawn and rendered at 16, 24, 32, 48 and 128 px before
choosing. Rendering them was the point: two of the three were rejected on
evidence, not on taste.

### 3.1 Concept "l'éclipse" — chosen

A thick ivory crescent cradling a single amber disc, on an indigo tile.

Read it as the evening and the one point of light you add to it. It is the only
concept that carries all three brand colours, which is what actually makes an
icon findable in a grid of thirty — the silhouette gets you halfway, the colour
pair gets you the rest. It says "evening" without saying "sleep tracker",
because the amber disc reframes the crescent as a moment rather than a mode. It
is two large shapes and nothing else: the thinnest part of the crescent is about
9% of the mark box, well above the point where a 16px downsample turns a stroke
to mush.

Geometry, in unit coordinates of the mark box (`scripts/generate-icons.py`):
ivory disc at `(0.50, 0.50) r 0.50`, minus a disc at `(0.66, 0.32) r 0.42`, with
the amber disc at `(0.70, 0.30) r 0.28`. Two `mark_ratio` values fall out of
that: `0.66` for the tiles, `0.78` for the favicon (the mark needs nearly the
whole canvas to survive 16px), `0.62` for the maskable icon. The mark's farthest
point from its centre is 0.57 units, so `0.57 × 0.62 = 0.35 < 0.40` — inside the
maskable safe circle with 13% margin, verified by rendering the icon under an
80%-diameter circular crop.

The mark is deliberately abstract, not a lettermark, so it survives any outcome
of §2 — including the availability findings, which knocked out the name the
mark was almost drawn for. Whatever §2 lands on, this mark still works; a
lettermark would have had to be redrawn.

### 3.2 Concept "le cairn" — rejected on evidence

Three stacked rounded bars of decreasing width: the trail marker built one stone
per day. Conceptually the strongest of the three, and the closest match to the
best name candidate.

Rejected because it **fails at 16px**. Three bars plus two gaps across a ~11px
mark box leaves each element under 2.5px; in the rendered comparison the gaps
closed and the whole thing became a featureless triangular blob. Widening the
bars closes the gaps faster; adding a fourth stone makes it worse. It also flirts
with reading as a hamburger menu at small sizes. A good idea that the 16px
requirement kills.

### 3.3 Concept "la grille" — rejected on judgement

A 2×2 (and a 3-cell L-shaped) arrangement of chunky rounded cells with one cell
amber — the app's own calendar heatmap, reduced to four days.

This was the **crispest** of the three at 16px, cleanly legible at every size,
and it is the most literal expression of what the app shows. Rejected anyway: a
2×2 grid of rounded squares is the universal "all apps" / launcher glyph, so it
would be the least findable of the three in a home-screen grid, and the single
amber cell reads as a notification badge rather than as part of the mark. The
L-shaped 3-cell variant fixed the launcher problem but read as a Tetris piece.

### 3.4 Colours and outputs

Tile: a shallow vertical gradient `#7f5ce0 → #5836c0`, centred on the light
theme's `--accent` (`#7550d9`). Crescent `#fdfbf7` — warm white, not pure
`#ffffff`, so it sits with the paper-white light theme. Amber `#f2b34a`.

Regenerate with `python3 scripts/generate-icons.py`. Deterministic: everything
is drawn at 8× and downsampled with LANCZOS, no randomness, no timestamps.

| file | size | purpose |
| --- | --- | --- |
| `public/icons/icon-192.png` | 192 | rounded tile, PWA install |
| `public/icons/icon-512.png` | 512 | same, high resolution |
| `public/icons/icon-512-maskable.png` | 512 | full-bleed, mark inside the 80% safe circle |
| `public/icons/apple-touch-icon.png` | 180 | full-bleed; iOS applies its own squircle |
| `public/icons/favicon-32.png` | 32 | browser tab |
| `public/icons/favicon.ico` | 16/32/48 | multi-resolution favicon |

`theme_color` in the manifest is the accent `#7550d9` (it colours the Android
splash and task switcher); the `theme-color` meta tags in `index.html` stay
matched to `--bg` per theme (`#f7f4ee` / `#1a1625`) so the address bar blends
into the page. Those are two different jobs and are deliberately different
values.

---

## 4. Positioning and tone of voice

### 4.1 One sentence

> **FR** — Une minute chaque soir : vos habitudes et votre santé, notées dans
> votre propre feuille de calcul — et nulle part ailleurs.

> **EN** — One minute every evening: your habits and your health, written into
> your own spreadsheet — and nowhere else.

### 4.2 One paragraph

> **FR** — La plupart des applis de suivi décident à votre place ce qui compte,
> vous facturent un graphique et gardent vos données de santé sur leurs
> serveurs. Celle-ci fait l'inverse : les questions posées chaque soir, vous les
> écrivez vous-même, ligne par ligne, dans une feuille de calcul qui vous
> appartient. L'application se contente de dérouler le formulaire, d'appliquer
> vos règles d'affichage et de faire les calculs — courbes, séries, régularité,
> tendances. Il n'y a pas de serveur,
> pas de compte, pas de mesure d'audience : vos réponses vont de votre
> navigateur à votre Drive, directement. Ce n'est pas un dispositif médical et
> ça ne cherche pas à l'être. C'est un carnet du soir qui sait compter.

> **EN** — Most trackers decide for you what matters, charge you for a chart,
> and keep your health data on their servers. This one works the other way
> round: the questions you get asked each evening are ones you wrote yourself,
> row by row, in a spreadsheet you own. The app only lays out the form, applies
> your display rules and does the arithmetic — series, trends, regularity. There
> is no server, no account and no
> analytics: your answers go from your browser to your Drive, directly. It is
> not a medical device and does not try to be. It is an evening notebook that
> can count.

### 4.3 Tagline

> **FR** — *Un soir à la fois.*
>
> **EN** — *One evening at a time.*

Alternatives, in preference order: FR *« Ce que vous notez reste à vous. »* /
*« Vos jours, votre feuille. »* — EN *"Your days, your sheet."* /
*"Written down, kept close."*

*Un soir à la fois* is the recommendation because it sets the right expectation
in four words. It promises regularity without promising transformation, which is
what separates this from the habit-app genre; and it quietly says the unit of
use is one evening, not one streak.

### 4.4 How the product talks

**Say:** notice, note, record, keep, regularly, one evening at a time, your
data, your spreadsheet, your choice of questions.

**Do not say:** optimise, maximise, boost, hack, streak (as a goal rather than a
statistic), gamify, insights, wellness journey, "unlock". Nothing that implies
the product knows something about the user that the user does not.

**Never say:** diagnose, monitor (in a clinical sense), symptom control, treat,
improve your health. The README already states this is not a medical device;
marketing copy must not undo that. Describing what the app *records* is fine
("vos symptômes", "votre traitement"); describing what it *concludes* is not.

> **Note:** these two paragraphs describe features as they stand today. The
> printable doctor's summary was removed from the app while this document was
> being written (`src/ui/components/ExportReport.tsx` was deleted), so it is not
> claimed here. Re-check the feature list against the app before this copy is
> published anywhere.

**Tone.** Sober, concrete, slightly dry. The privacy claim is the strongest
thing the product has and it is strongest stated flatly — "il n'y a pas de
serveur" beats "nous prenons votre confidentialité au sérieux" by a mile,
because the first is checkable. Never congratulate the user; a missed day is a
missing data point, not a failure, and the interface already reflects that (a
streak only breaks on a day a metric was actually due).

**One inconsistency to settle.** The app currently mixes *tu* and *vous*: the
starter template's help strings use *tu* (`"réponds même les jours où tu as
oublié"`), and `SettingsScreen.tsx` line 430 says *"tes données restent chez
toi"*, while `index.html`'s `<noscript>` and the meta descriptions use *vous*.
Pick one. The recommendation is **vouvoiement throughout**: it is what a product
that might one day be sold uses, it fits the sober tone, and the *tu* in the
starter template is a leftover from the app having had exactly one user. The
copy in this document uses *vous* consistently.
