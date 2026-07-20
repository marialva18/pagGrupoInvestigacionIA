import { useEffect, useState, type FormEvent } from 'react';
import {
  institutionProfileInputSchema,
  institutionProfileSchema,
  mediaReferenceSchema,
  type InstitutionProfileInput,
} from '@intgarti/contracts';
import { z } from 'zod';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';
import { EditorialToast } from '../components/editorial/EditorialFeedback';
const uploadSchema = z.object({
  mediaAssetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
});
const mediaLibraryItemSchema = mediaReferenceSchema.extend({
  originalFilename: z.string().min(1),
});
const mediaLibrarySchema = z.array(mediaLibraryItemSchema);
type MediaLibraryItem = z.infer<typeof mediaLibraryItemSchema>;
const completedUploadSchema = z.object({
  mediaAssetId: z.string().uuid(),
  status: z.enum(['PROCESSING', 'READY']),
});
const uploadStatusSchema = z.object({
  mediaAssetId: z.string().uuid(),
  status: z.enum(['PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED']),
  errorMessage: z.string().nullable(),
});
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
export default function InstitutionManager() {
  const [form, setForm] = useState<InstitutionProfileInput | null>(null),
    [mediaLibrary, setMediaLibrary] = useState<MediaLibraryItem[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = getEditorAccessToken();
    if (!t) return;
    void apiRequest('/editor/institution', institutionProfileSchema, { accessToken: t })
      .then((profile) => setForm(institutionProfileInputSchema.parse(profile)))
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : 'No fue posible cargar el contenido.'),
      );
    void apiRequest('/editor/media', mediaLibrarySchema, { accessToken: t })
      .then(setMediaLibrary)
      .catch(() => setMediaLibrary([]));
  }, []);
  function field<K extends keyof InstitutionProfileInput>(
    key: K,
    value: InstitutionProfileInput[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }
  async function upload(file: File, target: 'heroMediaId' | 'groupMediaId') {
    const t = getEditorAccessToken();
    if (!t) return;
    setBusy(true);
    try {
      const request = await apiRequest('/editor/media/upload-requests', uploadSchema, {
        method: 'POST',
        accessToken: t,
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          altText: 'Fotografía institucional de INTGARTI',
        }),
      });
      const response = await fetch(request.uploadUrl, {
        method: 'PUT',
        headers: request.requiredHeaders,
        body: file,
      });
      if (!response.ok) throw new Error('No fue posible subir la fotografía.');
      const completed = await apiRequest(
        `/editor/media/${request.mediaAssetId}/complete`,
        completedUploadSchema,
        { method: 'POST', accessToken: t },
      );
      let status: z.infer<typeof uploadStatusSchema>['status'] = completed.status;
      for (let attempt = 0; status !== 'READY' && attempt < 20; attempt += 1) {
        setMessage('Procesando fotografía…');
        await wait(1500);
        const current = await apiRequest(
          `/editor/media/${request.mediaAssetId}/status`,
          uploadStatusSchema,
          { accessToken: t },
        );
        if (current.status === 'REJECTED' || current.status === 'ARCHIVED') {
          throw new Error(current.errorMessage ?? 'La fotografía no pudo procesarse.');
        }
        status = current.status;
      }
      if (status !== 'READY') throw new Error('La fotografía todavía se está procesando.');
      setMediaLibrary(await apiRequest('/editor/media', mediaLibrarySchema, { accessToken: t }));
      field(target, request.mediaAssetId);
      setMessage('Fotografía cargada. Guarda los cambios para publicarla.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No fue posible cargar la fotografía.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = getEditorAccessToken();
    if (!t || !form) return;
    setBusy(true);
    try {
      const saved = await apiRequest('/editor/institution', institutionProfileSchema, {
        method: 'PUT',
        accessToken: t,
        body: JSON.stringify(form),
      });
      setForm(institutionProfileInputSchema.parse(saved));
      setMessage('Contenido institucional publicado.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No fue posible guardar.');
    } finally {
      setBusy(false);
    }
  }
  if (!form) return <p className="editorial-empty">Cargando contenido institucional…</p>;
  return (
    <form className="institution editorial-card" onSubmit={submit}>
      <label className="editorial-field wide">
        Presentación
        <textarea
          rows={6}
          value={form.introduction}
          onChange={(e) => field('introduction', e.target.value)}
          required
        />
      </label>
      <label className="editorial-field wide">
        Objetivos
        <textarea
          rows={6}
          value={form.objectives}
          onChange={(e) => field('objectives', e.target.value)}
          required
        />
      </label>
      <label className="editorial-field wide">
        Servicios (uno por línea)
        <textarea
          rows={5}
          value={form.services.join('\n')}
          onChange={(e) => field('services', e.target.value.split('\n').filter(Boolean))}
        />
      </label>
      <label className="editorial-field">
        Correo
        <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)} />
      </label>
      <label className="editorial-field">
        Teléfono
        <input value={form.phone} onChange={(e) => field('phone', e.target.value)} />
      </label>
      <label className="editorial-field wide">
        Oficina
        <input value={form.office} onChange={(e) => field('office', e.target.value)} />
      </label>
      <label className="editorial-field wide">
        Líneas de investigación (código | nombre)
        <textarea
          rows={5}
          value={form.researchLines.map((x) => `${x.code} | ${x.name}`).join('\n')}
          onChange={(e) =>
            field(
              'researchLines',
              e.target.value
                .split('\n')
                .filter(Boolean)
                .map((x) => {
                  const [code, ...name] = x.split('|');
                  return { code: code.trim(), name: name.join('|').trim() };
                }),
            )
          }
        />
      </label>
      <label className="editorial-field wide">
        Proyectos (código | título)
        <textarea
          rows={10}
          value={form.projects.map((x) => `${x.code} | ${x.title}`).join('\n')}
          onChange={(e) =>
            field(
              'projects',
              e.target.value
                .split('\n')
                .filter(Boolean)
                .map((x) => {
                  const [code, ...title] = x.split('|');
                  return { code: code.trim(), title: title.join('|').trim() };
                }),
            )
          }
        />
      </label>
      <label className="photo">
        Portada del homepage
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], 'heroMediaId')}
        />
        <strong className="library-label">Biblioteca de imágenes</strong>
        <select
          value={form.heroMediaId ?? ''}
          onChange={(e) => field('heroMediaId', e.target.value || null)}
        >
          <option value="">Sin portada del homepage</option>
          {mediaLibrary.map((media) => (
            <option value={media.id}>{media.originalFilename}</option>
          ))}
        </select>
        {form.heroMediaId && mediaLibrary.find((media) => media.id === form.heroMediaId) && (
          <img
            src={mediaLibrary.find((media) => media.id === form.heroMediaId)?.url}
            alt="Vista previa de la portada del homepage"
          />
        )}
      </label>
      <label className="photo">
        Fotografía de la página El grupo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], 'groupMediaId')}
        />
        <strong className="library-label">Biblioteca de imágenes</strong>
        <select
          value={form.groupMediaId ?? ''}
          onChange={(e) => field('groupMediaId', e.target.value || null)}
        >
          <option value="">Sin fotografía para la página El grupo</option>
          {mediaLibrary.map((media) => (
            <option value={media.id}>{media.originalFilename}</option>
          ))}
        </select>
        {form.groupMediaId && mediaLibrary.find((media) => media.id === form.groupMediaId) && (
          <img
            src={mediaLibrary.find((media) => media.id === form.groupMediaId)?.url}
            alt="Vista previa de la fotografía del grupo"
          />
        )}
      </label>
      <footer>
        <button className="editorial-button" disabled={busy}>
          Guardar y publicar
        </button>
      </footer>
      <EditorialToast message={message} onClose={() => setMessage('')} />
      <style>{`.institution{padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.institution .wide,.institution footer{grid-column:1/-1}.institution .photo{min-width:0;padding:18px;border:1px dashed var(--editorial-line);display:grid;gap:12px}.institution .photo input,.institution .photo select{width:100%;max-width:100%;box-sizing:border-box}.institution .photo input[type=file]{padding:8px;border:1px solid var(--editorial-line);border-radius:8px;background:#fff}.institution .photo input[type=file]::file-selector-button{min-height:40px;margin-right:12px;padding:0 16px;border:0;border-radius:7px;color:#fff;background:var(--editorial-accent);font-weight:800;cursor:pointer}.library-label{margin-top:4px;color:var(--color-navy);font-size:.82rem}.institution .photo select{min-height:44px;padding:0 12px;border:1px solid var(--editorial-line);border-radius:8px;background:#fff}.institution .photo img{width:100%;height:220px;object-fit:cover;border-radius:8px}.institution footer{display:flex;justify-content:flex-end}@media(max-width:650px){.institution{grid-template-columns:1fr}.institution .wide,.institution footer{grid-column:auto}}`}</style>
    </form>
  );
}
