// Chapter 1: A Place on the Shelf. Stages, dialogue, choices, jobs. Data-driven where it helps.
import * as THREE from 'three';
import { Bus, GameEvent } from '../core/bus';
import { GameState, Item } from './state';

export enum S {
  TalkMara,
  Eat,
  Water,
  Scavenge,
  RepairHome,
  Trade,
  LiftJob,
  RepairLift,
  RideUp,
  MeetOdo,
  Candy,
  Choose,
  Checkpoint,
  Registry,
  Free,
}

export interface Option {
  label: string;
  run?: () => DialogueNode | null | void;
  disabled?: boolean;
}
export interface DialogueNode {
  speaker: string;
  text: string;
  options: Option[];
}

export interface StoryHost {
  state: GameState;
  bus: Bus;
  openTrade(vendor: string): void;
  triggerCandy(delay: number): void;
  openCheckpoint(): void;
  setLiftWorking(id: string): void;
  hotspotPos(id: string): THREE.Vector3 | null;
  npcPos(id: string): THREE.Vector3 | null;
  save(): void;
  time(): number;
  district(): string;
  npcName(id: string): string;
  repairLift(): boolean;
}

const OBJECTIVES: Record<S, string> = {
  [S.TalkMara]: 'Find whoever is talking outside your matchbox',
  [S.Eat]: 'Share a meal at the Common Table kitchen',
  [S.Water]: 'Collect water at the dripping straw',
  [S.Scavenge]: 'Scavenge 3 scrap and 1 fabric in the Spill',
  [S.RepairHome]: 'Repair your sleeping space (3 scrap, 1 fabric)',
  [S.Trade]: 'Sell spare salvage to Rook at the Salvage Union workshop',
  [S.LiftJob]: 'Ask Ines about the broken lift',
  [S.RepairLift]: 'Repair the lift motor (1 metal, 1 electronics)',
  [S.RideUp]: 'Ride the lift up to Threadmarket',
  [S.MeetOdo]: "Look for work: talk to Odo at the crumb stall",
  [S.Candy]: 'The sky is dropping sugar — collect 3 candy shards in the Commons',
  [S.Choose]: 'Decide: give your shards to Auntie Bel, or sell them to Warden Calloway',
  [S.Checkpoint]: 'Show your pass at the upper checkpoint',
  [S.Registry]: 'Visit the Registry of the Shelf in the Heights',
  [S.Free]: '',
};

export class Story {
  stage: S = S.TalkMara;
  choice: 'community' | 'authority' | null = null;
  flags = new Set<string>();
  signatures = 0;
  signed = new Set<string>();
  deliveries = 0;
  job: { kind: 'delivery' | 'repair'; to?: string; reward: number } | null = null;
  shardsCollected = 0;

  constructor(private h: StoryHost) {
    h.bus.on((e) => this.onEvent(e));
  }

  objective(): string {
    if (this.stage !== S.Free) return OBJECTIVES[this.stage];
    if (this.job?.kind === 'delivery') return `Deliver Pip's parcel to ${NAMES[this.job.to!] ?? this.job.to}`;
    if (this.job?.kind === 'repair') return 'Bring Dov 2 scrap and 1 metal for a repair job';
    if (this.choice === 'community') {
      if (this.signatures < 10) return `Water Petition: gather signatures from residents (${this.signatures}/10)`;
      const debt = this.h.state.debt;
      return debt > 0 ? `Pay your ${debt}-token levy, then file the petition with Registrar Quill` : 'Return the signed petition to Registrar Quill';
    }
    if (this.choice === 'authority') return this.flags.has('resident') ? 'You hold a Heights residence. Chapter 2 awaits.' : 'Save 150 tokens for a Heights Residence Permit (Registry)';
    return 'Explore the shelf';
  }

