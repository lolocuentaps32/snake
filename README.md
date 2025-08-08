# Snake FX — Deploy en Netlify (sin entorno local)

Este repo está listo para que lo subas a GitHub **desde el navegador** y lo conectes a Netlify, que hará el build.

## Pasos rápidos

1. **Crea un repo en GitHub** (público o privado).
2. En el repo → **Add file → Upload files** y arrastra **todo el contenido** de la carpeta (incluidas las carpetas `src/` y `public/`). Puedes arrastrar carpetas completas.
3. Haz **Commit**.
4. Ve a **Netlify → Add new site → Import from Git** y elige tu repo.
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Deploy. Netlify te dará una URL. Puedes cambiar el nombre en *Site settings → Domain management*.

## Scripts

- `npm run build`: compila a producción (Netlify lo ejecuta por ti).
- `npm run dev`: desarrollo local (opcional si no trabajas en local).

## Tecnologías

- React + Vite
- TailwindCSS
- framer-motion, lucide-react
