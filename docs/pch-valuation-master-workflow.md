# Xahya — Master Workflow for PCH Valuation
## Research, evidence integration, theory consolidation, and merge gates

**Status:** Research/specification workflow — computational work is explicitly blocked.  
**Repository baseline:** `siheralia/Xahya`, `main` at `82fab42d70d12e490dbbec4ee5c4a3b39d450a4f` (inspected 2026-11-03).  
**Integration document branch:** `docs/pch-valuation-master-workflow`.  
**Final deliverable:** an evidence-backed, non-ambiguous valuation theory and decision tree.  
**Out of scope until the final gate:** implementing algorithms, calculating new prices, fitting coefficients, running valuation simulations, modifying production PCH rules, or migrating data.

---

## 1. Governing rule and phase boundary

This project is divided into two phases:

1. **Phase A — Research and theory (this workflow).** Import and classify the evidence, reconstruct the dependency/interaction matrices, map actual skill graphs and observed behaviour, establish resource/action economics, and settle the aggregation policy.
2. **Phase B — Computation and implementation (not authorised yet).** Only after every Phase A objective has passed its acceptance gate may we design computational functions, implement matrix calculations, simulate utility, calibrate weights, add tests, or alter PCH.

A workstream may describe an equation as a mathematical object where needed to define the theory. It must not turn that equation into executable code, generate a production quote, or claim a calibrated numerical weight.

**No objective is complete merely because its source code has been read.** A source-defined rule, a stored production record, a user-reported event, and a test fixture are different evidence classes.

### Evidence labels used throughout

| Label | Meaning | Permitted interpretation |
|---|---|---|
| `CODE-VERIFIED` | Directly confirmed in a pinned source file or migration | Describes implemented logic, not actual frequency or effectiveness |
| `DB-OBSERVED` | Imported production record with provenance | Describes stored state/event within the export's coverage |
| `DERIVED-FROM-CODE` | Mathematical consequence of a verified source rule | Valid for that version/configuration; not empirical telemetry |
| `USER-REPORTED` | Supplied by the project owner/player | Useful case evidence; validate identifiers where possible |
| `TEST-FIXTURE` | Example created by a unit/integration test | Demonstrates contract or expected behavior; not a real character/skill |
| `DESIGN-DECISION` | Explicit policy chosen by the project owner | Normative rule, not something inferred from data |
| `HYPOTHESIS` | Proposed explanatory model awaiting evidence | Must remain marked as unverified |
| `MISSING` | Required but unavailable or not instrumented | Cannot be silently imputed as zero or certainty |

Every matrix cell, parameter, sample, statistic, and conclusion must carry a source/version and one of these evidence labels.

---

## 2. Valuation architecture: where each term belongs

The valuation theory will preserve separate layers until their relationships are understood. The following is the **analysis vector**, not a final numeric PCH equation:

`A(s \mid x,P,E) = (C_{ind}, S_B, S_D, S_M, S_E, C_{complexity}, C_{resource}, C_{action}, \Delta U, \sigma)`

Where:

- `s`: candidate skill, represented as an activation-bounded directed graph.
- `x`: character snapshot, including base/effective stats, capabilities, equipment, modifiers, resources, and progression.
- `P`: current skill portfolio, including native/racial grants and relevant prerequisites.
- `E`: environment/scenario distribution and observation horizon.
- `C_ind`: independent direct contribution of each parameter/effect before interaction attribution.
- `S_B`: synergy at the base-stat layer.
- `S_D`: synergy through derived-stat dependencies.
- `S_M`: synergy through general character/combat/world mechanics.
- `S_E`: external synergy, redundancy, conflict, or resource/action competition with other skills in the portfolio.
- `C_complexity`: graph/condition/branching/concentration complexity, after excluding already-priced direct power.
- `C_resource`: opportunity cost of resource consumption, scarcity, renewal, and future infeasible actions.
- `C_action`: action-time, initiative, cooldown, and competing-action cost.
- `\Delta U`: counterfactual change in outcome utility across scenarios.
- `\sigma`: evidence/model uncertainty.

**Critical anti-double-counting rule:** `\Delta U` may already include the realized effects of internal/external synergy and resource/action costs. Therefore, a future aggregate may not simply add `S_B + S_D + S_M + S_E + C_resource + C_action + \Delta U` without proving that the terms are disjoint. Phase A must decide which quantities belong in the *official intrinsic PCH price*, which are diagnostics, and which belong only in *character-conditioned utility*. This is one of the final policy decisions, not an assumption.

### Two outputs must remain distinct

1. **Intrinsic acquisition price:** a stable official price under a documented reference context. It should not fluctuate merely because one buyer has unusual stats or owns a particular combination of skills, unless the owner explicitly chooses character-specific acquisition pricing.
2. **Personal marginal utility:** the estimated incremental value of the skill for a particular character and portfolio. This may be high, low, redundant, or negative without rewriting the skill's official intrinsic price.

The workflow must produce both definitions and their relationship before computation begins.

---

## 2A. The nine independent research directions — central workflow

**This is the primary work decomposition.** The nine terms of the valuation architecture are nine independent research directions (RD1–RD9), not nine stages of one already-decided formula. Each direction investigates competing theoretical models, the information required to distinguish them, their failure modes, and the criteria for selecting one. The purpose is to decide *what each term should mean and how it should be valued* before deciding how to calculate it computationally.

No track may assume that its term must become a positive additive surcharge. A term may ultimately be a direct contribution, an interaction correction, a constraint, a diagnostic, a risk adjustment, or an explanatory output excluded from the final intrinsic PCH scalar.

### Shared research protocol for every RD track

Each direction follows the same milestones:

| Milestone | Required work | Artifact |
|---|---|---|
| RD-M1 — Define the estimand | State exactly what the term measures, its unit, boundary, counterfactual, and what it excludes | Estimand and boundary note |
| RD-M2 — Enumerate candidate theories | Present at least two materially different mathematical approaches, including a simple baseline | Candidate-method comparison |
| RD-M3 — Identify evidence | List source fields, matrices, behaviours, events, and missing observations required to distinguish the candidates | Evidence/identifiability matrix |
| RD-M4 — Analyze assumptions and failure modes | Test conceptual edge cases, confounding, nonlinearity, representation sensitivity, and double counting | Assumption and failure-mode register |
| RD-M5 — Compare alternatives | Evaluate candidates against common criteria; do not fit coefficients or produce production prices | Decision matrix |
| RD-M6 — Form a provisional recommendation | Recommend one approach or a hybrid, explain rejected alternatives, and list unresolved owner decisions | Research conclusion |
| RD-M7 — Review and merge | Owner reviews the theory; accepted research note merges into the integration branch | Reviewed PR and closed checklist |

Every research note must answer: **What are we measuring? Why is this the right estimand? What are the strongest alternatives? What evidence separates them? When would the method fail? How does it avoid duplicating another term? Which decision requires the project owner's judgment?**

Common comparison criteria:
- construct validity: does the term measure the intended concept rather than a convenient proxy?
- causal/structural clarity: is its contribution distinguishable from upstream/downstream terms?
- data identifiability: can Xahya actually observe or reconstruct it?
- context sensitivity: does it change appropriately with character, portfolio, and scenario?
- invariance: does cosmetic rewriting, reordering, or splitting/merging equivalent graph nodes change the result?
- monotonicity and boundary behavior: does it behave sensibly at zero, caps, thresholds, and extreme values?
- double-counting risk: is the contribution already represented elsewhere?
- interpretability and calibration burden: can the owner understand, audit, and later calibrate it?

The following nine tracks are **independent research questions**. They may be handled in separate ChatGPT conversations, but all must use the same frozen code baseline and shared evidence manifest from O0/O1.

---

### RD1 — Independent capability cost

**Question:** What is the standalone value/cost of an atomic capability before character synergy, portfolio interaction, resource opportunity, action opportunity, and scenario preference are added?

The research must define what counts as an *atomic capability*: e.g. a stat modification with a specified magnitude and target, damage/healing, mitigation, movement, control, detection, field creation, copying, resistance, or another action-result type. An effect label alone is insufficient; potency, duration, target, scope, conditions, execution semantics, and the activation envelope determine what capability is actually delivered.

**Candidate theories to compare**

1. **Primitive additive schedule.** Assign a reference cost to each normalized capability primitive and scale by well-defined magnitude/duration/scope curves. This resembles a transparent tariff schedule. Investigate its simplicity, auditability, and tendency to miss interactions.
2. **Reference-state marginal utility.** Define the standalone contribution as the counterfactual outcome difference between the candidate primitive and its absence under a standardized reference character and scenario distribution. Investigate its dependence on the reference population and the chosen outcome utility.
3. **Benchmark/equivalence calibration.** Price a capability relative to a set of approved benchmark capabilities or skills with known owner-accepted PCH anchors. Investigate whether equivalence classes can be stable and whether historical prices are trustworthy anchors.
4. **Capability-vector first, scalar later.** Preserve a multidimensional capability signature (damage, mitigation, HP, control, range, duration, reliability, scope, etc.) and defer scalarization until the utility/aggregation research is complete. Investigate whether this is the least assumption-heavy starting point.

**Core theoretical object to investigate**

`I_i = U(Y\mid c_i, x_0, e_0)-U(Y\mid \varnothing, x_0, e_0)`

Here `c_i` is one normalized capability primitive, `x_0` a declared reference character, and `e_0` a declared reference context. This is a candidate definition of standalone utility, **not yet a PCH formula**. Compare it with purely structural primitive prices and benchmark anchoring.

**Evidence required:** complete effect catalog and configured base/step prices; duration, potency, range, speed, cooldown, targeting and rule semantics; real generic/racial/character skill examples; actual execution support vs narrative/manual-only behavior; existing benchmark prices and historical pricing versions.

