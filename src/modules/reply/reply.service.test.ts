/**
 * Ce que décide une réponse du coach, sans base de données.
 *
 * Toute la règle tient dans `withReply` : modifier ou ajouter, garder ou
 * effacer, et quelle réponse appartient à qui. La route ne fait qu'aller
 * chercher la séance et l'enregistrer.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompletedSession, {
  type ICoachReply,
} from '../../models/CompletedSession';
import Client from '../../models/Client';
import User from '../../models/User';
import type { ICoach } from '../../models/Coach';
import { completedSessionPayload } from '../../contract';
import { readAll, readReplies, withReply, writeReply } from './reply.service';
import { writeReplySchema } from './reply.schema';

// Des identifiants et des dates écrits, pas engendrés : deux décors
// identiques doivent l'être vraiment.
const JULIE = {
  coachId: new Types.ObjectId('64c000000000000000000001'),
  firstName: 'Julie',
};
const MARC = {
  coachId: new Types.ObjectId('64c000000000000000000002'),
  firstName: 'Marc',
};
const MONDAY = new Date('2026-11-16T18:00:00Z');
const TUESDAY = new Date('2026-11-17T08:00:00Z');
const WEDNESDAY = new Date('2026-11-18T08:00:00Z');

const sent = (
  author: typeof JULIE,
  fields: Partial<ICoachReply> = {}
): ICoachReply => ({
  coachId: author.coachId,
  firstName: author.firstName,
  sentAt: MONDAY,
  ...fields,
});

describe('une première réponse', () => {
  it('une réaction seule part, signée et datée', () => {
    expect(withReply([], JULIE, { reaction: 'strong' }, TUESDAY)).toEqual([
      {
        coachId: JULIE.coachId,
        firstName: 'Julie',
        reaction: 'strong',
        sentAt: TUESDAY,
      },
    ]);
  });

  it('un texte seul part, sans les espaces autour', () => {
    const [reply] = withReply([], JULIE, { text: '  Bien joué.  ' }, TUESDAY);
    expect(reply.text).toBe('Bien joué.');
    expect(reply).not.toHaveProperty('reaction');
  });

  // Un champ vidé ou blanc n'est pas une réponse : une bulle vide chez le
  // client ne voudrait rien dire.
  it('un brouillon vide ne crée rien', () => {
    expect(withReply([], JULIE, { text: '   ' }, TUESDAY)).toEqual([]);
    expect(withReply([], JULIE, { reaction: null }, TUESDAY)).toEqual([]);
  });
});

describe('tant que le client ne l’a pas lue, elle se modifie', () => {
  const unread = [sent(JULIE, { reaction: 'clap', text: 'Bien joué.' })];

  it('modifier remplace, n’ajoute pas', () => {
    const next = withReply(unread, JULIE, { reaction: 'fire' }, TUESDAY);
    expect(next).toHaveLength(1);
    expect(next[0].reaction).toBe('fire');
  });

  // L'enjeu de la sémantique « absent laisse en place » : le fil pose une
  // réaction sans connaître le texte, et ne doit pas l'effacer.
  it('une clé absente laisse en place ce qui y était', () => {
    const [reply] = withReply(unread, JULIE, { reaction: 'fire' }, TUESDAY);
    expect(reply.text).toBe('Bien joué.');
  });

  it('`null` efface, et seulement ce qu’il nomme', () => {
    const [reply] = withReply(unread, JULIE, { reaction: null }, TUESDAY);
    expect(reply).not.toHaveProperty('reaction');
    expect(reply.text).toBe('Bien joué.');
  });

  // « Toucher de nouveau la retire » : la réaction était tout.
  it('vidée, elle disparaît', () => {
    const reactionOnly = [sent(JULIE, { reaction: 'clap' })];
    expect(withReply(reactionOnly, JULIE, { reaction: null }, TUESDAY)).toEqual(
      []
    );
  });

  it('la date suit la dernière écriture', () => {
    const [reply] = withReply(unread, JULIE, { text: 'Mieux.' }, TUESDAY);
    expect(reply.sentAt).toEqual(TUESDAY);
  });
});

describe('lue, elle ne bouge plus', () => {
  const read = [sent(JULIE, { reaction: 'clap', readAt: TUESDAY })];

  it('écrire après lecture en ajoute une nouvelle', () => {
    const next = withReply(read, JULIE, { text: 'Et la suite ?' }, WEDNESDAY);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(read[0]);
    expect(next[1]).toMatchObject({ text: 'Et la suite ?', sentAt: WEDNESDAY });
  });

  // La nouvelle ne reprend rien de l'ancienne : ce qui est lu est fini.
  it('la nouvelle n’hérite pas de la réaction lue', () => {
    const next = withReply(read, JULIE, { text: 'Et la suite ?' }, WEDNESDAY);
    expect(next[1]).not.toHaveProperty('reaction');
  });

  it('effacer une réponse lue n’efface rien', () => {
    expect(withReply(read, JULIE, { reaction: null }, WEDNESDAY)).toEqual(read);
  });
});

describe('deux coachs, chacun la sienne', () => {
  it('répondre ne touche pas à celle de l’autre coach', () => {
    const marcs = [sent(MARC, { text: 'Bravo.' })];
    const next = withReply(marcs, JULIE, { reaction: 'fire' }, TUESDAY);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(marcs[0]);
    expect(next[1].firstName).toBe('Julie');
  });

  // C'est la dernière de CE coach qui compte, même si l'autre a écrit après.
  it('la sienne reste modifiable quand l’autre a répondu depuis', () => {
    const replies = [
      sent(JULIE, { reaction: 'clap' }),
      sent(MARC, { text: 'Bravo.' }),
    ];
    const next = withReply(replies, JULIE, { reaction: 'fire' }, TUESDAY);
    expect(next.map((r) => r.reaction)).toEqual(['fire', undefined]);
  });

  // Un ObjectId relu depuis la base n'est pas la même instance que celui du
  // coach de la requête.
  it('deux instances du même identifiant désignent le même coach', () => {
    const replies = [sent(JULIE, { reaction: 'clap' })];
    const same = {
      ...JULIE,
      coachId: new Types.ObjectId(JULIE.coachId.toHexString()),
    };
    expect(
      withReply(replies, same, { reaction: 'fire' }, TUESDAY)
    ).toHaveLength(1);
  });
});

describe('le client lit', () => {
  it('toutes les réponses non lues prennent la date de lecture', () => {
    const replies = [sent(JULIE), sent(MARC)];
    expect(readAll(replies, TUESDAY).map((r) => r.readAt)).toEqual([
      TUESDAY,
      TUESDAY,
    ]);
  });

  // Celle que le coach voit sous « lue par Sarah » ne doit pas rajeunir.
  it('une réponse déjà lue garde sa date', () => {
    const replies = [sent(JULIE, { readAt: MONDAY }), sent(MARC)];
    expect(readAll(replies, TUESDAY).map((r) => r.readAt)).toEqual([
      MONDAY,
      TUESDAY,
    ]);
  });
});

describe('ce que la route accepte', () => {
  const parse = (body: unknown) =>
    writeReplySchema.safeParse({
      params: { id: '64c0000000000000000000aa' },
      body,
    });

  it('une réaction, un texte, ou les deux', () => {
    expect(parse({ reaction: 'clap' }).success).toBe(true);
    expect(parse({ text: 'Bien joué.' }).success).toBe(true);
    expect(parse({ reaction: 'fire', text: 'Bien joué.' }).success).toBe(true);
  });

  it('`null` passe : il efface', () => {
    expect(parse({ reaction: null }).success).toBe(true);
  });

  it('une requête qui ne dit rien est refusée', () => {
    expect(parse({}).success).toBe(false);
  });

  it('une réaction hors de la liste est refusée', () => {
    expect(parse({ reaction: 'heart' }).success).toBe(false);
  });

  it('un texte au-delà du plafond est refusé', () => {
    expect(parse({ text: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('ce qui sort', () => {
  const session = {
    _id: '64c0000000000000000000bb',
    originalSessionId: '64c0000000000000000000cc',
    sessionOrder: 1,
    blocks: [],
    viewedByCoach: true,
    completedAt: MONDAY,
  };

  // Une lecture `lean()` d'un bilan d'avant les réponses n'a pas de champ.
  it('un bilan sans réponses en sort avec une liste vide', () => {
    expect(completedSessionPayload.parse(session).replies).toEqual([]);
  });

  it('une réponse sort avec sa signature, ses dates en chaînes', () => {
    const [reply] = completedSessionPayload.parse({
      ...session,
      replies: [sent(JULIE, { reaction: 'strong', readAt: TUESDAY })],
    }).replies;
    expect(reply).toEqual({
      coachId: '64c000000000000000000001',
      firstName: 'Julie',
      reaction: 'strong',
      sentAt: MONDAY.toISOString(),
      readAt: TUESDAY.toISOString(),
    });
  });
});

/**
 * Ce que font les deux routes autour de la règle : qui a le droit, ce qui
 * est marqué, ce qui est enregistré.
 *
 * Sans base : les lectures sont remplacées par ce qu'elles rendraient, et
 * `save` par un espion. Ce qui est éprouvé, c'est la décision de la fonction
 * — pas MongoDB.
 */
