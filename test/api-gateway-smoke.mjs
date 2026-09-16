import assert from 'node:assert/strict';

const base = process.env.FINBANK_SMOKE_URL;
assert.ok(base, 'URL do gateway de teste obrigatória.');

async function request(path, options = {}, status = 200) {
  const response = await fetch(`${base}/api/v1${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status);
  return response.json();
}

const baseAccount = await request('/accounts/me');
assert.equal(baseAccount.accountId, 'ACC-1001');
assert.equal(baseAccount.balanceCents, 12345);
assert.deepEqual(Object.keys(baseAccount).sort(), [
  'accountId',
  'balanceCents',
  'dailyLimitCents',
  'documentMasked',
  'ownerName',
  'profileId',
]);

const created = await request(
  '/profiles',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Perfil Gateway',
      transactionPassword: '012345',
    }),
  },
  201,
);
assert.deepEqual(Object.keys(created).sort(), [
  'accountId',
  'displayName',
  'profileId',
]);
const selected = await request('/accounts/me', {
  headers: { 'X-Local-Profile-Id': created.profileId },
});
assert.equal(selected.accountId, created.accountId);
assert.equal(selected.balanceCents, 14525000);
assert.notEqual(selected.accountId, baseAccount.accountId);
assert.equal((await request('/accounts/me')).balanceCents, 12345);
assert.ok(
  (await request('/profiles')).some((p) => p.profileId === created.profileId),
);

const recipient = await request(
  '/recipients/resolve?key=marina%40example.test',
);
assert.equal(recipient.recipientId, 'REC-1001');
assert.deepEqual(Object.keys(recipient).sort(), [
  'documentMasked',
  'institution',
  'name',
  'pixKeyMasked',
  'recipientId',
]);
assert.equal((await request('/recipients/frequent')).length, 2);
const failure = await fetch(
  `${base}/api/v1/recipients/resolve?key=invalid-private-key`,
  {
    signal: AbortSignal.timeout(5000),
  },
);
assert.equal(failure.status, 400);
assert.match(
  failure.headers.get('content-type'),
  /^application\/problem\+json/,
);
const problem = await failure.json();
assert.equal(problem.code, 'INVALID_PIX_KEY');
assert.ok(problem.requestId);
assert.ok(problem.traceId);
assert.ok(!JSON.stringify(problem).includes('invalid-private-key'));
console.log('API funcional validada pelo gateway.');

const pixHeaders = {
  'content-type': 'application/json',
  'X-Local-Profile-Id': created.profileId,
};
const intention = await request(
  '/pix/intents',
  {
    method: 'POST',
    headers: pixHeaders,
    body: JSON.stringify({
      requestId: 'REQ-GATEWAY-012',
      recipientId: recipient.recipientId,
      amountCents: 5000,
      deviceId: 'DEV-GATEWAY',
      description: 'Pagamento fictício',
    }),
  },
  201,
);
assert.equal(intention.accountId, created.accountId);
assert.equal(intention.state, 'DRAFT');
assert.equal(intention.amountCents, 5000);
assert.ok(!Object.hasOwn(intention, 'intentId'));
assert.deepEqual(
  await request('/pix/intents/REQ-GATEWAY-012', {
    headers: pixHeaders,
  }),
  intention,
);
const edited = await request('/pix/intents/REQ-GATEWAY-012', {
  method: 'PATCH',
  headers: pixHeaders,
  body: JSON.stringify({ amountCents: 6000, description: 'Revisão fictícia' }),
});
assert.equal(edited.amountCents, 6000);
assert.equal(edited.description, 'Revisão fictícia');
assert.equal(edited.expiresAt, intention.expiresAt);
assert.deepEqual(
  await request('/accounts/me', { headers: pixHeaders }),
  selected,
);
const inaccessible = await request('/pix/intents/REQ-GATEWAY-012', {}, 404);
assert.equal(inaccessible.code, 'PIX_INTENT_NOT_FOUND');
console.log('Intenção PIX criada, revisada e isolada pelo gateway.');

const rejectedConfirmation = await request(
  '/pix/intents/REQ-GATEWAY-012/confirm',
  {
    method: 'POST',
    headers: pixHeaders,
    body: JSON.stringify({ transactionPassword: '654321' }),
  },
  422,
);
assert.equal(rejectedConfirmation.code, 'INVALID_TRANSACTION_PASSWORD');
assert.deepEqual(
  await request('/accounts/me', { headers: pixHeaders }),
  selected,
);
const confirmation = await request('/pix/intents/REQ-GATEWAY-012/confirm', {
  method: 'POST',
  headers: pixHeaders,
  body: JSON.stringify({ transactionPassword: '012345' }),
});
assert.deepEqual(Object.keys(confirmation).sort(), [
  'processedAt',
  'reasonCodes',
  'requestId',
  'status',
  'transactionId',
]);
assert.equal(confirmation.requestId, intention.requestId);
assert.equal(confirmation.status, 'APPROVED');
assert.deepEqual(confirmation.reasonCodes, ['WITHIN_CURRENT_RULES']);
assert.ok(confirmation.transactionId);
assert.ok(Number.isFinite(Date.parse(confirmation.processedAt)));
const debited = await request('/accounts/me', { headers: pixHeaders });
assert.equal(debited.balanceCents, selected.balanceCents - edited.amountCents);
assert.equal(debited.dailyLimitCents, selected.dailyLimitCents);
assert.equal(
  (await request('/pix/intents/REQ-GATEWAY-012', { headers: pixHeaders }))
    .state,
  'APPROVED',
);
assert.equal(
  (await request('/accounts/me')).balanceCents,
  baseAccount.balanceCents,
);
console.log('Confirmação PIX autenticada e débito validados pelo gateway.');

await request(
  '/pix/intents',
  {
    method: 'POST',
    headers: pixHeaders,
    body: JSON.stringify({
      requestId: 'REQ-GATEWAY-021',
      recipientId: recipient.recipientId,
      amountCents: 500000,
      deviceId: 'DEV-GATEWAY',
    }),
  },
  201,
);
const review = await request(
  '/pix/intents/REQ-GATEWAY-021/confirm',
  {
    method: 'POST',
    headers: pixHeaders,
    body: JSON.stringify({ transactionPassword: '012345' }),
  },
  202,
);
assert.deepEqual(Object.keys(review).sort(), Object.keys(confirmation).sort());
assert.equal(review.status, 'REVIEW');
assert.deepEqual(review.reasonCodes, ['AMOUNT_REQUIRES_REVIEW']);
assert.ok(review.transactionId);
assert.ok(Number.isFinite(Date.parse(review.processedAt)));
assert.equal(
  (await request('/pix/intents/REQ-GATEWAY-021', { headers: pixHeaders }))
    .state,
  'REVIEW',
);
assert.deepEqual(
  await request('/accounts/me', { headers: pixHeaders }),
  debited,
);
assert.equal(
  (await request('/accounts/me')).balanceCents,
  baseAccount.balanceCents,
);
console.log('Revisão PIX persistida sem débito pelo gateway.');

const history = await request('/transactions?pageSize=1', {
  headers: pixHeaders,
});
assert.equal(history.totalItems, 2);
assert.equal(history.totalPages, 2);
for (const persisted of [confirmation, review]) {
  const detail = await request(`/transactions/${persisted.transactionId}`, {
    headers: pixHeaders,
  });
  assert.equal(detail.status, persisted.status);
  assert.equal(detail.processedAt, persisted.processedAt);
  assert.deepEqual(detail.reasonCodes, persisted.reasonCodes);
  assert.equal(detail.type, 'PIX');
  assert.deepEqual(detail.recipientSnapshot, recipient);
  assert.deepEqual(Object.keys(detail).sort(), [
    'amountCents',
    'createdAt',
    'description',
    'processedAt',
    'reasonCodes',
    'recipientSnapshot',
    'requestId',
    'status',
    'transactionId',
    'type',
  ]);
  const filtered = await request(
    `/transactions?status=${persisted.status}&search=${persisted.requestId}`,
    { headers: pixHeaders },
  );
  assert.equal(filtered.totalItems, 1);
  assert.deepEqual(filtered.items, [detail]);
  assert.equal(
    (await request(`/transactions/${persisted.transactionId}`, {}, 404)).code,
    'TRANSACTION_NOT_FOUND',
  );
}
assert.deepEqual(
  await request('/accounts/me', { headers: pixHeaders }),
  debited,
);
assert.equal(
  (await request('/transactions?page=1&page=2', {}, 400)).code,
  'INVALID_TRANSACTION_QUERY',
);
console.log('Histórico e detalhes APPROVED/REVIEW validados pelo gateway.');