**Specific questions to resolve**
- Should one PCH unit represent construction complexity, capability utility, a conventional exchange unit, or a calibrated mixture?
- Is a stat bonus one atomic primitive, or must its cost be downstream-derived from its impact on the character?
- Should the same capability have one stable intrinsic cost regardless of the beneficiary, or a context-conditioned value diagnostic?
- How should target count, area, reliability, range, duration, reversibility, and counterplay enter this term without stealing the work of RD6–RD9?
- Which historical costs are valid anchors, and which merely encode legacy policy?

**Deliverable:** a normalized primitive ontology, a standalone-value estimand, at least two competing cost models, reference-state requirements, and a recommendation about whether the output is scalar or vector-valued at this stage.

**RD1 checklist**
- [ ] Atomic capability boundary defined.
- [ ] Effect labels separated from executable outcomes.
- [ ] Magnitude, duration, scope, target and activation context represented.
- [ ] Additive, marginal-utility, benchmark and vector-first models compared.
- [ ] Unit/anchor for any future PCH conversion justified.
- [ ] Synergy, portfolio, resource, action and scenario contributions excluded or explicitly reserved.

---

### RD2 — Base-stat synergy

**Question:** What additional or diminishing value arises from combinations of base attributes, distinct from the downstream value mediated by derived statistics and general mechanics?

The eight core base attributes are STR, AGI, CON, INT, WIS, CHA, SPI and LCK. All active custom basic stats must also be included. The research must distinguish:
- direct effects of base stats on actions/mechanics;
- indirect effects mediated through derived statistics;
- interactions between base attributes;
- character-specific context (current stat levels, modifiers, caps and thresholds).

**Candidate theories to compare**

1. **Local marginal influence (Jacobian).** Describe how an outcome/capability changes for a small change in each base stat around a character snapshot. Useful for local ranking, but it can miss pair interactions and fail at discontinuities.
2. **Pairwise interaction (Hessian/second differences).** Describe complementarity or redundancy between pairs of base stats. It is local or finite-difference dependent and may miss higher-order interactions.
3. **Finite intervention/counterfactual tables.** Compare defined stat perturbations at representative character profiles. More interpretable for discrete stats and thresholds, but larger and dependent on selected perturbation sizes.
4. **Structural-equation/path decomposition.** Separate direct base-stat paths from paths that pass through derived stats and mechanics. This may offer the cleanest anti-double-counting boundary, but needs a defensible causal dependency model.

**Core interaction object to investigate**

`H^B_{ij}=F_B(x+\Delta_i+\Delta_j)-F_B(x+\Delta_i)-F_B(x+\Delta_j)+F_B(x)`

`F_B` must be defined carefully: is it a direct base-layer outcome, a path-specific contribution, or the total character outcome? Using total outcome here and then again in RD3/RD4 would double-count mediated paths. A central research decision is how to partition direct and mediated influence without creating impossible counterfactual states by arbitrarily holding downstream variables fixed.

**Evidence required:** live base-stat values and distributions; all custom basic stats; effective modifiers, perks, equipment and active statuses; active derived formulas; direct mechanics that consume base stats; historical stat changes and relevant character behaviour.

**Specific questions to resolve**
- Should synergy mean mathematical nonlinearity in the stat system, practical complementarity in game outcomes, or both as separate quantities?
- Do we evaluate equal absolute changes (+1), equal relative changes (+x%), or changes normalized to the available stat range?
- How should piecewise functions such as `min(AGI,STR)`, thresholds and caps be handled?
- Are stat distributions and player build patterns used as weights, or only as representative test populations?
- How will direct and mediated effects be separated from RD3 and RD4?

**Deliverable:** the base-stat estimand, a policy for perturbation scale/reference character, a direct-vs-mediated decomposition proposal, and candidate Jacobian/interaction methods.

**RD2 checklist**
- [ ] Core and custom base stats included.
- [ ] Absolute vs relative perturbation policy compared.
- [ ] Local vs finite-intervention approaches compared.
- [ ] Pairwise vs higher-order interactions considered.
- [ ] Nonlinear regions and caps represented.
- [ ] Direct base effects separated from derived/mechanic-mediated effects.

---

### RD3 — Derived-stat synergy

**Question:** How should the value of changes propagated through derived statistics be measured, especially when several base stats converge on one derived output or a skill directly modifies that derived output?

**Candidate theories to compare**

1. **Formula dependency propagation.** Use the active formula graph to identify which base stats affect each derived output and how. Transparent, but sensitivity alone does not establish gameplay value.
2. **Chain-rule sensitivity.** Propagate local marginal changes through nested derived formulas. Efficient and interpretable for smooth regions, but insufficient at discontinuities, floors, thresholds, and conditional mechanics.
3. **Finite-difference propagation.** Intervene on base or derived inputs and compare the resulting configured outputs. More robust to piecewise formulas and rounding, but sensitive to step size and model version.
4. **Outcome-mediated value.** Value each derived-stat change by its downstream effect on action/outcome distributions, while treating the derived-stat matrix as causal attribution rather than as a second independent reward.

**Core theoretical objects to investigate**

- `J_BD`: influence of base stats on derived stats.
- `J_DU`: influence of derived stats on defined action/outcome utility.
- Candidate total propagation: `J_DU · J_BD`.

This product is only meaningful when variable definitions, units, and causal paths line up. It must not be added on top of a total outcome sensitivity that already includes the same base-stat path.

**Evidence required:** live `statistics.catalog.v1`; fallback formulas; active custom formulas; effective-stat stacking rules; direct effect targets to base vs derived stats; mechanics/action resolvers consuming derived stats; character-specific effective-stat snapshots.

**Specific questions to resolve**
- Do direct derived-stat bonuses receive a distinct value from equivalent base-stat paths?
- Where should rounding/flooring be considered: at each formula node or only at the final output?
- How are formula dependencies with `min`, `max`, division, thresholds and cycles treated?
- Is the derived matrix a valuation component or an explanatory mediator used to allocate other terms?
- How should a stat formula that changes between deployments affect historical comparability?

**Deliverable:** a derived-stat dependency/attribution theory, treatment of direct derived modifiers, nonlinear/rounding policy, and anti-double-counting rule with RD2/RD4.

**RD3 checklist**
- [ ] Active configured formulas take precedence over fallbacks.
- [ ] Nested formula dependencies represented.
- [ ] Direct derived effects distinguished from upstream base effects.
- [ ] Smooth and nonsmooth sensitivity methods compared.
- [ ] Rounding, formula-version and missing-definition behavior specified.
- [ ] Downstream utility is not counted twice.

---

### RD4 — General mechanic synergy

**Question:** How do base and derived attributes combine with Xahya's general mechanics to alter actual action feasibility, success, magnitude, timing, and world-system outcomes?

This track covers mechanic layers such as attack/defense contests, precision, dodge, critical, action-point budgets, action ticks, movement, resistance, detection, stealth, field/exposure rules, and any configured non-combat mechanics. It is not limited to the default mechanic-to-stat map.

**Candidate theories to compare**

1. **Configured dependency graph.** Record which statistics each mechanic reads and which action/state fields it changes. Establishes traceability but does not by itself quantify effect.
2. **Mechanic-response functions.** Analyze the local response of mechanic outputs to input stats (including saturation, caps, and thresholds). Good for explaining rules, but may not reflect strategic value.
3. **Outcome-probability model.** Translate mechanic changes into conditional changes in action success/failure, damage, mitigation, movement, detection, etc. Requires properly defined opportunities and denominators.
4. **State-transition/counterfactual model.** Compare trajectories with and without a mechanic change in the same scenario and state. Captures cascading effects but may be data- and model-intensive.

**Candidate attribution object**

