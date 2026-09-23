import { NextResponse } from "next/server";
import { createQuickLoginChallenge } from "../../../../lib/roblox";
import {
  generateSessionKey,
  sealChallenge,
} from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHALLENGE_COOKIE = "velora.quick-login";
const SESSION_KEY_COOKIE = "velora.session-key";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

function cookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function POST(request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  }

  try {
    const challenge = await createQuickLoginChallenge();
    const expiresAt = new Date(challenge.expirationTime);

    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("Roblox returned an invalid challenge expiration time.");
    }

    const sessionKey = generateSessionKey();
    const sealed = sealChallenge(
      {
        code: challenge.code,
        privateKey: challenge.privateKey,
        expirationTime: challenge.expirationTime,
      },
      sessionKey,
    );

    const response = NextResponse.json(
      {
        code: challenge.code,
        status: challenge.status,
        expirationTime: challenge.expirationTime,
      },
      {
        headers: {
          "cache-control": "no-store, max-age=0",
        },
      },
    );

    const options = cookieOptions(expiresAt);

    response.cookies.set(SESSION_KEY_COOKIE, sessionKey, options);
    response.cookies.set(CHALLENGE_COOKIE, sealed, options);

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Quick Login code." },
      { status: 502 },
    );
  }
}
