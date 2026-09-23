import http from "node:http";
import { randomBytes } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.VELORA_COMPANION_PORT || 43127);
const QUICK_LOGIN_BASE = "https://apis.roblox.com/auth-token-service/v1/login";
const DEFAULT_SITE_ORIGIN = "https://velora-nu-roan.vercel.app";
const EXTRA_ORIGIN = process.env.VELORA_ORIGIN || "";

const allowedOrigins = new Set(
  [
    DEFAULT_SITE_ORIGIN,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    EXTRA_ORIGIN,
  ].filter(Boolean),
);

const sessions = new Map();

function jsonHeaders(origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-private-network": "true",
    vary: "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }

  return headers;
}

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.has(origin);
}

function sendJson(res, origin, status, body) {
  res.writeHead(status, jsonHeaders(origin));
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_768) {
      throw new Error("Request body is too large.");
    }
  }

  if (!body) return {};
  return JSON.parse(body);
}

async function parseResponseJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Roblox returned a non-JSON response (HTTP ${response.status}).`);
  }
}

async function robloxPostWithCsrfRetry(url, body) {
  const request = (csrfToken) =>
    fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Velora-Companion/0.2",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
    });

  let response = await request();
  const csrf = response.headers.get("x-csrf-token");

  if ((response.status === 400 || response.status === 403) && csrf) {
    response = await request(csrf);
  }

  return response;
}

function normalizeCode(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map((part) => String(part)).join("").trim();
  }

  return "";
}

function normalizeExpiration(value) {
  const raw = String(value || "").trim();

  if (raw) {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const parsed = new Date(hasTimezone ? raw : `${raw}Z`);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(Date.now() + 5 * 60 * 1000);
}

async function createQuickLogin() {
  const response = await robloxPostWithCsrfRetry(`${QUICK_LOGIN_BASE}/create`, {});
  const data = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.message ||
        data?.message ||
        `Roblox Quick Login creation failed (HTTP ${response.status}).`,
    );
  }

  const code = normalizeCode(data.code);

  if (!code || !data.privateKey) {
    throw new Error("Roblox returned an incomplete Quick Login challenge.");
  }

  return {
    code,
    privateKey: String(data.privateKey),
    expirationTime: normalizeExpiration(data.expirationTime),
    status: String(data.status || "Created"),
  };
}

async function getQuickLoginStatus(session) {
  const response = await robloxPostWithCsrfRetry(`${QUICK_LOGIN_BASE}/status`, {
    code: session.code,
    privateKey: session.privateKey,
  });

  const data = await parseResponseJson(response);

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.message ||
        data?.message ||
        `Roblox Quick Login status failed (HTTP ${response.status}).`,
    );
  }

  return data;
}

async function cancelQuickLogin(session) {
  try {
    await robloxPostWithCsrfRetry(`${QUICK_LOGIN_BASE}/cancel`, {
      code: session.code,
    });
  } catch {
    // Best effort. The local state is destroyed regardless.
  }
}

function extractRobloSecurity(headers) {
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);

  for (const value of values) {
    const match = value.match(/(?:^|;\s*)\.ROBLOSECURITY=([^;]+)/i);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function performFinalLogin(session) {
  const url = "https://auth.roblox.com/v2/login";
  const payload = {
    ctype: "AuthToken",
    cvalue: session.code,
    password: session.privateKey,
  };

  const request = (csrfToken) =>
    fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Velora-Companion/0.2",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "manual",
    });

  let response = await request();
  const csrf = response.headers.get("x-csrf-token");

  if ((response.status === 400 || response.status === 403) && csrf) {
    response = await request(csrf);
  }

  if (!response.ok) {
    const data = await parseResponseJson(response).catch(() => ({}));
    throw new Error(
      data?.errors?.[0]?.message ||
        data?.message ||
        `Roblox final login failed (HTTP ${response.status}).`,
    );
  }

  let securityCookie = extractRobloSecurity(response.headers);

  if (!securityCookie) {
    throw new Error("Roblox did not return an authenticated session.");
  }

  try {
    const identityResponse = await fetch(
      "https://users.roblox.com/v1/users/authenticated",
      {
        headers: {
          accept: "application/json",
          cookie: `.ROBLOSECURITY=${securityCookie}`,
          "user-agent": "Velora-Companion/0.2",
        },
        cache: "no-store",
      },
    );

    const identity = await parseResponseJson(identityResponse);

    if (!identityResponse.ok || !identity?.id) {
      throw new Error("Velora could not identify the authenticated Roblox account.");
    }

    return {
      id: Number(identity.id),
      username: String(identity.name || ""),
      displayName: String(identity.displayName || identity.name || ""),
    };
  } finally {
    // The cookie is never persisted, logged, or returned. Drop the only
    // application reference immediately after /users/authenticated completes.
    securityCookie = null;
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return parseResponseJson(response);
}

async function buildAccountMirror(identity, quickLoginPicture = null) {
  const userId = identity.id;

  const [profile, friends, followers, following, groups, thumbnail] =
    await Promise.all([
      getJson(`https://users.roblox.com/v1/users/${userId}`),
      getJson(`https://friends.roblox.com/v1/users/${userId}/friends/count`),
      getJson(`https://friends.roblox.com/v1/users/${userId}/followers/count`),
      getJson(`https://friends.roblox.com/v1/users/${userId}/followings/count`),
      getJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`),
      getJson(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`,
      ),
    ]);

  const groupItems = Array.isArray(groups?.data)
    ? groups.data.slice(0, 12).map((membership) => ({
        id: membership.group?.id ?? null,
        name: membership.group?.name ?? "Unknown group",
        role: membership.role?.name ?? "Member",
        rank: membership.role?.rank ?? null,
      }))
    : [];

  return {
    id: userId,
    username: profile?.name || identity.username,
    displayName: profile?.displayName || identity.displayName,
    description: profile?.description || "",
    created: profile?.created || null,
    isBanned: Boolean(profile?.isBanned),
    hasVerifiedBadge: Boolean(profile?.hasVerifiedBadge),
    avatar: thumbnail?.data?.[0]?.imageUrl || quickLoginPicture || null,
    profileUrl: `https://www.roblox.com/users/${userId}/profile`,
    counts: {
      friends: friends?.count ?? null,
      followers: followers?.count ?? null,
      following: following?.count ?? null,
      groups: Array.isArray(groups?.data) ? groups.data.length : null,
    },
    groups: groupItems,
  };
}