`S_M = \Delta U_{mechanic}(x,e)\)

Research must decide whether this means a single mechanic's direct contribution, the interaction among mechanics, or the portion of an observed outcome that can be causally attributed to that mechanic. These are different estimands.

**Evidence required:** active mechanic assignments; source formulas and combat engine; combat turn/skill resolvers; NPC policy; field/status mechanics; action logs; hit/contact/defense/critical/damage/movement results; maze and non-combat mechanics outcomes; manual GM adjudication markers.

**Specific questions to resolve**
- Which mechanics are deterministic transformations and which are stochastic contests?
- Are outcome rates calculated per action attempt, eligible opportunity, target, or encounter?
- How should conditions with correlated inputs be valued jointly?
- How do action speed and action-point count interact with hit/success probability?
- What happens when the rule exists in preview or documentation but is not connected to the live resolver?
- Should a mechanic that increases feasibility be valued separately from one that increases success conditional on use?

**Deliverable:** a mechanic ontology, input/output map, candidate valuation methods, and an evidence-backed hierarchy for deterministic, stochastic, automatic, and manually adjudicated mechanics.

**RD4 checklist**
- [ ] Active mechanic configuration imported.
- [ ] Runtime path verified for each included mechanic.
- [ ] Feasibility separated from conditional success.
- [ ] Deterministic and stochastic rules treated appropriately.
- [ ] Correlated conditions and interactions addressed.
- [ ] Preview-only/manual rules flagged, not valued as fully automated effects.

---

### RD5 — External portfolio synergy

**Question:** What is the incremental value of a candidate skill given the character's existing skills and other capabilities, including complementarity, redundancy, conflict, and competition?

Let `P` be the current portfolio and `s` a candidate. The research must distinguish the value of a skill in isolation from its incremental value in a particular portfolio.

**Candidate theories to compare**

1. **Leave-one-in marginal contribution.** Compare the portfolio with and without the candidate skill. Clear for the current owner/portfolio, but order/context dependent and may allocate interactions unevenly.
2. **Pairwise interaction graph.** Store complementarity/redundancy/conflict edges between skills. Interpretable, but higher-order combinations may not decompose into pairs.
3. **Coalition/set-function evaluation.** Treat portfolio value as a set function and assess the candidate's marginal contribution in the full set. Directly captures portfolio context but requires a well-defined portfolio evaluator.
4. **Shapley-style attribution.** Average the candidate's marginal contribution across possible acquisition orders/coalitions. More principled for allocating shared interaction value, but can be expensive and depends on the coalition universe and assumptions.
5. **Capability coverage/redundancy model.** Compare which capabilities are already provided by race, perks, items, statuses, and skills. Useful as a structural baseline; it can miss timing/conditional differences between nominally similar capabilities.

**Core interaction object to investigate**

`S_E(s,P)=V(P\cup\{s\})-V(P)-V(\{s\})+V(\varnothing)`

This is a candidate pair of comparisons, not the definitive method. Compare it with full marginal contribution and Shapley attribution, especially for three-or-more-skill interactions.

**Evidence required:** approved and usable skills; their graphs and activation envelopes; prerequisites and linked skills; generic ancestry/snapshots; racial grants; equipment/perks; active/temporary/stolen/copied skills; resource pools; action/cooldown competition; behaviour/use history.

**Specific questions to resolve**
- Is portfolio synergy a property of the candidate skill, the character, or the current equipped/active loadout?
- Should a skill that duplicates an existing racial capability have zero incremental utility but retain intrinsic price?
- Does a conditional specialist complement a general skill, or merely cover an alternative situation?
- How should shared cooldowns, action slots and resource constraints affect the portfolio interaction?
- Is Shapley attribution useful for explanation only, or should it affect official PCH?
- What is the coalition universe: all owned skills, only usable/approved skills, or all capability providers?

**Deliverable:** portfolio boundary, capability-equivalence rules, interaction taxonomy, chosen marginal attribution approach, and explicit separation from intrinsic cost.

**RD5 checklist**
- [ ] Skill portfolio and non-skill capabilities included.
- [ ] Approved/usable/temporary/stolen states distinguished.
- [ ] Complementarity, redundancy, conflict, shared resources and action competition separated.
- [ ] Pairwise and higher-order methods compared.
- [ ] Current-character marginal value separated from intrinsic acquisition cost.
- [ ] Coalition universe and attribution policy justified.

---

### RD6 — Complexity and concentration

**Question:** What should the valuation recognize about a skill graph's structural complexity and about how its independent capability cost is distributed across effects?

These are related but not identical concepts:
- **Structural complexity:** conditions, branches, dependencies, graph depth, target routing, event rules and activation modes.
- **Cost concentration:** whether the capability is spread across many similarly sized contributions or dominated by one large contribution.

**Candidate structural complexity measures**
- node/edge counts and typed counts;
- number of branches and condition fan-out;
- graph depth and number of independent activation paths;
- cyclomatic/control-flow complexity;
- dependency depth, linked-skill count, and condition/action coupling;
- normalized graph-complexity indices that avoid rewarding verbose representation.

**Candidate concentration/aggregation measures**
- mean contribution: `μ = ΣCᵢ/n`;
- peak share: `max(Cᵢ)/ΣCᵢ`;
- Herfindahl concentration: `HHI = Σ(Cᵢ/ΣCⱼ)²`;
- effective contribution count: `N_eff = 1/HHI`;
- Gini inequality over independent costs;
- max, p-norm, and normalized log-sum-exp/softmax aggregators;
- bounded hybrids that combine average capability with peak contribution.

**Candidate theories to compare**
1. **Additive-only baseline:** complexity is a diagnostic; independent capabilities sum.
2. **Complexity premium:** graph complexity modifies cost because difficult-to-express/execute capabilities are considered more expensive to construct.
3. **Complexity risk/discount:** complexity reflects fragility, conditionality or reliability, and may reduce expected realized utility rather than increase intrinsic price.
4. **Concentration-sensitive aggregator:** use a smooth or bounded alternative to simple summation when one dominant parameter should not be diluted by many small additions.
5. **Two-axis model:** keep structural complexity and contribution concentration independent, rather than combining unlike quantities into one coefficient.

**Required invariance investigations**
- permutation of node/effect order must not change the result;
- duplicate or semantically equivalent nodes must not create artificial price;
- splitting one effect into two equivalent pieces must not manipulate the result;
- merging equivalent effects must not erase genuine conditional distinctions;
- adding verbose descriptions without changing execution must not increase capability cost;
- one extreme effect among many tiny effects must behave according to an explicit, owner-approved policy.

**Specific questions to resolve**
- Is complexity itself a valued capability, a construction burden, a reliability risk, or only a descriptive statistic?
- Should complexity increase price, lower expected utility, or remain an audit diagnostic?
- Does concentration warrant max/softmax treatment, or should effects always add after interaction correction?
- Which graph features represent real cognitive/runtime complexity versus merely data-model syntax?
- How should mutually exclusive branches be aggregated compared with simultaneous actions?

**Deliverable:** separate definitions for graph complexity and cost concentration; a comparison of additive/max/softmax/p-norm/HHI/Gini methods; invariance tests; and a recommendation about which signals enter the final scalar.

**RD6 checklist**
- [ ] Structural complexity separated from cost concentration.
- [ ] Multiple graph complexity measures compared.
- [ ] Mean, max, softmax, p-norm and concentration measures compared.
- [ ] Split/merge/permutation invariance addressed.
- [ ] Mutually exclusive vs simultaneous branches distinguished.
- [ ] No complexity surcharge justified solely by representation verbosity.

---

### RD7 — Resource opportunity cost

**Question:** What future value is sacrificed when a skill consumes mana or another finite/renewable resource, and where should that opportunity cost enter the valuation?

**Candidate theories to compare**

1. **Fixed exchange rate.** Convert resource units into a fixed PCH/utility amount. Simple but ignores scarcity, balance, regeneration and character differences.
2. **Concave resource utility.** Let the marginal value of a resource depend on the remaining balance; a scarce last unit is more valuable than a surplus unit. Requires a justified utility curve.
3. **Shadow price / dual value.** Define the resource's marginal value as the change in optimal future value when one more unit is available under the relevant constraints. Principled for scarce resources, but needs a future horizon and feasible-action model.
4. **Counterfactual resource depletion.** Compare future trajectories with and without the skill's resource debit. Captures induced inability to perform later actions but may be expensive and sensitive to policy.
5. **Observed revealed-preference proxy.** Infer scarcity from actual choices, skipped actions, resource hoarding, and replenishment. Empirical, but behaviour may reflect player preference or incomplete logs rather than underlying game value.

**Candidate shadow-price object**

`λ_r(x,e,H)=V^*(x,r+1,e,H)-V^*(x,r,e,H)`

Here `r` is a resource balance and `H` the stated future horizon. This is a marginal future-value concept; it is not automatically a PCH-to-resource exchange rate.

**Resource classes to investigate separately**
- activation mana;
- recurring maintenance;
- accumulation expenditure and accumulation-per-tick;
- HP or other self-sacrifice;
- money, karma, level-up points and consumable currencies;
- item charges/durability and limited-use inventory;
- renewable vs nonrenewable pools;
- persistent character-sheet resource vs encounter-local resource.

**Evidence required:** resource snapshots and histories; every debit/credit callsite; skill activation/maintenance/accumulation fields; regeneration/replenishment; resource grants; combat-local mana; skipped/failed activations due to insufficient resources; future demand and action availability.

**Specific questions to resolve**
- Should resource cost affect intrinsic purchase price, operational utility, or both under distinct accounting?
- Does a fixed five-mana-per-base-PCH rule represent intended design policy or an obsolete approximation of resource value?
- How is resource regeneration valued over a combat, a day, and a campaign?
- Should the last available resource unit have a higher shadow price than a surplus unit?
- How do we account for costs that are stored but not actually debited by the current runtime?
- How do we prevent lost future actions from being counted once in resource value and again in RD8?

**Deliverable:** resource ontology, debit/credit and renewal map, candidate shadow-price theories, horizon policy, and a strict distinction between price concession and resource operating cost.

**RD7 checklist**
- [ ] Persistent and encounter-local resources separated.
- [ ] Every cost field traced to actual runtime debit.
- [ ] Renewal/replenishment history identified.
- [ ] Fixed, concave, shadow-price and counterfactual methods compared.
- [ ] Horizon and resource scarcity defined.
- [ ] Lost future action value not duplicated with RD8.

---

### RD8 — Action opportunity cost

**Question:** What is forgone by spending an action, action point, tick window, initiative opportunity, reaction, or cooldown window on this skill instead of the best available alternative?

**Candidate theories to compare**

1. **Fixed action-slot price.** Assign a standard cost to an action/turn/tick. Transparent but ignores the state and alternative actions available.
2. **Best-alternative opportunity cost.** Compare the candidate action with the most valuable feasible alternative in the same state and time window.
3. **Advantage/Q-value model.** Define the action's value relative to the best alternative action under the same state, policy and future horizon. Captures future consequences but depends on a defensible policy/value model.
4. **Scheduling/feasibility model.** Analyze how ticks, action-point budgets, initiative order, cooldowns and duration alter which action sequences can fit into the encounter.
5. **Observed action-selection model.** Use actual action choices, skipped opportunities, waiting and cooldown-blocked reuse as behavioural evidence; distinguish preference from mechanical optimality.

**Candidate comparative-value object**

`A(s,x)=Q(x,s)-\max_{a\in\mathcal{A}(x),a\ne s}Q(x,a)`

This expresses the skill's comparative value against the best feasible alternative under the same state. Research must decide whether this is the right estimand, how `Q` is defined, and whether scheduling over multiple future turns is required.

**Evidence required:** action ticks and action-point budgets; turn/initiative rules; reaction costs; attack speed; cooldown ledgers; skill durations; movement/attack/defense/skill events; action choices; action availability and rejection reasons; outcome logs.

**Specific questions to resolve**
- Is the comparison alternative the best action, the average legal action, a no-op/wait, or the character's observed policy?
- Should action cost be based on ticks consumed, one proactive action, initiative lost, or future sequence constraints?
- How should a fast skill compare with a powerful slow skill?
- How should cooldown affect reuse opportunities independently of RD1's capability magnitude?
- Is the value of a reaction different from proactive initiative?
- How are action opportunity and resource opportunity disentangled when the same alternative is lost due to both?

**Deliverable:** action opportunity estimand, candidate fixed/dynamic/scheduling models, feasible-action-set definition, and non-overlapping accounting with RD7 and RD9.

**RD8 checklist**
- [ ] Proactive actions and reactions distinguished.
- [ ] AP, ticks, initiative and cooldown semantics imported.
- [ ] Best-alternative and fixed-cost approaches compared.
- [ ] Horizon/scheduling effects addressed.
- [ ] Observed choices distinguished from optimal choices.
- [ ] Resource scarcity not counted a second time.

---

### RD9 — Scenario-weighted utility

**Question:** How should the value of a capability be aggregated across different contexts, and how should the theory handle rare but extreme outcomes, player archetypes and uncertainty in scenario frequencies?

**Candidate theories to compare**

1. **Empirical expected utility.** Weight each scenario by its observed frequency and average counterfactual outcome. Data-grounded but vulnerable to sparse logs, historical selection bias and changes in game population.
2. **Normative/design weights.** Assign explicit owner-chosen weights to intended game contexts (duel, boss, attrition, exploration, social, etc.). Stable by design intent, but not an empirical frequency claim.
3. **Archetype-conditioned utility.** Report different values for declared play styles or character roles rather than forcing one universal player distribution.
4. **Risk-sensitive utility.** Combine expected outcome with tail-sensitive measures such as CVaR to recognize rare exploits or catastrophic weaknesses. Requires a clear direction and tail definition.
5. **Robust/worst-case evaluation.** Evaluate a range of plausible scenario distributions and identify capabilities that become dominant under distribution shift. Conservative but may overprice niche counters if used as the sole objective.
6. **Multi-objective outcome vector.** Preserve damage, survival, control, mobility, exploration, social and other outcomes separately until an explicit preference policy is chosen.

**Candidate expected-utility object**

`\bar U(s)=\sum_{e\in\mathcal E}w_e\,\mathbb E[\Delta U(s)\mid e]\), with `\sum_e w_e=1`.

