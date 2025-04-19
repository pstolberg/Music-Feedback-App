"""
TheAudioDB API Client for Artist Sound Profile Ingestion

This module fetches track information from TheAudioDB API
with rate limiting (1 request/second) and fallback to GetSongBPM if needed.
"""
import os
import time
import json
import requests
from typing import Dict, Any, Optional, List, Callable, TypeVar
from functools import wraps

# Type definitions
T = TypeVar('T')
AudioDBTrackInfo = Dict[str, Any]

# Constants
AUDIODB_API_BASE_URL = "https://www.theaudiodb.com/api/v1/json"
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
RATE_LIMIT_DELAY = 1.0  # 1 second between requests

# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)

def exponential_backoff(retries=3):
    """
    Decorator for implementing exponential backoff retry logic for API requests.
    
    Args:
        retries: Maximum number of retry attempts
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            attempt = 0
            while attempt < retries:
                try:
                    return func(*args, **kwargs)
                except requests.RequestException as e:
                    attempt += 1
                    if attempt >= retries:
                        raise
                    # Calculate exponential backoff with jitter
                    wait_time = (2 ** attempt) + (0.1 * attempt)
                    print(f"Retrying in {wait_time:.2f} seconds...")
                    time.sleep(wait_time)
        return wrapper
    return decorator

class AudioDBClient:
    """
    Client for interacting with TheAudioDB API to fetch track information.
    Implements rate limiting and caching to respect API usage guidelines.
    """
    
    def __init__(self, api_key: str = None):
        """
        Initialize TheAudioDB API client.
        
        Args:
            api_key: TheAudioDB API key (defaults to AUDIO_DB_API_KEY env var)
        """
        self.api_key = api_key or os.environ.get('AUDIO_DB_API_KEY')
        if not self.api_key:
            raise ValueError("AudioDB API key is required. Set AUDIO_DB_API_KEY environment variable.")
        self.last_request_time = 0
    
    def _enforce_rate_limit(self):
        """Enforce the AudioDB API rate limit of 1 request per second."""
        now = time.time()
        time_since_last = now - self.last_request_time
        
        if time_since_last < RATE_LIMIT_DELAY:
            wait_time = RATE_LIMIT_DELAY - time_since_last
            time.sleep(wait_time)
        
        self.last_request_time = time.time()
    
    def _get_cache_path(self, artist: str, title: str) -> str:
        """Get the cache file path for a given artist and title."""
        # Create a safe filename from artist and title
        safe_key = f"{artist}_{title}".lower().replace(" ", "_").replace("/", "_")
        return os.path.join(CACHE_DIR, f"audiodb_{safe_key}.json")
    
    def _get_from_cache(self, artist: str, title: str) -> Optional[Dict[str, Any]]:
        """Retrieve track data from cache if available."""
        cache_path = self._get_cache_path(artist, title)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                # If cache file is corrupted, ignore it
                return None
        return None
    
    def _save_to_cache(self, artist: str, title: str, data: Dict[str, Any]) -> None:
        """Save track data to the cache."""
        cache_path = self._get_cache_path(artist, title)
        try:
            with open(cache_path, 'w') as f:
                json.dump(data, f)
        except IOError as e:
            print(f"Warning: Failed to cache AudioDB data: {e}")
    
    @exponential_backoff(retries=3)
    def search_track(self, artist: str, title: str) -> Optional[Dict[str, Any]]:
        """
        Search for track information by artist and title.
        
        Args:
            artist: Artist name
            title: Track title
            
        Returns:
            Dict containing key, mode, and tempo information or None if not found
        """
        # Check cache first
        cached_data = self._get_from_cache(artist, title)
        if cached_data:
            return self._extract_audio_features(cached_data)
        
        # Enforce rate limiting
        self._enforce_rate_limit()
        
        # Make API request
        url = f"{AUDIODB_API_BASE_URL}/{self.api_key}/searchtrack.php"
        response = requests.get(url, params={'s': artist, 't': title})
        
        if response.status_code == 200:
            data = response.json()
            tracks = data.get('track', [])
            
            if tracks and isinstance(tracks, list) and len(tracks) > 0:
                # Find the best match (first track is usually the most relevant)
                track_data = tracks[0]
                
                # Cache the response
                self._save_to_cache(artist, title, track_data)
                
                # Extract and return the audio features
                return self._extract_audio_features(track_data)
        elif response.status_code != 404:
            # Raise for server errors, but not for 404 (not found)
            response.raise_for_status()
        
        # If no data found, try getting from GetSongBPM (implemented in a different client)
        # In a real implementation, this would call the GetSongBPM client
        print(f"No data found for {artist} - {title} on AudioDB, would try GetSongBPM here.")
        return None
    
    def _extract_audio_features(self, track_data: AudioDBTrackInfo) -> Dict[str, Any]:
        """
        Extract key, mode, and tempo features from AudioDB track data.
        
        Args:
            track_data: Raw track data from AudioDB API
            
        Returns:
            Dict with key, mode, and tempo values
        """
        result = {}
        
        # Extract the key if available (stored as an integer 0-11)
        if 'strKey' in track_data and track_data['strKey']:
            try:
                key_num = int(track_data['strKey'])
                # Map the key number to a letter (C, C#, D, etc.)
                keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
                result['key'] = keys[key_num]
            except (ValueError, IndexError):
                # Skip if the key is invalid
                pass
        
        # Extract the mode if available (usually "Major" or "Minor")
        if 'strMode' in track_data and track_data['strMode']:
            result['mode'] = track_data['strMode']
        
        # Extract the tempo (BPM) if available
        if 'intBPM' in track_data and track_data['intBPM']:
            try:
                result['tempo'] = float(track_data['intBPM'])
            except ValueError:
                # Skip if the tempo is invalid
                pass
        
        return result

# Example usage
if __name__ == "__main__":
    client = AudioDBClient()
    result = client.search_track("Daft Punk", "Get Lucky")
    print(result)
