import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Grid, 
  Alert, 
  CircularProgress,
  Paper,
  FormControl,
  FormHelperText,
  Chip,
  Autocomplete,
  TextField,
  Divider,
  useTheme
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { motion } from 'framer-motion';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';

// Reference artists list
const referenceArtists = [
  { id: 1, name: 'Floating Points' },
  { id: 2, name: 'Four Tet' },
  { id: 3, name: 'Bonobo' },
  { id: 4, name: 'Jon Hopkins' },
  { id: 5, name: 'Bicep' },
  { id: 6, name: 'Rival Consoles' },
  { id: 7, name: 'Max Cooper' },
  { id: 8, name: 'Moderat' },
  { id: 9, name: 'James Holden' },
  { id: 10, name: 'Burial' },
  { id: 11, name: 'Aphex Twin' },
  { id: 12, name: 'Jamie xx' },
  { id: 13, name: 'Nicolas Jaar' },
  { id: 14, name: 'Boards of Canada' },
  { id: 15, name: 'Leon Vynehall' }
];

// Styled components
const UploadZone = styled(Paper)(({ theme, isdragactive, fileselected }) => ({
  border: `2px dashed ${isdragactive === 'true' ? theme.palette.primary.main : fileselected === 'true' ? theme.palette.success.main : theme.palette.grey[300]}`,
  borderRadius: theme.shape.borderRadius * 2,
  padding: theme.spacing(6),
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 0.3s ease-in-out',
  backgroundColor: isdragactive === 'true' 
    ? `${theme.palette.primary.light}20` 
    : fileselected === 'true' 
      ? `${theme.palette.success.light}20` 
      : theme.palette.background.default,
  '&:hover': {
    borderColor: isdragactive === 'true' ? theme.palette.primary.main : theme.palette.primary.light,
    backgroundColor: isdragactive === 'true' ? `${theme.palette.primary.light}30` : `${theme.palette.primary.light}10`,
  },
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 200,
  position: 'relative',
  overflow: 'hidden'
}));

const IconContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: theme.spacing(2),
  '& svg': {
    fontSize: 48,
    color: theme.palette.primary.main,
  }
}));