  /** World position of the current objective (for the HUD marker and map). */
  marker(): THREE.Vector3 | null {
    const h = this.h;
    const m: Partial<Record<S, () => THREE.Vector3 | null>> = {
      [S.TalkMara]: () => h.npcPos('mara'),
      [S.Eat]: () => h.hotspotPos('kitchen-depths'),
      [S.Water]: () => h.hotspotPos('water-depths'),
      [S.Scavenge]: () => h.hotspotPos('heap0'),
      [S.RepairHome]: () => h.hotspotPos('bed-player'),
      [S.Trade]: () => h.npcPos('rook'),
      [S.LiftJob]: () => h.npcPos('ines'),
      [S.RepairLift]: () => (this.h.state.count('metal') && this.h.state.count('electronics') ? h.hotspotPos('repair-lift') : h.hotspotPos('heap2')),
      [S.RideUp]: () => h.hotspotPos('lift-depths'),
      [S.MeetOdo]: () => h.npcPos('odo'),
      [S.Candy]: () => h.hotspotPos('candy-core'),
      [S.Choose]: () => h.npcPos('bel'),
      [S.Checkpoint]: () => h.hotspotPos('checkpoint'),
      [S.Registry]: () => h.hotspotPos('office'),
    };
    if (this.stage === S.Free) {
      if (this.job?.kind === 'delivery') return h.npcPos(this.job.to!);
      if (this.job?.kind === 'repair') return h.npcPos('dov');
      if (this.choice === 'community' && this.signatures >= 10) return h.hotspotPos('office');
      return null;
    }
    return m[this.stage]?.() ?? null;
  }

  advance(to: S): void {
    if (to <= this.stage) return;
    this.stage = to;
    this.h.bus.emit({ type: 'quest', id: 'ch1', stage: to });
    if (to !== S.Free) this.h.bus.emit({ type: 'toast', text: `New objective: ${OBJECTIVES[to]}`, kind: 'info' });
    this.h.save();
  }

  private onEvent(e: GameEvent): void {
    const st = this.h.state;
    if (e.type === 'eat' && this.stage === S.Eat) this.advance(S.Water);
    if (e.type === 'collect' && e.item === 'water' && this.stage === S.Water) this.advance(S.Scavenge);
    if (e.type === 'collect' && this.stage === S.Scavenge && st.count('scrap') >= 3 && st.count('fabric') >= 1) this.advance(S.RepairHome);
    if (e.type === 'repair' && e.id === 'home' && this.stage <= S.RepairHome) this.advance(S.Trade);
    if (e.type === 'trade' && !e.buy && this.stage === S.Trade) this.advance(S.LiftJob);
    if (e.type === 'repair' && e.id === 'lift') this.advance(S.RideUp);
    if (e.type === 'enter' && e.zone === 'market' && this.stage === S.RideUp) this.advance(S.MeetOdo);
    if (e.type === 'collect' && e.item === 'candy') {
      this.shardsCollected += e.qty;
      if (this.stage === S.Candy && st.count('candy') >= 3) this.advance(S.Choose);
    }
    if (e.type === 'enter' && e.zone === 'heights' && this.stage === S.Checkpoint) this.advance(S.Registry);
  }

