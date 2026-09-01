// ============================================
// Scraper para GitHub Actions
// Revisa los precios de Bershka y Pull & Bear
// Genera deals.json y envia alertas por email
// ============================================

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIG (viene de GitHub Secrets)
// ============================================
const EMAIL = process.env.ALERT_EMAIL || '';
const EMAILJS = {
    service: process.env.EMAILJS_SERVICE_ID || '',
    template: process.env.EMAILJS_TEMPLATE_ID || '',
    key: process.env.EMAILJS_PUBLIC_KEY || '',
};

// URLs de categorias de rebajas a vigilar
const TARGETS = [
    // Bershka - Hombres
    { store: 'bershka', name: 'Bershka Hombre Rebajas', url: 'https://www.bershka.com/es/rebajas-para-hombre-c1010194284.html', category: 'hombres' },
    // Bershka - Mujer
    { store: 'bershka', name: 'Bershka Mujer Rebajas', url: 'https://www.bershka.com/es/rebajas-para-mujer-c1010194283.html', category: 'mujeres' },
    // Bershka - Kids
    { store: 'bershka', name: 'Bershka Kids Rebajas', url: 'https://www.bershka.com/es/rebajas-para-nino-c1010194285.html', category: 'kids' },
    // Pull & Bear - Hombre
    { store: 'pullandbear', name: 'Pull&Bear Hombre Rebajas', url: 'https://www.pullandbear.com/es/hombre/rebajas-c101453.html', category: 'hombres' },
    // Pull & Bear - Mujer
    { store: 'pullandbear', name: 'Pull&Bear Mujer Rebajas', url: 'https://www.pullandbear.com/es/mujer/rebajas-c101487.html', category: 'mujeres' },
    // Pull & Bear - Kids
    { store: 'pullandbear', name: 'Pull&Bear Kids Rebajas', url: 'https://www.pullandbear.com/es/ninos/rebajas-c101501.html', category: 'kids' },
];

// Proxies CORS para poder leer las paginas (el scraping directo esta bloqueado por CORS/CDN)
const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://r.jina.ai/',
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const stateFile = path.join(__dirname, '..', 'deals.json');
const historyFile = path.join(__dirname, '..', 'alert_history.json');

