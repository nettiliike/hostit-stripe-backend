const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const admin = require("firebase-admin");

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let firestore = null;
function initFirebaseAdmin() {
  if (firestore) return firestore;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_JSON puuttuu. Maksut eivät tallennu Firestoreen.");
    return null;
  }
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  firestore = admin.firestore();
  return firestore;
}

const prices = {
  "hostit-app-laite": {
    priceId: "price_1TWEigP74prEchKVbgtrKxdu",
    name: "Hostit App + laite"
  },
  "hostit-app-2-laitetta": {
    priceId: "price_1TWF04P74prEchKVX8VIECbb",
    name: "Hostit App + 2 laitetta"
  }
};

const SITE_URL = process.env.SITE_URL || "https://hostitfi.netlify.app";

app.use(cors());
app.use(express.json());

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function upsertSubscription({ email, packageKey, packageName, customerId, subscriptionId, status, source }) {
  const db = initFirebaseAdmin();
  if (!db || !email) return;
  const normalizedEmail = normalizeEmail(email);
  const ref = db.collection("hostitSubscriptions").doc(normalizedEmail);
  const now = new Date().toISOString();
  const existedBefore = (await ref.get()).exists;
  await ref.set({
    email: normalizedEmail,
    packageKey: packageKey || "",
    packageName: packageName || "",
    customerId: customerId || "",
    subscriptionId: subscriptionId || "",
    status: status || "unknown",
    source: source || "stripe",
    updatedAt: now
  }, { merge: true });
  if (!existedBefore) await ref.set({ createdAt: now }, { merge: true });

  // Päivitä myös mahdollinen organisaatio, jos owner on jo ehtinyt rekisteröityä samalla emaililla.
  const usersSnap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();
  if (!usersSnap.empty) {
    const user = usersSnap.docs[0].data();
    if (user.orgId) {
      await db.collection("orgs").doc(user.orgId).set({
        subscriptionStatus: status || "unknown",
        subscriptionId: subscriptionId || "",
        stripeCustomerId: customerId || "",
        subscriptionEmail: normalizedEmail,
        updatedAt: now
      }, { merge: true });
    }
  }
}

app.get("/", (req, res) => {
  res.send("Hostit Stripe backend toimii");
});

app.get("/check-subscription", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.email);
    if (!email) return res.status(400).json({ active: false, error: "Sähköposti puuttuu." });
    const db = initFirebaseAdmin();
    if (!db) return res.status(500).json({ active: false, error: "Firebase Admin ei ole käytössä backendissä." });

    const snap = await db.collection("hostitSubscriptions").doc(email).get();
    if (!snap.exists) return res.json({ active: false, status: "missing" });
    const data = snap.data();
    const active = data.status === "active" || data.status === "trialing";
    res.json({ active, ...data });
  } catch (error) {
    res.status(500).json({ active: false, error: error.message });
  }
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { paketti, email } = req.body;
    const packageInfo = prices[paketti];
    if (!packageInfo) return res.status(400).json({ error: "Virheellinen paketti" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email ? normalizeEmail(email) : undefined,
      line_items: [{ price: packageInfo.priceId, quantity: 1 }],
      metadata: { packageKey: paketti, packageName: packageInfo.name },
      subscription_data: { metadata: { packageKey: paketti, packageName: packageInfo.name } },
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/myynti.html`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/confirm-session", async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ error: "session_id puuttuu" });

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription", "customer"] });
    const subscription = session.subscription;
    const email = normalizeEmail(session.customer_details?.email || session.customer_email || session.customer?.email);
    const packageKey = session.metadata?.packageKey || subscription?.metadata?.packageKey || "";
    const packageName = session.metadata?.packageName || subscription?.metadata?.packageName || "";
    const status = subscription?.status || session.payment_status || "unknown";

    await upsertSubscription({
      email,
      packageKey,
      packageName,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
      subscriptionId: typeof subscription === "string" ? subscription : subscription?.id,
      status,
      source: "checkout_success"
    });

    res.json({ ok: true, email, packageKey, packageName, status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  // Huom: jos otat webhookin käyttöön, lisää Renderiin STRIPE_WEBHOOK_SECRET.
  res.json({ received: true, note: "Webhook endpoint placeholder. Success-sivu vahvistaa maksut jo /confirm-session endpointilla." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