describe('autour de la règle', () => {
  afterEach(() => vi.restoreAllMocks());

  const COACH = {
    _id: JULIE.coachId,
    userId: new Types.ObjectId('64c0000000000000000000dd'),
  } as unknown as ICoach;
  const CLIENT = new Types.ObjectId('64c0000000000000000000ee');

  const stored = (fields: Record<string, unknown> = {}) => {
    const doc = CompletedSession.hydrate({
      _id: new Types.ObjectId('64c0000000000000000000bb'),
      clientId: CLIENT,
      programId: new Types.ObjectId('64c0000000000000000000ff'),
      originalSessionId: new Types.ObjectId('64c0000000000000000000cc'),
      sessionOrder: 1,
      blocks: [],
      viewedByCoach: false,
      completedAt: MONDAY,
      replies: [],
      ...fields,
    });
    const save = vi.spyOn(doc, 'save').mockResolvedValue(doc);
    return { doc, save };
  };

  const coachSees = (doc: unknown, linked: boolean, firstName = ' Julie ') => {
    vi.spyOn(CompletedSession, 'findById').mockResolvedValue(doc as never);
    vi.spyOn(Client, 'exists').mockResolvedValue(
      (linked ? { _id: CLIENT } : null) as never
    );
    vi.spyOn(User, 'findById').mockReturnValue({
      select: () => ({ lean: async () => ({ firstName }) }),
    } as never);
  };

  it('répondre marque la séance lue par le coach, et signe du prénom', async () => {
    const { doc, save } = stored();
    coachSees(doc, true);
    await writeReply(COACH, String(doc._id), { reaction: 'strong' }, TUESDAY);
    expect(doc.viewedByCoach).toBe(true);
    expect(doc.toObject().replies[0]).toMatchObject({
      firstName: 'Julie',
      reaction: 'strong',
    });
    expect(save).toHaveBeenCalledWith({ validateModifiedOnly: true });
  });

  // L'autorisation : la séance existe, mais son client n'est pas suivi par
  // ce coach. Même réponse qu'une séance inexistante.
  it('la séance d’un client qui n’est pas le sien : 404, rien d’écrit', async () => {
    const { doc, save } = stored();
    coachSees(doc, false);
    await expect(
      writeReply(COACH, String(doc._id), { reaction: 'strong' }, TUESDAY)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Séance introuvable' });
    expect(save).not.toHaveBeenCalled();
  });

  // Le lien cherché est celui de CE client avec CE coach : un filtre qui
  // perdrait le coach trouverait n'importe quel client suivi par quelqu'un.
  it('le droit se cherche entre le client de la séance et ce coach', async () => {
    const { doc } = stored();
    coachSees(doc, true);
    await writeReply(COACH, String(doc._id), { reaction: 'strong' }, TUESDAY);
    expect(Client.exists).toHaveBeenCalledWith({
      _id: CLIENT,
      'coaches.coachId': JULIE.coachId,
    });
  });

  it('une séance qui n’existe pas : le même 404', async () => {
    coachSees(null, true);
    await expect(
      writeReply(COACH, '64c0000000000000000000bb', { text: 'Bien.' }, TUESDAY)
    ).rejects.toMatchObject({ statusCode: 404, message: 'Séance introuvable' });
  });

  it('le client lit : ses réponses non lues prennent la date', async () => {
    const { doc, save } = stored({ replies: [sent(JULIE)] });
    vi.spyOn(CompletedSession, 'findOne').mockResolvedValue(doc as never);
    await readReplies(CLIENT, String(doc._id), TUESDAY);
    expect(doc.toObject().replies[0].readAt).toEqual(TUESDAY);
    expect(save).toHaveBeenCalledOnce();
  });

  // L'accueil appelle la route à chaque ouverture de la bulle.
  it('tout est déjà lu : rien n’est écrit', async () => {
    const { doc, save } = stored({
      replies: [sent(JULIE, { readAt: MONDAY })],
    });
    vi.spyOn(CompletedSession, 'findOne').mockResolvedValue(doc as never);
    await readReplies(CLIENT, String(doc._id), TUESDAY);
    expect(save).not.toHaveBeenCalled();
  });

  // La séance est cherchée avec son client : celle d'un autre n'est pas
  // trouvée. Le filtre est ce qui l'assure, la requête le porte donc.
  it('le client ne cherche que parmi ses propres séances', async () => {
    const findOne = vi
      .spyOn(CompletedSession, 'findOne')
      .mockResolvedValue(null as never);
    await expect(
      readReplies(CLIENT, '64c0000000000000000000bb', TUESDAY)
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(findOne).toHaveBeenCalledWith({
      _id: '64c0000000000000000000bb',
      clientId: CLIENT,
    });
  });
});
