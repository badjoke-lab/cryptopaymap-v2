import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "FORBIDDEN",
        message: "Public promote is disabled. Use the internal promote endpoint.",
        details: {},
      },
    },
    { status: 403 },
  );
}
