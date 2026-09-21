import express from 'express';
import explainRouter from './routes/explain.js';

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'cronwise' });
  });

  app.use('/', explainRouter);

  app.use((req, res) => {
    res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
  });

  return app;
}
