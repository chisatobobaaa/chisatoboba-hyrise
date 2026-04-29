// api/deliver.js — Vercel Serverless Function
// Dipanggil dari admin panel saat klik "Kirim Manual"
// Tugasnya: jalankan perintah RCON ke server Minecraft + kirim email ke customer

const { Rcon } = require('rcon-client');
const fetch = require('node-fetch');

// ── Konfigurasi ──────────────────────────────────────────────
const RCON_HOST     = 'furina.nexuscloud.id';
const RCON_PORT     = 25575;
const RCON_PASSWORD = 'kocheng';

const EMAILJS_SERVICE_ID  = 'service_3xn0y64';
const EMAILJS_TEMPLATE_ID = 'template_43hu2ie';
const EMAILJS_PUBLIC_KEY  = '7OczNbLOy-JVZic5a';
// ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { commands, order } = req.body;
  if (!commands || !Array.isArray(commands) || commands.length === 0) {
    return res.status(400).json({ error: 'commands array wajib diisi' });
  }

  const results = [];

  // ── 1. Jalankan perintah RCON ────────────────────────────
  try {
    const rcon = new Rcon({
      host: RCON_HOST,
      port: RCON_PORT,
      password: RCON_PASSWORD,
      timeout: 5000,
    });

    await rcon.connect();

    for (const cmd of commands) {
      try {
        const response = await rcon.send(cmd);
        results.push({ cmd, response, ok: true });
      } catch (cmdErr) {
        results.push({ cmd, response: cmdErr.message, ok: false });
      }
    }

    await rcon.end();
  } catch (rconErr) {
    // RCON gagal tapi tetap lanjut kirim email
    console.error('[RCON] Koneksi gagal:', rconErr.message);
    results.push({ cmd: 'RCON_CONNECT', response: rconErr.message, ok: false });
  }

  // ── 2. Kirim email ke customer via EmailJS ───────────────
  let emailSent = false;
  if (order && order.email) {
    try {
      const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
          user_id:     EMAILJS_PUBLIC_KEY,
          template_params: {
            to_email:    order.email,
            to_name:     order.username,
            order_id:    order.order_id || order.id,
            mc_username: order.username,
            item_list:   Array.isArray(order.items) ? order.items.join(', ') : '-',
            total:       'Rp ' + Number(order.total).toLocaleString('id-ID'),
            payment:     order.payment || '-',
            date:        order.dateStr || new Date().toLocaleString('id-ID'),
            server_ip:   'furina.nexuscloud.id',
            server_name: 'Hyrise SMP',
            discord_url: 'discord.gg/hyrisesmp',
            from_name:   'Hyrise SMP',
          }
        })
      });
      emailSent = emailRes.status === 200;
    } catch (emailErr) {
      console.error('[EmailJS] Gagal kirim:', emailErr.message);
    }
  }

  return res.status(200).json({
    success: true,
    rcon: results,
    emailSent,
  });
};
