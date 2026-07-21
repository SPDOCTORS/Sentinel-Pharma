/*
 * SentinelPharma API Smoke Test
 * -----------------------------
 * Runs a lightweight end-to-end check across critical backend routes.
 */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const started = Date.now();
  
  // Remove AbortController for now to see if that's the issue
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const ms = Date.now() - started;
    const contentType = res.headers.get('content-type') || '';
    let body = null;

    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    return { url, res, ms, body, contentType };
  } catch (error) {
    const ms = Date.now() - started;
    console.error(`Request failed after ${ms}ms:`, error.message);
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log(`Running smoke tests against ${BASE_URL}`);

  const health = await request('/health');
  assert(health.res.status === 200, `GET /health failed (${health.res.status})`);
  console.log(`OK  GET /health (${health.ms}ms)`);

  const researchHealth = await request('/api/research/health');
  assert(researchHealth.res.status === 200, `GET /api/research/health failed (${researchHealth.res.status})`);
  console.log(`OK  GET /api/research/health (${researchHealth.ms}ms)`);

  const analyze = await request('/api/research', {
    method: 'POST',
    body: JSON.stringify({
      molecule: 'Metformin',
      mode: 'cloud',
      provider: 'gemini'
    })
  });
  assert(analyze.res.status === 200, `POST /api/research failed (${analyze.res.status})`);
  assert(analyze.body?.requestId, 'POST /api/research did not return requestId');
  console.log(`OK  POST /api/research (${analyze.ms}ms) requestId=${analyze.body.requestId}`);

  const status = await request(`/api/research/${analyze.body.requestId}`);
  assert(status.res.status === 200, `GET /api/research/:requestId failed (${status.res.status})`);
  assert(status.body?.requestId === analyze.body.requestId, 'Status endpoint requestId mismatch');
  console.log(`OK  GET /api/research/${analyze.body.requestId} (${status.ms}ms)`);

  const archiveList = await request('/api/archive/reports?limit=5');
  assert(archiveList.res.status === 200, `GET /api/archive/reports failed (${archiveList.res.status})`);
  const reports = archiveList.body?.data?.reports || [];
  console.log(`OK  GET /api/archive/reports (${archiveList.ms}ms) count=${reports.length}`);

  if (reports.length > 0 && reports[0]?._id) {
    const pdf = await request(`/api/archive/reports/${reports[0]._id}/pdf`);
    assert(pdf.res.status === 200, `GET /api/archive/reports/:id/pdf failed (${pdf.res.status})`);
    assert(pdf.contentType.includes('application/pdf'), 'PDF endpoint did not return PDF content-type');
    console.log(`OK  GET /api/archive/reports/${reports[0]._id}/pdf (${pdf.ms}ms)`);
  } else {
    console.log('SKIP GET /api/archive/reports/:id/pdf (no reports available)');
  }

  console.log('All smoke tests passed.');
}

run().catch((error) => {
  console.error('Smoke test failed:', error.message);
  process.exit(1);
});
