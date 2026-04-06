# QWormhole — Coherence Math Reference

This document is the canonical reference for the J-functional geometry, the coherence state
machine, and how they project into transport governance. It is the companion to
`COHERENCE_ENGINEERING_V0.md` (ASIS↔NCT mapping) and answers "what are the actual equations."

---

## 1. State Space

The coherence layer models a three-dimensional state vector derived from measured transport
field samples:

```
s = [M, V, R]  ∈ ℝ³
```

| Component | Meaning                                                                     | Range  | Source                          |
| --------- | --------------------------------------------------------------------------- | ------ | ------------------------------- |
| `M`       | Coherence margin — gap between current operating point and failure boundary | [0, 1] | `1 − norm_entropy(residuals)`   |
| `V`       | Drift velocity — rate of change of margin                                   | ℝ      | `dM/dt`                         |
| `R`       | Negentropic reserve — available structural headroom                         | [0, 1] | `clamp(snr_proxy × confidence)` |

`H` is a derived scalar health gate (from `CoherenceState.H`) computed by the coupling
controller. It is not part of the J-space state; it is an output guard.

---

## 2. The J-Functional

The coherence field is modelled as a Lyapunov-like potential function over state space:

$$
J(s) = \frac{1}{2} s^T Q s + b^T s + \frac{1}{6} T_{ijk} s_i s_j s_k + c
$$

Where:

- $Q \in \mathbb{R}^{3 \times 3}$ — symmetric, PSD-projected curvature matrix
- $b \in \mathbb{R}^3$ — linear bias vector
- $T \in \mathbb{R}^{3 \times 3 \times 3}$ — symmetric cubic tensor (optional; model = `"cubic"`)
- $c \in \mathbb{R}$ — constant offset

The gradient used for resolution checks and gradient-descent simulation is:

$$
\nabla J(s) = Qs + b + \frac{1}{2} T_{ijk} s_j s_k \cdot \hat{e}_i
$$

(where the cubic gradient uses full index symmetry: $\partial/\partial s_i [(1/6)T_{ijk}s_is_js_k] = (1/2)T_{ijk}s_js_k$)

### 2.1 Quadratic model (default)

When `T` is absent the cubic term is zero and `J` reduces to the standard quadratic Lyapunov
candidate. This is the `"quadratic"` model in `FitJOptions`.

### 2.2 Cubic model

When the fitted state trajectory shows an asymmetric potential well (e.g., faster collapse in
one direction than the other) the cubic model captures that anharmonicity. The cubic tensor
`T` is symmetrized over all index permutations before use.

### 2.3 Fixed point

For the pure quadratic model the fixed point (minimum of J) is:

$$
s^* = -Q^{-1} b
$$

