import express, { Response } from 'express';
import { ChallengeProgressRequest, UserChallenge } from '../types';
import { fetchAndIncrementChallengesByUserAndType } from '../models/application';

const challengeController = () => {
  const router = express.Router();

  /**
   * Handles incrementing challenge progress for challenges matching the given type for the given user.
   *
   * @param req - The ChallengeProgressRequest object containing the user's username and the ChallengeType.
   * @param res - The HTTP response object used to send back the result of the operation.
   *
   * @returns A Promise that resolves to void.
   */
  const incrementChallengeProgress = async (
    req: ChallengeProgressRequest,
    res: Response,
  ): Promise<void> => {
    const { challengeType, username } = req.params;

    try {
      const response = await fetchAndIncrementChallengesByUserAndType(username, challengeType);

      if ('error' in response) {
        throw new Error(response.error);
      }

      res.json(response as UserChallenge[]);
    } catch (error) {
      res.status(500).send((error as Error).message);
    }
  };

  router.put('/progress/:challengeType/:username', incrementChallengeProgress);

  return router;
};

export default challengeController;