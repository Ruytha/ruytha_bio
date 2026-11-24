import Foundation
import MediaPlayer
import Security

// Apple has no "what did I just play" API, but the Music library on the phone keeps a play count and a
// last-played date for every song. We send those for recently played songs to NyaFM, which remembers
// each song's count and scrobbles the difference (lib/nyafm/applemusic.js on the server).

enum Config {
    static let defaultServer = "https://ruytha.dev"
    private static let d = UserDefaults.standard

    static var server: String {
        get { d.string(forKey: "server") ?? defaultServer }
        set { d.set(newValue, forKey: "server") }
    }
    static var token: String? {
        get { Keychain.get("token") }
        set { Keychain.set("token", newValue) }
    }
    static var lastSync: Date? {
        get { d.object(forKey: "lastSync") as? Date }
        set { d.set(newValue, forKey: "lastSync") }
    }
    static var lastMessage: String? {
        get { d.string(forKey: "lastMessage") }
        set { d.set(newValue, forKey: "lastMessage") }
    }

    /// "ruytha.dev/" -> "https://ruytha.dev"
    static func normalize(_ s: String) -> String {
        var v = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return defaultServer }
        if !v.lowercased().hasPrefix("http://") && !v.lowercased().hasPrefix("https://") { v = "https://" + v }
        while v.hasSuffix("/") { v.removeLast() }
        if v.lowercased().hasSuffix("/fm") { v.removeLast(3) }
        return v
    }
}

enum Keychain {
    private static let service = "dev.ruytha.nyafmsync"

    static func get(_ key: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ key: String, _ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value, !value.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock   // background syncs run while locked
        SecItemAdd(add as CFDictionary, nil)
    }
}

struct SyncResult {
    let message: String
    let scrobbled: Int
}

enum SyncError: LocalizedError {
    case notConnected, noLibraryAccess, badServer, server(String)

    var errorDescription: String? {
        switch self {
        case .notConnected: return "Connect your NyaFM account first."
        case .noLibraryAccess: return "NyaFM can't see your music library. Turn on Settings → Apps → NyaFM → Media & Apple Music."
        case .badServer: return "That server address doesn't look right."
        case .server(let m): return m
        }
    }
}

actor Syncer {
    static let shared = Syncer()
    private var running: Task<SyncResult, Error>?

    /// One sync at a time; a second caller (app opening while a Shortcut runs) waits for the same result.
    func sync() async throws -> SyncResult {
        if let running { return try await running.value }
        let task = Task { try await Syncer.run() }
        running = task
        defer { running = nil }
        return try await task.value
    }

    static func libraryAccess() async -> Bool {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return true
        case .notDetermined:
            return await withCheckedContinuation { c in
                MPMediaLibrary.requestAuthorization { c.resume(returning: $0 == .authorized) }
            }
        default: return false
        }
    }

    private static func run() async throws -> SyncResult {
        guard let token = Config.token, !token.isEmpty else { throw SyncError.notConnected }
        guard let url = URL(string: Config.server + "/v1/apple-music"), url.host != nil else { throw SyncError.badServer }
        guard await libraryAccess() else { throw SyncError.noLibraryAccess }

        let now = Date()
        let day: TimeInterval = 86_400
        // Songs played since the last sync (with 2 days of overlap), never further back than 30 days.
        let from = Config.lastSync.map { max($0.addingTimeInterval(-2 * day), now.addingTimeInterval(-30 * day)) }
            ?? now.addingTimeInterval(-30 * day)

        let items = (MPMediaQuery.songs().items ?? [])
            .filter { $0.playCount > 0 && ($0.lastPlayedDate ?? .distantPast) >= from }
            .sorted { ($0.lastPlayedDate ?? .distantPast) > ($1.lastPlayedDate ?? .distantPast) }
            .prefix(3000)

        let iso = ISO8601DateFormatter()
        let songs: [[String: Any]] = items.compactMap { it in
            guard let title = it.title, !title.isEmpty,
                  let artist = it.artist ?? it.albumArtist, !artist.isEmpty else { return nil }
            var s: [String: Any] = [
                "artist": artist,
                "title": title,
                "album": it.albumTitle ?? "",
                "plays": it.playCount,
                "duration": Int(it.playbackDuration.rounded()),
            ]
            if let lp = it.lastPlayedDate { s["last_played"] = iso.string(from: lp) }
            return s
        }

        if songs.isEmpty {
            let msg = "Up to date, no new plays."
            if Config.lastSync != nil { Config.lastSync = now }
            Config.lastMessage = msg
            return SyncResult(message: msg, scrobbled: 0)
        }

        var req = URLRequest(url: url, timeoutInterval: 25)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["songs": songs])

        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]

        if code == 401 || code == 403 {
            throw SyncError.server("Your token wasn't accepted. Reconnect from NyaFM → Settings.")
        }
        guard code == 200, json?["ok"] as? Bool == true else {
            let m = (json?["message"] as? String) ?? (json?["error"] as? String) ?? "The server answered \(code)."
            throw SyncError.server(m)
        }

        let msg = (json?["message"] as? String) ?? "Synced."
        Config.lastSync = now
        Config.lastMessage = msg
        return SyncResult(message: msg, scrobbled: json?["scrobbled"] as? Int ?? 0)
    }
}
