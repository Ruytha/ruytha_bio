import SwiftUI
import BackgroundTasks

@main
struct NyaFMSyncApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var model = Model()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .onOpenURL { model.handle(url: $0) }
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
        .onChange(of: phase) { _, p in
            if p == .active { Task { await model.sync(auto: true) } }
            if p == .background { Refresh.schedule() }
        }
        // iOS wakes the app now and then (it decides when, based on how often you open it).
        .backgroundTask(.appRefresh(Refresh.id)) {
            Refresh.schedule()
            _ = try? await Syncer.shared.sync()
        }
    }
}

enum Refresh {
    static let id = "dev.ruytha.nyafmsync.refresh"

    static func schedule() {
        let r = BGAppRefreshTaskRequest(identifier: id)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(r)
    }
}

struct PendingLink: Identifiable {
    let server: String
    let token: String
    var id: String { server + token }
    var host: String { URL(string: server)?.host ?? server }
}

@MainActor
final class Model: ObservableObject {
    @Published var connected = Config.token != nil
    @Published var server = Config.server
    @Published var busy = false
    @Published var message = Config.lastMessage
    @Published var error: String?
    @Published var lastSync = Config.lastSync
    @Published var pending: PendingLink?

    func sync(auto: Bool = false) async {
        guard connected, !busy else { return }
        if auto, let l = lastSync, Date().timeIntervalSince(l) < 120 { return }
        busy = true
        error = nil
        do {
            message = try await Syncer.shared.sync().message
        } catch {
            self.error = error.localizedDescription
        }
        lastSync = Config.lastSync
        busy = false
    }

    func connect(server: String, token: String) {
        let t = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { error = "Paste your token first."; return }
        Config.server = Config.normalize(server)
        Config.token = t
        Config.lastSync = nil
        Config.lastMessage = nil
        self.server = Config.server
        message = nil
        error = nil
        lastSync = nil
        connected = true
        Task { await sync() }
    }

    func disconnect() {
        Config.token = nil
        Config.lastSync = nil
        Config.lastMessage = nil
        connected = false
        message = nil
        error = nil
        lastSync = nil
    }

    /// nyafm://setup?server=https://ruytha.dev&token=…  (the "Connect iPhone app" button in NyaFM Settings)
    func handle(url: URL) {
        guard url.scheme == "nyafm",
              let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let token = q.first(where: { $0.name == "token" })?.value, !token.isEmpty else { return }
        let server = Config.normalize(q.first(where: { $0.name == "server" })?.value ?? Config.defaultServer)
        pending = PendingLink(server: server, token: token)   // ask first, links can come from anywhere
    }
}
