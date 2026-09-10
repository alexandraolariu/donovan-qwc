/**
 * render-pdf.js
 *
 * Renders arbitrary HTML into a real, print-quality PDF using a headless
 * Chromium instance — the same rendering engine a browser's own "Print to
 * PDF" uses — instead of the html2canvas-screenshot-into-jsPDF approach,
 * which produces blurry, non-selectable, awkwardly-paginated output.
 *
 * No third-party API key, no ongoing per-document cost: this runs its own
 * headless Chromium inside the Netlify function via @sparticuz/chromium,
 * a Chromium build packaged specifically to fit inside serverless function
 * size limits (unlike plain `puppeteer`, which ships a ~300MB Chromium
 * build that is a common cause of silent deploy/runtime failures here).
 *
 * REQUEST  (POST, JSON body):
 *   { "html": "<html>...</html>", "filename": "AquaVal-Report-617719.pdf" }
 *
 * RESPONSE (JSON):
 *   { "success": true,  "pdf_b64": "<base64 PDF bytes, no data: prefix>", "filename": "..." }
 *   { "success": false, "error": "message" }
 *
 * The base64 shape matches what aquaval-client.html already expects from
 * htmlToPdfBase64(), so swapping the client over to call this instead is a
 * drop-in change (see integration notes in README.md).
 */

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: 'Use POST' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) };
  }

  const html = payload.html;
  const filename = (payload.filename || 'report.pdf').replace(/[^0-9A-Za-z_.-]/g, '_');

  if (!html || typeof html !== 'string') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: 'Missing "html" string in body' }) };
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      // args/executablePath/headless come from @sparticuz/chromium, which
      // knows exactly what Netlify's (Lambda-based) runtime needs.
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // 'domcontentloaded' rather than 'networkidle0' — the report HTML is
    // self-contained (no external images/fonts to wait on in the common
    // case), and every second here counts against Netlify's function
    // timeout. If the report ever grows external asset dependencies,
    // switch this to 'networkidle0' and budget accordingly.
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
    });

    await browser.close();

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        pdf_b64: pdfBuffer.toString('base64'),
        filename,
      }),
    };
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: String((err && err.message) || err) }),
    };
  }
};
