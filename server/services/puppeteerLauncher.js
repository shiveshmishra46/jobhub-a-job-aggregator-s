import puppeteer from 'puppeteer';

let browserPromise = null;

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      defaultViewport: { width: 1280, height: 900 }
    });
  }
  return browserPromise;
}

export async function withPage(fn, { retries = 2 } = {}) {
  const browser = await getBrowser();
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    const page = await browser.newPage();
    try {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );
      const result = await fn(page, attempt);
      await page.close();
      return result;
    } catch (err) {
      console.warn(`[Scraper] Attempt ${attempt} failed: ${err.message}`);
      await page.close().catch(() => {});
      if (attempt > retries) throw err;
    }
  }
}