A risk-sensitive alternative can be compared as a mixture of the expectation and a defined CVaR/tail measure. The direction of the tail must be explicit: unusually high power/exploit potential and unusually bad downside are not the same tail.

**Evidence required:** encounter/scenario counts; action opportunities per scenario; skill usage and eligibility; outcome events; character build distributions; player behaviour; scenario sampling/retention coverage; version history; manual GM adjudications; missing/censored encounters.

**Specific questions to resolve**
- Should weights reflect actual prevalence, intended game balance, equal design importance, or a transparent combination?
- Should weights be global, character-archetype-specific, campaign-specific, or player-selected?
- How are rare high-impact edge cases handled without allowing a tiny sample to dominate?
- Is the purpose expected everyday utility, abuse resistance, fairness across archetypes, or robustness to adversarial conditions?
- Should utility outcomes be scalarized or retained as a vector until owner preference weights are specified?
- How do we avoid using observed skill popularity as a proxy for effectiveness when popularity itself is affected by price/access/availability?

**Deliverable:** scenario taxonomy, empirical-vs-normative weight policy, outcome utility definition, risk-tail policy, uncertainty/coverage protocol, and a recommendation for expected, risk-sensitive, robust, or multi-objective aggregation.

**RD9 checklist**
- [ ] Scenario taxonomy and horizon defined.
- [ ] Empirical and normative scenario weights separated.
- [ ] Opportunities and selection bias addressed.
- [ ] Rare tail direction and CVaR/robust alternatives compared.
- [ ] Archetype and character-conditioned views considered.
- [ ] Multi-objective vs scalar utility decision documented.
- [ ] Uncertainty and sparse-data rules explicit.

---

### Integration gate — when is a research direction actually finished?

An RD track is **not complete** when it has produced one attractive formula. It is complete only when it has:
- defined its estimand and boundaries;
- compared multiple credible approaches;
- named the required data and confirmed whether the data exists;
- documented assumptions, edge cases and failure modes;
- identified overlap with the other eight directions;
- recommended a method and explained why;
- recorded unresolved design choices for the owner;
- passed review and merged into the theory integration branch.

The owner and assistant then discuss the recommendation and settle its theory. No coefficient fitting, code, production PCH quote, or implementation occurs during this research stage.

---

## 3. Master objective map

Objectives O0–O9 are sequentially gated where evidence dependencies require it. O2 and O3 can be researched in parallel after O1's data manifest is ready. O4–O7 can then run as independent workstreams with shared read-only evidence. O8 integrates the theory. O9 is the final sign-off.

| Track | Research direction | Main dependencies | Completion artifact |
|---|---|---|---|
| O0 | Source baseline and evidence freeze | None | Pinned source map and current formula audit |
| O1 | Shared evidence import and coverage audit | O0 | Anonymized data bundle, manifest and data dictionary |
| RD1 | Independent capability cost | O0, O1, O3 | Primitive capability ontology and standalone-cost theory |
| RD2 | Base-stat synergy | O1, RD1 | Base-stat interaction and path-partition theory |
| RD3 | Derived-stat synergy | O1, RD1, RD2 | Derived dependency and mediated-attribution theory |
| RD4 | General mechanic synergy | O1, RD1–RD3 | Mechanic-response and outcome-attribution theory |
| RD5 | External portfolio synergy | O1, RD1, RD4 | Portfolio marginal-contribution/interaction theory |
| RD6 | Complexity and concentration | RD1, O3 | Graph complexity and concentration/aggregation theory |
| RD7 | Resource opportunity cost | O1, RD1, RD5, RD9 | Resource shadow-price and operating-cost theory |
| RD8 | Action opportunity cost | O1, RD1, RD4, RD5, RD9 | Feasible-action and scheduling opportunity theory |
| RD9 | Scenario-weighted utility | O1, RD1, RD4–RD8 | Scenario distribution, utility and risk theory |
| O10 | Integration and owner sign-off | RD1–RD9 | Non-overlapping theory, final decision tree, phase-gate approval |

**No workstream may bypass O1 by using plausible examples as substitutes for imported data.** If a table/export is unavailable, the dependent conclusion must be marked `MISSING`, and the gate must record whether the absence blocks completion or permits a clearly bounded theoretical result.

---

## 4. Objective workplans, milestones, and checklists

### O0 — Freeze the current source baseline

**Purpose:** Establish what Xahya already implements before proposing a new valuation architecture.

**Milestones**
- **M0.1 — Pin the baseline.** Record the inspected commit SHA, default branch, date, and relevant PR states.
- **M0.2 — Map the current PCH pipeline.** Trace every parameter from input to final rounding, including editor/preview parity.
- **M0.3 — Separate configuration from defaults.** Record all live setting keys and fallback values.
- **M0.4 — Review old PCH branches without wholesale merging.** Cherry-pick or reuse only independently verified relevant artifacts later.

**Current source map (`CODE-VERIFIED`, main baseline):**

| Concern | Primary source | What the workstream must establish |
|---|---|---|
| Effect base prices and potency | `lib/skills/pch.ts` | Per-type base, potency steps, element surcharge, unsupported-type behavior |
| Effect duration | `lib/skills/configured-effect-pricing.ts`, `lib/effects/duration-pricing.ts` | Per-effect multiplier, duration caps, movement duration, rounding |
| Mechanics surcharge | `lib/skills/mechanics-pricing.ts`, `lib/skills/variable-resistance.ts` | Action/condition cost and variable-resistance premium |
| Mana adjustment | `lib/skills/mana-pricing.ts` | Existing deterministic concession rule; not a general utility model |
| Speed | `lib/skills/speed-settings.ts` | Configurable reference speed stat and non-default surcharge |
| Range | `lib/skills/range-pricing.ts` | Five-metre neutral point and range adjustment |
| Cooldown | `lib/skills/cooldown.ts`, `lib/skills/cooldown-runtime.ts` | Price reduction tiers and actual availability semantics |
| Requirements | `lib/skills/effect-requirements.ts` | Requirement discounts, deduplication, cap, activation enforcement |
| Unified upgrade quote | `lib/skills/upgrade.ts` | Current order of operations and canonical server-side path |
| Character effective stats | `lib/stats/effective.ts` | Modifiers, equipment, perks, mechanic multipliers, derived overrides |
| Derived stat catalogue | `lib/stats/engine.ts`, `lib/stats/dynamic.ts` | Configurable formulas and fallbacks |
| Combat result/state | `lib/combat/turn-engine.ts`, `app/api/combat/[id]/actions/route.ts` | Event types, outcomes, encounter-local resources, persistence |
| Skill runtime | `lib/skills/mechanics-runtime.ts`, `app/api/characters/[id]/skills/tick/route.ts` | Which costs are really charged, in which context |

**Current formula order that must be preserved as a baseline, not assumed to be the future design:**

