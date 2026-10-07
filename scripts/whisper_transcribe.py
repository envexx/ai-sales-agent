#!/usr/bin/env python
"""Transkripsi audio voice note WhatsApp dengan faster-whisper (lokal).

Dipakai oleh `src/integrations/whisper.ts`:
    python scripts/whisper_transcribe.py <audio_file> [model] [language]

Mencetak satu baris JSON: {"text": "...", "language": "id"} atau {"error": "..."}.
Model diunduh otomatis saat pertama kali dipakai (butuh internet sekali).
"""

import json
import os
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: whisper_transcribe.py <audio> [model] [language]"}))
        return

    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else os.environ.get("WHISPER_MODEL", "small")
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else os.environ.get("WHISPER_LANGUAGE", "id")

    try:
        from faster_whisper import WhisperModel

        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        segments, info = model.transcribe(
            path,
            language=(language or None),
            vad_filter=True,
            beam_size=1,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        print(json.dumps({"text": text, "language": getattr(info, "language", None)}))
    except Exception as exc:  # noqa: BLE001 - laporkan apa adanya ke Node
        print(json.dumps({"error": str(exc)}))


if __name__ == "__main__":
    main()
