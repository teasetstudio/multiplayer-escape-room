import { createGameServer } from './app.js';

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535.');
const { gameServer } = createGameServer();
await gameServer.listen(port, process.env.HOST ?? '0.0.0.0');
console.log(`Game server listening on port ${port}`);
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  void gameServer
    .gracefullyShutdown(false)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
