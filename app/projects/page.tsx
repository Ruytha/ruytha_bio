import Footer from "@/components/Footer";
import RevealSection from "@/components/RevealSection";

const PROJECTS = [
  {
    name: "DDFC",
    status: "In progress",
    statusColor: "#FFB25C",
    blurb: "Development is underway but has slowed down due to lack of motivation and working on other projects.",
  },
  {
    name: "VCap Motion",
    status: "Coming soon",
    statusColor: "#4CE0D2",
    blurb: "Details under wraps for now — watch this space.",
  },
  {
    name: "This website",
    status: "Always in progress",
    statusColor: "#7C5CFF",
    blurb: "Working on my web development skills — this site is the proof of work, and it'll keep changing as I get better at it.",
  },
  {
    name: "Borderline Obsession",
    status: "In production",
    statusColor: "#FF5CAD",
    blurb: "A short YouTube series I'm working on. Might take a while to come out since VCap Motion needs to ship first.",
  },
];

export default function ProjectsPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-5 pb-10 pt-20 sm:px-8 sm:pt-28">
        <p className="text-caption text-sm text-teal">what I'm up to</p>
        <h1 className="text-display mt-3 text-4xl font-bold text-ink sm:text-6xl">Projects</h1>
        <p className="text-body mt-4 max-w-lg text-ink-dim">
          A mix of finished, half-finished, and definitely-not-finished. Roughly ordered by how likely I am to
          actually talk about it if you ask.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROJECTS.map((p) => (
            <RevealSection key={p.name}>
              <div className="material h-full rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-heading text-xl font-semibold text-ink">{p.name}</h2>
                  <span
                    className="text-caption rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide"
                    style={{ color: p.statusColor, background: "rgba(255,255,255,0.06)" }}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-body mt-3 text-sm text-ink-dim">{p.blurb}</p>
              </div>
            </RevealSection>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
