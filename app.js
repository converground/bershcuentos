// ============================================
// BershCuentos - Monitor de Promociones
// ============================================

// ============================================
// CONFIGURACION (edita estos valores)
// ============================================
const CONFIG = {
    EMAILJS_SERVICE_ID: 'YOUR_SERVICE_ID',
    EMAILJS_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
    EMAILJS_PUBLIC_KEY: 'YOUR_PUBLIC_KEY',
    ALERT_EMAIL: 'tuemail@gmail.com', // Email de destino de las alertas
    CHECK_INTERVAL_MIN: 60, // Chequear cada 60 min (local)
    SCRAPE_INTERVAL: 60, // Minutos entre check de links tracked
    MAX_DISCOUNT_THRESHOLD: 90, // Alerta si descuento >= 90%
};

// URLs de las paginas principales de rebajas
const SALE_URLS = {
    bershka: [
        'https://www.bershka.com/es/rebajas-para-hombre-c1010194284.html',
        'https://www.bershka.com/es/rebajas-para-mujer-c1010194283.html',
    ],
    pullandbear: [
        'https://www.pullandbear.com/es/hombre/rebajas-c101453.html',
        'https://www.pullandbear.com/es/mujer/rebajas-c101487.html',
    ],
};

// Secciones de interes por tienda
const CATEGORIES = {
    bershka: {
        hombres: 'https://www.bershka.com/es/rebajas-para-hombre-c1010194284.html',
        mujeres: 'https://www.bershka.com/es/rebajas-para-mujer-c1010194283.html',
        kids: 'https://www.bershka.com/es/rebajas-para-nino-c1010194285.html',
        accesorios: 'https://www.bershka.com/es/rebajas-accesorios-c1010194252.html',
    },
    pullandbear: {
        hombres: 'https://www.pullandbear.com/es/hombre/rebajas-c101453.html',
        mujeres: 'https://www.pullandbear.com/es/mujer/rebajas-c101487.html',
        kids: 'https://www.pullandbear.com/es/ninos/rebajas-c101501.html',
        accesorios: 'https://www.pullandbear.com/es/accesorios-c101498.html',
    },
};

// Calendario de temporadas de rebajas (aproximado segun patrones Inditex)
const SALES_CALENDAR = [
    { name: 'Winter Sales 2026', start: '2026-01-02', end: '2026-02-15', typically: 'Tambien conocido como Rebajas de Enero', store: 'both' },
    { name: 'Primavera/Verano', start: '2026-03-15', end: '2026-05-15', typically: 'Descuentos progresivos en ropa de temporada', store: 'both' },
    { name: 'Summer Sales 2026', start: '2026-06-24', end: '2026-08-31', typically: 'Rebajas de Verano. Texacos y suenos en Julio', store: 'both' },
    { name: 'Back to School', start: '2026-08-15', end: '2026-09-30', typically: 'Vuelta al cole, descuentos en kids y accesorios', store: 'both' },
    { name: 'Black Friday', start: '2026-11-20', end: '2026-11-30', typically: 'Flash sales y descuentos masivos', store: 'both' },
    { name: 'Winter Sales 2027', start: '2027-01-02', end: '2027-02-15', typically: 'Rebajas de Enero. Los mejores descuentos del ano', store: 'both' },
];

// ============================================
// ESTADO
// ============================================
let state = {
    trackedProducts: [],
    subscribers: [],
    alertHistory: [],
    deals: [],
    lastCheck: null,
};

const STORAGE_KEYS = {
    tracked: 'bershcuentos_tracked',
    subscribers: 'bershcuentos_subs',
    history: 'bershcuentos_history',
    deals: 'bershcuentos_deals',
};

// ============================================
// UTILIDADES
// ============================================
function loadState() {
    try {
        state.trackedProducts = JSON.parse(localStorage.getItem(STORAGE_KEYS.tracked)) || [];
        state.subscribers = JSON.parse(localStorage.getItem(STORAGE_KEYS.subscribers)) || [];
        state.alertHistory = JSON.parse(localStorage.getItem(STORAGE_KEYS.history)) || [];
        state.deals = JSON.parse(localStorage.getItem(STORAGE_KEYS.deals)) || [];
    } catch (e) {
        console.error('Error loading state', e);
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEYS.tracked, JSON.stringify(state.trackedProducts));
    localStorage.setItem(STORAGE_KEYS.subscribers, JSON.stringify(state.subscribers));
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.alertHistory));
    localStorage.setItem(STORAGE_KEYS.deals, JSON.stringify(state.deals));
}