1. Sum configured, duration-adjusted per-effect prices (rounding is performed per effect).
2. Add mechanics surcharge.
3. Apply mana adjustment.
4. Add custom-speed surcharge.
5. Apply range adjustment.
6. Apply cooldown discount.
7. Apply effect-requirement discount.
8. Enforce minimum/zero-cost exceptions and final validation.

The current source expresses this in `priceUpgrade` in `lib/skills/upgrade.ts`. Note that maintenance cost, accumulation cost, and accumulation-per-tick are stored on skills, but they are not included in that PCH pricing pipeline. They must be researched under O7 rather than silently treated as already priced.

**Milestone M0.4 branch findings**
- PR #104 is merged; its cooldown price/runtime behavior is part of the current baseline.
- `feature/skill-pch-audit-foundation` is substantially diverged from current main (11 commits ahead, 512 behind at inspection); its diff against main was limited to a legacy PCH module and small stat/test edits. Do not merge the branch wholesale.
- `feature/pch-character-balance` was behind current main with no unique ahead commits in the comparison. Do not use it as a base.
- Existing work on combat, generic skills, skill mechanics, stats, and variable resistance is to be read as source evidence, not merged as part of this theory project.

**O0 checklist**
- [ ] Commit and PR baseline recorded.
- [ ] Current PCH inputs and exact operation order mapped.
- [ ] Every live setting key and fallback identified.
- [ ] Existing runtime charging behavior traced separately from stored fields.
- [ ] Legacy branches reviewed; no stale branch selected as integration base.
- [ ] No production code changed.

**Exit gate:** reviewer can explain the existing quote from request payload to final integer PCH and identify every runtime behavior that is not represented in that quote.

---

### O1 — Import the evidence bundle and audit coverage

**Purpose:** Build a read-only, versioned evidence base before making claims about actual characters, skill ownership, use frequency, win rates, or resource scarcity.

**Important access status:** The connected GitHub interface exposes source files, migrations, and PRs. It does **not** expose the live Xahya Postgres/Supabase records in this session. Consequently, production character rows, skills, encounter histories, resource histories, and behaviour frequencies have not been imported here. This is an explicit data dependency, not permission to fabricate records. Obtain a read-only database export or a project-authorized database connection before O1 can pass.

#### Required import inventory

| Dataset | Tables / stored sources | Required fields and purpose |
|---|---|---|
| Character identity/context | `Character`, `Race` | Internal join ID, pseudonymous display key, race, creation date, relevant status; no personal account data in analysis artefacts |
| Core stats | `CharacterStat` | STR, AGI, CON, INT, WIS, CHA, SPI, LCK |
| Dynamic stats | `CharacterStatValue` | Every `statKey` and value, including custom basic stats |
| Effective modifiers | `CharacterModifier` | Stat, amount, source, expiry; retain time semantics |
| Derived stat definitions | `AppSetting.statistics.catalog.v1` | Active flags, keys/codes, formula, order, defaults |
| General mechanic map | `AppSetting.statistics.mechanics.v1` | Mechanic-to-stat assignment; do not assume defaults are active |
| Items and equipment | `CharacterItem`, `Item` | Ownership, equipped flag, item effects, stat targets, effect values |
| Perks | `CharacterPerk`, `Perk` | Assigned perks and effect payloads |
| Persistent resources | `CharacterResource` | Current mana, karma, money, level-up points; snapshot time |
| Skill corpus | `Skill` | All statuses, category, effects, mechanics, requirements, costs, duration, range, speed, cooldown, ownership, approval timestamps, lineage and grant metadata |
| Skill runtime state | `CharacterSkillState` | Active flag, accumulations, total ticks, last tick timestamp |
| Generic catalogue | `GenericSkillTemplate` | Enabled state, parent lineage, payload, element choice; template snapshots vs acquired skill instances |
| Racial catalogue | `raceSkill` and related race grants | Racial effects, mana/maintenance/cooldown and zero-PCH grant semantics |
| Combat encounters | `CombatSession` | Full `lastAction.combatV1` snapshots/logs, NPC snapshots, mechanics state, round/tick/status, timestamps |
| Maze/world contexts | Maze positions/rooms and their `mechanicsState` | Scenario state, active fields, conditions, character location where relevant |
| Audit trail | `AuditLog` | Action, entity, character, details, actor class, timestamp; audit-event coverage analysis |
| Pricing configuration | `AppSetting` keys listed below | Actual active PCH configuration, not defaults alone |
| Relevant source history | Git commit/PR metadata | Establish when a rule was introduced and which code version governed each observation |

**Pricing configuration keys to export verbatim from `AppSetting`:**
- `skills.effect-pricing.v1`
- `skills.duration-pricing.v1`
- `skills.narrative-effect-cards.v1`
- `skills.default-attack-speed-stat.v1`
- `statistics.catalog.v1`
- `statistics.mechanics.v1`
- `statistics.balance.v1`
- `world.elements.v1`
- Any additional setting read by the effect catalogue, PCH preview, resource rules, or combat/maze resolvers discovered during source audit.

Also export the effective source version/commit and deployment period associated with each historical encounter, where available. A skill price stored on a row is not proof that the same formula/version was used when it was purchased.

#### Import protocol and manifest

- [ ] Obtain a read-only snapshot; do not mutate production rows.
- [ ] Export only relevant tables/columns; exclude passwords, authentication secrets, private user identifiers, and unrelated personal data.
- [ ] Pseudonymise character/user IDs in research files while preserving deterministic join keys in a protected mapping.
- [ ] Include all rows required to reconstruct relationships; do not sample only high-level characters.
- [ ] Capture timestamp/timezone, export query, schema version, row count, null count, and file checksum per table.
- [ ] Keep raw export immutable; perform transformations only in a separate derived layer.
- [ ] Record missing tables, truncated histories, and retention limits.
- [ ] Separate live DB records from test fixtures, seeded examples, documentation examples, and player-reported cases.
- [ ] Confirm whether encounter #9 (user-reported as a recently played encounter) exists and whether its stored action log is still available; record it as a case study only after matching the identifier.

**O1 deliverables**
1. `data-manifest.md`: table/source, export time, schema/source version, row count, coverage period, hash, PII treatment, known gaps.
2. `data-dictionary.md`: field meaning, units, enum values, relationship keys, nullable semantics.
3. `data-quality-report.md`: completeness, duplicates, orphan references, schema drift, missing values, timeline coverage.
4. An anonymized, read-only evidence bundle stored outside public source control unless the owner explicitly approves an appropriate private location.

**Exit gate:** every downstream workstream can request a named dataset and know whether it is complete, current, and representative. Production telemetry must not be pasted into public GitHub docs.

---

### O2 — Construct the layered stat and mechanic dependency matrices

**Purpose:** Identify the effect of every base-stat change on derived statistics and general character mechanics, using the active catalogue and effective-stat resolver.

#### Matrices to produce

1. **Base-to-derived matrix `J_BD`**  
   Rows: active derived statistics. Columns: base stats (the eight core stats plus every active custom basic stat).  
   Each cell records the local influence of a change in one base stat on one derived stat, formula provenance, domain/range, and any piecewise/threshold behavior.

2. **Derived-to-mechanics matrix `J_DM`**  
   Rows: general mechanics (combat speed, maze stealth/detection, casino/blackjack influence, room generation, item/treasure chance, and any additional active mechanics).  
   Columns: active base/derived statistics selected in the live configuration.  
   Include actual configured mappings from `statistics.mechanics.v1`, not just the defaults in `lib/stats/mechanics.ts`.

3. **Effective-stat layer map `L_eff`**  
   Trace the transformations from stored base values through temporary modifiers, equipped items, perks, active status/mechanics multipliers, derived formulas, and direct derived-stat modifiers. Preserve ordering and stacking semantics.

4. **Mechanic-to-action/outcome map `J_MA`**  
   Map mechanics to the actual actions/outcomes they can influence: attack, defense, precision, dodge, critical, action ticks, HP/mana capacity, concealment/detection, and other world systems.

#### Known fallback formula matrix (`CODE-VERIFIED`, not assumed to be active for every character)

Rows in derived layer:
- `maxHp = 10 + 2·CON`
- `maxMana = 5 + INT + SPI`
- `physicalAttack = STR + AGI/4`
- `magicAttack = INT + SPI`
- `physicalDefense = CON + AGI/4`
- `magicDefense = SPI + WIS`
- `precision = AGI/2 + INT/2 + WIS/2 + SPI/2 + LCK/3`
- `critical = 2·LCK + precision/10 + WIS/2`
- `discovery = LCK + WIS`
- `miracle = LCK + SPI/2 + CHA/2`
- `intimidation = CHA + STR`
- `conquest = CHA + LCK`
- `race = min(AGI, STR) + CON/4`
- `dodge = 3·LCK + AGI + WIS/2`
- `stealth = AGI + INT/2 − SPI/10`
- `detection = WIS + LCK/3`

These are the fallback formulas in `lib/stats/derived.ts`. `lib/stats/engine.ts` can calculate an administrator-configured derived-stat catalogue from `statistics.catalog.v1`. The live catalogue takes precedence for the actual character environment. The formula `min(AGI,STR)` is piecewise: its local influence changes when AGI and STR exchange which is smaller. Mark such regions instead of pretending one global linear coefficient exists.

#### Explicit fallback coefficient matrix `J_BD^{fallback}` (`DERIVED-FROM-CODE`)

Columns are input base statistics; rows are output derived statistics. Values are local formula coefficients, not empirical importance weights. A dash denotes zero direct influence.

