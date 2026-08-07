import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isWhitelisted } from "@/lib/whitelist";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress;

  if (!isWhitelisted(email)) {
    return NextResponse.json({ error: "Not whitelisted" }, { status: 403 });
  }

  try {
    const { blobs } = await list({ limit: 50 });
    const shaped = blobs
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((b) => ({
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }));
    return NextResponse.json({ files: shaped });
  } catch {
    return NextResponse.json({ error: "Couldn't list files — is BLOB_READ_WRITE_TOKEN set?" }, { status: 500 });
  }
}
