/**
 * OpenAI Whisper transcription provider.
 */

import type { TranscriptionProvider, TranscriptionResult } from "./transcription.js";

export class OpenAITranscriber implements TranscriptionProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(buffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const ext = mimeType === "audio/ogg" ? "ogg" : "wav";
    const blob = new Blob([buffer], { type: mimeType });

    const form = new FormData();
    form.append("file", blob, `audio.${ext}`);
    form.append("model", "whisper-1");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[transcription-openai] Whisper API error:", err);
      return { text: "", success: false };
    }

    const data = (await response.json()) as { text: string };
    return { text: data.text, success: true };
  }
}
