function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function createDuelId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `duel_${randomPart}`;
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const duelId = createDuelId();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  return json(200, {
    duelId,
    startParam: duelId,
    expiresAt,
  });
}
