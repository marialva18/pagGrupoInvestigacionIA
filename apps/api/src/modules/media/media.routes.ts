import express, { type Router } from 'express';
import {
  completeMediaUploadHandler,
  createMediaUploadRequestHandler,
} from './media-upload.controller.js';

export const mediaRouter: Router = express.Router();

mediaRouter.post('/upload-requests', createMediaUploadRequestHandler);

mediaRouter.post('/:mediaAssetId/complete', completeMediaUploadHandler);
