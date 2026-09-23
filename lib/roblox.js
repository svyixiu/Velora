const QUICK_LOGIN_BASE = "https://apis.roblox.com/auth-token-service/v1/login";

async function parseJson(response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Roblox returned a non-JSON response (${response.status}).`);
  }
}

async function robloxPostWithCsrfRetry(url, body) {
  const makeRequest = (csrfToken) =>
    fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Velora/0.1 (+https://github.com/svyixiu/Velora)",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

  let response = await makeRequest();
  const csrfToken = response.headers.get("x-csrf-token");

  if ((response.status === 400 || response.status === 403) && csrfToken) {
    response = await makeRequest(csrfToken);
  }

  const data = await parseJson(response);

  if (!response.ok) {
    const message =
      data?.errors?.[0]?.message ||
      data?.message ||
      `Roblox request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return data;
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

function normalizeRobloxTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  // Roblox Quick Login currently returns UTC timestamps that may omit an
  // explicit timezone suffix. Browsers interpret timezone-less ISO strings as
  // local time, so normalize them to an explicit UTC instant before returning
  // them to the client.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const candidate = hasTimezone ? raw : `${raw}Z`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Roblox returned an invalid Quick Login timestamp.");
  }

  return date.toISOString();
}

export async function createQuickLoginChallenge() {
  const data = await robloxPostWithCsrfRetry(`${QUICK_LOGIN_BASE}/create`, {});
  const code = normalizeCode(data.code);

  if (!code || !data.privateKey || !data.expirationTime) {
    throw new Error("Roblox returned an unexpected Quick Login response.");
  }

  return {
    code,
    privateKey: String(data.privateKey),
    expirationTime: normalizeRobloxTimestamp(data.expirationTime),
    status: String(data.status || "Created"),
  };
}

export async function getQuickLoginStatus(code, privateKey) {
  const data = await robloxPostWithCsrfRetry(`${QUICK_LOGIN_BASE}/status`, {
    code,
    privateKey,
  });

  if (data?.expirationTime) {
    data.expirationTime = normalizeRobloxTimestamp(data.expirationTime);
  }

  return data;
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const data = await parseJson(response);
  if (!response.ok) return null;
  return data;
}

async function resolveUsername(username) {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false,
    }),
    cache: "no-store",
  });

  const data = await parseJson(response);
  if (!response.ok) return null;
  return data?.data?.[0] || null;
}

export async function buildAccountMirror(accountName, quickLoginPicture = null) {
  const identity = await resolveUsername(accountName);

  if (!identity?.id) {
    throw new Error("Velora could not resolve the validated Roblox account.");
  }

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
    username: profile?.name || identity.name || accountName,
    displayName: profile?.displayName || identity.displayName || accountName,
    description: profile?.description || "",
    created: profile?.created || null,
    isBanned: Boolean(profile?.isBanned),
    hasVerifiedBadge: Boolean(
      profile?.hasVerifiedBadge ?? identity.hasVerifiedBadge,
    ),
    avatar:
      thumbnail?.data?.[0]?.imageUrl || quickLoginPicture || null,
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
