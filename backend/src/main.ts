// Op codes for client-server communication
var OP_CODE_MOVE = 1;
var OP_CODE_STATE = 2;
var OP_CODE_DONE = 3;
var OP_CODE_REJECTED = 4;

// Leaderboard ID
var LEADERBOARD_ID = "global_wins";
var STATS_COLLECTION = "player_stats";
var STATS_KEY = "stats";

// Timer config
var TIMED_TURN_SECONDS = 30;

var WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diagonals
];

function checkWinner(board: number[]): number {
  for (var i = 0; i < WIN_LINES.length; i++) {
    var a = WIN_LINES[i][0], b = WIN_LINES[i][1], c = WIN_LINES[i][2];
    if (board[a] !== 0 && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return 0;
}

function isBoardFull(board: number[]): boolean {
  for (var i = 0; i < board.length; i++) {
    if (board[i] === 0) return false;
  }
  return true;
}

function buildStateMessage(state: any) {
  var playersInfo: any = {};
  var playerIds = Object.keys(state.players);
  for (var i = 0; i < playerIds.length; i++) {
    var userId = playerIds[i];
    var p = state.players[userId];
    playersInfo[userId] = {
      userId: userId,
      username: p.username,
      mark: state.marks[userId],
    };
  }
  var msg: any = {
    board: state.board,
    players: playersInfo,
    currentTurn: state.currentTurn,
    winner: state.winner,
    gameOver: state.gameOver,
    playerCount: state.playerCount,
    timed: state.timed,
  };
  if (state.turnStartTick !== null && !state.gameOver) {
    var elapsedTicks = state.currentTick - state.turnStartTick;
    var elapsedSeconds = elapsedTicks / state.tickRate;
    var remaining = TIMED_TURN_SECONDS - elapsedSeconds;
    if (remaining < 0) remaining = 0;
    msg.turnTimeRemaining = Math.round(remaining);
    msg.turnTimeTotal = TIMED_TURN_SECONDS;
  }
  return msg;
}

function getPlayerStats(nk: nkruntime.Nakama, userId: string) {
  var objects = nk.storageRead([{
    collection: STATS_COLLECTION,
    key: STATS_KEY,
    userId: userId
  }]);
  if (objects.length > 0) {
    return objects[0].value as any;
  }
  return { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
}

function savePlayerStats(nk: nkruntime.Nakama, userId: string, stats: any) {
  nk.storageWrite([{
    collection: STATS_COLLECTION,
    key: STATS_KEY,
    userId: userId,
    value: stats,
    permissionRead: 2, // public read
    permissionWrite: 0  // server only write
  }]);
}

function recordWin(nk: nkruntime.Nakama, userId: string, username: string) {
  var stats = getPlayerStats(nk, userId);
  stats.wins++;
  stats.streak++;
  if (stats.streak > stats.bestStreak) {
    stats.bestStreak = stats.streak;
  }
  savePlayerStats(nk, userId, stats);
  // Submit to leaderboard (score = wins, subscore = best streak)
  nk.leaderboardRecordWrite(LEADERBOARD_ID, userId, username, stats.wins, stats.bestStreak);
}

function recordLoss(nk: nkruntime.Nakama, userId: string) {
  var stats = getPlayerStats(nk, userId);
  stats.losses++;
  stats.streak = 0;
  savePlayerStats(nk, userId, stats);
}

function recordDraw(nk: nkruntime.Nakama, userId: string) {
  var stats = getPlayerStats(nk, userId);
  stats.draws++;
  // Don't break streak on draw
  savePlayerStats(nk, userId, stats);
}

// Match handler functions (must use var for Nakama's goja runtime)
var matchInit = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  params: { [key: string]: string }
) {
  var state = {
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    players: {} as any,
    marks: {} as any,
    currentTurn: null as string | null,
    winner: null as string | null,
    gameOver: false,
    playerCount: 0,
    timed: true,
    turnStartTick: null as number | null,
    currentTick: 0,
    tickRate: 5,
    statsRecorded: false,
  };
  return {
    state: state,
    tickRate: 5,
    label: JSON.stringify({ open: "yes" }),
  };
};

var matchJoinAttempt = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presence: nkruntime.Presence,
  metadata: { [key: string]: string }
) {
  var s = state as any;
  if (s.gameOver) {
    return { state: s, accept: false, rejectMessage: "match is over" };
  }
  if (s.playerCount >= 2) {
    return { state: s, accept: false, rejectMessage: "match is full" };
  }
  return { state: s, accept: true };
};

var matchJoin = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
) {
  var s = state as any;

  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    s.playerCount++;
    s.players[presence.userId] = {
      userId: presence.userId,
      username: presence.username,
      sessionId: presence.sessionId,
      node: presence.node,
    };

    if (s.playerCount === 1) {
      s.marks[presence.userId] = 1; // X
      s.currentTurn = presence.userId;
    } else {
      s.marks[presence.userId] = 2; // O
    }
  }

  if (s.playerCount >= 2) {
    dispatcher.matchLabelUpdate(JSON.stringify({ open: "no" }));
    s.turnStartTick = tick;
  }

  s.currentTick = tick;
  var msg = buildStateMessage(s);
  dispatcher.broadcastMessage(OP_CODE_STATE, JSON.stringify(msg));

  return { state: s };
};

