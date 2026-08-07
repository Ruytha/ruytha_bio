import Footer from "@/components/Footer";
import RevealSection from "@/components/RevealSection";

const CHANNELS = [
  {
    label: "Discord",
    value: "Send a friend request",
    href: "https://discord.com/users/690508522395402260",
    hint: "Fastest way to reach me",
  },
  {
    label: "Discord server",
    value: "Join the server",
    href: "https://discord.gg/m9veFRXxDF",
    hint: "For everyone else, not just DMs",
  },
  {
    label: "Spotify",
    value: "See what I'm playing",
    href: "https://open.spotify.com/user/31wqsddt5oxby3p4ta7rx52mt6nu",
    hint: "Also check the Last.fm widget on the home page",
  },
  {
    label: "Blog",
    value: "Read the blog",
    href: "https://ruytha.blogspot.com",
    hint: "Updated whenever the mood strikes",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pb-10 pt-20 sm:px-8 sm:pt-28">
        <p className="text-caption text-sm text-teal">get in touch</p>
        <h1 className="text-display mt-3 text-4xl font-bold text-ink sm:text-6xl">Contact me</h1>
        <p className="text-body mt-4 max-w-lg text-ink-dim">
          No contact form here — I'll actually see a Discord message before I see a form submission. Pick whatever's
          easiest.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <RevealSection key={c.label}>
              <a
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="material group block h-full rounded-3xl p-6 transition-transform hover:-translate-y-0.5"
              >
                <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">{c.label}</p>
                <p className="text-heading mt-2 text-xl font-semibold text-ink transition-colors group-hover:text-violet">
                  {c.value}
                </p>
                <p className="text-body mt-2 text-sm text-ink-dim">{c.hint}</p>
              </a>
            </RevealSection>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
