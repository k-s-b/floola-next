# Floola-Next

**Floola-Next** is a modern, 64-bit native replacement for [Floola](https://sourceforge.net/app/floola/mac/), designed to manage classic iPod models (iPod Classic, Nano, Mini, Shuffle) on modern macOS operating systems (including Apple Silicon M-series Macs). 

Since 32-bit applications are no longer supported on modern macOS, Floola-Next wraps a lightweight Python Flask backend with a responsive, glassmorphic HTML/CSS/JS frontend to recreate Floola's original layout, icons, and features natively.

---

## Features

* **Utilitarian & Nostalgic Layout**: Respects Floola's signature structure with controls at the top, a right-hand sidebar for playlists/categories, a main tracklist grid, and a bottom status bar.
* **Seamless Audio Playback**: Preview and stream tracks directly inside your web browser using the built-in player, or toggle the **System Player** switch to play tracks directly using your Mac's default audio app (e.g. Music, QuickTime) in a separate, reusable Finder playback window.
* **Safe Read-Only Mode**: Protects your music files with an optional strict read-only lock. Hides modifying UI actions (Add, Delete, Rename) and blocks write endpoints at the API level.
* **Drag-and-Drop Sync**: Drag files onto the interface to copy them to the device (when read-only is disabled).
* **Metadata Editor**: Edit song titles, artists, albums, ratings, and track numbers.
* **Playlist Management**: Create, delete, and add/remove tracks in playlists.
* **Finder Integration**: Right-click to safely reveal and highlight files directly in your macOS Finder.
* **Round-Trip Binary Integrity**: Integrates HMAC-SHA1 (`hash58`) and AES-CBC (`hash72`) checksum hashing to write databases compatible with newer iPod models (6G/7G).

---

## Installation

### Prerequisites
Make sure Python 3 is installed on your Mac. You will also need to install the following Python packages:
```bash
pip install flask mutagen pillow pyusb pycryptodome
```

---

## Configuration

When you launch the app for the first time, a `config.json` file will be automatically generated in the root directory:

```json
{
    "ipod_path": "",
    "read_only": false
}
```

* **`ipod_path`**:
  * Leave blank `""` (default) to automatically scan your `/Volumes/` directory for connected physical iPods.
  * Or specify an absolute path to a local folder (e.g. `"/Volumes/MyHardDrive/iPod_Backup"`) to use a folder on your disk.
  * If no iPod is detected and no path is specified, it will automatically default to a local simulated `./virtual_ipod` folder inside the project.
* **`read_only`**:
  * Set to `true` to run the app in **Safe Read-Only Mode**, completely locking the iPod database from any modifications.

---

## How to Run

1. Connect your iPod (or configure your backup path in `config.json`).
2. Double-click **`Floola-Next.command`** in Finder (or run `./Floola-Next.command` in Terminal).
3. The app will launch the server and automatically open the interface in your default web browser at `http://127.0.0.1:5055`.

---

## License

This project is licensed under the **GNU GPL-3.0 License** - see the [LICENSE](LICENSE) file for details.
