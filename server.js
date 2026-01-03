import express from 'express';
import dotenv from 'dotenv/config';
import authRoutes from './routes/authRoutes.js';

const app = express();
const dotenv = dotenv.config();
const PORT = process.env.PORT;

app.use(express.json());
app.use('/api/auth', authRoutes);



console.log(`Backend running on ${PORT}`);
