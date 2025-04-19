"""
Artist Feature Harvester

A facade class that integrates multiple music API clients to gather comprehensive
audio features and statistics for a given artist. This enables artist-specific sound
profile analysis to enhance music track feedback.
"""
import os
import statistics
from typing import Dict, Any, List, Optional, Union
from collections import Counter

# Import the individual API clients
from clients.deezer_client import DeezerClient
from clients.audiodb_client import AudioDBClient
from clients.acousticbrainz_client import AcousticBrainzClient

class ArtistFeatureHarvester:
    """
    Facade class that coordinates multiple API clients to collect and aggregate
    audio features for a specific artist's sound profile.
    """
    
    def __init__(self, artist_name: str):
        """
        Initialize the harvester for a specific artist.
        
        Args:
            artist_name: Name of the artist to analyze
        """
        self.artist_name = artist_name
        self.deezer_client = DeezerClient()
        self.audiodb_client = AudioDBClient()
        self.acousticbrainz_client = AcousticBrainzClient()
        
        # Dictionary to store the collected track data
        self.track_data = []
        
        # Dictionary to store aggregated artist stats
        self.artist_stats = {}
    
    def collect_top_tracks(self, limit: int = 10) -> bool:
        """
        Collect feature data for the artist's top tracks.
        
        Args:
            limit: Maximum number of top tracks to analyze
            
        Returns:
            True if successful, False otherwise
        """
        # This is a simplified implementation
        # In a real scenario, we would first get the artist's top tracks
        # and then collect data for each track
        
        # For this demo, we'll use some hardcoded track information
        # for the specified artist to simulate the collection process
        
        # Structure: (track_title, isrc, musicbrainz_id)
        demo_tracks = {
            "Tame Impala": [
                ("The Less I Know The Better", "AUUM71500463", "9b0a3376-472d-4a99-81f0-b713c5a42bd2"),
                ("Let It Happen", "AUUM71500454", "02e96794-46b4-4a10-b899-533f3c5b114a"),
                ("Feels Like We Only Go Backwards", "AUUM71201090", "d020d5fb-1c7e-4ed3-b035-9c0969a2c587"),
                ("Borderline", "AUUM71900654", "0dcd2a7a-7d22-4a0f-9cb1-5db3c944e8a3"),
                ("Lost In Yesterday", "AUUM72000066", "b1f4f8eb-6717-45e3-a4d1-c53c8815d9cd")
            ],
            "Daft Punk": [
                ("Get Lucky", "USQX91300108", "2cfad0f7-d015-4183-a9e2-f334bcca4a15"),
                ("One More Time", "GBDUW0000059", "0c121b24-3b5e-45ca-991d-9df8428fc727"),
                ("Around the World", "GBDUW0000062", "3a7a7a8f-e824-4b31-8a5d-d0df793dd528"),
                ("Harder, Better, Faster, Stronger", "GBDUW0000060", "6ec34427-8a1a-4198-9295-bcebfab19f30"),
                ("Instant Crush", "USQX91300102", "2c68d898-2c0c-4258-adbe-9dea40cb1610")
            ],
            # Add more artists as needed
        }
        
        # Check if we have demo data for this artist
        if self.artist_name not in demo_tracks:
            print(f"No demo data available for {self.artist_name}")
            return False
        
        # Process each track to collect features
        tracks_processed = 0
        for track_title, isrc, mbid in demo_tracks[self.artist_name][:limit]:
            track_features = self._collect_track_features(track_title, isrc, mbid)
            if track_features:
                self.track_data.append(track_features)
                tracks_processed += 1
        
        return tracks_processed > 0
    
    def _collect_track_features(self, track_title: str, isrc: str, mbid: str) -> Optional[Dict[str, Any]]:
        """
        Collect features for a single track using all available API clients.
        
        Args:
            track_title: Title of the track
            isrc: International Standard Recording Code
            mbid: MusicBrainz ID
            
        Returns:
            Dict containing combined track features or None if no data available
        """
        track_features = {
            'title': track_title,
            'isrc': isrc,
            'mbid': mbid
        }
        
        # Get BPM and gain from Deezer
        deezer_data = self.deezer_client.get_track_by_isrc(isrc)
        if deezer_data:
            track_features.update(deezer_data)
        
        # Get key, mode, and tempo from AudioDB
        audiodb_data = self.audiodb_client.search_track(self.artist_name, track_title)
        if audiodb_data:
            track_features.update(audiodb_data)
        
        # Get mood and danceability from AcousticBrainz
        acousticbrainz_data = self.acousticbrainz_client.get_highlevel(mbid)
        if acousticbrainz_data:
            mood_data = self.acousticbrainz_client.extract_mood_features(acousticbrainz_data)
            if mood_data:
                track_features.update(mood_data)
        
        # Only return if we have meaningful data
        if len(track_features) > 3:  # More than just the basic identifiers
            return track_features
        return None
    
    def aggregate(self) -> Dict[str, Any]:
        """
        Aggregate the collected track data into artist-level statistics
        based on the specified aggregation rules.
        
        Returns:
            Dict containing aggregated artist sound profile stats
        """
        # Ensure we have track data
        if not self.track_data:
            success = self.collect_top_tracks()
            if not success or not self.track_data:
                return {}
        
        # Initialize the result dictionary
        result = {
            'artist': self.artist_name,
            'track_count': len(self.track_data)
        }
        
        # Aggregate BPM (median)
        bpm_values = [track.get('bpm') for track in self.track_data if 'bpm' in track]
        if bpm_values:
            result['median_bpm'] = statistics.median(bpm_values)
        
        # Aggregate loudness/gain (median LUFS)
        gain_values = [track.get('gain') for track in self.track_data if 'gain' in track]
        if gain_values:
            result['median_loudness'] = statistics.median(gain_values)
        
        # Aggregate key/mode (histogram - top 5)
        keys = []
        for track in self.track_data:
            if 'key' in track and 'mode' in track:
                keys.append(f"{track['key']} {track['mode']}")
            elif 'key' in track:
                keys.append(track['key'])
        
        if keys:
            key_histogram = Counter(keys).most_common(5)
            result['key_histogram'] = [{key: count} for key, count in key_histogram]
        
        # Aggregate danceability (mean)
        danceability_values = [
            track.get('danceability') for track in self.track_data 
            if 'danceability' in track
        ]
        if danceability_values:
            result['mean_danceability'] = statistics.mean(danceability_values)
        
        # Aggregate mood (top 3 most frequent moods)
        all_moods = []
        for track in self.track_data:
            if 'mood_top3' in track:
                all_moods.extend(track['mood_top3'])
        
        if all_moods:
            top_moods = Counter(all_moods).most_common(3)
            result['top_moods'] = [mood for mood, _ in top_moods]
        
        # Store the aggregated stats
        self.artist_stats = result
        return result
    
    def get_artist_stats(self) -> Dict[str, Any]:
        """
        Get the aggregated artist stats, calculating them if not already done.
        
        Returns:
            Dict containing artist sound profile statistics
        """
        if not self.artist_stats:
            return self.aggregate()
        return self.artist_stats

# Example usage
if __name__ == "__main__":
    harvester = ArtistFeatureHarvester("Tame Impala")
    stats = harvester.aggregate()
    print(json.dumps(stats, indent=2))