  // ---------- dialogue ----------
  talk(id: string): DialogueNode {
    const st = this.h.state;
    const bye: Option = { label: 'Goodbye.' };
    const trade = (v: string): Option => ({ label: 'Show me what you have.', run: () => (this.h.openTrade(v), null) });
    switch (id) {
      case 'mara': {
        if (this.stage === S.TalkMara) {
          const greet = this.flags.has('wake:shout')
            ? "You've got lungs, I'll give you that. Half the Row thought the giant was back."
            : this.flags.has('wake:escape')
              ? 'Already looking for the door? Everyone does, the first day. There isn\'t one. Not for us.'
              : 'Came out on your own. Careful one. Good. Careful lives longer down here.';
          const next = (asked: boolean): DialogueNode => {
            this.advance(S.Eat);
            this.h.bus.emit({ type: 'toast', text: `You owe the Shelf Authority a ${st.debt}-token arrival levy.`, kind: 'bad' });
            return {
              speaker: 'Mara',
              text:
                (asked
                  ? "Some say we came in through a crack in the back panel. Some say we were put here, one at a time, by a hand. Nobody remembers the getting-small part. You won't either. "
                  : '') +
                `Eat first: the Common Table feeds anyone who walks in. Fill a cap at the drip. Dig the Spill for scrap and patch that matchbox you woke in. It's yours now. And the Authority's already written your name in its ledger: ${st.debt} tokens, the arrival levy. Everyone owes it. Nobody pays it fast.`,
              options: [{ label: "I'll manage. Thanks, Mara." }],
            };
          };
          return {
            speaker: 'Mara',
            text: `${greet} I'm Mara. This is the Depths, the bottom of the cabinet. How you got small, why you're here... I could tell you what people say, but you wouldn't believe it on an empty stomach.`,
            options: [
              { label: 'Tell me anyway.', run: () => next(true) },
              { label: 'Then where do I eat?', run: () => next(false) },
            ],
          };
        }
        if (this.stage < S.LiftJob)
          return { speaker: 'Mara', text: this.hintText(), options: [{ label: 'Right.' }] };
        if (this.job?.kind === 'delivery' && this.job.to === 'mara') return this.deliver('mara');
        if (this.choice === 'community')
          return { speaker: 'Mara', text: 'They say you gave the candy to the Table. Kids on Drip Row ate sugar tonight. That will be remembered down here.', options: [this.signOption('mara'), bye] };
        if (this.choice === 'authority')
          return { speaker: 'Mara', text: "Authority tokens spend the same as ours, I suppose. Just remember who fed you when you arrived.", options: [bye] };
        return { speaker: 'Mara', text: 'The lift hums again. Go on up — Threadmarket is where work is. And where the sky drops things.', options: [bye] };
      }
      case 'ines': {
        if (this.stage < S.LiftJob)
          return { speaker: 'Ines', text: "The lift's dead. Motor brushes are cooked and the contact's gone. Get yourself sorted first — Mara will point you right — then come talk shop.", options: [bye] };
        if (this.stage === S.LiftJob)
          return {
            speaker: 'Ines',
            text: "Salvage Union work, if you want it. I need one bit of metal for the brush spring and one bit of electronics for the contact. The Spill coughs up both if you dig. Fix it and the Union pays twenty tokens — and the whole Depths can reach the market again.",
            options: [{ label: "I'll find the parts.", run: () => (this.advance(S.RepairLift), null) }, bye],
          };
        if (this.stage === S.RepairLift) {
          const ok = st.count('metal') >= 1 && st.count('electronics') >= 1;
          return {
            speaker: 'Ines',
            text: ok ? "That's the spring and that's a contact. Hold the housing open while I seat them." : `One metal, one electronics. You have ${st.count('metal')} and ${st.count('electronics')}. The Spill's even heaps are best for metal.`,
            options: ok ? [{ label: 'Fit the parts together.', run: () => (this.h.repairLift(), null) }, bye] : [bye],
          };
        }
        return { speaker: 'Ines', text: 'Listen to it purr. Union looks after its own — and you count now.', options: [bye] };
      }
      case 'rook':
        return {
          speaker: 'Rook',
          text: this.stage === S.Trade ? "New face. Mara send you? I buy scrap, metal, electronics, cloth. Fair weight, honest tokens. Sell me a piece and you'll see." : 'Got salvage? I pay. Need metal? I sell — at Union rates.',
          options: [trade('rook'), bye],
        };
      case 'pell':
        return { speaker: 'Pell', text: `Crumbs and water. Prices follow the shelf — supply's ${this.supplyWord()} right now.`, options: [trade('pell'), bye] };
      case 'odo': {
        if (this.stage === S.MeetOdo)
          return {
            speaker: 'Odo',
            text: "Work? Ha. Everybody wants work and nobody wants to haul. Tell you what — help me shift these crates and — wait. Do you feel that? The light's going. LOOK UP!",
            options: [
              {
                label: '...?',
                run: () => {
                  this.advance(S.Candy);
                  this.h.triggerCandy(1.5);
                  return null;
                },
              },
            ],
          };
        return { speaker: 'Odo', text: `Fresh-ish crumbs! Supply's ${this.supplyWord()}, so are my prices.`, options: [trade('odo'), bye] };
      }
      case 'wren':
        return { speaker: 'Wren', text: 'Water by the cap. The Heights has a whole reservoir up there, you know. We buy their runoff.', options: [trade('wren'), bye] };
      case 'sela':
        return { speaker: 'Sela', text: 'Thread, patches, a good strap. Runners buy their bags here. A satchel lets you carry twice as much — two fabric and a scrap at any workbench.', options: [trade('sela'), bye] };
      case 'tobb':
        return { speaker: 'Tobb', text: 'Salvage bought and sold. Electronics are dear — the giant never drops those.', options: [trade('tobb'), bye] };
      case 'marrow':
        return { speaker: 'Lady Marrow', text: 'Preserved fruit, fine water. We accept tokens. We accept candy at a generous rate, naturally.', options: [trade('marrow'), bye] };
      case 'bel':
        return this.belTalk();
      case 'calloway':
        return this.callowayTalk();
      case 'pip':
        return this.pipTalk();
      case 'dov':
        return this.dovTalk();
      case 'guard1':
        return this.guardTalk();
      case 'quill':
        return this.registryTalk();
      case 'duke':
        return this.dukeTalk();
      default:
        return this.genericTalk(id);
    }
  }

