# Underfall review (Fable 5.2, read-only, from code + screenshots) — to do next session

**Retention gaps (ranked)**
1. The race has no stakes. `dukeTally` is never read, the cart never empties, and you can lift back everything.
2. There is no Fall countdown or HUD cue; the toast only fires in the Depths.
3. No objective points players to the Sump or the home panel.
4. There is no escalation or endgame sink after tier 4.

**Combat fixes**

| Issue | Fix |
| --- | --- |
| Hopper lunge falls short | Scale lunge speed to distance, clamped 9–16 |
| Hoppers die before they act | HP 45; minimum stalk time 1.0 s |
| Tallymen die too fast and their wind-up resets | HP 70; don't reset the wind-up under 1.9 m |
| Knocking Tallymen down farms tokens | Pay only when he is carrying; the Duke refuses trade for 120 s |
| Aim assist provokes neutral Tallymen | Assist only spiders and hostile Tallymen, inside a 90° cone |
| Debtors get hooked at the claims table | 6 m truce radius around the table |
| `fire()` removes grit before the stamina check | Swap the order |
| Grit is too cheap | 1 scrap → 3 |
| Shots drop too fast | Sling gravity 6 |
| Fall damage is untelegraphed | Pick the landing site at the rumble and show a shadow ring |
| A Tallyman leaving a fight with a load never hauls | Haul if carrying |

**Text edits**
- Duke: end his line with "Tell me which of us is the thief. Touch my crews and you'll be tallied too."
- "The hopper curls up." → "The spider curls up."
- `ui.ts` hint: "(double-click to lock the pointer)" → "(L to lock the pointer)"
- The Duke's faction is tagged 'union', but the spec makes him Authority-licensed.

**Next feature: the Fall Ledger.** A countdown bell, a landing marker and a visible split ("You 5 · Duke 4"). The cart empties for good at the next Fall. A streak raises rare-fall odds and adds a third Tallyman.
