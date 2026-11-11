import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';

test('Full browser-to-database acceptance test for SentinelPharma V6', async ({ page }) => {
  // Set long timeout for multi-agent live evidence pipeline
  test.setTimeout(90000);

  // 1. Navigate to SentinelPharma login
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  // Fill login credentials
  await page.locator('input[type="email"]').fill('acceptance@sentinelpharma.com');
  await page.locator('input[type="password"]').fill('AcceptancePass123!');
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard
  await page.waitForURL('**/');
  await expect(page.locator('text=Drug Repurposing Evidence Review')).toBeVisible();

  // 2. Select V6 Repurposing Tab (it is selected by default, or click V6 Hybrid)
  const v6Tab = page.locator('#tab-v6-hybrid');
  await expect(v6Tab).toBeVisible();
  await v6Tab.click();

  // Verify V6 heading and disclaimer
  await expect(page.locator('h3:has-text("V6 Connectivity-Aware Hybrid Drug Repurposing")')).toBeVisible();
  await expect(page.locator('text=V6 Locked Evaluation Model')).toBeVisible();

  // 3. Disease search & Candidate Ranking
  const diseaseInput = page.locator('input#v6-disease-input');
  await expect(diseaseInput).toBeVisible();
  await expect(diseaseInput).toHaveValue('EFO:0000180');

  // Click "Rank Candidates"
  const rankButton = page.locator('button:has-text("Rank Candidates")');
  await expect(rankButton).toBeVisible();
  await rankButton.click();

  // Wait for candidates table to populate
  const candidateTable = page.locator('table');
  await expect(candidateTable).toBeVisible({ timeout: 15000 });
  await expect(page.locator('td:has-text("COBICISTAT")')).toBeVisible();

  // 4. Click "Investigate" on candidate row
  const investigateBtn = page.locator('button[aria-label*="Investigate candidate COBICISTAT"]');
  await expect(investigateBtn).toBeVisible();
  await investigateBtn.click();

  // Wait for dossier to open and load evidence
  await expect(page.locator('text=Investigation dossier for pair:')).toBeVisible();
  await expect(page.locator('text=COBICISTAT + HIV-1 infection')).toBeVisible();

  // 5. Verify PubMed literature and ClinicalTrials.gov with relevance badges
  await expect(page.locator('text=PubMed Literature')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('text=ClinicalTrials.gov')).toBeVisible({ timeout: 15000 });

  // Verify exact relevance labels (can be Direct Match or Partial Mention depending on entity query)
  await expect(page.locator('span:has-text("Direct Co-mention"), span:has-text("Direct Study Match"), span:has-text("Drug Mention Only"), span:has-text("Partial Match")').first()).toBeVisible({ timeout: 15000 });

  // 6. Switch to Verified 3D Structure tab and verify UNAVAILABLE state
  const structureTab = page.locator('button:has-text("Verified 3D Structure")');
  await expect(structureTab).toBeVisible();
  await structureTab.click();
  await expect(page.locator('text=Structure UNAVAILABLE')).toBeVisible();
  await expect(page.locator('text=No verified drug/target-to-PDB mapping with provenance is available')).toBeVisible();

  // 7. Click "Launch Full Live Investigation"
  const launchButton = page.locator('button:has-text("Launch Full Live Investigation")');
  await expect(launchButton).toBeVisible();
  await launchButton.click();

  // 8. Wait for live multi-agent investigation to complete and display Results tab
  await expect(page.locator('text=Named biomedical sources')).toBeVisible({ timeout: 45000 });
  await expect(page.locator('text=Verified structure investigation')).toBeVisible();
  await expect(page.getByText('COBICISTAT + HIV-1 infection', { exact: true })).toBeVisible();

  // Verify local cache persistence
  const cachedKeys = await page.evaluate(() => {
    return Object.keys(localStorage).filter(k => k.startsWith('sentinel_report_'));
  });
  expect(cachedKeys.length).toBeGreaterThan(0);
  const latestRequestId = cachedKeys[0].replace('sentinel_report_', '');
  console.log('Acceptance Test Verified RequestId:', latestRequestId);

  // 9. Verify MongoDB report persistence directly in database
  const mongoUri = process.env.MONGODB_URL || 'mongodb://localhost:27017/sentinelpharma';
  await mongoose.connect(mongoUri);
  const reportDoc = await mongoose.connection.collection('researchreports').findOne({ requestId: latestRequestId });
  expect(reportDoc).not.toBeNull();
  expect(reportDoc.molecule).toBe('COBICISTAT');
  expect(reportDoc.status).toBe('completed');
  await mongoose.disconnect();

  // 10. Reload saved report by navigating or querying status
  const reloaded = await page.evaluate(async (reqId) => {
    const raw = localStorage.getItem(`sentinel_report_${reqId}`);
    return raw ? JSON.parse(raw) : null;
  }, latestRequestId);
  expect(reloaded).not.toBeNull();
  expect(reloaded.requestId).toBe(latestRequestId);
  expect(reloaded.molecule).toBe('COBICISTAT');
  expect(reloaded.disease).toBe('HIV-1 infection');
  expect(reloaded.status).toBe('completed');

  // Take screenshot for visual audit evidence
  await page.screenshot({ path: 'v6_acceptance_live_investigation.png', fullPage: true });
  console.log('Acceptance Test Completed Successfully: PASS');
});
