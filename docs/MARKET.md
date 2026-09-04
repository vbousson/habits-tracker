# Market and competitive study

**Question this document answers:** is it worth investing time to turn this
personal habit tracker into a product for other people, and if so what would the
differentiator be?

**Date of research: 2026-09-05.** Every price below carries the currency and was
seen on a page fetched on that date unless marked otherwise. Where a figure could
not be confirmed it says **NOT VERIFIED** rather than guessing.

---

## 1. Executive summary

**Do not turn this into a product. Keep it personal, and spend the effort you
would have spent on go-to-market on making it better for you.**

The decisive evidence is not an opinion, it is a corpse. Nomie was the same idea
— open source, user-definable trackables, data owned by the user, no vendor
lock-in — reached roughly 100,000 users across eight years, and shut down on
1 February 2023. Its author's own notice reads: *"Nomie has never been
financially viable. Even with upgrade options, Nomie 6 only brought in a total of
$500 this year"* ([nomie.app](https://nomie.app/)). That is the ceiling of this
positioning, measured, by someone who got two orders of magnitude further than
this project will.

The three assumptions the project rests on do not survive contact with the data.
"Your data stays in your own storage" is already claimed by Daylio (20M+ users,
local-first, encrypted Drive/iCloud backup, CSV+PDF export) and by HabitKit
(*"No sign-in. No servers. No cloud."*), both with native apps and none with a
Google Cloud console step. Configurability is what users abandon: Bearable's own
reviews say *"Great idea. Way too complicated to actually use."* And the
no-server model cannot ship the one feature the category treats as table stakes —
on iOS a PWA cannot schedule a local reminder at all; every reminder requires a
push server.

The genuinely empty lane is narrower and more interesting than "spreadsheet
privacy": **no product in any of the six categories lets a user define their own
conditional follow-up questions.** Not one. This project already ships it.

There is exactly one finding that could change the answer, and it is worth six
weeks of your attention: **Bearable — the closest competitor and the category's
feature leader — is English-only, has no PDF doctor report, and syncs to only one
device**, and its developer has said publicly that multi-language would mean
rebuilding the app. This project is already French and already syncs everywhere.
It *did* export a doctor report — see the note below — so that is three advantages
over the leader held by accident, plus one that is a few hours away, in a market
nobody else is serving. Test that (§11) before
concluding. But test it knowing that Daylio, Stoic and eMoods are all already
French, and that eMoods emails a password-protected PDF to your doctor for
**$9.99/year**.

---

## 2. Method and limits

**What was searched.** Vendor pricing pages, App Store and Google Play listings,
GitHub repository and search APIs, the GitHub `habit-tracker` topic (1,368
repositories), HN Algolia, an Arctic-Shift Reddit archive, Apple's customer-review
RSS feeds, the MDCG 2019-11 PDF, FDA guidance PDFs, GDPR article texts, CNIL,
`esante.gouv.fr`, Sensor Tower, RevenueCat's *State of Subscription Apps 2026*,
and four analyst reports on "habit tracking apps".

**Verified.** All prices marked with a figure and a currency. Licences and star
counts came from `api.github.com`, not from marketing copy. Regulatory quotations
were extracted from the primary PDFs, not from summaries.

**Could not verify — stated as such throughout.**

- **Retention data for habit-tracking apps.** No credible study or vendor
  disclosure found. Everything anyone says about "most people quit after three
  weeks" is folklore. This is the single biggest hole in this document.
- **The clinician side.** Whether doctors actually find patient-tracked data
  useful is unanswered. No study retrieved, no clinician quote verified. The
  entire "printable summary for your doctor" value proposition rests on an
  untested assumption.
- **HabitNow pricing** (vendor site 403s, third-party figures conflict between
  $5.99, $11.99 and a €1.09–€11.99 band).
- **Habitify pricing** — the vendor site and the App Store disagree by roughly
  2x. Both are quoted; neither should be cited alone.
- **CASA assessment costs.** No source found. Any figure you have seen quoted for
  this is unsourced.
- French digital-health market size; PECAN's full approved-product list; CNIL's
  mobile-application recommendation text (four candidate URLs returned 404).
- Reddit was not directly reachable (403 plus proof-of-work walls on mirrors);
  Reddit quotations come from an archive API with real permalinks.

**Three corrections to widely-repeated beliefs.** Exist.io has *not* shut down —
it shipped a redesign in 2025 and PDF export in April 2026, and is trading at
USD 6.99/month. The FDA's General Wellness and Clinical Decision Support
guidances were both **reissued in January 2026**; the 2016/2019/2022 versions
that most blog posts cite are superseded. And the non-device *Clinical Decision
Support* exclusion requires a healthcare-professional recipient in two of its four
criteria, so **a consumer app cannot use it** — a common and expensive
misconception (§10).

**Prices seen in EUR, not converted.** Where a vendor served a French/European
storefront the euro figure is quoted directly (Daylio 4,99–35,99 €; Bearable
4,99–59,99 €; Notion €9.50/€19.50; Welltory €89/yr, €529 lifetime). Elsewhere USD
is quoted as shown. No currency conversion has been applied anywhere.

