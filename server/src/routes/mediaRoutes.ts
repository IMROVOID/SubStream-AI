import { Router } from 'express';
import { mediaDownloadRouter } from './media/mediaDownload';
import { mediaSubtitleRouter } from './media/mediaSubtitle';

export const mediaRouter = Router();

mediaRouter.use('/', mediaDownloadRouter);
mediaRouter.use('/', mediaSubtitleRouter);
