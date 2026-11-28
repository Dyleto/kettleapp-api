/**
 * Ce que la bibliothèque de modèles décide, sans base de données : le
 * compteur d'usage, la copie d'un modèle, le modèle tiré du programme d'un
 * client, et les séances d'un client copiées dans un modèle existant.
 *
 * `replaceProgramSessions` est remplacé pour tout le fichier : l'import
 * réécrit le programme d'un client dans une autre collection, et ce qui est
 * éprouvé ici, c'est ce qui se passe autour — pas cette réécriture, que ses
 * propres tests couvrent.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProgramTemplate from '../../models/ProgramTemplate';
import Program from '../../models/Program';
import Session, { type ISessionBlock } from '../../models/Session';
import Client from '../../models/Client';
import { replaceProgramSessions } from '../program/program.service';
import { templateRowPayload } from '../../contract';
import {
  appendProgramSessions,
  copyName,
  duplicateTemplate,
  importTemplate,
  pickSessions,
  recordImport,
  sessionsAfter,
  templateFromProgram,
  templateRow,
  templateSessionsFrom,
} from './template.service';
import {
  appendFromProgramSchema,
  templateFromProgramSchema,
} from './template.schema';

vi.mock('../program/program.service', () => ({
  replaceProgramSessions: vi.fn(async () => []),
}));

// Des identifiants écrits, pas engendrés.
const COACH = new Types.ObjectId('64f000000000000000000001');
const SARAH = new Types.ObjectId('64f0000000000000000000a1');
const KARIM = new Types.ObjectId('64f0000000000000000000a2');
const TEMPLATE = new Types.ObjectId('64f0000000000000000000b1');
const PROGRAM = new Types.ObjectId('64f0000000000000000000c1');
const S1 = new Types.ObjectId('64f0000000000000000000d1');
const S2 = new Types.ObjectId('64f0000000000000000000d2');
const S3 = new Types.ObjectId('64f0000000000000000000d3');
const BLOCK = new Types.ObjectId('64f0000000000000000000e1');

const block = {
  _id: BLOCK,
  type: 'classic' as const,
  order: 1,
  exercises: [],
} as unknown as ISessionBlock;
const stored = (_id: Types.ObjectId, order: number, name: string) => ({
  _id,
  programId: PROGRAM,
  order,
  name,
  notes: 'Au réveil',
  suggestedDays: [order],
  blocks: [block],
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-02'),
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(replaceProgramSessions).mockReset();
  vi.mocked(replaceProgramSessions).mockResolvedValue([]);
});

describe('le compteur d’usage', () => {
  it('compte les clients retenus, pas les imports', () => {
    const row = templateRow({
      _id: TEMPLATE,
      name: 'Prise de masse',
      updatedAt: new Date('2026-11-01'),
      // Trois séances, deux clients : deux nombres qui ne se confondent pas.
      sessions: [1, 2, 3].map((order) => ({ _id: `s${order}`, order })),
      importedFor: [SARAH, KARIM],
    });
    expect(row.usageCount).toBe(2);
    expect(row.sessionCount).toBe(3);
  });

  it('jamais importé : zéro, et la ligne passe le contrat', () => {
    const row = templateRow({
      _id: TEMPLATE,
      name: 'Reprise',
      updatedAt: new Date('2026-11-01'),
    });
    expect(row.usageCount).toBe(0);
    expect(templateRowPayload.safeParse(row).success).toBe(true);
  });

  // La carte d'un modèle montre ses premières séances : dans l'ordre de
  // l'atelier, pas dans celui du document.
  it('l’aperçu : les quatre premières séances par rang, et leurs blocs', () => {
    const session = (order: number, types: string[]) => ({
      _id: new Types.ObjectId(`64c00000000000000000000${order}`),
      order,
      name: `Séance ${order}`,
      blocks: types.map((type) => ({ type })),
    });
    const row = templateRow({
      _id: TEMPLATE,
      name: 'Prépa',
      updatedAt: new Date('2026-11-01'),
      sessions: [
        session(3, ['emom']),
        session(1, ['warmup', 'classic']),
        session(5, ['amrap']),
        session(2, ['tabata']),
        session(4, []),
      ],
    });
    expect(
      row.preview.map((p) => [p.order, p.name, p.blockTypes.join('+')])
    ).toEqual([
      [1, 'Séance 1', 'warmup+classic'],
      [2, 'Séance 2', 'tabata'],
      [3, 'Séance 3', 'emom'],
      [4, 'Séance 4', ''],
    ]);
    expect(row.sessionCount).toBe(5);
    expect(templateRowPayload.safeParse(row).success).toBe(true);
  });

  // `$addToSet` : réimporter chez Sarah ne fait pas un client de plus.
  // `timestamps: false` : importer ne retouche pas le modèle, qui ne doit
  // pas remonter en tête d'une liste triée par dernière modification.
  it('un import retient le client une fois, sans dater le modèle', async () => {
    const update = vi
      .spyOn(ProgramTemplate, 'updateOne')
      .mockResolvedValue({} as never);
    await recordImport(COACH, TEMPLATE, SARAH);
    expect(update).toHaveBeenCalledWith(
      { _id: TEMPLATE, coachId: COACH },
      { $addToSet: { importedFor: SARAH } },
      { timestamps: false }
    );
  });

  const owned = () =>
    vi.spyOn(ProgramTemplate, 'findOne').mockResolvedValue(
      ProgramTemplate.hydrate({
        _id: TEMPLATE,
        coachId: COACH,
        name: 'Prise de masse',
        sessions: [stored(S1, 1, 'Full body A')],
        importedFor: [],
      }) as never
    );

  it('l’import réussi est retenu', async () => {
    owned();
    const update = vi
      .spyOn(ProgramTemplate, 'updateOne')
      .mockResolvedValue({} as never);
    await importTemplate(COACH, SARAH, String(TEMPLATE));
    expect(update).toHaveBeenCalledOnce();
  });

  // Après et non avant : un import qui échoue n'a servi à personne.
  it('l’import qui échoue ne compte pas', async () => {
    owned();
    vi.mocked(replaceProgramSessions).mockRejectedValue(new Error('base'));
    const update = vi.spyOn(ProgramTemplate, 'updateOne');
    await expect(
      importTemplate(COACH, SARAH, String(TEMPLATE))
    ).rejects.toThrow('base');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('le nom d’une copie', () => {
  it('dit que c’est une copie', () => {
    expect(copyName('Prise de masse')).toBe('Prise de masse (copie)');
  });

  // Un nom déjà au plafond ne doit pas rendre la copie impossible à
  // enregistrer, ni perdre la mention qui la distingue.
  it('un nom long est raccourci pour que la mention tienne', () => {
    const copy = copyName('a'.repeat(120));
    expect(copy.length).toBeLessThanOrEqual(120);
    expect(copy.endsWith(' (copie)')).toBe(true);
  });

  it('sans espace pendu avant la mention', () => {
    const name = `${'a'.repeat(111)} bbbb`;
    expect(copyName(name)).toBe(`${'a'.repeat(111)} (copie)`);
  });
});

describe('des séances pour un nouveau modèle', () => {
  const [first, second] = templateSessionsFrom([
    stored(S2, 4, 'Haut du corps'),
    stored(S1, 7, 'Full body A'),
  ]) as Record<string, unknown>[];

  // Garder l'identifiant d'une séance de client lierait le modèle au
  // programme qu'il copie.
  it('sans identifiant, ni programme, ni dates', () => {
    for (const key of ['_id', 'programId', 'createdAt', 'updatedAt'])
      expect(first).not.toHaveProperty(key);
  });

  it('le rang vient de la position', () => {
    expect([first.order, second.order]).toEqual([1, 2]);
  });

  it('ce que le coach a écrit suit, blocs compris', () => {
    expect(first).toMatchObject({
      name: 'Haut du corps',
      notes: 'Au réveil',
      suggestedDays: [4],
    });
    expect((first.blocks as { _id: unknown }[])[0]._id).toBe(BLOCK);
  });
});

describe('des séances à la suite d’un modèle', () => {
  const [added] = sessionsAfter(2, [stored(S3, 9, 'C')]) as Record<
    string,
    unknown
  >[];

  // Le rang de la séance dans le programme du client ne dit rien de sa
  // place dans le modèle.
  it('le rang part de la dernière séance du modèle', () => {
    expect(added.order).toBe(3);
  });

  it('sans identifiant : c’est une nouvelle séance du modèle', () => {
    expect(added).not.toHaveProperty('_id');
    expect(added.name).toBe('C');
  });

  // Sans liste, la route copierait tout un programme dans un modèle déjà
  // rempli.
  it('la route exige une liste de séances, et non vide', () => {
    const parse = (body: Record<string, unknown>) =>
      appendFromProgramSchema.safeParse({
        params: { id: String(TEMPLATE) },
        body: { clientId: String(SARAH), ...body },
      }).success;
    expect(parse({ sessionIds: [String(S1)] })).toBe(true);
    expect(parse({})).toBe(false);
    expect(parse({ sessionIds: [] })).toBe(false);
  });
});

describe('quelles séances deviennent un modèle', () => {
  const program = [stored(S1, 1, 'A'), stored(S2, 2, 'B'), stored(S3, 3, 'C')];

  it('sans liste : tout le programme', () => {
    expect(pickSessions(program).map((s) => s.name)).toEqual(['A', 'B', 'C']);
  });

  // La progression que le coach a construite, pas l'ordre de la demande.
  it('avec une liste : celles-là, dans l’ordre du programme', () => {
    expect(
      pickSessions(program, [String(S3), String(S1)]).map((s) => s.name)
    ).toEqual(['A', 'C']);
  });

  it('une séance qui n’est pas de ce programme n’en fait pas partie', () => {
    expect(pickSessions(program, [String(TEMPLATE)])).toEqual([]);
  });

  // Vide, elle enregistrerait tout depuis le menu d'une seule séance.
  it('la route refuse une liste vide, accepte son absence', () => {
    const parse = (body: Record<string, unknown>) =>
      templateFromProgramSchema.safeParse({
        body: { clientId: String(SARAH), name: 'Prise de masse', ...body },
      }).success;
    expect(parse({})).toBe(true);
    expect(parse({ sessionIds: [String(S1)] })).toBe(true);
    expect(parse({ sessionIds: [] })).toBe(false);
    expect(parse({ name: '  ' })).toBe(false);
  });
});

describe('autour des requêtes', () => {
  /** `create` rend un document qu'on peut peupler. */
  const created = () =>
    vi
      .spyOn(ProgramTemplate, 'create')
      .mockImplementation(
        async (doc: unknown) =>
          ({ ...(doc as object), populate: async () => undefined }) as never
      );

  it('la copie porte le nom, les séances, et pas les clients de l’original', async () => {
    vi.spyOn(ProgramTemplate, 'findOne').mockResolvedValue(
      ProgramTemplate.hydrate({
        _id: TEMPLATE,
        coachId: COACH,
        name: 'Prise de masse',
        sessions: [stored(S1, 1, 'Full body A')],
        importedFor: [SARAH, KARIM],
      }) as never
    );
    const create = created();
    await duplicateTemplate(COACH, String(TEMPLATE));
    const doc = create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.name).toBe('Prise de masse (copie)');
    expect(doc.coachId).toBe(COACH);
    expect(doc).not.toHaveProperty('importedFor');
    expect((doc.sessions as Record<string, unknown>[])[0]).not.toHaveProperty(
      '_id'
    );
  });

  // `getOwnTemplate` cherche par identifiant ET par coach : celui d'un
  // autre est introuvable, et rien n'est copié.
  it('le modèle d’un autre coach ne se copie pas', async () => {
    const find = vi
      .spyOn(ProgramTemplate, 'findOne')
      .mockResolvedValue(null as never);
    const create = vi.spyOn(ProgramTemplate, 'create');
    await expect(
      duplicateTemplate(COACH, String(TEMPLATE))
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(find).toHaveBeenCalledWith({
      _id: String(TEMPLATE),
      coachId: COACH,
    });
    expect(create).not.toHaveBeenCalled();
  });

  const programOf = (sessions: unknown[]) => {
    vi.spyOn(Client, 'findOne').mockResolvedValue({ _id: SARAH } as never);
    vi.spyOn(Program, 'findOne').mockResolvedValue({ _id: PROGRAM } as never);
    return vi.spyOn(Session, 'find').mockReturnValue({
      sort: () => ({ lean: async () => sessions }),
    } as never);
  };

  it('le programme du client devient un modèle, relu par le serveur', async () => {
    const find = programOf([stored(S1, 1, 'A'), stored(S2, 2, 'B')]);
    const create = created();
    await templateFromProgram(COACH, String(SARAH), 'Prise de masse', [
      String(S2),
    ]);
    expect(find).toHaveBeenCalledWith({ programId: PROGRAM });
    const doc = create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc).toMatchObject({ coachId: COACH, name: 'Prise de masse' });
    expect(
      (doc.sessions as Record<string, unknown>[]).map((s) => s.name)
    ).toEqual(['B']);
  });

  it('rien à enregistrer : 404, pas de modèle vide', async () => {
    programOf([]);
    const create = vi.spyOn(ProgramTemplate, 'create');
    await expect(
      templateFromProgram(COACH, String(SARAH), 'Vide')
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(create).not.toHaveBeenCalled();
  });

  // L'autorisation : le client n'est pas suivi par ce coach.
  it('le programme d’un client qui n’est pas le sien ne se lit pas', async () => {
    const authorize = vi
      .spyOn(Client, 'findOne')
      .mockResolvedValue(null as never);
    const program = vi.spyOn(Program, 'findOne');
    await expect(
      templateFromProgram(COACH, String(SARAH), 'Prise de masse')
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(authorize).toHaveBeenCalledWith({
      _id: String(SARAH),
      'coaches.coachId': COACH,
    });
    expect(program).not.toHaveBeenCalled();
  });
  /** Un modèle de ce coach qui porte `count` séances ; son écriture est
   * espionnée. */
  const ownTemplate = (count: number) => {
    const doc = ProgramTemplate.hydrate({
      _id: TEMPLATE,
      coachId: COACH,
      name: 'Prise de masse',
      sessions: Array.from({ length: count }, (_, i) => ({
        _id: new Types.ObjectId(
          `64f0000000000000000001${String(i).padStart(2, '0')}`
        ),
        order: i + 1,
        name: `M${i + 1}`,
        blocks: [],
      })),
    });
    const save = vi.spyOn(doc, 'save').mockResolvedValue(doc as never);
    vi.spyOn(doc, 'populate').mockResolvedValue(doc as never);
    vi.spyOn(ProgramTemplate, 'findOne').mockResolvedValue(doc as never);
    return { doc, save };
  };

  it('une séance du client s’ajoute à la fin du modèle, relue par le serveur', async () => {
    const { doc, save } = ownTemplate(2);
    const find = programOf([stored(S1, 1, 'A'), stored(S2, 2, 'B')]);
    await appendProgramSessions(COACH, String(TEMPLATE), String(SARAH), [
      String(S2),
    ]);
    expect(find).toHaveBeenCalledWith({ programId: PROGRAM });
    expect(doc.sessions.map((s) => [s.name, s.order])).toEqual([
      ['M1', 1],
      ['M2', 2],
      ['B', 3],
    ]);
    expect(save).toHaveBeenCalledOnce();
  });

  // Un modèle plus long qu'un programme ne s'importerait plus.
  it('au-delà de trente séances : 409, et rien d’écrit', async () => {
    const { doc, save } = ownTemplate(29);
    programOf([stored(S1, 1, 'A'), stored(S2, 2, 'B')]);
    await expect(
      appendProgramSessions(COACH, String(TEMPLATE), String(SARAH), [
        String(S1),
        String(S2),
      ])
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(save).not.toHaveBeenCalled();
    expect(doc.sessions).toHaveLength(29);
  });

  it('une séance qui n’est pas de ce programme : 404, et rien d’écrit', async () => {
    const { save } = ownTemplate(1);
    programOf([stored(S1, 1, 'A')]);
    await expect(
      appendProgramSessions(COACH, String(TEMPLATE), String(SARAH), [
        String(S3),
      ])
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(save).not.toHaveBeenCalled();
  });

  // Le modèle d'abord : celui d'un autre coach arrête tout, avant qu'aucun
  // programme ne soit lu.
  it('le modèle d’un autre coach : 404, et aucun programme n’est lu', async () => {
    const find = vi
      .spyOn(ProgramTemplate, 'findOne')
      .mockResolvedValue(null as never);
    const client = vi.spyOn(Client, 'findOne');
    const program = vi.spyOn(Program, 'findOne');
    await expect(
      appendProgramSessions(COACH, String(TEMPLATE), String(SARAH), [
        String(S1),
      ])
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(find).toHaveBeenCalledWith({
      _id: String(TEMPLATE),
      coachId: COACH,
    });
    expect(client).not.toHaveBeenCalled();
    expect(program).not.toHaveBeenCalled();
  });

  it('le programme d’un client qui n’est pas le sien ne se lit pas, et rien n’est écrit', async () => {
    const { save } = ownTemplate(1);
    const authorize = vi
      .spyOn(Client, 'findOne')
      .mockResolvedValue(null as never);
    const program = vi.spyOn(Program, 'findOne');
    await expect(
      appendProgramSessions(COACH, String(TEMPLATE), String(SARAH), [
        String(S1),
      ])
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(authorize).toHaveBeenCalledWith({
      _id: String(SARAH),
      'coaches.coachId': COACH,
    });
    expect(program).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
