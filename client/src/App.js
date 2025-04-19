import React from 'react';
import { Container, CssBaseline, ThemeProvider } from '@mui/material';
import TrackUploader from './components/TrackUploader';
import FeedbackDisplay from './components/FeedbackDisplay';
import ProgressIndicator from './components/ProgressIndicator';
import theme from './theme';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [feedback, setFeedback] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [activeStep, setActiveStep] = React.useState(0);
  const [uploadedTrack, setUploadedTrack] = React.useState(null);
  const [selectedArtists, setSelectedArtists] = React.useState([]);

  const handleFeedbackReceived = (data, trackInfo, artists) => {
    setFeedback(data);
    setLoading(false);
    setActiveStep(2);
    setUploadedTrack(trackInfo);
    setSelectedArtists(artists);
  };

  const handleReset = () => {
    setFeedback(null);
    setLoading(false);
    setError(null);
    setActiveStep(0);
    setUploadedTrack(null);
    setSelectedArtists([]);
  };

  const handleUploadStart = () => {
    setLoading(true);
    setActiveStep(1);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ProgressIndicator 
          activeStep={activeStep} 
          steps={['Upload Track', 'Analyzing', 'Feedback']} 
        />
        
        <AnimatePresence mode="wait">
          {activeStep === 0 && (
            <TrackUploader 
              onFeedbackReceived={handleFeedbackReceived} 
              onError={setError} 
              onUploadStart={handleUploadStart}
            />
          )}

          {(activeStep === 1 || activeStep === 2) && (
            <FeedbackDisplay 
              feedback={feedback} 
              loading={loading} 
              error={error}
              onReset={handleReset}
              trackInfo={uploadedTrack}
              selectedArtists={selectedArtists}
            />
          )}
        </AnimatePresence>
      </Container>
    </ThemeProvider>
  );
}

export default App;
