import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Alert,
  Chip,
  Divider,
  Grid,
  useTheme,
  Card,
  CardContent,
  LinearProgress,
  Tooltip
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ReplayIcon from '@mui/icons-material/Replay';
import LowPriorityIcon from '@mui/icons-material/LowPriority';
import AssessmentIcon from '@mui/icons-material/Assessment';
import InsightsIcon from '@mui/icons-material/Insights';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import TuneIcon from '@mui/icons-material/Tune';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.5,
      ease: "easeOut",
      staggerChildren: 0.15
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

const jokeContainerVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.5 } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: { duration: 0.3 } 
  }
};

// Styled metric component for displaying audio parameters
const MetricCard = ({ title, value, description, icon, color = "primary" }) => {
  const theme = useTheme();
  
  return (
    <Card 
      elevation={2} 
      sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderTop: `4px solid ${theme.palette[color].main}`,
        transition: 'transform 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: theme.shadows[4]
        }
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box 
            sx={{ 
              mr: 1.5, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: `${theme.palette[color].main}15`,
              borderRadius: '50%',
              p: 1,
              color: theme.palette[color].main
            }}
          >
            {icon}
          </Box>
          <Typography variant="subtitle1" fontWeight={600} sx={{ color: theme.palette.text.primary }}>
            {title}
          </Typography>
        </Box>
        
        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1, color: theme.palette[color].main }}>
          {value}
        </Typography>
        
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
};

