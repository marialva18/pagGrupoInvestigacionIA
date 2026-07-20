import express, { type Router } from 'express';
import {
  completeMediaUploadHandler,
  createMediaUploadRequestHandler,
  getMediaUploadStatusHandler,
  listMediaLibraryHandler,
} from './media-upload.controller.js';

export const mediaRouter: Router = express.Router();

mediaRouter.get('/', listMediaLibraryHandler);

mediaRouter.post('/upload-requests', createMediaUploadRequestHandler);

mediaRouter.get('/:mediaAssetId/status', getMediaUploadStatusHandler);

mediaRouter.post('/:mediaAssetId/complete', completeMediaUploadHandler);