  private hintText(): string {
    switch (this.stage) {
      case S.Eat:
        return 'Common Table first. The big lid by the lift. Old Fenna will fill your bowl.';
      case S.Water:
        return "The straw over by the thimble leaks day and night. That's our water. Fill a cap.";
      case S.Scavenge:
        return 'The Spill, west end, past the sign. Things fall through the shelf cracks. Dig.';
      case S.RepairHome:
        return 'Your matchbox: red one, third along. Use the scrap on the bed, the fabric for a blanket.';
      case S.Trade:
        return "Rook at the workshop buys salvage. You'll want tokens before you head up.";
      default:
        return 'Keep at it.';
    }
  }

  private supplyWord(): string {
    const f = this.h.state.supplyFactor();
    return f > 1.4 ? 'thin' : f > 0.9 ? 'steady' : 'plentiful';
  }

  private belTalk(): DialogueNode {
    const st = this.h.state;
    if (this.stage === S.Choose || (this.stage === S.Candy && st.count('candy') > 0)) {
      const n = st.count('candy');
      return {
        speaker: 'Auntie Bel',
        text: `Sugar from the sky, and the Warden already wants it locked in that jar. Give what you gathered to the Table, love, and it goes in bowls tonight: every tier below this one eats. I won't lie to you. Calloway will call it disorderly, and he'll add it to your levy. You've got ${n} shard${n === 1 ? '' : 's'}.`,
        options: [
          { label: `Give ${n} shard${n === 1 ? '' : 's'} to the Table: +15 on your levy.`, disabled: n < 1, run: () => this.decide('community') },
          { label: "I'm still deciding." },
        ],
      };
    }
    if (this.job?.kind === 'delivery' && this.job.to === 'bel') return this.deliver('bel');
    if (this.choice === 'community')
      return { speaker: 'Auntie Bel', text: "Look at them eat. You did that. Pip's been asking for you — Runners look after people who look after people.", options: [this.signOption('bel'), { label: 'Goodbye.' }] };
    if (this.choice === 'authority') return { speaker: 'Auntie Bel', text: 'The jar is full and the bowls are empty. I hope the tokens were sweet.', options: [{ label: 'Goodbye.' }] };
    return { speaker: 'Auntie Bel', text: 'No one eats alone at the Common Table. Not even up here.', options: [{ label: 'Goodbye.' }] };
  }

