// api/create-pix.js
// Vercel Serverless Function — cria cobrança PIX no PagBank

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const { guia, customer, address, utm } = req.body;

  // ── Catálogo de produtos (valor em centavos) ──────────────────
  const products = {
    TIRAR:       { title: 'Título de Eleitor — Primeira Via',  amount: 3684 },
    REGULARIZAR: { title: 'Título de Eleitor — Regularização', amount: 3684 },
  };
  const prod = products[(guia || 'TIRAR').toUpperCase()] || products.TIRAR;

  // ── Extrai estado do campo "Cidade / UF" ─────────────────────
  const cityRaw  = address?.city || '';
  const parts    = cityRaw.split('/');
  const cityName = parts[0].trim();
  const stateUF  = (parts[1] || '').trim().toUpperCase().slice(0, 2);

  // ── Parse do telefone: extrai DDD + número ────────────────────
  const rawPhone  = (customer.phone || '').replace(/\D/g, '');
  const phoneArea = rawPhone.slice(0, 2);
  const phoneNum  = rawPhone.slice(2);

  // ── Expiration: 30 minutos a partir de agora ──────────────────
  const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // ── Monta shipping apenas se tiver CEP e estado válido ────────
  const hasShipping = address?.cep && stateUF.length === 2;
  const shipping = hasShipping ? {
    address: {
      street:      address.street       || '',
      number:      address.number       || '',
      complement:  address.complement   || '',
      locality:    address.neighborhood || '',   // bairro
      city:        cityName             || '',
      region_code: stateUF,                      // ex: "SP"
      country:     'BRA',
      postal_code: address.cep.replace(/\D/g, ''),
    },
  } : undefined;

  // ── Referência única para rastreamento ────────────────────────
  const referenceId = `${(guia || 'TIRAR').toUpperCase()}-${Date.now()}`;

  // ── Monta body ────────────────────────────────────────────────
  const body = {
    reference_id: referenceId,
    customer: {
      name:   customer.name,
      email:  customer.email,
      tax_id: (customer.cpf || '').replace(/\D/g, ''),
      phones: [
        {
          country: '55',
          area:    phoneArea,
          number:  phoneNum,
          type:    'MOBILE',
        },
      ],
    },
    items: [
      {
        reference_id: referenceId,
        name:         prod.title,
        quantity:     1,
        unit_amount:  prod.amount,
      },
    ],
    qr_codes: [
      {
        amount: {
          value: prod.amount,
        },
        expiration_date: expiration,
      },
    ],
    ...(shipping ? { shipping } : {}),
    ...(process.env.POSTBACK_URL
      ? { notification_urls: [process.env.POSTBACK_URL] }
      : {}),
  };

  // ── Chama PagBank ─────────────────────────────────────────────
  try {
    const pbRes = await fetch('https://api.pagseguro.com/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.PAGBANK_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await pbRes.json();

    if (!pbRes.ok) {
      console.error('[create-pix] PagBank error:', JSON.stringify(data));
      return res.status(400).json({ message: data.error_messages?.[0]?.description || 'Erro ao gerar PIX' });
    }

    const qrCode = data.qr_codes?.[0];
    if (!qrCode?.text) {
      return res.status(500).json({ message: 'PIX não retornado pelo gateway' });
    }

    // Busca URL da imagem PNG do QR Code nos links
    const qrImageLink = qrCode.links?.find(l => l.rel === 'QRCODE.PNG')?.href || null;

    return res.status(200).json({
      saleId: data.id,              // ex: "ORDE_xxxx-xxxx"
      pix: {
        key:          qrCode.text,  // código copia-e-cola
        qrCodeUrl:    qrImageLink,  // URL da imagem PNG (buscar no frontend se precisar)
      },
    });

  } catch (err) {
    console.error('[create-pix] fetch error:', err);
    return res.status(500).json({ message: 'Erro interno. Tente novamente.' });
  }
}
