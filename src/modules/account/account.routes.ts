import { Router } from 'express';
import * as accountController from './account.controller';

const router = Router();

router.get('/', accountController.getAccount);
router.delete('/', accountController.deleteAccount);

export default router;
