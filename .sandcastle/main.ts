import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// Ralph loop entry point for wp-docs-health-monitor.
// Run with:   ./ralph/afk.sh <maxIterations>
// (afk.sh wraps `npx tsx --env-file=.env .sandcastle/main.ts`, which loads
//  ANTHROPIC_API_KEY, GH_TOKEN, and RALPH_ASSIGNEE from the repo-root .env.)

const maxIterations = Number(process.argv[2] ?? 3);

const assignee = process.env.RALPH_ASSIGNEE;
if (!assignee) {
  console.error(
    "RALPH_ASSIGNEE is not set. Add `RALPH_ASSIGNEE=<github-username>` to .env so Ralph knows which user's `ready-for-agent` issues to pick up.",
  );
  process.exit(2);
}

await run({
  name: "ralph",

  // Docker sandbox using the Sandcastle-built image.
  // ANTHROPIC_API_KEY, GH_TOKEN, and RALPH_ASSIGNEE forwarded from host into
  // the container so the prompt's shell expansions can read them too.
  sandbox: docker({
    imageName: "sandcastle:wp-docs-health",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      GH_TOKEN: process.env.GH_TOKEN ?? "",
      RALPH_ASSIGNEE: assignee,
    },
  }),

  // Provider: Docker, agent: claudeCode("claude-opus-4-7") per the Ralph plan.
  agent: claudeCode("claude-opus-4-7"),

  promptFile: "./.sandcastle/prompt.md",

  // Substitutes {{ASSIGNEE}} placeholders in prompt.md before each iteration.
  promptArgs: {
    ASSIGNEE: assignee,
  },

  maxIterations,

  // Sandcastle's host-side git integration. Local sandbox commits get merged
  // back to the host's HEAD branch; the agent's actual workflow inside the
  // sandbox creates `ralph/<issue>-<slug>` branches and pushes them to remote
  // independently, so the source of truth is the remote branches/PRs.
  branchStrategy: { type: "merge-to-head" },

  // Speeds up sandbox start by reusing host node_modules. The npm install in
  // onSandboxReady is the safety net for any platform-specific binaries.
  copyToWorktree: ["node_modules"],

  hooks: {
    sandbox: {
      onSandboxReady: [
        { command: "npm install", timeoutMs: 300_000 },
        { command: "git config --global user.email 'ralph@wp-docs-health-monitor.local'" },
        { command: "git config --global user.name 'Ralph'" },
      ],
    },
  },

  logging: { type: "stdout" },
});
