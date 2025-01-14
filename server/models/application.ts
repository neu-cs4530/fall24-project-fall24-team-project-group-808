import { ObjectId } from 'mongodb';
import { QueryOptions } from 'mongoose';
import {
  Answer,
  AnswerResponse,
  Article,
  ArticleResponse,
  Challenge,
  ChallengeType,
  Comment,
  CommentResponse,
  Community,
  CommunityObjectType,
  CommunityResponse,
  EquipRewardResponse,
  Notification,
  NotificationResponse,
  NotificationType,
  OrderType,
  Poll,
  PollResponse,
  Question,
  QuestionResponse,
  Tag,
  User,
  UserChallenge,
  UserChallengeResponse,
  UserResponse,
} from '../types';
import AnswerModel from './answers';
import QuestionModel from './questions';
import TagModel from './tags';
import CommentModel from './comments';
import UserModel from './users';
import CommunityModel from './communities';
import PollModel from './polls';
import ArticleModel from './articles';
import NotificationModel from './notifications';
import UserChallengeModel from './useChallenge';
import ChallengeModel from './challenges';
import PollOptionModel from './pollOptions';

/**
 * Parses tags from a search string.
 *
 * @param {string} search - Search string containing tags in square brackets (e.g., "[tag1][tag2]")
 *
 * @returns {string[]} - An array of tags found in the search string
 */
const parseTags = (search: string): string[] =>
  (search.match(/\[([^\]]+)\]/g) || []).map(word => word.slice(1, -1));

/**
 * Parses keywords from a search string by removing tags and extracting individual words.
 *
 * @param {string} search - The search string containing keywords and possibly tags
 *
 * @returns {string[]} - An array of keywords found in the search string
 */
const parseKeyword = (search: string): string[] =>
  search.replace(/\[([^\]]+)\]/g, ' ').match(/\b\w+\b/g) || [];

/**
 * Checks if given question contains any tags from the given list.
 *
 * @param {Question} q - The question to check
 * @param {string[]} taglist - The list of tags to check for
 *
 * @returns {boolean} - `true` if any tag is present in the question, `false` otherwise
 */
