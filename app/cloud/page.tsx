import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { auth as serverAuth, clerkClient as serverClerkClient } from "@clerk/nextjs/server";
import CloudUploader from "@/components/CloudUploader";
import Footer from "@/components/Footer";
import { isWhitelisted } from "@/lib/whitelist";

export default async function CloudPage() {
  const { userId } = await serverAuth();
  let allowed = false;
  let email: string | null = null;

  if (userId) {
    const client = await serverClerkClient();
    const user = await client.users.getUser(userId);
    email = user.primaryEmailAddress?.emailAddress ?? null;
    allowed = isWhitelisted(email);
  }

  return (
    <>
      <section className="mx-auto max-w-3xl px-5 pb-16 pt-20 sm:px-8 sm:pt-28">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-sm text-teal">private</p>
            <h1 className="text-display mt-2 text-4xl font-bold text-ink sm:text-5xl">RuythaCloud</h1>
          </div>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>

        <p className="text-body mt-4 max-w-lg text-ink-dim">
          A whitelist-only drop box. Files go into a private store and get synced onto my PC — nothing here is
          publicly reachable.
        </p>

        <div className="mt-10">
          <Show when="signed-out">
            <div className="material rounded-3xl p-8 text-center">
              <p className="text-heading text-lg font-semibold text-ink">Sign in to continue</p>
              <p className="text-body mt-2 text-sm text-ink-dim">You'll need to be on the whitelist to upload anything.</p>
              <SignInButton mode="modal">
                <button className="mt-5 rounded-full bg-gradient-to-r from-violet to-magenta px-5 py-2.5 text-sm font-medium text-white">
                  Sign in
                </button>
              </SignInButton>
            </div>
          </Show>

          <Show when="signed-in">
            {allowed ? (
              <CloudUploader />
            ) : (
              <div className="material rounded-3xl p-8 text-center">
                <p className="text-heading text-lg font-semibold text-ink">Not on the list</p>
                <p className="text-body mt-2 text-sm text-ink-dim">
                  {email ?? "This account"} isn't whitelisted for RuythaCloud. Ask Ruytha to add you.
                </p>
              </div>
            )}
          </Show>
        </div>
      </section>

      <Footer />
    </>
  );
}