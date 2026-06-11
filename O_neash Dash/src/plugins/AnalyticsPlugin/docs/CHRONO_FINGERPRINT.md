# Chrono-Fingerprint
### Planner Analytics — Analytic #1

---

## Overview

Maps task completion behavior onto a 24-hour circular domain, fits a statistical density model, and extracts the user's true cognitive rhythm. Enriched with arc attribution and session/event context.

---

## Data Sources

### Core
| Field | Table | Notes |
|---|---|---|
| `actual_completed_at` | `nodes` | Timestamp of each completed task. Filter: `is_completed = 1` |
| `arc_id` | `nodes` | Links completion to an arc for per-arc fingerprints |

### Session enrichment
| Field | Table | Notes |
|---|---|---|
| `actual_start` | `work_sessions` | Session start timestamp |
| `actual_end` | `work_sessions` | Session end timestamp (null if active) |

### Event enrichment
| Field | Table | Notes |
|---|---|---|
| `planned_start_at` | `nodes` | Event start time. Filter: `node_type = 'event'` |
| `estimated_duration_minutes` | `nodes` | Event duration, used to compute end time |

### Lookups
| Field | Table | Notes |
|---|---|---|
| `color_hex`, `name` | `arcs` | Arc colors and labels for multi-curve rendering |

**Time window**: rolling 90 days from today.

---

## Data Processing Pipeline

### Step 1 — Extract circular coordinates
For each `actual_completed_at` timestamp:
```
hour_decimal = hours + minutes/60 + seconds/3600   ∈ [0, 24)
θ = (hour_decimal / 24) × 2π                       ∈ [0, 2π)
```
Store as `(θ, arc_id, timestamp)` tuples.

### Step 2 — Session membership tagging
For each completion, check if its timestamp falls inside any session window:
```
in_session = any(session.actual_start ≤ actual_completed_at ≤ session.actual_end)
```
Tag each completion as `in_session: boolean`.

### Step 3 — Event fragmentation map (per day)
For each day in the window:
1. Collect all events: `(planned_start_at, planned_start_at + estimated_duration_minutes)`
2. Compute free blocks: gaps between events (and before first / after last)
3. Classify day as: `event_free`, `morning_event` (event ends before 12:00), `afternoon_event`, `heavy` (≥3 events)

---

## Mathematical Model

### Von Mises Kernel Density Estimation

Time-of-day is **circular** — 23:50 and 00:10 are 20 minutes apart. A standard histogram or Gaussian KDE treats them as maximally distant. The von Mises distribution is the correct tool: the circular analogue of the Gaussian.

**Von Mises kernel:**
```
K_κ(θ) = exp(κ · cos(θ)) / (2π · I₀(κ))
```
where `I₀(κ)` is the modified Bessel function of order 0.

**KDE estimate at angle θ:**
```
f̂(θ) = (1/n) × Σᵢ K_κ(θ − θᵢ)
       = (1/n) × Σᵢ exp(κ · cos(θ − θᵢ)) / (2π · I₀(κ))
```

**Bandwidth selection (κ)** using Silverman's rule adapted for circular data:
```
κ = 1 / (σ̂² · (4/3n)^(2/5))
```
where `σ̂²` is the sample circular variance:
```
R̄ = |mean(exp(i·θⱼ))|     (mean resultant length)
σ̂² = 1 − R̄
```

Evaluate `f̂(θ)` at 360 evenly spaced angles `[0, 2π)`.

---

### Peak Detection
1. Find all local maxima in `f̂(θ)` where `f̂(θ-ε) < f̂(θ) > f̂(θ+ε)`
2. Primary peak: global maximum → `μ_primary`
3. Secondary peaks: local maxima ≥ 55% of primary height
4. Convert `μ` back to hour: `hour = (μ / 2π) × 24`

---

### Concentration Index
```
C = R̄ = |mean(exp(i·θⱼ))|     ∈ [0, 1]
```

| C | Label | Meaning |
|---|---|---|
| > 0.75 | Razor-sharp | One critical window — protect it |
| 0.4 – 0.75 | Focused | Reliable window with flexibility |
| < 0.4 | Diffuse | Output is spread across the day |

---

### Arc Enrichment — Per-Arc Fingerprints
Run the full KDE pipeline independently per arc. Produces per-arc `μ` and `C`.

