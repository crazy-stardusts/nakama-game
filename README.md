# Nakama Tic-Tac-Toe

A real-time multiplayer Tic-Tac-Toe game built with [Nakama](https://heroiclabs.com/nakama/) (open-source game server) and React.

## Features

- Real-time multiplayer with WebSocket communication
- Automatic matchmaking (joins a waiting player or creates a new match)
- 30-second turn timer with auto-forfeit on timeout
- Global leaderboard ranked by wins and best streak
- Per-player stats: wins, losses, draws, current streak, best streak
- Device-based authentication with persistent sessions
- Forfeit detection on disconnect

## Architecture

```
client/          React SPA (Create React App)
  src/
    nakama.js        Nakama client SDK wrapper (auth, socket, RPCs)
    App.js           Screen router (Login -> Lobby -> Game / Leaderboard)
    components/      Login, Lobby, Game, Leaderboard UI components

backend/         Nakama server-side module (TypeScript -> ES5 JS)
  src/
    main.ts          Match handler + RPC functions
  modules/           Compiled JS output mounted into Nakama container
  docker-compose.yml Nakama + PostgreSQL services
```

### Design Decisions

- **Server-authoritative game logic** -- All move validation, win detection, and stat recording happen in the Nakama match handler (`backend/src/main.ts`). The client only sends move intents; the server rejects invalid moves and broadcasts the authoritative state.
- **Op-code messaging** -- The client and server communicate via numeric op codes (`MOVE=1`, `STATE=2`, `DONE=3`, `REJECTED=4`) over Nakama's real-time match data channel.
- **Device authentication** -- Players authenticate with a random device ID stored in `localStorage`. Returning users are auto-logged in; new users pick a nickname on first visit.
- **Tick-based turn timer** -- The match loop runs at 5 ticks/second. Turn timeout is calculated by comparing the current tick against the tick when the turn started, providing a consistent server-side timer independent of client clocks.
- **ES5 target** -- Nakama's embedded JS runtime (goja) does not support modern JS features, so the backend is compiled to ES5 via esbuild with specific feature flags.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Node.js](https://nodejs.org/) >= 18 (for local client development)

## Setup and Installation

### 1. Backend (Nakama server)

```bash
cd backend

# Install dependencies and build the server module
npm install
npm run build

# Start Nakama + PostgreSQL via Docker Compose
docker compose up -d
```

This starts:
| Service    | Port  | Purpose                          |
|------------|-------|----------------------------------|
| Nakama     | 7350  | Client API (gRPC/HTTP/WebSocket) |
| Nakama     | 7351  | Console API                      |
| PostgreSQL | 5432  | Database                         |

The Nakama console is available at `http://localhost:7351` (default credentials: `admin` / `password`).

### 2. Client (React app)

```bash
cd client

npm install
npm start
```

The client runs on `http://localhost:3000` and connects to `127.0.0.1:7350` by default.

#### Environment Variables

| Variable                    | Default     | Description               |
|-----------------------------|-------------|---------------------------|
| `REACT_APP_NAKAMA_HOST`     | `127.0.0.1` | Nakama server hostname   |
| `REACT_APP_NAKAMA_PORT`     | `7350`       | Nakama client API port   |
| `REACT_APP_NAKAMA_USE_SSL`  | (unset)      | Set to `"true"` for HTTPS/WSS |



## API / Server Configuration

### RPC Endpoints

All RPCs are called via the Nakama client SDK (`client.rpc(session, rpcName, payload)`).

| RPC Name          | Auth Required | Description                                                    |
|-------------------|---------------|----------------------------------------------------------------|
| `find_match`      | Yes           | Finds a match with 1 waiting player, or creates a new one     |
| `create_match`    | Yes           | Creates a new match unconditionally                            |
| `get_leaderboard` | Yes           | Returns top 20 players ranked by wins (subscore = best streak) |
| `get_stats`       | Yes           | Returns the calling player's stats (wins/losses/draws/streak)  |

### Match Op Codes

| Code | Name       | Direction        | Payload                                      |
|------|------------|------------------|----------------------------------------------|
| 1    | `MOVE`     | Client -> Server | `{ "position": 0-8 }`                        |
| 2    | `STATE`    | Server -> Client | Full game state (board, players, turn, timer) |
| 3    | `DONE`     | Server -> Client | Final state + winner (may include `forfeit` or `timeout` flag) |
| 4    | `REJECTED` | Server -> Client | `{ "reason": "..." }` -- invalid move        |

### Nakama Server Settings

Key runtime flags (set in `docker-compose.yml` / Dockerfile entrypoint):

- `--logger.level DEBUG` -- Log verbosity (use `INFO` in production)
- `--session.token_expiry_sec 7200` -- Session tokens expire after 2 hours
- `--runtime.js_entrypoint index.js` -- Entry point for the JS match module

## Testing Multiplayer

### Local Testing

1. Start the backend: `cd backend && docker compose up`
2. Start the client: `cd client && npm start`
3. Open **two browser tabs** (or one regular + one incognito window) to `http://localhost:3000`
4. In **Tab 1**: Enter a nickname and click Play -- you'll be placed in a new match, waiting for an opponent
5. In **Tab 2**: Enter a different nickname and click Play -- matchmaking pairs you with Tab 1
6. Take turns clicking cells. The server validates each move and broadcasts updated state to both players.