  private callowayTalk(): DialogueNode {
    const st = this.h.state;
    if (this.stage === S.Choose || (this.stage === S.Candy && st.count('candy') > 0)) {
      const n = st.count('candy');
      const pay = Math.min(n, 4) * 15; // the Warden pays for four at most; the rest is "public property"
      return {
        speaker: 'Warden Calloway',
        text: `Three falls ago the Row got its sugar "unrationed". Four dead in the scramble, a lift cable cut, and nothing in the bowls by the dry weeks. The Granary isn't greed. It's the only reason anyone eats when the sky goes quiet. Give me your shards: I'll strike your ${st.debt}-token levy from the ledger, pay ${pay} tokens on top, and write you a day permit for the Heights.`,
        options: [
          { label: `Sell ${n} shard${n === 1 ? '' : 's'}: clear the levy, +${pay} tokens, day permit.`, disabled: n < 1, run: () => this.decide('authority') },
          { label: 'Not yet.' },
        ],
      };
    }
    if (this.choice === 'authority') return { speaker: 'Warden Calloway', text: 'Your permit is valid at the checkpoint. Present it to Guard Hesk. Do try to look presentable.', options: [{ label: 'Understood.' }] };
    if (this.choice === 'community') return { speaker: 'Warden Calloway', text: "You fed the Row for one night. Ask Bel who feeds it in the dry weeks. Your fine is entered.", options: [{ label: '...' }] };
    return { speaker: 'Warden Calloway', text: 'Move along. The granary is not a sightseeing attraction.', options: [{ label: 'Goodbye.' }] };
  }

  private decide(c: 'community' | 'authority'): DialogueNode {
    const st = this.h.state;
    const n = st.count('candy');
    st.remove('candy', n);
    this.choice = c;
    this.flags.add(c === 'community' ? 'feast' : 'hoard');
    if (c === 'community') {
      st.supply += 25 + n * 6;
      st.addRep('table', 20);
      st.addRep('runners', 10);
      st.addRep('authority', -15);
      this.flags.add('runnerTag');
      // the cost: the Authority fines "disorderly distribution" onto your levy
      st.debt += 15;
      this.h.bus.emit({ type: 'toast', text: `The Authority adds a 15-token fine to your levy. You now owe ${st.debt}.`, kind: 'bad' });
    } else {
      st.tokens += Math.min(n, 4) * 15;
      st.debt = 0;
      this.h.bus.emit({ type: 'toast', text: 'Your arrival levy is struck from the ledger.', kind: 'good' });
      st.supply += 6;
      st.addRep('authority', 20);
      st.addRep('table', -15);
      st.addRep('runners', -5);
      this.flags.add('dayPermit');
    }
    this.h.bus.emit({ type: 'choice', id: 'candy', option: c });
    this.h.bus.emit({ type: 'sfx', name: c === 'community' ? 'cheer' : 'coin' });
    this.advance(S.Checkpoint);
    if (c === 'community')
      return {
        speaker: 'Auntie Bel',
        text: "Bless you. Bowls tonight, on every tier we can reach. And here — Pip left this. A Runner's tag. The guards hate them, but they have to honour them. Go see the Heights. See what they're sitting on.",
        options: [{ label: 'Take the Runner tag.' }],
      };
    return {
      speaker: 'Warden Calloway',
      text: 'Sensible. Your levy is cleared, your tokens counted, your day permit signed. The checkpoint is by the brass lift. Welcome to the orderly side of the shelf.',
      options: [{ label: 'Take the permit.' }],
    };
  }

  private guardTalk(): DialogueNode {
    if (this.hasPass()) {
      return {
        speaker: 'Guard Hesk',
        text: this.choice === 'community' ? "A Runner's tag. Fine. It's valid. Keep your hands where I can see them up there." : 'Day permit, signed by the Warden. Go on up.',
        options: [{ label: 'Open the gate.', run: () => (this.h.openCheckpoint(), null) }],
      };
    }
    return { speaker: 'Guard Hesk', text: 'Permits only beyond this line. The Warden issues them. Runners have their tags. You have neither.', options: [{ label: 'Goodbye.' }] };
  }

