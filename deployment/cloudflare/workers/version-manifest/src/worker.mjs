const RELEASE_TAG_PATTERN = /^v[0-9]+\.[0-9]+\.[0-9]+(?:[.-][0-9A-Za-z.-]+)?$/;

function normalizeTag(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!RELEASE_TAG_PATTERN.test(candidate)) {
    return "";
  }
  return candidate;
}

function normalizeTimestamp(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate.length === 0) {
    return "";
  }
  const parsed = Date.parse(candidate);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString();
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function emptyResponse(status, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/v1/manifest.json") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return emptyResponse(405, { Allow: "GET, HEAD" });
    }

    const latest = normalizeTag(env.LATEST_VERSION);
    if (latest === "") {
      const body = {
        error: {
          code: "MANIFEST_NOT_READY",
          message: "Version manifest is not ready",
        },
      };
      if (request.method === "HEAD") {
        return emptyResponse(503);
      }
      return jsonResponse(503, body);
    }

    const recommended = normalizeTag(env.RECOMMENDED_VERSION) || latest;
    const updatedAt = normalizeTimestamp(env.UPDATED_AT) || new Date().toISOString();
    const sourceReleaseTag = normalizeTag(env.SOURCE_RELEASE_TAG) || latest;

    if (request.method === "HEAD") {
      return emptyResponse(200, { "Content-Type": "application/json; charset=utf-8" });
    }

    return jsonResponse(200, {
      latest,
      recommended,
      updated_at: updatedAt,
      source_release_tag: sourceReleaseTag,
      mirror_complete: true,
    });
  },
};
