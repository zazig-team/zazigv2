import SwiftUI
import Combine

struct QuietHoursSettingsView: View {
    @StateObject private var quietHoursService = QuietHoursService.shared
    @State private var isQuietHoursEnabled = false

    private let days: [(code: String, label: String)] = [
        ("mon", "Mon"),
        ("tue", "Tue"),
        ("wed", "Wed"),
        ("thu", "Thu"),
        ("fri", "Fri"),
        ("sat", "Sat"),
        ("sun", "Sun")
    ]

    private let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    var body: some View {
        Form {
            Toggle("Quiet Hours", isOn: Binding(
                get: { isQuietHoursEnabled },
                set: { enabled in
                    isQuietHoursEnabled = enabled
                    if !enabled {
                        quietHoursService.entries = []
                        Task {
                            await quietHoursService.save()
                        }
                    }
                }
            ))

            if isQuietHoursEnabled {
                Section("Presets") {
                    HStack {
                        Button("Weeknights") {
                            isQuietHoursEnabled = true
                            quietHoursService.entries = buildWeeknightsPresetEntries()
                        }

                        Spacer()

                        Button("Weekends") {
                            isQuietHoursEnabled = true
                            quietHoursService.entries = buildWeekendsPresetEntries()
                        }
                    }
                }

                Section("Schedule") {
                    ForEach(days, id: \.code) { day in
                        VStack(alignment: .leading, spacing: 8) {
                            Toggle(day.label, isOn: dayEnabledBinding(for: day.code))

                            HStack {
                                DatePicker(
                                    "Start",
                                    selection: startDateBinding(for: day.code),
                                    displayedComponents: .hourAndMinute
                                )
                                .datePickerStyle(.compact)
                                .environment(\.locale, Locale(identifier: "en_GB"))
                                .disabled(!isDayEnabled(day.code))

                                DatePicker(
                                    "End",
                                    selection: endDateBinding(for: day.code),
                                    displayedComponents: .hourAndMinute
                                )
                                .datePickerStyle(.compact)
                                .environment(\.locale, Locale(identifier: "en_GB"))
                                .disabled(!isDayEnabled(day.code))
                            }
                        }
                    }
                }
            }
        }
        .onAppear {
            Task {
                await quietHoursService.load()
                await MainActor.run {
                    isQuietHoursEnabled = !quietHoursService.entries.isEmpty
                }
            }
        }
        .onReceive(
            quietHoursService.$entries
                .dropFirst()
                .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
        ) { _ in
            Task {
                await quietHoursService.save()
            }
        }
    }

    private func buildWeeknightsPresetEntries() -> [QuietHoursEntry] {
        ["mon", "tue", "wed", "thu", "fri"].map {
            QuietHoursEntry(day: $0, start: "22:00", end: "07:00")
        }
    }

    private func buildWeekendsPresetEntries() -> [QuietHoursEntry] {
        ["sat", "sun"].map {
            QuietHoursEntry(day: $0, start: "00:00", end: "23:59")
        }
    }

    private func dayEnabledBinding(for day: String) -> Binding<Bool> {
        Binding(
            get: { isDayEnabled(day) },
            set: { enabled in
                if enabled {
                    upsertEntry(day: day, start: existingEntry(for: day)?.start ?? "22:00", end: existingEntry(for: day)?.end ?? "07:00")
                } else {
                    quietHoursService.entries.removeAll { $0.day == day }
                }
            }
        )
    }

    private func startDateBinding(for day: String) -> Binding<Date> {
        Binding(
            get: {
                dateFromTime(existingEntry(for: day)?.start ?? "22:00")
            },
            set: { newValue in
                let end = existingEntry(for: day)?.end ?? "07:00"
                upsertEntry(day: day, start: timeString(from: newValue), end: end)
            }
        )
    }

    private func endDateBinding(for day: String) -> Binding<Date> {
        Binding(
            get: {
                dateFromTime(existingEntry(for: day)?.end ?? "07:00")
            },
            set: { newValue in
                let start = existingEntry(for: day)?.start ?? "22:00"
                upsertEntry(day: day, start: start, end: timeString(from: newValue))
            }
        )
    }

    private func isDayEnabled(_ day: String) -> Bool {
        quietHoursService.entries.contains { $0.day == day }
    }

    private func existingEntry(for day: String) -> QuietHoursEntry? {
        quietHoursService.entries.first { $0.day == day }
    }

    private func upsertEntry(day: String, start: String, end: String) {
        if let index = quietHoursService.entries.firstIndex(where: { $0.day == day }) {
            quietHoursService.entries[index].start = start
            quietHoursService.entries[index].end = end
        } else {
            quietHoursService.entries.append(QuietHoursEntry(day: day, start: start, end: end))
        }
    }

    private func dateFromTime(_ value: String) -> Date {
        if let date = timeFormatter.date(from: value) {
            return date
        }

        return Date()
    }

    private func timeString(from date: Date) -> String {
        timeFormatter.string(from: date)
    }
}
