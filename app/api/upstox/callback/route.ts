import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

function verifyState(state: string, secret: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;

  const [timestamp, nonce, signature] = parts;
  if (!timestamp || !nonce || !/^[0-9]+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < -60_000 || age > 10 * 60_000) return false;

  const payload = `${timestamp}.${nonce}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function getRedirectUri(request: NextRequest) {
  const configured = process.env.UPSTOX_REDIRECT_URI?.trim();
  const fallback = new URL("/api/upstox/callback", request.nextUrl.origin).toString();

  if (configured) {
    try {
      const configuredUrl = new URL(configured);
      if (configuredUrl.origin === request.nextUrl.origin) return configuredUrl.toString();
    } catch {
      // Fall through to the current-origin callback.
    }
  }

  return fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");

  if (!code) {
    return NextResponse.json({ error: "Missing Upstox authorization code." }, { status: 400 });
  }

  const clientId = process.env.UPSTOX_CLIENT_ID?.trim();
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = getRedirectUri(request);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Upstox environment variables are not configured." },
      { status: 500 }
    );
  }

  if (!returnedState || !verifyState(returnedState, clientSecret)) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth state. Please start the Upstox login again from the scanner." },
      { status: 400 }
    );
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch("https://api.upstox.com/v2/login/authorization/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const data = await tokenResponse.json();
  if (!tokenResponse.ok || !data.access_token) {
    return NextResponse.json(
      { error: "Upstox token exchange failed.", details: data },
      { status: 502 }
    );
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("pt_access_token", data.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
