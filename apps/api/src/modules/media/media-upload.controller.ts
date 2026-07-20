import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import {
  completeMediaUploadParamsSchema,
  createMediaUploadRequestSchema,
} from './media-upload.schema.js';
import {
  completeMediaUpload,
  createMediaUploadRequest,
  getMediaUploadStatus,
  listMediaLibrary,
} from './media-upload.service.js';

export const listMediaLibraryHandler: RequestHandler = (_request, response, next) => {
  void listMediaLibrary()
    .then((result) => {
      response.status(200).json({ data: result });
    })
    .catch(next);
};

export const createMediaUploadRequestHandler: RequestHandler = (request, response, next) => {
  const parsed = createMediaUploadRequestSchema.safeParse(request.body);

  if (!parsed.success) {
    next(
      new AppError(
        'Los datos de la imagen no son válidos. Solo se permiten JPEG, PNG y WebP de hasta 10 MB.',
        400,
        'MEDIA_UPLOAD_INVALID_INPUT',
      ),
    );

    return;
  }

  void createMediaUploadRequest(getAuthenticatedUser(request), parsed.data)
    .then((result) => {
      response.status(201).json({
        data: result,
      });
    })
    .catch(next);
};

export const completeMediaUploadHandler: RequestHandler = (request, response, next) => {
  const parsed = completeMediaUploadParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new AppError('El identificador de la imagen no es válido.', 400, 'MEDIA_ASSET_INVALID_ID'),
    );

    return;
  }

  void completeMediaUpload(getAuthenticatedUser(request), parsed.data.mediaAssetId)
    .then((result) => {
      response.status(200).json({
        data: result,
      });
    })
    .catch(next);
};

export const getMediaUploadStatusHandler: RequestHandler = (request, response, next) => {
  const parsed = completeMediaUploadParamsSchema.safeParse(request.params);

  if (!parsed.success) {
    next(
      new AppError('El identificador de la imagen no es válido.', 400, 'MEDIA_ASSET_INVALID_ID'),
    );
    return;
  }

  void getMediaUploadStatus(getAuthenticatedUser(request), parsed.data.mediaAssetId)
    .then((result) => {
      response.status(200).json({ data: result });
    })
    .catch(next);
};
