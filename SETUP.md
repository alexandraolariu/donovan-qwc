# QWC Form 6 → DocuSign — one-time setup (~10 min)

Your account details are already filled in below. You only create one thing: an integration key.

## 1 · Create the DocuSign integration key (5 min)
1. Log in at **au.docusign.net** → Settings (top right) → **Apps and Keys** (under Integrations).
2. **Add App and Integration Key** → name it `QWC Form 6 Sender` → Create.
3. Copy the **Integration Key** (a GUID) — you'll need it twice below.
4. Under *Service Integration* → **Generate RSA** → copy the **Private Key** somewhere safe
   (shown once only; it's a block starting `-----BEGIN RSA PRIVATE KEY-----`).
5. Under *Redirect URIs* → Add: `https://qwc-water-tools.netlify.app/` → Save.

## 2 · One-time consent (30 sec)
Open this URL in your browser (replace `YOUR_INTEGRATION_KEY`), log in, click Accept:

    https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_INTEGRATION_KEY&redirect_uri=https%3A%2F%2Fqwc-water-tools.netlify.app%2F

The page redirects back to your tools site — that's success. Done once, lasts forever.

## 3 · Netlify environment variables (3 min)
Netlify → your qwc-water-tools site → **Site configuration → Environment variables** → add:

| Key | Value |
|---|---|
| `DS_INTEGRATION_KEY` | the integration key from step 1 |
| `DS_USER_ID` | `911978f3-e4ae-43fd-99e6-37b7335bc6b8` |
| `DS_ACCOUNT_ID` | `5d814b63-43ef-4460-a4e2-ced1c2eb54d3` |
| `DS_BASE` | `https://au.docusign.net` |
| `DS_PRIVATE_KEY` | paste the full RSA private key block, including BEGIN/END lines |
| `QWC_SEND_KEY` | `qwc-f6-2026` |

## 4 · Deploy files
Add to the repo (keeping paths) and push:

    form6-generator.html                 ← replaces the current one
    form6-blank.pdf                      ← repo root
    netlify/functions/send-form6.mjs     ← new folder if it doesn't exist

Netlify picks up the function automatically — no config file needed.

## 5 · Test
Open the tool (staff portal `#form6` or the Netlify URL), fill your own details with
your own email as the client, press **Send via DocuSign**. You should get the signing
email within a minute, then the countersign request after you sign.

## Notes
- The signing dates stamp automatically when each party signs — no more same-day constraint.
- `QWC_SEND_KEY` stops random internet traffic from using the endpoint, but anyone who
  reads the page source can see it — it's a speed bump, not a lock. The worst someone
  could do is send Form 6s from your account; DocuSign shows every envelope in Sent.
  If that ever matters more, tell Claude — the next step up is a per-day send cap or
  moving the tool behind the WordPress login.
- If a send fails with "consent required", redo step 2.
- Layout is versioned `QWC-F6-v2`; if the Form 6 template PDF ever changes, give
  Claude the new blank and it will re-map every coordinate.
