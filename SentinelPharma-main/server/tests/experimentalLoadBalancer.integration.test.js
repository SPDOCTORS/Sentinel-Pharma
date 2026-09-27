const http = require('http');

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

test('experimental candidates reach the configured AI engine through the real load-balancer HTTP boundary', async () => {
  let received;
  let resolveRequest;
  const receivedRequest = new Promise((resolve) => { resolveRequest = resolve; });
  const server = http.createServer((request, response) => {
    received = {
      method: request.method,
      url: request.url,
      internalToken: request.headers['x-internal-service-token']
    };
    resolveRequest();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ candidateCount: 10, candidates: [] }));
  });

  const originalAiEngineUrl = process.env.AI_ENGINE_URL;
  const originalInternalToken = process.env.INTERNAL_SERVICE_TOKEN;

  try {
    const port = await listen(server);
    process.env.AI_ENGINE_URL = `http://127.0.0.1:${port}`;
    process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-service-token';
    jest.resetModules();

    const { experimentalCandidates } = require('../src/services/aiEngineService');
    const result = await experimentalCandidates({ drugId: 'CHEMBL:CHEMBL1000', topK: 10 });
    expect(result).toEqual({ candidateCount: 10, candidates: [] });
    await receivedRequest;
    expect(JSON.stringify(result)).not.toContain('test-internal-service-token');

    expect(received).toEqual({
      method: 'GET',
      url: '/api/experimental/repurposing/drugs/CHEMBL%3ACHEMBL1000/candidates?top_k=10',
      internalToken: 'test-internal-service-token'
    });
  } finally {
    await close(server);
    if (originalAiEngineUrl === undefined) delete process.env.AI_ENGINE_URL;
    else process.env.AI_ENGINE_URL = originalAiEngineUrl;
    if (originalInternalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalInternalToken;
    jest.resetModules();
  }
});

test('experimental candidates fail closed when the configured AI engine returns an upstream error', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ detail: 'upstream unavailable' }));
  });
  const originalAiEngineUrl = process.env.AI_ENGINE_URL;
  const originalInternalToken = process.env.INTERNAL_SERVICE_TOKEN;

  try {
    const port = await listen(server);
    process.env.AI_ENGINE_URL = `http://127.0.0.1:${port}`;
    process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-service-token';
    jest.resetModules();

    const { experimentalCandidates } = require('../src/services/aiEngineService');
    await expect(experimentalCandidates({ drugId: 'CHEMBL:CHEMBL1000', topK: 10 }))
      .rejects.toMatchObject({ response: { status: 503 } });
  } finally {
    await close(server);
    if (originalAiEngineUrl === undefined) delete process.env.AI_ENGINE_URL;
    else process.env.AI_ENGINE_URL = originalAiEngineUrl;
    if (originalInternalToken === undefined) delete process.env.INTERNAL_SERVICE_TOKEN;
    else process.env.INTERNAL_SERVICE_TOKEN = originalInternalToken;
    jest.resetModules();
  }
});
