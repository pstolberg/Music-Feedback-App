import React from 'react';
import { Box, Step, StepLabel, Stepper, styled } from '@mui/material';
import { motion } from 'framer-motion';

const StyledStepper = styled(Stepper)(({ theme }) => ({
  marginBottom: theme.spacing(4),
  '& .MuiStepLabel-root': {
    '& .MuiStepLabel-label': {
      fontWeight: 500,
      fontSize: '0.95rem',
      marginTop: theme.spacing(0.5),
      
      '&.Mui-active': {
        color: theme.palette.primary.main,
        fontWeight: 600,
      },
      '&.Mui-completed': {
        color: theme.palette.success.main,
        fontWeight: 600,
      },
    },
  },
  '& .MuiStepConnector-line': {
    height: 3,
    borderTopWidth: 3,
    borderRadius: 1.5,
  },
  '& .MuiStepConnector-root': {
    top: 12,
    left: 'calc(-50% + 12px)',
    right: 'calc(50% + 12px)',
    '&.Mui-active, &.Mui-completed': {
      '& .MuiStepConnector-line': {
        borderColor: theme.palette.primary.main,
      },
    },
  },
}));

// Custom styled step icon
const StepIcon = styled('div')(({ theme, ownerState }) => ({
  width: 24,
  height: 24,
  borderRadius: '50%',
  backgroundColor: ownerState.active 
    ? theme.palette.primary.main 
    : ownerState.completed 
      ? theme.palette.success.main 
      : theme.palette.grey[300],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.palette.common.white,
  zIndex: 1,
  transition: 'all 0.3s ease'
}));

// Animation variants for the stepper container
const containerVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { 
      duration: 0.5,
      ease: "easeOut" 
    }
  }
};

const ProgressIndicator = ({ activeStep, steps }) => {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <StyledStepper activeStep={activeStep} alternativeLabel>
        {steps.map((label, index) => (
          <Step key={label}>
            <StepLabel
              StepIconComponent={(props) => (
                <StepIcon ownerState={{
                  active: props.active,
                  completed: props.completed,
                }}>
                  {props.icon}
                </StepIcon>
              )}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </StyledStepper>
    </motion.div>
  );
};

export default ProgressIndicator;
