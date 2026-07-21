# Simulation Model

This document describes the model implemented in `index.html`. It is intended to make the application's outputs reproducible and its assumptions reviewable.

## Purpose and scope

The simulation estimates content collisions under two synthetic exposure distributions:

- a **rank-weighted distribution**, presented in the UI as the Personalized Algo (SRA v1); and
- a **uniform parent-title distribution**, presented as the Totally Random Algo.

It is a scenario-exploration tool. It does not ingest production data, reproduce a complete recommender, model a particular user, or calculate a theoretical guarantee.

## Notation

| Symbol | Meaning |
| --- | --- |
| `T` | Total parent titles entered in the catalog table |
| `M_total` | Total exact Shorts in the catalog |
| `B` | Shorts selected per session |
| `M` | Number of simulated sessions per strategy |
| `K` | Number of lookback sessions |
| `q_i` | Exposure probability of parent title `i` |
| `m_i` | Entered number of Shorts belonging to title `i` |
| `p_ij` | Exposure probability of Short `j` from title `i` |

The shipped defaults contain 552 titles and 1,020 Shorts, with `B = 25`, `M = 1,000`, and `K = 3`.

## End-to-end calculation

For each strategy, the simulation follows this pipeline:

```text
catalog rows
  -> exact title-level clip counts
  -> title exposure probabilities q_i
  -> clip exposure probabilities p_ij
  -> Dirichlet concentration values alpha_ij
  -> M independently generated sessions
  -> per-session overlap and diversity metrics
  -> empirical means, extremes, rates, and histograms
```

Equivalent pseudocode is:

```text
clip_counts = expand_catalog_rows(sorted_by_clips_descending)

for strategy in [rank_weighted, uniform_title]:
    q = title_probabilities(strategy, number_of_titles)
    p = split_each_q_equally_across_its_title_clips(q, clip_counts)
    alpha = B * p

    sessions = repeat M times:
        gamma_scores = Gamma(alpha, scale=1)
        session = indices_of_largest_B_scores(gamma_scores)

    for each session:
        lookback = K randomly selected distinct other sessions
        calculate exact-Short and parent-title metrics

    aggregate all M observations
```

## 1. Parent-title exposure

For the rank-weighted strategy, title `i` receives an unnormalized weight:

```text
w_i = 1 / sqrt(i + 2)
```

The title probability is the normalized weight:

```text
q_i = w_i / sum(w)
```

The underlying SRA v1 definition ranks titles by descending RFY score. The current UI accepts an aggregate clip-count distribution rather than title-level RFY scores, so it applies the user-selected proxy that titles with more clips receive the higher ranks. Rows are sorted by clips per title in descending order before title probabilities are assigned. Titles within a row are interchangeable because they have the same entered clip count and no separate RFY score.

For the uniform-title strategy:

```text
q_i = 1 / T
```

"Uniform" therefore means uniform across **parent titles**, not across individual Shorts.

## 2. Catalog generation

Each catalog row states that a given number of titles have exactly a given number of Shorts. The application expands those rows into a title-level `m_i` array; it does not randomly generate or approximate catalog composition.

The title's exposure is divided equally among its Shorts:

```text
p_ij = q_i / m_i
```

Because the normalized title probabilities sum to one, these Short probabilities also sum to one. The rank-weighted and uniform strategies use the same expanded catalog, so their comparison isolates the exposure-distribution difference rather than adding catalog-realization noise.

## Worked default-catalog example

The default input table expands as follows:

| Shorts per title | Titles | Shorts |
| ---: | ---: | ---: |
| 10 | 1 | 10 |
| 9 | 2 | 18 |
| 6 | 14 | 84 |
| 5 | 18 | 90 |
| 4 | 22 | 88 |
| 3 | 32 | 96 |
| 2 | 171 | 342 |
| 1 | 292 | 292 |
| **Total** | **552** | **1,020** |

For the rank-weighted strategy, the normalization constant across 552 titles is approximately:

```text
sum(1 / sqrt(r + 2), r = 0..551) = 44.592809
```

The highest-ranked title therefore receives:

```text
q_0 = (1 / sqrt(2)) / 44.592809 = 0.015857
```

That title is in the ten-Short row, so each of its Shorts receives:

```text
p_0j = 0.015857 / 10 = 0.001586
alpha_0j = B * p_0j = 25 * 0.001586 = 0.039642
```

For the uniform-title strategy, every title receives:

```text
q_i = 1 / 552 = 0.001812
```

