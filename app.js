const express = require('express');
const AppError = require('./util/appError');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const globalErrorHandler = require('./controller/errorController');

const userRouter = require('./router/userRouter');
const sessionRouter = require('./router/sessionRouter');
const codeEditorRouter = require('./router/codeEditorRouter');

const app = express();

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use(express.json());

// Security: set common HTTP headers
app.use(helmet());

// Configure CORS to allow requests from the frontend origin
// FRONTEND_URL should be set in backend `.env` (loaded by server.js)
const rawOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
];

// Remove falsy values and trailing slashes to normalize origins
const allowedOrigins = rawOrigins.filter(Boolean).map((o) => String(o).replace(/\/$/, ''));

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // check against normalized allowlist
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
};

// Enable CORS and preflight responses
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use('/user', userRouter);
app.use('/session', sessionRouter);
app.use('/editor', codeEditorRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;