  hasPass(): boolean {
    return this.flags.has('dayPermit') || this.flags.has('runnerTag');
  }

  private registryTalk(): DialogueNode {
    const st = this.h.state;
    if (this.stage === S.Registry) {
      const community = this.choice === 'community';
      return {
        speaker: 'Registrar Quill',
        text: community
          ? "A Depths resident at my counter. How novel. You're here about the water, aren't you. Everyone from down there is. The Reservoir is Authority infrastructure. A petition requires ten signatures from registered residents. Ten. In ink."
          : "The Warden's permit. Good. You've seen the Heights — clean water, real light, room to breathe. Residence is possible for the industrious. One hundred and fifty tokens and a clean record.",
        options: [
          {
            label: community ? 'Give me the petition form.' : "I'll earn it.",
            run: () => {
              this.advance(S.Free);
              this.flags.add('chapterDone');
              this.h.bus.emit({ type: 'toast', text: 'Chapter 1 complete — A Place on the Shelf', kind: 'good' });
              this.h.bus.emit({ type: 'quest', id: 'ch1-done', stage: S.Free });
              return {
                speaker: 'Registrar Quill',
                text: community
                  ? 'Ten signatures. Bring them back and the Registry will consider opening the Reservoir overflow to the lower tiers. Consider. Good day.'
                  : 'The Registry is open every waking hour. Bring the fee and your residence will be recorded. Good day.',
                options: [{ label: 'Good day.' }],
              };
            },
          },
        ],
      };
    }
    if (this.stage === S.Free && this.choice === 'community' && this.signatures >= 10 && !this.flags.has('petitionFiled') && st.debt === 0)
      return {
        speaker: 'Registrar Quill',
        text: "Ten names. Some of them are just thumbprints. ...It's valid. The overflow valve will be opened to the Depths straw at the next cycle. Don't look so pleased.",
        options: [
          {
            label: 'File the petition.',
            run: () => {
              this.flags.add('petitionFiled');
              st.addRep('table', 15);
              st.addRep('authority', -5);
              st.supply += 20;
              this.h.bus.emit({ type: 'toast', text: 'The Water Petition is filed. The Depths will have clean water.', kind: 'good' });
              this.h.save();
              return null;
            },
          },
        ],
      };
    if (this.stage === S.Free && st.debt > 0)
      return {
        speaker: 'Registrar Quill',
        text: `The ledger says you owe ${st.debt} tokens: the arrival levy${this.choice === 'community' ? ', plus a fine for disorderly distribution' : ''}. The Registry does not file petitions from debtors, nor record their residence, and the Reserve will not serve them.`,
        options: [
          {
            label: `Pay the levy (${st.debt} tokens).`,
            disabled: st.tokens < st.debt,
            run: () => {
              st.tokens -= st.debt;
              st.debt = 0;
              this.h.bus.emit({ type: 'toast', text: 'Levy paid. The ledger is clean.', kind: 'good' });
              this.h.save();
              return null;
            },
          },
          { label: 'Not today.' },
        ],
      };
    if (this.stage === S.Free && this.choice === 'authority' && !this.flags.has('resident'))
      return {
        speaker: 'Registrar Quill',
        text: `Residence permit: 150 tokens. You have ${st.tokens}.`,
        options: [
          {
            label: 'Pay 150 tokens for residence.',
            disabled: st.tokens < 150,
            run: () => {
              st.tokens -= 150;
              this.flags.add('resident');
              st.addRep('authority', 10);
              this.h.bus.emit({ type: 'toast', text: 'You are now a registered resident of the Heights.', kind: 'good' });
              this.h.save();
              return null;
            },
          },
          { label: 'Not yet.' },
        ],
      };
    return { speaker: 'Registrar Quill', text: 'The Registry records. That is all it does. That is everything.', options: [{ label: 'Good day.' }] };
  }

