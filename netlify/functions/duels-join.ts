function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  return json(200, {
    status: "expired",
    message: "Дуэльная ссылка распознана. Реальное подключение второго игрока включим после базы.",
  });
}