**Calibration note.** One item that circulates as strong evidence is weak: the HN
story *"I Deleted All My Habit Trackers"* has **3 points and 1 comment**
([Algolia](https://hn.algolia.com/api/v1/items/45344842)). It is one person's
view, quoted below because it is articulate, not because it is a signal.

---

## 3. Landscape map

Six clusters, ordered by how close they sit to this project.

```
                         user defines the metrics
                                    ^
                                    |
   [5] OSS / self-hosted     |   [4] QS aggregators
   Loop, Nomie(dead),        |   Exist.io, Gyroscope,
   Beaver, HabitTrove,       |   Welltory, Reporter(dead)
   obsidian-tracker          |
   ---- THIS PROJECT --------+------------------------------
   [6] roll-your-own         |   [3] symptom / chronic
   Sheets, Notion, Airtable, |   Bearable, Guava, CareClinic,
   Grist, paper/bujo         |   MyTherapy, CRUSE, MASK-air
                                    |
   [1] pure habit trackers          |   [2] mood trackers
   Streaks, HabitKit, TickTick, ... |   Daylio, Finch, eMoods
                                    v
                       vendor decides the metrics
                       (opinionated defaults, polish,
                        push notifications, App Store)
```

The vertical axis is the real fault line. Everything in the bottom half wins on
polish, notifications and store distribution; everything in the top half wins on
flexibility and data custody, and loses on all three of the others. **This
project sits at the extreme top-left**: maximum configurability, maximum data
custody, zero push notifications, zero store presence.

The important structural fact: category 3 is not a consumer-subscription market
at all. It is a **pharma-funded market**. MyTherapy is "always free" because
smartpatient sells medication-adherence insight to pharma; Migraine Buddy's
privacy policy says anonymised aggregated data *"may be sold to you or a third
party"*; Medisafe's Series C was led by Sanofi Ventures; CRUSE is funded by
Novartis, Sanofi, OLPHA and Faes Farma; Cara Care is owned outright by Bayer. A
consumer product competing there is competing against subsidised free.

---

## 4. Comparison tables

### 4.1 Pure habit trackers

| Product | Form | OSS | Price (USD, 2026-09-05) |
|---|---|---|---|
| [Streaks](https://streaksapp.com) | Apple only | No | **$5.99 one-off**, no IAP |
| [Loop](https://loophabits.org/) | Android | GPL-3.0, 10,208★ | **Free**, no ads, no IAP |
| [HabitKit](https://www.habitkit.app/) | iOS+Android | No | Free + $0.99–1.99/mo, $5.99–11.99/yr, lifetime $14.99–29.99 |
| [Habitica](https://habitica.com) | Web+iOS+Android | Code GPL-3.0, assets CC-BY-**NC**-SA, 14,119★ | Free + $4.99/mo … $47.99/yr |
| [TickTick](https://ticktick.com/upgrade) | All | No | **$49.99/yr**; free = 5 habits |
| [everyday](https://everyday.app) | All | No | Free = 3 habits; $7.49/mo, $29.99/yr, **lifetime $99.99** |
| [Productive](https://productiveapp.io/) | iOS+Android | No | $10.99/mo; yearly $19.99/39.99/59.99/79.99 (4 SKUs) |
| [Way of Life](https://wayoflifeapp.com/) | iOS+Android | No | iOS IAP $4.99/$14.99/$29.99. **iOS last updated 2024-04** |
| [Do Habits](https://apps.apple.com/us/app/do-habits-get-it-done/id1103961876) (ex-"Done") | iOS | No | Free = 3 habits; **$59.99/yr**; lifetime $19.99. **Last update 2024-08** |
| [HabitNow](https://play.google.com/store/apps/details?id=com.habitnow) | Android, 5M+ installs | No | **NOT VERIFIED** (site 403s; sources conflict) |
| [Habitify](https://www.habitify.me/pricing) | All + web | No | Site: $2.49/mo annual, lifetime $59.99. Store: $8.99/mo, $49.99/yr, lifetime $119.99. **Contradictory** |
| [Beaver Habits](https://github.com/daya0576/beaverhabits) | Self-hosted PWA | BSD-3, 1,834★ | Self-host free; hosted Pro **$9.90 lifetime** |
| [OpenHabitTracker](https://openhabittracker.net/) | Everywhere + Docker | GPL-3.0, 277★ | **Free**, "no ads, no trackers, no account" |

Feature reality across all thirteen: field types top out at **yes/no + count +
duration**. Zero have conditional questions. Zero have multi-metric goals. Zero
have correlation analysis.

### 4.2 Mood / mental-health trackers

| Product | Form | Price (2026-09-05) | Data | Notes |
|---|---|---|---|---|
| [Daylio](https://daylio.net/) | iOS+Android | Free + IAP $4.99–$59.99 (tiers unlabelled on listing) | **Local on device**, encrypted Drive/iCloud backup | 20M+ users, 4.8★/61k. **PDF+CSV export.** Correlation stats. *The direct rebuttal to this project's privacy pitch.* |
| [Bearable](https://bearable.app/pricing/) | iOS+Android | **$6.99/mo, $34.99/yr** (promo $18.99/yr) | Firebase, Frankfurt (EU-West3) | Unlimited user-defined symptoms/factors; 30+ correlation reports; free tier capped at **30-day history** |
| [Finch](https://finchcare.com/) | iOS+Android | Free + Plus $5.99–$69.99 | Vendor cloud | **4.9★ / 748,000 ratings** — largest review base in the space, by an order of magnitude |
| [eMoods](https://emoodtracker.com/) | iOS+Android | Free base tier | Vendor cloud, encrypted | Bipolar/PTSD focus; **PDF reports for clinicians** |
| [Exist.io](https://exist.io/) | iOS+Android+web+API | **$6.99/mo, $62.90/yr**, 30-day trial | Vendor cloud (Melbourne) | Correlations are the product; read/write REST API; PDF export shipped 2026-04 |
| [eMoods](https://emoodtracker.com/pricing) | iOS+Android (**100% offline**) + web SaaS | Classic **free**; Pro **$1.99/mo, $9.99/yr**; web Insights $50/yr, $100/yr, Enterprise custom | **Device only** — *"no cloud storage, and no data EVER leaves your device without your permission"* | **Best clinical export in the set**: password-protected monthly **PDF emailed to your doctor**, CSV, practitioner portal, HIPAA language, **French**, on the store since 2010. Configurable cross-metric graphs |
| [Moodfit](https://www.getmoodfit.com/purchase-options) | iOS+Android+web | **One-time, no recurring billing**: 1-yr $19.99–$35.99; **lifetime $89.99** (reg. $119.99) | Vendor cloud, US | PHQ-9/GAD-7, CBT thought records, **multi-metric goals**, "customized experiments". No GDPR/CCPA/HIPAA in the policy |
| [Stoic](https://www.getstoic.com/premium) | iOS+Android+macOS+web | Premium $6.99–$39.99 (periods unlabelled); **lifetime $299.00** | **Device + user's own iCloud** — *"Stoic does not have its own servers"* | **French.** User-definable metrics; JSON+TXT export; imports Day One. iCloud sync is paywalled |
| [Reflectly](https://apps.apple.com/us/app/reflectly-journal-ai-diary/id1241229134) | iOS+Android | **$9.99/mo, $59.99/yr** (labelled) | Vendor cloud | Owned by **Kodeon, Inc.** roll-up. **Monetises data** — Play: *"may share Personal info, App activity"*; ad SDKs + remarketing. No export documented |
| [How We Feel](https://howwefeel.org/) | iOS+Android | **Everything free, no IAP** | **Device only**; opt-in anonymised research | Donation-funded non-profit (Yale Center for Emotional Intelligence lineage). 4.87★/29,485. Fixed Mood Meter grid, no custom metrics |
| [Moodnotes](https://apps.apple.com/us/app/moodnotes-mood-tracker/id1019230398) | iOS only | Free + IAP **$14.99/mo**; yearly $29.99–$89.99 by region | Device + iCloud | **Zombie.** Bending Spoons asset; 4.65★/10,960; **last real update 2024-10-24**; own domain 301s away; **declares cross-app ad tracking** — still charging up to $89.99/yr |
| [Pixels](https://pixelstracker.app) | iOS+Android | Free + Pixels+ $4.99; Pixels Cloud+ $1.99/$21.99 | Local; **paid cloud sync** | Solo indie. 4.58★/24,357 Play, 1M+ installs. (The old `teo.ninja` domain no longer resolves; `pixelstracker.app` is live) |

### 4.3 Symptom / chronic-condition trackers — the closest category

| Product | Price (2026-09-05) | Model | Regulatory posture |
|---|---|---|---|
| [Bearable](https://bearable.app) | $6.99/mo, $34.99/yr USD | Consumer subscription | Wellness; GDPR claim, no HIPAA |
| [Guava](https://guavahealth.com/plans) | **Free $0**; Premium **$8/mo, $78/yr** USD | Consumer sub + emerging B2B | Wellness; HIPAA+GDPR claimed on homepage |
| [MyTherapy](https://www.mytherapyapp.com/) | **Free forever** (+ $49.99 lifetime ad-free) | **Pharma-funded**, ~12M users | Wellness; ISO 13485 QMS, no CE for the app |
| [Medisafe](https://www.medisafe.com/) | Consumer IAP $2.99–9.99/mo, $27.99–39.99/yr | **Pharma** (Sanofi Ventures-led $30M); 13M+ patients | Wellness; *"NOT PROVIDING ANY MEDICAL ADVICE"* |
| [CareClinic](https://careclinic.io) | $9.99/mo, $59.99/yr (medium confidence) | Freemium + clinic B2B | Wellness; no AI training, no data sale |
| [mySymptoms](https://mysymptoms.net) | **$9.99/mo, $39.99/6mo, $59.99/yr** | Consumer subscription | Wellness. **No longer one-off, no longer local-only** |
| [Flaredown](https://flaredown.com) | **Free forever** | Donation + open research dataset | **GPL-3.0**, 49★, pushed 2026-09-04. Alive but one person + volunteers |
| [Manage My Pain](https://managinglife.com) | $4.99/mo, $49.99/yr USD; €5.49/€54.99 IE | **B2B2C**: clinics, health plans, disability carriers | Wellness. **Explicitly refuses CSV export** |
| [Migraine Buddy](https://migrainebuddy.com) | $24.99/2mo, $89.99/yr | **Pharma RWD** — policy: data *"may be sold"* | Wellness |
| [Visible](https://makevisible.com) | Band $79.70; $19.99/mo or $179.88/yr | Hardware + sub + research | *"is not a medical device"* — cleanest disclaimer found |
| [Ada Assess](https://about.ada.com/press/221215-ada-health-receives-eu-mdr-certification/) | Enterprise, NOT VERIFIED | B2B licensing | **EU MDR Class IIa, TÜV SÜD, 2022-12-15** |
| Cara Care für Reizdarm | **€248 per 90-day prescription** (insurer-paid) | Reimbursed DTx, **Bayer-owned** | Registered DiGA, MDR Class I |
| K Health | — | — | **Consumer product shut down 2025-12-31**; pivoted to enterprise |

**Condition-specific, and directly on top of this project's origin story:**

| Product | Price | Languages | Relevance |
|---|---|---|---|
| [CRUSE® Control](https://cruse-control.com/) | **Free**, no IAP | 26 — **French not listed** | Chronic urticaria diary by GA²LEN (Prof. Marcus Maurer), funded by Novartis/Sanofi/OLPHA/Faes Farma. Doctor report by QR. v1.0.114 shipped **2026-09-01** |
| [MASK-air](http://www.mask-air.com/) | **Free** | **French (FR/BE/CA/CH)** | ARIA allergy diary; daily symptom + treatment + QoL questionnaire; transfers results to your HCP |

This is the most uncomfortable finding in the document. The two conditions that
motivated this project — chronic urticaria and allergy/respiratory symptoms —
each already have a free, clinically-endorsed, actively-maintained diary app with
a doctor-facing report. MASK-air is already in French.

### 4.4 Quantified-self and aggregators

| Product | Status 2026-09-05 | Price | Custom metrics | Correlations |
|---|---|---|---|---|
| [Exist.io](https://exist.io/) | **Alive**, actively shipping | $6.99/mo, $62.90/yr USD | Yes (creatable via API) | **Yes — core feature** |
| [Gyroscope](https://gyrosco.pe) | **Alive**, pivoted to AI/human coaching | ~$1/day (G1) to $3–8/day (Max) | Partial | Yes |
| [Welltory](https://welltory.com/plans/) | Alive | **€89/yr or €529 lifetime** | Partial (tags) | Yes, 100+ biomarkers |
| [Reporter App](https://apps.apple.com/us/app/reporter-app/id779697486) | **Zombie** — last build 1.6.10, 2019-02-05 | $3.99 one-off | **Yes — user-authored survey questions** | No |
| Apple Health | Alive | Free | **No** — fixed taxonomy, no user-defined types ([HKCategoryTypeIdentifier](https://developer.apple.com/documentation/healthkit/hkcategorytypeidentifier) is a closed enumeration; the JS-rendered page could not be fully extracted) | No |
| Google Fit | **Being shut down** — no new API signups since 2024-05-01, APIs supported "until end of 2026" | Free | No | No |

### 4.5 Open source, self-hosted, spreadsheet-backed

| Project | Licence | ★ | Pushed | Onboarding |
|---|---|---|---|---|
| [Loop](https://github.com/iSoron/uhabits) | GPL-3.0 | 10,208 | 2026-07-21 | Install from Play/F-Droid. Trivial |
| [Habitica](https://github.com/HabitRPG/habitica) | GPL-3.0 code, **CC-BY-NC-SA assets** | 14,119 | 2026-09-03 | Hard to self-host; NC assets forbid a commercial instance |
| [Beaver Habits](https://github.com/daya0576/beaverhabits) | BSD-3 | 1,834 | 2026-08-09 | Docker + SQLite. Easy |
| [Table Habit](https://github.com/FriesI23/mhabit) | Apache-2.0 | 1,543 | 2026-09-04 | Install. Local-first + WebDAV |
| [Habo](https://github.com/xpavle00/Habo) | GPL-3.0 | 1,502 | 2026-06-15 | Install; E2EE sync self-hostable via Supabase |
| [HabitTrove](https://github.com/dohsimpson/HabitTrove) | AGPL-3.0 | 680 | **2026-03-07, "PRs not accepted"** | Docker + JSON files |
| [Nomie 6 OSS](https://github.com/open-nomie/nomie6-oss) | MIT | 583 | **2025-10-22 (last real code 2023-10-21)** | **Any static host, no DB, no OAuth** |
| [Daily Nomie](https://github.com/dailynomie/nomie6-oss) | MIT | 70 | 2026-08-18 | The living fork carrying Nomie forward |
| **[Perfice](https://github.com/p0lloc/perfice)** | MIT | 465 | 2026-06-29 | PWA + Android + Docker. **The closest open competitor: local-first IndexedDB, "track anything", multi-trackable goals, automatic correlations, CSV+JSON both ways.** Read this one before building anything |
| **[Track & Graph](https://github.com/SamAmco/track-and-graph)** | GPL-3.0+ | 641 | 2026-09-04 | Android only, device only. Arbitrary user-defined trackers **plus a Lua scripting API** for custom calculations — the deepest configurability in FOSS |
| [Nightlio](https://github.com/shirsakm/nightlio) | AGPL-3.0 | 242 | 2026-05-23 | Self-hosted web |
| [HealthLog](https://github.com/MBombeck/HealthLog) | **PolyForm Noncommercial** (not OSI) | 66 | 2026-09-03 | Self-hosted Docker+Postgres. **PDF doctor report + FHIR R4 export** — the only FHIR support found anywhere |
| [obsidian-tracker](https://github.com/pyrochlore/obsidian-tracker) | MIT | 1,952 | 2026-04-13, **217 open issues** | Plugin. Widest field-type coverage anywhere |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview) | MIT | 9,316 | **2025-11-17, 662 open issues** | Successor `obsidian-datacore` is a 404 |
| [Dendron](https://github.com/dendronhq/dendron) | Apache-2.0 | 7,464 | **DEAD** since 2023 | — |

**Roll-your-own platforms** (the real competition for the target user):

| Tool | Price seen 2026-09-05 | Data custody |
|---|---|---|
| [Notion](https://www.notion.com/pricing) | Free / **€9.50** Plus / **€19.50** Business per member/mo | Notion's cloud |
| [Airtable](https://www.airtable.com/pricing) | Free / **$20** Team / **$45** Business per seat/mo annual | Airtable's cloud |
| [Obsidian](https://obsidian.md/pricing) | **App free**, no sign-up; Sync **$4/user/mo** annual | **Your own files** |
| [Grist](https://www.getgrist.com/pricing/) | Free / **$10/user/mo** ($8 annual) / $30 Business; **self-host free, Apache-2.0** | Yours if self-hosted |
| Google Sheets template | Free | **Your own Drive** |
| Paper / bullet journal | ~€20 for a notebook | Yours, absolutely |
| [Tiller](https://www.tiller.com/pricing/) | **$99/yr USD** | **Your own spreadsheet** |

### 4.6 Cross-category: the 14 that matter

Columns: **Cust** = user-definable metrics · **Typ** = field types beyond yes/no ·
**Cond** = conditional follow-up questions · **Goal** = multi-metric goals ·
**Corr** = correlation analysis · **Rem** = reminders · **Doc** = clinical/doctor
export · **Off** = works offline · **Exp** = data export · **Own** = user owns the
storage

| Product | Cust | Typ | Cond | Goal | Corr | Rem | Doc | Off | Exp | Own |
|---|---|---|---|---|---|---|---|---|---|---|
| **This project** | ✅ | ✅ 5 | ✅ | ⏳ | ⏳ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Bearable | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ? | ✅ | ❌ |
| Daylio | ~ | ~ | ❌ | ~ | ✅ | ✅ | ✅ PDF | ✅ | ✅ | **✅** |
| Exist.io | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ PDF | ❌ | ✅ | ❌ |
| Guava | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ? | ✅ | ❌ |
| CareClinic | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| MyTherapy | ~ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ? | ? | ❌ |
| CRUSE Control | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ QR | ? | ? | ❌ |
| MASK-air | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ? | ? | ❌ |
| Nomie 6 (dead) | ✅ | ✅ | ? | ❌ | ? | ? | ❌ | ✅ | ? | **✅** |
| Loop | ✅ | ~ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ CSV+SQLite | **✅** |
| HabitKit | ~ | ~ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ? | **✅** |
| Beaver Habits | ✅ | ~ | ❌ | ❌ (by design) | ❌ | ~ | ❌ | ✅ | ✅ API | **✅** |
| obsidian-tracker | ✅ | ✅ 6 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | it *is* your files | **✅** |
| Google Sheets | ✅ | ✅ | manual | manual | manual | ❌ | manual | ~ | ✅ | **✅** |

⏳ = on this project's roadmap, not shipped. Read the **Cond** column: one tick,
and it is this project's.

---

## 5. Deep dives — the five that actually compete

### 5.1 Nomie — the ghost that already ran this experiment

[nomie.app](https://nomie.app/) · MIT · [nomie6-oss](https://github.com/open-nomie/nomie6-oss)
583★, last real code commit 2023-10-21 · living fork
[dailynomie](https://github.com/dailynomie/nomie6-oss) 70★, pushed 2026-08-18

A local-first PWA where the user defines every "trackable", with numeric tags,
notes, people and context. No backend at all — browser PouchDB. Static hosting.
No Google, no OAuth, no server. It is, feature for feature and philosophy for
philosophy, the same product as this one with a different storage adapter.

**What it did better than this project.** Onboarding: deploy anywhere, zero
configuration, no Google Cloud console. A tracking syntax (`#mood(7)`) that made
logging faster than any form. And it actually reached scale — roughly 100,000
users across versions, per the author's own README quoted on
[HN](https://news.ycombinator.com/item?id=29934029).

**How it ended.** Shut down 1 February 2023 after eight years. Users were told to
export CSV or JSON before the deadline. The author's stated reason, verbatim from
the site today: *"Nomie has never been financially viable. Even with upgrade
options, Nomie 6 only brought in a total of $500 this year."*

**Why this matters more than any other single fact here.** The failure was not
technical, not a lack of polish, and not a lack of users. 100,000 people used it
and it made $500 a year. The code lives on as MIT source and a 70-star fork —
which is exactly the outcome this project should expect, and it is a fine
outcome, provided nobody planned on revenue.

### 5.2 Bearable — the product this one is actually competing with

[bearable.app](https://bearable.app) · closed source · Firebase, Frankfurt ·
**$6.99/month or $34.99/year USD** (frequently promoted at $18.99/year), free
tier generous but capped at **30-day history**

Built by someone with chronic migraine. Unlimited user-defined symptoms,
emotions, health measurements, "factors", medications and custom experiments,
each with severity scales. Thirty-plus correlation reports. Apple Health, Google
Fit and Fitbit sync. Doctor-ready reports. GDPR compliance claim, explicit "never
sold". 4.7★ iOS / 4.6★ Play.

**What it does better.** Everything except conditional questions and data
custody. Native apps on both stores with working reminders. A real correlation
engine, shipped, not planned. Health-platform integration this project can never
have from a browser. Multilingual. A funded team.

**Where it bleeds, from its own reviews** ([App Store](https://apps.apple.com/us/app/id1482581097?see-all=reviews)):

> *"This app causes me more anxiety just to use it. It requires me to fill out
> dozens and dozens of symptoms at different ra[tes]"* — 2★, titled **"Time
> consuming for little data feedback"**, from a two-year user tracking ~30
> medications a day

> *"Asked wayyyyy too many questions during check in. I'm already irritable from
> a new med, I am looking for something that takes less than 30 seconds from
> opening the app to closing it."* — 2★

> *"I was originally hoping for more meaningful insights. The correlations I got
> mostly confirmed things I already suspected"* — 3★, paying user of over a year

**Read those three together and you have the actual market gap** — and note that
it is not privacy. It is *entry cost per day*. This project's per-weekday
schedules and `depends_on` follow-ups are precisely the mechanism that fixes the
first two complaints. That is a real, defensible advantage over the category
leader, and it has nothing to do with spreadsheets.

**Four structural holes in the category leader, all verified.** These are the most
actionable facts in this document:

1. **English only** — and the developer has publicly replied to a French user that
   multi-language support *"would require rebuilding the entire application"*.
   Bearable is not adding French soon.
2. **No PDF doctor report.** It is still an open item on
   [Bearable's public roadmap](https://changemap.co/bearable-/bearable-roadmap/task/4070-pdf-export/)
   — despite the entire product being positioned around medical appointments.
   This project already ships one.
3. **Single device only.** Per their own support page: *"Currently, no… designed
   to work and sync seamlessly on one device"*
   ([support](https://bearable.app/support/common-questions/can-i-use-bearable-on-multiple-devices/)).
   A spreadsheet in Drive syncs across devices for free.
4. **The privacy story has a gap.** The vendor pledge is strong (never sell,
   GDPR, EU-Frankfurt Firestore) — but its **Apple privacy label declares contact
   info and identifiers "Used to Track You"** across other apps, and the policy
   names the Facebook SDK, Segment, Mixpanel and Google Analytics. Not
   data-selling; not the airtight story Daylio or this project can tell.

Taken together, holes 1–3 describe a gap this project *already occupies by
accident*: a French-language, multi-device, doctor-report-producing symptom
tracker with adaptive forms. That is the strongest strategic finding here — and
§9 Option C is revised in light of it.

### 5.3 Daylio — the direct refutation of the privacy pitch

[daylio.net](https://daylio.net/) · closed · Relaxio s.r.o. (Slovakia) · free +
IAP $4.99–$59.99 · 20M+ users, 4.8★ / 61,000 ratings

From its own homepage: *"Data stored in the app's private directories is not
accessible by any other apps or processes"* and *"We don't send your data to our
servers so we don't have the access to your entries."* Backups go to the user's
own Google Drive or iCloud over encrypted channels. Export is **PDF and CSV**.
Correlation statistics between mood and activities. Customisable moods and
activities. Works offline. PIN/FaceID lock.

**Why this is the hardest fact in the document.** Daylio makes essentially this
project's privacy claim, with 20 million users, native apps on both stores,
working reminders, a polished onboarding with strong opinionated defaults, PDF
export, and no Google Cloud console. "Your data does not go to our servers" is
not a differentiator. It is the incumbent's marketing copy.

Daylio's own weak points are real but narrow: reviewers report **history
paywalled** (*"Just found out after 1 month of daily tracking, that I CANNOT SEE
MY DATA... I was using this data for MEDICAL TRACKING"* — 2★) and **data loss**
(*"MONTHS OF DATA RANDOMLY LOST ??????? I closed my app out once and everything
is GONE."* — 1★), plus a retracted lifetime tier
([r/Daylio](https://www.reddit.com/r/Daylio/comments/1qgzvl2/lifetime_subscription_problem/)).
A spreadsheet you can open in a browser is immune to all three. That is a
genuine argument — it is just a narrower one than "privacy".

### 5.4 The free, pharma-funded, clinically-endorsed condition apps

[CRUSE® Control](https://cruse-control.com/) — free, no IAP, 26 languages,
GA²LEN e.V. (Berlin), Novartis/Sanofi/OLPHA/Faes Farma, doctor report by QR,
27,000+ downloads, **v1.0.114 released 2026-09-01**.
[MASK-air](http://www.mask-air.com/) — free, **available in French**, ARIA
allergy diary led by Prof. Jean Bousquet, daily symptom + treatment + QoL
questionnaire, transfers results to your healthcare provider.
[MyTherapy](https://www.mytherapyapp.com/) — *"always has been and always will
remain free"*, ~12M users, medications + measurements + symptoms + mood, one-time
share code for a doctor, European (smartpatient GmbH, Munich).

**What they do better.** They are free, and free forever, because pharma pays.
They carry clinical endorsement this project cannot buy. They are already
localised. MASK-air already speaks French. They compute validated instruments
(UAS7, UCT and equivalents) that a GP or dermatologist recognises, which a
bespoke 0–3 scale in a spreadsheet does not.

**Where they lose.** They are single-condition and fixed-taxonomy. Neither lets
you track your child's mood next to your own sleep next to your commute. Neither
has conditional follow-ups. And the funding model is exactly what a
privacy-motivated user objects to — though note that all three explicitly deny
selling identifiable data, and MyTherapy's copy is unusually direct about the
arrangement.

The narrow opening: CRUSE has no French. That is one afternoon of work for
CRUSE's team, so do not build a strategy on it.

### 5.5 The roll-your-own set — Google Sheets, Notion, Obsidian, Grist, paper

This is what the target user actually does today, and vendor comparisons never
list it.

**Google Sheets templates** are free, infinitely configurable, and already own
the user's data — this project's entire value-add over a bare template is a
mobile input form and computed statistics. The incumbents attack it well:
[HabitBox's own marketing](https://habitbox.app/blog/google-sheets-habit-tracker)
argues sheets fail on *"no automated reminders… the grid can't remind you at
9pm"*, four taps for a two-second action, no home-screen widget, abandoned after
two to three weeks. Every one of those criticisms applies to this project too,
except that the taps are fewer.

**Obsidian** ([obsidian-tracker](https://github.com/pyrochlore/obsidian-tracker),
MIT, 1,952★) has the widest field-type coverage of anything found anywhere:
number, boolean, text, tags, frontmatter and Dataview inline fields. Free, files
on your disk, no cloud. But the plugin has 217 open issues, Dataview has been
stale for ten months with 662 open issues and a 404 successor, and there is no
mobile-first input form.

**Grist** ([getgrist.com](https://www.getgrist.com/pricing/), Apache-2.0,
11,711★, self-host free) is the sleeper. It is a spreadsheet-database with real
column types, formulas, **forms**, a free cloud tier and a free self-hosted
edition. A determined technical user can build most of this project in Grist in
an afternoon and own the data outright.

**And the proof that the positioning can sell:**
[Tiller](https://www.tiller.com/pricing/) charges **$99/year USD** for
"bank feeds go directly into Google Sheets or Excel". It is a real, mature,
paying business built on exactly "your data lives in your own spreadsheet".
Nobody has built the Tiller of habit tracking. Whether that is an opportunity or
a verdict is section 8's problem — but note the asymmetry: Tiller's value is
*automated ingestion* of data the user could never type by hand. A habit tracker
has no data to ingest. The user types everything. Remove the automation and
Tiller is a template.

---

## 6. What users complain about

Themes below are ordered by how often they recurred in the material actually
retrieved. Reddit quotations came via an archive API; App Store quotations via
Apple's customer-review RSS, which gives no per-review permalink, so the app's
review page is cited.

**6.1 Entry cost exceeds insight payoff.** The dominant complaint, and the one
most useful to this project. See the three Bearable reviews in §5.2, plus:

> *"it's super complex and takes a lot of time to setup and then to do your check
> in two to three times a day"* — 3★, [Bearable](https://apps.apple.com/us/app/id1482581097?see-all=reviews)

> *"Great idea. Way too complicated to actually use."* — 1★, same

**This is the blank-page problem, observed in the wild, in the closest
competitor.** Bearable ships strong defaults and still loses users to setup
burden. A spreadsheet with thirteen configuration columns is not a mitigation of
that risk; it is a concentrated dose of it.

**6.2 Subscription fatigue, specifically retracted lifetime tiers.** The anger is
not about price, it is about being prevented from paying once:

> *"In October 2024, I paid for the lifetime premium subscription... Yesterday, it
> prompted me to renew my subscription and now I am back on the free version."*
> — [r/Daylio](https://www.reddit.com/r/Daylio/comments/1qgzvl2/lifetime_subscription_problem/)

> *"The thing is, I don't do subscriptions anymore."*
> — [r/Daylio](https://www.reddit.com/r/Daylio/comments/1nzfszc/will_the_app_team_offer_black_friday_options/)

> *"for an app you could just vibe code nowadays... I would need some uniquely
> valuable killer feature to pay for a glorified spreadsheet app"* — 3★,
> [Daylio](https://apps.apple.com/us/app/id1194023242?see-all=reviews)

That last one is worth reading twice: to a paying-customer segment, "it's a
spreadsheet" is the *criticism*, not the pitch.

**6.3 Data paywalled or lost.**

> *"Just found out after 1 month of daily tracking, that I CANNOT SEE MY DATA. My
> own records are locked behind a paywall... I was using this data for MEDICAL
> TRACKING"* — 2★, [Daylio](https://apps.apple.com/us/app/id1194023242?see-all=reviews)

> *"after using this app for two years i have a lot of customizations... all of the
> sudden i open the app this morning and they're all gone"* — 1★,
> [Bearable](https://apps.apple.com/us/app/id1482581097?see-all=reviews)

Also note: **Manage My Pain explicitly refuses CSV export** ("We currently do not
offer the ability to export your data to CSV or any other similar raw format").
This is the one complaint cluster this project answers unambiguously.

**6.4 Shutdowns and platform terminations, with dates.**

| What | When | What happened to the data |
|---|---|---|
| **Nomie 4/5/6** | **2023-02-01** | Users told to export CSV/JSON. Never financially viable; $500 revenue in final year |
| **Youper** | **closing 2026-09-30**, *"all remaining user data will be securely and permanently deleted"* **2026-10-01** | Raised **$3.5M** (Goodwater seed $3M, SEC Form D CIK 0001760426), claimed **3 million users**, 4.8★/15,429 iOS. Both listings already 404. [Notice](https://www.youper.ai/notice) |
| **Woebot** consumer app | **2025-06-30** | Retired; pivoted B2B |
| **MoodPanda** | date NOT VERIFIED | Domain is now a hypnosis-MP3 funnel (*"Mood Panda is now part of Health Nutrition"*); legacy paths HTTP 522; every store listing 404 |
| **K Health consumer app** | **2025-12-31** | Accounts closed, export tools provided. Pivot to enterprise |
| **Symple** | date NOT VERIFIED | Delisted from the App Store; developer page empty; domain fails TLS. **No shutdown notice, no export notice found — user-data fate unknown** |
| **Reporter App** | zombie since **2019-02-05** | Still sold at $3.99, never updated |
| **Moves** (→ Facebook 2014) | 2018 | `moves-app.com` serves *"Hello. tbh, We're Moving On"* |
| **TicTrac → Dialogue** | date NOT VERIFIED | Domain 301s to a B2B "virtual care for organizations" pitch. Consumer brand erased |
| **Google Fit APIs** | signups closed **2024-05-01**, APIs die **2026** | Migrate to Health Connect. Goals API has **no replacement** |
| **Fitbit legacy Web API** | **September 2026** | Deprecated by Google |
| **Cara Care** | Mahana 2024-03 → insolvency 2024-10 → **Bayer** 2024-12 | Survived, now Bayer's |
| **Dendron** | 2023 | *"we were ultimately not able to find product market fit for a venture backed business"*. Its wiki still shows no shutdown notice |

The honest reading: **the apps mostly do not die — the platform dependencies
die, and the consumer brand gets absorbed.** Six of seven self-tracking apps
checked are still alive years after being written off. What is terminated on a
schedule is the data plumbing, always by a platform owner, always by
announcement rather than negotiation. That is a real argument for owning your own
file in an open format — and note the irony plainly: the platform doing the
terminating in both 2026 cases is Google.

**6.5 Privacy, and one very recent flashpoint.** *"Period tracking app, Flo,
found to be selling user data to Meta"* — **396 points, 268 comments,
2026-04-28** ([HN 47932990](https://news.ycombinator.com/item?id=47932990)):

> *"it's literally impossible to tell what applications are trustworthy and what
> applications are not, or whether they'll remain trustworthy over time."*
> — [HN](https://news.ycombinator.com/item?id=47934567)

> *"lots of people dont know what HIPPA is, and... assume that a medical-related
> app on a curated app store would be safe for medical-related stuff."*
> — [HN](https://news.ycombinator.com/item?id=47933690)

And the trap, stated by someone scoping this exact product:

> *"I have actually been playing around with scoping a privacy first version of
> these tracking apps that store all the data locally... there's very little in
> the way of revenue generation there."*
> — [HN](https://news.ycombinator.com/item?id=47934393)

Ordinary users voice the suspicion unprompted, with no breach story: a Bearable
review is titled outright *"Easy to use, but privacy is a dealbreaker"*. So
privacy demand is real. What §5.3 shows is that it is already *supplied*, by
Daylio, HabitKit and Loop, without a Google Cloud console.

**6.6 Reminders that do not work.** Thin evidence, but present, and pointed at
exactly this project's weakest flank:

> *"notifications should be louder like a ring tone if my ph is in my purse or
> across the room"* — 1★, Bearable, from a patient on medication reminders

> *"the biggest annoyance being broken cross platform reminder between PC,
> Android, and iOS"* — 1★, [Habitica](https://apps.apple.com/us/app/id994882113?see-all=reviews)

Users complain when reminders are *unreliable*. This project has none.

**6.7 Abandonment.** The most articulate account found — with the caveat that its
HN story scored 3 points and 1 comment, so treat it as a hypothesis, not data:

> *"For those things I did naturally, the tracker wasn't needed and it was a silly
> extra step. For those things I wasn't doing, the tracker didn't motivate me, it
> was just one more step."* — [HN](https://news.ycombinator.com/item?id=45345054)

> *"I'd also forget to check things off, so it wasn't an accurate representation of
> reality."* — same

The one habit that commenter still tracks is the one he **automated** (a CarPlay
connection auto-checks it). If that generalises, manual tracking is structurally
doomed and passive capture is the only survivor — which a browser-only PWA cannot
do. **No retention statistics were found to confirm or refute this. That gap is
material.**

**6.8 Spreadsheets.** Sentiment ran *toward* spreadsheets, as an exit from
frustration — *"After playing around with it for an hour, I am more frustrated
than ever... I'll just create..."* (2★, Bearable) — but the sharpest observation
runs the other way:

> *"Of course it could have been done typing dates and notes into excel... but the
> chance that she (or most people) would consistently follow that workflow is
> nil."* — [HN](https://news.ycombinator.com/item?id=47936004)

**Not researched, and therefore unknown:** Mozilla *Privacy Not Included*
reports; FTC actions against Flo (2021), GoodRx and BetterHelp; Google Play
reviews; Trustpilot; clinician perspectives; retention numbers.

---

## 7. Market data

### 7.1 The habit-tracker "market size" reports are not usable

| Firm | Base | Forecast | CAGR |
|---|---|---|---|
| [Market Research Future](https://www.marketresearchfuture.com/reports/habit-tracker-app-market-66871) | $1.5bn (2024) | $3.0bn (2035) | 6.5% |
| [360 Research Reports](https://www.360researchreports.com/market-reports/habit-tracking-app-market-211454) | $1.32bn (2026) | $4.71bn (2035) | 15.2% |
| [Straits Research](https://straitsresearch.com/report/habit-tracking-apps-market) | $2.22bn (2026) | $6.41bn (2034) | 14.2% |
| [Business Research Insights](https://www.businessresearchinsights.com/market-reports/habit-tracking-apps-market-109438) | **$14.95bn (2026)** | $50.22bn (2035) | 14.4% |

An 11x spread, and no serious analyst (Grand View, IQVIA, Rock Health, CB
Insights) covers the category at all. The high figure is falsifiable:
[Sensor Tower](https://sensortower.com/blog/state-of-mobile-health-and-fitness-in-2025)
puts **all** Health & Fitness in-app-purchase revenue globally at *"past $4
billion"* in 2025. Habit tracking is a subgenre of that. A subgenre cannot be 3.7x
its parent. Treat these reports as evidence of search demand, not of a market.

### 7.2 The numbers that are real

**Category ceiling** ([Sensor Tower, verified]):
3.6bn Health & Fitness downloads in 2024 (+6% YoY); January 2025 IAP revenue
$385M (+10%, an all-time high); full-year 2025 IAP past $4bn; **US is over half
of global consumer spending**; the **Medical Tracking subgenre grew +43% YoY in
2024** — the fastest-growing relevant subgenre and the closest proxy to symptom
tracking.

**Unit economics** ([RevenueCat, *State of Subscription Apps 2026*](https://www.revenuecat.com/state-of-subscription-apps), n = 115,000+ apps):
Health & Fitness has the **best monetisation of any vertical** — revenue per
install $0.48 at D14, $0.66 at D60, ~6x Gaming. Download→trial 6.9%;
trial→paid 37.7%. 68% of subscriptions sold are annual, the highest annual mix of
any category. **Median annual price $39.94; median monthly price $9.99.**
And from the 2025 edition: **only 5% of health & fitness apps reach $10,000 in
total revenue within their first two years.**

**What a best-case indie actually earns.** HabitKit, one solo developer, closed
source, native iOS+Android, no server, local-only data
([2025 year in review](https://sebastianroehl.substack.com/p/2025-the-year-that-changed-everything)):
**$602,000 revenue in 2025**, $28,000 MRR, 25,100 active subscribers, 562,000
lifetime downloads. January alone $112,000 (New Year spike plus App Store
featuring). It took him **2.5 years to reach $10k MRR**. His second app,
FocusKit, made **$874 total** in its first two months.

Read those two paragraphs against §5.1. HabitKit is what top-percentile success
looks like: native apps, store distribution, opinionated defaults, no
configuration, no server, local data. Nomie is what this project's philosophy
looks like: $500 a year.

**Pricing norms (state these, not the analyst reports):**

- Monthly: **$4.99–$9.99 USD**, modal $9.99 · **€4.99–€9.99**
- Annual: **$29.99–$49.99 USD**, median $39.94 · **€29.99–€49.99**
- Lifetime, where offered: **$14.99–$119.99**; the credible band is $19.99–$59.99
- One-off paid-upfront is nearly extinct (Streaks $5.99 is the surviving example)
- Genuinely free: only OSS (Loop, OpenHabitTracker) or pharma/state-funded

### 7.3 France

**Mon espace santé** ([esante.gouv.fr](https://esante.gouv.fr/mon-espace-sante)):
the state personal health space, launched January 2022, **15 million activations
passed in October 2024**
([Assurance Maladie](https://www.assurance-maladie.ameli.fr/presse/2024-10-07-cp-mon-espace-sante-15-millions-activations)),
with automatic profile creation having given ~98% of the population a profile by
July 2022. It includes **a state-referenced app catalogue**, open to third parties
since November 2022, gated on conformity with the *doctrine du numérique en
santé* (interoperability, security, ethics — reportedly 150+ criteria).
Referenced apps include Elfie, Withings, Vidal Ma Santé, Kwit, Mapatho.

This is simultaneously the largest French distribution channel and the largest
French competitive threat. A static client-side app storing health data in a
user's personal Google Drive would very likely struggle to satisfy the doctrine's
hosting and identity expectations — **that inference is unverified and would need
checking with ANS before anyone builds a plan on it.**

Also state-run and free: **Asthm'Activ** (Assurance Maladie + Asthme & Allergies
— four-week daily asthma log, control score, medication reminders, inhaler
technique), **sophia** (nurse coaching for ALD patients), **mesvaccins.net**.

**Reimbursement (PECAN)**, for completeness: **€435 TTC** for the first three
months then **€38.30/month TTC**, capped at **€780 TTC per patient per year**, for
**one year, non-renewable**. It requires CE medical-device status plus a
favourable HAS opinion. **Categorically unavailable to a wellness tracker** — do
not plan around it.

**French market size: NOT VERIFIED.** No figure obtained for French digital-health
app spending. Note the demand-side implication of §7.2 though: the US is over
half of global consumer spending in this category, which means a French-first
product is deliberately addressing the wrong half of the market.

---

## 8. Gap analysis

**Genuinely unoccupied, verified across all six categories:**

1. **Conditional / follow-up questions. Nobody has this. Not one product.** Not
   Bearable, not Exist.io, not Daylio, not any of the 1,368 GitHub repositories,
   not obsidian-tracker. The only adjacent thing is a symptom *checker* (Ada,
   ex-K Health), where branching against a medical knowledge graph is the entire
   product rather than a diary feature. This project already ships it.
2. **Multi-metric goals — partly occupied, so claim this carefully.** Verified in
   exactly two products: **Moodfit** (one-time pricing, no subscription) and
   **[Perfice](https://github.com/p0lloc/perfice)** (MIT, 465★), whose docs say
   *"Goals… supports multiple trackables"*. Nowhere else in six categories. Still
   a gap, but not a vacuum.
3. **Correlations outside a subscription — narrower than it looks.** Bearable
   ($34.99/yr) and Exist.io ($62.90/yr) paywall it; Daylio has a weak version.
   But **Perfice ships automatic correlations for free** (*"Mood is better when
   you sleep longer"*), and **eMoods lets you plot any tracking point against any
   other for $9.99/yr**. So the honest claim is "correlations are underpriced by
   two obscure products and overpriced by two famous ones", not "nobody does it".
4. **A habit/metric tracker in `awesome-selfhosted`.** Neither the *Health and
   Fitness* nor the *Personal Dashboards* section contains one. That is free
   distribution to precisely this project's audience, lying unclaimed.
5. **Spreadsheet-backed tracking as a product.** A GitHub API search for habit
   trackers using Google Sheets returns 19★, 5★, 3★, 1★, 1★, 1★ — templates and
   Telegram bots. The nearest shipped thing is
   [duit-log](https://github.com/dannycahyo/duit-log) (58★, MIT), an expense
   tracker whose *data* is in the sheet but whose field definitions live in
   `constants.ts`, and whose onboarding needs a GCP project and a service-account
   JSON. **Nobody has put the metric definitions in the user's sheet.**
   [SheetApps](https://sheetapps.dev) does derive schema from a user's sheet
   ("All data stays in your Google Drive") but is a generic app builder, not a
   tracker.

**Which gaps this project is unusually well placed to fill.** Only 1, 2 and 4.
Gap 1 is the strongest thing about this codebase and it is not what the README
leads with. Gap 4 is a pull request to a list.

**Which gaps are traps.**

Gap 5 is a trap. It is empty for a reason, and the reason is visible in the
Tiller comparison: Tiller sells $99/year of *automated ingestion* into your
sheet — value the user could not create by hand. A habit tracker ingests nothing;
the user types every value. Strip the automation from Tiller and you have a
template, which is what all six of those GitHub repos are. The lane is empty
because there is no toll to charge in it.

Gap 3 is a trap for a different reason. See §10: correlating self-reported
symptoms against medication is the one feature that materially raises EU MDR and
FDA exposure.

**And the gaps that are not gaps.** Privacy: supplied by Daylio, HabitKit, Loop,
Beaver Habits, Obsidian and paper. Data export: supplied by almost everyone
(Daylio PDF+CSV, Loop CSV+SQLite, Bearable CSV). A doctor-facing report: supplied
by Guava (free), MyTherapy (free), CRUSE (free), MASK-air (free), eMoods (free),
mySymptoms, Manage My Pain, Bearable, Exist.io. **The printable summary for your
doctor is not a differentiator; it is table stakes, and the free tier of four
competitors has it.**

---

## 9. Differentiator options

### Option A — "The tracker whose questions change with your answers"

**Who for:** people whose tracking has conditional structure — chronic
intermittent conditions, parents tracking children, anyone whose evening form
currently asks eleven irrelevant questions.

**Why this project can own it:** it already ships `depends_on`, chained,
cycle-safe, ignoring its own schedule; plus per-weekday schedules and quick-add
for rare events. **Nothing else in the market has this.** It directly answers the
most-repeated complaint about the category leader (§5.2: *"way too many questions
during check in"*, *"time consuming for little data feedback"*).

**Cost to get there:** mostly repositioning, not building. Rewrite the README so
the lead is "the form is short because it adapts", not "your data is in your
spreadsheet". Ship a `depends_on`-heavy default configuration. Screenshots.
Maybe two weeks.

**Why it might fail:** conditional forms are a *feature*, and features get
copied. Bearable could add branching in a sprint. And the feature is invisible
in a store listing — you cannot screenshot a question that did not get asked.
This is the strongest option and it is still fragile.

### Option B — "The tracker that outlives its author"

**Who for:** people who have been burned. Nomie's users. Symple's users, whose
data fate is unknown. Anyone in the Flo thread.

**Why this project can own it:** MIT-licensed, static files, no server, data in a
plain spreadsheet in the user's own Drive, readable with no software at all. If
the author disappears tomorrow, every user still has a working app and a legible
file. Nomie's shutdown is a citable, dated case study and this architecture is
the answer to it.

**Cost:** near zero in code; it is a positioning and documentation exercise. Add
a "what happens when I stop maintaining this" page, publish a versioned data
format spec, and get into `awesome-selfhosted`.

**Why it might fail:** the addressable audience is people who have already
survived a tracker shutdown — a tiny, technical, non-paying segment. And Daylio
answers 80% of the same anxiety with a CSV export and 20 million users of social
proof. Also, honestly: an unfunded solo project promising longevity is a claim
about architecture, not about the author, and users will not distinguish.

### Option C — "The French adaptive symptom diary" (revised upward)

**Who for:** French-speaking people tracking a multi-factor chronic condition who
looked at Bearable and bounced off the language or the daily entry cost.

**Why this is stronger than it first appears.** French localisation is the single
clearest gap in the mood/symptom field. **French is absent from Bearable, Finch,
Reflectly, Pixels, How We Feel, Exist.io, Moodfit, Wysa, MindDoc, Welltory, and
every open-source project checked.** And Bearable's developer has publicly said
multi-language *"would require rebuilding the entire application"* — so the
feature leader is structurally blocked, not merely slow. Stack that on Bearable's
missing PDF report and single-device limitation (§5.2) and this project holds
three advantages over the category leader in the French market without building
anything, and a fourth for a few hours' work.

> **Note added after this study was written.** The printable and CSV doctor
> export existed when the research was done, and was **deliberately removed** on
> the owner's instruction the same day: it had been built from an example in the
> original design document rather than from a real need of his own. The code is
> in the git history and the underlying data — a tagged, dated chronology of
> symptom events with intensity and presumed cause — is untouched, so restoring
> it is a few hours, not a rewrite.
>
> This matters for the decision rather than against it. The export was removed
> because it was useless *to its author*, which is precisely the signal that it
> only ever had value as a **product** feature for other people. If Option C is
> pursued, the export is not a nice-to-have to schedule later: it is the single
> feature the positioning rests on, and the reason to build it would be evidence
> from the discovery interviews, not a guess in a design document.

**Cost to get there:** for the French market, restoring the doctor export. The
app is already French, so the rest of the work is discovery, not development.

**Why it still might fail, and this is the real objection.** French is not a
moat, it is a delay. More importantly, **French-speaking incumbents already
exist**: Daylio is fully French (34 languages, 20M users, PDF+CSV export, local
data), Stoic is French, and **eMoods is French, offline, device-only, and emails
a password-protected PDF to your doctor for $9.99/year** — which is the entire
Option C value proposition, shipped, at one sixth of Reflectly's price. On the
condition-specific side, MASK-air is free and already in fr-FR/BE/CA/CH,
MyTherapy is free and European, Asthm'Activ is free from the Assurance Maladie,
and Guava is free in 20+ languages with a printable doctor summary. So the honest
framing is not "French is empty" but "French is empty *at Bearable's feature
level*" — a much smaller, harder-to-find audience. **Upgraded from "discard" to
"the thing weekend 1 should actually test".**

### Option D — "Bring your own spreadsheet"

**Who for:** the analytically-minded who already keep a sheet and want a phone
form on top.

**Why this project can nearly own it:** the config *is* a sheet, and no shipped
tracker does this.

**Why it fails, and this is the important one.** Three independent reasons.
(a) The `drive.file` scope means the app can only see files it created — a
hand-made sheet returns 404, documented in this repo's own troubleshooting table.
So the promise is "bring your own spreadsheet" but the reality is "accept ours,
in your Drive". Fixing that needs the Google Picker, which is real work.
(b) The empty lane is empty because there is no toll (see §8). (c) The audience
that wants this already has Grist, self-hosted, Apache-2.0, with real column
types and forms.

### Option E — "Do nothing. Keep it personal."

**Who for:** the author.

**Why:** the project already does its job. Every hour spent on onboarding funnels,
store listings, i18n, a push server and a privacy policy is an hour not spent on
correlations, per-metric detail views, or the goals feature that would actually
make the tool better for the person using it. The measured outcome of the
alternative is $500 a year.

**Why it might "fail":** it forecloses the small but real chance that Option A
finds an audience. Mitigated by §11's experiment, which costs a weekend.

---

## 10. Regulatory and privacy considerations

Practical, and less alarming than expected. Sources are primary; §3 of this
section is analysis, not legal advice.

**GDPR — who is the controller.** For a static client-side app with no backend
and no analytics, writing only to the user's own Drive under the user's own OAuth
grant, **the publisher is very likely not a controller of the tracking data** —
it never receives, stores or can access it, and supplying software does not by
itself make you a controller
([EDPB Guidelines 07/2020](https://www.edpb.europa.eu/system/files/documents/2023-10/EDPB_guidelines_202007_controllerprocessor_final_en.pdf)).
The user's own logging is probably outside the GDPR entirely under
[Art 2(2)(c)](https://gdpr-info.eu/art-2-gdpr/) — *"purely personal or household
activity"*. Google is controller/processor for the Drive storage, in its own
relationship with the user. **This is the single strongest structural property of
the design, and it is real.**

**A privacy policy is still required** — not primarily by law but by contract:
Google's OAuth brand verification requires a privacy policy hosted on the
verified domain and linked from both the homepage and the consent screen
([Google Cloud](https://support.google.com/cloud/answer/13464321)). The correct
policy is a short, truthful one saying the publisher receives nothing.

**Health data.** Symptom and medication logs are Article 9 special-category data
on the face of [Recital 35](https://gdpr-info.eu/recitals/no-35/) — *"all data
pertaining to the health status of a data subject… independent of its source"*.
[CNIL](https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante) adds that data
can become health data by cross-referencing (weight plus step count) or by
intended use. Habit data alone (did I floss) is not; the moment a symptom field
ships, assume Art 9. Practically, most of the resulting duty lands on the
controller — which, per above, is the user and Google, not the publisher.

**EU MDR — where the line sits.** [MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en?filename=mdcg_2019_11_en.pdf)
(read directly for this document) gives a decision tree. **Step 3:** software is
out of scope unless it *"does perform an action on data, or performs an action
beyond storage, archival, communication, simple search, lossless compression"*.
**Step 4:** *"is the action for the benefit of individual patients?"* And the
exclusion, verbatim: *"software only intended for non-medical purposes… such as
invoicing, staff planning, e-mailing… and back-up, wellness or fitness apps, do
not qualify as MDSW."* MDR Recital 19 says the same. **Qualification turns on the
manufacturer's declared intended purpose, not on risk** — which means marketing
copy can create a medical device out of unchanged code.

**The cliff edge.** There is no cheap middle ground. Rule 11(a) classifies
*"software intended to provide information which is used to take decisions with
diagnosis or therapeutic purposes"* as **Class IIa**, and MDCG notes 11(a) *"is
generally applicable to all MDSW"*. Class IIa means a notified body. So the
choice is binary: stay a wellness product entirely outside the MDR, or budget for
certification. Lyv Endo raised €2.6M to do exactly that for one condition.

**FDA — note the dates.** Both relevant guidances were **reissued in January
2026**: [General Wellness](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/general-wellness-policy-low-risk-devices)
on 2026-01-06 and
[Clinical Decision Support](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software)
on 2026-01-29. The new General Wellness text is unusually favourable — it
expressly permits displaying *"values, ranges, trends, baselines, or longitudinal
summaries"* and contextualising them against sleep, activity, stress or recovery,
and expressly permits telling a user that *"evaluation by a healthcare
professional may be helpful"*, provided the notification does not name a disease,
call anything abnormal, include clinical thresholds, or constitute ongoing
disease monitoring. Its disqualifiers are equally explicit: references to
specific diseases or diagnostic thresholds; *"alerts, alarms, or prompts that
recommend or require specific clinical action"*; *"treatment guidance"*; claims of
clinical grade. **And labelling is in scope — the landing page is a regulatory
surface.**

One trap worth naming: the non-device *Clinical Decision Support* exclusion
requires a **healthcare-professional recipient** in two of its four criteria. A
consumer app cannot use it. Its only FDA shelter is General Wellness.

**The four concrete features, assessed:**

| Feature | EU MDR | FDA | Verdict |
|---|---|---|---|
| **(a) Multi-metric goals** | Not a medical purpose; Recital 19 excludes lifestyle software | Squarely inside permitted claim areas (fitness, sleep); trends explicitly allowed | **Safe.** Unless goals are set against clinical thresholds ("keep BP under 130/80") |
| **(b) Correlations between symptoms and medication** | Passes step 3 the moment you compute; qualification then rests entirely on intended purpose, and symptoms × medication *is* medical information | Jan-2026 permission covers *wellness-domain* contextualisation. **Medication is not a wellness domain.** Edges toward "treatment guidance" | **The one to worry about.** Do not ship without counsel. Lower-risk design: correlate arbitrary *user-defined* metrics, with no medication database, no dosage field and no drug-specific logic anywhere in the code |
| **(c) A printable summary for the doctor** | Close to "storage, archival, communication" under step 3 | Facilitating an HCP conversation is expressly contemplated | **Safe as a raw export.** *Not* safe with an interpretation or "what this means" section. Dates and user-entered values only |
| **(d) Any "you should…" advice** | Textbook Rule 11(a) → Class IIa | Verbatim disqualifiers 2 and 3 | **Never ship it.** This is the bright line, and it is the clearest answer of the four. "You're on a 5-day streak" is fine; "your symptoms worsened, consider adjusting your dose" is a medical device |

**Google OAuth — the good news, and the correction.** This project's onboarding
document describes a fifteen-minute Google Cloud console procedure per user,
Testing mode, a 100-test-user cap and an *"app is not verified"* warning screen.
**Most of that is avoidable, and this is the highest-leverage finding in the
document.**

`https://www.googleapis.com/auth/drive.file` is classified **non-sensitive** by
Google, described as *"View and manage Drive files and folders that you open or
create with an app"*
([Google](https://support.google.com/cloud/answer/13807380)). Google's own docs
define an unverified app as *"an app… that requests a sensitive or restricted
OAuth scope, but hasn't gone through the Google verification process"*
([Google](https://support.google.com/cloud/answer/7454865)), and the
sensitive/restricted verification and CASA security-assessment regimes apply to
those tiers, not to non-sensitive scopes. So: **publish one OAuth client owned by
the project, in Production, with only `drive.file`, and every user's onboarding
collapses to a single Google sign-in** — no console, no cap, no warning screen.
What remains is brand verification: a homepage on a verified domain, a privacy
policy on that domain, and domain ownership proved via Search Console, typically
2–3 business days.

**Two honest caveats.** Google's own pages are inconsistent on whether the
100-user cap attaches to Testing status or to verification status — one support
page implies the latter. Verify by actually publishing before betting on it. And
the `spreadsheets` scope classification was **not verified**; the Sheets API can
operate on a spreadsheet the app created under `drive.file` alone, so check
whether the broader scope is needed at all.

**One consequence to keep.** `drive.file` is also why a hand-made sheet returns
404. That is not a bug to fix with a wider scope — a wider scope is *restricted*
and triggers CASA plus annual reassessment. Use the Google Picker if
bring-your-own-sheet ever matters.

---

## 11. Recommendation

### The answer

**No. Do not productise this.** Keep it personal, publish it as-is, and take the
two cheap actions in the experiment below. The evidence is not close:

- The same product with the same philosophy and **100,000 users made $500 in its
  final year** and shut down (Nomie, 2023-02-01).
- **Only 5% of health & fitness apps reach $10,000 in total revenue in their
  first two years** (RevenueCat). The top-percentile solo outcome — HabitKit,
  $602k in 2025 — was achieved with native apps, store distribution, zero
  configurability and no server, i.e. by doing the opposite of this project on
  every axis except data locality.
- The privacy differentiator is already occupied by a 20-million-user incumbent
  (Daylio) that makes the same claim with better onboarding.
- The original health use case is already served, free and in French, by
  MASK-air, MyTherapy, Asthm'Activ and Guava, funded by pharma and the French
  state.
- The one feature that is genuinely unique — conditional follow-up questions — is
  a feature, not a moat, and is invisible in a store listing.

### The realistic ceiling, stated plainly

For a solo, unfunded, French-first, open-source PWA with no push notifications
and no App Store presence: **a few hundred GitHub stars, low hundreds of users,
and zero revenue.** For calibration, the GitHub `habit-tracker` topic holds 1,368
repositories; the tenth-most-starred has 200 stars, Nomie's own repository has
583, and its living fork has 70. A very good outcome here is Beaver Habits: 1,834
stars, BSD-3, and a $9.90 lifetime tier on a hosted version. That is the honest
upper bound, and it is a perfectly respectable one to aim at — as a hobby.

### Taking "do nothing" seriously

It is the right answer, and it is not a defeat. The project already solves the
author's problem better than anything purchasable, because it was shaped around
one person's actual questions. Productising means adding the things that make
tools worse for their author: opinionated defaults that override your
configuration, an onboarding funnel, i18n, a support inbox, a privacy policy, a
push server, and — worst — a reason to say no to the next idiosyncratic feature
you personally want. The roadmap's *"Explicitly not planned"* section is the best
document in this repository. Keep it.

Two contradictions to resolve while you are here. First, the roadmap rules out
reminders and push notifications ("they need a server and a push service") while
the current work plan has reminders coming next. The roadmap is right: on iOS,
Web Push works only for home-screen-installed web apps from 16.4
([WebKit](https://webkit.org/blog/13878/)), there is no `beforeinstallprompt`
equivalent so installation is a manual Share-sheet step with no prompt API, and
**there is no way to schedule a local notification** — every reminder needs a
server push. A serverless reminder is not a small engineering problem; it is
impossible on half the devices. Ship reminders as an in-app nudge and say so, or
accept a server and lose the architectural claim. Second, "bring your own
spreadsheet" and the `drive.file` scope are in tension; pick one story.

### The smallest experiment worth running

Two weekends, in this order. Stop after the first if it fails.

**Weekend 1 — test Options A and C together, for free, without building
anything.** Reposition the README around two claims and only two: *the form
adapts to your answers* and *it is in French and prints a report for your
doctor*. Take real screenshots (the project has none). Publish with **one
project-owned OAuth client in Production on `drive.file`** so onboarding is a
single Google sign-in. Then post in four places — a pull request adding it to
`awesome-selfhosted` under *Health and Fitness* (a section that currently has no
habit tracker), a Show HN, `r/QuantifiedSelf`, and **one French patient community
for a chronic condition** (this last one is the actual experiment: it is the only
place where all four of Bearable's holes bite at once). Cost: a weekend and a
domain name.

**The kill criterion, decided in advance.** If, six weeks later, fewer than five
strangers have connected their own spreadsheet, or the GitHub issues contain no
question that begins "can I make it ask…", then both theses are wrong and Option
E is the answer. Do not run weekend 2.

**One thing to read before weekend 1, not after:**
[Perfice](https://github.com/p0lloc/perfice) — MIT, 465★, local-first, "track
anything", multi-trackable goals and automatic correlations already shipped. It
is the nearest open-source relative of what this project wants to become, and it
will either save weeks of design or tell you the idea is already served.

**Weekend 2 — only if weekend 1 passed.** Ship the goals feature and correlations
with honest small-sample refusal, and ask the five strangers what they would pay
for. If the answer is "nothing", believe them: that is what Nomie's 100,000 users
said.

**Do not, under any circumstances,** begin with i18n, an App Store presence, a
REST backend, or a hosted multi-user service. Those are the costs of a business
that the evidence says will not exist.
