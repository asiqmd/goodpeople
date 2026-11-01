# ADR 019: Ratings are proposed by managers, settled in calibration and never change once released

**Status:** accepted for Phase 4 M2 · 2026-11-01

## Decision

### Goals are agreed, and the records measure what they can

**Agreed, not assigned:**

- **Who drafts:** a person drafts their goals, or their manager does.
- **Agreement:** the manager agrees them. A change to an agreed goal's substance (its title,
  measure, target or weight) sends it back for agreement.
- **Weights:** within a review cycle, a person's agreed goals carry weights that add up to 100%.
  The manager's goal ratings are averaged by those weights into the review's goal score.

**KPIs from the records are never typed:**

- **Attendance rate:** comes from processed attendance.
- **Output against target:** comes from daily production (the RMG pack).
- **Why:** a factory already keeps these records. A KPI that reads them cannot be argued over or
  forgotten, and a person cannot type a better number.

### A cycle fixes who is reviewed and by whom

- **Launching a cycle** creates one review per person in it, with the manager they had that
  day. Later changes of manager do not move the review, so the person who saw the work writes it.
- **Without a login:** workers start at the manager's step. Their manager reviews them alone, so
  a factory can review its lines without putting every worker in front of a screen.
- **Without a manager:** the review waits for HR, who can write it.

### Peer feedback is shown only together

- **What the person sees:** after release, only the answers together and the average rating,
  and only when at least three peers answered. The API never sends the person peers' names or
  ids.
- **What the manager and HR see:** they read the feedback with names, to weigh it.
- **Why:** with one or two answers, "anonymous" feedback is not anonymous, and people stop
  writing honestly when it can be traced back to them.

### Calibration settles ratings; the guide is never a quota

- **Proposed:** a manager's review proposes a rating. A unit's ratings are compared side by side
  against the distribution the workspace sets as a guide.
- **Final:** HR sets the final rating. A change from the proposed one records who made it and
  why.
- **No forced distribution:** the guide is shown, never enforced. A unit of strong performers
  can be rated as such.

### Released reviews never change

- **Release:** releasing a cycle needs a final rating for every review.
- **Released:** each person reads their own and acknowledges it, saying whether they agree, with
  a comment.
- **Fixed:** after release a review cannot be edited by anyone. A correction is a matter for the
  next cycle, with the disagreement on record.
- **Outcomes for M3:** final ratings and the recommendations (increment, promotion, improvement
  plan) are the input to M3's increment round, read from the released reviews only.

### Improvement plans and probation reviews record; people decide

- **Improvement plans:** a plan records the concern, the measures, the support and the check-ins.
  Closing it as not met never starts a separation or changes a job.
  - **Dismissal for misconduct** follows the Labour Act's procedure (s.23–24): a show-cause
    notice with at least seven days to answer, and an inquiry.
  - **Other termination** follows s.26, with notice or pay.
- **Probation reviews:** before a probation ends (s.4), the manager reviews it and recommends
  confirming, extending or ending it. HR acts through the existing probation actions; a
  recommendation never acts by itself.

## Why

- **One record, from goal to increment:** the goals a person agreed are what their review rates,
  and the review's outcome is what their increment is decided on. Nothing is copied into a
  spreadsheet in between.
- **Managers propose, HR settles:** managers know the work; calibration makes one manager's 4
  mean the same as another's.
- **No edits after release:** a review people have read and acknowledged is evidence, in an
  increment dispute or a dismissal inquiry. It must be the one they read.

## Consequences

- **A wrong final rating** found after release stays wrong in that cycle. The next cycle, or a
  note on the person's record, corrects course.
- **The labour lawyer** confirms the improvement plan's legal note (s.23–24, s.26) before
  companies rely on it.
- **Peer feedback** in small teams (fewer than three peers) is seen by the manager and HR only.
