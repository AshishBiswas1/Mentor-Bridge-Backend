const express = require('express');
const dotenv = require('dotenv');
const cors= require('cors')
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRouter');
const sessionRoutes= require('./routes/sessionRouter')
const codeEditorRouter= require('./routes/codeEditRouter')

const { initChatSocket } = require('./util/chatSocket');
const  initSignaling  = require('./util/signalSocket');

dotenv.config();

const app = express();
app.use(express.json());


app.use(cors({ origin: '*',
    credentials: true,
    methods:["GET","POST"]
   }))

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*',
    credentials: true,
    methods:["GET","POST"],
    transports: ['websocket', 'polling']
   }
});

const PORT = process.env.PORT;

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/code-editor', codeEditorRouter);

const chatNamespace = io.of('/chat');
const signalNamespace = io.of('/signal');

console.log('Namespaces before:', Object.keys(io._nsps));

initChatSocket(chatNamespace);
initSignaling(signalNamespace);

console.log('Namespaces after:', Object.keys(io._nsps));

server.listen(PORT, () => {
  console.log(`Backend running on ${PORT}`);
});
