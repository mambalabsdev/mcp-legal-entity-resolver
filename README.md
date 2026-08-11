# Legal Entity Resolver MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-legal-entity-resolver)](https://smithery.ai/servers/mambabuilt/mcp-legal-entity-resolver) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-legal-entity-resolver/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-legal-entity-resolver) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-legal-entity-resolver%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-legal-entity-resolver&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-legal-entity-resolver)](https://www.npmjs.com/package/@mambalabsdev/mcp-legal-entity-resolver) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-legal-entity-resolver)](https://www.npmjs.com/package/@mambalabsdev/mcp-legal-entity-resolver) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-legal-entity-resolver)](https://github.com/mambalabsdev/mcp-legal-entity-resolver/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-legal-entity-resolver)

MCP server for the Mamba Labs [Legal Entity Resolver](https://apify.com/mambalabs/legal-entity-resolver) actor on Apify.

Give it a company domain and it returns the registered legal entity behind it: legal name, company number, jurisdiction, status, LEI and VAT number. One flat row per domain, 24 fields, ready for Clay or a CRM.

## Install

```bash
npx -y @mambalabsdev/mcp-legal-entity-resolver
```

### Claude Desktop

```json
{
  "mcpServers": {
    "mamba-legal-entity-resolver": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-legal-entity-resolver"],
      "env": { "APIFY_TOKEN": "your-apify-token" }
    }
  }
}
```

Get an Apify token at [console.apify.com/account/integrations](https://console.apify.com/account/integrations).

## Tool

### `resolve_legal_entity`

Company domain in, the registered legal entity behind it out.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| `domain` | string | yes | A single company domain, for example monzo.com. Protocol and path are stripped. |
| `legal_name_hint` | string | no | Skips the domain lookup and goes straight to the registers with this name. Use it when you already have the legal name and just want the register record. |
| `jurisdiction_hint` | string | no | ISO-2 country code, for example GB or US. Narrows which registers are queried and cuts latency. Leave empty to query every register. |
| `match_strictness` | enum | no | `exact` accepts a register record only when the normalized legal names are equal. `fuzzy` returns the best scoring candidate with a confidence below 100 and a warning in `rejected_candidates`. Default `exact`. |
| `validate_vat` | boolean | no | Runs any VAT number found on the company's own pages through the EU VIES service and returns the name VIES holds for it, as a cross-check against the register name. Default `true`. |
| `skipCache` | enum | no | `false` uses the cache, 90 days for a resolved company and 7 days for a null. `true` forces a fresh look. Default `false`. |

## A null is the product, not a gap

Register search endpoints are fuzzy and they always return something. Taking the top search result gives you a confidently wrong company number more often than not. This actor accepts a match only when the legal names are identical after normalization, which is why roughly 6 domains in 10 resolve instead of 10 in 10, and why the 6 are worth acting on.

Read `match_method`, `match_confidence` and `rejected_candidates` before acting on a match. `fuzzy` strictness is a research mode: it will hand you a confidently wrong company on most domains.

Three registers are queried: UK Companies House, GLEIF and SEC EDGAR.

## Billing

You are charged per domain resolved, plus a small actor start fee. Cached results are 90 days for a resolved company and 7 days for a null.

Pricing is on the [actor's Apify page](https://apify.com/mambalabs/legal-entity-resolver). Running this server consumes Apify credits.

## What this server does and does not do

It is a thin client for the Apify actor. It passes your input through and returns the actor's output unchanged. Every behavior described above lives in the actor, not here.

This is not a company database and not a credit or risk product. It does not score companies, rate them, or tell you whether to trade with them. It answers one question: which registered legal entity sits behind this domain.

Errors are surfaced, never swallowed. An invalid input, an invalid token, an exhausted balance, a timeout, or a run that returns anything other than a dataset all come back as an explicit tool error rather than as an empty result.

## Source

The actor is on the [Apify Store](https://apify.com/mambalabs/legal-entity-resolver). This wrapper is [MIT licensed](LICENSE).

Built by [Mamba Labs](https://apify.com/mambalabs)
