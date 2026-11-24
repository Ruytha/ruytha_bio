import AppIntents

// Shows up in the Shortcuts app as one ready-made action, "Scrobble Apple Music", and works with Siri
// ("Scrobble with NyaFM"). Use it in an automation: Music → Is Closed → Run Immediately.
struct ScrobbleAppleMusicIntent: AppIntent {
    static let title: LocalizedStringResource = "Scrobble Apple Music"
    static let description = IntentDescription("Sends new Apple Music plays to NyaFM as scrobbles.")
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = try await Syncer.shared.sync()
        return .result(dialog: "\(result.message)")
    }
}

struct NyaFMShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ScrobbleAppleMusicIntent(),
            phrases: [
                "Scrobble with \(.applicationName)",
                "Sync \(.applicationName)",
            ],
            shortTitle: "Scrobble Apple Music",
            systemImageName: "music.note"
        )
    }
}
