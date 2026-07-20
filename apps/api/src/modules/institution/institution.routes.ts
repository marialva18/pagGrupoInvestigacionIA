import express from 'express';
import { getInstitutionHandler, updateInstitutionHandler } from './institution.controller.js';
export const institutionRouter = express.Router();
institutionRouter.get('/', getInstitutionHandler);
institutionRouter.put('/', updateInstitutionHandler);