const checkTagInQuestion = (q: Question, taglist: string[]): boolean => {
  for (const tagname of taglist) {
    for (const tag of q.tags) {
      if (tagname === tag.name) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Checks if any keywords in the provided list exist in a given question's title or text.
 *
 * @param {Question} q - The question to check
 * @param {string[]} keywordlist - The list of keywords to check for
 *
 * @returns {boolean} - `true` if any keyword is present, `false` otherwise.
 */
const checkKeywordInQuestion = (q: Question, keywordlist: string[]): boolean => {
  for (const w of keywordlist) {
    if (q.title.includes(w) || q.text.includes(w)) {
      return true;
    }
  }

  return false;
};

/**
 * Gets the newest questions from a list, sorted by the asking date in descending order.
 *
 * @param {Question[]} qlist - The list of questions to sort
 *
 * @returns {Question[]} - The sorted list of questions
 */
const sortQuestionsByNewest = (qlist: Question[]): Question[] =>
  qlist.sort((a, b) => {
    if (a.askDateTime > b.askDateTime) {
      return -1;
    }

    if (a.askDateTime < b.askDateTime) {
      return 1;
    }

    return 0;
  });

/**
 * Gets unanswered questions from a list, sorted by the asking date in descending order.
 *
 * @param {Question[]} qlist - The list of questions to filter and sort
 *
 * @returns {Question[]} - The filtered and sorted list of unanswered questions
 */
const sortQuestionsByUnanswered = (qlist: Question[]): Question[] =>
  sortQuestionsByNewest(qlist).filter(q => q.answers.length === 0);

/**
 * Records the most recent answer time for a question.
 *
 * @param {Question} question - The question to check
 * @param {Map<string, Date>} mp - A map of the most recent answer time for each question
 */
const getMostRecentAnswerTime = (question: Question, mp: Map<string, Date>): void => {
  // This is a private function and we can assume that the answers field is not undefined or an array of ObjectId
  const answers = question.answers as Answer[];
  answers.forEach((answer: Answer) => {
    if (question._id !== undefined) {
      const currentMostRecent = mp.get(question?._id.toString());
      if (!currentMostRecent || currentMostRecent < answer.ansDateTime) {
        mp.set(question._id.toString(), answer.ansDateTime);
      }
    }
  });
};

/**
 * Gets active questions from a list, sorted by the most recent answer date in descending order.
 *
 * @param {Question[]} qlist - The list of questions to filter and sort
 *
 * @returns {Question[]} - The filtered and sorted list of active questions
 */
const sortQuestionsByActive = (qlist: Question[]): Question[] => {
  const mp = new Map();
  qlist.forEach(q => {
    getMostRecentAnswerTime(q, mp);
  });

  return sortQuestionsByNewest(qlist).sort((a, b) => {
    const adate = mp.get(a._id?.toString());
    const bdate = mp.get(b._id?.toString());
    if (!adate) {
      return 1;
    }
    if (!bdate) {
      return -1;
    }
    if (adate > bdate) {
      return -1;
    }
    if (adate < bdate) {
      return 1;
    }
    return 0;
  });
};

/**
 * Sorts a list of questions by the number of views in descending order. First, the questions are
 * sorted by creation date (newest first), then by number of views, from highest to lowest.
 * If questions have the same number of views, the newer question will be before the older question.
 *
 * @param qlist The array of Question objects to be sorted.
 *
 * @returns A new array of Question objects sorted by the number of views.
 */
const sortQuestionsByMostViews = (qlist: Question[]): Question[] =>
  sortQuestionsByNewest(qlist).sort((a, b) => b.views.length - a.views.length);

/**
 * Adds a tag to the database if it does not already exist.
 *
 * @param {Tag} tag - The tag to add
 *
 * @returns {Promise<Tag | null>} - The added or existing tag, or `null` if an error occurred
 */
export const addTag = async (tag: Tag): Promise<Tag | null> => {
  try {
    // Check if a tag with the given name already exists
    const existingTag = await TagModel.findOne({ name: tag.name });

    if (existingTag) {
      return existingTag as Tag;
    }

    // If the tag does not exist, create a new one
    const newTag = new TagModel(tag);
    const savedTag = await newTag.save();

    return savedTag as Tag;
  } catch (error) {
    return null;
  }
};

/**
 * Retrieves questions from the database, ordered by the specified criteria.
 *
 * @param {OrderType} order - The order type to filter the questions
 *
 * @returns {Promise<Question[]>} - Promise that resolves to a list of ordered questions
 */
export const getQuestionsByOrder = async (order: OrderType): Promise<Question[]> => {
  try {
    let qlist = [];
    if (order === 'active') {
      qlist = await QuestionModel.find().populate([
        { path: 'tags', model: TagModel },
        { path: 'answers', model: AnswerModel },
      ]);
      return sortQuestionsByActive(qlist);
    }
    qlist = await QuestionModel.find().populate([{ path: 'tags', model: TagModel }]);
    if (order === 'unanswered') {
      return sortQuestionsByUnanswered(qlist);
    }
    if (order === 'newest') {
      return sortQuestionsByNewest(qlist);
    }
    return sortQuestionsByMostViews(qlist);
  } catch (error) {
    return [];
  }
};

/**
 * Filters a list of questions by the user who asked them.
 *
 * @param qlist The array of Question objects to be filtered.
 * @param askedBy The username of the user who asked the questions.
 *
 * @returns Filtered Question objects.
 */
export const filterQuestionsByAskedBy = (qlist: Question[], askedBy: string): Question[] =>
  qlist.filter(q => q.askedBy === askedBy);

/**
 * Filters questions based on a search string containing tags and/or keywords.
 *
 * @param {Question[]} qlist - The list of questions to filter
 * @param {string} search - The search string containing tags and/or keywords
 *
 * @returns {Question[]} - The filtered list of questions matching the search criteria
 */
export const filterQuestionsBySearch = (qlist: Question[], search: string): Question[] => {
  const searchTags = parseTags(search);
  const searchKeyword = parseKeyword(search);

  if (!qlist || qlist.length === 0) {
    return [];
  }
  return qlist.filter((q: Question) => {
    if (searchKeyword.length === 0 && searchTags.length === 0) {
      return true;
    }

    if (searchKeyword.length === 0) {
      return checkTagInQuestion(q, searchTags);
    }

    if (searchTags.length === 0) {
      return checkKeywordInQuestion(q, searchKeyword);
    }

    return checkKeywordInQuestion(q, searchKeyword) || checkTagInQuestion(q, searchTags);
  });
};

/**
 * Fetches and populates a question or answer document based on the provided ID and type.
 *
 * @param {string | undefined} id - The ID of the question or answer to fetch.
 * @param {'question' | 'answer'} type - Specifies whether to fetch a question or an answer.
 *
 * @returns {Promise<QuestionResponse | AnswerResponse>} - Promise that resolves to the
 *          populated question or answer, or an error message if the operation fails
 */
export const populateDocument = async (
  id: string | undefined,
  type: 'question' | 'answer',
): Promise<QuestionResponse | AnswerResponse> => {
  try {
    if (!id) {
      throw new Error(`Provided ${type} ID is undefined.`);
    }

    let result = null;

    if (type === 'question') {
      result = await QuestionModel.findOne({ _id: id }).populate([
        {
          path: 'tags',
          model: TagModel,
        },
        {
          path: 'answers',
          model: AnswerModel,
          populate: { path: 'comments', model: CommentModel },
        },
        { path: 'comments', model: CommentModel },
      ]);
    } else if (type === 'answer') {
      result = await AnswerModel.findOne({ _id: id }).populate([
        { path: 'comments', model: CommentModel },
      ]);
    }
    if (!result) {
      throw new Error(`Failed to fetch and populate a ${type}`);
    }
    return result;
  } catch (error) {
    return { error: `Error when fetching and populating a document: ${(error as Error).message}` };
  }
};

/**
 * Fetches and populates a community document based on the provided ID.
 *
 * @param {string | undefined} id - The ID of the community to fetch.
 *
 * @returns {Promise<CommunityResponse>} - Promise that resolves to the
 *          populated community, or an error message if the operation fails
 */
export const populateCommunity = async (id: string | undefined): Promise<CommunityResponse> => {
  try {
    if (!id) {
      throw new Error(`Provided community ID is undefined.`);
    }

    let result = null;
    result = await CommunityModel.findOne({ _id: id }).populate([
      { path: 'questions', model: QuestionModel, populate: { path: 'tags', model: TagModel } },
      { path: 'polls', model: PollModel },
      { path: 'articles', model: ArticleModel },
    ]);

    if (!result) {
      throw new Error(`Failed to fetch and populate the community`);
    }
    return result;
  } catch (error) {
    return { error: `Error when fetching and populating a community: ${(error as Error).message}` };
  }
};

/**
 * Fetches and populates a notification document based on the provided ID and source type.
 *
 * @param {string | undefined} id - The ID of the notification to fetch.
 * @param {'Question' | 'Poll' | 'Article' | undefined} sourceType - Specifies how to
 *        populate the notification's source, if defined.
 *
 * @returns {Promise<NotificationResponse>} - Promise that resolves to the
 *          populated notification, or an error message if the operation fails
 */
export const populateNotification = async (
  id: string | undefined,
  sourceType: 'Question' | 'Poll' | 'Article' | undefined,
): Promise<NotificationResponse> => {
  try {
    if (!id) {
      throw new Error(`Provided id is undefined.`);
    }
    let result = null;
    if (!sourceType) {
      // no source object for reward notifications, no need to populate.
      result = await NotificationModel.findOne({ _id: id });
    } else if (sourceType === 'Question') {
      result = await NotificationModel.findOne({ _id: id }).populate([
        {
          path: 'source',
          model: QuestionModel,
        },
      ]);
    } else if (sourceType === 'Poll') {
      result = await NotificationModel.findOne({ _id: id }).populate([
        {
          path: 'source',
          model: PollModel,
        },
      ]);
    } else if (sourceType === 'Article') {
      result = await NotificationModel.findOne({ _id: id }).populate([
        {
          path: 'source',
          model: ArticleModel,
        },
      ]);
    }

    if (!result) {
      throw new Error(`Failed to fetch and populate the notification`);
    }
    return result;
  } catch (error) {
    return {
      error: `Error when fetching and populating a notification: ${(error as Error).message}`,
    };
  }
};

/**
 * Fetches a question by its ID and increments its view count.
 *
 * @param {string} qid - The ID of the question to fetch.
 * @param {string} username - The username of the user requesting the question.
 *
 * @returns {Promise<QuestionResponse | null>} - Promise that resolves to the fetched question
 *          with incremented views, null if the question is not found, or an error message.
 */
export const fetchAndIncrementQuestionViewsById = async (
  qid: string,
  username: string,
): Promise<QuestionResponse | null> => {
  try {
    const q = await QuestionModel.findOneAndUpdate(
      { _id: new ObjectId(qid) },
      { $addToSet: { views: username } },
      { new: true },
    ).populate([
      {
        path: 'tags',
        model: TagModel,
      },
      {
        path: 'answers',
        model: AnswerModel,
        populate: { path: 'comments', model: CommentModel },
      },
      { path: 'comments', model: CommentModel },
    ]);
    return q;
  } catch (error) {
    return { error: 'Error when fetching and updating a question' };
  }
};

/**
 * Saves a new question to the database.
 *
 * @param {Question} question - The question to save
 *
 * @returns {Promise<QuestionResponse>} - The saved question, or error message
 */
export const saveQuestion = async (question: Question): Promise<QuestionResponse> => {
  try {
    const result = await QuestionModel.create(question);
    return result;
  } catch (error) {
    return { error: 'Error when saving a question' };
  }
};

/**
 * Saves a new answer to the database.
 *
 * @param {Answer} answer - The answer to save
 *
 * @returns {Promise<AnswerResponse>} - The saved answer, or an error message if the save failed
 */
export const saveAnswer = async (answer: Answer): Promise<AnswerResponse> => {
  try {
    const result = await AnswerModel.create(answer);
    return result;
  } catch (error) {
    return { error: 'Error when saving an answer' };
  }
};

/**
 * Saves a new comment to the database.
 *
 * @param {Comment} comment - The comment to save
 *
 * @returns {Promise<CommentResponse>} - The saved comment, or an error message if the save failed
 */
export const saveComment = async (comment: Comment): Promise<CommentResponse> => {
  try {
    const result = await CommentModel.create(comment);
    return result;
  } catch (error) {
    return { error: 'Error when saving a comment' };
  }
};

/**
 * Saves a new community to the database.
 *
 * @param {Community} community - The community to save
 * @returns {Promise<CommunityResponse>} - The saved community, or an error message if the save failed
 */
export const saveCommunity = async (community: Community): Promise<CommunityResponse> => {
  try {
    const result = await CommunityModel.create(community);
    return result;
  } catch (error) {
    return { error: 'Error when saving a community' };
  }
};

/**
 * Adds a user to a community.
 *
 * @param {string} userId - The user ID of the user to add.
 * @param {string} communityId - The ID of the community to add the user to.
 * @returns {Promise<CommunityResponse | null>} - The community added to, null if the community or user does not exist,
 *  or an error message if the save failed
 */
export const addUserToCommunity = async (
  userId: string,
  communityId: string,
): Promise<CommunityResponse | null> => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return null;
    }

    const result = await CommunityModel.findOneAndUpdate(
      { _id: new ObjectId(communityId) },
      { $addToSet: { members: user.username } },
      { new: true },
    );

    return result;
  } catch (error) {
    return { error: `Error when adding user to community: ${(error as Error).message}` };
  }
};

