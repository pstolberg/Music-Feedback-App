"""
AcousticBrainz API Client for Artist Sound Profile Ingestion

This module fetches high-level audio features from the AcousticBrainz API.
It handles timeouts gracefully and skips processing when no data is available.
"""
import os
import time
import json
import requests
from typing import Dict, Any, Optional, List, Callable, TypeVar
from functools import wraps

# Type definitions
T = TypeVar('T')
AcousticBrainzData = Dict[str, Any]

# Constants
ACOUSTICBRAINZ_API_BASE_URL = "https://acousticbrainz.org/api/v1"
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
REQUEST_TIMEOUT = 5.0  # 5 seconds timeout for requests

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

class AcousticBrainzClient:
    """
    Client for interacting with the AcousticBrainz API to fetch high-level audio features.
    Handles timeouts gracefully and implements caching.
    """
    
    def __init__(self):
        """Initialize the AcousticBrainz API client."""
        pass  # No API key required for AcousticBrainz
    
    def _get_cache_path(self, mbid: str) -> str:
        """Get the cache file path for a given MusicBrainz ID."""
        return os.path.join(CACHE_DIR, f"acousticbrainz_{mbid}.json")
    
    def _get_from_cache(self, mbid: str) -> Optional[Dict[str, Any]]:
        """Retrieve track data from cache if available."""
        cache_path = self._get_cache_path(mbid)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                # If cache file is corrupted, ignore it
                return None
        return None
    
    def _save_to_cache(self, mbid: str, data: Dict[str, Any]) -> None:
        """Save track data to the cache."""
        cache_path = self._get_cache_path(mbid)
        try:
            with open(cache_path, 'w') as f:
                json.dump(data, f)
        except IOError as e:
            print(f"Warning: Failed to cache AcousticBrainz data: {e}")
    
    @exponential_backoff(retries=3)
    def get_highlevel(self, mbid: str) -> Optional[Dict[str, Any]]:
        """
        Fetch high-level audio features from AcousticBrainz using a MusicBrainz ID.
        
        Args:
            mbid: MusicBrainz ID for the track
            
        Returns:
            Dict containing high-level audio features or None if not available
        """
        # Check cache first
        cached_data = self._get_from_cache(mbid)
        if cached_data:
            return cached_data
        
        # Make API request with timeout
        url = f"{ACOUSTICBRAINZ_API_BASE_URL}/high-level"
        
        try:
            response = requests.get(
                url, 
                params={'recording_ids': mbid},
                timeout=REQUEST_TIMEOUT
            )
            
            if response.status_code == 200:
                data = response.json()
                if mbid in data:
                    highlevel_data = data[mbid].get('highlevel')
                    if highlevel_data:
                        # Cache the response
                        self._save_to_cache(mbid, highlevel_data)
                        return highlevel_data
            elif response.status_code != 404:
                # Raise for server errors, but not for 404 (not found)
                response.raise_for_status()
                
        except requests.Timeout:
            print(f"Request timed out for MusicBrainz ID {mbid}")
            return None
        
        return None
    
    def extract_mood_features(self, highlevel_data: AcousticBrainzData) -> Dict[str, Any]:
        """
        Extract mood and danceability features from AcousticBrainz high-level data.
        
        Args:
            highlevel_data: High-level data from AcousticBrainz API
            
        Returns:
            Dict with mood and danceability values
        """
        result = {}
        
        # Extract danceability if available
        if 'danceability' in highlevel_data:
            dance_data = highlevel_data['danceability']
            if 'all' in dance_data and 'danceable' in dance_data['all']:
                result['danceability'] = dance_data['all']['danceable']
        
        # Extract mood features if available
        mood_features = [
            'mood_electronic', 'mood_happy', 'mood_acoustic',  
            'mood_aggressive', 'mood_party', 'mood_relaxed', 'mood_sad'
        ]
        
        moods = {}
        for feature in mood_features:
            if feature in highlevel_data:
                mood_data = highlevel_data[feature]
                if 'all' in mood_data:
                    # Get the value with the highest probability
                    top_value = max(mood_data['all'].items(), key=lambda x: x[1])
                    # Only include positive moods (where the positive term has higher probability)
                    if not top_value[0].startswith('not_'):
                        moods[feature] = top_value[1]  # Use the probability value
        
        # Sort moods by probability and get top 3
        if moods:
            sorted_moods = sorted(moods.items(), key=lambda x: x[1], reverse=True)
            result['mood_top3'] = [mood[0].replace('mood_', '') for mood in sorted_moods[:3]]
        
        return result

# Example usage
if __name__ == "__main__":
    client = AcousticBrainzClient()
    # Example MusicBrainz ID for testing (Daft Punk - Get Lucky)
    result = client.get_highlevel("2cfad0f7-d015-4183-a9e2-f334bcca4a15")
    if result:
        mood_features = client.extract_mood_features(result)
        print(mood_features)
