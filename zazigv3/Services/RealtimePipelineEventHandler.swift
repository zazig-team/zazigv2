import Foundation
import UserNotifications

final class RealtimePipelineEventHandler {
    private let notificationCenter: UNUserNotificationCenter

    init(notificationCenter: UNUserNotificationCenter = .current()) {
        self.notificationCenter = notificationCenter
    }

    func handlePipelineEvent(
        title: String,
        body: String,
        identifier: String = UUID().uuidString
    ) {
        // Realtime subscription processing continues; only notification surfacing is gated.
        dispatchPipelineNotification(title: title, body: body, identifier: identifier)
    }

    private func dispatchPipelineNotification(
        title: String,
        body: String,
        identifier: String
    ) {
        guard !QuietHoursService.shared.isQuietNow() else { return }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        notificationCenter.add(request)
    }
}
