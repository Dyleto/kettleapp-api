/**
 * Ce que décident les étiquettes, sans base de données.
 *
 * Trois choses comptent : deux noms qui se tapent pareil sont la même
 * étiquette, un coach ne touche qu'aux siennes, et un client suivi à deux
 * porte celles de chacun sans que l'autre les voie.
 */
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Tag from '../../models/Tag';
import Client from '../../models/Client';
import { clientRow, RawClientRow } from '../coach/roster.service';
import {
  TAGS_PER_COACH_MAX,
  createTag,
  deleteTag,
  keptTagIds,
  renameTag,
  setClientTags,
  tagKey,
  tagName,
} from './tag.service';
import {
  createTagSchema,
  renameTagSchema,
  setClientTagsSchema,
} from './tag.schema';

// Des identifiants écrits, pas engendrés.
const JULIE = new Types.ObjectId('64e000000000000000000001');
const MARC = new Types.ObjectId('64e000000000000000000002');
const SARAH = new Types.ObjectId('64e0000000000000000000a1');
const REPRISE = new Types.ObjectId('64e0000000000000000000f1');
const MASSE = new Types.ObjectId('64e0000000000000000000f2');
const COMPET = new Types.ObjectId('64e0000000000000000000f3');

describe('deux noms qui se tapent pareil sont la même étiquette', () => {
  it('sans casse ni accents', () => {
    expect(tagKey('Équilibre')).toBe(tagKey('equilibre'));
    expect(tagKey('Prise de masse')).toBe(tagKey('PRISE DE MASSE'));
  });

  it('sans espaces autour, ni doublés dedans', () => {
    expect(tagKey('  Prise   de masse ')).toBe(tagKey('Prise de masse'));
  });

  // L'affichage garde ce que le coach a tapé, à ses espaces près.
  it('le nom affiché garde sa casse et ses accents', () => {
    expect(tagName('  Équilibre   haut ')).toBe('Équilibre haut');
  });

  it('deux noms différents restent deux étiquettes', () => {
    expect(tagKey('Reprise')).not.toBe(tagKey('Reprises'));
  });
});

describe('ce qui est posé sur un client', () => {
  const owned = [REPRISE, MASSE];

  it('seules les étiquettes du coach restent', () => {
    expect(keptTagIds([String(REPRISE), String(COMPET)], owned)).toEqual([
      String(REPRISE),
    ]);
  });

  it('chacune une fois, dans l’ordre demandé', () => {
    expect(
      keptTagIds([String(MASSE), String(REPRISE), String(MASSE)], owned)
    ).toEqual([String(MASSE), String(REPRISE)]);
  });

  it('une liste vide retire tout', () => {
    expect(keptTagIds([], owned)).toEqual([]);
  });
});

describe('la liste des clients porte les étiquettes de CE coach', () => {
  const row = (coaches: RawClientRow['coaches']): RawClientRow => ({
    _id: SARAH,
    coaches,
    stats: [],
  });

  // Le lien est par coach : Julie a posé « Compétition », Marc « Reprise ».
  it('suivi à deux, chacun lit les siennes', () => {
    const both = row([
      { coachId: JULIE, linkedAt: new Date(), tagIds: [COMPET] },
      { coachId: MARC, linkedAt: new Date(), tagIds: [REPRISE] },
    ]);
    expect(clientRow(both, JULIE).tagIds).toEqual([COMPET]);
    expect(clientRow(both, MARC).tagIds).toEqual([REPRISE]);
  });

  it('un client jamais étiqueté sort avec une liste vide', () => {
    expect(
      clientRow(row([{ coachId: JULIE, linkedAt: new Date() }]), JULIE).tagIds
    ).toEqual([]);
  });
});

describe('ce que les routes acceptent', () => {
  const name = (n: unknown) => createTagSchema.safeParse({ body: { name: n } });

  it('un nom court, débarrassé de ses espaces', () => {
    expect(name('  Reprise ').data?.body.name).toBe('Reprise');
  });

  it('vide ou blanc : refusé', () => {
    expect(name('').success).toBe(false);
    expect(name('    ').success).toBe(false);
  });

  it('au-delà de vingt-quatre caractères : refusé', () => {
    expect(name('a'.repeat(24)).success).toBe(true);
    expect(name('a'.repeat(25)).success).toBe(false);
  });

  it('renommer demande un identifiant valide', () => {
    expect(
      renameTagSchema.safeParse({
        params: { id: 'pas-un-id' },
        body: { name: 'Reprise' },
      }).success
    ).toBe(false);
  });

  it('les étiquettes d’un client : des identifiants valides', () => {
    const parse = (tagIds: unknown) =>
      setClientTagsSchema.safeParse({
        params: { clientId: String(SARAH) },
        body: { tagIds },
      });
    expect(parse([String(REPRISE)]).success).toBe(true);
    expect(parse([]).success).toBe(true);
    expect(parse(['pas-un-id']).success).toBe(false);
  });
});

/**
 * Autour des requêtes : les lectures remplacées par ce qu'elles rendraient.
 * Ce qui est éprouvé, c'est ce que la fonction demande — à qui, et sur quoi.
 */
