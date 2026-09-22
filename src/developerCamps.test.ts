import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import allRepos from "./data/all-repos.json";
import {
  ATTACHED_SCAN_DETAIL,
  ATTACHED_SCAN_FETCHED_ON,
  RETIRED_PUBLIC_GITHUB_CAMP_COUNT,
  buildCampCatalog,
  campId,
  campsFromScanDocument,
  compactKey,
  originOwnerName,
  selectDeveloperCamps,
  skipReason,
  type DeveloperCampInput,
} from "./developerCamps";

const PRELIMINARY_SKIPS = [
  "AI Lab Pitch-worktrees",
  "AIC Kiro-worktrees",
  "_archives",
  "_pocket",
  "_retired",
  "_xo-scratch",
  "agent-stack-docs-worktrees",
  "agentinfra-codex-nas-router",
  "agentinfra-codex-pr-benchmark",
  "agentinfra-command-center-rollout",
  "agentinfra-fix-missy-email-bridge",
  "agentinfra-fix-missy-email-health-probe",
  "agentinfra-pocket-reconcile",
  "agentinfra-work-proposals-coordinator-v1",
  "agentinfra-work-proposals-foundation-v1",
  "agentinfra-worktrees",
  "agentinfra-wp-736-hq-repair",
  "agentinfra-wp-736-remote-omp-sessions",
  "agentinfra-wp-745-cahq-delivery",
  "agentinfra-wp-748-project-governance",
  "agentinfra-wp-772-coding-acceleration",
  "agentinfra-ws-175",
  "agentos-command-center-rollout",
  "agentos-pocket-reconcile",
  "agentos-worktrees",
  "agentworkforce-runtime-worktrees",
  "aickiro-worktrees",
  "dtr-app-chat-notifications",
  "dtr-app-redesign-codex",
  "dtr-app-redesign-fable-auto",
  "dtr-app-v2-production-auth",
  "dtr-next-partial-1784416219",
  "dtr-next-stale-1784420301",
  "dtr-next-stale-1784420315",
  "dtr-open-next-partial-1784416219",
  "dtr-open-next-stale-1784420301",
  "dtr-open-next-stale-1784420315",
  "homelab-atlas-worktrees",
  "homelab-worktrees",
  "mirmicode-map-preview",
  "mirmicode-mvp-main",
  "omp-remote-upstream",
  "shi-presentation-builder-airtable-present",
  "shi-presentation-builder-closer-seats",
  "shi-presentation-builder-closer-thumb",
  "shi-presentation-builder-customer-refs",
  "shi-presentation-builder-hide-feedback-fs",
  "shi-presentation-builder-infra-refresh",
  "shi-presentation-builder-shared-slide-previews",
  "shi-presentation-builder-situation-stakes",
  "shi-presentation-builder-transition-keep-alive",
];

describe("skip rules", () => {
  it.each([
    ["_archives", "underscore-prefix"],
    ["agentinfra-worktrees", "worktrees"],
    ["dtr-next-stale-1784420301", "stale"],
    ["dtr-open-next-partial-1784416219", "partial"],
    ["agentinfra-wp-736-hq-repair", "work-packet-clone"],
    ["agentinfra-ws-175", "agentinfra-clone"],
    ["agentinfra-codex-nas-router", "agentinfra-clone"],
    ["agentos-command-center-rollout", "agentos-clone"],
    ["omp-remote-upstream", "upstream"],
    ["dtr-app-redesign-codex", "dtr-app-clone"],
    ["mirmicode-mvp-main", "mirmicode-clone"],
    ["mirmicode-map-preview", "mirmicode-clone"],
    ["shi-presentation-builder-infra-refresh", "shi-presentation-builder-extra"],
    ["cmux-minimax-read-aloud-pr", "pull-request-clone"],
    ["cmux-wp-750-read-aloud", "work-packet-clone"],
    ["proposal-generator-wp766", "work-packet-clone"],
    ["ribari-releases-0.4.5-beta.1", "release-snapshot"],
  ])("skips %s as %s", (folder, reason) => {
    expect(skipReason(folder)).toBe(reason);
  });

  it("keeps bare product roots that the clone rules name as exceptions", () => {
    for (const folder of [
      "agentinfra",
      "agentos",
      "dtr-app",
      "dtr-site",
      "mirmicode",
      "shi-presentation-builder",
      "agentworkforce",
      "homelab",
      "homelab-atlas",
    ]) {
      expect(skipReason(folder), folder).toBeNull();
    }
  });

  it("rejects every folder the preliminary scan already set aside, except two it named without a rule", () => {
    for (const folder of PRELIMINARY_SKIPS) {
      expect(skipReason(folder), folder).not.toBeNull();
    }
    expect(skipReason("Asymetryk-Infrastructure-Cortex")).toBeNull();
    expect(skipReason("asymetryk-site")).toBeNull();
  });
});

