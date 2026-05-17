const LEADERS = [
  { rank: 1, name: "SHADOW", league: "MYTHIC", wpm: 412, wins: "98%", streak: 12, color: "#a855f7" },
  { rank: 2, name: "BLADE", league: "DIAMOND", wpm: 399, wins: "94%", streak: 9, color: "#38bdf8" },
  { rank: 3, name: "SPEEDY", league: "DIAMOND", wpm: 378, wins: "92%", streak: 7, color: "#fb923c" },
  { rank: 4, name: "NINJA", league: "DIAMOND", wpm: 356, wins: "90%", streak: 6, color: "#84cc16" },
  { rank: 5, name: "TYPERX", league: "PLATINUM", wpm: 334, wins: "87%", streak: 5, color: "#22d3ee" },
  { rank: 999, name: "YOU", league: "NOVICE", wpm: 0, wins: "0%", streak: 0, color: "#fde047", me: true },
];

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
  if (request.method !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "today" ? "today" : "week";

  return json(200, {
    period,
    leaders: LEADERS,
    playerRank: 999,
  });
}
