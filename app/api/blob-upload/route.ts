import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isWhitelisted } from "@/lib/whitelist";

/**
 * This route never touches the file itself — the browser uploads directly
 * to Vercel Blob. All this does is decide, per request, whether the
 * currently signed-in Clerk user is allowed to get an upload token at all.
 * That keeps big files off Vercel's serverless function body-size limit
 * (4.5MB on the free plan) while still gating uploads to the whitelist.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const { userId } = await auth();
        if (!userId) {
          throw new Error("Not signed in.");
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const email = user.primaryEmailAddress?.emailAddress;

        if (!isWhitelisted(email)) {
          throw new Error("This account isn't on the RuythaCloud whitelist.");
        }

        return {
          access: "private",
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId, email }),
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB per file, adjust to taste
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Nothing to do server-side here — the local sync script (see
        // scripts/sync-cloud.js) polls the store and pulls new files down.
        // This hook is a good place to log or notify if you want that later.
        console.log("RuythaCloud upload complete:", blob.pathname, tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload rejected" },
      { status: 403 }
    );
  }
}
