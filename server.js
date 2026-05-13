const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  origin: [
    'https://hostflo.netlify.app',
    'https://hostitfi.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ]
}));
app.use(express.json());

// Vaihda nämä omiin Stripen Price ID -tunnuksiin.
// Price ID löytyy Stripessä: Product -> Pricing -> Price -> price_...
const PRICE_IDS = {
  base: {
    'hostit-app': 'price_1TWUdoP74prEchKVI0Pg5KE1',
    'hostit-app-laite': 'price_1TWEigP74prEchKVbgtrKxdu',
    'hostit-app-2-laitetta': 'price_1TWF04P74prEchKVX8VIECbb'
  },
  addons: {
    button: 'price_1TWUXHP74prEchKV2Em8P0wY',
    leak: 'price_1TWUXHP74prEchKV2Em8P0wY',
    motion: 'price_1TWUXHP74prEchKV2Em8P0wY',
    wifiThermometer: 'price_1TWUXHP74prEchKV2Em8P0wY',
    smokeWireless: 'price_1TWUXhP74prEchKVEOOcgE2E',
    noise: 'price_1TWUY4P74prEchKVvvtywjsw'
  }
};

const BASE_NAMES = {
  'hostit-app': 'Hostit Software',
  'hostit-app-laite': 'Hostit App + laite',
  'hostit-app-2-laitetta': 'Hostit App + 2 laitetta'
};

app.get('/', (req, res) => {
  res.send('Hostit Stripe backend toimii.');
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { paketti, addons = [] } = req.body;

    if (!paketti || !PRICE_IDS.base[paketti]) {
      return res.status(400).json({ error: 'Tuntematon tai puuttuva pääpaketti.' });
    }

    const line_items = [
      {
        price: PRICE_IDS.base[paketti],
        quantity: 1
      }
    ];

    for (const item of addons) {
      const addonKey = item.addon;
      const quantity = Number(item.quantity || 0);

      if (!addonKey || !PRICE_IDS.addons[addonKey]) {
        return res.status(400).json({ error: `Tuntematon lisälaite: ${addonKey}` });
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return res.status(400).json({ error: `Virheellinen määrä lisälaitteelle: ${addonKey}` });
      }

      line_items.push({
        price: PRICE_IDS.addons[addonKey],
        quantity
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_creation: 'always',
      subscription_data: {
        metadata: {
          package: paketti,
          package_name: BASE_NAMES[paketti],
          addons: JSON.stringify(addons)
        }
      },
      metadata: {
        package: paketti,
        package_name: BASE_NAMES[paketti],
        addons: JSON.stringify(addons)
      },
      success_url: 'https://hostflo.netlify.app/kiitos.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://hostflo.netlify.app/myynti.html'
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    res.status(500).json({ error: error.message || 'Stripe Checkoutin luonti epäonnistui.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hostit Stripe backend käynnissä portissa ${PORT}`);
});
