
import "dotenv/config";
import http from "node:http";
import { app } from "./app.js";
import { startPushWorker } from './lib/push.js';
import { initializeSocket } from './lib/socket.js';

const port = Number(process.env.PORT) || 5000;

const server = http.createServer(app);
initializeSocket(server);
server.listen(port, () => {
  console.log("Servidor corriendo en el puerto", port);
  startPushWorker();
});
