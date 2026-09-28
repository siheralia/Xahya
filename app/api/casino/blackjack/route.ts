import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Card = { rank: string; suit: string; value: number };
type GameState = {
  bet: number;
  luck: number;
  deck: Card[];
  player: Card[];
  dealer: Card[];
};

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  ["A", 11], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6],
  ["7", 7], ["8", 8], ["9", 9], ["10", 10], ["J", 10], ["Q", 10], ["K", 10],
] as const;

function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map(([rank, value]) => ({ rank, suit, value })),
  );
}

function handValue(hand: Card[]) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(hand: Card[]) {
  return hand.length === 2 && handValue(hand) === 21;
}

function draw(deck: Card[], luck: number, favorable: boolean) {
  if (deck.length === 0) throw new Error("La baraja se agotó.");

  const safeLuck = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  let bias = 0;

  if (safeLuck < 10) bias = -Math.min(0.08, (10 - safeLuck) * 0.008);
  else if (safeLuck > 20) bias = Math.min(0.08, (safeLuck - 20) * 0.008);

  const effectiveBias = favorable ? bias : -bias;
  const weighted = deck.map((card) => {
    const high = card.value >= 10 || card.rank === "A";
    const factor = high ? 1 + effectiveBias : 1 - effectiveBias;
    return Math.max(0.01, factor);
  });
  const total = weighted.reduce((sum, value) => sum + value, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < deck.length; i += 1) {
    roll -= weighted[i];
    if (roll < 0) return { card: deck[i], deck: deck.filter((_, index) => index !== i) };
  }

  return { card: deck[deck.length - 1], deck: deck.slice(0, -1) };
}

function dealInitial(deck: Card[], luck: number) {
  const player: Card[] = [];
  const dealer: Card[] = [];
  let remaining = deck;

  for (let i = 0; i < 2; i += 1) {
    const playerDraw = draw(remaining, luck, true);
    player.push(playerDraw.card);
    remaining = playerDraw.deck;

    const dealerDraw = draw(remaining, luck, false);
    dealer.push(dealerDraw.card);
    remaining = dealerDraw.deck;
  }

  return { player, dealer, deck: remaining };
}

function dealerPlay(state: GameState) {
  const dealer = [...state.dealer];
  let deck = [...state.deck];

  while (handValue(dealer) < 17) {
    const next = draw(deck, state.luck, false);
    dealer.push(next.card);
    deck = next.deck;
  }

  return { dealer, deck };
}

function resultFor(player: Card[], dealer: Card[]) {
  const playerValue = handValue(player);
  const dealerValue = handValue(dealer);

  if (playerValue > 21) return "lose";
  if (dealerValue > 21) return "win";
  if (playerValue > dealerValue) return "win";
  if (playerValue < dealerValue) return "lose";
  return "tie";
}

function payoutFor(result: string, bet: number, natural: boolean) {
  if (result === "tie") return bet;
  if (result === "win") return bet + Math.round(bet * (natural ? 1.5 : 1));
  return 0;
}

