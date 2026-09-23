import { NextResponse } from "next/server";
import { buildAccountMirror, getQuickLoginStatus } from "../../../../lib/roblox";
import { openChallenge } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "velora.quick-login";
const TERMINAL_STATES = new Set(["Validated", "Cancelled", "Expired", "TimedOut"]);

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function clearChallenge(response) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  const sealed = request.cookies.get(COOKIE_NAME)?.value;
  const challenge = openChallenge(sealed);

  if (!challenge?.code || !challenge?.privateKey || !challenge?.expirationTime) {
    return NextResponse.json(
      { error: "No active Velora Quick Login challenge." },
      { status: 401 },
    );
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

    // The private Quick Login key is intentionally destroyed here. Velora never
    // exchanges the validated challenge for a Roblox login session/cookie.
    clearChallenge(response);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check Quick Login status." },
      { status: 502 },
    );
  }
}
