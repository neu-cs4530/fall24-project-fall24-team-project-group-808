import { Schema } from 'mongoose';

/**
 * Mongoose schema for the Poll collection.
 *
 * This schema defines the structure for storing polls in the database.
 * Each poll includes the following fields:
 * - `title`: The title of the poll.
 * - `options`: An array of references to `PollOption` documents associated with the poll.
 * - `createdBy`: The User that created the poll.
 * - `pollDateTime`: The date and time when the poll was posted.
 * - `pollDueDate` : The date and time when the poll stops accepting votes.
 */
const pollSchema: Schema = new Schema(
  {
    title: {
      type: String,
    },
    options: {
      type: [{ type: Schema.Types.ObjectId, ref: 'PollOption' }],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    pollDateTime: {
      type: Date,
    },
    pollDueDate: {
      type: Date,
    },
  },
  { collection: 'Poll' },
);

export default pollSchema;