// ============================================
// UTILIDADES
// ============================================
async function fetchWithProxy(url) {
    let lastErr = null;
    for (const proxy of PROXIES) {
        try {
            const res = await axios.get(proxy + encodeURIComponent(url), {
                headers: { 'User-Agent': UA },
                timeout: 20000,
                maxRedirects: 5,
            });
            if (res.data && res.data.length > 500) {
                return res.data;
            }
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Todos los proxies fallaron');
}

function extractPrices(html) {
    // Buscar patrones de precios como:
    // {"price":"29.95","originalPrice":"59.90"} o -50% etc
    const results = { price: null, original: null, discount: null, count: 0 };
    
    // Patron 1: "price":"X","originalPrice":"Y"
    const m1 = html.match(/\{"price"\s*:\s*"([\d.,]+)"\s*,\s*"originalPrice"\s*:\s*"([\d.,]+)"\s*\}/);
    if (m1) {
        results.price = parseFloat(m1[1].replace(',', '.'));
        results.original = parseFloat(m1[2].replace(',', '.'));
        results.discount = Math.round(((results.original - results.price) / results.original) * 100);
        results.count++;
    }

    // Patron 2: data-price="29.95" data-original-price="59.90"
    const m2 = html.match(/data-price="([\d.]+)"[^>]*data-original-price="([\d.]+)"/);
    if (m2 && !m1) {
        results.price = parseFloat(m2[1]);
        results.original = parseFloat(m2[2]);
        results.discount = Math.round(((results.original - results.price) / results.original) * 100);
        results.count++;
    }

    // Patron 3: contar cuantos "discount" o "-xx%" aparecen
    const discountMatches = html.match(/-\d{1,2}%/g) || [];
    
    return { ...results, sampleDiscounts: discountMatches.slice(0, 10) };
}

function loadJson(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {}
    return fallback;
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ============================================
// EMAIL - Enviar alerta (via EmailJS HTTP API)
// ============================================
async function sendEmail(subject, message) {
    if (!EMAILJS.key || !EMAILJS.service || !EMAILJS.template || !EMAIL) {
        console.log('🔕 Email no configurado. Omitiendo envio.');
        return false;
    }
    try {
        // EmailJS v4 REST API
        const res = await axios.post(
            `https://api.emailjs.com/api/v1.0/email/send`,
            {
                service_id: EMAILJS.service,
                template_id: EMAILJS.template,
                user_id: EMAILJS.key,
                template_params: {
                    to_email: EMAIL,
                    subject: subject,
                    message: message,
                },
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
            }
        );
        console.log('📧 Email enviado:', subject);
        return true;
    } catch (e) {
        console.error('⚠️ Error enviando email:', e.message);
        return false;
    }
}

// ============================================
// SCRAPER PRINCIPAL
// ============================================
async function scrapeAll() {
    console.log('🚀 Iniciando scraper...');
    console.log('📅', new Date().toLocaleString('es', { timeZone: 'Europe/Madrid' }));

    const deals = [];
    const activeTargets = [];
    const alerts = [];

    for (const target of TARGETS) {
        console.log(`\n🔍 ${target.name}: ${target.url}`);
        try {
            const html = await fetchWithProxy(target.url);
            const extracted = extractPrices(html);
            console.log('   Precios detectados:', JSON.stringify(extracted));

            if (extracted.price && extracted.discount !== null) {
                deals.push({
                    store: target.store,
                    name: target.name,
                    url: target.url,
                    category: target.category,
                    price: extracted.price,
                    originalPrice: extracted.original,
                    discount: extracted.discount,
                    checkedAt: new Date().toISOString(),
                });
                activeTargets.push(target.name);
            }
        } catch (e) {
            console.log('   ❌ Error scraping:', e.message);
        }
        // Pequeña pausa para no saturar
        await new Promise(r => setTimeout(r, 2000));
    }

    // Cargar estado anterior para detectar cambios
    const prevDeals = loadJson(stateFile, []);

    // Detectar DESCUENTOS 90%+ nuevos
    for (const deal of deals) {
        if (deal.discount >= 90) {
            const wasActive = prevDeals.some(p => p.name === deal.name && p.discount >= 90);
            if (!wasActive) {
                const msg = `🔥🔥 ${deal.name}: ¡¡¡ -${deal.discount}% !!!`;
                console.log('   🚨 NUEVO DESCUENTO 90%+: ' + msg);
                alerts.push({ type: 'discount-90', message: msg, deal });
            }
        }
    }

    // Detectar FIN de rebajas (ofertas que ya no existen)
    for (const prev of prevDeals) {
        if (prev.discount >= 50 && !deals.some(d => d.name === prev.name)) {
            console.log('   ⚠️ Producto ya no en rebajas:', prev.name);
            alerts.push({ type: 'sale-ended', message: `ℹ️ ${prev.name} ya no esta en rebajas`, deal: prev });
        }
    }

    // Guardar estado
    saveJson(stateFile, deals);
    console.log(`\n💾 Guardadas ${deals.length} ofertas en deals.json`);

    // Enviar alertas por email
    for (const alert of alerts) {
        if (alert.deal) {
            const d = alert.deal;
            const subject = alert.type === 'discount-90'
                ? `🔥 ${d.name} -${d.discount}% (¡90%+)!`
                : `ℹ️ ${d.name} fin de rebajas`;
            const body = `${alert.message}\n\nVer oferta: ${d.url}\n\nBershCuentos - Monitor de Promociones`;
            await sendEmail(subject, body);
        }
    }

    // Guardar historial de alertas
    const history = loadJson(historyFile, []);
    alerts.forEach(a => history.unshift({ ...a, time: new Date().toISOString() }));
    saveJson(historyFile, history.slice(0, 100));

    console.log('\n✅ Scraper completado.');
    return { deals, alerts };
}

// ============================================
// RUN
// ============================================
scrapeAll()
    .then(r => {
        console.log(`\n📊 Resumen: ${r.deals.length} ofertas activas, ${r.alerts.length} alertas.`);
    })
    .catch(err => {
        console.error('FATAL:', err);
        process.exit(1);
    });
