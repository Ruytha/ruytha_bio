export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mx-auto w-full max-w-5xl px-5 pb-28 pt-16 sm:px-8">
      <div className="material-light rounded-2xl px-6 py-5 text-center">
        <p className="text-caption text-xs text-ink-faint">
          © {year} ruytha · built from Australia, mostly at 2am
        </p>
      </div>
    </footer>
  );
}