| Derived output | STR | AGI | CON | INT | WIS | CHA | SPI | LCK |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Max HP | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| Max mana | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 |
| Physical attack | 1 | 0.25 | 0 | 0 | 0 | 0 | 0 | 0 |
| Magic attack | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 |
| Physical defense | 0 | 0.25 | 1 | 0 | 0 | 0 | 0 | 0 |
| Magic defense | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 |
| Precision | 0 | 0.5 | 0 | 0.5 | 0.5 | 0 | 0.5 | 0.3333… |
| Critical | 0 | 0.05 | 0 | 0.05 | 0.55 | 0 | 0.05 | 2.0333… |
| Discovery | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| Miracle | 0 | 0 | 0 | 0 | 0 | 0.5 | 0.5 | 1 |
| Intimidation | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Conquest | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| Race | conditional | conditional | 0.25 | 0 | 0 | 0 | 0 | 0 |
| Dodge | 0 | 1 | 0 | 0 | 0.5 | 0 | 0 | 3 |
| Stealth | 0 | 1 | 0 | 0.5 | 0 | 0 | -0.1 | 0 |
| Detection | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.3333… |

**Critical row notes**
- `Critical` includes the indirect contribution through `precision/10`; its WIS coefficient is `0.5 + 0.5/10 = 0.55`, and its LCK coefficient is `2 + (1/3)/10 = 2.0333…`.
- `Race` is not a fixed linear row: when STR<AGI, the STR coefficient is 1 and AGI is 0; when AGI<STR, AGI is 1 and STR is 0; at equality the function is non-differentiable. CON remains 0.25.
- Values above describe the *fallback* formulas only. Apply the live `statistics.catalog.v1`, including custom stats, when reconstructing actual character snapshots.

#### Default general-mechanic mapping `M_{default}` (`CODE-VERIFIED`)

Source: `lib/stats/mechanics.ts`. This is a default mapping, not proof of the live administrator-selected mapping.

| Mechanic key | Default controlling stat |
|---|---|
| `mazeStealth` | `stealth` |
| `mazeDetection` | `detection` |
| `casinoInfluence` | `luck` |
| `blackjackInfluence` | `luck` |
| `mazeRoomGeneration` | `luck` |
| `mazeItemChance` | `luck` |
| `mazeTreasureMoney` | `luck` |
| `combatSpeed` | `agility` |

These mappings are administrator-overridable through `statistics.mechanics.v1`; import that live setting and record every difference before treating this matrix as operative.

#### Required matrix metadata

Every cell or edge must carry:
- source stat/formula/configuration key and code commit;
- evidence label;
- local influence and unit;
- active/inactive status and applicability domain;
- effective-stat modifiers that change the input;
- frequency of relevant gameplay opportunities (only when observed);
- outcome consequence/severity (separately justified);
- nonlinear, threshold, saturation, or discontinuity flag;
- confidence and missing-data marker.

**O2 checklist**
- [ ] Eight core stats and all active custom stats imported.
- [ ] Live derived formulas imported and compared with fallback formulas.
- [ ] Effective-stat stacking order reconstructed.
- [ ] Mechanics-to-stat mappings imported, including administrator overrides.
- [ ] Base → derived, derived → mechanics, and mechanics → action/outcome matrices produced.
- [ ] Nonlinear/threshold regions explicitly annotated.
- [ ] Direct derived-stat effects distinguished from inherited base-stat effects.
- [ ] No frequency weights invented from formula structure.

**Exit gate:** a reviewer can trace any claimed stat contribution back to the active formula and active modifier layers for a named anonymized character snapshot.

---

### O3 — Import and normalize the real skill corpus into activation graphs

**Purpose:** Understand what a skill actually enables, under which conditions, at what cost, and with what constraints. Do not use an effect list as a substitute for operational semantics.

#### Production corpus to normalize

- All character skill rows across statuses: pending, approved, rejected, and any archived/otherwise retained state.
- Generic templates and full ancestry chain, plus acquired character-specific snapshots.
- Racial catalogue entries and grant records, including zero-cost/native grants.
- Skill copying, temporary theft, and upgrade state where it changes ownership, availability, or the effective payload.
- Effect catalogue and active pricing metadata.
- Declarative mechanics: activation conditions, rules, rule events, conditions, linked skills, actions, variable resistance.
- Passive conditions, effect requirements, prerequisites, skill cooldowns, durations, ranges, speeds, target scope, category and combat type.
- Runtime skill state and observed activation/deactivation/turn behaviour where records exist.

#### Skill graph contract

Represent each capability as `G_s=(V,E)`, where node types include:
- **Condition nodes:** status, stat threshold, resource state, event, field/exposure threshold, skill-active prerequisite, target state, contextual restriction.
- **Action nodes:** effect, stat change, resource action, combat action, field/status action, utility or narrative output.
- **State nodes:** active skill, cooldown state, accumulated exposure, buffs/statuses, environment/position, resource balance.
- **Edges:** `requires`, `enables`, `modifies`, `multiplies`, `triggers`, `suppresses`, `terminates`, `shares-resource-with`, `competes-for-action-with`.

Each skill must also have an **activation envelope**:
- trigger/activation event;
- action points/ticks and initiative timing;
- activation and maintenance resources;
- accumulation and duration model;
- cooldown and environment;
- target/scope/area/range;
- linked/prerequisite skills;
- termination/cancellation rule;
- counterplay and failure conditions.

A multi-effect skill remains one priced capability only if the effects share a meaningful activation envelope. Independently activatable modes with separate triggers, cooldowns, resource commitments, or target rules must be evaluated as distinct capabilities for theory purposes.

#### Existing examples — keep provenance separated

| Example | Source | Evidence class | Use in theory |
|---|---|---|---|
| `Sikatā` variable-resistance example (Magic Defense base, progressive formula, ×3 cap, threshold 50) | `docs/skill-mechanics.md` | `TEST/DOCUMENTATION EXAMPLE` | Demonstrates parameterized nonlinear resistance; verify any live instance from DB |
| `W002 + Tierra`, 10 mana, 7m, reported 14 PCH | `tests/skill-pricing-parity.test.cjs` | `TEST-FIXTURE / PRICE CONTRACT` | Reconstruct current price pipeline; not empirical balance evidence |
| `Escudo base` and `Escudo elemental` | `tests/generic-skill-catalog.test.cjs` | `TEST-FIXTURE` | Root price 5, specialized total 12, incremental specialization price 7 in the test's mock quote |
| `Rayo` and `Curar` | `tests/combat-approved-skill-casting.test.mjs` | `TEST-FIXTURE` | Offensive vs support skill execution, mana/cooldown; sample actors are fabricated |
| `Guha` (character ID 101) and `Other player` (ID 102) | `tests/combat-approved-skill-casting.test.mjs` | `TEST-FIXTURE` | Combat engine regression fixture only; must never be merged into production character dataset |
| SPI vs strongest WIS/CHA/SPI resistance | `tests/willpower-clash.test.mjs` | `TEST-FIXTURE / RULE CONTRACT` | Shows that stat utility is context-sensitive and action-specific |

The generic catalogue documentation says no templates are automatically seeded by default. Therefore the real template inventory must come from the database export, not from the test examples or a presumed standard list.

**O3 checklist**
- [ ] All production skills/templates/racial skills imported.
- [ ] Test fixtures and documentation examples stored in a separate fixture register.
- [ ] Every skill graph has an activation envelope.
- [ ] Effect and mechanics conditions/actions represented as typed nodes.
- [ ] Generic inheritance and purchased snapshots resolved without double-counting ancestors.
- [ ] Native/racial/free capabilities clearly marked.
- [ ] Independently activatable modes separated where necessary.
- [ ] Unimplemented/narrative-only effects distinguished from resolved runtime effects.
- [ ] Unknown or manual GM adjudication recorded as a fidelity limitation.

**Exit gate:** each sampled real skill can be reconstructed from its stored payload and linked to the exact runtime path that executes it.

---

### O4 — Internal synergy: base, derived, and general mechanics

**Purpose:** Establish where effects reinforce, duplicate, suppress, or change one another inside a single skill or within the capability graph, while keeping three layers separate.

#### Layer A — Base-stat synergy `S_B`
- Determine whether simultaneous base-stat changes yield more/less practical capability than the sum of isolated changes.
- Distinguish direct boosts from boosts that alter a shared upstream stat.
- Capture saturation, caps, minimums, and conditions.

#### Layer B — Derived-stat synergy `S_D`
- Trace multi-stat changes through `J_BD` and the active derived formulas.
- Identify when multiple effects converge on the same derived output.
- Identify when a direct derived-stat bonus duplicates an indirect base-stat path.
- Include piecewise behavior and the order of multipliers/flat bonuses.

#### Layer C — General mechanics synergy `S_M`
- Determine how stat changes interact with action points/ticks, initiative, movement, attack/defense contests, detection, environment, and other active systems.
- Include effect stacking and competing rules.
- Separate guaranteed rule interactions from context-dependent triggers.

#### Interaction method to define (theoretical, no calculations yet)

For any pair of parameter changes (i,j), the second-order interaction concept is:

`H_{ij}=U(x+\Delta_i+\Delta_j)-U(x+\Delta_i)-U(x+\Delta_j)+U(x)`

Interpretation:
- positive: complementarity;
- negative: redundancy, antagonism, or diminishing returns;
- approximately zero: additive under that context.

This is a definition for the research protocol. It is not a request to compute the matrix until O9 has passed. For interactions involving three or more effects, determine whether a higher-order decomposition or portfolio attribution is needed; do not assume all pairwise terms can be summed independently.

