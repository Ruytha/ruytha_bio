import SwiftUI

enum Theme {
    static let bg = Color(red: 0x0f / 255, green: 0x0d / 255, blue: 0x14 / 255)
    static let card = Color.white.opacity(0.06)
    static let accent = Color(red: 1, green: 0x6f / 255, blue: 0xae / 255)
    static let accent2 = Color(red: 0xb5 / 255, green: 0x8c / 255, blue: 1)
    static let gradient = LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
}

struct ContentView: View {
    @EnvironmentObject var model: Model

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                if model.connected { SyncCard(); AutoCard(); NotesCard(); footer } else { ConnectCard() }
            }
            .padding(20)
        }
        .background(Theme.bg.ignoresSafeArea())
        .alert(item: $model.pending) { link in
            Alert(
                title: Text("Connect to \(link.host)?"),
                message: Text("Your Apple Music plays will be scrobbled to the NyaFM account this link belongs to."),
                primaryButton: .default(Text("Connect")) { model.connect(server: link.server, token: link.token) },
                secondaryButton: .cancel()
            )
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 14).fill(Theme.gradient).frame(width: 52, height: 52)
                Image(systemName: "music.note").font(.system(size: 24, weight: .bold)).foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("NyaFM").font(.title.bold())
                Text("Apple Music scrobbler").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private var footer: some View {
        VStack(spacing: 8) {
            Text("Connected to \(URL(string: model.server)?.host ?? model.server)").font(.footnote).foregroundStyle(.secondary)
            Button("Disconnect", role: .destructive) { model.disconnect() }.font(.footnote)
        }
        .padding(.top, 4)
    }
}

struct Card<Content: View>: View {
    var title: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { Text(title).font(.headline) }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct SyncCard: View {
    @EnvironmentObject var model: Model

    var body: some View {
        Card {
            Button {
                Task { await model.sync() }
            } label: {
                HStack(spacing: 10) {
                    if model.busy { ProgressView().tint(.white) } else { Image(systemName: "arrow.triangle.2.circlepath") }
                    Text(model.busy ? "Scrobbling…" : "Scrobble now").font(.headline)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(Theme.gradient, in: RoundedRectangle(cornerRadius: 16))
            }
            .disabled(model.busy)

            if let e = model.error {
                Label(e, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.subheadline)
            } else if let m = model.message {
                Label(m, systemImage: "checkmark.circle.fill").font(.subheadline)
            }
            if let d = model.lastSync {
                Text("Last synced \(Text(d, style: .relative)) ago").font(.footnote).foregroundStyle(.secondary)
            }
        }
    }
}

struct AutoCard: View {
    var body: some View {
        Card(title: "It runs by itself") {
            row("iphone", "Every time you open this app.")
            row("clock.arrow.circlepath", "Now and then in the background, when iOS lets it.")
            row("bolt.fill", "Right after you close Music, if you add this automation once:")
            VStack(alignment: .leading, spacing: 6) {
                step(1, "Shortcuts app → Automation → +")
                step(2, "App → Music → Is Closed → Run Immediately")
                step(3, "Pick “Scrobble Apple Music” (NyaFM)")
            }
            .padding(.leading, 34)
            row("mic.fill", "Or ask Siri: “Scrobble with NyaFM”.")
        }
    }

    private func row(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).foregroundStyle(Theme.accent).frame(width: 22)
            Text(text).font(.subheadline)
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("\(n)").font(.caption.bold()).frame(width: 18, height: 18).background(Theme.accent.opacity(0.25), in: Circle())
            Text(text).font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct NotesCard: View {
    var body: some View {
        Card(title: "Good to know") {
            Text("Only songs in your library count, so add the ones you stream. The latest play of each song gets its real time; earlier plays since the last sync are placed just before it. The first sync only remembers your play counts, plays after that become scrobbles.")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }
}

struct ConnectCard: View {
    @EnvironmentObject var model: Model
    @State private var server = Config.server
    @State private var token = ""

    var body: some View {
        Card(title: "Connect your account") {
            Text("Easiest: on this iPhone open **ruytha.dev/fm**, log in, go to **Settings** and tap **Connect the iPhone app**.")
                .font(.subheadline)
            Text("Or paste it here:").font(.footnote).foregroundStyle(.secondary).padding(.top, 4)
            TextField("Server", text: $server)
                .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                .padding(12).background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
            SecureField("Scrobble token (from Settings)", text: $token)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .padding(12).background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
            if let e = model.error { Text(e).font(.footnote).foregroundStyle(.orange) }
            Button {
                model.connect(server: server, token: token)
            } label: {
                Text("Connect").font(.headline).foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(Theme.gradient, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }
}

#Preview {
    ContentView().environmentObject(Model()).preferredColorScheme(.dark)
}
