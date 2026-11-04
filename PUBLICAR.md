# Publicar COLOR RUSH online (paso a paso)

COLOR RUSH necesita un **servidor Node.js que quede encendido** y mantenga conexiones WebSocket abiertas.
Por eso **no alcanza con una web estática** (GitHub Pages, Netlify estático, etc.).
La forma más simple es **Render**: un solo servicio que corre el servidor del juego *y* sirve la página.

---

## 1. Subir el código a GitHub (una sola vez)

1. Creá una cuenta en https://github.com (si no tenés).
2. Arriba a la derecha: **+ → New repository**. Nombre: `color-rush`. Dejalo **vacío** (sin README) → **Create repository**.
3. Subí los archivos. Tenés dos opciones:

   **Opción A — desde el navegador (sin instalar nada)**
   - En la página del repo nuevo, hacé clic en **uploading an existing file**.
   - Descomprimí `color-rush.zip` y **arrastrá todo el contenido de la carpeta `color-rush`** (no la carpeta en sí) a la página.
   - Abajo: **Commit changes**.

   **Opción B — con la terminal (si tenés Git)**
   ```bash
   cd color-rush
   git init && git add . && git commit -m "COLOR RUSH"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/color-rush.git
   git push -u origin main
   ```

## 2. Publicarlo en Render

1. Entrá a https://render.com y registrate con **Sign in with GitHub**.
2. **New → Blueprint** → elegí el repo `color-rush` → **Apply**.
   (Render lee el archivo `render.yaml` del proyecto y configura todo solo.)
3. Esperá a que termine el *build* (2–4 minutos). Cuando diga **Live**, vas a ver una dirección como
   `https://color-rush-xxxx.onrender.com`.
4. Abrila: ¡ese es tu juego online! Para comprobar que el servidor anda: `https://color-rush-xxxx.onrender.com/health`.

## 3. Jugar con amigos

1. Abrí tu dirección de Render, poné tu nombre y color → **Create room**.
2. En el lobby, tocá **Copy invite link** y mandáselo a tus amigos (o pasales el código de 5 letras).
3. Cuando todos marcan **I'm ready**, el host toca **Start race**. ¡5 minutos de carrera!

## Cosas a tener en cuenta

- **Plan gratuito de Render:** si nadie juega por ~15 minutos, el servidor "se duerme". La primera persona que entra
  después espera ~30–60 segundos a que despierte. Para que esté siempre prendido, cambiá el plan a **Starter** (pago)
  en Render → tu servicio → *Settings* → *Instance Type*.
- **Las salas viven en memoria:** si Render reinicia o volvés a publicar, las salas abiertas se cierran
  (los jugadores simplemente crean una nueva).
- **Actualizar el juego:** cada vez que subís cambios a GitHub, Render vuelve a publicar automáticamente.
- **Probar solo:** en Render → *Environment*, cambiá `MIN_PLAYERS` a `1` para poder correr sin otra persona.

## Alternativas a Render

- **Railway** (https://railway.app): *New Project → Deploy from GitHub repo*. Build: `npm run build`, Start: `npm start`.
- **Fly.io / cualquier VPS con Docker:** el proyecto incluye un `Dockerfile`:
  ```bash
  docker build -t color-rush .
  docker run -p 3001:3001 color-rush
  ```
- **Separado (avanzado):** la página en un hosting estático y el servidor aparte.
  Compilá el cliente con `VITE_SERVER_URL=https://tu-servidor` y arrancá el servidor con `CORS_ORIGIN=https://tu-pagina`.