function destroySession(id) {
  const session = sessions.get(id);

  if (session) {
    session.privateKey = null;
    sessions.delete(id);
  }
}

setInterval(() => {
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (session.expirationTime.getTime() <= now) {
      destroySession(id);
    }
  }
}, 30_000).unref();

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      sendJson(res, origin, 403, { error: "Origin not allowed." });
      return;
    }

    res.writeHead(204, jsonHeaders(origin));
    res.end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    sendJson(res, origin, 403, { error: "Origin not allowed." });
    return;
  }

  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, origin, 200, {
        ok: true,
        service: "Velora Companion",
        version: "0.2.0",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/quick-login/create") {
      const challenge = await createQuickLogin();
      const challengeId = randomBytes(24).toString("base64url");

      sessions.set(challengeId, {
        code: challenge.code,
        privateKey: challenge.privateKey,
        expirationTime: challenge.expirationTime,
      });

      sendJson(res, origin, 200, {
        challengeId,
        code: challenge.code,
        status: challenge.status,
        expirationTime: challenge.expirationTime.toISOString(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/quick-login/status") {
      const body = await readJson(req);
      const challengeId = String(body.challengeId || "");
      const session = sessions.get(challengeId);

      if (!session) {
        sendJson(res, origin, 404, { error: "No active local Quick Login challenge." });
        return;
      }

      if (Date.now() >= session.expirationTime.getTime()) {
        destroySession(challengeId);
        sendJson(res, origin, 410, { status: "Expired" });
        return;
      }

      const statusData = await getQuickLoginStatus(session);
      const status = String(statusData.status || "Created");

      if (status !== "Validated") {
        if (status === "Cancelled" || status === "Expired" || status === "TimedOut") {
          destroySession(challengeId);
        }

        sendJson(res, origin, 200, {
          status,
          accountName: statusData.accountName || null,
          accountPictureUrl: statusData.accountPictureUrl || null,
          expirationTime: session.expirationTime.toISOString(),
        });
        return;
      }

      try {
        const identity = await performFinalLogin(session);
        const account = await buildAccountMirror(
          identity,
          statusData.accountPictureUrl || null,
        );

        sendJson(res, origin, 200, {
          status: "Validated",
          account,
        });
      } finally {
        destroySession(challengeId);
      }

      return;
    }

    if (req.method === "POST" && url.pathname === "/quick-login/cancel") {
      const body = await readJson(req);
      const challengeId = String(body.challengeId || "");
      const session = sessions.get(challengeId);

      if (session) {
        await cancelQuickLogin(session);
        destroySession(challengeId);
      }

      sendJson(res, origin, 200, { ok: true });
      return;
    }

    sendJson(res, origin, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, origin, 502, {
      error: error instanceof Error ? error.message : "Velora Companion failed.",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("Velora Companion is running.");
  console.log(`Local bridge: http://${HOST}:${PORT}`);
  console.log(`Allowed Velora origin: ${DEFAULT_SITE_ORIGIN}`);
  if (EXTRA_ORIGIN) console.log(`Additional origin: ${EXTRA_ORIGIN}`);
  console.log("");
  console.log("Keep this process open while using Quick Sign-in.");
  console.log("The Roblox session cookie is never written to disk or returned to the website.");
  console.log("");
});