// type checking utility for type-safe access to error code
const isMongoError = (error: unknown): error is { code?: number } =>
  typeof error === 'object' && error !== null && 'code' in error;

/**
 * Saves a new user to the database.
 *
 * @param {User} user - The user to save
 *
 * @returns {Promise<UserResponse>} - The saved user, or an error message if the save failed
 */
export const saveUser = async (user: User): Promise<UserResponse> => {
  try {
    const result = await UserModel.create(user);
    return result;
  } catch (error) {
    if (isMongoError(error)) {
      if (error.code === 11000) {
        // return specific message if error code matched MongoDB duplicate key error
        return { error: 'Username must be unique' };
      }
    }
    return { error: 'Error when saving a user' };
  }
};

/**
 * Finds a user by their username.
 * @param username The username of the user to find.
 * @returns The user if found, otherwise null.
 */
export const findUser = async (username: string): Promise<User | null> => {
  try {
    const user = await UserModel.findOne({ username }).populate([
      { path: 'notifications', model: NotificationModel },
    ]);
    if (user) {
      const notifPromises = user.notifications.map(async notif => {
        const notifResponse = await populateNotification(notif._id?.toString(), notif.sourceType);
        if ('error' in notifResponse) {
          throw new Error('Error populating notifications');
        }
        return notifResponse;
      });

      user.notifications = await Promise.all(notifPromises);
    }
    return user;
  } catch (error) {
    return null;
  }
};

/**
 * Adds points to a user in the database.
 *
 * @param {string} username - The username of the user to add points to
 * @param {number} numPoints - The number of points to add
 *
 * @returns {Promise<UserResponse>} - The updated user, or an error message if the update failed
 */
export const addPointsToUser = async (
  username: string,
  numPoints: number,
): Promise<UserResponse> => {
  try {
    const result = await UserModel.findOneAndUpdate(
      { username },
      { $inc: { totalPoints: numPoints } },
      { new: true },
    );
    if (!result) {
      return { error: 'User not found' };
    }
    return result;
  } catch (error) {
    return { error: 'Error when adding points to a user' };
  }
};

/**
 * Updates a user's unlocked frames by adding the given list of frames to the
 * user's unlockedFrames.
 *
 * @param {string} username - The username of the user.
 * @param {number} frames - The unlocked frames to add.
 *
 * @returns {Promise<UserResponse>} - The updated user, or an error message if the update failed
 */
export const updateUsersUnlockedFrames = async (
  username: string,
  frames: string[],
): Promise<UserResponse> => {
  try {
    const result = await UserModel.findOneAndUpdate(
      { username },
      { $push: { unlockedFrames: { $each: frames } } },
      { new: true },
    );
    if (!result) {
      return { error: 'User not found' };
    }
    return result;
  } catch (error) {
    return { error: 'Error when adding unlocked frame to a user' };
  }
};

// Given answered Question ID, notify question.askedBy and question subscribers
const usersToNotifyOnNewAnswer = async (qid: string): Promise<string[]> => {
  const question = await QuestionModel.findOne({ _id: qid });
  if (!question) {
    throw new Error('Error retrieving users to notify');
  }
  return [question.askedBy, ...question.subscribers];
};

// Given Question ID, notify question.askedBy on new Comment or Upvote
const questionAskerToNotify = async (qid: string): Promise<string[]> => {
  const question = await QuestionModel.findOne({ _id: qid });
  if (!question) {
    throw new Error('Error retrieving users to notify');
  }
  return [question.askedBy];
};

