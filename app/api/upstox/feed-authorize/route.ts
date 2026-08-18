import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("pt_access_token")?.value;
  if (!token) return NextResponse.json({ error: "Upstox is not connected." }, { status: 401 });

  const response = await fetch("https://api.upstox.com/v3/feed/market-data-feed/authorize", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json(data, { status: response.status });
  return NextResponse.json({ authorized_redirect_uri: data?.data?.authorized_redirect_uri ?? data?.data?.authorizedRedirectUri });
}