A Short from a six-Short title receives approximately `0.000302`, while the only Short from a one-Short title receives `0.001812`. This is why the comparator is uniform by **title**, not by individual Short.

## 3. Session generation

For each Short, the application defines a Dirichlet-style concentration parameter:

```text
alpha_ij = p_ij * B
```

For each simulated session, it independently draws:

```text
g_ij ~ Gamma(alpha_ij, 1)
```

It then sorts all Shorts by `g_ij` and selects the top `B` indices. Normalization is unnecessary because sorting normalized Dirichlet components would produce the same order as sorting their Gamma draws.

Consequences of this method:

- an exact Short cannot occur more than once within a session;
- multiple Shorts from the same parent title can occur within a session; and
- this is not the same as making `B` independent categorical draws or using a conventional weighted-sampling-without-replacement algorithm.

## 4. Lookback comparison

For each target session, the implementation chooses `K` distinct other sessions uniformly from the full simulated set. It does not use the chronologically preceding `K` array entries.

Because sessions are independent and identically distributed, random other sessions have the same marginal overlap distribution as preceding sessions under the model's stationary assumptions. The implementation does not model chronological effects such as recency, catalog changes, trends, learning, or evolving user preferences.

## 5. Metrics

Let `S_i` be the set of exact Shorts in session `i`, and let `A_i` be the set of their parent titles. Let `U_i^S` be the union of the lookback sessions' Short sets and `U_i^A` be the union of their parent-title sets.

### Exact-Short cross-session overlap

```text
short_overlap_i = size(S_i intersect U_i^S)
```

### Distinct parent titles

```text
distinct_titles_i = size(A_i)
```

### Within-session parent-title repeats

```text
within_title_repeats_i = B - distinct_titles_i
```

This counts additional Shorts after the first Short from each represented parent title.

The explicit multi-clip session percentage is:

```text
multi_clip_rate = 100 * mean(within_title_repeats_i > 0)
```

It answers how often a session contains at least two Shorts belonging to the same parent title.

### Cross-session parent-title overlap

```text
title_overlap_i = size(A_i intersect U_i^A)
```

For every metric, histograms show the empirical frequency across `M` simulated sessions. Displayed averages are arithmetic means. Values labeled **Worst Case** are observed sample extremes, not theoretical worst-case bounds.

## How predictions are produced

The UI's predictions are empirical Monte Carlo estimates. They are calculated from the `M = 1,000` simulated observations produced for each strategy.

For a per-session metric `x_i`, the displayed average is:

```text
mean(x) = sum(x_i, i = 1..M) / M
```

For a histogram value `v`, the displayed percentage is:

```text
P_hat(x = v) = count(x_i = v) / M
```

For an exact-Short duplicate threshold `t`, the cumulative chart displays the number and percentage of simulated sessions at or below that threshold:

```text
C(t) = count(exact_clip_duplicates_i <= t)
P_hat(exact_clip_duplicates <= t) = C(t) / M
```

The UI begins at the greater of `t = 1` or the minimum observed value, so it does not render leading thresholds whose cumulative count is zero. When the minimum is zero or one, the `<= 1` bar includes sessions with either zero or one duplicate. Each subsequent bar adds the sessions in the next exact-duplicate bin, and the final observed threshold therefore reaches `M` sessions and 100%.

Distribution histograms likewise span only the observed integer range from the minimum value through the maximum value. Empty leading bins are omitted; an empty bin between two observed values remains visible so the integer scale is not distorted.

For the multi-clip result, the displayed percentage is:

```text
P_hat(any repeated parent title) = count(within_title_repeats_i > 0) / M
```

The predictions are conditional on the entered catalog, session size, lookback, ranking proxy, and all assumptions in this document. They are not analytically derived probabilities, confidence intervals, or calibrated forecasts of production traffic. Increasing `M` generally reduces Monte Carlo sampling noise but also increases runtime.

## Default seeded regression baseline

With the shipped 552-title / 1,020-Short catalog, `B = 25`, `K = 3`, `M = 1,000`, and seed `42`, the current implementation produces:

| Metric | Personalized Algo | Totally Random Algo |
| --- | ---: | ---: |
| Exact-Short overlap mean | 1.784 | 2.298 |
| Exact-Short overlap observed maximum | 8 | 7 |
| Cross-session title overlap mean | 4.334 | 3.130 |
| Cross-session title overlap observed maximum | 10 | 11 |
| Distinct titles mean | 24.4 | 24.8 |
| Distinct titles observed minimum | 21 | 22 |
| Within-session title repeats mean | 0.6 | 0.2 |
| Within-session title repeats observed maximum | 4 | 3 |
| Sessions with multiple clips from a title | 43.8% | 15.5% |