  /** Duke Tallow, Holder of the Fall Franchise: right about safety and wages, wrong about ownership. */
  private dukeTalk(): DialogueNode {
    const st = this.h.state;
    const why: Option = {
      label: 'Why should anyone owe you a third?',
      run: () => ({
        speaker: 'Duke Tallow',
        text: 'Before my paper, eleven went into the dark in one dry season. Count my crews tonight. Then complain about the third.',
        options: [{ label: 'Hm.' }],
      }),
    };
    const trade: Option = { label: 'What are you buying?', run: () => (this.h.openTrade('duke'), null) };
    if (this.choice === 'community' && st.debt > 0)
      return {
        speaker: 'Duke Tallow',
        text: `Calloway sold me your levy. It was a bad debt; I bought it for nine tokens. You'll find I collect better than I pay. Until the ${st.debt} is settled, my Tallymen will collect it from you in the dark.`,
        options: [
          {
            label: `Settle with the Duke (${st.debt} tokens).`,
            disabled: st.tokens < st.debt,
            run: () => {
              st.tokens -= st.debt;
              st.debt = 0;
              this.h.bus.emit({ type: 'toast', text: 'Levy settled with the Duke. The Tallymen let you be.', kind: 'good' });
              this.h.save();
              return null;
            },
          },
          why,
          trade,
          { label: 'Not today.' },
        ],
      };
    return {
      speaker: 'Duke Tallow',
      text: 'Calloway taxes you for arriving. I only tax what you carry out. Tell me which of us is the thief. Everything that falls back here is tallied; my crews haul a third to the cart. Hit one of them and you will be tallied too.',
      options: [why, trade, { label: 'Goodbye.' }],
    };
  }

  private pipTalk(): DialogueNode {
    const st = this.h.state;
    if (this.job?.kind === 'delivery') return { speaker: 'Pip', text: `Parcel's for ${NAMES[this.job.to!]}. Don't shake it.`, options: [{ label: 'On my way.' }] };
    if (this.stage < S.MeetOdo) return { speaker: 'Pip', text: "Up, down, fast — that's the Runners. Come back when you know your way around.", options: [{ label: 'Goodbye.' }] };
    const targets = ['mara', 'bel', 'dov'];
    const to = targets[this.deliveries % targets.length];
    return {
      speaker: 'Pip',
      text: `Want a run? Parcel to ${NAMES[to]}. Pays ${12 + Math.max(0, Math.floor(st.rep.runners / 10))} tokens on delivery.${this.choice === 'community' ? ' And thanks for the sugar, by the way.' : ''}`,
      options: [
        {
          label: 'Take the parcel.',
          run: () => {
            if (!st.add('parcel', 1)) return { speaker: 'Pip', text: "Your pack's too full. Lighten up first.", options: [{ label: 'Right.' }] };
            this.job = { kind: 'delivery', to, reward: 12 + Math.max(0, Math.floor(st.rep.runners / 10)) };
            return null;
          },
        },
        { label: 'Not now.' },
      ],
    };
  }

  private deliver(who: string): DialogueNode {
    const st = this.h.state;
    return {
      speaker: NAMES[who],
      text: 'A Runner parcel? For me? Hand it over.',
      options: [
        {
          label: 'Hand over the parcel.',
          run: () => {
            if (!st.remove('parcel', 1)) return null;
            st.tokens += this.job!.reward;
            st.addRep('runners', 4);
            this.h.bus.emit({ type: 'toast', text: `Delivery complete: +${this.job!.reward} tokens`, kind: 'good' });
            this.h.bus.emit({ type: 'sfx', name: 'coin' });
            this.deliveries++;
            this.job = null;
            return null;
          },
        },
      ],
    };
  }

