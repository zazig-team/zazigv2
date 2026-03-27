/**
 * Transcription service interface for converting audio to text.
 */

export interface TranscriptionResult {
  text: string;
  success: boolean;
}

export interface TranscriptionProvider {
  transcribe(buffer: Buffer, mimeType: string): Promise<TranscriptionResult>;
}

export class TranscriptionService {
  private provider: TranscriptionProvider;

  constructor(provider: TranscriptionProvider) {
    this.provider = provider;
  }

  async transcribe(buffer: Buffer, mimeType: string): Promise<TranscriptionResult> {
    return this.provider.transcribe(buffer, mimeType);
  }
}