describe("selectDeveloperCamps", () => {
  it("collapses spaced, kebab, and .git duplicates onto one folder", () => {
    const selected = ids([
      { folder: "Policy Sentinel", hasGit: true },
      { folder: "Policy Sentinel.git", hasGit: false },
      { folder: "SHI Onboarding", hasGit: true },
      { folder: "shi-onboarding", hasGit: true },
      { folder: "AIC Kiro Live", hasGit: false },
      { folder: "aickiro-live", hasGit: false },
    ]);
    expect(selected).toEqual(["aickiro-live", "Policy Sentinel", "shi-onboarding"]);
    expect(compactKey("Policy Sentinel.git")).toBe(compactKey("Policy Sentinel"));
    expect(compactKey("AIC Kiro Live")).toBe(compactKey("aickiro-live"));
  });

  it("prefers origin owner/name over the folder, including on a spelling duplicate", () => {
    expect(originOwnerName("git@github.com:asymetryk/mirmicode.git")).toBe("asymetryk/mirmicode");
    expect(originOwnerName("https://github.com/Asymetryk/Buzz")).toBe("Asymetryk/Buzz");
    expect(originOwnerName("ssh://git@github.com/asymetryk/kept.git")).toBe("asymetryk/kept");
    expect(originOwnerName("not a remote")).toBeNull();
    expect(campId({ folder: "mirmicode", repo: "asymetryk/mirmicode" })).toBe("asymetryk/mirmicode");
    expect(campId({ folder: "local-only", repo: null })).toBe("local-only");

    const selected = selectDeveloperCamps([
      { folder: "mirmicode", repo: null, hasGit: true },
      { folder: "Mirmicode", repo: "asymetryk/mirmicode", hasGit: true },
    ]);
    expect(selected.map((camp) => camp.id)).toEqual(["asymetryk/mirmicode"]);
  });

  it("keeps one proposal-generator primary and the bare dtr-site", () => {
    const selected = ids([
      { folder: "Proposal Generator", hasGit: false },
      { folder: "proposal-generator-client-export", hasGit: true },
      { folder: "proposal-generator-north-star", hasGit: true },
      { folder: "proposal-generator-wp766", hasGit: true },
      { folder: "dtr-site", hasGit: true },
      { folder: "dtr-site-redesign-fable", hasGit: true },
      { folder: "dtr-site-live-roll-radar-cdx070526", hasGit: false },
    ]);
    expect(selected).toEqual(["dtr-site", "Proposal Generator"]);
  });

  it("promotes one variant when the bare proposal or dtr-site folder is missing", () => {
    const selected = selectDeveloperCamps([
      { folder: "proposal-generator-north-star", hasGit: true },
      { folder: "proposal-generator-client-export", hasGit: false },
      { folder: "dtr-site-redesign-fable", hasGit: true },
      { folder: "dtr-site-redesign-cdx070426", hasGit: false },
    ]);
    expect(selected.map((camp) => camp.folder).sort()).toEqual([
      "dtr-site-redesign-fable",
      "proposal-generator-north-star",
    ]);
  });

  it("keeps agentworkforce plus runtime, and drops work-packet clones beside a primary", () => {
    const selected = ids([
      { folder: "agentworkforce", hasGit: true },
      { folder: "agentworkforce-capable-agents", hasGit: true },
      { folder: "agentworkforce-command-center-contracts-v1", hasGit: true },
      { folder: "agentworkforce-outlook-owner", hasGit: true },
      { folder: "agentworkforce-runtime", hasGit: true },
      { folder: "agentworkforce-runtime-multi-google", hasGit: true },
      { folder: "homelab", hasGit: true },
      { folder: "homelab-atlas", hasGit: true },
      { folder: "buzz", hasGit: true },
      { folder: "buzz-inline-thread-replies", hasGit: true },
      { folder: "agentvault", hasGit: true },
      { folder: "AgentVault-lauryn-chuckd-activation", hasGit: true },
    ]);
    expect(selected).toEqual([
      "agentvault",
      "agentworkforce",
      "agentworkforce-runtime",
      "buzz",
      "homelab",
      "homelab-atlas",
    ]);
  });
});

describe("baked developer catalog", () => {
  const scan = JSON.parse(readFileSync(new URL("./data/developer-camps.scan.json", import.meta.url), "utf8")) as unknown;
  const baked = buildCampCatalog(campsFromScanDocument(scan), {
    fetchedOn: ATTACHED_SCAN_FETCHED_ON,
    detail: ATTACHED_SCAN_DETAIL,
  });

  it("matches the committed all-repos.json and is larger than the retired 10", () => {
    expect(allRepos).toEqual(baked);
    expect(allRepos.repos.length).toBeGreaterThan(RETIRED_PUBLIC_GITHUB_CAMP_COUNT);
    expect(allRepos.owner).toBeNull();
    expect(allRepos.source).toMatch(/~\/Developer/);
    expect(allRepos.source).toMatch(/GET \/user returned 403/);
    expect(allRepos.source).toMatch(/10/);
  });

  it("omits clone folders and keeps one camp per canonical project", () => {
    const repos = new Set(allRepos.repos);
    for (const name of [
      "agentinfra-wp-736-hq-repair",
      "agentos-worktrees",
      "cmux-minimax-read-aloud-pr",
      "cmux-wp-750-read-aloud",
      "dtr-app-redesign-codex",
      "dtr-site-redesign-fable",
      "mirmicode-mvp-main",
      "shi-presentation-builder-infra-refresh",
      "proposal-generator-client-export",
      "proposal-generator-wp766",
      "Policy Sentinel.git",
      "SHI Onboarding",
      "AIC Kiro Live",
      "agentworkforce-capable-agents",
      "agentworkforce-runtime-multi-google",
      "buzz-inline-thread-replies",
      "AgentVault-lauryn-chuckd-activation",
      "ribari-releases-0.4.5-beta.1",
      "_archives",
    ]) {
      expect(repos.has(name), name).toBe(false);
    }
    for (const name of [
      "agentinfra",
      "agentos",
      "agentworkforce",
      "agentworkforce-runtime",
      "dtr-app",
      "dtr-site",
      "mirmicode",
      "shi-presentation-builder",
      "homelab",
      "homelab-atlas",
      "Policy Sentinel",
      "Proposal Generator",
      "shi-onboarding",
      "aickiro-live",
      "buzz",
      "kept",
    ]) {
      expect(repos.has(name), name).toBe(true);
    }
  });
});

function ids(camps: DeveloperCampInput[]): string[] {
  return selectDeveloperCamps(camps).map((camp) => camp.id);
}
