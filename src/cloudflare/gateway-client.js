import { createFetchWithRetry } from "./http.js";

const API_HOST = "https://api.cloudflare.com/client/v4";
const GRAPHQL_ENDPOINT = `${API_HOST}/graphql`;
const LIST_ITEM_PAGE_SIZE = 1000;

/**
 * Thin client for the Cloudflare Zero Trust Gateway API (lists + rules).
 * All network/auth concerns live here; nothing else in the codebase touches
 * `fetch` directly for Cloudflare calls.
 */
export class GatewayClient {
  /**
   * @param {object} config
   * @param {string} config.accountId
   * @param {string} [config.apiToken]
   * @param {string} [config.apiKey]
   * @param {string} [config.accountEmail] Required if using apiKey.
   * @param {(msg: string) => Promise<void>} [config.onGiveUp] Called when a request exhausts retries.
   */
  constructor({ accountId, apiToken, apiKey, accountEmail, onGiveUp }) {
    if (!accountId) throw new Error("accountId is required");
    if (!apiToken && !apiKey) throw new Error("Either apiToken or apiKey is required");

    this.accountId = accountId;
    this.apiToken = apiToken;
    this.apiKey = apiKey;
    this.accountEmail = accountEmail;
    this.fetchRetry = createFetchWithRetry(onGiveUp);
  }

  get #authHeaders() {
    return this.apiToken
      ? { Authorization: `Bearer ${this.apiToken}` }
      : {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Auth-Email": this.accountEmail,
          "X-Auth-Key": this.apiKey,
        };
  }

  /** @param {string} path @param {RequestInit} [options] */
  async #request(path, options = {}) {
    const response = await this.fetchRetry(`${API_HOST}/accounts/${this.accountId}/gateway${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers, ...this.#authHeaders },
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data?.errors?.[0]?.message ?? `HTTP ${response.status} ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  /**
   * Runs a GraphQL Analytics query. Unlike #request, this hits the top-level
   * /graphql endpoint (not scoped under /accounts/{id}/gateway).
   * @param {string} query
   * @param {object} [variables]
   */
  async #graphqlRequest(query, variables = {}) {
    const response = await this.fetchRetry(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.#authHeaders },
      body: JSON.stringify({ query, variables }),
    });
    const data = await response.json();
    if (!response.ok || data.errors?.length) {
      const message = data?.errors?.[0]?.message ?? `HTTP ${response.status} ${response.statusText}`;
      const err = new Error(message);
      err.status = response.status;
      throw err;
    }
    return data.data;
  }

  // ── Lists ────────────────────────────────────────────────────────────

  listLists = () => this.#request("/lists", { method: "GET" });

  listItems = (listId) =>
    this.#request(`/lists/${listId}/items?per_page=${LIST_ITEM_PAGE_SIZE}`, { method: "GET" });

  createList = (name, items) =>
    this.#request("/lists", {
      method: "POST",
      body: JSON.stringify({ name, type: "DOMAIN", items }),
    });

  /** @param {string} listId @param {{ remove?: string[], append?: object[] }} patch */
  patchList = (listId, patch) =>
    this.#request(`/lists/${listId}`, { method: "PATCH", body: JSON.stringify(patch) });

  deleteList = (listId) => this.#request(`/lists/${listId}`, { method: "DELETE" });

  // ── Rules ────────────────────────────────────────────────────────────

  listRules = () => this.#request("/rules", { method: "GET" });

  /**
   * @param {object} rule
   * @param {string} rule.name
   * @param {string} rule.expression
   * @param {string[]} rule.filters
   * @param {boolean} rule.blockPageEnabled
   */
  createRule = ({ name, expression, filters, blockPageEnabled }) =>
    this.#request("/rules", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: "Managed automatically. Avoid editing — changing the name will break the sync script.",
        enabled: true,
        action: "block",
        rule_settings: {
          block_page_enabled: blockPageEnabled,
          block_reason: "Blocked by DNS sync — check your filter lists if this was a mistake.",
        },
        filters,
        traffic: expression,
      }),
    });

  /** @param {string} ruleId @param {object} rule Same shape as createRule's argument. */
  updateRule = (ruleId, { name, expression, filters, blockPageEnabled }) =>
    this.#request(`/rules/${ruleId}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        description: "Managed automatically. Avoid editing — changing the name will break the sync script.",
        enabled: true,
        action: "block",
        rule_settings: {
          block_page_enabled: blockPageEnabled,
          block_reason: "Blocked by DNS sync — check your filter lists if this was a mistake.",
        },
        filters,
        traffic: expression,
      }),
    });

  deleteRule = (ruleId) => this.#request(`/rules/${ruleId}`, { method: "DELETE" });

  // ── DNS query analytics (GraphQL Analytics API) ─────────────────────

  /**
   * Introspects the real dimension field names available on
   * gatewayResolverQueriesAdaptiveGroups for this account. Use this once to
   * discover exact field names (e.g. for source IP, ASN, country, device,
   * DNSSEC) before adding them to queryDnsLogs — guessing field names risks
   * a broken query, this doesn't.
   * @returns {Promise<{ name: string, description: string | null }[]>}
   */
  introspectDnsLogDimensions = async () => {
    const query = `
      query IntrospectDnsLogDimensions {
        __type(name: "AccountGatewayResolverQueriesAdaptiveGroupsDimensions") {
          fields {
            name
            description
          }
        }
      }
    `;
    const data = await this.#graphqlRequest(query);
    return data?.__type?.fields ?? [];
  };

  /**
   * Fetches aggregated Gateway DNS query counts for a time window, grouped
   * by domain (reversed) and resolver decision (allow/block/override/etc).
   * Uses gatewayResolverQueriesAdaptiveGroups — counts only, no client IPs
   * or user identity, to keep the exported log privacy-conscious.
   *
   * @param {object} options
   * @param {string} options.sinceIso ISO 8601 timestamp — only queries after this are included.
   * @param {number} [options.limit] Max number of grouped rows to return (default 1000).
   * @returns {Promise<{ count: number, queryNameReversed: string, resolverDecision: string, datetimeHour: string }[]>}
   */
  queryDnsLogs = async ({ sinceIso, limit = 1000 }) => {
    const query = `
      query DnsLogs($accountTag: string!, $since: Time!, $limit: uint64!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            gatewayResolverQueriesAdaptiveGroups(
              filter: { datetime_geq: $since }
              limit: $limit
              orderBy: [count_DESC]
            ) {
              count
              dimensions {
                queryNameReversed
                resolverDecision
                datetimeHour
              }
            }
          }
        }
      }
    `;
    const data = await this.#graphqlRequest(query, {
      accountTag: this.accountId,
      since: sinceIso,
      limit,
    });
    const groups = data?.viewer?.accounts?.[0]?.gatewayResolverQueriesAdaptiveGroups ?? [];
    return groups.map((g) => ({
      count: g.count,
      queryNameReversed: g.dimensions.queryNameReversed,
      resolverDecision: g.dimensions.resolverDecision,
      datetimeHour: g.dimensions.datetimeHour,
    }));
  };
}
