import { NextResponse } from "next/server";

export async function GET() {
  const cmsUrl = process.env.NEXT_PUBLIC_CMS_URL;

  if (!cmsUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_CMS_URL is missing" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    cmsUrl,
  });
}