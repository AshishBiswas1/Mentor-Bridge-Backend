const express = require('express');
const AppError = require('./util/appError');
const morgan = require('morgan');

const userRouter = require('./router/userRouter');

const app = express();

app.use(express.json());

app.use('/user', userRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

module.exports = app;