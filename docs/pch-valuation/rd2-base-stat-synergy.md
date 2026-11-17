# RD2 — Base-Stat Synergy: Research Expansion

**Research ID:** RD2  
**Workstream branch:** `research/pch-rd2-base-stat-synergy`  
**Integration target:** `research/pch-valuation-integration`  
**Research status:** Open — theory design only  
**Scope:** General stat/action theory first; Xahya-specific mapping is a later validation layer.  
**Blocked work:** no coefficient fitting, production prices, executable evaluator, or implementation until RD1–RD9 are resolved and O10 is approved.

---

## 0. Research mandate

RD2 investigates how combinations of *base statistics* alter the set, quality, reliability, cost, speed, duration, scope, and risk of actions.

It is not merely a task of listing which derived statistics depend on which base statistics. It is a broader question:

> Given a state with a set of base capacities, what actions become possible, easier, more effective, more reliable, cheaper, faster, more sustainable, or more difficult—and how do combinations of those capacities change those outcomes beyond their isolated contributions?

RD2 must work in a general capability system, not assume Xahya's eight attributes, current derived-stat equations, RPG terminology, or one specific combat design. Xahya is an eventual application case.

RD2's object is the interaction between base-stat dimensions. It must distinguish:
1. **semantic dependency:** the rules say a stat affects an action;
2. **mechanical response:** changing the stat changes a measurable action property;
3. **joint interaction:** changing two or more stats together yields a non-additive result;
4. **practical relevance:** the resulting difference matters for eligible actions and contexts;
5. **valuation:** a separate policy decides how much that difference should matter to PCH.

These are not interchangeable claims. A stat can appear in a formula without being strategically important; a stat may be highly relevant because it gates a rare but decisive action; two stats can correlate in observed builds without causally interacting.

## 1. RD2 boundary and estimand

### 1.1 What RD2 owns

RD2 owns:
- base-stat ontology and semantic grouping;
- relationships among base-stat classes and subtypes;
- stat-to-action affordance relationships;
- the action classifications needed to describe those relationships;
- direct base-layer interactions;
- pairwise and higher-order interaction hypotheses;
- stat-package trade-offs and Pareto analysis;
- the distinction between intrinsic stat structure and scenario-specific realized relevance.

RD2 does **not** own the final value of derived-stat propagation (RD3), full general mechanic response (RD4), interactions with already-owned skills (RD5), graph complexity (RD6), resource shadow prices (RD7), action opportunity costs (RD8), or scenario preference weights (RD9). It must expose its interfaces to those tracks without counting their effects again.

### 1.2 Fundamental state/action model

Let:
- (x=(x_1,ldots,x_p)) be the vector of base-stat values;
- (a) be an action with a declared actor, target schema, preconditions, operation, and time semantics;
- (e) be the context (environment, opposition, ruleset, available objects, current conditions);
- (Y(a,x,e)) be the action-result vector;
- (F(a,x,e)) be its feasibility/affordance state.

Do not start by assuming that (Y) is a single scalar. Keep its dimensions separate:

[
Y=(	ext{feasibility},	ext{magnitude},	ext{success},	ext{precision},
	ext{latency},	ext{duration},	ext{scope},	ext{resource use},
	ext{risk},	ext{counterability})
]

Orient every dimension explicitly. For example, higher damage dealt may be desirable, while higher mana consumed or latency may be undesirable. A raw interaction sign is meaningless until the outcome dimension's direction is declared.

### 1.3 Pairwise interaction estimand

For a declared action/context, choose meaningful interventions (delta_i,delta_j) and define a cross-difference vector:

[
\mathbf I_{ij}(a,x,e)=
Y(a,x+\delta_i e_i+\delta_j e_j,e)
-Y(a,x+\delta_i e_i,e)
-Y(a,x+\delta_j e_j,e)
+Y(a,x,e)
]

where (e_i) is the unit vector for stat (i).

Interpretation per outcome dimension:
- **complementarity:** the joint change improves a beneficial outcome more than the isolated changes would predict;
- **substitution/redundancy:** the joint change adds less than the isolated contributions because either stat can supply a similar function or the outcome saturates;
- **antagonism/trade-off:** the combination creates a negative interaction for the chosen outcome;
- **conditional interaction:** the sign/magnitude changes with the state, target, action, or context;
- **no material interaction:** the joint response is approximately additive within the declared range.

This finite-difference definition is preferable to a universal derivative because stats may be discrete, bounded, thresholded, or piecewise. It is not yet a calculation instruction. RD2 must first decide the intervention scale.

### 1.4 Intervention scale is a research decision

A raw +1 change is not inherently comparable across Strength, Memory, Mana Capacity, Luck, or a custom stat. Compare at least three perturbation policies:
1. **equal absolute increment:** +1 stat unit;
2. **equal standardized increment:** e.g. a fixed fraction of the population spread or the valid range;
3. **equal progression investment:** the increase that consumes the same character-build budget or acquisition opportunity.

These answer different questions. Equal absolute change studies the rule's local response; standardized change studies relative sensitivity; equal investment studies build allocation. RD2 must report which one a comparison uses and should not collapse the three.

---

## 2. Ontology: classify stats without forcing one universal stat list

A robust system needs a hierarchy, but also permits cross-cutting facets. One stat may belong to one primary semantic domain and several functional roles.

### 2.1 Five levels of stat granularity

| Level | Meaning | Example |
|---|---|---|
| L0 — Measurement primitive | Mathematical/data kind | scalar, rate, probability, vector, resource balance, ordinal rating |
| L1 — Semantic domain class | What broad part of capability it describes | physical, physiological, motor, sensory, cognitive, social, magical |
| L2 — Functional stat type | What kind of quantity it is | capacity, rate, accuracy, resistance, control, affinity, regeneration |
| L3 — Concrete stat | Named and parameterized variable | Grip Strength, Working Memory, Spell Control |
| L4 — Derived/composite stat | A value computed from one or more other variables | attack power, perception score, cast stability, resilience index |

A separate classification identifies whether a concrete stat is:
- **base:** directly allocated, trained, acquired, or assigned as a primary character property;
- **derived:** computed from other properties;
- **state/resource:** current amount or temporary condition (e.g. current HP or current mana);
- **competence/proficiency:** learned mastery of a domain or technique;
- **contextual:** supplied by equipment, environment, relationship, status, or temporary effect.

