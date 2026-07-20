import { useEffect, useState, type FormEvent } from 'react';
import { editorMemberSchema, mediaReferenceSchema, type EditorMember } from '@intgarti/contracts';
import { z } from 'zod';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';
import { EditorialToast } from '../components/editorial/EditorialFeedback';
const listSchema = z.object({ items: z.array(editorMemberSchema), pagination: z.unknown() });
const mediaLibraryItemSchema = mediaReferenceSchema.extend({
  originalFilename: z.string().min(1),
});
const mediaLibrarySchema = z.array(mediaLibraryItemSchema);
type MediaLibraryItem = z.infer<typeof mediaLibraryItemSchema>;
const uploadSchema = z.object({
  mediaAssetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
});
const completedUploadSchema = z
  .object({
    mediaAssetId: z.string().uuid(),
    status: z.enum(['PROCESSING', 'READY']),
    alreadyCompleted: z.boolean(),
  })
  .passthrough();
const uploadStatusSchema = z.object({
  mediaAssetId: z.string().uuid(),
  status: z.enum(['PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'REJECTED', 'ARCHIVED']),
  errorMessage: z.string().nullable(),
});

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
const empty = {
  fullName: '',
  roleTitle: '',
  biography: '',
  email: '',
  linkedinUrl: '',
  orcidUrl: '',
  photoMediaId: null as string | null,
  isCoordinator: false,
  displayOrder: 0,
  active: true,
};
export default function MemberManager() {
  const [items, setItems] = useState<EditorMember[]>([]),
    [mediaLibrary, setMediaLibrary] = useState<MediaLibraryItem[]>([]),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState<string | null>(null),
    [formOpen, setFormOpen] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const token = () => getEditorAccessToken();
  async function load() {
    const t = token();
    if (t)
      setItems(
        (await apiRequest('/editor/members?pageSize=100', listSchema, { accessToken: t })).items,
      );
  }
  async function loadMediaLibrary() {
    const t = token();
    if (t) {
      setMediaLibrary(await apiRequest('/editor/media', mediaLibrarySchema, { accessToken: t }));
    }
  }
  useEffect(() => {
    void load();
    void loadMediaLibrary();
  }, []);
  function edit(m: EditorMember) {
    setEditing(m.id);
    setForm({
      fullName: m.fullName,
      roleTitle: m.roleTitle,
      biography: m.biography ?? '',
      email: m.email ?? '',
      linkedinUrl: m.linkedinUrl ?? '',
      orcidUrl: m.orcidUrl ?? '',
      photoMediaId: m.photoMedia?.id ?? null,
      isCoordinator: m.isCoordinator,
      displayOrder: m.displayOrder,
      active: m.active,
    });
    setFormOpen(true);
  }
  function create() {
    setEditing(null);
    setForm(empty);
    setFormOpen(true);
  }
  function closeForm() {
    setEditing(null);
    setForm(empty);
    setFormOpen(false);
  }
  async function upload(file: File) {
    const t = token();
    if (!t) return;
    setBusy(true);
    try {
      const u = await apiRequest('/editor/media/upload-requests', uploadSchema, {
        method: 'POST',
        accessToken: t,
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          altText: `Fotografía de ${form.fullName || 'miembro de INTGARTI'}`,
        }),
      });
      const put = await fetch(u.uploadUrl, {
        method: 'PUT',
        headers: u.requiredHeaders,
        body: file,
      });
      if (!put.ok) throw new Error('No fue posible subir la foto.');
      const completed = await apiRequest(
        `/editor/media/${u.mediaAssetId}/complete`,
        completedUploadSchema,
        {
          method: 'POST',
          accessToken: t,
        },
      );

      let status: z.infer<typeof uploadStatusSchema>['status'] = completed.status;

      for (let attempt = 0; status !== 'READY' && attempt < 20; attempt += 1) {
        setMessage('Procesando fotografía…');
        await wait(1500);

        const current = await apiRequest(
          `/editor/media/${u.mediaAssetId}/status`,
          uploadStatusSchema,
          { accessToken: t },
        );

        if (current.status === 'REJECTED') {
          throw new Error(
            current.errorMessage ?? 'La fotografía fue rechazada durante el proceso.',
          );
        }

        if (current.status === 'ARCHIVED') {
          throw new Error('La fotografía dejó de estar disponible durante el proceso.');
        }

        status = current.status;
      }

      if (status !== 'READY') {
        throw new Error(
          'La fotografía todavía se está procesando. Espera unos segundos y vuelve a seleccionarla.',
        );
      }

      setForm((current) => ({ ...current, photoMediaId: u.mediaAssetId }));
      await loadMediaLibrary();
      setMessage('Fotografía lista. Ya puedes guardar el perfil.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No fue posible cargar la foto.');
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const t = token();
    if (!t) return;
    setBusy(true);
    try {
      const body = {
        ...form,
        biography: form.biography || null,
        email: form.email || null,
        linkedinUrl: form.linkedinUrl || null,
        orcidUrl: form.orcidUrl || null,
      };
      await apiRequest(
        editing ? `/editor/members/${editing}` : '/editor/members',
        editorMemberSchema,
        { method: editing ? 'PATCH' : 'POST', accessToken: t, body: JSON.stringify(body) },
      );
      setForm(empty);
      setEditing(null);
      setFormOpen(false);
      await load();
      setMessage('Miembro guardado.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No fue posible guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="member-manager">
      <section className="editorial-card">
        <header className="editorial-card__header">
          <div>
            <h2>Directorio</h2>
            <p>{items.length} perfiles registrados</p>
          </div>
          <button className="editorial-button" type="button" onClick={create}>
            Nuevo miembro
          </button>
        </header>
        <div className="member-list">
          {items.map((m) => (
            <article key={m.id}>
              {m.photoMedia ? <img src={m.photoMedia.url} alt="" /> : <span>{m.fullName[0]}</span>}
              <div className="member-copy">
                <strong title={m.fullName}>{m.fullName}</strong>
                <small title={m.roleTitle}>
                  {m.roleTitle}
                  {m.isCoordinator ? ' · Coordinador' : ''}
                </small>
                {m.email && <small className="member-email">{m.email}</small>}
              </div>
              <span className={`member-state ${m.active ? 'is-active' : ''}`}>
                {m.active ? 'Activo' : 'Inactivo'}
              </span>
              <button className="member-edit" type="button" onClick={() => edit(m)}>
                Editar
              </button>
            </article>
          ))}
          {items.length === 0 && <p className="editorial-empty">Todavía no hay miembros.</p>}
        </div>
      </section>

      {formOpen && (
        <div
          className="member-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-title"
        >
          <button
            className="member-drawer__backdrop"
            type="button"
            onClick={closeForm}
            aria-label="Cerrar formulario"
          />
          <section className="member-drawer__panel">
            <header>
              <div>
                <span>{editing ? 'Actualizar perfil' : 'Nuevo perfil'}</span>
                <h2 id="member-title">{editing ? 'Editar miembro' : 'Agregar miembro'}</h2>
              </div>
              <button type="button" onClick={closeForm} aria-label="Cerrar">
                ×
              </button>
            </header>
            <form onSubmit={save}>
              <div className="member-form-grid">
                <label className="editorial-field wide">
                  Nombre completo
                  <input
                    value={form.fullName}
                    maxLength={180}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    required
                  />
                </label>
                <label className="editorial-field wide">
                  Cargo, grado o condición
                  <input
                    value={form.roleTitle}
                    maxLength={180}
                    onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                    required
                  />
                </label>
                <label className="editorial-field wide">
                  Biografía
                  <textarea
                    rows={6}
                    value={form.biography}
                    onChange={(e) => setForm({ ...form, biography: e.target.value })}
                  />
                </label>
                <label className="editorial-field wide">
                  Correo
                  <input
                    type="email"
                    value={form.email}
                    maxLength={320}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <label className="editorial-field">
                  ORCID
                  <input
                    type="url"
                    value={form.orcidUrl}
                    onChange={(e) => setForm({ ...form, orcidUrl: e.target.value })}
                  />
                </label>
                <label className="editorial-field">
                  LinkedIn
                  <input
                    type="url"
                    value={form.linkedinUrl}
                    onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })}
                  />
                </label>
                <label className="editorial-field">
                  Orden
                  <input
                    type="number"
                    min={0}
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                  />
                </label>
                <label className="member-photo-field">
                  Fotografía
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
                  />
                  <small>JPG, PNG o WebP. Máximo 10 MB.</small>
                </label>
                <section className="member-library" aria-labelledby="member-library-title">
                  <div>
                    <strong id="member-library-title">Seleccionar de biblioteca</strong>
                    <small>{mediaLibrary.length} imágenes disponibles</small>
                  </div>
                  <div className="member-library__grid">
                    <button
                      type="button"
                      className={!form.photoMediaId ? 'is-selected' : ''}
                      onClick={() => setForm({ ...form, photoMediaId: null })}
                    >
                      Sin foto
                    </button>
                    {mediaLibrary.map((media) => (
                      <button
                        type="button"
                        className={form.photoMediaId === media.id ? 'is-selected' : ''}
                        onClick={() => setForm({ ...form, photoMediaId: media.id })}
                        title={media.originalFilename}
                        aria-label={`Seleccionar ${media.originalFilename}`}
                      >
                        <img src={media.url} alt={media.altText ?? ''} />
                        <span>{media.originalFilename}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <label className="member-check">
                  <input
                    type="checkbox"
                    checked={form.isCoordinator}
                    onChange={(e) => setForm({ ...form, isCoordinator: e.target.checked })}
                  />{' '}
                  Es coordinador
                </label>
                <label className="member-check">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />{' '}
                  Perfil activo
                </label>
              </div>
              <footer>
                <button
                  className="editorial-button editorial-button--secondary"
                  type="button"
                  onClick={closeForm}
                >
                  Cancelar
                </button>
                <button className="editorial-button" disabled={busy}>
                  {busy ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      <EditorialToast message={message} onClose={() => setMessage('')} />
      <style>{`.member-manager{min-width:0}.member-manager>.editorial-card{overflow:hidden}.member-list{min-width:0}.member-manager article{min-width:0;padding:14px 20px;border-top:1px solid var(--editorial-line);display:grid;grid-template-columns:48px minmax(0,1fr) auto auto;align-items:center;gap:14px}.member-manager article img,.member-manager article>span:first-child{width:48px;height:48px;object-fit:cover;border-radius:50%;display:grid;place-items:center;background:var(--color-navy);color:white}.member-copy{min-width:0;display:grid;gap:3px}.member-copy strong,.member-copy small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-copy small{color:var(--editorial-muted)}.member-email{font-size:.78rem}.member-state{padding:5px 9px;border-radius:999px;color:var(--editorial-muted);background:#f0efeb;font-size:.75rem;font-weight:750}.member-state.is-active{color:#17623b;background:#e8f5ee}.member-edit{min-height:36px;padding:0 13px;border:1px solid var(--editorial-line);border-radius:8px;color:var(--color-navy);background:white;font-weight:750;cursor:pointer}.member-drawer{position:fixed;z-index:80;inset:0;display:flex;justify-content:flex-end}.member-drawer__backdrop{position:absolute;inset:0;border:0;background:rgb(13 25 37 / 48%);backdrop-filter:blur(2px)}.member-drawer__panel{position:relative;width:min(680px,100%);height:100%;min-width:0;overflow-x:hidden;overflow-y:auto;background:white;box-shadow:-20px 0 50px rgb(13 25 37 / 18%)}.member-drawer__panel>header{position:sticky;z-index:2;top:0;padding:22px 26px;display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid var(--editorial-line);background:rgb(255 255 255 / 96%)}.member-drawer__panel>header span{color:var(--editorial-accent);font-size:.78rem;font-weight:800;text-transform:uppercase}.member-drawer__panel>header h2{margin:5px 0 0;color:var(--color-navy)}.member-drawer__panel>header>button{border:0;background:transparent;font-size:1.8rem;cursor:pointer}.member-drawer form{padding:24px 26px}.member-form-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:15px}.member-form-grid>*{min-width:0}.member-form-grid .wide{grid-column:1/-1}.member-form-grid input,.member-form-grid textarea{max-width:100%;box-sizing:border-box}.member-photo-field{grid-column:1/-1;padding:16px;display:grid;gap:8px;border:1px dashed var(--editorial-line);border-radius:10px;color:var(--color-navy);font-weight:700;overflow:hidden}.member-photo-field input{width:100%;font-weight:400}.member-photo-field small{color:var(--editorial-muted);font-weight:400}.member-library{grid-column:1/-1;display:grid;gap:10px}.member-library>div:first-child{display:flex;align-items:end;justify-content:space-between;gap:12px;color:var(--color-navy)}.member-library>div:first-child small{color:var(--editorial-muted)}.member-library__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:8px;max-height:260px;overflow:auto}.member-library__grid button{height:88px;min-width:0;padding:4px;border:2px solid transparent;border-radius:10px;background:#f3f1ed;color:var(--editorial-muted);font-weight:700;cursor:pointer;overflow:hidden}.member-library__grid button.is-selected{border-color:var(--editorial-accent);box-shadow:0 0 0 2px rgb(119 37 54 / 12%)}.member-library__grid img{width:100%;height:100%;object-fit:cover;border-radius:6px}.member-check{display:flex;align-items:center;gap:8px;color:var(--color-navy);font-size:.88rem;font-weight:650}.member-check input{accent-color:var(--editorial-accent)}.member-drawer footer{position:sticky;bottom:0;margin:24px -26px -24px;padding:16px 26px;display:flex;justify-content:flex-end;gap:9px;border-top:1px solid var(--editorial-line);background:white}@media(max-width:650px){.member-manager .editorial-card__header{align-items:flex-start;flex-direction:column}.member-manager .editorial-card__header .editorial-button{width:100%}.member-manager article{grid-template-columns:44px minmax(0,1fr) auto}.member-manager article img,.member-manager article>span:first-child{width:44px;height:44px}.member-state{display:none}.member-edit{grid-column:2/-1;width:100%}.member-form-grid{grid-template-columns:1fr}.member-form-grid .wide,.member-photo-field,.member-library{grid-column:auto}.member-drawer form,.member-drawer__panel>header{padding-inline:18px}.member-drawer footer{margin-inline:-18px;padding-inline:18px}}`}</style>
      <style>{`.member-photo-field input[type=file]{padding:8px;border:1px solid var(--editorial-line);border-radius:8px;background:#fff}.member-photo-field input[type=file]::file-selector-button{min-height:40px;margin-right:12px;padding:0 16px;border:0;border-radius:7px;color:#fff;background:var(--editorial-accent);font-weight:800;cursor:pointer}`}</style>
      <style>{`.member-library__grid button{position:relative}.member-library__grid button span{position:absolute;inset:auto 3px 3px;padding:3px 5px;overflow:hidden;border-radius:4px;color:#fff;background:rgb(13 25 37 / 78%);font-size:.62rem;font-weight:650;text-overflow:ellipsis;white-space:nowrap}`}</style>
    </div>
  );
}
