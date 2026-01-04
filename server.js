const http = require('http');
const dotenv = require('dotenv');
const app = require('./app');

dotenv.config({ path: './.env' });

const server = http.createServer(app);

const port = process.env.PORT || 8000;

server.listen(port, () => console.log(`Server is running on port: ${port}`));