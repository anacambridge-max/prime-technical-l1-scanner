import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;

  if (!clientId || !redirectUri || !clientSecret) {
    return NextResponse.json(
      { error: "UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET and UPSTOX_REDIRECT_URI are not configured." },
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