// Animation variants
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.5,
      ease: "easeOut",
      staggerChildren: 0.1
    }
  },
  exit: { 
    opacity: 0, 
    y: -20,
    transition: { 
      duration: 0.3,
      ease: "easeIn" 
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

const fileInfoVariants = {
  hidden: { scale: 0.9, opacity: 0 },
  visible: { 
    scale: 1, 
    opacity: 1, 
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 20 
    } 
  }
};

const TrackUploader = ({ onFeedbackReceived, onError, onUploadStart }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedArtists, setSelectedArtists] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [systemStatus, setSystemStatus] = useState('unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);
  const theme = useTheme();

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    validateAndSetFile(file);
  };

  const validateAndSetFile = (file) => {
    if (!file) return;

    // Check file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/aiff', 'audio/x-aiff', 'audio/flac'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|aiff|flac)$/i)) {
      setError('Please upload an audio file (MP3, WAV, AIFF, or FLAC)');
      return;
    }

    // Check file size (20MB max)
    if (file.size > 20 * 1024 * 1024) {
      setError('File size exceeds 20MB limit');
      return;
    }

    setSelectedFile(file);
    setError('');
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    validateAndSetFile(file);
  };

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError('Please select a track to upload');
      return;
    }

    try {
      setIsUploading(true);
      onUploadStart();

      const formData = new FormData();
      formData.append('track', selectedFile);
      
      if (selectedArtists.length > 0) {
        // Convert array of artist objects to array of names
        const artistNames = selectedArtists.map(artist => artist.name);
        formData.append('referenceArtists', JSON.stringify(artistNames));
      }

      const apiUrl = process.env.NODE_ENV === 'production' 
        ? '/api/analyze-track'  // In production, use relative path
        : 'http://localhost:5002/api/analyze-track'; // In development, use full URL
        
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to analyze track');
      }

      const data = await response.json();
      
      // Format the track info to pass to parent component
      const trackInfo = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      };
      
      onFeedbackReceived(data, trackInfo, selectedArtists);
    } catch (error) {
      setIsUploading(false);
      setError(error.message || 'An error occurred during upload');
      if (onError) onError(error.message);
    }
  };

  // Check system status on component mount
  useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        const response = await fetch('http://localhost:5002/api/system-check');
        if (response.ok) {
          const data = await response.json();
          setSystemStatus(data.status);
          
          // If we have system issues, show appropriate error
          if (data.status !== 'OK') {
            console.warn('System check failed:', data.checks);
            setErrorMessage('System configuration issue detected. Please contact support.');
          }
        } else {
          setSystemStatus('ERROR');
          setErrorMessage('Unable to connect to the server. Is it running?');
        }
      } catch (error) {
        console.error('System check error:', error);
        setSystemStatus('ERROR');
        setErrorMessage('Server connection failed. Please ensure the server is running on port 5002.');
      }
    };

    checkSystemStatus();
  }, []);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={containerVariants}
    >
      <Paper 
        elevation={3} 
        sx={{ 
          p: 4, 
          mb: 4,
          borderRadius: 3,
          background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <motion.div variants={itemVariants}>
          <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mb: 1 }}>
            AI Music Producer Feedback
          </Typography>
          <Typography variant="body1" paragraph align="center" sx={{ mb: 3, color: theme.palette.text.secondary }}>
            Upload your track and select reference artists for personalized production analysis
          </Typography>
        </motion.div>

        <motion.div variants={itemVariants}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept=".mp3,.wav,.aiff,.flac"
          />
          
          <UploadZone
            isdragactive={isDragging ? 'true' : 'false'}
            fileselected={selectedFile !== null ? 'true' : 'false'}
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <motion.div 
                variants={fileInfoVariants}
                initial="hidden"
                animate="visible"
              >
                <IconContainer>
                  <AudiotrackIcon color="success" />
                </IconContainer>
                <Typography variant="h6" component="span" sx={{ display: 'block', fontWeight: 'bold', mb: 1 }}>
                  {selectedFile.name}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </Typography>
                <Button 
                  variant="outlined" 
                  size="small" 
                  sx={{ mt: 2 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                >
                  Change File
                </Button>
              </motion.div>
            ) : (
              <>
                <IconContainer>
                  <CloudUploadIcon />
                </IconContainer>
                <Typography variant="h6" gutterBottom>
                  Drag and drop your track here
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  or click to browse files
                </Typography>
                <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
                  Supports MP3, WAV, AIFF, FLAC (max 20MB)
                </Typography>
              </>
            )}
          </UploadZone>
        </motion.div>

        {error && (
          <motion.div 
            variants={itemVariants}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          </motion.div>
        )}

        {errorMessage && (
          <motion.div 
            variants={itemVariants}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorMessage}
            </Alert>
          </motion.div>
        )}

        <motion.div variants={itemVariants}>
          <Box sx={{ my: 3 }}>
            <Divider>
              <Chip 
                icon={<MusicNoteIcon />} 
                label="Reference Artists" 
                sx={{ fontWeight: 500, px: 1 }}
              />
            </Divider>
          </Box>
        </motion.div>

        <motion.div variants={itemVariants}>
          <FormControl fullWidth sx={{ mb: 3 }}>
            <Autocomplete
              multiple
              id="reference-artists"
              options={referenceArtists}
              getOptionLabel={(option) => option.name}
              filterSelectedOptions
              value={selectedArtists}
              onChange={(event, newValue) => {
                setSelectedArtists(newValue);
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const tagProps = getTagProps({ index });
                  const { key, ...otherProps } = tagProps;
                  return (
                    <Chip
                      key={option.id || key}
                      label={option.name}
                      {...otherProps}
                      sx={{ 
                        backgroundColor: theme.palette.primary.light, 
                        color: theme.palette.primary.contrastText,
                        fontWeight: 500
                      }}
                    />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  label="Select reference artists (optional)"
                  placeholder="Add artists"
                />
              )}
            />
            <FormHelperText>
              Select artists whose production style you'd like to be compared with
            </FormHelperText>
          </FormControl>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Grid container justifyContent="center">
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleSubmit}
              disabled={!selectedFile || isUploading || systemStatus === 'ERROR'}
              startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : null}
              sx={{ 
                minWidth: 200, 
                py: 1.5,
                fontSize: '1rem'
              }}
            >
              {isUploading ? 'Uploading...' : 'Analyze My Track'}
            </Button>
          </Grid>
        </motion.div>
      </Paper>
    </motion.div>
  );
};

export default TrackUploader;