function detectStore(url) {
    if (url.includes('bershka')) return 'bershka';
    if (url.includes('pullandbear')) return 'pullandbear';
    return 'unknown';
}

function detectCategory(url) {
    const lower = url.toLowerCase();
    if (lower.includes('nino') || lower.includes('kids') || lower.includes('ninos')) return 'kids';
    if (lower.includes('accesorio') || lower.includes('accesorios')) return 'accesorios';
    if (lower.includes('mujer') || lower.includes('woman')) return 'mujeres';
    return 'hombres';
}

function discountPercent(original, final) {
    if (!original || !final || original <= 0) return 0;
    return Math.round(((original - final) / original) * 100);
}

function formatEUR(num) {
    return num.toLocaleString('es', { style: 'currency', currency: 'EUR' });
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    return `hace ${Math.floor(hours / 24)}d`;
}

// ============================================
// NOTIFICACIONES / TOASTS
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

// ============================================
// EMAILJS - Notificaciones por email
// ============================================
function initEmailJS() {
    try {
        if (CONFIG.EMAILJS_PUBLIC_KEY && CONFIG.EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
            emailjs.init({ publicKey: CONFIG.EMAILJS_PUBLIC_KEY });
            console.log('EmailJS inicializado');
        } else {
            console.warn('EmailJS no configurado. Las notificaciones por email no funcionaran hasta configurar las claves.');
        }
    } catch (e) {
        console.error('Error init EmailJS', e);
    }
}

async function sendAlertEmail(subject, body, subscriberEmails) {
    if (!CONFIG.EMAILJS_PUBLIC_KEY || CONFIG.EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
        console.log('EmailJS no configurado. Simulando envio de alerta:', subject);
        return { sent: false, simulated: true };
    }

    try {
        const emails = subscriberEmails || state.subscribers.map(s => s.email);
        if (!emails.length) return { sent: false, simulated: true };

        const templateParams = {
            to_email: CONFIG.ALERT_EMAIL || emails[0],
            subject,
            message: body,
            subscribers: emails.join(', '),
        };

        const result = await emailjs.send(
            CONFIG.EMAILJS_SERVICE_ID,
            CONFIG.EMAILJS_TEMPLATE_ID,
            templateParams
        );
        console.log('Email enviado:', result);
        return { sent: true };
    } catch (e) {
        console.error('Error enviando email:', e);
        return { sent: false, error: e };
    }
}

// ============================================
// SCRAPING DE PRECIOS
// ============================================

// NOTA IMPORTANTE: El scraping directo del DOM de las paginas (bershka.com, pullandbear.com)
// esta bloqueado por CORS en navegadores. La solucion es usar un proxy CORS o una API.
// Se implementa deteccion con multiple fallbacks: CORS proxy, servicio de preview, y simulacion.

async function scrapeProduct(url) {
    const store = detectStore(url);
    if (store === 'unknown') {
        return { error: 'URL no reconocida. Solo soportamos Bershka o Pull & Bear.' };
    }

    // Metodo 1: Intentar con CORS proxies publicos
    const proxies = [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/',
    ];

    for (const proxy of proxies) {
        try {
            const response = await fetch(proxy + encodeURIComponent(url), {
                signal: AbortSignal.timeout(10000),
            });
            if (response.ok) {
                const html = await response.text();
                const parsed = parseProductHTML(html, url, store);
                if (parsed && parsed.price) {
                    return parsed;
                }
            }
        } catch (e) {
            // Intenta con otro proxy
        }
    }

    // Metodo 2: Si no se pudo obtener el precio real, devolver estado desconocido
    // (El GitHub Action se encarga del scraping real y actualiza deals.json)
    return {
        url,
        store,
        name: getProductNameFromUrl(url),
        price: null,
        originalPrice: null,
        discount: null,
        category: detectCategory(url),
        status: 'unknown',
        checkedAt: new Date().toISOString(),
    };
}

