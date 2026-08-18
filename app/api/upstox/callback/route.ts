import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  const savedState = request.cookies.get("pt_oauth_state")?.value;

  if (!code) return NextResponse.json({ error: "Missing Upstox authorization code." }, { status: 400 });
  if (!returnedState || !savedState || returnedState !== savedState) {
    return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
  }

  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Upstox environment variables are not configured." }, { status: 500 });
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
    headers: { accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const data = await tokenResponse.json();
  if (!tokenResponse.ok || !data.access_token) {
    return NextResponse.json({ error: "Upstox token exchange failed.", details: data }, { status: 502 });
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("pt_access_token", data.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  response.cookies.delete("pt_oauth_state");
  return response;
}
