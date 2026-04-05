import React, { useState, useEffect, useCallback, useRef } from "react";
import { getSocket, sendMove, leaveMatch, getSession } from "../nakama";

const OP_CODE_STATE = 2;
const OP_CODE_DONE = 3;
const OP_CODE_REJECTED = 4;

const MARK_SYMBOLS = { 1: "X", 2: "O" };

export default function Game({ matchId, onLeave }) {
  const [board, setBoard] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [players, setPlayers] = useState({});
  const [currentTurn, setCurrentTurn] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [forfeit, setForfeit] = useState(false);
  const [timeout, setTimeoutFlag] = useState(false);
  const [timedOutUser, setTimedOutUser] = useState(null);
  const [myMark, setMyMark] = useState(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(true);
  const [error, setError] = useState("");
  const [timed, setTimed] = useState(false);
  const [turnTimeRemaining, setTurnTimeRemaining] = useState(null);
  const [turnTimeTotal, setTurnTimeTotal] = useState(30);

  const timerRef = useRef(null);
  const serverTimeRef = useRef(null);

  const session = getSession();
  const myUserId = session?.user_id;

  // Client-side countdown that ticks every second between server updates
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (!timed || gameOver || waitingForOpponent || serverTimeRef.current === null) {
      setTurnTimeRemaining(null);
      return;
    }

    setTurnTimeRemaining(serverTimeRef.current);
    timerRef.current = setInterval(() => {
      setTurnTimeRemaining((prev) => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timed, gameOver, waitingForOpponent, currentTurn]);

  const processState = useCallback(
    (data) => {
      setBoard(data.board);
      setPlayers(data.players || {});
      setCurrentTurn(data.currentTurn);
      setGameOver(data.gameOver || false);
      setWinner(data.winner || null);
      setTimed(data.timed || false);

      if (data.turnTimeRemaining !== undefined) {
        serverTimeRef.current = data.turnTimeRemaining;
        setTurnTimeRemaining(data.turnTimeRemaining);
      }
      if (data.turnTimeTotal !== undefined) {
        setTurnTimeTotal(data.turnTimeTotal);
      }

      if (data.players && myUserId && data.players[myUserId]) {
        setMyMark(data.players[myUserId].mark);
      }

      const playerCount = data.playerCount || Object.keys(data.players || {}).length;
      setWaitingForOpponent(playerCount < 2);
    },
    [myUserId]
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMatchData = (matchData) => {
      if (matchData.match_id !== matchId) return;

      let data;
      try {
        data = JSON.parse(new TextDecoder().decode(matchData.data));
      } catch {
        return;
      }

      switch (matchData.op_code) {
        case OP_CODE_STATE:
          processState(data);
          break;
        case OP_CODE_DONE:
          processState(data);
          setGameOver(true);
          if (data.forfeit) setForfeit(true);
          if (data.timeout) {
            setTimeoutFlag(true);
            setTimedOutUser(data.timedOutUser || null);
          }
          break;
        case OP_CODE_REJECTED:
          setError(data.reason || "Move rejected");
          setTimeout(() => setError(""), 2000);
          break;
        default:
          break;
      }
    };

    socket.onmatchdata = handleMatchData;

    return () => {
      socket.onmatchdata = null;
    };
  }, [matchId, processState]);

  const handleCellClick = (index) => {
    if (gameOver || waitingForOpponent) return;
    if (currentTurn !== myUserId) return;
    if (board[index] !== 0) return;

    sendMove(matchId, index);
  };

  const handleLeave = () => {
    leaveMatch(matchId);
    onLeave();
  };

  const isMyTurn = currentTurn === myUserId;

  const getStatusText = () => {
    if (waitingForOpponent) return "Waiting for opponent to join...";
    if (gameOver) {
      if (winner === "draw") return "It's a draw!";
      if (timeout) {
        return timedOutUser === myUserId
          ? "Time's up - you lose!"
          : "Opponent ran out of time - you win!";
      }
      if (forfeit) {
        return winner === myUserId
          ? "Opponent left - you win!"
          : "You left - opponent wins!";
      }
      return winner === myUserId ? "You win!" : "You lose!";
    }
    return isMyTurn ? "Your turn" : "Opponent's turn";
  };

  const getOpponent = () => {
    for (const [userId, p] of Object.entries(players)) {
      if (userId !== myUserId) return p;
    }
    return null;
  };

  const opponent = getOpponent();
  const myPlayer = players[myUserId];

  const timerPercent = turnTimeRemaining !== null && turnTimeTotal > 0
    ? (turnTimeRemaining / turnTimeTotal) * 100
    : 100;

  const timerDanger = turnTimeRemaining !== null && turnTimeRemaining <= 5;

  return (
    <div className="screen game-screen">
      <div className="game-header">
        <div className="player-info me">
          <span className="player-mark">{myMark ? MARK_SYMBOLS[myMark] : "?"}</span>
          <span className="player-name">{myPlayer?.username || "You"}</span>
          {isMyTurn && !gameOver && !waitingForOpponent && (
            <span className="turn-indicator" />
          )}
        </div>
        <div className="vs">VS</div>
        <div className="player-info opponent">
          {opponent ? (
            <>
              <span className="player-mark">
                {opponent.mark ? MARK_SYMBOLS[opponent.mark] : "?"}
              </span>
              <span className="player-name">{opponent.username}</span>
              {!isMyTurn && !gameOver && !waitingForOpponent && (
                <span className="turn-indicator" />
              )}
            </>
          ) : (
            <span className="player-name waiting">Waiting...</span>
          )}
        </div>
      </div>

      {timed && !waitingForOpponent && !gameOver && turnTimeRemaining !== null && (
        <div className="timer-bar-container">
          <div
            className={`timer-bar ${timerDanger ? "danger" : ""}`}
            style={{ width: timerPercent + "%" }}
          />
          <span className={`timer-text ${timerDanger ? "danger" : ""}`}>
            {turnTimeRemaining}s
          </span>
        </div>
      )}

      <div className="status-bar">
        <p className={`status-text ${gameOver ? "game-over" : ""}`}>
          {getStatusText()}
        </p>
        {waitingForOpponent && matchId && (
          <div className="match-id-display">
            <span className="match-id-label">Match ID:</span>
            <button
              className="match-id-copy"
              onClick={() => {
                navigator.clipboard.writeText(matchId);
                setError("Copied!");
                setTimeout(() => setError(""), 1500);
              }}
              title="Click to copy"
            >
              {matchId.split(".")[0].slice(0, 8)}... (tap to copy)
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="board">
        {board.map((cell, index) => (
          <button
            key={index}
            className={`cell ${cell !== 0 ? "filled" : ""} ${
              cell === 0 && isMyTurn && !gameOver && !waitingForOpponent
                ? "clickable"
                : ""
            } ${cell === 1 ? "mark-x" : ""} ${cell === 2 ? "mark-o" : ""}`}
            onClick={() => handleCellClick(index)}
            disabled={
              cell !== 0 || !isMyTurn || gameOver || waitingForOpponent
            }
          >
            {cell !== 0 ? MARK_SYMBOLS[cell] : ""}
          </button>
        ))}
      </div>

      <button className="leave-btn" onClick={handleLeave}>
        {gameOver ? "Back to Lobby" : "Leave Match"}
      </button>
    </div>
  );
}