Do not make current HP, skill proficiency, and an innate Force attribute siblings simply because all are numeric.

### 2.2 Semantic domain classes

These are general classes, not a mandatory game-stat sheet.

| Domain class | What it captures | Typical concrete stats | Primary action families |
|---|---|---|---|
| Physical force/power | Ability to exert force or produce mechanical work | strength, power, grip, lifting capacity | lift, strike, grapple, break, push, carry |
| Motor coordination/control | Fine and gross movement, balance, timing | dexterity, coordination, balance, motor precision | aim, manipulate, evade, craft, perform |
| Speed/reaction | Rate of movement or response | agility, reflex, reaction speed | intercept, dodge, sprint, act early |
| Physiological endurance/resilience | Sustained output, tolerance, recovery | stamina, vitality, pain tolerance, recovery | sustain, resist fatigue, survive, recover |
| Sensory/perceptual | Detecting and discriminating signals | sight, hearing, spatial awareness, sensitivity | detect, track, identify, notice, aim |
| Cognitive/processing | Transforming information into decisions | reasoning, intelligence, attention, working memory | plan, solve, infer, calculate, diagnose |
| Knowledge/learned competence | Stored domain knowledge and practiced procedures | lore, training, weapon skill, spellcraft | recall, execute technique, interpret symbols |
| Volitional/affective regulation | Sustaining intent and regulating internal state | willpower, focus, composure, emotional control | resist coercion, maintain concentration, persist |
| Social/relational | Influencing and interpreting other agents | presence, empathy, rapport, command, deception | persuade, negotiate, intimidate, coordinate |
| Magical/metaphysical | Affinity and control over non-ordinary systems | affinity, attunement, spell control, resonance | cast, bind, dispel, ward, transmute |
| Spatial/environmental | Navigating or manipulating space and surroundings | orientation, mobility, environmental attunement | navigate, climb, conceal, manipulate terrain |
| Stochastic/fate | Modifying exposure to uncertain outcomes | luck, fortune, fate bias | alter random outcomes, find opportunities |
| Resource/temporal | Holding and renewing finite operational stores | capacity, regeneration, action-point budget | sustain, repeat, pay, recover |

**Caution:** resource/temporal values often belong in a resource-state or derived layer rather than the base-stat layer. They are listed here because game designs frequently expose them as stats. RD2 must record the distinction instead of forcing a semantic choice.

### 2.3 Functional stat types

A semantic domain tells us *what kind* of capability a stat concerns. A functional type tells us *how it enters action resolution*.

| Functional type | Meaning | Common action influence |
|---|---|---|
| Capacity | Maximum load/output/amount | lifting, damage scale, memory storage |
| Rate | Change per unit time | movement, reaction, regeneration |
| Precision | Error control/resolution | aim, surgery, crafting, spell targeting |
| Reliability | Probability of successful execution | consistency, misfire resistance |
| Resistance | Opposition to an incoming effect | defense, poison, coercion, disruption |
| Control | Ability to shape or constrain an output | spell shaping, fine manipulation, emotion regulation |
| Perception/sensitivity | Signal acquisition and discrimination | detect, target, diagnose |
| Processing | Transforming inputs into decisions | planning, inference, tactical adaptation |
| Affinity/compatibility | Coupling to a specific system/material/domain | magic, technology, language, terrain |
| Efficiency | Output per resource/time | endurance, mana efficiency, tool use |
| Regeneration/recovery | Restoration of capacity or state | sustained activity, healing, recharge |
| Scope/reach | Effective distance, scale, or set size | range, area effect, social reach |
| Stability/persistence | Maintaining an effect/state under disturbance | concentration, sustained field, composure |
| Probability bias | Modifying a stochastic distribution | luck, critical chance, discovery |

A concrete stat may have more than one role. For example, a high-level “Agility” score may aggregate movement rate, reaction time and coordination; that is a potential ontology problem. A better ontology keeps those functions separable if the game rules use them differently.

### 2.4 Stat schema (conceptual contract)

The stat registry needs fields sufficient to inherit domain and type definitions while retaining concrete mechanics.

```yaml
stat_id: motor.coordination
label: Coordination
kind: base | derived | resource_state | proficiency | contextual
domain_classes:
  primary: motor_control
  facets: [physical, precision]
functional_types: [control, precision, reliability]
measurement:
  data_kind: scalar
  scale: ratio | interval | ordinal | binary | categorical
  unit: normalized_points
  range: [minimum, maximum]
  baseline: reference_value
  resolution: integer | continuous
semantics:
  higher_means: greater_control
  time_scope: persistent | per_turn | per_action | temporary
  acquisition: allocated | trained | granted | derived
dependencies:
  direct_inputs: []
  downstream_stats: []
  action_affordances: []
response:
  thresholds: []
  caps: []
  saturation: unknown
  piecewise_regions: []
evidence:
  source: source_or_record_id
  version: ruleset_version
  class: CODE_VERIFIED | DB_OBSERVED | TEST_FIXTURE | HYPOTHESIS
  confidence: qualitative_or_interval
```

The values are illustrative labels only. The actual schema should support multiple class facets, inherited type definitions, and explicit unknowns. A missing saturation curve must not default to linear.

---

## 3. Action ontology: classify every action across independent axes

The action ontology must not use mutually exclusive labels for properties that belong to different dimensions. In particular:
- **character-oriented** describes a target/recipient class;
- **object-oriented** describes a target class;
- **transitive/target-accepting** describes the operation's argument structure;
- **idempotent** describes how repeated application behaves.

An action can be magical, object-targeted, transitive, idempotent, delayed, and suppressive at the same time. Those labels are not alternatives.

### 3.1 Action dimensions

