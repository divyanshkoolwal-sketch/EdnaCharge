# CLAUDE.md

Claude Code should use the same operating manual as every other agent:

- [`AGENTS.md`](AGENTS.md)
- [`docs/AGENT_CONTEXT.md`](docs/AGENT_CONTEXT.md)
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- [`docs/todo.md`](docs/todo.md)

## Claude Checklist

- State assumptions before coding when the task is ambiguous.
- Keep changes surgical and traceable to the request.
- Prefer simple existing patterns over new abstractions.
- Do not clean unrelated code unless the user explicitly asks for a cleanup sweep.
- Preserve EdnaCharge service boundaries: API, CSMS, worker, and mobile stay separate.
- Use shared schemas, Prisma types, and demand-pricing helpers instead of parallel contracts.
- Verify with the relevant commands from `docs/RUNBOOK.md`; if blocked, report the exact blocker.
