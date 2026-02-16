import { withPage } from '../puppeteerLauncher.js';

export async function scrapeExamplePortal(keyword) {
  return withPage(async (page) => {
    await page.goto(`https://example.com/jobs?q=${encodeURIComponent(keyword)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Optionally wait for a selector
    // await page.waitForSelector('.job-item', { timeout: 15000 });

    const jobs = await page.evaluate(() => {
      // Replace with real DOM extraction
      return Array.from(document.querySelectorAll('.job-item')).map(el => ({
        title: el.querySelector('.job-title')?.textContent?.trim(),
        company: el.querySelector('.company')?.textContent?.trim(),
        location: el.querySelector('.location')?.textContent?.trim()
      }));
    });

    return jobs;
  }, { retries: 2 });
}