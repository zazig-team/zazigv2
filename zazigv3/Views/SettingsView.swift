import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(Settings.self) private var settings
    @Environment(SupabaseAuthService.self) private var auth

    @State private var emailDraft = ""
    @State private var codeDraft = ""

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                pipelineSection

                Section {
                    SecureField("Nous Portal API key", text: $settings.apiKey)
                        .textContentType(.password)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text("Hermes key")
                } footer: {
                    Text("Get one at portal.nousresearch.com → API Keys. Stored in UserDefaults for the spike; move to Keychain before shipping.")
                }

                Section("Endpoint") {
                    TextField("Base URL", text: $settings.baseURL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    TextField("Model", text: $settings.model)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }

                Section {
                    NavigationLink("Quiet Hours") {
                        QuietHoursSettingsView()
                    }
                }

                Section {
                    Text("Default is Nous Portal (stateless). Point Base URL at a self-hosted `hermes serve` to get memory + sub-agents.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .bold()
                }
            }
        }
    }

    @ViewBuilder
    private var pipelineSection: some View {
        if auth.isSignedIn {
            signedInSection
        } else if auth.pendingEmail != nil {
            codeEntrySection
        } else {
            emailEntrySection
        }
    }

    private var signedInSection: some View {
        Section {
            HStack {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.signedInEmail ?? "Signed in")
                        .font(.body)
                    Text("zazigv2 pipeline").font(.caption).foregroundStyle(.secondary)
                }
            }
            Button(role: .destructive) {
                Task { await auth.signOut() }
            } label: { Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right") }
        } header: {
            Text("Pipeline")
        } footer: {
            Text("Ideas you send from chat will land in v2's pipeline tied to your company. Auto-triage + auto-spec fire automatically.")
        }
    }

    private var emailEntrySection: some View {
        Section {
            TextField("you@example.com", text: $emailDraft)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            Button {
                Task { await auth.sendCode(email: emailDraft) }
            } label: {
                if auth.isSendingCode {
                    ProgressView()
                } else {
                    Label("Send sign-in code", systemImage: "envelope")
                }
            }
            .disabled(emailDraft.isEmpty || auth.isSendingCode)
            if let err = auth.lastError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        } header: {
            Text("Pipeline sign-in")
        } footer: {
            Text("Sign in to send ideas into zazigv2's build pipeline. We'll email you a 6-digit code.")
        }
    }

    private var codeEntrySection: some View {
        Section {
            HStack {
                Image(systemName: "envelope.open.fill").foregroundStyle(.blue)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Code sent to").font(.caption).foregroundStyle(.secondary)
                    Text(auth.pendingEmail ?? "").font(.body)
                }
            }
            TextField("6-digit code", text: $codeDraft)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.system(.title3, design: .monospaced))
                .onChange(of: codeDraft) { _, new in
                    let digits = new.filter(\.isNumber)
                    if digits != new { codeDraft = digits; return }
                    if digits.count == 6 {
                        Task { await auth.verifyCode(digits) }
                    }
                }
            Button {
                Task { await auth.verifyCode(codeDraft) }
            } label: {
                if auth.isVerifyingCode {
                    ProgressView()
                } else {
                    Label("Verify", systemImage: "checkmark.seal")
                }
            }
            .disabled(codeDraft.count < 6 || auth.isVerifyingCode)
            Button(role: .cancel) {
                codeDraft = ""
                auth.cancelPendingCode()
            } label: { Label("Use a different email", systemImage: "arrow.uturn.backward") }
            if let err = auth.lastError {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        } header: {
            Text("Enter sign-in code")
        } footer: {
            Text("Check your inbox — the code expires in about an hour. iOS may auto-fill it from the email.")
        }
    }
}
