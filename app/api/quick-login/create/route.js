import { NextResponse } from "next/server";
import { createQuickLoginChallenge } from "../../../../lib/roblox";
import { sealChallenge } from "../../../../lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "velora.quick-login";

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
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

    const sealed = sealChallenge({
      code: challenge.code,
      privateKey: challenge.privateKey,
      expirationTime: challenge.expirationTime,
    });

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

    response.cookies.set(COOKIE_NAME, sealed, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Quick Login code." },
      { status: 502 },
    );
  }
}