// Given ID of commented-on Answer, notify answer.ansBy
const userToNotifyOnAnswerComment = async (answerID: string): Promise<string[]> => {
  const ans = await AnswerModel.findOne({ _id: answerID });
  if (!ans) {
    throw new Error('Error retrieving users to notify');
  }
  return [ans.ansBy];
};

/**
 * Given a CommunityObjectType, get the community the object is in.
 * @param oid - The ID of the community object
 * @param type - The type of the object
 * @returns The community the object is in.
 * @throws An error if no community has the given object.
 */
export const fetchCommunityByObjectId = async (
  oid: string,
  type: CommunityObjectType,
): Promise<Community> => {
  let community;
  if (type === 'Question') {
    community = await CommunityModel.findOne({ questions: oid });
  } else if (type === 'Poll') {
    community = await CommunityModel.findOne({ polls: oid });
  } else if (type === 'Article') {
    community = await CommunityModel.findOne({ articles: oid });
  }
  if (!community) {
    throw new Error('Error retrieving community by object id');
  }

  return community;
};

// Given ID of closed Poll, notify poll.createdBy and all users who voted in the poll.
const usersToNotifyPollClosed = async (pid: string): Promise<string[]> => {
  const poll = await PollModel.findOne({ _id: pid }).populate([
    {
      path: 'options',
      model: PollOptionModel,
    },
  ]);
  if (!poll) {
    throw new Error('Error retrieving users to notify');
  }
  const usersVoted = poll.options.map(op => op.usersVoted).flat();
  return [poll.createdBy, ...usersVoted];
};

// Given ID of User who unlocked new reward, notify user.username.
const userToNotifyForReward = async (uid: string): Promise<string[]> => {
  const user = await UserModel.findOne({ _id: uid });
  if (!user) {
    throw new Error('Error retrieving user to notify');
  }
  return [user.username];
};

/**
 * Determines a list of usernames to notify based on the given ObjectID and NotificationType.
 *
 * - Answer : Given Question ID, notify question.askedBy and question subscribers.
 * - Comment : Given Question ID, notify question.askedBy.
 * - AnswerComment : Given Answer ID, notify answer.ansBy
 * - Upvote : Given Question ID, notify question.askedBy.
 * - NewQuestion : Given Question ID, notify members of the community the question was posted in.
 * - NewPoll : Given Poll ID, notify members of the community the poll was posted in.
 * - PollClosed : Given Poll ID, notify poll.createdBy and users who voted in the poll.
 * - NewArticle : Given Article ID, notify members of the community the article was posted in.
 * - ArticleUpdate : Given Article ID, notify members of the community the article was posted in.
 * - NewReward : Given User ID, notify the user.
 *
 * @param {string} oid - The ObjectID used to retrieve the usernames to notify from the database.
 * @param {NotificationType} type - The notification type.
 *
 * @returns {Promise<string[] | { error: string }>} - The list of usernames, or an error message if the lookup failed
 */
export const usersToNotify = async (
  oid: string,
  type: NotificationType,
): Promise<string[] | { error: string }> => {
  try {
    switch (type) {
      case NotificationType.Answer:
        return await usersToNotifyOnNewAnswer(oid);

      case NotificationType.Comment:
        return await questionAskerToNotify(oid);

      case NotificationType.AnswerComment:
        return await userToNotifyOnAnswerComment(oid);

      case NotificationType.Upvote:
        return await questionAskerToNotify(oid);

      case NotificationType.NewQuestion:
        return (await fetchCommunityByObjectId(oid, 'Question')).members;

      case NotificationType.NewPoll:
        return (await fetchCommunityByObjectId(oid, 'Poll')).members;

      case NotificationType.PollClosed:
        return await usersToNotifyPollClosed(oid);

      case NotificationType.NewArticle:
        return (await fetchCommunityByObjectId(oid, 'Article')).members;

      case NotificationType.ArticleUpdate:
        return (await fetchCommunityByObjectId(oid, 'Article')).members;

      case NotificationType.NewReward:
        return await userToNotifyForReward(oid);

      default:
        return [];
    }
  } catch (error) {
    return { error: 'Error retrieving users to notify' };
  }
};

/**
 * Saves a notification to the database.
 *
 * @param {Notification} notification - The notification to save.
 *
 * @returns {Promise<NotificationResponse>} - The saved notification, or an error message if the save failed
 */
export const saveNotification = async (
  notification: Notification,
): Promise<NotificationResponse> => {
  try {
    const result = await NotificationModel.create(notification);
    return result;
  } catch (error) {
    return { error: 'Error when saving a notification' };
  }
};

/**
 * Adds a notification to a user.
 *
 * @param {string} username - The username of the user to add the notification to
 * @param {Notification} notif - The notification to add
 *
 * @returns {Promise<UserResponse>} - The updated user or an error message
 */
export const addNotificationToUser = async (
  username: string,
  notif: Notification,
): Promise<UserResponse> => {
  try {
    if (!notif || !notif.notificationType || notif.isRead === undefined || notif.isRead === null) {
      throw new Error('Invalid notification');
    }
    const user = await UserModel.findOne({ username });
    if (user === null) {
      throw new Error('User not found');
    }

    if (user.blockedNotifications.includes(notif.notificationType)) {
      return user;
    }

    const result = await UserModel.findOneAndUpdate(
      { username },
      { $push: { notifications: { $each: [notif._id], $position: 0 } } },
      { new: true },
    );
    if (result === null) {
      throw new Error('Error when adding notification to user');
    }
    return result;
  } catch (error) {
    return { error: 'Error when adding notification to user' };
  }
};

/**
 * Given an objectID and notification, adds a new notification object to every user who should be notified.
 *
 * @param {string} oid - The object ID used to determine users to notify
 * @param {Notification} notification - The notification to add to users
 *
 * @returns {Promise<string[] | { error: string }>} - The notified usernames or an error message
 */
