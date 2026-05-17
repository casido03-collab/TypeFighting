export default async function handler() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "typefight-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