| Axis | Values/examples | Question answered |
|---|---|---|
| Domain/medium | physical, magical, mental/cognitive, social, sensory/informational, spatial, temporal, environmental/system, economic/resource, hybrid | Through what domain does the action operate? |
| Intent/result | harm, restore, protect, control, move, perceive, conceal, communicate, create, transform, bind, transfer, consume, modify, terminate | What is it trying to do? |
| Actor role | self, autonomous agent, controlled entity, group/organization, environment/system | Who initiates or performs it? |
| Target kind | self/character, other character/agent, object/item, location/field, relation/link, group/area, rule/system | What entity/state is acted upon? |
| Arity/argument structure | nullary, unary/self-state, binary actor→target, multi-target, area/set, relation/network | How many explicit operands/targets are accepted? |
| State-operation semantics | add/delta, assign/set, multiply, max/min, toggle, append, remove, create/destroy, transfer, map/transform | How does state change? |
| Algebraic properties | idempotent, non-idempotent, commutative, non-commutative, reversible, irreversible, monotone, saturating, cumulative | What happens under repetition, reordering, or inversion? |
| Temporal execution | instantaneous, duration, periodic, channelled, delayed, triggered, reactive, persistent, continuous | When and how often does it execute? |
| Causal role | enables, scales, improves reliability, reduces cost, accelerates, resists, suppresses, informs, constrains, converts | How does it change a downstream action? |
| Resolution mode | deterministic, random/probabilistic, contest, threshold, player/GM adjudicated, manual | How is the outcome decided? |

### 3.2 Idempotence is an operation property

For a state transformation (f), idempotence means:

[
f(f(x))=f(x)
]

Examples:
- “Set door state to open” is idempotent under identical repeated application if it has no repeated side effects.
- “Add +5 Strength” is not idempotent.
- “Remove poison” can be state-idempotent, but may not be event-idempotent if each application triggers a reward or cost.
- “Refresh shield duration to exactly three turns” may be idempotent; “add three turns to shield duration” is not.

Record both the state transformation and side effects. Idempotence of the final state does not imply idempotence of the complete action process.

### 3.3 Transitivity/target acceptance is argument structure

Use “target-parameterized” as the schema term and retain “transitive” as a human-readable shorthand.

Examples:
- Self-buff: actor-targeted unary action.
- Strike(target): actor plus one character target (binary relation).
- Enchant(object): actor plus object target.
- CreateField(location, radius): actor plus location and spatial parameters (multi-operand).
- Persuade(target, proposition): agent target plus semantic content.
- Detect(area, signal): target region plus signal type.

Target class and arity are independent: an action can accept a target while being object-oriented or character-oriented.

### 3.4 Action schema (conceptual contract)

```yaml
action_id: physical.strike
domain: [physical]
intent: [harm, displace]
actor:
  kind: character
target:
  kind: character
  arity: one
  selection: explicit | automatic | nearest | area
operation:
  state_change: [health_delta, position_delta]
  algebra: [additive, non_idempotent, target_dependent]
temporal:
  execution: instantaneous
  repeat: action_limited
preconditions: []
outcome_dimensions:
  - feasibility
  - hit_probability
  - magnitude
  - latency
  - resource_cost
  - counterability
resolution:
  mode: contest | probability | deterministic | adjudicated
counterplay: []
evidence:
  ruleset_version: version
  resolver: source_or_manual_reference
```

Again, this is an ontology contract, not an implementation payload.

---

## 4. Stat-to-action affordance graph

The key analytical object is not merely a stat-to-stat matrix. It is a **typed, contextual graph**:

`Stat → Action-affordance role → Action → Outcome`

A stat may connect to an action through one or more of these roles:

| Affordance role | Meaning | Typical examples |
|---|---|---|
| Enables/gates | Makes an action legal or possible | minimum strength to lift; affinity to use a school of magic |
| Scales magnitude | Increases amount/intensity | force to damage; knowledge to quality of diagnosis |
| Controls precision | Reduces error or variance | dexterity to aim; spell control to shape an area |
| Improves reliability | Raises success probability | training to execute; composure to sustain |
| Accelerates | Reduces latency or improves order | reaction speed to intercept; cognitive speed to decide |
| Sustains | Allows repeated/long execution | endurance to maintain exertion; focus to channel |
| Extends scope | Changes reach/area/number of targets | spatial sense to target; affinity to affect a domain |
| Reduces cost | Improves resource efficiency | technique to reduce stamina; control to reduce magical waste |
| Resists | Reduces incoming harm/control | resilience to injury; will to coercion |
| Acquires information | Improves detection/identification | sensory acuity to notice; reasoning to infer |
| Stabilizes | Reduces interruption/variance | concentration to maintain an effect |
| Converts/mediates | Changes one input into another output | knowledge converts clues into inference; affinity converts resource into effect |

An edge should record:
- source stat and its class/type;
- action and its full action classification;
- affordance role;
- causal status (direct rule, mediated path, empirical association, hypothesis);
- response form (linear, nonlinear, threshold, probabilistic, unknown);
- applicable range and context;
- sign/direction and affected outcome dimension;
- competing/alternative stats;
- evidence and confidence.

### 4.1 Example relationship graph

```
Force capacity ──scales──────────┐
Motor coordination ──precision───┼──> Physical strike ──> hit × impact
Perception ──target acquisition──┘

Endurance ──sustains──────────────┐
Will/focus ──stability────────────┼──> Sustained channel ──> duration × continuity
Affinity ──compatibility──────────┘

Perception ──signal acquisition───┐
Reasoning ──interpretation────────┼──> Diagnose/identify ──> correct inference
Knowledge ──domain grounding──────┘
```

This graph is an explanatory hypothesis until each edge is linked to a rule or verified experiment. It is deliberately not tied to Xahya's present stat formulas.

---

## 5. General interaction taxonomy across stat groups

Every pair or group interaction should receive one or more explicit labels. Avoid treating “synergy” as a single undifferentiated positive bonus.

| Relationship type | Formal intuition | Typical action consequence |
|---|---|---|
| Complementarity | One stat increases the marginal usefulness of another | Force produces more value when control/precision can deliver it |
| Bottleneck/conjunctive | Both are needed; the weaker one constrains the result | Strength without coordination cannot reliably execute a precise technique |
| Substitutability | Either stat can supply part of the same function | Strength or leverage may solve a physical obstacle through alternative methods |
| Redundancy | Two paths produce overlapping outcomes | Perception and a magical detection sense identify the same hidden target |
| Compensation | One weakness can be offset by another capability | Planning or social influence compensates for low physical power |
| Threshold unlock | Combined state crosses a discrete action requirement | Minimum force plus sufficient control enables safe heavy-tool operation |
| Saturation | The marginal contribution of one stat falls as another or the output rises | Additional precision adds little to an already guaranteed hit |
| Antagonism | One capability interferes with another under a rule/context | Heavy load impairs speed; intense focus narrows situational awareness |
| Mediation | A stat affects an outcome through another variable | Perception → evidence quality → reasoning → correct decision |
| Moderation/context interaction | A stat's effect changes across context | Empathy matters more in trust-building than intimidation |
| Temporal coupling | One stat changes the time window in which another is useful | Reaction speed creates more opportunities to exploit strength |
| Resource coupling | A stat changes the cost or sustainable use of another capability | Endurance supports repeated high-force actions |
| Stochastic coupling | A stat changes variance/tails rather than the mean | Luck influences rare critical/discovery outcomes |