`isJSpaceResolved` computes this analytically (3×3 Cramer's rule inversion) when `geometry.validity.trusted` and uses it to tighten the basin-hold check.

---

## 3. Fitting the Geometry

`fitGeometry` in `field-stability.ts` solves for `Q`, `b`, `T` from observed trajectory
samples `{s_i, \dot{s}_i}` by treating the gradient equation as a linear system per output
dimension:

```
-ṡ_i ≈ ∇J(s_i)
```

This is ridge regression (regularization λ, default 1e-6) per output dimension, with
post-hoc symmetrization of `Q` and `T`, followed by PSD projection of `Q`.

### 3.1 PSD projection

`projectPSD` enforces positive semi-definiteness of `Q` via iterative diagonal inflation
(`Q ← Q + εI`) until a Cholesky factorization succeeds. The inflation amount `inflationUsed`
is tracked for health scoring.

### 3.2 Spectral extraction

`eigenSymmetric3x3` in `spectral.ts` extracts `λ_min`, `λ_max`, and `conditionNumber`
analytically from the 3×3 characteristic polynomial using the stable trigonometric method
(no numerical iteration). This is used everywhere curvature metrics are needed.

### 3.3 Minimum samples

| Model       | Min samples                  |
| ----------- | ---------------------------- |
| `quadratic` | 9 (4 features × 2, min 9)    |
| `cubic`     | 21 (10 features × 2, min 21) |

`minimumSamplesForModel` enforces this.

---

## 4. Geometry Certification

`certifyGeometryContract` in `geometry.ts` is a hard trust gate. It checks all of:

| Check                       | Fail reason tag        | Default threshold |
| --------------------------- | ---------------------- | ----------------- |
| Enough samples              | `insufficient_samples` | ≥ 16              |
| R² sufficient per dimension | `low_r2`               | ≥ 0.5             |
| PSD inflation within bound  | `psd_inflation`        | ≤ 0.01            |
| Q and b non-degenerate      | `degenerate_solution`  | not all-zero      |
| Condition number bounded    | `ill_conditioned`      | < 1e6             |
| λ_min positive              | `lambda_min_low`       | > 1e-4            |
| Health scalar below ceiling | `health_high`          | < 1.0             |

Only when all checks pass is `validity.trusted = true`. Governance consumers must check this
flag before acting on the geometry.

---

## 5. Health Scalar

`computeHealth` in `geometry.ts` produces a deterministic, monotonic, bounded scalar:

```
health = w₁·violationRate + w₂·max(0, maxΔJ) + w₃·(1/(λ_min+ε)) + w₄·dominanceRatio + w₅·psdInflationNorm
```

With fixed weights `(1.0, 0.5, 0.5, 0.25, 0.25)`. Lower is healthier. `health ≥ 1.0`
triggers the `health_high` certification failure.

---

## 6. J-Space Resolution

`isJSpaceResolved` in `jSpaceResolution.ts` checks three conditions simultaneously:

| Condition          | Check                                               | Parameter                      |
| ------------------ | --------------------------------------------------- | ------------------------------ |
| Local minimum      | `‖∇J(s)‖ < gradEps`                                 | default `1e-3`                 |
| Positive curvature | `λ_min > lambdaMinFloor`                            | default `1e-4`                 |
| Descent satisfied  | `violationRate < deltaJViolationCeil`               | default `0.05`                 |
| Basin hold         | `J(s) ≈ J_min` for `holdDuration` consecutive steps | default `5`, `basinEps = 1e-2` |

All four must pass for `resolved = true`. Any failure appends a reason string.

---

## 7. Transport Coherence (SNI / SPI)

`computeTransportCoherence` in `transport-coherence.ts` maps raw transport telemetry to two
summary scalars:

| Scalar         | Focus                                                    | Key contributors                                                                                     |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `transportSNI` | Signal-Noise Index — how regular is the transport        | slice entropy, flush interval stability, batching regularity, runtime regularity, payload regularity |
| `transportSPI` | Structural Persistence Index — how stable under pressure | same as SNI plus backpressure boundedness                                                            |

`transportMetastability` measures instability risk:

```
metastability = 0.45·(1−SPI) + 0.35·(1−backpressureBoundedness) + 0.2·clamp(flushIntervalCV/1.5)
```

These feed directly into `deriveTransportGovernancePolicy`.

---

## 8. Transport Governance Policy

`deriveTransportGovernancePolicy` in `transport-governance-policy.ts` maps the full signal
bundle to one of three operating modes:

| Mode                | Trigger conditions (any)                                                                                                                                          | batchScale | flushScale | paceScale |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | --------- |
| `recovery`          | `pointOfNoReturn` or `driftRate ≥ 0.9`                                                                                                                            | 0.4–0.5    | 0.5–0.6    | 1.25–1.35 |
| `guarded`           | `gamma ≥ 2.25`, `driftRate ≥ 0.55`, `entropy ≥ 0.72`, `confidence ≤ 0.35`, `metastability ≥ 0.68`, `transportSPI ≤ 0.45`, `regime = unstable/model-mismatch`, ... | 0.75       | 0.8        | 1.1       |
| `throughput`        | All stability conditions met (gamma ≤ 1.15, entropy ≤ 0.4, confidence ≥ 0.75, ...)                                                                                | 1.1        | 1.0        | 0.95      |
| `guarded` (neutral) | None of the above                                                                                                                                                 | 1.0        | 1.0        | 1.0       |

`driftRate` (entropy velocity from `@gsknnft/coherence`) is the primary leading indicator —
it escalates governance before gamma or entropy cross their thresholds.

---

## 9. NCF (Negentropic Coherence Function)

`deriveNcfSummary` in `ncf.ts` derives a compact regime label from entropy/coherence:

| nIndex  | NCF State                             |
| ------- | ------------------------------------- |
| > 0.8   | `macro` — high coherence, can expand  |
| 0.3–0.8 | `balanced` — normal operating band    |
| < 0.3   | `defensive` — low coherence, contract |

| coherence, entropy                | NCF Regime     |
| --------------------------------- | -------------- |
| coherence > 0.7 AND entropy < 0.4 | `coherent`     |
| coherence < 0.4 OR entropy > 0.7  | `chaos`        |
| otherwise                         | `transitional` |

The NCF summary feeds `TransportGovernanceSignals.regime`.

---

## 10. Key Implementation Files

| File                                  | Responsibility                                                           |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `coherence/field-stability.ts`        | `fitGeometry`, `projectPSD`, `checkLyapunov`, `evaluateJ`                |
| `coherence/spectral.ts`               | `eigenSymmetric3x3` — analytic 3×3 eigenvalues                           |
| `coherence/geometry.ts`               | `computeHealth`, `certifyGeometryContract`                               |
| `coherence/jSpaceResolution.ts`       | `isJSpaceResolved`, `bindGeometryOps`                                    |
| `coherence/fitj.ts`                   | `fitJFunc` — general-purpose normal-equations solver (offline/scripting) |
| `coherence/ncf.ts`                    | `deriveNcfSummary` — NCF state + regime                                  |
| `coherence/nbo.ts`                    | NBO (Negentropic Basin Optimization) — basin width + epiplexity          |
| `core/transport-coherence.ts`         | `computeTransportCoherence` — SNI / SPI / metastability                  |
| `core/transport-governance-policy.ts` | `deriveTransportGovernancePolicy` — mode + scale factors                 |

---

## 11. Consistency with vera-campus-ui

The campus UI (`vera-campus-ui/src/jspace/`) computes and renders J-surfaces using the same
formula via `evaluateJ` in `computeSlice.ts` (exported as of audit 2025). The types differ
(`GeometryFrame` vs `FitJResult`) but the math is identical. A future unification effort
should re-export the QWormhole `GeometryState` type into the campus-ui's jspace layer to
eliminate the type gap.
