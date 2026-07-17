import { useState } from 'react';

const links = [
  ['/', 'Inicio'],
  ['/noticias', 'Noticias'],
  ['/fuentes-academicas', 'Fuentes académicas'],
  ['/grupo', 'El grupo'],
  ['/miembros', 'Miembros'],
  ['/contacto', 'Contacto'],
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Cerrar navegación' : 'Abrir navegación'}
      </button>

      {open && (
        <nav aria-label="Navegación móvil">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
