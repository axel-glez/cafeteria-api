
import "dotenv/config";
import { app } from "./app";
import { startPushWorker } from './lib/push';

const port = Number(process.env.PORT) || 5000;

app.listen(port, () => {
  console.log("Servidor corriendo en el puerto", port);
  startPushWorker();
});