async function getCurrentUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const characters = await db.orm.public.Character.all();
  const resources = await db.orm.public.CharacterResource.all();

  return NextResponse.json({
    characters: characters
      .filter((character) => Number(character.userId) === Number(user.id))
      .map((character) => {
        const resource = resources.find(
          (candidate) => Number(candidate.characterId) === Number(character.id),
        );
        return {
          id: character.id,
          name: character.name,
          money: Number(resource?.money ?? 0),
          karma: Number(resource?.karma ?? 0),
          activeGame: Boolean(resource?.blackjackState),
        };
      }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const characterId = Number(body?.characterId);
  const action = String(body?.action ?? "");
  const bet = Number(body?.bet);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return NextResponse.json({ error: "Personaje inválido." }, { status: 400 });
  }

  if (!["start", "hit", "stand"].includes(action)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character || Number(character.userId) !== Number(user.id)) {
    return NextResponse.json({ error: "Ese personaje no te pertenece." }, { status: 403 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const resource = await tx.orm.public.CharacterResource
        .where({ characterId })
        .first();

      if (!resource) throw new Error("Los recursos del personaje no están disponibles.");

      const money = Number(resource.money);
      const karma = Number(resource.karma);
      const activeState = resource.blackjackState
        ? JSON.parse(String(resource.blackjackState)) as GameState
        : null;

      if (action === "start") {
        if (activeState) throw new Error("Ya tienes una partida de Blackjack activa.");
        if (!Number.isInteger(bet) || bet <= 0) throw new Error("La apuesta debe ser un entero mayor que 0.");
        if (bet > money) throw new Error("La apuesta no puede superar el dinero disponible.");
        if (karma < 1) throw new Error("Necesitas al menos 1 karma para jugar.");

        const stats = await tx.orm.public.CharacterStat.where({ characterId }).first();
        const luck = Number(stats?.luck ?? 0);
        const dealt = dealInitial(createDeck(), luck);
        const state: GameState = { bet, luck, deck: dealt.deck, player: dealt.player, dealer: dealt.dealer };

        let finalState: GameState | null = state;
        let outcome = "playing";
        let payout = 0;
        let finalMoney = money - bet;

        if (isBlackjack(dealt.player) || isBlackjack(dealt.dealer)) {
          if (isBlackjack(dealt.player) && isBlackjack(dealt.dealer)) {
            outcome = "tie";
            payout = bet;
          } else if (isBlackjack(dealt.player)) {
            outcome = "blackjack";
            payout = payoutFor("win", bet, true);
          } else {
            outcome = "lose";
            payout = 0;
          }
          finalMoney += payout;
          finalState = null;
        }

        await tx.orm.public.CharacterResource.where({ id: resource.id }).update({
          money: finalMoney,
          karma: karma - 1,
          blackjackState: finalState ? JSON.stringify(finalState) : null,
        });

        return {
          action: "start",
          player: dealt.player,
          dealer: dealt.dealer,
          dealerHidden: !finalState,
          value: handValue(dealt.player),
          dealerValue: finalState ? handValue(dealt.dealer) : handValue(dealt.dealer),
          outcome,
          payout: payout - bet,
          money: finalMoney,
          karma: karma - 1,
          active: Boolean(finalState),
        };
      }

      if (!activeState) throw new Error("No tienes una partida activa.");

      if (action === "hit") {
        const next = draw(activeState.deck, activeState.luck, true);
        const player = [...activeState.player, next.card];
        const nextState = { ...activeState, deck: next.deck, player };

        if (handValue(player) > 21) {
          await tx.orm.public.CharacterResource.where({ id: resource.id }).update({
            blackjackState: null,
          });
          return {
            action: "hit",
            player,
            dealer: activeState.dealer,
            dealerHidden: false,
            value: handValue(player),
            dealerValue: handValue(activeState.dealer),
            outcome: "lose",
            payout: -activeState.bet,
            money,
            karma,
            active: false,
          };
        }

        await tx.orm.public.CharacterResource.where({ id: resource.id }).update({
          blackjackState: JSON.stringify(nextState),
        });

        return {
          action: "hit",
          player,
          dealer: activeState.dealer,
          dealerHidden: true,
          value: handValue(player),
          dealerValue: handValue(activeState.dealer.slice(0, 1)),
          outcome: "playing",
          payout: 0,
          money,
          karma,
          active: true,
        };
      }

      const dealerResult = dealerPlay(activeState);
      const outcome = resultFor(activeState.player, dealerResult.dealer);
      const payout = payoutFor(outcome, activeState.bet, false);
      const finalMoney = money + payout;

      await tx.orm.public.CharacterResource.where({ id: resource.id }).update({
        money: finalMoney,
        blackjackState: null,
      });

      return {
        action: "stand",
        player: activeState.player,
        dealer: dealerResult.dealer,
        dealerHidden: false,
        value: handValue(activeState.player),
        dealerValue: handValue(dealerResult.dealer),
        outcome,
        payout: payout - activeState.bet,
        money: finalMoney,
        karma,
        active: false,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la partida.";
    const known = new Set([
      "Los recursos del personaje no están disponibles.",
      "Ya tienes una partida de Blackjack activa.",
      "La apuesta debe ser un entero mayor que 0.",
      "La apuesta no puede superar el dinero disponible.",
      "Necesitas al menos 1 karma para jugar.",
      "No tienes una partida activa.",
    ]);
    return NextResponse.json(
      { error: known.has(message) ? message : "No se pudo completar la partida." },
      { status: known.has(message) ? 400 : 500 },
    );
  }
}