  private dovTalk(): DialogueNode {
    const st = this.h.state;
    if (this.job?.kind === 'delivery' && this.job.to === 'dov') return this.deliver('dov');
    if (this.job?.kind === 'repair') {
      const ok = st.count('scrap') >= 2 && st.count('metal') >= 1;
      return {
        speaker: 'Dov',
        text: ok ? "That'll do. Hold this end — there." : `Two scrap, one metal. You've got ${st.count('scrap')} and ${st.count('metal')}.`,
        options: [
          {
            label: 'Do the repair.',
            disabled: !ok,
            run: () => {
              st.remove('scrap', 2);
              st.remove('metal', 1);
              st.tokens += 16;
              st.addRep('union', 4);
              this.job = null;
              this.h.bus.emit({ type: 'sfx', name: 'repair' });
              this.h.bus.emit({ type: 'toast', text: 'Repair job done: +16 tokens', kind: 'good' });
              return null;
            },
          },
          { label: 'Later.' },
        ],
      };
    }
    return {
      speaker: 'Dov',
      text: 'Union repair shop. There is always something broken on this shelf. Want a job? Bring me two scrap and a bit of metal and I pay sixteen.',
      options: [{ label: 'I will.', run: () => ((this.job = { kind: 'repair', reward: 16 }), null) }, { label: 'Goodbye.' }],
    };
  }

  private signOption(id: string): Option {
    const can = this.stage === S.Free && this.choice === 'community' && !this.signed.has(id) && this.signatures < 10;
    return {
      label: can ? 'Will you sign the Water Petition?' : 'Take care.',
      run: can
        ? () => {
            this.signed.add(id);
            this.signatures++;
            this.h.bus.emit({ type: 'toast', text: `Signature gathered (${this.signatures}/10)`, kind: 'good' });
            return null;
          }
        : undefined,
    };
  }

  private genericTalk(id: string): DialogueNode {
    const lines: Record<string, string[]> = {
      depths: ['Mind the leak.', 'Light went out on the gallery again.', 'They say the Heights has a whole reservoir. Must be nice.', "Fenna's broth is mostly water. Still warm though."],
      market: ['Everything that falls, for sale.', "Don't stand under the edge when the giant's about.", "The Warden's men count every crumb that goes into that jar.", 'Runners can get you anywhere. For a price.'],
      heights: ['One does so love the light up here.', 'Is that... dust on your boots?', 'The reservoir is for residents, I believe.', 'Lovely evening. It is always a lovely evening.'],
    };
    const d = this.h.district();
    const arr = lines[d] ?? lines.market;
    const text = arr[(id.length + Math.floor(this.h.time() / 20)) % arr.length];
    const opts: Option[] = [];
    if (this.stage === S.Free && this.choice === 'community' && d !== 'heights') opts.push(this.signOption(id));
    opts.push({ label: 'Goodbye.' });
    return { speaker: this.h.npcName(id), text, options: opts };
  }

  serialize() {
    return { stage: this.stage, choice: this.choice, flags: [...this.flags], signatures: this.signatures, deliveries: this.deliveries, signed: [...this.signed], job: this.job };
  }
  load(d: any): void {
    this.stage = d.stage;
    this.choice = d.choice;
    this.flags = new Set(d.flags);
    this.signatures = d.signatures ?? 0;
    this.deliveries = d.deliveries ?? 0;
    this.signed = new Set(d.signed ?? []);
    this.job = d.job ?? null;
  }
}

export const NAMES: Record<string, string> = {
  mara: 'Mara',
  bel: 'Auntie Bel',
  dov: 'Dov',
  ines: 'Ines',
  rook: 'Rook',
  pell: 'Pell',
  odo: 'Odo',
  wren: 'Wren',
  sela: 'Sela',
  tobb: 'Tobb',
  pip: 'Pip',
  calloway: 'Warden Calloway',
  quill: 'Registrar Quill',
  marrow: 'Lady Marrow',
};

export type { Item };
