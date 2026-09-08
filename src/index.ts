#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string; name: string };

// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

// Drop undefined values so optional inputs are not sent to the actor.
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Shared caller. actorPath is the actor's immutable Apify actor ID (a stable key
// that survives Store renames). The /v2/acts/{id} endpoint accepts it directly,
// so a Store rename never breaks these calls.
//
// The token is read here rather than at module load, so the tool registers
// unconditionally and a server started without APIFY_TOKEN still advertises its
// capabilities instead of reporting none.
async function runActor(
  actorPath: string,
  actorLabel: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
  }

  const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?timeout=300`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APIFY_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify(input),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = ` ${body.error.message}`;
    } catch {
      detail = "";
    }

    let message: string;
    switch (response.status) {
      case 400:
        message = `The ${actorLabel} run was rejected as invalid input.${detail}`;
        break;
      case 401:
        message = "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
        break;
      case 402:
        message =
          "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
        break;
      case 408:
        message = `The ${actorLabel} run timed out after 300 seconds. Ask for less per call, or run the actor on Apify directly for larger jobs.`;
        break;
      default:
        message = `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
    }
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  // A 2xx from run-sync-get-dataset-items normally carries the dataset array.
  // Anything else on this path is a failure the caller must see, never an empty
  // success: surfacing it here is what keeps a failed run from reading as "no
  // results found".
  let items: unknown;
  try {
    items = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run returned a response that could not be parsed: ${message}` }] };
  }

  if (!Array.isArray(items)) {
    const asObj = items as { error?: { type?: string; message?: string } };
    const detail = asObj?.error?.message
      ? `${asObj.error.message}`
      : JSON.stringify(items);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run did not return a dataset. ${detail}` }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}

const server = new McpServer({
  name: "mamba-legal-entity-resolver",
  version: pkg.version,
});

// Legal Entity Resolver (immutable actor ID KHFyPCDIx7CyqULYm)
server.registerTool(
  "resolve_legal_entity",
  {
    title: "Resolve Legal Entity",
    description:
      "Give it a company domain and it returns the registered legal entity behind it: legal name, company number, jurisdiction, status, entity type, LEI and VAT number, as one flat row with a full audit trail of what was rejected and why. Three registers are queried: UK Companies House, GLEIF and SEC EDGAR. Register search endpoints are fuzzy and always return something, so by default a record is accepted only when the normalized legal names are identical. That is why roughly 6 domains in 10 resolve rather than 10 in 10, and why a null here is a trustworthy answer rather than a gap. Read match_method, match_confidence and rejected_candidates before acting on a match. Setting match_strictness to fuzzy will hand you a confidently wrong company on most domains and should be treated as a research mode, not a default. This is not a company database and not a credit or risk product. Requires an APIFY_TOKEN and consumes Apify credits. Read only.",
    annotations: {
      title: "Resolve Legal Entity",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
    domain: z.string().describe("A single company domain, for example monzo.com. Protocol and path are stripped."),
    legal_name_hint: z.string().optional().describe("Skips the domain lookup and goes straight to the registers with this name. Use it when you already have the legal name and just want the register record."),
    jurisdiction_hint: z.string().optional().describe("ISO-2 country code. GB or UK asks Companies House and GLEIF and returns a Companies House number. US asks GLEIF and SEC EDGAR. FR asks the French Sirene register and returns a SIREN. NO asks the Norwegian Brreg register and returns an organisasjonsnummer. Any other code asks GLEIF alone rather than guessing at a register with no adapter. Leave empty to query all five. Narrowing cuts latency, and registers_queried on the row records which were actually asked, so a null is never ambiguous."),
    match_strictness: z.enum(["exact", "fuzzy"]).optional().describe("exact accepts a register record only when the normalized legal names are equal, which is the default and the recommendation. fuzzy returns the best scoring candidate with a confidence below 100 and a warning in rejected_candidates. Register search is fuzzy and always returns something, so fuzzy mode will hand you a confidently wrong company on most domains. Default: \"exact\"."),
    validate_vat: z.boolean().optional().describe("Runs any VAT number found on the company's own pages through the EU VIES service and returns the name VIES holds for it, as a cross-check against the register name. Default: true."),
    skipCache: z.enum(["false", "true"]).optional().describe("false uses the cache: 90 days for a resolved company, 7 days for a null. true forces a fresh look. Default: \"false\"."),
    },
  },
  async (args) =>
    runActor("KHFyPCDIx7CyqULYm", "Legal Entity Resolver", compact(args as Record<string, unknown>)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
