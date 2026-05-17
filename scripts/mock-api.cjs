const http = require("http");

const port = Number(process.env.MOCK_API_PORT || 8787);

const player = {
  id: "123456789",
  name: "Case",
  league: "Silver League",
  leagueCode: "SILVER II",
  rank: 24,
  score: 2880,
  nextLeague: "GOLD LEAGUE",
  nextScore: 3000,
  wins: 71,
  losses: 29,
  winRate: "71%",
  bestCombo: 12,
  wpm: 288,
  streak: 5,
  invited: 8,
};

const energy = {
  value: 50,
  date: new Date().toISOString().slice(0, 10),
};

const leaders = [
  { rank: 1, name: "SHADOW", league: "MYTHIC", wpm: 412, wins: "98%", streak: 12, color: "#a855f7" },
  { rank: 2, name: "BLADE", league: "DIAMOND", wpm: 399, wins: "94%", streak: 9, color: "#38bdf8" },
  { rank: 3, name: "SPEEDY", league: "DIAMOND", wpm: 378, wins: "92%", streak: 7, color: "#fb923c" },
  { rank: 24, name: "CASE D", league: "SILVER II", wpm: 288, wins: "71%", streak: 5, color: "#fde047", me: true },
];

let battleRound = 1;
let battleState = createBattleState();

function createBattleState() {
  const words = [
    ["молния", "победа"],
    ["буря", "лава"],
    ["арена", "битва"],
  ];
  const pair = words[(battleRound - 1) % words.length];

  return {
    battleId: "battle_MOCK",
    status: "active",
    maxHp: 120,
    round: battleRound,
    wordLength: pair[0].length,
    availableLetters: pair[0].split(""),
    player: {
      id: player.id,
      name: player.name,
      hp: 120,
      word: pair[0],
      typedCount: 0,
    },
    opponent: {
      id: "987654321",
      name: "Blade",
      hp: 120,
      word: pair[1],
      typedCount: 0,
    },
    serverTime: new Date().toISOString(),
  };
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function createMockApiServer() {
  return http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const method = request.method || "GET";

  if (method === "OPTIONS") {
    sendJson(response, 200, {});
    return;
  }

  if (method === "POST" && url.pathname === "/telegram/session") {
    sendJson(response, 200, {
      player,
      energy,
      settings: {
        soundEnabled: true,
        vibrationEnabled: true,
        language: "RU",
      },
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/player") {
    sendJson(response, 200, { player, energy });
    return;
  }

  if (method === "GET" && url.pathname === "/leaderboard") {
    sendJson(response, 200, {
      period: url.searchParams.get("period") || "week",
      leaders,
      playerRank: player.rank,
    });
    return;
  }

  if (method === "POST" && url.pathname === "/referrals") {
    sendJson(response, 200, {
      accepted: true,
      invitedBy: "CASE",
      message: "Реферальная ссылка принята.",
    });
    return;
  }

  if (method === "POST" && url.pathname === "/duels") {
    sendJson(response, 200, {
      duelId: "duel_MOCK",
      startParam: "duel_MOCK",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    return;
  }

  if (method === "POST" && /^\/duels\/[^/]+\/join$/.test(url.pathname)) {
    sendJson(response, 200, {
      status: "joined",
      battleId: "battle_MOCK",
      opponent: {
        id: "987654321",
        name: "Blade",
        league: "SILVER II",
        wpm: 280,
      },
    });
    return;
  }

  if (method === "POST" && url.pathname === "/matchmaking") {
    battleRound = 1;
    battleState = createBattleState();
    sendJson(response, 200, {
      status: "matched",
      battleId: "battle_MOCK",
      opponent: {
        id: "987654321",
        name: "Blade",
        league: "SILVER II",
        wpm: 280,
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/battles/battle_MOCK") {
    sendJson(response, 200, battleState);
    return;
  }

  if (method === "POST" && url.pathname === "/battles/battle_MOCK/typing") {
    const body = await readBody(request);
    battleState.player.typedCount = Math.max(0, Math.min(battleState.player.word.length, Number(body.typedCount) || 0));
    sendJson(response, 200, {
      accepted: true,
      state: battleState,
    });
    return;
  }

  if (method === "POST" && url.pathname === "/battles/battle_MOCK/words") {
    const body = await readBody(request);
    const accepted = body.word === battleState.player.word && body.round === battleState.round;

    if (!accepted) {
      sendJson(response, 200, {
        accepted: false,
        outcome: "rejected",
        rejectionReason: "wrong_word",
        message: "Сервер отклонил слово.",
        state: battleState,
      });
      return;
    }

    battleRound += 1;
    const nextState = createBattleState();
    nextState.opponent.hp = Math.max(0, battleState.opponent.hp - 15);
    battleState = nextState;

    sendJson(response, 200, {
      accepted: true,
      damage: 15,
      combo: battleRound - 1,
      outcome: "hit",
      state: battleState,
      nextWord: battleState.player.word,
    });
    return;
  }

  if (method === "POST" && url.pathname === "/battles/battle_MOCK/leave") {
    sendJson(response, 200, { accepted: true });
    return;
  }

  if (method === "POST" && url.pathname === "/battles") {
    const body = await readBody(request);
    const energySpent = body.mode === "online" ? 1 : 0;

    energy.value = Math.max(0, energy.value - energySpent);
    sendJson(response, 200, {
      accepted: true,
      energySpent,
      player: {
        ...player,
        wins: player.wins + 1,
        streak: player.streak + 1,
      },
      energy,
    });
    return;
  }

  sendJson(response, 404, { message: "Not found" });
  });
}

if (require.main === module) {
  const server = createMockApiServer();

  server.listen(port, () => {
    console.log(`Mock API listening on http://localhost:${port}`);
    console.log("Use VITE_API_BASE_URL=http://localhost:8787 and VITE_ALLOW_BROWSER_API_MOCK=true");
  });
}

module.exports = {
  createMockApiServer,
};
