import { NextResponse } from "next/server";

export const revalidate = 0;

type LastFmImage = { "#text": string; size: string };
type LastFmTrack = {
  name: string;
  artist: { "#text": string };
  album: { "#text": string };
  image: LastFmImage[];
  url: string;
  "@attr"?: { nowplaying?: string };
  date?: { uts: string; "#text": string };
};

export async function GET() {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!apiKey || !user) {
    return NextResponse.json({ error: "Last.fm not configured" }, { status: 500 });
  }

  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getrecenttracks");
  url.searchParams.set("user", user);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 15 } });
    if (!res.ok) {
      return NextResponse.json({ error: "Last.fm request failed" }, { status: 502 });
    }
    const data = await res.json();
    const tracks: LastFmTrack[] = data?.recenttracks?.track ?? [];

    const shaped = tracks.map((t) => ({
      name: t.name,
      artist: t.artist?.["#text"],
      album: t.album?.["#text"],
      url: t.url,
      image: t.image?.find((i) => i.size === "extralarge")?.["#text"] || t.image?.at(-1)?.["#text"] || null,
      nowPlaying: t["@attr"]?.nowplaying === "true",
      playedAt: t.date?.uts ? Number(t.date.uts) * 1000 : null,
    }));

    const current = shaped.find((t) => t.nowPlaying) ?? null;
    const recent = shaped.filter((t) => !t.nowPlaying).slice(0, 5);

    return NextResponse.json({ track: current, recent });
  } catch {
    return NextResponse.json({ error: "Last.fm unreachable" }, { status: 502 });
  }
}