function getProductNameFromUrl(url) {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        if (last.endsWith('.html')) {
            return last.replace('.html', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        return url.replace(/^https?:\/\//, '').slice(0, 60);
    } catch {
        return url.slice(0, 60);
    }
}

function parseProductHTML(html, url, store) {
    // Intentar extraer precios de JSON-LD (schema.org)
    const jsonLdRegex = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            const offers = data.offers || (data.offers && data.offers[0]);
            if (offers && offers.price) {
                let price = parseFloat(offers.price);
                let originalPrice = price;
                if (offers.highPrice) originalPrice = parseFloat(offers.highPrice);
                if (offers.lowPrice && offers.lowPrice > price) originalPrice = parseFloat(offers.lowPrice);
                const discount = discountPercent(originalPrice, price);
                return {
                    url,
                    store,
                    name: data.name || getProductNameFromUrl(url),
                    price,
                    originalPrice: originalPrice > price ? originalPrice : null,
                    discount,
                    category: detectCategory(url),
                    status: 'active',
                    checkedAt: new Date().toISOString(),
                };
            }
        } catch (e) {}
    }

    // Intentar con meta og:price
    const ogPrice = html.match(/property="product:price:amount"\s+content="([\d.]+)"/i) ||
                    html.match(/"price":\s*"([\d.]+)"/);
    const ogName = html.match(/property="og:title"\s+content="([^"]+)"/i);

    if (ogPrice) {
        const price = parseFloat(ogPrice[1]);
        return {
            url,
            store,
            name: ogName ? ogName[1] : getProductNameFromUrl(url),
            price,
            originalPrice: null,
            discount: 0,
            category: detectCategory(url),
            status: 'active',
            checkedAt: new Date().toISOString(),
        };
    }

    return null;
}

// ============================================
// CHECK DE REBAJAS ACTIVAS
// ============================================

async function checkActiveSales() {
    const now = new Date();
    const status = {
        bershka: 'no-data',
        pnb: 'no-data',
    };

    // Determinar fase actual segun calendario
    const currentPhase = getCurrentPhase();
    if (currentPhase) {
        status.bershka = currentPhase.store === 'both' ? 'active' : 'no-data';
        status.pnb = currentPhase.store === 'both' ? 'active' : 'no-data';
    }

    // Actualizar stats
    document.getElementById('bershka-status').textContent = status.bershka === 'active' ? 'En rebajas' : 'Verificando';
    document.getElementById('pnb-status').textContent = status.pnb === 'active' ? 'En rebajas' : 'Verificando';

    // Calcular tiempo hasta proximas rebajas
    updateNextSaleCountdown();

    return { bershka: status.bershka, pnb: status.pnb };
}

function getCurrentPhase() {
    const today = new Date().toISOString().slice(0, 10);
    for (const sale of SALES_CALENDAR) {
        if (today >= sale.start && today <= sale.end) {
            return { ...sale, status: 'active' };
        }
    }
    // Buscar proxima
    const upcoming = SALES_CALENDAR.find(s => s.start > today);
    return upcoming ? { ...upcoming, status: 'upcoming' } : null;
}

function updateNextSaleCountdown() {
    const current = getCurrentPhase();
    const el = document.getElementById('next-sale');
    if (!current) {
        el.textContent = '--';
        return;
    }
    if (current.status === 'active') {
        el.textContent = `${current.name} activa`;
        el.style.color = 'var(--green)';
    } else {
        const diff = Math.ceil((new Date(current.start) - new Date()) / 86400000);
        el.textContent = `${current.name} en ${diff}d`;
        el.style.color = 'var(--yellow)';
        // Alerta de aviso cuando faltan pocos dias
        if (diff <= 3 && diff > 0) {
            notifyUpcomingSale(current, diff);
        }
    }
}

let lastSaleNotified = {};
function notifyUpcomingSale(sale, days) {
    if (lastSaleNotified[sale.name] === days) return;
    lastSaleNotified[sale.name] = days;
    showToast(`\u26A0\uFE0F ${sale.name} empieza en ${days} dia(s)!`, 'info');
    sendAlertEmail(
        `\uD83D\uDD25 ${sale.name} empieza en ${days} dias!`,
        `Las rebajas "${sale.name}" (${sale.start} - ${sale.end}) empiezan en ${days} dias.\n\nPrepárate para cazar las mejores ofertas!`
    ).then(() => {});
}

// ============================================
// RENDER: Renders de UI
// ============================================

function renderDashboard() {
    renderStats();
    renderDeals();
    renderPhases();
}

function renderStats() {
    // Los stats se actualizan en checkActiveSales
}

