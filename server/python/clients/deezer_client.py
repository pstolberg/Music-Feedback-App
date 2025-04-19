"""
Deezer API Client for Artist Sound Profile Ingestion

This module fetches track information from Deezer's REST API
with rate limiting (50 requests/minute) and 24-hour caching.
"""
import os
import time
import json
import requests
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, Any, Optional, Callable, TypeVar

# Type definitions
T = TypeVar('T')
DeezerTrackInfo = Dict[str, Any]

# Constants
DEEZER_API_BASE_URL = "https://api.deezer.com"
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
CACHE_DURATION = timedelta(hours=24)  # 24-hour cache duration
RATE_LIMIT = 50  # 50 requests per minute
RATE_WINDOW = 60  # 1 minute window

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

class DeezerClient:
    """
    Client for interacting with the Deezer API to fetch track information.
    Implements rate limiting and caching to respect API usage guidelines.
    """
    
    def __init__(self, app_id: str = None, app_secret: str = None):
        """
        Initialize the Deezer API client.
        
        Args:
            app_id: Deezer application ID (defaults to DEEZER_APP_ID env var)
            app_secret: Deezer application secret (defaults to DEEZER_APP_SECRET env var)
        """
        self.app_id = app_id or os.environ.get('DEEZER_APP_ID')
        self.app_secret = app_secret or os.environ.get('DEEZER_APP_SECRET')
        self.request_timestamps = []
        
    def _enforce_rate_limit(self):
        """Enforce the Deezer API rate limit of 50 requests per minute."""
        now = time.time()
        # Remove timestamps older than the rate window
        self.request_timestamps = [t for t in self.request_timestamps if now - t < RATE_WINDOW]
        
        # Check if we've hit the rate limit
        if len(self.request_timestamps) >= RATE_LIMIT:
            oldest = self.request_timestamps[0]
            wait_time = RATE_WINDOW - (now - oldest)
            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.2f} seconds...")
                time.sleep(wait_time)
                # After waiting, reset the timestamps but keep the current request
                self.request_timestamps = []
        
        # Record this request timestamp
        self.request_timestamps.append(now)
    
    def _get_cache_path(self, isrc: str) -> str:
        """Get the cache file path for a given ISRC code."""
        return os.path.join(CACHE_DIR, f"deezer_{isrc}.json")
    
    def _is_cache_valid(self, cache_path: str) -> bool:
        """Check if the cached data is still valid (within 24 hours)."""
        if not os.path.exists(cache_path):
            return False
        
        # Check if cache file is newer than cache duration
        file_time = datetime.fromtimestamp(os.path.getmtime(cache_path))
        return datetime.now() - file_time < CACHE_DURATION
    
    def _get_from_cache(self, isrc: str) -> Optional[Dict[str, Any]]:
        """Retrieve track data from cache if available and valid."""
        cache_path = self._get_cache_path(isrc)
        if self._is_cache_valid(cache_path):
            try:
                with open(cache_path, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                # If cache file is corrupted, ignore it
                return None
        return None
    
    def _save_to_cache(self, isrc: str, data: Dict[str, Any]) -> None:
        """Save track data to the cache."""
        cache_path = self._get_cache_path(isrc)
        try:
            with open(cache_path, 'w') as f:
                json.dump(data, f)
        except IOError as e:
            print(f"Warning: Failed to cache Deezer data: {e}")
    
    @exponential_backoff(retries=3)
    def get_track_by_isrc(self, isrc: str) -> Optional[Dict[str, float]]:
        """
        Fetch track information from Deezer using ISRC code.
        
        Args:
            isrc: International Standard Recording Code
            
        Returns:
            Dict containing BPM and gain (loudness) or None if not found
        """
        # Check cache first
        cached_data = self._get_from_cache(isrc)
        if cached_data:
            return self._extract_audio_features(cached_data)
        
        # Enforce rate limiting
        self._enforce_rate_limit()
        
        # Make API request
        url = f"{DEEZER_API_BASE_URL}/track/isrc:{isrc}"
        response = requests.get(url, params={'output': 'json'})
        
        if response.status_code == 200:
            track_data = response.json()
            if track_data and track_data.get('id'):
                # Cache the response
                self._save_to_cache(isrc, track_data)
                return self._extract_audio_features(track_data)
        elif response.status_code != 404:
            # Raise for server errors, but not for 404 (not found)
            response.raise_for_status()
            
        return None
    
    def _extract_audio_features(self, track_data: DeezerTrackInfo) -> Dict[str, float]:
        """
        Extract BPM and gain features from Deezer track data.
        
        Args:
            track_data: Raw track data from Deezer API
            
        Returns:
            Dict with bpm and gain values
        """
        result = {}
        
        # BPM is directly available
        if 'bpm' in track_data and track_data['bpm']:
            result['bpm'] = float(track_data['bpm'])
        
        # For gain/loudness, we use the track.gain value (in dB)
        if 'gain' in track_data and track_data['gain']:
            result['gain'] = float(track_data['gain'])
            
        return result

# Example usage
if __name__ == "__main__":
    client = DeezerClient()
    # Test with Daft Punk's "Get Lucky" ISRC
    result = client.get_track_by_isrc("USQX91300108")
    print(result)
