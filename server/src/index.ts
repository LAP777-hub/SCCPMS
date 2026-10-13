import app from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { closeClinicEvents } from './events.routes.js';
import { drainServer } from './lifecycle.js';

// Local and container entry point. Vercel imports app.ts without opening a port.
const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info(`SCCPMS API server started`, { 
    port: config.PORT, 
    environment: config.NODE_ENV,
    frontend_origin: config.FRONTEND_ORIGIN,
    email_otp_configured: /^re_[A-Za-z0-9_-]{20,}$/.test(config.RESEND_API_KEY),
    email_otp_sender: config.RESEND_FROM_EMAIL.toLowerCase().includes('@resend.dev') ? 'owner-only test sender' : 'custom sender'
  });
});

let shutdownStarted = false;
async function shutdown() {
  if (shutdownStarted) return;
  shutdownStarted = true;
  logger.info('Shutting down server gracefully...');
  const deadline = setTimeout(() => {
    logger.error('Shutdown exceeded its deadline; closing remaining connections.');
    server.closeAllConnections();
    process.exit(1);
  }, 30000);
  deadline.unref();
  try {
    await drainServer(server, closeClinicEvents, () => pool.end());
    logger.info('HTTP requests, live synchronization and database connections closed');
    process.exitCode = 0;
  } catch (error) {
    logger.error('Unable to shut down cleanly', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
