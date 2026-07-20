import { createClient, type Session } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { setEditorAccessToken } from '../lib/auth/editor-session';

const messageSchema = z.object({ message: z.string() });
const sessionSchema = z.object({ user: z.object({ displayName: z.string() }) });
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export default function PasswordRecovery() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error' | 'info'>('info');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setMessageTone('error');
      setMessage('Las variables públicas de Supabase no están configuradas.');
      setChecking(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true },
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
  }, []);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await apiRequest('/auth/password-recovery', messageSchema, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setMessageTone('success');
      setMessage(result.message);
    } catch (error: unknown) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : 'No fue posible procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabaseUrl || !supabaseAnonKey) {
      setMessageTone('error');
      setMessage('Las variables públicas de Supabase no están configuradas.');
      return;
    }

    if (!session) return;

    if (password.length < 8) {
      setMessageTone('error');
      setMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmation) {
      setMessageTone('error');
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error('No fue posible actualizar la contraseña.');

      const result = await apiRequest('/auth/session', sessionSchema, {
        accessToken: session.access_token,
      });
      setEditorAccessToken(session.access_token, true);
      setMessageTone('success');
      setMessage(`Contraseña actualizada. Bienvenido, ${result.user.displayName}.`);
      window.setTimeout(() => window.location.replace('/editor'), 700);
    } catch (error: unknown) {
      setMessageTone('error');
      setMessage(
        error instanceof Error ? error.message : 'No fue posible actualizar la contraseña.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="account-form-wrap">
      <form className="account-form" onSubmit={session ? updatePassword : requestRecovery}>
        <span>Seguridad</span>
        <h1>{session ? 'Nueva contraseña' : 'Recuperar acceso'}</h1>
        <p>
          {session
            ? 'Define una contraseña nueva para tu cuenta.'
            : 'Te enviaremos un enlace al correo registrado.'}
        </p>

        {!checking &&
          (session ? (
            <>
              <label>
                Contraseña nueva
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </label>
            </>
          ) : (
            <label>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="nombre@correo.com"
                required
              />
            </label>
          ))}

        <button type="submit" disabled={loading || checking}>
          {checking
            ? 'Validando…'
            : loading
              ? 'Procesando…'
              : session
                ? 'Guardar contraseña'
                : 'Enviar enlace'}
        </button>
        <a href="/acceso">Volver al inicio de sesión</a>
      </form>

      <EditorialLoadingOverlay
        visible={loading || checking}
        label={checking ? 'Validando enlace…' : 'Procesando solicitud…'}
        page
      />
      <EditorialToast
        message={message}
        tone={messageTone}
        onClose={() => setMessage('')}
        durationMs={messageTone === 'success' ? 4200 : 5400}
      />

      <style>{`
        .account-form-wrap{position:relative;width:min(100%,480px)}
        .account-form{width:100%;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .account-form>span{color:var(--color-burgundy);font-size:.78rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        .account-form h1{margin:11px 0 9px;color:var(--color-navy);font-family:"Segoe UI","Source Sans 3",Arial,sans-serif;font-size:clamp(2rem,4vw,2.45rem);font-weight:800;letter-spacing:-.04em;line-height:1.06}
        .account-form>p{margin:0 0 30px;color:var(--color-muted);font-size:1rem;line-height:1.5}
        .account-form label{display:grid;gap:9px;margin-top:18px;color:var(--color-navy);font-size:.9rem;font-weight:750}
        .account-form input{min-height:54px;padding:0 15px;border:1px solid var(--color-line);border-radius:12px;outline:0;color:var(--color-text);background:#fff;font-size:1rem}
        .account-form input:focus{border-color:var(--color-burgundy);box-shadow:0 0 0 4px rgb(119 37 54 / 11%)}
        .account-form button{width:100%;min-height:54px;margin-top:25px;border:0;border-radius:12px;color:#fff;background:var(--color-burgundy);font-size:.96rem;font-weight:800;cursor:pointer}
        .account-form button:hover:not(:disabled){background:var(--color-burgundy-dark);box-shadow:0 12px 28px rgb(119 37 54 / 20%)}
        .account-form button:disabled{cursor:wait;opacity:.68}
        .account-form>a{display:block;margin-top:20px;color:var(--color-burgundy);font-size:.84rem;font-weight:800;text-align:center}
      `}</style>
    </div>
  );
}
