import os
import shutil
import pathlib
import logging
from typing import Optional, List, Dict, Any

# Ensure pygpod is in the import path
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pygpod
from pygpod.device.mountpoint import validate_mountpoint, init_ipod
from pygpod.exceptions import PyGpodError

logger = logging.getLogger("ipod_manager")
logging.basicConfig(level=logging.INFO)

import json

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
DEFAULT_VIRTUAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "virtual_ipod")

def load_config() -> Dict[str, Any]:
    default_config = {
        "ipod_path": "",
        "read_only": False
    }
    if not os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "w") as f:
                json.dump(default_config, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to create default config: {e}")
        return default_config
    try:
        with open(CONFIG_PATH, "r") as f:
            user_config = json.load(f)
            # Ensure all default keys exist
            for k, v in default_config.items():
                if k not in user_config:
                    user_config[k] = v
            return user_config
    except Exception as e:
        logger.error(f"Failed to read config: {e}")
        return default_config

class IPodManager:
    def __init__(self):
        self.config = load_config()
        self.read_only = self.config["read_only"]
        self.mountpoint: str = ""
        self.db: Optional[pygpod.Database] = None
        self.detect_device()

    def detect_device(self) -> str:
        """Scan for connected physical iPods. Fallback to specified path or local Virtual iPod."""
        # 1. If path is explicitly specified in config, use it
        specified_path = self.config.get("ipod_path")
        if specified_path:
            logger.info(f"Using user-specified iPod path from config: {specified_path}")
            self.mountpoint = specified_path
            self.load_db()
            return self.mountpoint

        # 2. Check /Volumes for valid physical iPod mount points
        if os.path.exists("/Volumes"):
            for name in os.listdir("/Volumes"):
                path = os.path.join("/Volumes", name)
                if os.path.isdir(path) and validate_mountpoint(path):
                    logger.info(f"Detected physical iPod connected at: {path}")
                    self.mountpoint = path
                    self.load_db()
                    return self.mountpoint

        # 3. Fallback to Virtual iPod inside project directory
        logger.info(f"No physical iPod detected. Falling back to local Virtual iPod at: {DEFAULT_VIRTUAL_PATH}")
        self.mountpoint = DEFAULT_VIRTUAL_PATH
        
        # Initialize virtual iPod if it doesn't exist
        if not os.path.exists(DEFAULT_VIRTUAL_PATH):
            if self.read_only:
                logger.warning("DEFAULT_VIRTUAL_PATH path does not exist and read_only is active. Cannot create folder.")
                return ""
            os.makedirs(DEFAULT_VIRTUAL_PATH, exist_ok=True)
        if not validate_mountpoint(DEFAULT_VIRTUAL_PATH):
            if self.read_only:
                logger.error(f"Folder {DEFAULT_VIRTUAL_PATH} is not a valid iPod folder structure and read_only is active. Cannot initialize.")
                return ""
            logger.info("Initializing fresh Virtual iPod structure...")
            init_ipod(DEFAULT_VIRTUAL_PATH, model="classic_6g", music_dirs=20)
            
            # Create a mock file so the DB is not completely empty
            self.load_db()
            self.add_mock_data()
        else:
            self.load_db()
            
        return self.mountpoint

    def load_db(self):
        """Load the iTunesDB database from the current mountpoint."""
        try:
            self.db = pygpod.Database(self.mountpoint)
            logger.info(f"Successfully loaded iTunesDB from {self.mountpoint}")
        except Exception as e:
            logger.error(f"Error loading database from {self.mountpoint}: {e}")
            self.db = None

    def add_mock_data(self):
        """Create a silent mock MP3 and add it to the virtual iPod database."""
        if self.read_only:
            return
        if not self.db:
            return
        
        # Let's create a tiny silent MP3 or copy a dummy file
        dummy_dir = os.path.join(DEFAULT_VIRTUAL_PATH, "iPod_Control", "Music", "F00")
        os.makedirs(dummy_dir, exist_ok=True)
        dummy_file = os.path.join(DEFAULT_VIRTUAL_PATH, "welcome.mp3")
        
        # Write a dummy header to pretend it's an MP3 (1 second of silence)
        with open(dummy_file, "wb") as f:
            f.write(b'\xff\xfb\x90\x44' + b'\x00' * 1000)
            
        try:
            self.db.add_track(
                dummy_file, 
                title="Welcome to Floola-Next", 
                artist="Antigravity Team", 
                album="Floola-Next Demo", 
                genre="System", 
                year=2026,
                comment="A modern 64-bit iPod manager"
            )
            self.db.save()
            logger.info("Added welcome track to Virtual iPod")
        except Exception as e:
            logger.error(f"Failed to add mock data: {e}")
        finally:
            if os.path.exists(dummy_file):
                os.remove(dummy_file)

    def get_device_info(self) -> Dict[str, Any]:
        """Get connected device information and storage stats."""
        is_virtual = self.mountpoint == DEFAULT_VIRTUAL_PATH
        model = "Virtual iPod Classic (6G)" if is_virtual else "iPod Device"
        
        if self.db and self.db.device:
            model = self.db.device.model
            if is_virtual:
                model = f"Virtual {model}"

        # Disk space calculations
        total_space = 0
        free_space = 0
        used_space = 0
        
        try:
            stat = os.statvfs(self.mountpoint)
            total_space = stat.f_blocks * stat.f_frsize
            free_space = stat.f_bavail * stat.f_frsize
            used_space = total_space - free_space
        except Exception as e:
            logger.error(f"Failed to read disk stats: {e}")
            # Fallback mock stats for virtual
            total_space = 80 * 1024 * 1024 * 1024  # 80 GB
            free_space = 72 * 1024 * 1024 * 1024   # 72 GB
            used_space = total_space - free_space

        return {
            "model": model,
            "mountpoint": self.mountpoint,
            "is_virtual": is_virtual,
            "is_read_only": self.read_only,
            "total_space": total_space,
            "free_space": free_space,
            "used_space": used_space,
            "tracks_count": len(self.db.tracks) if self.db else 0,
            "playlists_count": len(self.db.playlists) if self.db else 0
        }

    def get_tracks(self) -> List[Dict[str, Any]]:
        """Get all tracks in the database."""
        if not self.db:
            return []
        
        tracks_list = []
        for track in self.db.tracks:
            # Safely resolve path
            ipod_file_path = ""
            if track.ipod_path:
                # Convert colon separated iPod path (e.g. :iPod_Control:Music:F00:SNG1.mp3) to real path
                parts = [p for p in track.ipod_path.split(":") if p]
                if parts:
                    ipod_file_path = os.path.join(self.mountpoint, *parts)

            tracks_list.append({
                "id": track.track_id,
                "title": track.title or "Unknown Title",
                "artist": track.artist or "Unknown Artist",
                "album": track.album or "Unknown Album",
                "genre": track.genre or "Unknown Genre",
                "duration": track.duration_ms // 1000 if track.duration_ms else 0,
                "rating": track.rating // 20 if track.rating else 0, # rating is 0-100, normalize to 0-5 stars
                "play_count": track.play_count or 0,
                "year": track.year or 0,
                "track_number": track.track_number or 0,
                "file_size": track.file_size or 0,
                "file_path": ipod_file_path
            })
        return tracks_list

    def get_playlists(self) -> List[Dict[str, Any]]:
        """Get all playlists in the database."""
        if not self.db:
            return []
        
        playlists_list = []
        for pl in self.db.playlists:
            playlists_list.append({
                "id": id(pl), # Pygpod Playlist object doesn't have a unique numeric ID property, we use Python's memory id
                "name": pl.name,
                "is_master": pl.is_master,
                "is_smart": pl.is_smart,
                "track_ids": pl.track_ids or []
            })
        return playlists_list

    def add_track(self, local_file_path: str, metadata: Dict[str, Any]) -> bool:
        """Add a track from the Mac filesystem to the iPod database."""
        if not self.db:
            return False
        
        try:
            # Overrides provided in metadata
            kwargs = {}
            for field in ['title', 'artist', 'album', 'genre', 'year', 'comment', 'track_number']:
                if field in metadata and metadata[field]:
                    kwargs[field] = metadata[field]
                    
            if 'rating' in metadata:
                kwargs['rating'] = int(metadata['rating']) * 20 # 0-5 stars to 0-100

            self.db.add_track(local_file_path, **kwargs)
            self.db.save()
            return True
        except Exception as e:
            logger.error(f"Failed to add track: {e}")
            return False

    def remove_track(self, track_id: int) -> bool:
        """Remove a track from the database and delete its file on the device."""
        if not self.db:
            return False
        
        try:
            track = self.db.get_track(track_id)
            if not track:
                logger.error(f"Track with ID {track_id} not found")
                return False
                
            self.db.remove_track(track, delete_file=True)
            self.db.save()
            return True
        except Exception as e:
            logger.error(f"Failed to remove track: {e}")
            return False

    def export_track(self, track_id: int, export_dir: str) -> Optional[str]:
        """Export track from the iPod back to a directory on the Mac."""
        if not self.db:
            return None
            
        try:
            track = self.db.get_track(track_id)
            if not track:
                return None
                
            # Find the actual path of the file on the iPod
            parts = [p for p in track.ipod_path.split(":") if p]
            src_path = os.path.join(self.mountpoint, *parts)
            
            if not os.path.exists(src_path):
                # If virtual or file missing, look for it in welcome path or fallback
                return None
                
            os.makedirs(export_dir, exist_ok=True)
            # Create a clean filename: "Artist - Title.ext"
            ext = os.path.splitext(src_path)[1] or ".mp3"
            clean_name = f"{track.artist or 'Unknown Artist'} - {track.title or 'Unknown Title'}{ext}"
            # Replace invalid filesystem characters
            for char in ['/', '\\', ':', '*', '?', '"', '<', '>', '|']:
                clean_name = clean_name.replace(char, "_")
                
            dest_path = os.path.join(export_dir, clean_name)
            shutil.copy2(src_path, dest_path)
            return dest_path
        except Exception as e:
            logger.error(f"Failed to export track: {e}")
            return None

    def update_track_metadata(self, track_id: int, metadata: Dict[str, Any]) -> bool:
        """Update metadata fields for a specific track."""
        if not self.db:
            return False
            
        try:
            track = self.db.get_track(track_id)
            if not track:
                return False
                
            if 'title' in metadata: track.title = metadata['title']
            if 'artist' in metadata: track.artist = metadata['artist']
            if 'album' in metadata: track.album = metadata['album']
            if 'genre' in metadata: track.genre = metadata['genre']
            if 'year' in metadata: track.year = int(metadata['year']) if metadata['year'] else 0
            if 'track_number' in metadata: track.track_number = int(metadata['track_number']) if metadata['track_number'] else 0
            if 'rating' in metadata: track.rating = int(metadata['rating']) * 20
            
            self.db.save()
            return True
        except Exception as e:
            logger.error(f"Failed to update metadata: {e}")
            return False

    def create_playlist(self, name: str) -> bool:
        """Create a new playlist."""
        if not self.db:
            return False
        try:
            self.db.create_playlist(name)
            self.db.save()
            return True
        except Exception as e:
            logger.error(f"Failed to create playlist: {e}")
            return False

    def delete_playlist(self, playlist_name: str) -> bool:
        """Delete a playlist by name."""
        if not self.db:
            return False
        try:
            target_pl = None
            for pl in self.db.playlists:
                if pl.name == playlist_name and not pl.is_master:
                    target_pl = pl
                    break
            if target_pl is not None:
                self.db.delete_playlist(target_pl)
                self.db.save()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete playlist: {e}")
            return False

    def add_track_to_playlist(self, playlist_name: str, track_id: int) -> bool:
        """Add track to a playlist."""
        if not self.db:
            return False
        try:
            track = self.db.get_track(track_id)
            target_pl = None
            for pl in self.db.playlists:
                if pl.name == playlist_name:
                    target_pl = pl
                    break
            if track is not None and target_pl is not None:
                self.db.add_track_to_playlist(target_pl, track)
                self.db.save()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to add track to playlist: {e}")
            return False

    def remove_track_from_playlist(self, playlist_name: str, track_id: int) -> bool:
        """Remove a track from a playlist."""
        if not self.db:
            return False
        try:
            track = self.db.get_track(track_id)
            target_pl = None
            for pl in self.db.playlists:
                if pl.name == playlist_name:
                    target_pl = pl
                    break
            if track is not None and target_pl is not None:
                self.db.remove_track_from_playlist(target_pl, track)
                self.db.save()
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to remove track from playlist: {e}")
            return False

    def repair_db(self) -> bool:
        """Recalculate hashes and checksums of the database."""
        if not self.db:
            return False
        try:
            self.db.save()  # pygpod automatically recalculates checksums and hashes on save
            return True
        except Exception as e:
            logger.error(f"Database repair failed: {e}")
            return False
