import { useEffect, useState, type FormEvent } from 'react';
import { editorMemberSchema, type EditorMember } from '@intgarti/contracts';
import { z } from 'zod';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';
import { EditorialToast } from '../components/editorial/EditorialFeedback';
const listSchema = z.object({ items: z.array(editorMemberSchema), pagination: z.unknown() });
const uploadSchema = z.object({
  mediaAssetId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
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
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState<string | null>(null),
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
  useEffect(() => {
    void load();
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
      await apiRequest(`/editor/media/${u.mediaAssetId}/complete`, z.unknown(), {
        method: 'POST',
        accessToken: t,
      });
      setForm((x) => ({ ...x, photoMediaId: u.mediaAssetId }));
      setMessage('Foto cargada; guarda el perfil.');
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
      <form className="editorial-card" onSubmit={save}>
        <h2>{editing ? 'Editar miembro' : 'Nuevo miembro'}</h2>
        <label className="editorial-field">
          Nombre
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
        </label>
        <label className="editorial-field">
          Cargo, grado o condición
          <input
            value={form.roleTitle}
            onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
            required
          />
        </label>
        <label className="editorial-field wide">
          Biografía
          <textarea
            value={form.biography}
            onChange={(e) => setForm({ ...form, biography: e.target.value })}
          />
        </label>
        <label className="editorial-field">
          Correo
          <input
            type="email"
            value={form.email}
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
            value={form.displayOrder}
            onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
          />
        </label>
        <label>
          Fotografía
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isCoordinator}
            onChange={(e) => setForm({ ...form, isCoordinator: e.target.checked })}
          />{' '}
          Es coordinador
        </label>
        <footer>
          <button className="editorial-button" disabled={busy}>
            Guardar
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(empty);
              }}
            >
              Cancelar
            </button>
          )}
        </footer>
      </form>
      <section className="editorial-card">
        <header className="editorial-card__header">
          <h2>Directorio</h2>
        </header>
        {items.map((m) => (
          <article key={m.id}>
            {m.photoMedia ? <img src={m.photoMedia.url} alt="" /> : <span>{m.fullName[0]}</span>}
            <div>
              <strong>{m.fullName}</strong>
              <small>
                {m.roleTitle}
                {m.isCoordinator ? ' · Coordinador' : ''}
              </small>
            </div>
            <button onClick={() => edit(m)}>Editar</button>
          </article>
        ))}
      </section>
      <EditorialToast message={message} onClose={() => setMessage('')} />
      <style>{`.member-manager{display:grid;grid-template-columns:minmax(320px,.8fr) 1.2fr;gap:18px}.member-manager form{padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.member-manager form h2,.member-manager .wide,.member-manager footer{grid-column:1/-1}.member-manager footer{display:flex;gap:8px}.member-manager article{padding:14px 20px;border-top:1px solid var(--editorial-line);display:flex;align-items:center;gap:12px}.member-manager article img,.member-manager article>span{width:48px;height:48px;object-fit:cover;border-radius:50%;display:grid;place-items:center;background:var(--color-navy);color:white}.member-manager article div{display:grid;margin-right:auto}.member-manager article small{color:var(--editorial-muted)}@media(max-width:900px){.member-manager{grid-template-columns:1fr}}@media(max-width:520px){.member-manager form{grid-template-columns:1fr}.member-manager form h2,.member-manager .wide,.member-manager footer{grid-column:auto}}`}</style>
    </div>
  );
}