**Arc rhythm divergence** between arc A and arc B:
```
D(A, B) = 1 − cos(μ_A − μ_B)     ∈ [0, 2]
D_norm  = D / 2                    ∈ [0, 1]
```

| D_norm | Interpretation |
|---|---|
| > 0.6 | Arcs occupy distinct time zones — natural context-switching |
| < 0.2 | Arcs compete for the same window |

---

### Session Alignment Score
Fit two KDEs: `f̂_in(θ)` for in-session completions, `f̂_out(θ)` for out-of-session completions.

**Overlap coefficient (Weitzman's OVL):**
```
OVL = ∫ min(f̂_in(θ), f̂_out(θ)) dθ
```
Approximated numerically over 360 evaluation points.

| OVL | Interpretation |
|---|---|
| > 0.7 | Sessions well-aligned with natural rhythm |
| 0.4 – 0.7 | Partial alignment |
| < 0.4 | Sessions misaligned — reschedule toward μ_primary |

**Session start fingerprint**: separate KDE on `actual_start` timestamps. Answers "when do you begin working?" vs "when do you actually complete things?"

---

### Event Displacement Effect
Compare `μ_primary` across day types:
```
Δμ = μ_primary(morning_event_days) − μ_primary(event_free_days)
```
Convert angular difference to hours. Flag as significant if `|Δμ| > 1.5h`.

**Pre/post event burst detection**: bin completions into 90-minute windows relative to each event boundary. Compare to baseline density on event-free days:
```
burst_ratio = density_near_event / density_baseline
```
- `burst_ratio > 1.5`: significant burst (deadline pressure or cleared-head effect)

---

## Temporal Drift Detection
Compare `μ_primary` between the most recent 30 days and the 30 days before:
```
drift_hours = ((μ_recent − μ_prior) / 2π) × 24
```
Wrap to `[-12, 12]` range. Flag if `|drift_hours| > 1.5`.

---

## Visualization

### Primary: 24-Hour Polar Chart
- **Outer ring**: raw completion counts as bar segments (24 segments, one per hour), colored by dominant arc for that hour
- **Inner curve**: smooth von Mises KDE curve overlaid
- **Peak markers**: labeled spokes at detected peaks, annotated with hour + C score
- **Primary peak**: glows in teal (`#00c4a7`)
- **Secondary peaks**: dimmer, labeled but not glowing

### Arc Overlay Mode
- Each arc's KDE curve rendered in its `color_hex` at 60% opacity
- Primary (all-arc) fingerprint at 100% opacity
- Arc peak markers as colored dots on the circle edge

### Session Split Mode
- `in_session` KDE: solid teal line
- `out_of_session` KDE: dashed white line at 50% opacity
- OVL score shown as a numeric badge

### Event Impact Panel (below main chart)
- Two mini polar bars side-by-side: event-free days vs morning-event days
- Arrow annotating the `Δμ` shift in hours

---

## Insight Text Generation

### Primary
```
"Primary window: {HH:MM}–{HH:MM} · C={X} · {label}.
 {if secondary peak}: Secondary window at {HH:MM} (C={X}).
 {if drift > 1.5h}: Peak has shifted {N}h {earlier/later} vs last month."
```

### Session
```
"{OVL > 0.7}: Sessions are well-aligned with your natural rhythm.
 {OVL < 0.4}: Most completions happen outside sessions —
              consider shifting session starts to {μ_primary_hour}."
```

### Event displacement
```
"{|Δμ| > 1.5h}: Morning events shift your peak {N}h later and reduce
                concentration from C={X} to C={Y}.
                Consider blocking mornings."
```

### Arc divergence
```
"{D_norm > 0.6}: {Arc A} and {Arc B} occupy distinct time zones —
                 you naturally context-switch by arc.
 {D_norm < 0.2}: {Arc A} and {Arc B} compete for the same window —
                 consider separating them."
```

### Final insight
Synthesizes all of the above into 2 sentences, flagging the single most actionable finding.

---

## Implementation Notes

- All circular math uses the complex exponential form `exp(iθ)` for numerical stability
- Bessel function `I₀(κ)` computed via polynomial approximation (Abramowitz & Stegun 9.8.1) — no external ML library needed
- KDE evaluated at 360 points; interpolate to find exact peak angles
- Minimum data threshold: **15 completions** to render chart (show "not enough data" otherwise)
- Arc sub-fingerprints require **≥ 8 completions per arc** to render
- Session split requires **≥ 5 completions in each population** to render OVL