export const notifyUsers = async (
  oid: string | undefined,
  notification: Notification,
): Promise<string[] | { error: string }> => {
  try {
    if (!oid) {
      throw new Error('Invalid object id');
    }
    // get list of usernames to add a notification to
    const usernames = await usersToNotify(oid, notification.notificationType);

    if ('error' in usernames || !usernames.length) {
      throw new Error('Error retrieving users to notify');
    }

    const notifsPromises = usernames.map(_ => saveNotification(notification));
    const notifsFromDb = (await Promise.all(notifsPromises)).map(notifResponse => {
      if ('error' in notifResponse) {
        throw new Error(notifResponse.error as string);
      }
      return notifResponse;
    });

    // add the notification to all users to be notified
    const promiseNotifiedUsers = usernames.map((username, i) =>
      addNotificationToUser(username, notifsFromDb[i]),
    );
    (await Promise.all(promiseNotifiedUsers)).map(userResponse => {
      if (userResponse && 'error' in userResponse) {
        throw new Error(userResponse.error as string);
      }
      return userResponse.username;
    });
    return usernames;
  } catch (error) {
    return { error: 'Error when adding notifications to users' };
  }
};

/**
 * Toggles whether a NotificationType is blocked for a user.
 *
 * @param {string} username - The username of the user to block/unblock the type
 * @param {Notification} type - The NotificationType to block/unblock
 *
 * @returns {Promise<UserResponse>} - The updated user or an error message
 */
export const updateBlockedTypes = async (
  username: string,
  type: NotificationType,
): Promise<UserResponse> => {
  try {
    const user = await UserModel.findOne({ username });

    if (!user) {
      return { error: 'User not found' };
    }

    const operation = user.blockedNotifications.includes(type)
      ? { $pull: { blockedNotifications: type } }
      : { $push: { blockedNotifications: type } };

    const result = await UserModel.findOneAndUpdate({ username }, operation, { new: true });

    if (!result) {
      return { error: 'Error when updating blocked notification types' };
    }
    return result;
  } catch (error) {
    return { error: 'Error updating blocked notification types' };
  }
};

/**
 * Update the notification to indicate that it has been read.
 * @param nid - The id of the notification to update
 * @returns {Promise<NotificationResponse>} - The updated notification that has been marked as read.
 */
