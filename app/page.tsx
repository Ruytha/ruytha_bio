import LastFmWidget from "@/components/LastFmWidget";
import Footer from "@/components/Footer";
import RevealSection from "@/components/RevealSection";

const WHAT_I_DO = [
  "Blender",
  "Editing (DaVinci Resolve)",
  "Lighting (virtual and IRL)",
  "Music producer",
  "Film director",
  "Photographer",
  "CSS, JS, HTML & Python dev",
];

const ABOUT = [
  "From Australia",
  "Played Rec Room from 2021 to 2026",
  "A human",
  "Learning Japanese",
  "NOT a femboy",
  "CEO at markdown",
  "An idot",
];

const SOCIALS = [
  { label: "Spotify", href: "https://open.spotify.com/user/31wqsddt5oxby3p4ta7rx52mt6nu" },
  { label: "Discord", href: "https://discord.com/users/690508522395402260" },
  { label: "Discord server", href: "https://discord.gg/m9veFRXxDF" },
  { label: "Spicy Lyrics", href: "https://spicylyrics.org/ruytha" },
  { label: "Blog", href: "https://ruytha.blogspot.com" },
];

export default function HomePage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pb-20 pt-20 sm:px-8 sm:pt-28">
        <p className="text-caption text-sm text-teal">@ruytha</p>
        <h1 className="text-display mt-3 text-5xl font-bold text-ink sm:text-7xl">
          Hi<span className="text-violet">.</span>
        </h1>
        <p className="text-body mt-5 max-w-lg text-lg text-ink-dim">
          Blender artist, film director, music producer, and a self-appointed CEO of markdown.
          Based in Australia, mid-way through learning Japanese, definitively{" "}
          <span className="text-ink">not</span> a femboy.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {SOCIALS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="material-light rounded-full px-4 py-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {s.label}
            </a>
          ))}
        </div>
      </section>

      <RevealSection>
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
          <SectionLabel>what I do</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {WHAT_I_DO.map((item) => (
              <div key={item} className="material-light rounded-xl px-4 py-3 text-sm text-ink-dim">
                {item}
              </div>
            ))}
          </div>
        </section>
      </RevealSection>

      <RevealSection>
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
          <SectionLabel>on repeat</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href="https://open.spotify.com/artist/5INjqkS1o8h1imAzPqGZBb"
              target="_blank"
              rel="noopener noreferrer"
              className="material rounded-3xl p-5 transition-transform hover:-translate-y-0.5"
            >
              <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">favorite artist</p>
              <p className="text-heading mt-2 text-2xl font-semibold text-ink">Tame Impala</p>
            </a>
            <a
              href="https://open.spotify.com/track/7eqIZPAPLQhkjSVTzBT7UR"
              target="_blank"
              rel="noopener noreferrer"
              className="material rounded-3xl p-5 transition-transform hover:-translate-y-0.5"
            >
              <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">favorite track</p>
              <p className="text-heading mt-2 text-2xl font-semibold text-ink">Cherry Blossom</p>
              <p className="mt-0.5 text-sm text-ink-dim">Empire Of The Sun · 3:28</p>
            </a>
          </div>
        </section>
      </RevealSection>

      <RevealSection>
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
          <SectionLabel>currently playing</SectionLabel>
          <div className="mt-4">
            <LastFmWidget />
          </div>
        </section>
      </RevealSection>

      <RevealSection>
        <section className="mx-auto max-w-5xl px-5 pb-8 sm:px-8">
          <SectionLabel>about myself</SectionLabel>
          <ul className="mt-4 flex flex-wrap gap-2">
            {ABOUT.map((item) => (
              <li
                key={item}
                className="material-light rounded-full px-4 py-1.5 text-sm text-ink-dim"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      </RevealSection>

      <Footer />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">{children}</p>;
}
