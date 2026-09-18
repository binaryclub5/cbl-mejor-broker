// api/naga-postback.js
//
// Postback S2S de NAGA para el tráfico del QUIZ (comparadorbrokerslatam.vercel.app).
// Busca el click_id en la tabla cbl_quiz_leads de Supabase y dispara el evento
// correspondiente a Meta Conversions API.
//
// URL resultante una vez desplegado:
//   https://comparadorbrokerslatam.vercel.app/api/naga-postback?click_id={click_id}&event={event_type}&amount={amount}
//
// ⚠️ REVISAR antes de dar por bueno:
// - Este archivo asume que vas a crear dos variables de entorno en Vercel
//   (Project Settings → Environment Variables): META_PIXEL_ID y
//   META_CAPI_ACCESS_TOKEN. Sin esas dos, la función responde pero no llega
//   a enviar nada a Meta.
// - El mapeo de nombres de evento (EVENT_MAP) usa los mismos supuestos que
//   la versión de Base44; ajústalo si NAGA confirma otros nombres.

const SUPABASE_URL = "https://xhpxzhcnbazwdvmgnrcu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocHh6aGNuYmF6d2R2bWducmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTEwNjAsImV4cCI6MjEwMjY2NzA2MH0.YJNl3mknKA_MYkrYE3g_5TpiT6FkPIx-v-Ce8G5ny2E";

const EVENT_MAP = {
  registration: "CompleteRegistration",
  demo_registration: "CompleteRegistration",
  live_account: "SubmitApplication",
  ftd: "Purchase",
  deposit: "Purchase",
};

async function lookupLead(clickId) {
  const url = `${SUPABASE_URL}/rest/v1/cbl_quiz_leads?id=eq.${encodeURIComponent(
    clickId
  )}&select=fbp,fbc,user_agent`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

async function sendToMetaCapi({ eventName, clickId, lead, amount, currency, requestIp }) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) {
    throw new Error(
      "Faltan las variables de entorno META_PIXEL_ID y/o META_CAPI_ACCESS_TOKEN en Vercel."
    );
  }

  const userData = {};
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  if (requestIp) userData.client_ip_address = requestIp;
  if (lead.user_agent) userData.client_user_agent = lead.user_agent;

  const customData = {};
  if (amount) {
    customData.value = parseFloat(amount);
    customData.currency = currency || "USD";
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: clickId,
        action_source: "website",
        user_data: userData,
        custom_data: Object.keys(customData).length ? customData : undefined,
      },
    ],
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Meta CAPI error: ${JSON.stringify(body)}`);
  return body;
}

module.exports = async (req, res) => {
  try {
    const { click_id, event, amount, currency } = req.query;

    if (!click_id) {
      res.status(400).json({ error: "Falta click_id" });
      return;
    }

    const eventName = EVENT_MAP[event] || "Purchase"; // sin "event" -> asumimos FTD

    const lead = await lookupLead(click_id);

    if (!lead) {
      console.warn(`click_id ${click_id} no encontrado en cbl_quiz_leads`);
      res.status(200).json({ received: true, matched: false, click_id });
      return;
    }

    const requestIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null;

    const metaResult = await sendToMetaCapi({
      eventName,
      clickId: click_id,
      lead,
      amount,
      currency,
      requestIp,
    });

    res.status(200).json({
      received: true,
      matched: true,
      source: "quiz",
      event_sent: eventName,
      meta_result: metaResult,
    });
  } catch (error) {
    console.error("Error en naga-postback (quiz):", error);
    // 200 igual, para que NAGA no reintente agresivamente; el detalle queda en los logs.
    res.status(200).json({ received: true, error: String(error) });
  }
};