var matchLeave = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  presences: nkruntime.Presence[]
) {
  var s = state as any;

  for (var i = 0; i < presences.length; i++) {
    var presence = presences[i];
    delete s.players[presence.userId];
    s.playerCount--;
  }

  if (!s.gameOver && s.playerCount < 2 && !s.statsRecorded) {
    var remainingIds = Object.keys(s.players);
    if (remainingIds.length > 0) {
      s.gameOver = true;
      s.winner = remainingIds[0];
      s.statsRecorded = true;

      // Record stats: winner gets a win, leaver gets a loss
      var winnerId = remainingIds[0];
      var winnerUsername = s.players[winnerId].username;
      recordWin(nk, winnerId, winnerUsername);
      for (var i = 0; i < presences.length; i++) {
        recordLoss(nk, presences[i].userId);
      }

      var msg = buildStateMessage(s);
      (msg as any).forfeit = true;
      dispatcher.broadcastMessage(OP_CODE_DONE, JSON.stringify(msg));
    }
  }

  if (s.playerCount <= 0) {
    return null;
  }

  return { state: s };
};

var matchLoop = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  messages: nkruntime.MatchMessage[]
) {
  var s = state as any;
  s.currentTick = tick;

  if (s.gameOver) {
    return { state: s };
  }

  // Check timer expiry
  if (s.playerCount >= 2 && s.turnStartTick !== null && s.currentTurn) {
    var elapsedTicks = tick - s.turnStartTick;
    var elapsedSeconds = elapsedTicks / s.tickRate;
    if (elapsedSeconds >= TIMED_TURN_SECONDS) {
      // Current player forfeits due to timeout
      s.gameOver = true;
      var timedOutUser = s.currentTurn;
      // The other player wins
      var pIds = Object.keys(s.players);
      for (var t = 0; t < pIds.length; t++) {
        if (pIds[t] !== timedOutUser) {
          s.winner = pIds[t];
          break;
        }
      }

      if (!s.statsRecorded && s.winner && s.winner !== "draw") {
        s.statsRecorded = true;
        var winnerName = s.players[s.winner] ? s.players[s.winner].username : "";
        recordWin(nk, s.winner, winnerName);
        recordLoss(nk, timedOutUser);
      }

      var timeoutMsg = buildStateMessage(s);
      (timeoutMsg as any).timeout = true;
      (timeoutMsg as any).timedOutUser = timedOutUser;
      dispatcher.broadcastMessage(OP_CODE_DONE, JSON.stringify(timeoutMsg));
      return { state: s };
    }
  }

  for (var i = 0; i < messages.length; i++) {
    var message = messages[i];
    if (message.opCode !== OP_CODE_MOVE) continue;

    var sender = message.sender;

    // Validate it's the sender's turn
    if (sender.userId !== s.currentTurn) {
      dispatcher.broadcastMessage(
        OP_CODE_REJECTED,
        JSON.stringify({ reason: "not your turn" }),
        [sender]
      );
      continue;
    }

    var data: { position: number };
    try {
      data = JSON.parse(nk.binaryToString(message.data));
    } catch (e) {
      dispatcher.broadcastMessage(
        OP_CODE_REJECTED,
        JSON.stringify({ reason: "invalid data" }),
        [sender]
      );
      continue;
    }

    var position = data.position;

    // Validate position (0-indexed)
    if (typeof position !== "number" || position < 0 || position > 8) {
      dispatcher.broadcastMessage(
        OP_CODE_REJECTED,
        JSON.stringify({ reason: "invalid position" }),
        [sender]
      );
      continue;
    }

    // Validate cell is empty
    if (s.board[position] !== 0) {
      dispatcher.broadcastMessage(
        OP_CODE_REJECTED,
        JSON.stringify({ reason: "cell already occupied" }),
        [sender]
      );
      continue;
    }

    // Apply move
    var mark = s.marks[sender.userId];
    s.board[position] = mark;

    // Check for winner
    var winnerMark = checkWinner(s.board);
    if (winnerMark !== 0) {
      var markIds = Object.keys(s.marks);
      for (var j = 0; j < markIds.length; j++) {
        if (s.marks[markIds[j]] === winnerMark) {
          s.winner = markIds[j];
          break;
        }
      }
      s.gameOver = true;

      // Record stats
      if (!s.statsRecorded) {
        s.statsRecorded = true;
        var wId = s.winner as string;
        var wName = s.players[wId] ? s.players[wId].username : "";
        recordWin(nk, wId, wName);
        // Record loss for loser
        var allPlayerIds = Object.keys(s.players);
        for (var k = 0; k < allPlayerIds.length; k++) {
          if (allPlayerIds[k] !== wId) {
            recordLoss(nk, allPlayerIds[k]);
          }
        }
      }

      dispatcher.broadcastMessage(OP_CODE_DONE, JSON.stringify(buildStateMessage(s)));
    } else if (isBoardFull(s.board)) {
      s.gameOver = true;
      s.winner = "draw";

      // Record draw for both
      if (!s.statsRecorded) {
        s.statsRecorded = true;
        var drawPlayerIds = Object.keys(s.players);
        for (var k = 0; k < drawPlayerIds.length; k++) {
          recordDraw(nk, drawPlayerIds[k]);
        }
      }

      dispatcher.broadcastMessage(OP_CODE_DONE, JSON.stringify(buildStateMessage(s)));
    } else {
      // Switch turn
      var playerIds = Object.keys(s.players);
      for (var j = 0; j < playerIds.length; j++) {
        if (playerIds[j] !== sender.userId) {
          s.currentTurn = playerIds[j];
          break;
        }
      }
      // Reset turn timer
      s.turnStartTick = tick;
      dispatcher.broadcastMessage(OP_CODE_STATE, JSON.stringify(buildStateMessage(s)));
    }
  }

  return { state: s };
};

