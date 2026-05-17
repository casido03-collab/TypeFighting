const { createMockApiServer } = require("./mock-api.cjs");

const port = Number(process.env.MOCK_API_SMOKE_PORT || 8790);
const baseUrl = `http://localhost:${port}`;
const server = createMockApiServer();

function listen() {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

async function main() {
  await listen();

  const session = await request("/telegram/session", { method: "POST" });
  const leaderboard = await request("/leaderboard?period=week");
  const duel = await request("/duels", { method: "POST" });
  const joined = await request(`/duels/${duel.duelId}/join`, { method: "POST" });
  const matchmaking = await request("/matchmaking", { method: "POST" });
  const battle = await request(`/battles/${matchmaking.battleId}`);
  const typing = await request(`/battles/${matchmaking.battleId}/typing`, {
    method: "POST",
    body: JSON.stringify({ typedCount: 2 }),
  });
  const word = await request(`/battles/${matchmaking.battleId}/words`, {
    method: "POST",
    body: JSON.stringify({ word: battle.player.word, round: battle.round }),
  });
  const aiResult = await request("/battles", {
    method: "POST",
    body: JSON.stringify({ mode: "ai", outcome: "win" }),
  });
  const onlineResult = await request("/battles", {
    method: "POST",
    body: JSON.stringify({ mode: "online", outcome: "win" }),
  });

  if (!session.player || session.energy.value !== 50) {
    throw new Error("Session response is invalid");
  }

  if (!Array.isArray(leaderboard.leaders) || leaderboard.leaders.length === 0) {
    throw new Error("Leaderboard response is invalid");
  }

  if (joined.status !== "joined" || !joined.battleId) {
    throw new Error("Duel join response is invalid");
  }

  if (matchmaking.status !== "matched" || !matchmaking.battleId) {
    throw new Error("Matchmaking response is invalid");
  }

  if (
    battle.player.word.length !== battle.opponent.word.length ||
    battle.wordLength !== battle.player.word.length
  ) {
    throw new Error("Battle word lengths are invalid");
  }

  if (!typing.accepted || !typing.state) {
    throw new Error("Typing response is invalid");
  }

  if (!word.accepted || !word.state) {
    throw new Error("Word submit response is invalid");
  }

  if (aiResult.energySpent !== 0 || onlineResult.energySpent !== 1) {
    throw new Error("Energy spending rules are invalid");
  }

  console.log("Mock API smoke check passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close().catch(() => {});
  });