Important distinctions:
- Complementarity and bottleneck are not identical. A smooth product can show complementarity without a hard gate; a threshold can create a gate with little effect away from the threshold.
- Substitution is not necessarily negative design. It may create build diversity.
- Correlation between two stats in character data is not proof of synergy.
- A stat does not inherently make another action harder. Difficulty must arise from a real coupling, threshold, competing resource, fixed build budget, contextual exposure, or explicit rule. Do not invent trade-offs because they sound plausible.

---

## 6. General stat-group comparison: roles, enabled actions and failure modes

These comparisons are hypotheses to guide RD2 research and scenario selection, not calibrated balance conclusions.

| Stat-group pairing | Likely relationship | Actions jointly enabled/improved | Weak-stat failure or action difficulty | Context where synergy is most relevant |
|---|---|---|---|---|
| Force × motor coordination | Complementarity; sometimes substitution | Precise strikes, grapples, lifting, tool use, controlled demolition | High force with low control causes misses, collateral damage, or inability to apply force accurately | Precision physical tasks, weapons, fragile objects |
| Force × endurance | Sustained-capacity complementarity | Carrying, repeated attacks, prolonged labor, grappling | Force may be available for one burst but not sustained sequences | Attrition, long encounters, heavy loads |
| Speed/reaction × perception | Temporal complementarity | Interception, dodging, tracking moving targets, reactive defense | Fast response without target acquisition is misdirected; perception without response may be too slow | High-speed contests, ambush, projectile response |
| Motor coordination × perception | Sensorimotor coupling | Aiming, catching, surgery, piloting, fine craft | Knowing where something is does not ensure precise motor execution | High-precision target interaction |
| Perception × reasoning | Information-to-inference mediation | Investigation, diagnosis, tactical reading, trap identification | More raw signals can increase noise without interpretation; reasoning cannot recover unobserved evidence | Investigation and uncertain environments |
| Reasoning × memory/knowledge | Retrieval/processing complementarity; sometimes substitutable | Planning, scholarship, engineering, spell preparation | Reasoning without facts is under-informed; knowledge without adaptation can be rigid | Novel problems, complex tasks |
| Will/focus × endurance | Persistence/stability complementarity | Channelled actions, resisting pain/distraction, sustained concentration | Physical endurance does not guarantee attention; focus does not prevent physiological fatigue | Long channels, stress, disruption |
| Will/focus × cognition | Control/processing complementarity | Complex spellcasting, multitask management, resisting mental intrusion | Raw reasoning can be interrupted; focus can preserve an ineffective plan | High cognitive load, contested concentration |
| Social influence × empathy/social perception | Context-dependent complementarity | Persuasion, leadership, negotiation, de-escalation | Presence without social reading can alienate; empathy without assertiveness may not secure action | Trust, negotiation, leadership |
| Affinity × control/knowledge | Compatibility/control complementarity | Spell shaping, ritual precision, transmutation, binding | High affinity may produce raw power but unstable results; knowledge/control cannot compensate for absent compatibility under hard gates | Magic or specialized systems |
| Resource capacity × efficiency | Multiplicative sustainability or substitution | Repeated casting, long missions, sustained tools | Large capacity can still be wasted; efficiency matters most under scarcity | Long-horizon action sequences |
| Luck × technical reliability | Stochastic compensation or antagonistic variance | Critical effects, discovery, rare opportunity | Luck can raise tails but should not be confused with reproducible execution skill | Low-frequency/high-impact events |
| Resilience × mobility | Substitute defense or complementarity | Escape, evasion, surviving contact, repositioning | High durability may compensate for low evasion; mobility may prevent damage entirely | Combat defense, environmental hazards |
| Spatial awareness × motor control | Perception/action complementarity | Navigation, climbing, piloting, movement through hazards | Correct spatial model without execution still fails; skilled movement without orientation risks collision | Complex terrain and movement |
| Memory/knowledge × sensory detection | Evidence-chain complementarity | Recognition, tracking, identifying disguised objects | Detection without stored patterns produces weak identification | Forensics, tracking, lore-based recognition |

### 6.1 Same-class pairings vs cross-class pairings

Do not presume that same-class stats synergize more strongly.

- **Within-class interactions** often reflect specialization, saturation, shared bottlenecks, or competing subfunctions (e.g. speed × coordination; power × endurance).
- **Cross-class interactions** often bridge stages of an action pipeline (e.g. perception × reasoning; force × coordination; affinity × control).
- **Cross-domain interactions** can dominate when an action requires a complete chain from sensing to deciding to executing.
- **Same-class redundancy** is common when two stats represent alternative ways of solving a task.
- **Cross-class redundancy** occurs when fundamentally different mechanics produce the same outcome (e.g. physical concealment vs magical invisibility).

The class taxonomy is a search and stratification device, not a prior that fixes an interaction coefficient.

---

## 7. Action-family × stat-affordance matrix

This matrix establishes the types of actions RD2 must cover. A stat may occupy multiple roles; the table is not a one-stat-per-action assignment.

