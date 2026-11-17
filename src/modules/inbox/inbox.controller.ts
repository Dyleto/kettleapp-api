import { Request, Response } from 'express';
import { catchAsync } from '../../shared/utils/catchAsync';
import { coachOf } from '../../shared/middleware/roles';
import { respond } from '../../shared/utils/respond';
import { inboxPayload, viewedPayload } from '../../contract';
import { inbox, markViewed } from './inbox.service';
import type { InboxQuery, MarkViewedBody } from './inbox.schema';

/** Le fil « À lire » du coach, ou « Déjà lues » : voir `inbox`. */
export const getInbox = catchAsync(async (req: Request, res: Response) => {
  const { state } = req.query as unknown as InboxQuery;
  respond(res, 200, inboxPayload, await inbox(coachOf(res)._id, state));
});

/** Lire ou « Annuler » : voir `markViewed`. */
export const setViewed = catchAsync(async (req: Request, res: Response) => {
  const { ids, viewed } = req.body as MarkViewedBody;
  respond(
    res,
    200,
    viewedPayload,
    await markViewed(coachOf(res)._id, ids, viewed)
  );
});