export const updateNotifAsRead = async (nid: string | undefined): Promise<NotificationResponse> => {
  try {
    if (!nid) {
      throw new Error('Provided notification id is undefined');
    }
    const res = await NotificationModel.findOneAndUpdate(
      { _id: nid },
      { $set: { isRead: true } },
      { new: true },
    );
    if (!res) {
      throw new Error('Error when finding and updating the notification');
    }
    return res;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Updates all the notifications of a user to mark them as read.
 *
 * @param username - The username of the user whose notifications we want to update.
 * @returns {Promise<NotificationResponse[]> | {error: string}} - An array of updated notifications that are
 * marked as read, or the error message.
 */
export const updateUserNotifsAsRead = async (
  username: string,
): Promise<Notification[] | { error: string }> => {
  try {
    // find the user's notifications
    const user = await findUser(username);
    if (!user || user === null) {
      throw new Error('Error while finding the user');
    }

    // update the notifications to set isRead to true
    const updatedNotifsPromises = user.notifications.map(async notif => {
      const notifPromise = await updateNotifAsRead(notif._id?.toString());
      if ('error' in notifPromise) {
        throw new Error('Error while updating notification');
      }
      return notifPromise;
    });

    const promisedNotifs = await Promise.all(updatedNotifsPromises);

    return promisedNotifs;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Processes a list of tags by removing duplicates, checking for existing tags in the database,
 * and adding non-existing tags. Returns an array of the existing or newly added tags.
 * If an error occurs during the process, it is logged, and an empty array is returned.
 *
 * @param tags The array of Tag objects to be processed.
 *
 * @returns A Promise that resolves to an array of Tag objects.
 */
export const processTags = async (tags: Tag[]): Promise<Tag[]> => {
  try {
    // Extract unique tag names from the provided tags array using a Set to eliminate duplicates
    const uniqueTagNamesSet = new Set(tags.map(tag => tag.name));

    // Create an array of unique Tag objects by matching tag names
    const uniqueTags = [...uniqueTagNamesSet].map(
      name => tags.find(tag => tag.name === name)!, // The '!' ensures the Tag is found, assuming no undefined values
    );

    // Use Promise.all to asynchronously process each unique tag.
    const processedTags = await Promise.all(
      uniqueTags.map(async tag => {
        const existingTag = await TagModel.findOne({ name: tag.name });

        if (existingTag) {
          return existingTag; // If tag exists, return it as part of the processed tags
        }

        const addedTag = await addTag(tag);
        if (addedTag) {
          return addedTag; // If the tag does not exist, attempt to add it to the database
        }

        // Throwing an error if addTag fails
        throw new Error(`Error while adding tag: ${tag.name}`);
      }),
    );

    return processedTags;
  } catch (error: unknown) {
    // Log the error for debugging purposes
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.log('An error occurred while adding tags:', errorMessage);
    return [];
  }
};

/**
 * Adds a vote to a question.
 *
 * @param qid The ID of the question to add a vote to.
 * @param username The username of the user who voted.
 * @param type The type of vote to add, either 'upvote' or 'downvote'.
 *
 * @returns A Promise that resolves to an object containing either a success message or an error message,
 *          along with the updated upVotes and downVotes arrays.
 */
export const addVoteToQuestion = async (
  qid: string,
  username: string,
  type: 'upvote' | 'downvote',
): Promise<{ msg: string; upVotes: string[]; downVotes: string[] } | { error: string }> => {
  let updateOperation: QueryOptions;

  if (type === 'upvote') {
    updateOperation = [
      {
        $set: {
          upVotes: {
            $cond: [
              { $in: [username, '$upVotes'] },
              { $filter: { input: '$upVotes', as: 'u', cond: { $ne: ['$$u', username] } } },
              { $concatArrays: ['$upVotes', [username]] },
            ],
          },
          downVotes: {
            $cond: [
              { $in: [username, '$upVotes'] },
              '$downVotes',
              { $filter: { input: '$downVotes', as: 'd', cond: { $ne: ['$$d', username] } } },
            ],
          },
        },
      },
    ];
  } else {
    updateOperation = [
      {
        $set: {
          downVotes: {
            $cond: [
              { $in: [username, '$downVotes'] },
              { $filter: { input: '$downVotes', as: 'd', cond: { $ne: ['$$d', username] } } },
              { $concatArrays: ['$downVotes', [username]] },
            ],
          },
          upVotes: {
            $cond: [
              { $in: [username, '$downVotes'] },
              '$upVotes',
              { $filter: { input: '$upVotes', as: 'u', cond: { $ne: ['$$u', username] } } },
            ],
          },
        },
      },
    ];
  }

  try {
    const result = await QuestionModel.findOneAndUpdate({ _id: qid }, updateOperation, {
      new: true,
    });

    if (!result) {
      return { error: 'Question not found!' };
    }

    let msg = '';

    if (type === 'upvote') {
      msg = result.upVotes.includes(username)
        ? 'Question upvoted successfully'
        : 'Upvote cancelled successfully';
    } else {
      msg = result.downVotes.includes(username)
        ? 'Question downvoted successfully'
        : 'Downvote cancelled successfully';
    }

    return {
      msg,
      upVotes: result.upVotes || [],
      downVotes: result.downVotes || [],
    };
  } catch (err) {
    return {
      error:
        type === 'upvote'
          ? 'Error when adding upvote to question'
          : 'Error when adding downvote to question',
    };
  }
};

/**
 * Adds a username to a question's subscribers. If user is already subscribed, removes the user
 * from the question's subscribers.
 *
 * @param qid The ID of the question to add a vote to.
 * @param username The username of the user who subscribed.
 *
 * @returns Promise<QuestionResponse> - The updated question or an error message
 */
export const addSubscriberToQuestion = async (
  qid: string,
  username: string,
): Promise<QuestionResponse> => {
  try {
    const question = await QuestionModel.findOne({ _id: qid });

    if (!question) {
      return { error: 'Question not found' };
    }

    const operation = question.subscribers.includes(username)
      ? { $pull: { subscribers: username } }
      : { $push: { subscribers: username } };

    const result = await QuestionModel.findOneAndUpdate({ _id: qid }, operation, { new: true });

    if (!result) {
      return { error: 'Error when subscribing to question' };
    }
    return result;
  } catch (err) {
    return { error: 'Error when subscribing to question' };
  }
};

/**
 * Adds an answer to a question.
 *
 * @param {string} qid - The ID of the question to add an answer to
 * @param {Answer} ans - The answer to add
 *
 * @returns Promise<QuestionResponse> - The updated question or an error message
 */
export const addAnswerToQuestion = async (qid: string, ans: Answer): Promise<QuestionResponse> => {
  try {
    if (!ans || !ans.text || !ans.ansBy || !ans.ansDateTime) {
      throw new Error('Invalid answer');
    }
    const result = await QuestionModel.findOneAndUpdate(
      { _id: qid },
      { $push: { answers: { $each: [ans._id], $position: 0 } } },
      { new: true },
    );
    if (result === null) {
      throw new Error('Error when adding answer to question');
    }
    return result;
  } catch (error) {
    return { error: 'Error when adding answer to question' };
  }
};

/**
 * Adds a comment to a question or answer.
 *
 * @param id The ID of the question or answer to add a comment to
 * @param type The type of the comment, either 'question' or 'answer'
 * @param comment The comment to add
 *
 * @returns A Promise that resolves to the updated question or answer, or an error message if the operation fails
 */
export const addComment = async (
  id: string,
  type: 'question' | 'answer',
  comment: Comment,
): Promise<QuestionResponse | AnswerResponse> => {
  try {
    if (!comment || !comment.text || !comment.commentBy || !comment.commentDateTime) {
      throw new Error('Invalid comment');
    }
    let result: QuestionResponse | AnswerResponse | null;
    if (type === 'question') {
      result = await QuestionModel.findOneAndUpdate(
        { _id: id },
        { $push: { comments: { $each: [comment._id] } } },
        { new: true },
      );
    } else {
      result = await AnswerModel.findOneAndUpdate(
        { _id: id },
        { $push: { comments: { $each: [comment._id] } } },
        { new: true },
      );
    }
    if (result === null) {
      throw new Error('Failed to add comment');
    }
    return result;
  } catch (error) {
    return { error: `Error when adding comment: ${(error as Error).message}` };
  }
};

/**
 * Gets a map of tags and their corresponding question counts.
 *
 * @returns {Promise<Map<string, number> | null | { error: string }>} - A map of tags to their
 *          counts, `null` if there are no tags in the database, or the error message.
 */
export const getTagCountMap = async (): Promise<Map<string, number> | null | { error: string }> => {
  try {
    const tlist = await TagModel.find();
    const qlist = await QuestionModel.find().populate({
      path: 'tags',
      model: TagModel,
    });

    if (!tlist || tlist.length === 0) {
      return null;
    }

    const tmap = new Map(tlist.map(t => [t.name, 0]));

    if (qlist != null && qlist !== undefined && qlist.length > 0) {
      qlist.forEach(q => {
        q.tags.forEach(t => {
          tmap.set(t.name, (tmap.get(t.name) || 0) + 1);
        });
      });
    }

    return tmap;
  } catch (error) {
    return { error: 'Error when construction tag map' };
  }
};

/**
 * Fetches an article by its ID.
 *a
 * @param {string} articleID - The ID of the article to fetch.
 *
 * @returns {Promise<ArticleResponse>} - Promise that resolves to the fetched article, or an error message.
 */
export const fetchArticleById = async (articleID: string): Promise<ArticleResponse> => {
  try {
    const article = await ArticleModel.findOne({ _id: articleID });
    if (!article) {
      throw new Error('Unable to find article');
    }
    return article;
  } catch (error) {
    return { error: 'Error when fetching an article by ID' };
  }
};

/**
 * Updates the article with the given ID.
 *
 * @param articleID - The ID of the article to update
 * @param article - The article body to replace it with.
 * @returns - The newly updated article.
 */
export const updateArticleById = async (
  articleID: string,
  article: Article,
): Promise<ArticleResponse> => {
  try {
    const updatedArticle = await ArticleModel.findOneAndUpdate(
      { _id: articleID },
      {
        $set: { title: article.title, body: article.body, latestEditDate: article.latestEditDate },
      },
      { new: true },
    );

    if (!updatedArticle) {
      throw new Error('Article not found');
    }

    return updatedArticle;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Gets all the communities from the database, fully populated with members, questions, polls, and articles.
 *
 * @returns {Promise<Community[] | { error: string }>} - The list of populated communities, or an error message if the operation fails
 */
export const fetchAllCommunities = async (): Promise<Community[] | { error: string }> => {
  try {
    const communities = await CommunityModel.find();
    const populatedCommunities = await Promise.all(
      communities.map(community => populateCommunity(community._id.toString())),
    );

    // Filter for errors and return only valid communities
    const validCommunities = populatedCommunities.filter(
      (community): community is Community => !('error' in community),
    );

    return validCommunities;
  } catch (error) {
    return { error: 'Error when fetching communities' };
  }
};

/**
 * Fetches a poll by id
 * @param pollId - The ID of the poll to fetch
 * @returns {Promise<PollResponse>} - The poll, or an error if the poll was not found
 */
export const fetchPollById = async (pollId: string): Promise<PollResponse> => {
  try {
    const poll = await PollModel.findOne({ _id: new ObjectId(pollId) }).populate([
      { path: 'options', model: PollOptionModel },
    ]);

    if (!poll) {
      throw new Error('Poll not found');
    }

    return poll;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Adds a user's vote to a poll option.
 *
 * @param {string} pollId - The ID of the poll containing the option.
 * @param {string} optionId - The ID of the poll option being voted on.
 * @param {string} username - The username of the user voting.
 *
 * @returns {Promise<PollResponse>} - The updated poll or an error message.
 */
export const addVoteToPollOption = async (
  pollId: string,
  optionId: string,
  username: string,
): Promise<PollResponse> => {
  if (!pollId || !optionId || !username) {
    return { error: 'Invalid input data' };
  }
  try {
    const poll = await PollModel.findById(pollId).populate({
      path: 'options',
      model: PollOptionModel,
    });

    if (!poll) {
      return { error: 'Poll not found' };
    }

    if (poll.isClosed || new Date(poll.pollDueDate) <= new Date()) {
      return { error: 'Unable to vote in closed poll' };
    }

    const hasVoted = poll.options.some(option => option.usersVoted.includes(username));

    if (hasVoted) {
      return { error: 'User has already voted in this poll' };
    }

    const updatedOption = await PollOptionModel.findOneAndUpdate(
      { _id: optionId },
      { $addToSet: { usersVoted: username } },
      { new: true },
    );

    if (!updatedOption) {
      return { error: 'Poll option not found' };
    }

    const updatedPoll = await PollModel.findById(pollId).populate({
      path: 'options',
      model: PollOptionModel,
    });

    if (!updatedPoll) {
      return { error: 'Error retrieving updated poll' };
    }

    return updatedPoll;
  } catch (error) {
    return { error: 'Error when adding vote to poll option' };
  }
};

/**
 * Checks for any expired polls and updated their status to closed if found.
 *
 * @returns {Promise<Poll[] | { error: string }>} - The polls closed, or an error message
 */
export const closeExpiredPolls = async (): Promise<Poll[] | { error: string }> => {
  try {
    const pollsToClose = await PollModel.find({
      pollDueDate: { $lte: new Date() },
      isClosed: false,
    });

    const promiseClosedPolls = pollsToClose.map(poll =>
      PollModel.findOneAndUpdate(
        { _id: poll._id },
        { $set: { isClosed: true } },
        { new: true },
      ).populate([
        {
          path: 'options',
          model: PollOptionModel,
        },
      ]),
    );
    const closedPolls = (await Promise.all(promiseClosedPolls)).map(poll => {
      if (!poll) {
        throw new Error('Poll not found');
      }
      return poll;
    });

    return closedPolls;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Adds a question ID to the specified community's question list.
 *
 * @param communityId - The ID of the community.
 * @param questionId - The ID of the question to add.
 * @returns The updated question document or an error object.
 */
export const AddQuestionToCommunityModel = async (
  communityId: string,
  questionId: string,
): Promise<QuestionResponse> => {
  try {
    const updatedCommunity = await CommunityModel.findByIdAndUpdate(
      communityId,
      { $addToSet: { questions: questionId } },
      { new: true },
    );

    if (!updatedCommunity) {
      throw new Error('Community not found');
    }

    const updatedQuestion = await QuestionModel.findByIdAndUpdate(
      questionId,
      { community: communityId },
      { new: true },
    );

    if (!updatedQuestion) {
      throw new Error('Question not found');
    }

    return updatedQuestion;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Saves an article then adds it to the community with the community ID.
 * @param communityId - The ID of the community to add the article to.
 * @param article - The article to save.
 * @returns - The populated community, or an error message if the operation failed.
 */
export const saveAndAddArticleToCommunity = async (
  communityId: string,
  article: Article,
): Promise<ArticleResponse> => {
  try {
    const savedArticle = await ArticleModel.create(article);

    const updatedCommunity = await CommunityModel.findOneAndUpdate(
      { _id: communityId },
      { $push: { articles: savedArticle._id } },
      { new: true },
    );

    if (!updatedCommunity) {
      throw new Error('Community not found');
    }

    return savedArticle;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Saves a poll and its options, then adds it to the community with the community ID.
 * @param communityId - The ID of the community to add the poll to.
 * @param poll - The poll to save, including options data.
 * @returns - The created poll document or an error message if the operation failed.
 */
export const saveAndAddPollToCommunity = async (
  communityId: string,
  poll: Poll,
): Promise<PollResponse> => {
  try {
    const optionIds = await Promise.all(
      poll.options.map(async option => {
        const pollOption = await PollOptionModel.create(option);
        return pollOption._id;
      }),
    );

    const savedPoll = await PollModel.create({
      title: poll.title,
      options: optionIds,
      createdBy: poll.createdBy,
      pollDateTime: poll.pollDateTime,
      pollDueDate: poll.pollDueDate,
      isClosed: poll.isClosed,
    });

    const updatedCommunity = await CommunityModel.findOneAndUpdate(
      { _id: communityId },
      { $push: { polls: savedPoll._id } },
      { new: true },
    );

    if (!updatedCommunity) {
      throw new Error('Community not found');
    }

    return savedPoll;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Saves a new UserChallenge to the database.
 *
 * @param {UserChallenge} userChallenge - The UserChallenge to save.
 * @returns {Promise<UserChallengeResponse>} - The saved UserChallenge or an error if the save failed.
 */
export const saveUserChallenge = async (
  userChallenge: UserChallenge,
): Promise<UserChallengeResponse> => {
  try {
    const result = await UserChallengeModel.create(userChallenge);
    return result;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Fetches the populated UserChallenges for the user with the given username.
 *
 * @param username - The username of the user to fetch UserChallenges of.
 * @returns - A list of UserChallenges for the user or an error if the operation failed.
 */
export const fetchUserChallengesByUsername = async (
  username: string,
): Promise<UserChallenge[] | { error: string }> => {
  try {
    const userChallenges = await UserChallengeModel.find({ username }).populate({
      path: 'challenge',
      model: ChallengeModel,
    });

    return userChallenges;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Function to check if challenges are complete and distribute the necessary rewards to the user
 *
 * @param userChallenges - The list of user challenges to check for completion
 */
const distributeRewardsIfChallengeComplete = async (
  userChallenges: UserChallenge[],
): Promise<void> => {
  if (userChallenges.length === 0) {
    return;
  }

  const promises = userChallenges.map(async uc => {
    if (uc.progress.length === uc.challenge.actionAmount) {
      await UserModel.findOneAndUpdate(
        { username: uc.username },
        {
          $addToSet: { unlockedTitles: uc.challenge.reward },
        },
      );
    }
  });

  await Promise.all(promises);
};

/**
 * Function to change a user's equipped reward.
 *
 * @param {string} username - The user who's equipped reward is to be updated.
 * @param {string} reward - The reward to equip.
 * @param {string} type - The type of the reward, either a frame or a title.
 *
 * @returns {Promise<EquipRewardResponse>} - Details of the equipped reward or an error message.
 */
export const equipReward = async (
  username: string,
  reward: string,
  type: 'frame' | 'title',
): Promise<EquipRewardResponse> => {
  const operation =
    type === 'frame' ? { $set: { equippedFrame: reward } } : { $set: { equippedTitle: reward } };

  try {
    const user = await UserModel.findOneAndUpdate({ username }, operation, { new: true });
    if (!user) {
      return { error: 'User not found' };
    }
    return {
      username: user.username,
      reward: type === 'frame' ? user.equippedFrame : user.equippedTitle,
      type,
    };
  } catch (error) {
    return { error: 'Error equipping reward' };
  }
};

/**
 * Adds progress to all Challenges matching the given type for the given user.
 * Adds the reward of the challenge to the user if the challenge is completed.
 *
 * @param {string} username - The username of the user to add progress to.
 * @param {ChallengeType} challengeType - The type of challenge to add progress to.
 * @returns {Promise<UserChallenge[] | { error: string}>} - The list of UserChallenges that were updated
 *  or an error if the operation failed.
 */
export const fetchAndIncrementChallengesByUserAndType = async (
  username: string,
  challengeType: ChallengeType,
): Promise<UserChallenge[] | { error: string }> => {
  try {
    // don't need to populate, just verifying user exists
    const user = await UserModel.findOne({ username });

    if (!user) {
      throw new Error('User not found');
    }

    const userChallenges = await fetchUserChallengesByUsername(username);

    if ('error' in userChallenges) {
      throw new Error(userChallenges.error);
    }

    // Filter out UserChallenge records whose challenge fields don't match the challengeType
    // and UserChallenge records that are already complete
    let filteredUserChallenges: UserChallenge[] = userChallenges.filter(
      uc =>
        uc.challenge?.challengeType === challengeType &&
        uc.progress.length < uc.challenge?.actionAmount,
    );

    // For timed challenges, remove progress entries that have expired
    const currentTime = new Date();
    filteredUserChallenges = filteredUserChallenges.map(uc => {
      if (uc.challenge.hoursToComplete) {
        const expireDeadline = new Date(
          currentTime.getTime() - uc.challenge.hoursToComplete * 1000 * 60 * 60,
        );
        const updatedUserChallenge: UserChallenge = {
          _id: uc._id,
          username: uc.username,
          challenge: uc.challenge,
          progress: uc.progress.filter(p => p >= expireDeadline),
        };
        return updatedUserChallenge;
      }
      return uc;
    });

    // Initialize UserChallenge records for any Challenges that match the challengeType that don't
    // have UserChallenge records yet
    const challenges = (await ChallengeModel.find({ challengeType })) as Challenge[];
    const challengesToStart = challenges.filter(
      c => !userChallenges.some(uc => uc.challenge._id?.toString() === c._id?.toString()),
    );
    const newUserChallengePromises: Promise<UserChallenge>[] = challengesToStart.map(async c => {
      const newUserChallenge: UserChallenge = {
        username,
        challenge: c,
        progress: [],
      };
      const newUserChallengeResponse = await saveUserChallenge(newUserChallenge);
      if ('error' in newUserChallengeResponse) {
        throw new Error(newUserChallengeResponse.error);
      }
      return newUserChallengeResponse as UserChallenge;
    });
    const newUserChallenges: UserChallenge[] = await Promise.all(newUserChallengePromises);

    // UserChallenges to update = existing UserChallenges + new UserChallenges
    const userChallengesToUpdate = [...filteredUserChallenges, ...newUserChallenges].map(uc => {
      const updatedUserChallenge: UserChallenge = {
        _id: uc._id,
        username: uc.username,
        challenge: uc.challenge,
        progress: [...uc.progress, currentTime], // add progress entry to progress array
      };
      return updatedUserChallenge;
    });

    // check for completion and distribute rewards
    await distributeRewardsIfChallengeComplete(userChallengesToUpdate);

    // Add progress to UserChallenges
    const updatePromises: Promise<UserChallenge>[] = userChallengesToUpdate.map(async uc => {
      const userChallengeRecord = await UserChallengeModel.findOneAndUpdate(
        { _id: uc._id },
        { progress: uc.progress },
        { new: true },
      ).populate({
        path: 'challenge',
        model: ChallengeModel,
      });

      if (!userChallengeRecord) {
        throw new Error('Error while updating UserChallenges');
      }
      return userChallengeRecord as UserChallenge;
    });

    const updatedUserChallenges: UserChallenge[] = await Promise.all(updatePromises);

    return updatedUserChallenges;
  } catch (error) {
    return { error: (error as Error).message };
  }
};

/**
 * Adds progress to upvote-related challenges for the user who asked the question with the question ID
 *
 * @param qid - The ID of the question to get the askedBy user from.
 * @returns - A username of the user whose progress was updated, or an error if the operation failed
 */
export const incrementProgressForAskedByUser = async (
  qid: string,
): Promise<UserChallenge[] | { error: string }> => {
  try {
    const question = await QuestionModel.findOne({ _id: qid });

    if (!question) {
      throw new Error('Question not found');
    }

    // increment upvote-related challenges for user
    const updatedUserChallenges = await fetchAndIncrementChallengesByUserAndType(
      question.askedBy,
      'upvote',
    );

    if ('error' in updatedUserChallenges) {
      throw new Error(updatedUserChallenges.error);
    }

    return updatedUserChallenges;
  } catch (error) {
    return { error: (error as Error).message };
  }
};