| Action family | Domain | Common operation | Typical stat roles | Target topology | Main interaction patterns |
|---|---|---|---|---|---|
| Strike/attack | Physical | Apply damage/displacement | force, coordination, perception, reaction | actor→character/object | magnitude × hit; speed × perception |
| Grapple/lift/carry | Physical | Apply force and maintain load | force, motor control, endurance, balance | actor→character/object | force × control; force × endurance |
| Dodge/intercept | Physical/spatial | Change position before impact | reaction, perception, mobility, balance | self-relative to threat | perception × reaction; mobility × balance |
| Craft/repair | Physical/cognitive | Transform object state | coordination, knowledge, perception, force | actor→object | knowledge × precision; force may be a threshold |
| Cast/shape spell | Magical | Transform target/field state | affinity, control, knowledge, focus, resource capacity | actor→character/object/field | affinity × control; knowledge × focus |
| Detect/track | Sensory/informational | Acquire signal/location | sensory acuity, attention, reasoning, memory | actor→area/signal/target | perception × reasoning |
| Investigate/diagnose | Cognitive/sensory | Infer hidden state | perception, reasoning, memory, knowledge | actor→evidence/object/person | signal × interpretation × knowledge |
| Persuade/negotiate | Social/mental | Change another agent's belief/intention | empathy, social perception, presence, credibility, reasoning | actor→agent/group | influence × empathy; context moderation |
| Resist coercion/fear | Mental/volitional | Preserve internal state | will, composure, identity/knowledge | incoming target→self | will × focus; resilience × recovery |
| Navigate/climb | Spatial/physical | Change position/path | orientation, perception, coordination, endurance, force | actor→location/route | perception × motor control; endurance × distance |
| Sustain channel/guard | Temporal/physical/magical | Maintain state over time | endurance, focus, stability, resource efficiency | self/target/field | endurance × focus; resource × duration |
| Create/control field | Magical/environmental | Create or modify a region | affinity, control, spatial awareness, knowledge, capacity | actor→location/area | affinity × control × scope |
| Command/coordinate group | Social/system | Coordinate multiple actors | presence, empathy, cognition, knowledge | actor→group/network | influence × information × coordination |

For each row, research must identify:
- whether the action is available at all;
- which stats set a minimum gate;
- which stats scale magnitude;
- which stats affect success/reliability;
- which stats control execution precision;
- which stats affect speed and repeated use;
- which stats affect target scope;
- which stats resist/counter it;
- which outcomes are actually resolved by the rules.

---

## 8. The interaction model families to compare

RD2 must compare models on the same stat/action examples. No single model should be selected because it is mathematically elegant.

### M0 — Additive independent model

`U(a,x)=\sum_i w_i x_i`

- **What it captures:** isolated main effects under a fixed weighting scheme.
- **Estimated interaction impact:** zero by construction. Useful as a baseline; systematically misses genuine synergy, substitution and thresholds.
- **Where it is appropriate:** a deliberately linear rule, or a first diagnostic before interactions.
- **Failure:** force and coordination are treated as independent even where expected action output is their product.

### M1 — Linear dependency/Jacobian model

`\Delta y \approx J(x)\Delta x`

- **What it captures:** local changes along known dependency paths.
- **Estimated interaction impact:** low for pair synergy unless the downstream action response itself includes joint terms. It captures mediation and marginal influence, not necessarily complementarity.
- **Where it is appropriate:** explaining local formula propagation and screening important stat-to-outcome links.
- **Failure:** thresholds, discontinuities, saturation, and large changes outside the local neighborhood.

### M2 — Multiplicative/product model

Example:

`U(a,x)=k\,Force^\alpha\,Control^\beta\,Endurance^\gamma`

- **What it captures:** smooth complementarity; one weak factor suppresses the total; raising one factor can increase the marginal value of another.
- **Estimated interaction impact:** high for genuinely conjunctive actions such as force delivered through precision or output sustained through endurance.
- **Where it is appropriate:** actions whose success requires multiple capacities to be present together.
- **Failure:** may exaggerate synergy, behave badly near zero, and imply universal complementarity where substitution is possible.

### M3 — CES/generalized-mean model

A family that interpolates between substitutes and complements through an elasticity parameter.

- **What it captures:** alternative degrees of substitutability/complementarity.
- **Estimated interaction impact:** medium to high, depending on its elasticity setting.
- **Where it is appropriate:** actions where two stats partly substitute but neither is a complete substitute.
- **Failure:** its flexibility can hide an unjustified coefficient; the same elasticity may not apply across action families.

### M4 — Minimum/bottleneck/threshold model

`U(a,x)\propto\min(Force,Control)`

or a thresholded feasibility condition.

- **What it captures:** limiting capacity, hard prerequisites, and action unlocks.
- **Estimated interaction impact:** very high near the bottleneck/threshold; potentially negligible far from it.
- **Where it is appropriate:** lifting limits, minimum affinity, minimum knowledge, or a technique that requires both control and force.
- **Failure:** abrupt discontinuities and loss of partial credit; an inappropriate global minimum can make all actions look bottlenecked.

### M5 — Quadratic/pairwise interaction model

`U(a,x)=\beta_0+\sum_i\beta_i x_i+\sum_{i<j}\beta_{ij}x_ix_j+\cdots`

- **What it captures:** positive and negative pair interactions, plus higher-order terms when included.
- **Estimated interaction impact:** medium to high; can be precise for a defined domain and experiment but can overfit or omit high-order structure.
- **Where it is appropriate:** controlled comparisons of stat combinations within a bounded action/context region.
- **Failure:** number of terms grows rapidly; coefficients may be unstable or difficult to interpret when stats are correlated.

Factorial design is useful for identifying main effects and interactions. NIST's worked (2^3) example explicitly includes three main effects, three pair terms, and a three-way term; it also demonstrates why a fully saturated design without replication leaves no residual degrees of freedom for error estimation. Therefore, experiment design must preserve replication or another defensible uncertainty estimate. [NIST factorial interaction example](https://itl.nist.gov/div898/handbook/pri/section6/pri615.htm).

### M6 — Structural affordance/causal graph

`Stat → gate/scale/control/cost/time → action resolution → outcome`

- **What it captures:** semantic pathways, mediation, action gating, and where interactions arise.
- **Estimated interaction impact:** potentially high explanatory fidelity when mechanics are known; not a numerical interaction estimator by itself.
- **Where it is appropriate:** the primary ontology and explanation layer.
- **Failure:** a graph can encode a plausible but false relationship; source-code links do not prove behavioral importance.

### M7 — Global sensitivity/variance decomposition

Use first-order, second-order and total-order sensitivity indices to ask how much variation in an output is associated with individual stats and their interactions over a declared input distribution.

- **What it captures:** global importance and interactions across a population/range, not only at one character point.
- **Estimated interaction impact:** high for screening which stat pairs matter over the selected distribution; no inherent positive/negative utility direction.
- **Where it is appropriate:** ranking candidate interactions after a defensible response model and input distribution exist.
- **Failure:** results depend on the distribution and assumptions; standard variance decomposition is especially delicate when inputs are correlated. Sensitivity is not causation and not a valuation weight.

