"""
Unit tests for the AudioDB API client
"""
import os
import json
import unittest
from unittest.mock import patch, MagicMock
import tempfile
import shutil

from clients.audiodb_client import AudioDBClient

class TestAudioDBClient(unittest.TestCase):
    """Test cases for the AudioDBClient class"""
    
    def setUp(self):
        """Set up test environment before each test"""
        # Create a temporary directory for cache
        self.temp_dir = tempfile.mkdtemp()
        self.cache_patcher = patch('clients.audiodb_client.CACHE_DIR', self.temp_dir)
        self.cache_patcher.start()
        
        # Set up test environment variables
        os.environ['AUDIO_DB_API_KEY'] = 'test_api_key'
        
        # Initialize the client
        self.client = AudioDBClient()
        
        # Sample test data
        self.test_artist = 'Daft Punk'
        self.test_title = 'Get Lucky'
        self.test_response = {
            'track': [
                {
                    'idTrack': '123456',
                    'strTrack': 'Get Lucky',
                    'strArtist': 'Daft Punk',
                    'strKey': '7',  # G major
                    'strMode': 'Major',
                    'intBPM': '116'
                }
            ]
        }
    
    def tearDown(self):
        """Clean up after each test"""
        # Stop patches
        self.cache_patcher.stop()
        
        # Remove temporary directory
        shutil.rmtree(self.temp_dir)
    
    @patch('clients.audiodb_client.requests.get')
    def test_search_track_success(self, mock_get):
        """Test successful track search"""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = self.test_response
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.search_track(self.test_artist, self.test_title)
        
        # Verify the result
        self.assertIsNotNone(result)
        self.assertEqual(result['key'], 'G')
        self.assertEqual(result['mode'], 'Major')
        self.assertEqual(result['tempo'], 116.0)
        
        # Verify the API was called correctly
        mock_get.assert_called_once_with(
            f"https://www.theaudiodb.com/api/v1/json/{self.client.api_key}/searchtrack.php",
            params={'s': self.test_artist, 't': self.test_title}
        )
    
    @patch('clients.audiodb_client.requests.get')
    def test_search_track_not_found(self, mock_get):
        """Test track not found"""
        # Set up mock response with no tracks
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {'track': None}
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.search_track('Invalid Artist', 'Invalid Track')
        
        # Verify the result
        self.assertIsNone(result)
    
    @patch('clients.audiodb_client.requests.get')
    def test_search_track_invalid_key(self, mock_get):
        """Test handling of invalid key value"""
        # Set up mock response with invalid key
        mock_response = MagicMock()
        mock_response.status_code = 200
        invalid_track = self.test_response.copy()
        invalid_track['track'][0]['strKey'] = '99'  # Invalid key value
        mock_response.json.return_value = invalid_track
        mock_get.return_value = mock_response
        
        # Call the method
        result = self.client.search_track(self.test_artist, self.test_title)
        
        # Verify the result (should still return mode and tempo)
        self.assertIsNotNone(result)
        self.assertNotIn('key', result)  # Key should be skipped due to invalid value
        self.assertEqual(result['mode'], 'Major')
        self.assertEqual(result['tempo'], 116.0)
    
    @patch('clients.audiodb_client.requests.get')
    def test_search_track_server_error(self, mock_get):
        """Test handling of server error"""
        # Set up mock response
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = Exception("Server error")
        mock_get.return_value = mock_response
        
        # Call the method with retry patched to avoid real waiting
        with patch('clients.audiodb_client.time.sleep'):
            with self.assertRaises(Exception):
                self.client.search_track(self.test_artist, self.test_title)
    
    def test_caching(self):
        """Test caching functionality"""
        # Create a safe cache key for artist and title
        safe_key = f"{self.test_artist}_{self.test_title}".lower().replace(" ", "_")
        cache_path = os.path.join(self.temp_dir, f"audiodb_{safe_key}.json")
        
        # Write test data to cache
        test_track_data = self.test_response['track'][0]
        with open(cache_path, 'w') as f:
            json.dump(test_track_data, f)
        
        # Mock to ensure API is not called
        with patch('clients.audiodb_client.requests.get') as mock_get:
            # Call the method
            result = self.client.search_track(self.test_artist, self.test_title)
            
            # Verify the result from cache
            self.assertIsNotNone(result)
            self.assertEqual(result['key'], 'G')
            self.assertEqual(result['mode'], 'Major')
            self.assertEqual(result['tempo'], 116.0)
            
            # Verify API was not called (used cache)
            mock_get.assert_not_called()
    
    @patch('clients.audiodb_client.time.sleep')
    @patch('clients.audiodb_client.time.time')
    def test_rate_limiting(self, mock_time, mock_sleep):
        """Test rate limiting functionality"""
        # Mock time.time to return controlled values
        current_time = 1000.0
        mock_time.return_value = current_time
        
        # Set last request time to simulate recent request
        self.client.last_request_time = current_time - 0.5  # 0.5 seconds ago
        
        # Mock API to return success
        with patch('clients.audiodb_client.requests.get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = self.test_response
            mock_get.return_value = mock_response
            
            # Call the method
            self.client.search_track(self.test_artist, self.test_title)
            
            # Verify sleep was called to enforce rate limit
            mock_sleep.assert_called_once_with(0.5)  # Should wait 0.5 seconds to complete 1 second

if __name__ == '__main__':
    unittest.main()