These values are regression fixtures for the current JavaScript implementation, not external evidence that the model is correct. An intentional change to sampling, random-number consumption, rank assignment, or metric definitions may change them and should update this table.

## Randomness and reproducibility

Session sampling uses:

- Mulberry32 as the seeded pseudorandom-number generator;
- Box-Muller Gaussian sampling;
- Marsaglia-Tsang Gamma sampling.

Catalog construction itself is deterministic and uses the exact distribution entered by the user.

The default seed is `42`. With the same inputs and implementation, the results are deterministic. The two strategies consume different consecutive portions of a single random-number stream; the simulation does not currently use independent per-strategy seeds or common random numbers.

## Assumptions and interpretation limits

Interpret results as relative outcomes within this synthetic model. In particular:

- The rank curve is a proxy for exposure concentration, not a production personalization model.
- Every simulated session is independent; there is no history-aware suppression or boosting.
- Every user and session shares the same probability distribution.
- Title probabilities are fixed for the full run.
- Shorts belonging to one title split that title's probability equally.
- Titles with more clips receive the highest rank positions as a proxy for unavailable title-level RFY scores.
- The model has no content quality, eligibility, freshness, duration, user segment, or business-rule features.
- Sample maxima and minima become more extreme as the number of simulations increases.

These assumptions should be revisited before using the output to support a production decision.

## Engineering validation checklist

Engineers validating the implementation should independently check these invariants:

| Area | Expected invariant |
| --- | --- |
| Catalog expansion | Expanded title count equals the table's title total |
| Catalog expansion | Sum of expanded per-title Short counts equals the table's Short total |
| Rank assignment | Expanded titles are ordered by Short count descending before rank weights are applied |
| Title probabilities | `sum(q_i) = 1` within floating-point tolerance |
| Short probabilities | For every title, `sum(p_ij for j in title i) = q_i` |
| Short probabilities | `sum(p_ij) = 1` within floating-point tolerance |
| Concentration | Every `alpha_ij = B * p_ij` and `sum(alpha) = B` |
| Session construction | Every valid session contains exactly `B` distinct Short indices |
| Title mapping | Every selected Short maps to exactly one parent title |
| Within-session repeats | `within_title_repeats = B - distinct_titles` for every session |
| Cross-session overlap | Overlap is measured against the set union of exactly `K` distinct other sessions |
| Histograms | Counts across all bins sum to `M` |
| Reported mean | UI mean equals the arithmetic mean of the underlying `M` observations |
| Multi-clip rate | UI percentage equals the fraction of observations with repeats greater than zero |
| Reproducibility | Identical inputs and seed produce identical results |
| Strategy isolation | Both strategies receive the same expanded catalog and differ only in `q_i` |
| Regression baseline | Default seeded outputs match the documented reference table unless a model change is intentional |

Recommended independent checks:

1. Reimplement the calculation in a separate language or notebook rather than copying the browser functions.
2. Run tiny catalogs where every possible session can be inspected manually.
3. Test boundary cases such as `B = 1`, one title, all one-Short titles, and `B = M_total`.
4. Compare the current Dirichlet top-K construction with exact Gumbel top-K / Plackett-Luce sampling to quantify the heuristic's effect.
5. Run several seeds and larger `M` values to estimate Monte Carlo variability.
6. Compare simulated distributions with logged production outcomes before treating them as forecasts.

## Input validity and computational limits

HTML inputs enforce basic per-field bounds, but the model does not currently enforce all cross-field constraints. Meaningful runs require:

```text
T > 0
0 < B <= M_total
0 < K < M
```

The UI requires positive whole numbers in every catalog row, combines rows that enter the same clips-per-title value, and blocks a simulation when fewer than `B` Shorts exist.

If `N = M_total` is the number of Shorts, session generation currently sorts all `N` Gamma draws for every session. Its approximate time complexity per strategy is:

```text
O(M * N log N)
```

Large title counts, large Shorts-per-title averages, or a large simulation count can therefore be expensive. Web Workers keep the page responsive, but they do not reduce the underlying computation.

## Model-change checklist

When changing the simulation:

1. State the intended modeling change before altering the implementation.
2. Add or update cross-field validation if the valid input domain changes.
3. Record any new assumption or metric definition in this document.
4. Compare deterministic default outputs before and after the change.
5. Verify that both Web Workers implement shared concepts consistently.
6. Check chart labels and explanatory copy against the exact calculation.