describe('autour des requêtes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('créer enregistre le nom affiché et sa clé', async () => {
    vi.spyOn(Tag, 'countDocuments').mockResolvedValue(0 as never);
    const create = vi
      .spyOn(Tag, 'create')
      .mockResolvedValue({ _id: REPRISE } as never);
    await createTag(JULIE, ' Équilibre  haut ');
    expect(create).toHaveBeenCalledWith({
      coachId: JULIE,
      name: 'Équilibre haut',
      key: 'equilibre haut',
    });
  });

  // Le refus de l'index unique devient un 409 qui dit pourquoi.
  it('un doublon répond 409, en français', async () => {
    vi.spyOn(Tag, 'countDocuments').mockResolvedValue(3 as never);
    vi.spyOn(Tag, 'create').mockRejectedValue({ code: 11000 });
    await expect(createTag(JULIE, 'reprise')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cette étiquette existe déjà.',
    });
  });

  it('une autre erreur n’est pas maquillée en doublon', async () => {
    vi.spyOn(Tag, 'countDocuments').mockResolvedValue(3 as never);
    vi.spyOn(Tag, 'create').mockRejectedValue(new Error('réseau'));
    await expect(createTag(JULIE, 'Reprise')).rejects.toThrow('réseau');
  });

  it('au plafond, rien n’est créé', async () => {
    vi.spyOn(Tag, 'countDocuments').mockResolvedValue(
      TAGS_PER_COACH_MAX as never
    );
    const create = vi.spyOn(Tag, 'create');
    await expect(createTag(JULIE, 'Reprise')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(create).not.toHaveBeenCalled();
  });

  // Celle d'un autre coach : la requête la cherche avec ce coach, et ne la
  // trouve pas.
  it('renommer ne cherche que parmi les siennes', async () => {
    const update = vi
      .spyOn(Tag, 'findOneAndUpdate')
      .mockResolvedValue(null as never);
    await expect(
      renameTag(JULIE, String(REPRISE), 'Retour')
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(update.mock.calls[0][0]).toEqual({
      _id: String(REPRISE),
      coachId: JULIE,
    });
  });

  it('renommer vers un nom pris répond 409', async () => {
    vi.spyOn(Tag, 'findOneAndUpdate').mockRejectedValue({ code: 11000 });
    await expect(
      renameTag(JULIE, String(REPRISE), 'Masse')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('supprimer celle d’un autre coach : 404, rien de retiré', async () => {
    const find = vi.spyOn(Tag, 'findOne').mockResolvedValue(null as never);
    const pull = vi.spyOn(Client, 'updateMany');
    await expect(deleteTag(JULIE, String(REPRISE))).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(pull).not.toHaveBeenCalled();
    // Le refus vient de la requête, qui cherche avec ce coach : une
    // lecture remplacée ne regarde pas ce qu'on lui demande.
    expect(find).toHaveBeenCalledWith({ _id: String(REPRISE), coachId: JULIE });
  });

  // Le retrait vise le lien de CE coach : celui de Marc, sur le même
  // client, garde ses étiquettes.
  it('supprimer retire l’étiquette des liens de ce coach seulement', async () => {
    vi.spyOn(Tag, 'findOne').mockResolvedValue({ _id: REPRISE } as never);
    const pull = vi.spyOn(Client, 'updateMany').mockResolvedValue({} as never);
    const remove = vi.spyOn(Tag, 'deleteOne').mockResolvedValue({} as never);
    await deleteTag(JULIE, String(REPRISE));
    expect(pull).toHaveBeenCalledWith(
      { 'coaches.coachId': JULIE },
      { $pull: { 'coaches.$[link].tagIds': REPRISE } },
      { arrayFilters: [{ 'link.coachId': JULIE }] }
    );
    expect(remove).toHaveBeenCalledWith({ _id: REPRISE, coachId: JULIE });
  });

  // Retirer d'abord : interrompu entre les deux, il reste une étiquette
  // sans client, pas des clients qui en portent une disparue.
  it('les clients d’abord, l’étiquette ensuite', async () => {
    vi.spyOn(Tag, 'findOne').mockResolvedValue({ _id: REPRISE } as never);
    const pull = vi.spyOn(Client, 'updateMany').mockResolvedValue({} as never);
    const remove = vi.spyOn(Tag, 'deleteOne').mockResolvedValue({} as never);
    await deleteTag(JULIE, String(REPRISE));
    expect(pull.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0]
    );
  });

  it('poser : seulement les siennes, sur le lien de ce coach', async () => {
    // L'autorisation passe : le client est bien suivi par Julie.
    vi.spyOn(Client, 'findOne').mockResolvedValue({ _id: SARAH } as never);
    const find = vi.spyOn(Tag, 'find').mockReturnValue({
      distinct: async () => [REPRISE],
    } as never);
    const update = vi.spyOn(Client, 'updateOne').mockResolvedValue({} as never);

    const result = await setClientTags(JULIE, String(SARAH), [
      String(REPRISE),
      String(COMPET),
    ]);

    expect(find).toHaveBeenCalledWith({
      coachId: JULIE,
      _id: { $in: [String(REPRISE), String(COMPET)] },
    });
    expect(update).toHaveBeenCalledWith(
      { _id: SARAH, 'coaches.coachId': JULIE },
      { $set: { 'coaches.$.tagIds': [String(REPRISE)] } }
    );
    expect(result).toEqual({ tagIds: [String(REPRISE)] });
  });

  it('poser sur le client d’un autre coach : le refus de l’autorisation', async () => {
    vi.spyOn(Client, 'findOne').mockResolvedValue(null as never);
    const update = vi.spyOn(Client, 'updateOne');
    await expect(
      setClientTags(JULIE, String(SARAH), [String(REPRISE)])
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(update).not.toHaveBeenCalled();
  });
});
