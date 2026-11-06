import { StateView, type Schema } from '@colyseus/schema';
import type { TeamId } from '@escape/shared';
import type { GameState } from '../state/GameState.js';

export type Audience = 'host' | 'lobby' | TeamId | undefined;

export function canSeePlayer(audience: Audience, teamId: TeamId | undefined) {
  return audience === 'host' || (audience === 'lobby' ? !teamId : !!teamId && audience === teamId);
}

/** Only called at membership transitions. The schema encoder filters subsequent deltas. */
export function syncVisibility(view: StateView, state: GameState, audience: Audience) {
  function grant(object: Schema, allowed: boolean) {
    if (allowed && !view.has(object)) view.add(object);
    if (!allowed && view.has(object)) view.remove(object);
  }
  const roomId = audience && state.teams.get(audience)?.roomId;
  for (const player of state.players.values()) grant(player, canSeePlayer(audience, player.teamId));
  for (const team of state.teams.values()) grant(team, audience === 'host' || audience === team.id);
  for (const door of state.doors.values())
    grant(door, audience === 'host' || (!!roomId && door.roomId === roomId));
}
