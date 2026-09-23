import { NextResponse } from "next/server";
import { buildAccountMirror, getQuickLoginStatus } from "../../../../lib/roblox";
import { openChallenge } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "velora.quick-login";
const SESSION_KEY_COOKIE = "velora.session-key";
const TERMINAL_STATES = new Set(["Validated", "Cancelled", "Expired", "TimedOut"]);

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function clearChallenge(response) {
  const options = {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(CHALLENGE_COOKIE, "", options);
  response.cookies.set(SESSION_KEY_COOKIE, "", options);
}

export async function POST(request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  const sealed = request.cookies.get(CHALLENGE_COOKIE)?.value;
  const sessionKey = request.cookies.get(SESSION_KEY_COOKIE)?.value;
  const challenge = openChallenge(sealed, sessionKey);

  if (!challenge?.code || !challenge?.privateKey || !challenge?.expirationTime) {
    const response = NextResponse.json(
      { error: "No active Velora Quick Login challenge." },
      { status: 401 },
    );
    clearChallenge(response);
    return response;
  }

  if (Date.now() >= new Date(challenge.expirationTime).getTime()) {
    const response = NextResponse.json({ status: "Expired" }, { status: 410 });
    clearChallenge(response);
    return response;
  }

  try {
    const statusData = await getQuickLoginStatus(
      challenge.code,
      challenge.privateKey,
    );

    const status = String(statusData.status || "Created");

    if (status !== "Validated") {
      const response = NextResponse.json(
        {
          status,
          accountName: statusData.accountName || null,
          accountPictureUrl: statusData.accountPictureUrl || null,
          expirationTime: statusData.expirationTime || challenge.expirationTime,
        },
        { headers: { "cache-control": "no-store, max-age=0" } },
      );

      if (TERMINAL_STATES.has(status)) clearChallenge(response);
      return response;
    }

    if (!statusData.accountName) {
      throw new Error("Roblox validated the request without an account name.");
    }

    const account = await buildAccountMirror(
      String(statusData.accountName),
      statusData.accountPictureUrl || null,
    );

    const response = NextResponse.json(
      {
        status: "Validated",
        account,
      },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );

    // Both the encrypted challenge and its one-time AES key are destroyed here.
    // Velora still never exchanges the validated challenge for a Roblox session.
    clearChallenge(response);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check Quick Login status." },
      { status: 502 },
    );
  }
}
