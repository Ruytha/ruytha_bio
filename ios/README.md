# NyaFM for iPhone

Scrobbles Apple Music plays to NyaFM. It reads the play count and last-played date of each song in
the iPhone's music library and sends them to `/v1/apple-music`. The server scrobbles the difference
since the last sync.

## Install (Mac + iPhone, about 5 minutes)

1. Open `NyaFMSync.xcodeproj` in Xcode.
2. Click **NyaFMSync** in the left sidebar, open **Signing & Capabilities**, then set **Team** to your Apple ID
   (**Add an Account…** if it's not listed). A free Apple ID works.
   - If Xcode says the bundle identifier is taken, change `dev.ruytha.nyafmsync` to something else.
3. Plug in the iPhone (or pick it over Wi-Fi). Choose it in the device menu at the top and press **▶ Run**.
4. First time only, on the iPhone:
   - **Settings → Privacy & Security → Developer Mode → On** (it restarts).
   - **Settings → General → VPN & Device Management →** your Apple ID **→ Trust**.
5. Open NyaFM on the iPhone and allow access to Apple Music.
6. In Safari on the iPhone, go to `ruytha.dev/fm` → **Settings** → **Connect the iPhone app**.

With a free Apple ID the app stops opening after 7 days. Press Run in Xcode again to renew it; your data
stays. A paid developer account makes it last a year.

## When it syncs

- Every time you open the app.
- In the background now and then (iOS decides when).
- Instantly after closing Music, if you add an automation: **Shortcuts → Automation → + → App → Music →
  Is Closed → Run Immediately → "Scrobble Apple Music"**.
- With Siri: "Scrobble with NyaFM".
