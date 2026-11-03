import express from 'express';
import explainRouter from './routes/explain.js';

export function createApp() {
  const app = express();
  // Keep Express's default ~100kb JSON body limit; failures are handled below.
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'cronwise' });
  });

  app.use('/', explainRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
  });

  // express.json() errors bypass route handlers; return stable JSON instead of HTML (#13).
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'malformed JSON body' });
    }
    if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
      return res.status(413).json({ error: 'JSON body too large' });
    }
    return next(err);
  });

  return app;
}