var matchSignal = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  data: string
) {
  return { state: state, data: data };
};

var matchTerminate = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  dispatcher: nkruntime.MatchDispatcher,
  tick: number,
  state: nkruntime.MatchState,
  graceSeconds: number
) {
  return null;
};

// RPC: Find an open match or create a new one
// Prioritizes matches that already have 1 player waiting
function rpcFindMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  // First: look for matches with exactly 1 player (someone waiting)
  var matches = nk.matchList(10, true, null, 1, 1, "+label.open:yes");


  if (matches.length > 0) {
    return JSON.stringify({ matchId: matches[0].matchId });
  }

  // No one waiting, create a new match
  var matchId = nk.matchCreate("tictactoe", {});
  return JSON.stringify({ matchId: matchId });
}

// RPC: Create a new match explicitly
function rpcCreateMatch(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var matchId = nk.matchCreate("tictactoe", {});
  return JSON.stringify({ matchId: matchId });
}

// RPC: Get leaderboard
function rpcGetLeaderboard(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 20, undefined, 0);
  var results: any[] = [];
  if (records && records.records) {
    for (var i = 0; i < records.records.length; i++) {
      var r = records.records[i];
      results.push({
        userId: r.ownerId,
        username: r.username ? r.username : "Unknown",
        wins: r.score,
        bestStreak: r.subscore,
        rank: r.rank,
      });
    }
  }
  return JSON.stringify({ records: results });
}

// RPC: Get player stats
function rpcGetStats(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  var userId = ctx.userId!;
  var stats = getPlayerStats(nk, userId);
  return JSON.stringify(stats);
}

// Entry point
var InitModule: nkruntime.InitModule = function (
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  // Create leaderboard (wins, descending, best score)
  nk.leaderboardCreate(LEADERBOARD_ID, true, "descending" as nkruntime.SortOrder, "best" as nkruntime.Operator);

  initializer.registerMatch("tictactoe", {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchSignal: matchSignal,
    matchTerminate: matchTerminate,
  });

  initializer.registerRpc("find_match", rpcFindMatch);
  initializer.registerRpc("create_match", rpcCreateMatch);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
  initializer.registerRpc("get_stats", rpcGetStats);

  logger.info("Tic-Tac-Toe module loaded.");
};
