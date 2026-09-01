# BershCuentos 🔥

Monitor de promociones en tiempo real para **Bershka** y **Pull & Bear**.

Encuentra las mejores ofertas (incluyendo descuentos de **+90%**) antes que nadie, y recibe notificaciones por email cuando empiecen o terminen las temporadas de rebajas.

---

## 🚀 Cómo desplegar en GitHub Pages (gratis)

### 1. Sube el proyecto a GitHub
1. Crea un repositorio nuevo en GitHub (ej: `bershcuentos`)
2. Sube todos los archivos de esta carpeta

### 2. Activa GitHub Pages
1. En tu repo, ve a **Settings → Pages**
2. En **Build and deployment**, selecciona:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / carpeta `/ (root)`
3. Guarda. Tu página estará en: `https://tusuario.github.io/bershcuentos`

---

## 📧 Configurar notificaciones por email (gratis)

### Opción A: EmailJS (recomendado, gratis - 200 emails/mes)
1. Crea una cuenta gratis en [emailjs.com](https://www.emailjs.com)
2. **Email Services** → Conecta Gmail u otro proveedor
   - Copia el **Service ID**
3. **Email Templates** → Crea un template:
   - Variable `subject` → asunto
   - Variable `message` → contenido
   - Variable `to_email` → destinatario
   - Copia el **Template ID**
4. **Account** → copia tu **Public Key**
5. Configura los valores en `app.js`:
   ```js
   const CONFIG = {
       EMAILJS_SERVICE_ID: 'TU_SERVICE_ID',
       EMAILJS_TEMPLATE_ID: 'TU_TEMPLATE_ID',
       EMAILJS_PUBLIC_KEY: 'TU_PUBLIC_KEY',
       ALERT_EMAIL: 'tuemail@gmail.com', // donde recibir las alertas
   };
   ```

### Opción B: GitHub Actions (scraper automático cada 30 min)
1. Ve a tu repo en GitHub
2. **Settings → Secrets and variables → Actions → New repository secret**
   - `ALERT_EMAIL` → tu email donde recibir alertas
   - `EMAILJS_SERVICE_ID` → de emailjs
   - `EMAILJS_TEMPLATE_ID` → de emailjs
   - `EMAILJS_PUBLIC_KEY` → de emailjs
3. El workflow `.github/workflows/scraper.yml` ya está configurado para:
   - Revisar las páginas de rebajas de Bershka y Pull & Bear **cada 30 minutos**
   - Detectar descuentos **+90%** y **envíarte un email** automáticamente
   - Detectar cuándo **empiezan y terminan** las temporadas de rebajas
   - Generar `deals.json` que alimenta tu página

> 💡 Para que funcione el envío de alertas automático del scraper, necesitas configurar **EmailJS + los secrets** de GitHub. Sin esto, el scraper aún genera los datos de `deals.json`, pero no envía correos.

---

## 🎯 Cómo usar la página

### Monitorear un producto por link
1. En la pestaña **Mis Links**
2. Pega un link de un producto de Bershka o Pull & Bear
   - Ej: `https://www.bershka.com/es/...`
3. Elige sección (Hombres, Mujeres, etc.)
4. Activa las notificaciones que quieras
5. Click en **Agregar**

La página revisará el precio periódicamente y te avisará cuando:
- 📉 **Baje de precio** más de 20% de golpe
- 🔥 **Supere 90% de descuento**
- ⏰ Cuando empiecen/terminen las rebajas

### Calendario de rebajas
La pestaña **Calendario** te muestra las temporadas de rebajas conocidas de Inditex:
- Rebajas de Enero (Winter Sales)
- Rebajas de Verano
- Black Friday
- Vuelta al cole

---

## ⚠️ Notas importantes

- **Bershka y Pull & Bear bloquean el scraping directo** (CORS). La página usa proxies CORS y el bot de GitHub Actions para obtener datos. A veces el precio no se detecta automáticamente; en ese caso el bot se encarga de identificarlo.
- Este sitio es una **herramienta independiente**, no está afiliado con Bershka ni Pull & Bear.
- Los emails a través de EmailJS son **gratis hasta 200/mes** (suficiente para alertas de rebajas).

---

## 📁 Estructura del proyecto

```
bershcuentos/
├── index.html          # Dashboard principal
├── styles.css          # Estilos
├── app.js              # Lógica del frontend
├── deals.json          # Ofertas detectadas por el bot
├── alert_history.json  # Historial de alertas
├── scraper/
│   └── index.js        # Bot de scraping (GitHub Actions)
├── .github/
│   └── workflows/
│       └── scraper.yml # Automatización cada 30 min
└── package.json
```

---

Hecho con ❤️ para cazar descuentos brutales.
