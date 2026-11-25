// Garde l'écran allumé tant qu'un service est en cours et que l'app est au premier plan.
// Android rétablit de lui-même la veille normale quand l'app passe en arrière-plan ; en fin de service,
// on la rétablit explicitement.
import { useEffect } from 'react';
import { loadJournal, onJournalChange, statusOf, type JournalEvent } from '../journal/store';

const TAG = 'service';

type KeepAwake = typeof import('expo-keep-awake');
let mod: KeepAwake | null | undefined;
/** Chargé à la demande : si le module natif manquait, l'app continuerait de fonctionner sans lui. */
function keepAwake(): KeepAwake | null {
  if (mod === undefined) {
    try {
      mod = require('expo-keep-awake') as KeepAwake;
    } catch {
      mod = null;
    }
  }
  return mod;
}

function apply(events: JournalEvent[]) {
  const onDuty = statusOf(events).status !== 'hors-service';
  try {
    const k = keepAwake();
    if (!k) return;
    if (onDuty) k.activateKeepAwakeAsync(TAG).catch(() => {});
    else k.deactivateKeepAwake(TAG).catch(() => {});
  } catch {
    // module natif absent (ancienne version installée) : l'écran suit la veille normale
  }
}

export function KeepAwakeOnDuty() {
  useEffect(() => {
    loadJournal().then(apply);
    return onJournalChange(apply);
  }, []);
  return null;
}