The European Commission JRC guide separates local from global sensitivity analysis and describes Sobol variance decomposition into first-order and interaction contributions. It is useful for identifying which inputs and combinations drive output variation, but it does not establish that the variation is beneficial or causally attributable without a valid model. [JRC uncertainty and sensitivity guide](https://publications.jrc.ec.europa.eu/repository/bitstream/JRC122132/kj-na-30432-en-n.pdf).

### M8 — Scenario-conditioned action response model

Evaluate the action outcome vector conditional on an action family, target, character state and context. Keep the result vector-valued instead of immediately reducing it to one universal utility.

- **What it captures:** whether a stat interaction matters for a particular action and under which context.
- **Estimated interaction impact:** highest practical relevance once the underlying resolver and evidence are credible.
- **Where it is appropriate:** the eventual synthesis model, using RD4/RD9 interfaces.
- **Failure:** data- and model-intensive; can confuse a context-specific result with a universal property of the stats.

### Comparative impact assessment (qualitative, not empirical)

| Model | Smooth complementarity | Substitution | Threshold unlock | Context specificity | Interpretability | Data/model burden |
|---|---|---|---|---|---|---|
| M0 Additive | None | None | None | Low | High | Low |
| M1 Jacobian | Low | Low | Poor | Local | High | Low–medium |
| M2 Product | High | Poor unless modified | Poor | Medium | Medium | Medium |
| M3 CES | Adjustable | Adjustable | Poor | Medium | Medium | Medium–high |
| M4 Min/threshold | Bottleneck form | Limited | High | Medium | High | Low–medium |
| M5 Quadratic/factorial | Pairwise | Pairwise negative terms | Approximate | Defined experimental region | Medium | Medium–high |
| M6 Structural graph | Explains cause/path | Explains alternatives | Explicit | High | High | High ontology burden |
| M7 Sobol/global sensitivity | Detects variance interaction | Does not label sign as utility | Can expose regions indirectly | Distribution-wide | Medium | High |
| M8 Scenario-conditioned response | Directly observable in response surface | Directly observable | Directly observable | Very high | Medium–high | Very high |

**RD2 provisional direction to test, not yet an approved decision:** use M6 as the semantic/dependency backbone; use finite interventions/factorial comparisons to identify local interaction direction; consider M7 only for global screening; use M8 to establish practical action relevance. M0 remains the baseline. Product/CES/min models are candidate response shapes for action-specific relationships, not a universal stat law.

---

## 9. Pareto frontier: do not collapse unlike interactions into one ranking

A stat pair may improve several dimensions but worsen others. Example: a force/coordination package might improve controlled physical output but cost more progression points, while speed/perception may improve evasion, interception, and reaction coverage with lower peak damage. Neither necessarily dominates.

### 9.1 Define the object being compared

A **stat package** is a declared allocation/intervention vector, such as `{Force + ΔF, Coordination + ΔC}`, evaluated against a fixed baseline and budget rule.

An **interaction case** is a package plus action family, context, and target class.

Do not compare a pair in one scenario against a pair in another without retaining the scenario labels.

### 9.2 Pareto dimensions

Keep these objectives separate until RD9 decides their utility weights:

1. physical output;
2. survival/resilience;
3. precision/reliability;
4. tempo/latency;
5. mobility/positioning;
6. control/utility breadth;
7. perception/information;
8. sustained performance;
9. resource efficiency;
10. versatility across action families;
11. robustness across scenarios;
12. acquisition/stat-allocation cost and counterplay exposure.

For all dimensions, declare whether higher or lower is preferable. A package dominates another only if it is no worse on all objectives and strictly better on at least one. A Pareto frontier contains the non-dominated packages; it does **not** identify one universal winner. [Pareto frontier definition and multi-objective trade-offs](https://link.springer.com/article/10.1007/s10601-026-09410-8).

### 9.3 Separate frontiers to produce

- **Action-family frontier:** packages compared for physical, magical, mental, social, sensory, spatial and environmental action families.
- **Target-topology frontier:** self-oriented vs character-targeted vs object-targeted vs area/field/network actions.
- **Character-archetype frontier:** packages compared for declared build archetypes or observed stat distributions.
- **Scenario frontier:** duel, group encounter, sustained encounter, exploration, social interaction, crafting, etc., once a scenario taxonomy is agreed.
- **Portfolio frontier:** packages compared with existing capabilities and substitutions included.
- **Investment frontier:** packages compared at equal stat/progression investment.

A global frontier may be shown as a summary, but it must not erase these conditional frontiers.

### 9.4 Pareto representation of interaction relevance

For each stat-pair/action case, record a vector:

`R_{ij,a,e}=(\text{outcome gain},\text{action coverage},\text{opportunity frequency},\text{resource burden},\text{robustness},\text{uncertainty})`

Some dimensions are benefits to maximize; others are burdens/uncertainties to minimize. Retain the vector. Do not multiply all dimensions into one “synergy score” until RD9 and owner policy decide the trade-offs.

---

## 10. Relevance: when does a mathematically real interaction matter?

A nonzero interaction term is not automatically worth a PCH premium.

Evaluate its relevance on independent dimensions:

| Relevance dimension | Research question | Evidence |
|---|---|---|
| Magnitude | How large is the joint change relative to the isolated effects and meaningful outcome scale? | Intervention response, formula, outcome distribution |
| Opportunity exposure | How often is the action actually eligible and available? | Eligible-opportunity denominator, scenario prevalence |
| Consequence criticality | Does it change survival, decisive success, access, or only a minor margin? | Outcome severity/goal definition |
| Affordance expansion | Does it unlock new actions or targets rather than only improve an existing action? | Action-feasibility set difference |
| Uniqueness | Is the capability already provided by another stat/action path? | Redundancy/portfolio map (RD5) |
| Persistence | Does the gain last, repeat, or affect later actions? | Duration and action sequence |
| Counterplay | Can an opponent/environment readily neutralize the benefit? | Resistance/defense/counter-action model |
| Confidence | Is the relationship verified, simulated, or hypothesized? | Evidence class, sample and uncertainty |

Suggested evidence grading:
- **R0 — Structural possibility:** relationship appears in the declared mechanics/graph.
- **R1 — Rule-confirmed:** a verified rule makes the stat affect the action.
- **R2 — Demonstrated response:** a controlled comparison shows a joint effect.
- **R3 — Recurrent opportunity:** logs show eligible real opportunities and recurring use.
- **R4 — Outcome-relevant:** the interaction materially changes the stated outcome objective.
- **R5 — Portfolio-relevant:** it remains valuable after redundancy, resource and action competition are considered.

This is an evidence/relevance ladder, not a multiplier schedule.

---

## 11. How much impact should each model be expected to show?

There is no defensible numerical impact estimate until action outcomes, stat distributions, intervention sizes and scenario populations are known. RD2 should produce a **qualitative prior** first, then compare model predictions under standardized thought experiments and imported examples.

| Interaction archetype | Additive M0 | Product M2 | CES M3 | Min/threshold M4 | Pairwise M5 | Graph M6 + response M8 |
|---|---|---|---|---|---|---|
| Force × coordination for precise strike | Misses joint gain | Strong positive | Positive, adjustable | Coordination bottleneck | Estimates pair term | Explains hit×impact pathway |
| Perception × reasoning for diagnosis | Misses pipeline | Strong positive if both required | Adjustable | Detection or reasoning gate | Captures pair effect | Separates acquisition from inference |
| Strength × endurance for repeated labor | Misses sustainability | Strong positive | Adjustable | Weaker capacity bottleneck | Estimates sustained interaction | Adds repeated-work horizon |
| Speed × perception for interception | Misses reaction window | Strong positive | Adjustable | Reaction/notice threshold | Captures pair effect | Models opportunity window |
| Social influence × empathy | Treats as independent | Often overstates universal complement | Context-adjustable | Rarely true hard gate | Context interaction | Negotiation context and target response |
| Luck × reliability | Treats mean as additive | Often misrepresents variance | Depends on probability model | Poor fit | Needs stochastic response | Separates mean, variance and tail |
| Affinity × magical control | Misses complementarity | Strong if both required | Adjustable | Affinity/control gate | Captures pair effect | Distinguishes compatibility from shaping |
| Mobility × resilience | Misses substitution | May falsely reward both | Can represent substitution | Can impose wrong bottleneck | Context-dependent sign | Compares avoid-damage vs absorb-damage paths |

This table is a set of model expectations, not measured Xahya outcomes. The expected impact is about *what the model would detect or represent*, not how powerful a stat actually is.

---

## 12. Information packages, schemas, and pipeline

RD2 should handle evidence in named packages. These are research/data packages, not software libraries.

### Package P0 — Ruleset and ontology manifest

Contains:
- source commit/ruleset version;
- stat taxonomy version;
- action taxonomy version;
- units and baseline conventions;
- evidence labels and missingness policy.

### Package P1 — Stat ontology package

Contains every stat definition, semantic class, functional type, measurement scale, bounds, time semantics, acquisition mode and formula/dependency references.

### Package P2 — Action ontology package

Contains action domain, intent, actor, target kinds, arity, operation semantics, algebraic properties, timing, preconditions, resolution mode and outcome dimensions.

### Package P3 — Stat-action affordance package

Contains typed stat-to-action edges: enable, scale, control, reliability, acceleration, sustain, scope, resource efficiency, resistance, perception, stability, and mediation.

### Package P4 — Character-state package

Contains anonymized state snapshots, stat distributions, build archetypes, modifiers and resource context. The package must distinguish observed characters from synthetic/reference archetypes.

### Package P5 — Interaction-case package

Contains a stat pair/group, action family, target topology, context, intervention scale, predicted interaction type, isolated vs joint outcome vectors, evidence and confidence.

### Package P6 — Outcome/frontier package

Contains outcome vectors for stat packages, Pareto dominance relationships, scenario labels, budget constraints, and confidence/coverage information.

### Required conceptual schemas

**Stat definition**
- `stat_id`
- `domain_class` and cross-cutting `facets[]`
- `functional_types[]`
- `kind`: base / derived / resource-state / proficiency / contextual
- `measurement`: scalar/vector/probability/ordinal/resource/etc., scale, unit, range, baseline
- `time_semantics`: persistent/per-action/per-turn/temporary
- `acquisition`: allocated/trained/granted/derived
- `dependencies[]`, thresholds, caps, saturation, provenance, confidence

**Action definition**
- `action_id`
- `domain[]`, `intent[]`
- `actor_kind`, `target_kind[]`, `arity`
- `operation_semantics` and algebraic properties
- `temporal_semantics`
- `preconditions[]`, `outcomes[]`
- `resolution_mode`, counterplay, resolver/provenance

**Stat-action edge**
- `stat_id`, `action_id`
- `affordance_role`
- `direct_or_mediated`
- `response_shape`
- `direction`, affected outcome component, applicable range/context
- `alternative_stats[]`
- `evidence_reference`, confidence

**Interaction case**
- `stat_ids[]`
- `action_id`, target topology, scenario/archetype
- `intervention_policy`
- `interaction_type[]`
- `isolated_outcome_refs[]`, `joint_outcome_ref`
- `estimated_interaction_vector` (unknown until evidence exists)
- `model_predictions[]`, confidence and provenance

### Information pipeline

1. **Import:** source formulas, stat definitions, action definitions, character snapshots, logs, scenario metadata.
2. **Normalize:** resolve class/type inheritance, units, bounds, baselines and versioned semantics.
3. **Classify actions:** multi-axis labels, not a single mutually exclusive category.
4. **Build affordances:** map stat roles to action resolution and outcome dimensions.
5. **Generate pair/group hypotheses:** within-class, cross-class, same-domain and cross-domain combinations.
6. **Design comparisons:** isolated vs joint stat interventions under matched actor/target/context; include equal-absolute, standardized and equal-investment comparisons.
7. **Compare response models:** additive, local linear, product/CES, bottleneck, factorial/pairwise, structural graph, global sensitivity and scenario-conditioned response.
8. **Assess relevance:** magnitude, opportunity, criticality, new affordances, uniqueness, counterplay and confidence.
9. **Produce Pareto frontiers:** separate by action family, target topology, archetype, scenario and investment budget.
10. **Conclude:** recommended interaction representation, rejected models, unresolved questions and RD2 acceptance decision.

---

## 13. Step-by-step RD2 execution workflow

| Step | Work | Inputs | Output / acceptance test |
|---|---|---|---|
| 1 | Freeze scope and estimand | RD2 mandate, RD1 boundary | Clear statement of what base-stat synergy owns/excludes |
| 2 | Build stat class/type ontology | Stat definitions, general domain theory | Inheritable multi-facet stat taxonomy |
| 3 | Build action ontology | Action definitions and examples | Orthogonal action classifications; idempotence/target arity not confused |
| 4 | Build stat-action affordance catalogue | Stat and action packages | Typed graph of enables/scales/controls/sustains/etc. |
| 5 | Classify interaction archetypes | Affordance graph | Complementary, bottleneck, substitute, redundant, compensatory, antagonistic, mediated, conditional, temporal/resource/stochastic |
| 6 | Map generic stat-group pairs | Taxonomy and action families | Broad cross-domain interaction matrix |
| 7 | Instantiate Xahya-specific examples | Live Xahya data/matrices when available | Clearly labelled application examples; no assumption that generic ontology equals Xahya mechanics |
| 8 | Compare mathematical models | Identical action/pair cases | Method comparison and qualitative expected impact |
| 9 | Define relevance ladder | Opportunities, outcomes, evidence quality | R0–R5 classification for each interaction case |
| 10 | Define Pareto objectives | Outcome vectors, budgets, scenarios | Conditional frontiers and non-dominance policy |
| 11 | Review division boundaries | RD1/RD3/RD4/RD5/RD9 interfaces | No duplicate attribution; clear handoff contracts |
| 12 | Recommend theory | All prior artifacts | Owner-reviewed RD2 recommendation; no implementation |

### RD2 review checklist

- [ ] Base-stat synergy distinguished from direct independent effect.
- [ ] General ontology not restricted to Xahya's current stat list.
- [ ] Stat class, functional type, measurement type and base/derived/resource status separated.
- [ ] Multi-facet inheritance supported.
- [ ] Action domain, intent, target, arity, operation, temporal semantics and causal role separated.
- [ ] Idempotence correctly treated as an operation property.
- [ ] Target-accepting/transitive correctly treated as argument structure.
- [ ] Character/object/environment/field/network target types included.
- [ ] Action affordability, enablement, magnitude, precision, reliability, timing, endurance, scope and resistance mapped.
- [ ] Within-class and cross-class stat pairings analyzed.
- [ ] Complementarity, substitution, bottleneck, redundancy, compensation, antagonism, mediation and context moderation distinguished.
- [ ] Intervention-scale alternatives compared.
- [ ] Additive/product/CES/minimum/quadratic/graph/Sobol/scenario-response models compared.
- [ ] Estimated model impact explicitly marked qualitative until measurements exist.
- [ ] Relevance classified separately from mathematical nonzero interaction.
- [ ] Pareto frontiers kept conditional and multi-objective.
- [ ] Data packages and conceptual schemas specified.
- [ ] RD1/RD3/RD4/RD5/RD9 double-counting boundaries reviewed.
- [ ] Final recommendation and unresolved owner decisions recorded.

**RD2 cannot be marked complete solely because the ontology and matrices exist.** It must also settle which interaction notion is intended (structural, response, causal, or valuation), which mathematical family best represents each interaction type, and how those interaction findings are kept separate from later derived/mechanic/portfolio/scenario valuations.

---

## 14. Provisional theoretical recommendation

Pending owner review, the strongest candidate architecture is:

1. **Ontology layer:** multi-facet stat classes + functional types + measurement types, separate from action classifications.
2. **Action layer:** multi-axis action schema (domain, intent, actor, target, arity, state transformation, algebraic properties, temporal pattern, causal role, resolution).
3. **Affordance layer:** a typed stat→action role graph.
4. **Interaction layer:** context-conditioned finite-difference interaction vectors, classified by complementarity/substitution/bottleneck/redundancy/etc.
5. **Model comparison layer:** additive baseline + local derivatives + factorial pairwise models + structural causal/affordance graph; reserve product/CES/minimum as action-specific response families; use Sobol/global sensitivity for screening only.
6. **Relevance layer:** magnitude, opportunity, criticality, affordance expansion, uniqueness, counterplay and confidence remain separate.
7. **Optimization layer:** Pareto frontiers over action outcome vectors for fixed budgets, separated by action family, target topology, archetype and scenario.
8. **Valuation handoff:** RD2 supplies a non-duplicated base-stat interaction description to RD3/RD4/RD5/RD9. It does not produce a universal base-stat synergy multiplier.

This recommendation is provisional because the project owner must decide whether base-stat synergy is intended to represent (a) rule-structural interaction, (b) practical action-outcome complementarity, or (c) an explicit valuation premium. RD2 should report all three separately until that policy is chosen.

---

## 15. Sources and methodological references

- NIST, *Estimate Main and Interaction Effects*: factorial models explicitly include main, pairwise and higher-order interaction terms; the example also demonstrates the importance of replication for estimating error. https://itl.nist.gov/div898/handbook/pri/section6/pri615.htm
- Azzini et al., European Commission Joint Research Centre, *Uncertainty and Sensitivity Analysis for Policy Decision Making* (2020): local/global sensitivity and variance-based decomposition, including first-order and interaction effects. https://publications.jrc.ec.europa.eu/repository/bitstream/JRC122132/kj-na-30432-en-n.pdf
- Li, Jiang & Xue, *Approximating Pareto frontiers in stochastic multi-objective optimization via hashing and randomization* (published 27 October 2026): Pareto optimality as non-dominated trade-offs across multiple objectives. https://link.springer.com/article/10.1007/s10601-026-09410-8

---

## 16. Research status and next discussion

**Completed in this document:** RD2 scope, estimand candidates, general stat ontology, action ontology, affordance roles, interaction taxonomy, broad stat-group comparison, model families, qualitative impact expectations, Pareto structure, relevance ladder, research packages, conceptual schemas, information pipeline, step-by-step milestones, review checklist, and provisional recommendation.

**Not completed:** production import, live Xahya mapping, empirical interaction estimates, coefficient selection, final theory choice, or computation.

**Next decision for the owner:** choose which meaning of “base-stat synergy” should be primary:
- **A — Structural synergy:** how the rules and formulas connect stats and actions.
- **B — Operational synergy:** how joint stats change feasible/actual action outcomes.
- **C — Valuation synergy:** how much extra purchase value the joint effect deserves.
- **D — Layered:** retain A, B and C as separate linked artifacts and do not collapse them prematurely.

The research protocol recommends D, but this is an explicit owner decision.