**O4 checklist**
- [ ] Separate base/derived/mechanics interaction layers documented.
- [ ] Redundant routes to the same outcome identified.
- [ ] Pairwise and higher-order interactions classified.
- [ ] Conditions and joint probabilities retained (not multiplied as if independent without evidence).
- [ ] Caps, thresholds, stacking order, and saturation documented.
- [ ] Interactions that are already reflected in the outcome utility are flagged against double-counting.

**Exit gate:** every proposed internal synergy term has a clear causal path, a non-overlapping definition, and a context of validity.

---

### O5 — External synergy and portfolio interaction

**Purpose:** Value a candidate skill relative to the character's *existing* skills and capabilities, not in isolation alone.

For current portfolio (P) and candidate (s), define the theoretical portfolio interaction:

`S_E(s,P)=V(P\cup\{s\})-V(P)-V(\{s\})+V(\varnothing)`

Classification:
- **Complementarity:** one skill enables or amplifies another.
- **Redundancy:** a skill adds a capability the character already has through another skill, racial trait, item, perk, or derived effect.
- **Conflict:** conditions, targets, elements, statuses, or mechanics make the skills interfere.
- **Shared-resource competition:** both draw from the same constrained mana/HP/maintenance pool.
- **Action competition:** skills compete for the same initiative/action window.
- **Cooldown scheduling interaction:** overlapping cooldowns change feasible action schedules.
- **Prerequisite dependency:** one skill is required for another to function or be acquired.
- **Portfolio coverage:** the skill adds a missing capability to an otherwise narrow set.

Include:
- all approved and usable skills on the character;
- racial/native grants;
- equipment and perks that already provide equivalent capability;
- copied, stolen, temporary, disabled, or conditionally usable skills;
- generic base/specialization lineage;
- skill interaction engine links (e.g. active-skill prerequisites and linked rules).

Use portfolio-level marginal value as the authoritative concept. Pairwise interaction is a diagnostic; where three or more skills interact, investigate higher-order attribution (e.g. Shapley-style allocation) rather than forcing all effects into pairwise sums.

**O5 checklist**
- [ ] Character portfolio assembled, including non-skill capabilities.
- [ ] Requirement/prerequisite and linked-skill edges resolved.
- [ ] Redundancy and complementarity mapped.
- [ ] Shared resource/action/cooldown constraints included.
- [ ] Native/free capability baselines separated from paid acquisition.
- [ ] Higher-order interaction risk documented.

**Exit gate:** the model can distinguish “strong in isolation” from “useful to this portfolio” without redefining intrinsic PCH.

---

### O6 — Recorded behaviour, outcomes, success rates, and scenario frequencies

**Purpose:** Replace assumed usage frequency with evidence where the project actually records it.

#### Sources already present in the codebase

- `AuditLog`: action, entity, character, details, timestamp. The management log endpoint groups event families, but only events explicitly passed through `recordAuditEvent` exist in this table.
- `CombatSession.lastAction.combatV1.log`: encounter-level event log containing action/result summaries and structured fields.
- `CharacterSkillState`: active flag, accumulated value, total ticks, timestamp; this is state, not a complete event ledger.
- Maze room/character state: environmental mechanics, status, field/exposure state.
- Stat updates: `STAT_UPDATE` audit events include before/after snapshots for core stats and supplied custom stats.
- Resource adjustments: relevant audit events may exist, but coverage must be checked against all code paths that can mutate resources.

#### Behaviour/outcome dimensions to extract

- Skill activation attempts, successful activation, refusal/failure reason, cancellation, and completion.
- Trigger/condition frequency and conditional success.
- Action selection frequency by character, NPC/player role, scenario, combat state, and skill category.
- Attack attempts, contacts, dodges, defenses, criticals, damage, healing, control/utility result, and encounter outcome.
- Skill use per available opportunity, not merely raw count.
- Cooldown wait and fraction of encounters in which cooldown constrained reuse.
- Effective skill duration, time active, total accumulation ticks, and observed maintenance burden.
- Scenario exposure: duel, multi-opponent, boss/training NPC, attrition, maze/exploration, social, casino, and other operational contexts.
- Character/player behaviour heterogeneity without treating one user's preferences as universal game utility.

#### Success-rate definition must be outcome-specific

Do not create one universal “skill success rate.” For example:
- **Activation success:** legal/condition-valid activation attempts divided by all activation attempts.
- **Hit/contact rate:** contact events divided by eligible attack resolutions.
- **Defense success:** avoided/mitigated attacks divided by eligible defensive responses, with defense type separated.
- **Condition activation rate:** observed triggers divided by opportunities where the condition could have been true.
- **Outcome contribution:** change in HP/damage/control/position/other defined outcome, measured over a stated horizon.

Denominators must be opportunity-aware. A skill that was never used because it was unavailable is not the same as a skill attempted and failed.

#### Known telemetry limits (`CODE-VERIFIED`)
- Combat actions are persisted into `CombatSession.lastAction.combatV1`; current combat log is capped to the most recent 100 entries in the in-memory/persisted combat state.
- Combat result logs contain outcome proxies such as damage, critical/contact, defense, knockback, skill ID, and mana cost. Raw random draws are not persisted as result records in the combat state.
- Therefore some conditional outcome rates may be estimated from retained structured results, but there is no complete raw-roll dataset or unlimited historical action ledger in the inspected schema.
- `AuditLog` only records actions explicitly sent to `recordAuditEvent`; its existence does not prove every activation, use, failure, or resource mutation is captured.
- Do not use unit-test outcomes as live success-rate data.
- Do not infer win rates from a handful of encounters; report sample size, selection bias, censoring, and confidence.

**O6 checklist**
- [ ] Audit action taxonomy mapped to actual logging callsites.
- [ ] Combat event retention and truncation assessed.
- [ ] Success/failure definitions approved per outcome type.
- [ ] Eligible opportunities and denominators defined.
- [ ] Production events separated from tests/fixtures and simulated NPC behaviour.
- [ ] Scenario frequencies measured only where the log coverage supports them.
- [ ] Missing/instrumentation gaps recorded instead of imputed.

**Exit gate:** every empirical frequency/rate has an explicit population, denominator, timeframe, sample size, data provenance, and uncertainty statement.

---

### O7 — Resource, action, timing, and opportunity economics

**Purpose:** Establish the real cost of using a skill, not just the current acquisition-price concession.

#### Resource vectors to map
- activation mana;
- maintenance per turn/time interval;
- accumulation cost and accumulation gained per tick;
- HP sacrifice or exposure;
- money/karma/level-up points where relevant;
- consumables, item durability, charges, or limited-use permissions;
- resource regeneration/renewal and time needed to recover;
- encounter-local vs persistent resource pools.

#### Runtime facts to audit

- `CharacterResource.currentMana` is a persistent character-sheet resource and is nullable until initialized.
- `lib/skills/mechanics-runtime.ts` debits persistent character mana at activation for skills with executable mechanics rules or elemental imbue; the current legacy accumulation-only path is intentionally not retroactively charged by this mechanism.
- Combat skill casting also uses an encounter-local mana snapshot in `CombatState.mana`; this is not the same ledger as the persistent character-sheet resource.
- `maintenanceCost`, `accumulationCost`, and `accumulationPerTick` are stored on skill records. `advanceCharacterSkillTicks` advances accumulations and total ticks; this function itself does not show a comprehensive maintenance/accumulation resource debit. Trace every write/debit path before declaring those fields operational charges.
- Cooldowns are enforced in combat rounds or by a 100-second-per-turn out-of-combat approximation. That has a distinct operational meaning from the PCH discount tier.
- Combat action time uses ticks and initiative. In the inspected turn engine, base action timing is derived from effective speed, and Constitution also affects action-point budget. Verify exact formulas/version for the final map.

#### Economic theory to settle

- Resource cost should be contextual to balance and renewal scarcity, not treated as one universal fixed exchange rate.
- Define a marginal shadow price for each resource, conditioned on current balance, regeneration, expected future demand, and the set of actions made infeasible by spending it.
- Separate direct resource disutility from the value of lost future actions. Count each opportunity loss once.
- Evaluate cooldown as a constraint on the feasible action schedule, not merely a percentage discount.
- Define action opportunity cost by comparing a skill action with the best feasible alternative in the same time/initiative window.
- Distinguish “cost to buy the capability” from “cost to operate the capability.”

**O7 checklist**
- [ ] Every resource field has source, unit, update path, and time semantics.
- [ ] Persistent and encounter-local mana are not conflated.
- [ ] Activation/maintenance/accumulation debits traced end-to-end.
- [ ] Resource regeneration and replenishment history imported where available.
- [ ] Cooldown and action-tick semantics documented by context.
- [ ] Action competition and opportunity costs defined.
- [ ] Current fixed mana-to-PCH rule classified as legacy pricing policy, not assumed universal economic truth.

**Exit gate:** for each skill class, reviewer can distinguish acquisition price, activation cost, recurring cost, action time, cooldown restriction, and expected resource opportunity cost.

---

### O8 — Complexity, aggregation, scaling, and uncertainty policy

**Purpose:** Decide how the theoretical components can be aggregated without order artifacts, duplicated value, or uncontrolled complexity premiums.

#### Complexity measures to compare
For independent parameter/effect costs (C_i):
- mean (mu_C = sum_i C_i/n);
- peak (C_{max}=max_i C_i);
- concentration (C_{max}/sum_i C_i);
- squared peak (C_{max}^2/sum_i C_i);
- dependency count, branch count, graph depth, and condition fan-out;
- a smooth maximum/mean interpolation such as normalized log-sum-exp:
  `Lτ(C)=τ·log((1/n)·Σ exp(Cᵢ/τ))`.

The workstream must compare these under invariants: permutation independence, effect duplication, splitting/combining equivalent nodes, one extreme effect among small effects, and equivalent graphs with different node ordering. Complexity must be bounded and must not award extra price simply for verbose representation of the same capability.

