const express = require('express');
const AppError = require('./util/appError');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const userRouter = require('./router/userRouter');

const app = express();

// Security: set common HTTP headers
app.use(helmet());

// Configure CORS to allow requests from the frontend origin
// FRONTEND_URL should be set in backend `.env` (loaded by server.js)
const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
const corsOptions = {
  origin: frontendOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
};

// Enable CORS and preflight responses
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

if(process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json());

app.use('/user', userRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

module.exports = app;