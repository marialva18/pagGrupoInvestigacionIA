import express, { type Router } from 'express';
import {
  completeMediaUploadHandler,
  createMediaUploadRequestHandler,
  getMediaUploadStatusHandler,
} from './media-upload.controller.js';

export const mediaRouter: Router = express.Router();

mediaRouter.post('/upload-requests', createMediaUploadRequestHandler);

mediaRouter.get('/:mediaAssetId/status', getMediaUploadStatusHandler);

mediaRouter.post('/:mediaAssetId/complete', completeMediaUploadHandler);
