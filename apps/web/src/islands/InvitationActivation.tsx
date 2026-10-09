import type { Session } from '@supabase/supabase-js';
import { getBrowserSupabase } from '../lib/auth/supabase-browser';
import {
  isAuthCallback,
  isInvitationCallback,
  passwordErrorMessage,
} from '../lib/auth/auth-feedback';
import { completeEditorialInvitation } from '../lib/auth/invitation-flow';
import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { clearEditorAccessToken } from '../lib/auth/editor-session';

const activationSchema = z.object({
  user: z.object({ displayName: z.string(), email: z.string().email() }),
});

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export default function InvitationActivation() {
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error' | 'info'>('info');
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      setMessageTone('error');
      setMessage('Las variables públicas de Supabase no están configuradas.');
      setChecking(false);
      return;
    }

    if (!isInvitationCallback(window.location.href)) {
      window.history.replaceState(null, '', window.location.pathname);
      setMessageTone('error');
      setMessage(
        'La invitación no es válida, expiró o ya fue utilizada. Solicita una nueva invitación al administrador.',
      );
      setChecking(false);
      return;
    }
    setRecoveryLink(isAuthCallback(window.location.href, 'recovery'));
    let active = true;
    void Promise.resolve()
      .then(() => getBrowserSupabase().auth.getSession())
      .then(({ data, error }) => {
        if (!active) return;
        window.history.replaceState(null, '', window.location.pathname);
        if (error || !data.session) {
          setMessageTone('error');
          setMessage(
            'La invitación no es válida, expiró o ya fue utilizada. Solicita una nueva invitación al administrador.',
          );
          setChecking(false);
          return;
        }
        setSession(data.session);
        setChecking(false);
      })
      .catch(() => {
        if (!active) return;
        setMessageTone('error');
        setMessage('No fue posible validar la invitación. Solicita un enlace nuevo.');
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await complete(false);
  }

  async function complete(keepPassword: boolean) {
    if (!supabaseUrl || !supabaseAnonKey) {
      setMessageTone('error');
      setMessage('Las variables públicas de Supabase no están configuradas.');
      return;
    }

    if (!session || loading) return;

    if (!passwordSaved && !keepPassword && password.length < 8) {
      setMessageTone('error');
      setMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (!passwordSaved && !keepPassword && password !== confirmation) {
      setMessageTone('error');
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const supabase = getBrowserSupabase();
      const result = await completeEditorialInvitation({
        ...(!passwordSaved && !keepPassword
          ? {
              savePassword: async () => {
                const { data, error } = await supabase.auth.updateUser({ password });
                if (error) throw new Error(passwordErrorMessage(error));
                if (!data.user) throw new Error('No fue posible establecer la contraseña.');
              },
            }
          : {}),
        onPasswordSaved: () => {
          setPasswordSaved(true);
          setPassword('');
          setConfirmation('');
        },
        activate: async () => {
          const current = await supabase.auth.getSession();
          if (current.error || !current.data.session)
            throw new Error('La sesión expiró. Solicita otro enlace al administrador.');
          const activation = await apiRequest('/auth/activate-invitation', activationSchema, {
            method: 'POST',
            accessToken: current.data.session.access_token,
          });
          return activation;
        },
      });
      await supabase.auth.signOut({ scope: 'local' });
      clearEditorAccessToken();
      setSession(null);
      setActivated(true);
      setMessageTone('success');
      setMessage(
        `Cuenta activada, ${result.user.displayName}. Ya puedes iniciar sesión con tu correo y contraseña.`,
      );
    } catch (error: unknown) {
      setMessageTone('error');
      setMessage(
        error instanceof TypeError
          ? 'No se pudo conectar. Revisa tu conexión y reintenta la activación. Si ya guardaste tu contraseña, no necesitas cambiarla otra vez.'
          : error instanceof Error
            ? error.message
            : 'No fue posible activar la cuenta. Solicita ayuda al administrador.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="account-form-wrap">
      <form className="account-form" onSubmit={submit}>
        <span>Invitación</span>
        <h1>Activa tu cuenta</h1>
        <p>
          {activated
            ? 'Tu cuenta está activa. Inicia sesión con el correo invitado y tu contraseña.'
            : passwordSaved
              ? 'Contraseña guardada. Completa la activación editorial.'
              : recoveryLink
                ? 'Completa tu acceso editorial. Puedes conservar tu contraseña actual.'
                : 'Has sido invitado a colaborar en PAG WEB IA. Crea una contraseña para activar tu cuenta y acceder al panel editorial.'}
        </p>
        {session && (
          <>
            {!passwordSaved && (
              <>
                <label>
                  Nueva contraseña
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
            )}
            <button type="submit" disabled={loading}>
              {loading
                ? 'Activando…'
                : passwordSaved
                  ? 'Reintentar activación editorial'
                  : 'Crear contraseña y activar cuenta'}
            </button>
            {recoveryLink && !passwordSaved && (
              <button type="button" disabled={loading} onClick={() => void complete(true)}>
                Completar activación sin cambiar contraseña
              </button>
            )}
          </>
        )}
        <a href="/acceso">{activated ? 'Ir a iniciar sesión' : 'Volver al inicio de sesión'}</a>
      </form>

      <EditorialLoadingOverlay
        visible={checking || loading}
        label={checking ? 'Validando invitación…' : 'Activando cuenta…'}
        page
      />
      <EditorialToast message={message} tone={messageTone} onClose={() => setMessage('')} />

      <style>{`
        .account-form-wrap{position:relative;width:min(100%,480px)}
        .account-form{width:100%;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .account-form>span{color:var(--color-burgundy);font-size:.78rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
        .account-form h1{margin:11px 0 9px;color:var(--color-navy);font-family:"Segoe UI","Source Sans 3",Arial,sans-serif;font-size:clamp(2rem,4vw,2.45rem);font-weight:800;letter-spacing:-.04em;line-height:1.06}
        .account-form>p{margin:0 0 30px;color:var(--color-muted);font-size:1rem;line-height:1.5}
        .account-form label{display:grid;gap:9px;margin-top:18px;color:var(--color-navy);font-size:.9rem;font-weight:750}
        .account-form input{min-height:54px;padding:0 15px;border:1px solid var(--color-line);border-radius:12px;outline:0;color:var(--color-text);font-size:1rem}
        .account-form input:focus{border-color:var(--color-burgundy);box-shadow:0 0 0 4px rgb(119 37 54 / 11%)}
        .account-form button{width:100%;min-height:54px;margin-top:25px;border:0;border-radius:12px;color:#fff;background:var(--color-burgundy);font-size:.96rem;font-weight:800;cursor:pointer}
        .account-form>a{display:block;margin-top:20px;color:var(--color-burgundy);font-size:.84rem;font-weight:800;text-align:center}
      `}</style>
    </div>
  );
}
