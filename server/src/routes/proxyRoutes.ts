import { Router } from 'express';
import { proxyHealthRouter } from './proxy/proxyHealth';
import { proxyUploadRouter } from './proxy/proxyUpload';
import { aiProxyRouter } from './proxy/aiProxy';

export const proxyRouter = Router();

proxyRouter.use('/', proxyHealthRouter);
proxyRouter.use('/', proxyUploadRouter);
proxyRouter.use('/ai', aiProxyRouter);
