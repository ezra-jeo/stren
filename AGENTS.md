# Stren — Agent Entry Point

This file exists so that **any** coding agent (Codex/GPT, Claude, or others) lands on the same system. It intentionally contains no content of its own — everything has one canonical home:

1. **Start here every session:** read `AgentsContextKnowledgeBase/Catalog.md`. It gives you the reading order (project mission → live status → active plan → conventions → vocabulary) and your update obligations.
2. **Conventions** (architecture rules, commands, test-first policy, migrations, branching): `CLAUDE.md`. Despite the name, it applies to every agent.
3. **Non-negotiable obligation:** every PR you ship updates `AgentsContextKnowledgeBase/ImplementationState.md` and `CHANGELOG.md` in that same PR. A PR without them is not done.
4. **Role boundaries for the active workstream** are defined in `AgentsContextKnowledgeBase/ImplementationPlan.md` §10 — the UI agent and the logic agent have explicit touch / do-not-touch file lists. Respect them; the frozen contracts in §8 are how the two halves meet.
5. **Never commit or push.** No `git commit`, `git push`, `git merge`, `git rebase`, tags, or history rewriting — under any circumstances. Leave changes in the working tree and report them; developers perform every commit and push exclusively.

Do not add project knowledge to this file — put it where the Catalog says it belongs.
