const AppError = require('../util/appError');

// Handle Supabase authentication errors
const handleSupabaseAuthError = (err) => {
  let message = 'Authentication failed';
  
  if (err.message.includes('Invalid login credentials')) {
    message = 'Invalid email or password';
  } else if (err.message.includes('Email not confirmed')) {
    message = 'Please verify your email before logging in';
  } else if (err.message.includes('User already registered')) {
    message = 'An account with this email already exists';
  } else if (err.message.includes('Invalid token')) {
    message = 'Your session has expired. Please log in again';
  } else if (err.message.includes('JWT expired')) {
    message = 'Your session has expired. Please log in again';
  }
  
  return new AppError(message, 401);
};

// Handle Supabase database errors
const handleSupabaseDatabaseError = (err) => {
  let message = 'Database operation failed';
  let statusCode = 500;
  
  // Foreign key constraint violation
  if (err.code === '23503') {
    message = 'Referenced resource does not exist';
    statusCode = 400;
  }
  // Unique constraint violation
  else if (err.code === '23505') {
    message = 'A record with this value already exists';
    statusCode = 409;
  }
  // Not null constraint violation
  else if (err.code === '23502') {
    message = 'Required field is missing';
    statusCode = 400;
  }
  // Check constraint violation
  else if (err.code === '23514') {
    message = 'Invalid data provided';
    statusCode = 400;
  }
  
  return new AppError(message, statusCode);
};

// Handle Supabase storage errors
const handleSupabaseStorageError = (err) => {
  let message = 'Storage operation failed';
  
  if (err.message.includes('not found')) {
    message = 'File not found';
  } else if (err.message.includes('already exists')) {
    message = 'File already exists';
  } else if (err.message.includes('Bucket not found')) {
    message = 'Storage bucket not found';
  } else if (err.message.includes('Object size exceeds')) {
    message = 'File size too large';
  }
  
  return new AppError(message, 400);
};

// Handle validation errors
const handleValidationError = (err) => {
  const message = `Invalid input data: ${err.message}`;
  return new AppError(message, 400);
};

// Handle JWT errors
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again', 401);
};

// Handle JWT expiration
const handleJWTExpiredError = () => {
  return new AppError('Your session has expired. Please log in again', 401);
};

// Send error response in development
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    ...(err.details && { details: err.details })
  });
};

// Send error response in production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperatonal) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  }
  // Programming or unknown error: don't leak error details
  else {
    console.error('ERROR 💥', err);
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong on the server'
    });
  }
};

// Global error handling middleware
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;
    
    // Handle Supabase authentication errors
    if (err.message && (
      err.message.includes('Invalid login credentials') ||
      err.message.includes('Email not confirmed') ||
      err.message.includes('User already registered') ||
      err.message.includes('Invalid token') ||
      err.message.includes('JWT expired')
    )) {
      error = handleSupabaseAuthError(error);
    }
    
    // Handle Supabase database errors (PostgreSQL errors)
    if (err.code && err.code.startsWith('23')) {
      error = handleSupabaseDatabaseError(error);
    }
    
    // Handle Supabase storage errors
    if (err.message && (
      err.message.includes('storage') ||
      err.message.includes('Bucket') ||
      err.message.includes('Object size exceeds')
    )) {
      error = handleSupabaseStorageError(error);
    }
    
    // Handle JWT errors
    if (error.name === 'JsonWebTokenError') {
      error = handleJWTError();
    }
    
    if (error.name === 'TokenExpiredError') {
      error = handleJWTExpiredError();
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      error = handleValidationError(error);
    }
    
    sendErrorProd(error, res);
  }
};
