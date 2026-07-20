import {
  institutionProfileInputSchema,
  type InstitutionProfile,
  type InstitutionProfileInput,
} from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import type { AuthenticatedUser } from '@intgarti/contracts';
import { mapMediaReference, mediaReferenceSelect } from '../media/media-reference.js';

const KEY = 'institution.profile';
const defaults: InstitutionProfileInput = {
  introduction:
    'El grupo está constituido por docentes, investigadores y estudiantes dedicados a la investigación y desarrollo en inteligencia artificial.',
  objectives:
    'Realizar investigación organizada y sistemática en inteligencia artificial y sus aplicaciones, desarrollando proyectos y resultados científicos de impacto.',
  services: [
    'Consultoría especializada en inteligencia artificial',
    'Desarrollo de sistemas inteligentes',
    'Asesoría de tesis en inteligencia artificial',
  ],
  email: 'dmauricios@unmsm.edu.pe',
  phone: '619 7000',
  office: 'Instituto de Investigación',
  researchLines: [
    { code: 'C.20.0.2', name: 'Ciberseguridad' },
    { code: 'C.20.0.4', name: 'Gobierno y Gestión de TIC' },
    { code: 'C.20.0.6', name: 'Sistemas Inteligentes' },
  ],
  projects: [],
  heroMediaId: null,
  groupMediaId: null,
};

export async function getInstitutionProfile(): Promise<InstitutionProfile> {
  const prisma = getPrismaClient();
  const record = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  const parsed = institutionProfileInputSchema.safeParse(record?.value);
  const value = parsed.success ? parsed.data : defaults;
  const mediaIds = [value.heroMediaId, value.groupMediaId].filter((id): id is string =>
    Boolean(id),
  );
  const media = await prisma.mediaAsset.findMany({
    where: { id: { in: mediaIds } },
    select: mediaReferenceSelect,
  });
  const byId = new Map(media.map((item) => [item.id, item]));
  return {
    ...value,
    heroMedia: mapMediaReference(value.heroMediaId ? (byId.get(value.heroMediaId) ?? null) : null),
    groupMedia: mapMediaReference(
      value.groupMediaId ? (byId.get(value.groupMediaId) ?? null) : null,
    ),
    updatedAt: record?.updatedAt.toISOString() ?? null,
  };
}

export async function updateInstitutionProfile(
  actor: AuthenticatedUser,
  input: InstitutionProfileInput,
) {
  const prisma = getPrismaClient();
  await prisma.siteSetting.upsert({
    where: { key: KEY },
    update: { value: input, description: 'Contenido institucional público de INTGARTI' },
    create: { key: KEY, value: input, description: 'Contenido institucional público de INTGARTI' },
  });
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'INSTITUTION_UPDATED',
      entityType: 'SiteSetting',
      entityId: KEY,
      after: input,
    },
  });
  return getInstitutionProfile();
}
