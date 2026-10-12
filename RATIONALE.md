# Design Rationale — Agent Trajectory Explorer

## What it is

An interactive tool that shows why the standard agentic guardrail stack —
content filtering, recipient allowlists, per-message and single-trajectory
scoring — misses a whole class of attacks, and what primitive actually catches
them: **cross-agent data lineage.**

You scrub through four bundled agent trajectories, watch a tainted value travel
from an untrusted source across an agent boundary to an outbound action, and see
five security layers score each step. The point lands in one frame: on the real
attack, four layers wave it through and only lineage catches it.

## Why Theme 1 (Exploration & Understanding)

The hardest thing about agentic security isn't the detection code — it's getting
people to *see* why their existing controls don't cover the agentic case. The
gap is counterintuitive: every individual step is authorized and the content is
clean, yet the composite behavior is an exfiltration. That's a perfect fit for
an explorable explanation. A static diagram can assert "lineage matters"; a tool
that lets you watch taint cross an agent boundary makes you believe it.

## The non-obvious idea

Most guardrail thinking is **content-centric** (is this text bad?) or
**action-centric** (is this action allowed?). Both operate on a single message
or a single agent's session. The attack here defeats both by construction:

- An upstream agent (`issue_updater`) ingests an external ticket containing a
  benign-looking request to add a **previously-approved** partner address to a
  distribution list.
- It writes that address into a file it's authorized to write.
- Hours later a **different** agent (`daily_scrub`) reads the file and emails
  internal-confidential content to the distribution list — now including the
  external address.

No content check fires (the email body is clean). No recipient allowlist fires
(the address is a real, org-approved vendor). No single-agent trajectory anomaly
fires (each agent's own run looks normal). The attack exists only in the
**lineage** of one value: it originated in untrusted input, crossed an agent
boundary via a file at rest, and ended up parameterizing an outbound action.

> The insight: **risk lives in the provenance of the data an action depends on —
> not in the action, not in its content, and not in any single agent's session.**
> Taint has to survive storage and agent hand-offs, or you miss this entire class.

## Key design decisions

**Deterministic, rule-based detectors — not real classifiers.**
Every scorer is a pure function with no model call and no randomness. A reviewer
opening the tool weeks from now sees identical, reproducible behavior with no API
key and no network. The detectors are explicitly teaching models, documented as
such; the goal is to make the *mechanism* legible, not to ship a production
classifier.

**Span-level taint, not message-level.**
A file read returns mostly-trusted content (admin-written recipients, the issue
list) with exactly one tainted span. If taint were tracked per-message, every
read of the file would look untrusted and the tool would flag everything —
including the benign controls. Tracking provenance at the value level is both the
technically correct primitive and the thing that makes the controls pass for the
right reason.

**Two benign controls carry as much weight as the attack.**
It's easy to build a detector that flags the attack; the hard part is not
flagging everything else. C1 (a human admin adds an internal recipient) and C2
(the same agent adds a directory-resolved address after an untrusted ticket names
a person) are both benign and both *could* look suspicious to a cruder detector.
Lineage clears both because the exfiltration-relevant value has trusted origin.
C2 is the sharp one: same agent, same tool, untrusted ticket in the loop — yet
the written value came from the trusted directory, so the taint trail stops at
the lookup. This demonstrates the signal is about *data origin*, not about which
agent acted.

**A naive variant to show defense-in-depth working.**
S1 is the same attack with the injected address on a consumer domain
(`@gmail.com`). The static allowlist catches it before send. Running S1 first
builds the false confidence that static controls are enough; S2 then changes one
thing — an approved domain — and sails through every static layer. The contrast
is the argument.

**An approval-budget meter instead of a lecture on governance.**
Rather than asserting "human approval is a scarce resource," the tool counts how
many times each policy would interrupt a human across the four scenarios.
Baseline-only interrupts on C1 (a false positive); lineage doesn't. The
governance point is shown through an interaction, not stated.

## Tradeoffs

- **Replay-only, not live.** I designed the mock tool interface in Claude's
  native tool-use format so a live mode (real Claude against the mock tools) drops
  in later behind the same trace schema. But I shipped replay-only: the demo must
  work forever with no key, and the insight doesn't need a live model to land.
  Live mode was the first thing I cut when scoping.
- **Simulated environment, not real infrastructure.** No real mailbox or web
  server. Reviewers can't touch those anyway — they only ever see the resulting
  trace — so real infrastructure would have been hours of work contributing
  nothing visible, and it would have made the demo non-reproducible.
- **Fictional org, abstracted technique.** The scenario uses a made-up company
  and the well-documented indirect-prompt-injection → confused-deputy pattern, not
  any specific product's vulnerability. The pattern is what carries the insight.
- **Single HTML file.** No framework, no build step. Costs some code elegance;
  buys a prototype that opens as a bare file and deploys anywhere with zero
  friction.

## How I'd extend it with more time

- **Live mode:** real Claude in a loop against the mock tools, emitting the same
  trace schema, so reviewers can inject their own ticket text and watch lineage
  react.
- **Gate-position toggle:** let the user move the enforcement point and see which
  step gets stopped, reinforcing that the gate is the only enforcement surface.
- **Session/agent risk accumulation:** a running risk score per agent and per
  session, rather than a per-send verdict, to show drift over long horizons.
- **Provenance inspector:** click any value in any tool call and trace its full
  lineage chain back to origin, with the trust label at each hop.
- **Real trace capture:** one sandboxed live run, sanitized and bundled as a
  fixture, to add authenticity alongside the constructed traces.

## Build process and use of AI

I used Claude across two surfaces, and both transcripts are included:

1. **claude.ai (design conversation):** topic selection and threat-model design.
   This is where the judgment lives — rejecting an over-scoped real-environment
   build, catching an ambiguity in my own scenario (the injected address needed to
   be *previously approved* for the attack to be interesting), and correcting
   message-level taint to span-level taint so the controls pass for the right
   reason.
2. **Claude Code (build):** I had it build the scorer engine first, as pure
   functions, and verified the computed results against expected values baked into
   the fixtures *before* any UI existed. Then the UI was built incrementally with
   checkpoints, so I was reviewing each stage rather than accepting one large dump.

My vision throughout: the tool has exactly one job — make the taint trail
crossing an agent boundary unmissable, and make the five-layer contrast land in
one frame. I cut everything that didn't serve that (live mode, gate toggle) and
pushed back whenever the UI risked overstating the taint relative to what the
verified scorer concluded.

## Time spent

Approximately 3.5 hours of active work (excluding a multi-hour break partway
through): ~1 hour design conversation and fixture authoring, ~0.5 hour scorer
engine + verification, ~1.5 hours UI build and iteration, ~0.5 hour packaging
(single-file inline, README, this doc).
