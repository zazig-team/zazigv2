import Foundation
import Combine
import Supabase

struct QuietHoursEntry: Codable, Identifiable {
    var id = UUID()
    var day: String
    var start: String
    var end: String

    private enum CodingKeys: String, CodingKey {
        case id
        case day
        case start
        case end
    }

    init(id: UUID = UUID(), day: String, start: String, end: String) {
        self.id = id
        self.day = day
        self.start = start
        self.end = end
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        day = try container.decode(String.self, forKey: .day)
        start = try container.decode(String.self, forKey: .start)
        end = try container.decode(String.self, forKey: .end)
    }
}

class QuietHoursService: ObservableObject {
    static let shared = QuietHoursService()
    @Published var entries: [QuietHoursEntry] = []

    private let client: SupabaseClient
    private let dayCodes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    private let timeFormatter: DateFormatter

    private init(client: SupabaseClient = SupabaseService.shared.client) {
        self.client = client
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        self.timeFormatter = formatter
    }

    func load() async {
        do {
            let userID = try await authenticatedUserID()
            let rows: [UserPreferencesRow] = try await client
                .from("user_preferences")
                .select("quiet_hours")
                .eq("user_id", value: userID)
                .limit(1)
                .execute()
                .value

            await MainActor.run {
                self.entries = rows.first?.quiet_hours ?? []
            }
        } catch {
            await MainActor.run {
                self.entries = []
            }
        }
    }

    func save() async {
        do {
            let userID = try await authenticatedUserID()
            let payload = UserPreferencesUpsert(
                user_id: userID,
                quiet_hours: entries
            )

            try await client
                .from("user_preferences")
                .upsert(payload, onConflict: "user_id")
                .execute()
        } catch {
            return
        }
    }

    func isQuietNow() -> Bool {
        let weekdayNumber = Calendar.current.component(.weekday, from: Date())
        guard dayCodes.indices.contains(weekdayNumber - 1) else {
            return false
        }

        let today = dayCodes[weekdayNumber - 1]
        let now = timeFormatter.string(from: Date())
        let todaysEntries = entries.filter { $0.day.lowercased() == today }

        for entry in todaysEntries {
            if entry.start <= entry.end {
                if entry.start <= now && now <= entry.end {
                    return true
                }
            } else {
                if now >= entry.start || now <= entry.end {
                    return true
                }
            }
        }

        return false
    }

    private func authenticatedUserID() async throws -> String {
        let session = try await client.auth.session
        return String(describing: session.user.id)
    }
}

private struct UserPreferencesRow: Decodable {
    let quiet_hours: [QuietHoursEntry]?
}

private struct UserPreferencesUpsert: Encodable {
    let user_id: String
    let quiet_hours: [QuietHoursEntry]
}
