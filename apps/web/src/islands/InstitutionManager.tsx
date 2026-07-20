import { useEffect, useState, type FormEvent } from 'react';
import {
  institutionProfileInputSchema,
  institutionProfileSchema,
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
export default function InstitutionManager() {
  const [form, setForm] = useState<InstitutionProfileInput | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = getEditorAccessToken();
    if (!t) return;
    void apiRequest('/editor/institution', institutionProfileSchema, { accessToken: t })
      .then(({ heroMedia: _, groupMedia: __, updatedAt: ___, ...value }) => setForm(value))
      .catch((e) =>
        setMessage(e instanceof Error ? e.message : 'No fue posible cargar el contenido.'),
      );
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
      await apiRequest(`/editor/media/${request.mediaAssetId}/complete`, z.unknown(), {
        method: 'POST',
        accessToken: t,
      });
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
      const { heroMedia: _, groupMedia: __, updatedAt: ___, ...value } = saved;
      setForm(value);
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
        Fotografía principal
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], 'heroMediaId')}
        />
      </label>
      <label className="photo">
        Fotografía del grupo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0], 'groupMediaId')}
        />
      </label>
      <footer>
        <button className="editorial-button" disabled={busy}>
          Guardar y publicar
        </button>
      </footer>
      <EditorialToast message={message} onClose={() => setMessage('')} />
      <style>{`.institution{padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.institution .wide,.institution footer{grid-column:1/-1}.institution .photo{padding:18px;border:1px dashed var(--editorial-line);display:grid;gap:10px}.institution footer{display:flex;justify-content:flex-end}@media(max-width:650px){.institution{grid-template-columns:1fr}.institution .wide,.institution footer{grid-column:auto}}`}</style>
    </form>
  );
}
