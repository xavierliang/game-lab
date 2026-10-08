"""Rebuild the release audio derivatives from the retained CC0 originals."""
from pathlib import Path
import hashlib
import json
import subprocess

BASE = Path(__file__).resolve().parent
OUT = BASE / "selected"
OUT.mkdir(exist_ok=True)


def ffmpeg(source, target, options):
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(BASE / source),
        *options, str(OUT / target),
    ], check=True)


def loop_filter(duration, overlap, volume=1):
    # Rotate a crossfade across the seam into the end of the output. The final
    # sample then meets the original material at overlap seconds on each repeat.
    return (
        f"[0:a]atrim=end={duration},asetpts=PTS-STARTPTS,asplit=3[h][m][t];"
        f"[h]atrim=end={overlap},asetpts=PTS-STARTPTS[head];"
        f"[m]atrim=start={overlap}:end={duration-overlap},asetpts=PTS-STARTPTS[mid];"
        f"[t]atrim=start={duration-overlap},asetpts=PTS-STARTPTS[tail];"
        f"[tail][head]acrossfade=d={overlap}:c1=tri:c2=tri[seam];"
        f"[mid][seam]concat=n=2:v=0:a=1,volume={volume}[out]"
    )


music = "originals/outer-space-loop-wipics.mp3"
music_filter = loop_filter(68.598, 0.6, 0.55)
ffmpeg(music, "music.mp3", ["-filter_complex", music_filter, "-map", "[out]",
    "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1"])
ffmpeg(music, "music.ogg", ["-filter_complex", music_filter, "-map", "[out]",
    "-ar", "44100", "-c:a", "libvorbis", "-q:a", "3", "-map_metadata", "-1"])

effects = {
    "launch.wav": "originals/kenney-sci-fi-sounds/Audio/forceField_000.ogg",
    "explosion.wav": "originals/kenney-sci-fi-sounds/Audio/explosionCrunch_000.ogg",
    "ui.wav": "originals/kenney-interface-sounds/Audio/click_001.ogg",
}
for target, source in effects.items():
    ffmpeg(source, target, ["-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
                          "-map_metadata", "-1"])
ffmpeg("originals/kenney-sci-fi-sounds/Audio/spaceEngineSmall_000.ogg", "thruster.wav",
       ["-filter_complex", loop_filter(5, 0.05), "-map", "[out]", "-ar", "44100",
        "-ac", "1", "-c:a", "pcm_s16le", "-map_metadata", "-1"])


def file_info(path):
    data = path.read_bytes()
    item = {"path": str(path.relative_to(BASE)), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}
    if path.suffix in {".mp3", ".ogg", ".wav"}:
        probe = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)
        ]))
        item["duration_seconds"] = float(probe["format"]["duration"])
        item["audio"] = probe["streams"][0]
    return item


sources = [
    {
        "id": "outer-space-loop", "title": "Outer Space Loop", "author": "wipics",
        "page_url": "https://opengameart.org/content/outer-space-loop",
        "download_url": "https://opengameart.org/sites/default/files/outer_space_2.mp3",
        "original": "originals/outer-space-loop-wipics.mp3",
        "license": "CC0-1.0", "license_evidence": "evidence/outer-space-loop-source.html",
        "selection_basis": "Original author's ambient/synths/space/loop tags; not auditioned.",
        "derivatives": ["selected/music.mp3", "selected/music.ogg"],
        "processing": "Trim tail silence after 68.598s; rotate a 0.6s linear crossfade across the loop seam; gain 0.55; transcode. Output PCM length 67.998s; compressed container duration may include padding."
    },
    {
        "id": "kenney-sci-fi", "title": "Sci-fi Sounds 1.0", "author": "Kenney",
        "page_url": "https://kenney.nl/assets/sci-fi-sounds",
        "corroborating_author_page": "https://opengameart.org/content/sci-fi-sounds",
        "download_url": "https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip",
        "original": "originals/kenney-sci-fi-sounds.zip",
        "license": "CC0-1.0", "license_evidence": "evidence/kenney-sci-fi-source.html",
        "supplied_license": "originals/kenney-sci-fi-sounds/License.txt",
        "derivatives": ["selected/launch.wav", "selected/explosion.wav", "selected/thruster.wav"],
        "processing": "forceField_000 = launch; explosionCrunch_000 = explosion; lossless PCM WAV transcodes. spaceEngineSmall_000 = thruster, 0.05s linear overlap crossfade at seam, output 4.95s."
    },
    {
        "id": "kenney-interface", "title": "Interface Sounds 1.0", "author": "Kenney",
        "page_url": "https://kenney.nl/assets/interface-sounds",
        "download_url": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
        "original": "originals/kenney-interface-sounds.zip",
        "license": "CC0-1.0", "license_evidence": "evidence/kenney-interface-source.html",
        "supplied_license": "originals/kenney-interface-sounds/License.txt",
        "derivatives": ["selected/ui.wav"],
        "processing": "click_001.ogg transcoded to mono 44.1kHz PCM WAV."
    }
]

manifest = {
    "schema_version": 1,
    "download_date": "2026-10-06",
    "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "license_text_url": "https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt",
    "license_file": "LICENSE-CC0-1.0.txt",
    "sources": sources,
    "verification": {"author_license_pages_checked": True, "ffmpeg_decode_checked": True,
                     "actual_audio_audition_performed": False,
                     "limitation": "Selection based on creator descriptions, filenames, waveform/silence metrics, and decoder validation. No subjective listening or no-vocals verification performed."},
    "files": [file_info(p) for p in sorted(BASE.rglob("*")) if p.is_file()
              and p.name not in {"manifest.json", "notes.txt", "prepare-audio.py", "preview.html"}]
}
(BASE / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
for p in sorted(OUT.iterdir()):
    print(json.dumps(file_info(p)))