const FeedbackDisplay = ({ feedback, loading, error, onReset, trackInfo, selectedArtists }) => {
  const [showJoke, setShowJoke] = useState(true);
  const [showRealFeedback, setShowRealFeedback] = useState(false);
  const [processingTimeout, setProcessingTimeout] = useState(false);
  const theme = useTheme();

  useEffect(() => {
    if (feedback) {
      console.log("Received feedback:", feedback);
      console.log("Analysis section length:", feedback.analysis ? feedback.analysis.length : 0);
      console.log("Technical insights length:", feedback.technicalInsights ? feedback.technicalInsights.length : 0);
      
      // Set a timer to fade out the joke feedback
      const timer = setTimeout(() => {
        setShowJoke(false);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    // Only show the joke when loading is true and we don't yet have feedback
    if (loading && !feedback) {
      setShowJoke(true);
      setShowRealFeedback(false);
      
      // After 4 seconds, hide the joke and show real feedback
      const jokeTimer = setTimeout(() => {
        setShowJoke(false);
        setShowRealFeedback(true);
      }, 4000);
      
      // Set a timeout for the processing to detect if we're stuck
      const timeoutTimer = setTimeout(() => {
        setProcessingTimeout(true);
      }, 30000); // 30 second timeout
      
      return () => {
        clearTimeout(jokeTimer);
        clearTimeout(timeoutTimer);
      };
    } else if (feedback) {
      // If we already have feedback, don't show the joke
      setShowJoke(false);
      setShowRealFeedback(true);
      setProcessingTimeout(false);
    }
  }, [loading, feedback]);

  // Format feedback sections for display
  const formatFeedbackSection = (text) => {
    if (!text) {
      console.log("Received empty text content for formatting");
      return <Typography variant="body1">No detailed analysis available for this track. Please try uploading again.</Typography>;
    }
    
    console.log("Formatting feedback text length:", text.length);
    console.log("Formatting feedback text preview:", text.substring(0, 100) + "...");
    
    // Always return at least the raw text if parsing fails
    try {
      // Simple paragraph formatting for GPT-4o response format
      if (!text.includes('#') && !text.includes('*')) {
        return text.split('\n').map((line, i) => {
          // Handle GPT-4o's response format with heading-like sentences without markdown
          if (line.match(/^(Analysis|Overview|Mix|Arrangement|Sound Design|Dynamics|Technical|Comparison|Recommendations|Next Steps):/i)) {
            return (
              <Typography key={i} variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 'medium' }}>
                {line}
              </Typography>
            );
          } else if (line.trim() === '') {
            return <Box key={i} sx={{ height: '0.5em' }} />;
          } else {
            return <Typography key={i} variant="body1" paragraph>{line}</Typography>;
          }
        });
      }
      
      // Split the text by headings
      const lines = text.split('\n');
      console.log(`Formatting ${lines.length} lines of text`);
      
      const formattedLines = lines.map((line, i) => {
        if (line.match(/^#+\s/)) {
          // This is a heading
          const level = line.match(/^(#+)/)[0].length;
          const headingText = line.replace(/^#+\s/, '');
          
          return (
            <Typography
              key={i}
              variant={level === 1 ? 'h4' : level === 2 ? 'h5' : 'h6'}
              gutterBottom
              sx={{ 
                mt: 3, 
                mb: 2, 
                fontWeight: 'bold',
                color: theme.palette.primary.main
              }}
            >
              {headingText}
            </Typography>
          );
        } else if (line.match(/^\*\s/)) {
          // This is a bullet point
          const bulletText = line.replace(/^\*\s/, '');
          return (
            <Box key={i} sx={{ display: 'flex', mb: 1 }}>
              <Box sx={{ mr: 1, mt: 0.5 }}>•</Box>
              <Typography variant="body1">{bulletText}</Typography>
            </Box>
          );
        } else if (line.trim() === '') {
          // Empty line
          return <Box key={i} sx={{ height: '0.5em' }} />;
        } else {
          // Regular paragraph
          return <Typography key={i} variant="body1" paragraph>{line}</Typography>;
        }
      });
      
      return formattedLines;
    } catch (error) {
      console.error("Error formatting feedback:", error);
      // Return the raw text as a fallback
      return (
        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </Typography>
      );
    }
  };

  // Get audio parameters from feedback for visualization
  const getAudioParams = () => {
    if (!feedback || !feedback.audioFeatures) return null;
    
    const { audioFeatures } = feedback;
    
    return [
      { 
        title: 'BPM', 
        value: audioFeatures.tempo ? Math.round(audioFeatures.tempo) : 'N/A',
        description: 'Track tempo in beats per minute',
        icon: <TuneIcon />,
        color: 'primary'
      },
      { 
        title: 'Key', 
        value: audioFeatures.key || 'N/A',
        description: 'Detected musical key',
        icon: <MusicNoteIcon />,
        color: 'secondary'
      },
      { 
        title: 'Dynamics', 
        value: audioFeatures.dynamics ? `${audioFeatures.dynamics.toFixed(1)} dB` : 'N/A',
        description: 'Dynamic range of the track',
        icon: <VolumeUpIcon />,
        color: 'success'
      },
      { 
        title: 'Energy', 
        value: audioFeatures.energy ? `${Math.round(audioFeatures.energy * 100)}%` : 'N/A',
        description: 'Perceived energy level',
        icon: <InsightsIcon />,
        color: 'warning'
      }
    ];
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={containerVariants}
    >
      {/* Debug info panel */}
      {feedback && feedback.debugData && (
        <Paper elevation={3} sx={{ p: 3, mb: 3, bgcolor: '#f5f5f5', overflowX: 'auto' }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Debug Information</Typography>
          
          <Typography variant="h6" sx={{ mt: 2 }}>Track Info:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(feedback.debugData.trackInfo, null, 2)}
          </pre>
          
          <Typography variant="h6" sx={{ mt: 2 }}>Extracted Features:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(feedback.debugData.extractedFeatures, null, 2)}
          </pre>
          
          <Typography variant="h6" sx={{ mt: 2 }}>Reference Artists:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(feedback.debugData.referenceArtists, null, 2)}
          </pre>
          
          <Typography variant="h6" sx={{ mt: 2 }}>Prompt Sent to GPT-4o:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
            {feedback.debugData.prompt}
          </pre>
          
          <Typography variant="h6" sx={{ mt: 2 }}>API Key Status:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px' }}>
            {feedback.debugData.apiKey}
          </pre>
          
          <Typography variant="h6" sx={{ mt: 2 }}>Server Details:</Typography>
          <pre style={{ background: '#eaeaea', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(feedback.debugData.serverDetails, null, 2)}
          </pre>
        </Paper>
      )}
      
      {/* DIRECT OUTPUT: Always display raw analysis regardless of formatting issues */}
      {feedback && (feedback.analysis || feedback.technicalInsights) && (
        <Paper elevation={3} sx={{ p: 3, mb: 3, bgcolor: '#f8f9fa', overflowX: 'auto' }}>
          <Typography variant="h5" gutterBottom sx={{ color: theme.palette.primary.main, fontWeight: 'bold' }}>
            <MusicNoteIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
            Professional Track Analysis (GPT-4o)
          </Typography>
          
          <Typography variant="body1" sx={{ fontStyle: 'italic', mb: 2 }}>
            Analysis based on extracted audio features and reference artists.
          </Typography>
          
          <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 1, whiteSpace: 'pre-wrap' }}>
            {feedback.analysis || feedback.technicalInsights || "No analysis generated. Please try uploading your track again."}
          </Box>
        </Paper>
      )}
      
      {/* Joke initial feedback */}
      <AnimatePresence>
        {showJoke && (
          <motion.div
            variants={jokeContainerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Paper elevation={3} sx={{ p: 4, mb: 3, bgcolor: '#f8f8f8', position: 'relative' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography variant="h4" sx={{ mb: 2, fontWeight: 'bold', textAlign: 'center', color: '#000' }}>
                  INITIAL ANALYSIS RESULT:
                </Typography>
                <Typography variant="h2" sx={{ mb: 3, fontWeight: 'bold', color: 'red', textAlign: 'center' }}>
                  YOUR SNARE IS SHIT
                </Typography>
                <Box sx={{ maxWidth: '100%', width: '500px', mb: 2 }}>
                  <img 
                    src="/images/snare_daly.png" 
                    alt="John Daly telling someone their snare is shit" 
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  <Typography sx={{ color: '#000' }}>Generating detailed analysis...</Typography>
                </Box>
              </Box>
            </Paper>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Real feedback after joke */}
      <AnimatePresence>
        {(showRealFeedback || feedback) && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {loading && !feedback ? (
              <Paper elevation={3} sx={{ p: 4, mb: 3 }}>
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 'medium' }}>
                      Just kidding! Here's the real analysis of your track:
                    </Typography>
                    <CircularProgress size={40} sx={{ mb: 2 }} />
                    <Typography variant="body1">
                      Analyzing your audio and generating professional feedback...
                    </Typography>
                    
                    {processingTimeout && (
                      <Box sx={{ mt: 4, p: 2, bgcolor: theme.palette.warning.light + '20', borderRadius: 2 }}>
                        <Typography variant="body2" color="warning.dark" sx={{ mb: 1 }}>
                          This is taking longer than expected. The server might be experiencing issues.
                        </Typography>
                        <Button
                          variant="outlined"
                          color="warning"
                          onClick={onReset}
                          size="small"
                          startIcon={<ReplayIcon />}
                          sx={{ mt: 1 }}
                        >
                          Cancel and try again
                        </Button>
                      </Box>
                    )}
                  </motion.div>
                </Box>
              </Paper>
            ) : error ? (
              <Paper elevation={3} sx={{ p: 4, mb: 3 }}>
                <Alert 
                  severity="error" 
                  sx={{ mb: 2 }}
                >
                  {error}
                </Alert>
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Button
                    variant="outlined"
                    onClick={onReset}
                    startIcon={<ReplayIcon />}
                  >
                    Try Again
                  </Button>
                </Box>
              </Paper>
            ) : feedback ? (
              <>
                <Paper 
                  elevation={3} 
                  sx={{ 
                    p: { xs: 2, sm: 4 }, 
                    mb: 3,
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`
                  }}
                >
                  <motion.div variants={itemVariants}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
                      <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold' }}>
                        Analysis Complete
                      </Typography>
                      <Button
                        variant="outlined"
                        onClick={onReset}
                        startIcon={<ReplayIcon />}
                        size="small"
                      >
                        Analyze Another Track
                      </Button>
                    </Box>
                  
                    {trackInfo && (
                      <Box sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <MusicNoteIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                          <Typography variant="h6" sx={{ fontWeight: 'medium' }}>
                            {trackInfo.name}
                          </Typography>
                        </Box>
                        
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          <Chip 
                            size="small" 
                            label={`${(trackInfo.size / (1024 * 1024)).toFixed(2)} MB`} 
                            sx={{ bgcolor: theme.palette.grey[100] }}
                          />
                          <Chip 
                            size="small" 
                            label={trackInfo.type.split('/').pop().toUpperCase()} 
                            sx={{ bgcolor: theme.palette.grey[100] }}
                          />
                          
                          {selectedArtists && selectedArtists.length > 0 && (
                            <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                              <LowPriorityIcon fontSize="small" sx={{ mr: 0.5, color: theme.palette.secondary.main }} />
                              {selectedArtists.map((artist, idx) => (
                                <Chip 
                                  key={artist.id || idx}
                                  size="small" 
                                  label={artist.name}
                                  sx={{ 
                                    ml: 0.5, 
                                    bgcolor: theme.palette.secondary.light + '20',
                                    color: theme.palette.secondary.dark,
                                    fontWeight: 500
                                  }}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Box>
                    )}
                  </motion.div>
                
                  <motion.div variants={itemVariants}>
                    <Divider sx={{ my: 3 }}>
                      <Chip 
                        icon={<AssessmentIcon />} 
                        label="AUDIO METRICS" 
                        sx={{ px: 1, fontWeight: 500 }}
                      />
                    </Divider>
                  </motion.div>
                    
                  {feedback.audioFeatures && (
                    <motion.div variants={itemVariants}>
                      <Grid container spacing={3} sx={{ mb: 4 }}>
                        {getAudioParams()?.map((param, index) => (
                          <Grid item xs={12} sm={6} md={3} key={index}>
                            <MetricCard 
                              title={param.title} 
                              value={param.value} 
                              description={param.description} 
                              icon={param.icon}
                              color={param.color}
                            />
                          </Grid>
                        ))}
                      </Grid>
                    </motion.div>
                  )}
                  
                  <motion.div variants={itemVariants}>
                    <Divider sx={{ my: 3 }}>
                      <Chip 
                        icon={<CompareArrowsIcon />} 
                        label="PRODUCTION FEEDBACK" 
                        sx={{ px: 1, fontWeight: 500 }}
                      />
                    </Divider>
                  </motion.div>
                    
                  <motion.div variants={itemVariants}>
                    <Box sx={{ backgroundColor: 'rgba(0, 0, 0, 0.01)', p: 3, borderRadius: 2, mt: 2 }}>
                      {feedback.analysis ? formatFeedbackSection(feedback.analysis) : (
                        <Typography variant="body1">
                          No detailed analysis available for this track. Please try uploading again.
                        </Typography>
                      )}
                    </Box>
                  </motion.div>
                    
                  {feedback.comparisonToReference && (
                    <>
                      <motion.div variants={itemVariants}>
                        <Divider sx={{ my: 3 }}>
                          <Chip 
                            icon={<CompareArrowsIcon />} 
                            label="COMPARISON TO REFERENCE ARTISTS" 
                            sx={{ px: 1, fontWeight: 500 }}
                          />
                        </Divider>
                      </motion.div>
                        
                      <motion.div variants={itemVariants}>
                        <Box sx={{ backgroundColor: 'rgba(0, 0, 0, 0.01)', p: 3, borderRadius: 2 }}>
                          {formatFeedbackSection(feedback.comparisonToReference)}
                        </Box>
                      </motion.div>
                    </>
                  )}
                    
                  {feedback.technicalInsights && (
                    <>
                      <motion.div variants={itemVariants}>
                        <Box sx={{ mb: 4 }}>
                          <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium', color: theme.palette.primary.main }}>
                            <MusicNoteIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                            Technical Insights
                          </Typography>
                          <Paper elevation={1} sx={{ p: 3, bgcolor: 'rgba(255, 255, 255, 0.8)' }}>
                            {feedback && feedback.technicalInsights ? (
                              <>
                                {typeof feedback.technicalInsights === 'string' && feedback.technicalInsights.length > 0 ? (
                                  formatFeedbackSection(feedback.technicalInsights)
                                ) : (
                                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(feedback.analysis)}
                                  </Typography>
                                )}
                              </>
                            ) : (
                              <Typography variant="body1">
                                No technical insights available for this track. Please try uploading again.
                              </Typography>
                            )}
                          </Paper>
                        </Box>
                      </motion.div>
                    </>
                  )}
                    
                  {feedback.nextSteps && (
                    <>
                      <motion.div variants={itemVariants}>
                        <Divider sx={{ my: 3 }}>
                          <Chip 
                            icon={<InsightsIcon />} 
                            label="IMPROVEMENT RECOMMENDATIONS" 
                            sx={{ px: 1, fontWeight: 500 }}
                          />
                        </Divider>
                      </motion.div>
                        
                      <motion.div variants={itemVariants}>
                        <Box 
                          sx={{ 
                            backgroundColor: `${theme.palette.primary.light}15`,
                            borderLeft: `4px solid ${theme.palette.primary.main}`,
                            p: 3, 
                            borderRadius: 2 
                          }}
                        >
                          {formatFeedbackSection(feedback.nextSteps)}
                        </Box>
                      </motion.div>
                    </>
                  )}
                  
                  <motion.div variants={itemVariants}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                      <Button
                        variant="contained"
                        onClick={onReset}
                        startIcon={<ReplayIcon />}
                        size="large"
                      >
                        Analyze Another Track
                      </Button>
                    </Box>
                  </motion.div>
                </Paper>
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default FeedbackDisplay;