function renderDeals() {
    const container = document.getElementById('active-deals');
    if (!state.deals.length) {
        container.innerHTML = `
            <div class="loading-state">
                <p>\uD83E\uDD1D Verificando ofertas...</p>
                <p style="margin-top:8px; font-size:13px;">Las ofertas detectadas por el bot apareceran aqui</p>
            </div>`;
        return;
    }

    container.innerHTML = state.deals.map(deal => `
        <div class="deal-card">
            <span class="deal-badge ${deal.discount >= 90 ? 'hot' : deal.discount >= 50 ? 'warm' : 'new'}">
                ${deal.discount >= 90 ? '90%+' : deal.discount >= 50 ? `-${deal.discount}%` : 'Nuevo'}
            </span>
            <div class="deal-store ${deal.store}">${deal.store === 'bershka' ? 'Bershka' : 'Pull & Bear'}</div>
            <div class="deal-title">${esc(deal.name)}</div>
            <div class="deal-discount">-${deal.discount}%</div>
            <div class="deal-prices">
                ${deal.originalPrice ? `<span class="deal-original">${formatEUR(deal.originalPrice)}</span>` : ''}
                <span class="deal-final">${formatEUR(deal.price)}</span>
            </div>
            <span class="deal-category">${esc(deal.category)}</span>
            <div class="deal-time">Detectado ${timeAgo(deal.checkedAt)}</div>
        </div>
    `).join('');
}