#### Scaling / aggregation policy questions

- Are direct independent costs additive or should some classes use max/softmax treatment?
- Is the principal purpose to price capability power, complexity/rarity of construction, or both?
- Should positive and negative synergy have symmetric caps?
- Should discounts be applied sequentially or combined before one rounding step? Current rounding order must be documented; changing it requires a deliberate design rule.
- At which stage should mana/cooldown/requirements/range/speed alter intrinsic PCH, if at all?
- Are requirements a genuine capability dependency, an acquisition restriction, or both?
- How should zero-cost racial/native capabilities, copies, temporary thefts, and special acquisition cases be represented?
- Which terms affect intrinsic PCH and which only affect personal marginal utility?
- How should uncertainty change an estimate: interval, confidence grade, bounded conservative adjustment, or “not enough evidence”?

#### Aggregation principles that must be upheld
- order/permutation invariance;
- no artificial value from duplicate effects or duplicate paths;
- no double-counting of a synergy already reflected in outcome utility;
- no false precision when records are missing;
- monotonicity where logically required (e.g. greater feasible activation frequency cannot reduce gross capability absent a real counter-effect);
- clear separation of capability, complexity, resource economics, and outcome performance;
- stable intrinsic price under a standardized reference context;
- context-specific utility reported separately;
- transparent audit trail from final category/decision to imported evidence.

**O8 deliverables**
- a comparison of additive, maximum, softmax/log-sum-exp, and bounded hybrid aggregation families;
- a component inclusion/exclusion table for intrinsic PCH vs personal utility;
- an anti-double-counting map;
- a rounding/discount-order policy recommendation;
- explicit boundary and exception policy;
- uncertainty and insufficient-data handling.

**O8 checklist**
- [ ] Mean, max, softmax, squared-peak, and dependency metrics compared.
- [ ] Representation invariance tested conceptually.
- [ ] Synergy and outcome utility kept non-overlapping.
- [ ] Resource/action costs counted once.
- [ ] Discount and rounding order has a justified policy.
- [ ] Intrinsic and personal valuations separated.
- [ ] Missing-data and uncertainty policy explicit.
- [ ] No numeric coefficient presented as calibrated without empirical and design basis.

**Exit gate:** there is one coherent theoretical aggregation design, plus documented rejected alternatives and reasons for rejecting them.

---

### O9 — Integrate and sign off the theory

**Purpose:** Produce the single approved theory and decision tree that computational work must implement later without reinterpretation.

**Final deliverables**
1. **Canonical valuation specification:** definitions, scope, causal relationships, graph semantics, layers, and exceptions.
2. **Master dependency matrices:** base → derived → mechanics → action/outcome, with actual live configuration and evidence labels.
3. **Skill graph corpus:** normalized examples and production sample coverage, including native/racial and generic lineage.
4. **Internal/external interaction model:** redundancy, complementarity, conflict, higher-order effects.
5. **Behaviour and scenario report:** observed usage/opportunity/outcome frequencies and limitations.
6. **Resource/action economics model:** activation/maintenance/accumulation, scarcity, timing, cooldown, opportunity cost.
7. **Aggregation policy:** exact membership and exclusion of terms, complexity treatment, discounts, rounding, uncertainty.
8. **Decision tree:** explicit order of questions, branches, exception cases, and fallback for missing evidence.
9. **Computational handoff:** a separate specification of required inputs/outputs and invariants, but no implementation.

**Final checklist**
- [ ] O0–O8 all accepted and merged.
- [ ] All production data sources have manifest entries.
- [ ] All matrices carry provenance and confidence.
- [ ] All examples tagged as production, user-reported, documentation, or test fixture.
- [ ] Behaviour statistics use valid denominators and sample windows.
- [ ] Resource debits verified in runtime, not inferred from schema fields.
- [ ] Aggregation terms are non-overlapping.
- [ ] Intrinsic PCH and character-conditioned utility are distinguished.
- [ ] Exceptions and zero-cost cases have explicit policy.
- [ ] Data gaps and unsupported contexts are disclosed.
- [ ] Owner approval recorded.
- [ ] Computational phase explicitly authorised.

**Only when every item is checked and O9 is approved may Phase B begin.**

---

## 5. Workstream branch and chat-conversation merge protocol

The durable unit of integration is a Git branch + pull request. Separate ChatGPT conversations may handle independent research objectives, but a conversation itself is not a Git branch and cannot be merged automatically. Each conversation must leave its findings in a reviewable workstream artifact and cite the same source/data snapshot.

### Integration structure

- **Current root/document branch:** `docs/pch-valuation-master-workflow` (this PR).
- **Future theory integration branch:** create from current `main` after the workflow document is accepted, e.g. `research/pch-valuation-theory`.
- **Independent workstream branches** (each targets the theory integration branch, not `main`):
  - `research/pch-data-inventory` — O1.
  - `research/pch-stat-influence` — O2.
  - `research/pch-skill-graphs` — O3.
  - `research/pch-internal-synergy` — O4.
  - `research/pch-portfolio-synergy` — O5.
  - `research/pch-behaviour-outcomes` — O6.
  - `research/pch-resource-opportunity` — O7.
  - `research/pch-aggregation-theory` — O8.
  - O9 is the integrator/review branch after all prerequisites are merged.

Each workstream owns a separate artifact under `docs/pch-valuation/` (for example, `stat-influence.md`, `skill-graphs.md`, `behaviour-outcomes.md`). Avoid having parallel branches edit the same master file; the integrator updates the master index after each accepted merge.

### Merge gates for every independent objective

A workstream PR may be merged into the integration branch only when:
1. Its stated objective and boundary are satisfied.
2. Claims are traceable to source, imported record, user report, or explicit design decision.
3. The evidence class is marked; test fixtures are never represented as production.
4. Data definitions, timeframe, sample size, missingness, and confidence are documented where relevant.
5. Its output is internally consistent with already merged workstreams.
6. Double-counting risks and unresolved questions are recorded.
7. No computational implementation or unapproved PCH change has slipped into the branch.
8. The master checklist is updated with evidence links and reviewer disposition.

**Merge sequence:** merge O1 first; merge O2 and O3 independently; then O4–O7 once their dependencies are met; merge O8 only after all inputs are present; O9 closes the theory. The final theory integration branch is then proposed to `main` in a separate review PR. No direct merge to `main` while the independent objectives are incomplete.

### Workstream handoff template

Each new conversation/workstream begins with:
- objective ID and exact deliverable;
- baseline commit and evidence bundle version;
- sources/tables allowed;
- upstream artifacts it depends on;
- claims already established vs open hypotheses;
- checklist and acceptance criteria;
- branch and target branch;
- explicit prohibition on computational work before O9.

Each workstream ends with:
- completed checklist;
- artifact path and commit;
- evidence/provenance references;
- missing data and confidence limits;
- unresolved questions;
- recommended merge decision.

---

## 6. Data-to-decision tree: required order of reasoning

The final decision tree must use this order to prevent a strong-looking effect from being priced before its actual context is known:

1. **Is the input real and versioned?**  
   If not, label it `MISSING`, `USER-REPORTED`, or `TEST-FIXTURE`; do not use it as production evidence.
2. **What is the skill's activation envelope?**  
   Define trigger, target, duration, resources, action timing, cooldown, range, and counterplay.
3. **What is the independent capability contribution?**  
   List each parameter/effect and its direct baseline value without interactions.
4. **Which base stats does it touch?**  
   Map direct and indirect paths through active character stat definitions.
5. **Which derived stats and general mechanics change?**  
   Follow active formulas and mechanic mappings; flag direct derived boosts separately.
6. **Does it interact internally with other parameters?**  
   Classify reinforcement, redundancy, saturation, suppression, or conditional interaction.
7. **Does it interact with the current portfolio?**  
   Check existing skills, racial grants, perks, equipment, prerequisites, shared actions, resources, and cooldown schedules.
8. **How often can the conditions actually occur?**  
   Use opportunity-based behavior telemetry; if unavailable, preserve as unknown or explicit design scenario.
9. **What outcomes change when it is used?**  
   Separate activation success from hit/contact, mitigation, healing, control, exploration, and encounter outcome.
10. **What does operation consume or displace?**  
    Calculate/describe activation, recurring, accumulation, resource scarcity, action time, and future lost options.
11. **How structurally complex is the graph?**  
    Measure conditions, branches, dependency depth, concentration, and independent contributions without paying twice for verbosity.
12. **Which facts belong to intrinsic acquisition price vs contextual utility?**  
    Enforce the boundary and avoid double-counting.
13. **How reliable is the conclusion?**  
    Report uncertainty; do not return a precise value when the evidence supports only a range or a qualitative classification.

This is the decision tree's required reasoning order. The team can change it only with an explicit rationale and an update to the theory specification.

---

## 7. Current known gaps and next dependency

The source audit establishes that Xahya has the structural fields and much of the runtime model needed for this research. It does **not** establish the actual distribution of character builds, production skill ownership, observed skill frequency, win rate, success rate, or time-series resource variation.

The immediate blocker for O1 is therefore a read-only anonymized export (or authorized live database read access) for the relevant tables and settings. Until that evidence is available:
- do not invent real character snapshots;
- do not use the fabricated unit-test actors as player examples;
- do not assign scenario frequencies;
- do not calibrate resource shadow prices;
- do not claim empirical skill success or balance;
- do not begin the computational phase.

**Current phase status:** O0 source-baseline inspection is substantially prepared; O1 production-data import is blocked on database access/export; O2–O9 are not started/accepted. No valuation algorithm or production price has been changed by this workflow.
