// netlify/functions/render-pdf.mjs
//
// Renders arbitrary HTML into a real PDF using an actual headless Chrome instance
// (via @sparticuz/chromium + puppeteer-core) — same engine, same output quality as
// Chrome's own "Print to PDF". Not a screenshot; not a third-party paid API.
//
// Endpoint: https://qwc-water-tools-form6.netlify.app/.netlify/functions/render-pdf
// Request:  POST { "html": "<!DOCTYPE html>..." }
// Response: { "success": true, "pdf_base64": "..." }  (base64-encoded PDF bytes)

import path from 'path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: 'POST only' }) };
  }

  let html;
  try {
    const body = JSON.parse(event.body || '{}');
    html = body.html;
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) };
  }
  if (!html || typeof html !== 'string') {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: 'Missing "html" field' }) };
  }

  let browser;
  try {
    // Netlify's bundler discards @sparticuz/chromium's binary/library files unless told
    // to keep them (that's what netlify.toml's included_files does), so this path is
    // where they actually land at runtime.
    const executablePath = await chromium.executablePath('/var/task/node_modules/@sparticuz/chromium/bin');

    // The extracted Chromium binary ships with its own copies of a handful of shared
    // libraries it needs (libnspr4.so etc.) sitting right next to it — but nothing tells
    // the dynamic linker to look there by default, hence "cannot open shared object
    // file". Adding that directory to LD_LIBRARY_PATH is the fix.
    const chromiumDir = path.dirname(executablePath);
    process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
      ? `${chromiumDir}:${process.env.LD_LIBRARY_PATH}`
      : chromiumDir;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });

    await browser.close();

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, pdf_base64: pdfBuffer.toString('base64') }),
    };
  } catch (err) {
    if (browser) { try { await browser.close(); } catch (e2) {} }
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: String((err && err.message) || err) }),
    };
  }
};
