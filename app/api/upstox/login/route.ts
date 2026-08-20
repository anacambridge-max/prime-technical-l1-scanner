import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

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
  const clientId = process.env.UPSTOX_CLIENT_ID?.trim();
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = getRedirectUri(request);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "UPSTOX_CLIENT_ID and UPSTOX_CLIENT_SECRET are not configured." },
      { status: 500 }
    );
  }

  // Keep the OAuth state self-contained. This avoids relying on a browser cookie
  // surviving the round-trip through Upstox, while still preventing CSRF.
  const timestamp = Date.now().toString();
  const nonce = randomBytes(24).toString("hex");
  const payload = `${timestamp}.${nonce}`;
  const signature = createHmac("sha256", clientSecret).update(payload).digest("hex");
  const state = `${payload}.${signature}`;

  const url = new URL("https://api.upstox.com/v2/login/authorization/dialog");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
