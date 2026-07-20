import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import {
  cacheEditorUser,
  clearEditorAccessToken,
  getEditorAccessToken,
  setEditorAccessToken,
  shouldRememberEditorSession,
} from '../lib/auth/editor-session';

const sessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string().email(),
    role: z.enum(['ADMIN', 'EDITOR']),
    status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']),
    lastLoginAt: z.string().nullable(),
  }),
});

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

function safeRedirect(): string {
  const requested = new URLSearchParams(window.location.search).get('redirect');

  if (!requested || !requested.startsWith('/') || requested.startsWith('//')) {
    return '/editor';
  }

  return requested;
}

export default function EditorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setRemember(shouldRememberEditorSession());

    if (getEditorAccessToken()) {
      window.location.replace(safeRedirect());
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    if (!email.trim() || !password) {
      setMessageType('error');
      setMessage('Ingresa tu correo y contraseña para continuar.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Las variables públicas de Supabase no están configuradas.');
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.session?.access_token) {
        throw new Error('El correo o la contraseña no son correctos.');
      }

      const session = await apiRequest('/auth/session', sessionSchema, {
        accessToken: data.session.access_token,
      });

      setEditorAccessToken(data.session.access_token, remember);
      cacheEditorUser(session.user, remember);
      setMessageType('success');
      setMessage(`Bienvenido, ${session.user.displayName}.`);
      window.setTimeout(() => window.location.replace(safeRedirect()), 350);
    } catch (error: unknown) {
      clearEditorAccessToken();
      setMessageType('error');
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="editor-login-wrap">
      <form className="editor-login-form" onSubmit={handleSubmit} noValidate>
        <div className="editor-login-form__heading">
          <span>Panel privado</span>
          <h1>Iniciar sesión</h1>
          <p>Ingresa con la cuenta asignada por el administrador del grupo.</p>
        </div>

        <label className="editor-login-field">
          <span>Correo electrónico</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="nombre@correo.com"
            required
          />
        </label>

        <label className="editor-login-field">
          <span>Contraseña</span>
          <div className="editor-login-password">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Ingresa tu contraseña"
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>

        <div className="editor-login-options">
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            <span>Recordar sesión</span>
          </label>
          <a href="/auth/restablecer-contrasena">Recuperar contraseña</a>
        </div>

        <button className="editor-login-submit" type="submit" disabled={loading}>
          {loading ? 'Validando acceso…' : 'Ingresar al panel'}
        </button>

        <p className="editor-login-help">Acceso exclusivo para administradores y editores.</p>
      </form>

      <EditorialLoadingOverlay visible={loading} label="Validando credenciales…" page />
      <EditorialToast
        message={message}
        tone={messageType}
        onClose={() => setMessage('')}
        durationMs={messageType === 'success' ? 1600 : 5200}
      />

      <style>{`
        .editor-login-wrap{position:relative;width:min(100%,480px)}
        .editor-login-form{width:100%;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .editor-login-form__heading>span{color:var(--color-burgundy);font-size:.78rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        .editor-login-form__heading h1{margin:11px 0 9px;color:var(--color-navy);font-family:"Segoe UI","Source Sans 3",Arial,sans-serif;font-size:clamp(2rem,4vw,2.45rem);font-weight:800;letter-spacing:-.04em;line-height:1.06}
        .editor-login-form__heading p{margin:0 0 31px;color:var(--color-muted);font-size:1rem;line-height:1.5}
        .editor-login-field{display:grid;gap:9px;margin-top:18px;color:var(--color-navy);font-size:.9rem;font-weight:750}
        .editor-login-field>input,.editor-login-password{min-height:54px;border:1px solid var(--color-line);border-radius:12px;background:#fff;transition:border-color .15s ease,box-shadow .15s ease}
        .editor-login-field>input{width:100%;padding:0 15px;outline:none;color:var(--color-text);font-size:1rem}
        .editor-login-password{display:flex;align-items:center}
        .editor-login-password input{min-width:0;flex:1;height:52px;padding:0 15px;border:0;outline:0;background:transparent;font-size:1rem}
        .editor-login-password button{min-height:38px;padding:0 15px;border:0;color:var(--color-burgundy);background:transparent;font-size:.79rem;font-weight:800;cursor:pointer}
        .editor-login-field>input:focus,.editor-login-password:focus-within{border-color:var(--color-burgundy);box-shadow:0 0 0 4px rgb(119 37 54 / 11%)}
        .editor-login-options{margin:18px 0 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:.84rem}
        .editor-login-options label{display:inline-flex;align-items:center;gap:9px;color:var(--color-muted);cursor:pointer}
        .editor-login-options input{width:16px;height:16px;accent-color:var(--color-burgundy)}
        .editor-login-options a{color:var(--color-burgundy);font-weight:800}
        .editor-login-submit{width:100%;min-height:54px;border:0;border-radius:12px;color:#fff;background:var(--color-burgundy);font-size:.96rem;font-weight:800;cursor:pointer;transition:transform .15s ease,background-color .15s ease,box-shadow .15s ease}
        .editor-login-submit:hover:not(:disabled){transform:translateY(-1px);background:var(--color-burgundy-dark);box-shadow:0 12px 28px rgb(119 37 54 / 22%)}
        .editor-login-submit:disabled{cursor:wait;opacity:.68}
        .editor-login-help{margin:20px 0 0;color:var(--color-muted);font-size:.8rem;text-align:center}
        @media(max-width:520px){.editor-login-options{align-items:flex-start;flex-direction:column}.editor-login-form__heading p{font-size:.94rem}}
      `}</style>
    </div>
  );
}
