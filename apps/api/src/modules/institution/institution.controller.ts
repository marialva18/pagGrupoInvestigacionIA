import type { RequestHandler } from 'express';
import { institutionProfileInputSchema } from '@intgarti/contracts';
import { AppError } from '../../common/errors/app-error.js';
import { getAuthenticatedUser } from '../auth/auth.middleware.js';
import { getInstitutionProfile, updateInstitutionProfile } from './institution.service.js';

export const getInstitutionHandler: RequestHandler = (_req, res, next) => {
  void getInstitutionProfile()
    .then((data) => res.json({ data }))
    .catch(next);
};
export const updateInstitutionHandler: RequestHandler = (req, res, next) => {
  const parsed = institutionProfileInputSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(
        'El contenido institucional no es válido.',
        400,
        'INSTITUTION_INVALID_INPUT',
        parsed.error.flatten(),
      ),
    );
    return;
  }
  void updateInstitutionProfile(getAuthenticatedUser(req), parsed.data)
    .then((data) => res.json({ data }))
    .catch(next);
};