function renderPhases() {
    const container = document.getElementById('season-status');
    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = SALES_CALENDAR.map(sale => {
        let status = 'past';
        let statusLabel = 'Pasada';
        if (today >= sale.start && today <= sale.end) {
            status = 'active';
            statusLabel = 'ACTIVA';
        } else if (today < sale.start) {
            const diff = Math.ceil((new Date(sale.start) - new Date()) / 86400000);
            status = diff <= 3 ? 'ending' : 'upcoming';
            statusLabel = diff <= 3 ? `Empieza en ${diff}d` : `En ${diff} dias`;
        }
        return `
            <div class="phase-card ${status}">
                <div class="phase-name">${sale.name}</div>
                <div class="phase-dates">${formatDate(sale.start)} - ${formatDate(sale.end)}</div>
                <span class="phase-status ${status}">${statusLabel}</span>
                <div class="calendar-typically" style="margin-top:10px;"><strong>Info:</strong> ${sale.typically}</div>
            </div>`;
    }).join('');
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTracked() {
    const container = document.getElementById('tracked-products');
    if (!state.trackedProducts.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">\uD83D\uDCC1</div>
                <p>No tienes productos monitoreados.</p>
                <p style="margin-top:8px; font-size:13px;">Pega un link de Bershka o Pull & Bear arriba para empezar a rastrear su precio.</p>
            </div>`;
        return;
    }

    container.innerHTML = state.trackedProducts.map((p, idx) => `
        <div class="tracked-item" data-idx="${idx}">
            <div class="tracked-store ${p.store}" title="${p.store}">
                ${p.store === 'bershka' ? 'B' : 'P'}
            </div>
            <div class="tracked-info">
                <div class="tracked-name">${esc(p.name || getProductNameFromUrl(p.url))}</div>
                <div class="tracked-url">${esc(p.url)}</div>
                <div style="display:flex; gap:8px; margin-top:6px; flex-wrap:wrap;">
                    <span class="deal-category">${esc(p.category || 'all')}</span>
                    ${p.discount >= 90 ? '<span class="deal-badge hot" style="position:static; display:inline-block;">90%+</span>' : ''}
                </div>
            </div>
            <div class="tracked-meta">
                <div class="tracked-price">
                    ${p.price ? `<div class="current">${formatEUR(p.price)}</div>` : `<div class="current" style="color:var(--text-muted);">Sin datos</div>`}
                    ${p.originalPrice ? `<div class="original">${formatEUR(p.originalPrice)}</div>` : ''}
                    ${p.checkedAt ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${timeAgo(p.checkedAt)}</div>` : ''}
                </div>
                <div class="tracked-actions">
                    <a href="${esc(p.url)}" target="_blank" rel="noopener" class="btn-secondary">Ver</a>
                    <button class="btn-danger" onclick="removeTracked(${idx})">Eliminar</button>
                </div>
            </div>
        </div>
    `).join('');
}

function renderAlertsHistory() {
    const container = document.getElementById('alerts-list');
    if (!state.alertHistory.length) {
        container.innerHTML = `
            <div class="empty-state" style="padding:30px;">
                <p>No hay alertas recientes.</p>
            </div>`;
        return;
    }
    container.innerHTML = state.alertHistory.slice(0, 20).map(a => `
        <div class="alert-item">
            <span class="alert-icon">${a.icon || '🔔'}</span>
            <div class="alert-text">${esc(a.message)}</div>
            <span class="alert-time">${timeAgo(a.time)}</span>
        </div>
    `).join('');
}

function renderCalendar() {
    const container = document.getElementById('calendar-grid');
    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = SALES_CALENDAR.map(sale => {
        let cls = 'past';
        let badge = '';
        if (today >= sale.start && today <= sale.end) {
            cls = 'current';
            badge = '<span class="phase-status active">ACTIVA</span>';
        } else if (today < sale.start) {
            cls = 'next';
            badge = '<span class="phase-status upcoming">Próxima</span>';
        }
        return `
            <div class="calendar-card ${cls}">
                ${badge}
                <div class="calendar-month">${new Date(sale.start + 'T00:00:00').toLocaleDateString('es', { month: 'long', year: 'numeric' })}</div>
                <div class="calendar-title">${sale.name}</div>
                <div class="calendar-dates">${formatDate(sale.start)} - ${formatDate(sale.end)}</div>
                <div class="calendar-typically"><strong>Info:</strong> ${sale.typically}</div>
            </div>`;
    }).join('');
}

// ============================================
// FUNCIONES DE ACCION
// ============================================

async function addTrackedProduct() {
    const urlInput = document.getElementById('product-url');
    const storeSelect = document.getElementById('product-store');
    const categorySelect = document.getElementById('product-category');

    let url = urlInput.value.trim();
    if (!url) {
        showToast('Pega un link de un producto primero', 'error');
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }

    const detectedStore = detectStore(url);
    if (detectedStore === 'unknown') {
        showToast('URL no reconocida. Solo Bershka o Pull & Bear.', 'error');
        return;
    }

    const store = storeSelect.value === 'auto' ? detectedStore : storeSelect.value;
    const category = categorySelect.value === 'all' ? detectCategory(url) : categorySelect.value;

    // Evitar duplicados
    if (state.trackedProducts.some(p => p.url === url)) {
        showToast('Ese producto ya esta en tu lista', 'info');
        return;
    }

    const product = {
        url,
        store,
        category,
        name: getProductNameFromUrl(url),
        price: null,
        originalPrice: null,
        discount: 0,
        notifyStart: document.getElementById('notify-start').checked,
        notifyEnding: document.getElementById('notify-ending').checked,
        notify90: document.getElementById('notify-90').checked,
        addedAt: new Date().toISOString(),
        checkedAt: null,
        status: 'tracking',
    };

    state.trackedProducts.push(product);
    saveState();
    renderTracked();
    urlInput.value = '';
    showToast('Producto agregado al monitoreo', 'success');

    // Intento inicial de ver el precio
    showToast('Verificando precio inicial...', 'info');
    await checkTrackedProduct(product);
}

function removeTracked(idx) {
    state.trackedProducts.splice(idx, 1);
    saveState();
    renderTracked();
    showToast('Producto eliminado', 'success');
}

async function checkTrackedProduct(product) {
    try {
        const result = await scrapeProduct(product.url);
        if (result && !result.error) {
            const prevPrice = product.price;
            const prevDiscount = product.discount;

            product.price = result.price;
            product.originalPrice = result.originalPrice;
            product.discount = result.discount || 0;
            product.name = result.name || product.name;
            product.checkedAt = new Date().toISOString();
            product.status = result.status || 'tracking';

            if (result.price) {
                // Detectar minus de precio grande
                if (prevPrice && result.price < prevPrice) {
                    const changePct = Math.round(((prevPrice - result.price) / prevPrice) * 100);
                    if (changePct >= 20) {
                        const msg = `${product.store} - ${product.name}: -${changePct}% de golpe! ${formatEUR(prevPrice)} → ${formatEUR(result.price)}`;
                        addAlert('📉', msg, 'price-drop');
                        sendAlertEmail('📉 BAJADA DE PRECIO! ' + product.name, msg);
                    }
                }
                // Detectar 90%+
                if (result.discount >= CONFIG.MAX_DISCOUNT_THRESHOLD && product.notify90) {
                    const msg = `🔥 ${product.store} - ${product.name}: -${result.discount}% (${formatEUR(result.originalPrice || 0)} → ${formatEUR(result.price)})`;
                    addAlert('🔥', msg, 'discount-90');
                    sendAlertEmail('🔥 DESCUENTO 90%+! ' + product.name, msg);
                }
            }

            saveState();
        }
    } catch (e) {
        console.error('Error checking product', e);
    }
    renderTracked();
    renderDeals();
}

async function checkAllTracked() {
    for (const product of state.trackedProducts) {
        await checkTrackedProduct(product);
        await sleep(1500);
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================
// ALERTAS
// ============================================

function addAlert(icon, message, type) {
    state.alertHistory.unshift({ icon, message, type, time: new Date().toISOString() });
    if (state.alertHistory.length > 50) state.alertHistory = state.alertHistory.slice(0, 50);
    saveState();
    renderAlertsHistory();
    updateDealsFromTracked();
}

function updateDealsFromTracked() {
    // Identificar productos con 90%+ y mostrarlos en el dashboard
    const deals = state.trackedProducts
        .filter(p => p.discount >= 50 && p.price)
        .map(p => ({
            name: p.name,
            store: p.store,
            category: p.category,
            price: p.price,
            originalPrice: p.originalPrice,
            discount: p.discount,
            checkedAt: p.checkedAt,
            url: p.url,
        }));
    if (deals.length) {
        state.deals = deals;
        saveState();
        renderDeals();
        document.getElementById('deals-count').textContent = deals.filter(d => d.discount >= 90).length;
    }
}

// ============================================
// FORMULARIO DE SUSCRIPCION (EmailJS)
// ============================================

document.getElementById('alert-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('alert-email').value.trim();
    const name = document.getElementById('alert-name').value.trim();

    if (!email || !name) {
        showToast('Completa tu email y nombre', 'error');
        return;
    }

    const subscriber = {
        name,
        email,
        stores: {
            bershka: document.getElementById('sub-bershka').checked,
            pullandbear: document.getElementById('sub-pnb').checked,
        },
        sections: {
            hombres: document.getElementById('sub-hombres').checked,
            mujeres: document.getElementById('sub-mujeres').checked,
            kids: document.getElementById('sub-kids').checked,
            accesorios: document.getElementById('sub-accesorios').checked,
        },
        alertTypes: {
            start: document.getElementById('alert-type-start').checked,
            ending: document.getElementById('alert-type-ending').checked,
            discount90: document.getElementById('alert-type-90').checked,
            flash: document.getElementById('alert-type-flash').checked,
        },
        createdAt: new Date().toISOString(),
    };

    // Guardar suscriptor
    const existing = state.subscribers.find(s => s.email === email);
    if (existing) {
        Object.assign(existing, subscriber);
        showToast('Suscripción actualizada', 'success');
    } else {
        state.subscribers.push(subscriber);
        showToast('¡Te has suscrito correctamente!', 'success');
    }
    saveState();

    // Enviar email de confirmacion via EmailJS
    if (CONFIG.EMAILJS_PUBLIC_KEY && CONFIG.EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
        try {
            await emailjs.send(
                CONFIG.EMAILJS_SERVICE_ID,
                CONFIG.EMAILJS_TEMPLATE_ID,
                {
                    to_email: email,
                    name: name,
                    subject: '✅ BershCuentos - Suscripción activada',
                    message: `¡Hola ${name}!\n\nTu suscripción a BershCuentos está activa.\nTe avisaremos cuando detectemos ofertas brutales en Bershka y Pull & Bear.\n\n¡A cazar descuentos!`,
                }
            );
        } catch (err) {
            console.error('Error enviando confirmacion', err);
        }
    }

    this.reset();
});

// ============================================
// NAVEGACION
// ============================================
function setupNav() {
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('href').slice(1);
            document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(target).classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// ============================================
// CHECK AUTOMATICO PERIODICO
// ============================================
function startAutoCheck() {
    checkActiveSales();
    checkAllTracked();

    setInterval(() => {
        checkActiveSales();
    }, 5 * 60 * 1000); // Check de rebajas cada 5 min

    setInterval(() => {
        checkAllTracked();
    }, CONFIG.SCRAPE_INTERVAL * 60 * 1000); // Check de productos tracked
}

// ============================================
// INIT APP
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initEmailJS();
    setupNav();

    document.getElementById('add-product-btn').addEventListener('click', addTrackedProduct);
    document.getElementById('product-url').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTrackedProduct();
    });

    renderDashboard();
    renderTracked();
    renderAlertsHistory();
    renderCalendar();
    updateDealsFromTracked();
    document.getElementById('deals-count').textContent = state.deals.filter(d => d.discount >= 90).length;

    startAutoCheck();
});
