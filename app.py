import os
import tempfile
import webbrowser
from flask import Flask, request, jsonify, send_from_directory, send_file
from ipod_manager import IPodManager

app = Flask(__name__, static_folder="static", static_url_path="")
manager = IPodManager()

@app.before_request
def restrict_write_operations():
    # Block modifying requests in Read-Only mode, except for redetect, reveal, and play-system
    if manager.read_only and request.method in ['POST', 'DELETE', 'PUT']:
        if (request.path == '/api/device/redetect' or 
            request.path.startswith('/api/tracks/reveal/') or 
            request.path.startswith('/api/tracks/play-system/')):
            return
        return jsonify({
            "success": False,
            "error": "Floola-Next is running in safe Read-Only mode to protect your external disk."
        }), 403

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/device', methods=['GET'])
def get_device():
    info = manager.get_device_info()
    return jsonify(info)

@app.route('/api/device/redetect', methods=['POST'])
def redetect_device():
    path = manager.detect_device()
    info = manager.get_device_info()
    return jsonify({
        "success": True,
        "mountpoint": path,
        "device": info
    })

@app.route('/api/tracks', methods=['GET'])
def get_tracks():
    tracks = manager.get_tracks()
    return jsonify(tracks)

@app.route('/api/tracks/add', methods=['POST'])
def add_track():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "Empty filename"}), 400

    # Save to a temporary file
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, file.filename)
    file.save(temp_path)

    # Extract optional metadata overrides from form fields
    metadata = {
        "title": request.form.get("title"),
        "artist": request.form.get("artist"),
        "album": request.form.get("album"),
        "genre": request.form.get("genre"),
        "year": request.form.get("year"),
        "track_number": request.form.get("track_number"),
        "rating": request.form.get("rating")
    }

    success = manager.add_track(temp_path, metadata)
    
    # Clean up temp file
    if os.path.exists(temp_path):
        os.remove(temp_path)

    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "error": "Failed to add track to iPod database"})

@app.route('/api/tracks/<int:track_id>', methods=['DELETE'])
def remove_track(track_id):
    success = manager.remove_track(track_id)
    return jsonify({"success": success})

@app.route('/api/tracks/export/<int:track_id>', methods=['GET'])
def export_track(track_id):
    # Create an export directory in downloads or a temp folder
    export_dir = os.path.join(tempfile.gettempdir(), "floola_export")
    os.makedirs(export_dir, exist_ok=True)
    
    exported_path = manager.export_track(track_id, export_dir)
    if exported_path and os.path.exists(exported_path):
        # Serve the file for download
        filename = os.path.basename(exported_path)
        
        # We want to delete the file after sending it, but since Flask send_file runs asynchronously,
        # we can't delete it immediately. Let's just return it. The temp dir gets cleared by OS anyway.
        return send_file(
            exported_path,
            as_attachment=True,
            download_name=filename
        )
    else:
        return jsonify({"success": False, "error": "Failed to export file. It may be missing on the iPod."}), 404

@app.route('/api/tracks/reveal/<int:track_id>', methods=['POST'])
def reveal_track(track_id):
    if not manager.db:
        return jsonify({"success": False, "error": "No database loaded"}), 404
    track = manager.db.get_track(track_id)
    if not track:
        return jsonify({"success": False, "error": "Track not found"}), 404
    parts = [p for p in track.ipod_path.split(":") if p]
    src_path = os.path.join(manager.mountpoint, *parts)
    if os.path.exists(src_path):
        import subprocess
        # AppleScript to reuse the frontmost Finder window and focus the file
        applescript = f'''
        tell application "Finder"
            set fileAlias to (POSIX file "{src_path}") as alias
            if (count of Finder windows) is 0 then
                reveal fileAlias
            else
                set target of Finder window 1 to container of fileAlias
                select fileAlias
            end if
            activate
        end tell
        '''
        try:
            # Short timeout to prevent hanging if macOS permission dialog is ignored
            subprocess.run(["osascript", "-e", applescript], check=True, timeout=1.5, capture_output=True)
            return jsonify({"success": True})
        except (subprocess.SubprocessError, subprocess.TimeoutExpired):
            # Fall back to standard open -R (opens new Finder window/tab if not in same folder)
            subprocess.run(["open", "-R", src_path])
            return jsonify({"success": True})
    return jsonify({"success": False, "error": "File does not exist on disk"}), 404

@app.route('/api/tracks/play-system/<int:track_id>', methods=['POST'])
def play_system_track(track_id):
    if not manager.db:
        return jsonify({"success": False, "error": "No database loaded"}), 404
    track = manager.db.get_track(track_id)
    if not track:
        return jsonify({"success": False, "error": "Track not found"}), 404
    parts = [p for p in track.ipod_path.split(":") if p]
    src_path = os.path.join(manager.mountpoint, *parts)
    if os.path.exists(src_path):
        import subprocess
        # open command on macOS opens the file with its default application
        subprocess.run(["open", src_path])
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "File does not exist on disk"}), 404

@app.route('/api/tracks/update/<int:track_id>', methods=['POST'])
def update_track(track_id):
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400
        
    success = manager.update_track_metadata(track_id, data)
    return jsonify({"success": success})

@app.route('/api/playlists', methods=['GET'])
def get_playlists():
    playlists = manager.get_playlists()
    return jsonify(playlists)

@app.route('/api/playlists/create', methods=['POST'])
def create_playlist():
    data = request.json
    if not data or 'name' not in data:
        return jsonify({"success": False, "error": "Playlist name is required"}), 400
        
    success = manager.create_playlist(data['name'])
    return jsonify({"success": success})

@app.route('/api/playlists/<string:name>', methods=['DELETE'])
def delete_playlist(name):
    success = manager.delete_playlist(name)
    return jsonify({"success": success})

@app.route('/api/playlists/<string:name>/add/<int:track_id>', methods=['POST'])
def add_to_playlist(name, track_id):
    success = manager.add_track_to_playlist(name, track_id)
    return jsonify({"success": success})

@app.route('/api/playlists/<string:name>/remove/<int:track_id>', methods=['POST'])
def remove_from_playlist(name, track_id):
    success = manager.remove_track_from_playlist(name, track_id)
    return jsonify({"success": success})

@app.route('/api/device/repair', methods=['POST'])
def repair_device():
    success = manager.repair_db()
    return jsonify({"success": success})

@app.route('/api/tracks/play/<int:track_id>', methods=['GET'])
def play_track(track_id):
    if not manager.db:
        return jsonify({"success": False, "error": "No database loaded"}), 404
    track = manager.db.get_track(track_id)
    if not track:
        return jsonify({"success": False, "error": "Track not found"}), 404
    parts = [p for p in track.ipod_path.split(":") if p]
    src_path = os.path.join(manager.mountpoint, *parts)
    if os.path.exists(src_path):
        return send_file(src_path)
    return jsonify({"success": False, "error": "Audio file not found on iPod"}), 404

# Fallback to serve static files
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

if __name__ == '__main__':
    # Auto-open browser in a separate thread/delay
    port = 5055
    webbrowser.open(f"http://127.0.0.1:{port}")
    app.run(host='127.0.0.1', port=port, debug=False)
