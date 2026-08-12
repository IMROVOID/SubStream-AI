import express from 'express';
import cors from 'cors';
import { PORT } from './config';
import { getActiveProxyConfig } from './proxy';
import { ensureBinary } from './binaryManager';
import { proxyRouter } from './routes/proxyRoutes';
import { mediaRouter } from './routes/mediaRoutes';
import { startAutoProxyFetcher } from './proxyFetcher';

const app = express();

app.use(cors());

// Increase limit to handle large JSON payloads if necessary
app.use(express.json({ limit: '50mb' })); 

// Mount Route Handlers
app.use('/api/proxy', proxyRouter);
app.use('/api', mediaRouter);

// Initialize Proxy, Auto Proxy Fetcher from iplocate/free-proxy-list, and Axios Client on Startup
(async () => {
    await getActiveProxyConfig();
    startAutoProxyFetcher();
})();

// Initialize binary check on startup
ensureBinary();

// Start Server
app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
});
