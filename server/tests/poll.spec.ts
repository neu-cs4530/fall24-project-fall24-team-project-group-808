import mongoose from 'mongoose';
import supertest from 'supertest';
import * as util from '../models/application';
import { app } from '../app';
import { Poll } from '../types';

const fetchPollByIdSpy = jest.spyOn(util, 'fetchPollById');

const saveAndAddPollToCommunitySpy = jest.spyOn(util, 'saveAndAddPollToCommunity');

const mockPoll: Poll = {
  _id: new mongoose.Types.ObjectId('65e9b5a995b6c7045a30d824'),
  title: 'Poll Title',
  options: [
    { text: 'Option 1', usersVoted: [] },
    { text: 'Option 2', usersVoted: [] },
  ],
  createdBy: 'user123',
  pollDateTime: new Date(),
  pollDueDate: new Date(),
};

describe('Poll API', () => {
  afterEach(async () => {
    await mongoose.connection.close(); // Ensure the connection is properly closed
  });

  afterAll(async () => {
    await mongoose.disconnect(); // Ensure mongoose is disconnected after all tests
  });
  describe('GET /pollById/:pollId', () => {
    it('should return the poll if it exists', async () => {
      const mockPollID = new mongoose.Types.ObjectId();
      const mockPoll2: Poll = {
        _id: mockPollID,
        title: 'Poll',
        options: [
          {
            text: 'Option',
            usersVoted: ['me', 'you'],
          },
        ],
        createdBy: 'us',
        pollDateTime: new Date(),
        pollDueDate: new Date(),
      };

      fetchPollByIdSpy.mockResolvedValueOnce(mockPoll2);

      const response = await supertest(app).get(`/poll/getPollById/${mockPollID}`);

      expect(response.status).toBe(200);
      expect(response.body._id.toString()).toBe(mockPollID.toString());
    });
    it('should return a 500 status if the operation fails', async () => {
      const mockPollID = new mongoose.Types.ObjectId();

      fetchPollByIdSpy.mockResolvedValueOnce({ error: 'error' });

      const response = await supertest(app).get(`/poll/getPollById/${mockPollID}`);

      expect(response.status).toBe(500);
      expect(response.text).toBe('error');
    });
  });

  describe('POST /addPoll/:communityId', () => {
    it('should return the saved poll if the operation is successful', async () => {
      const mockCommunityId = new mongoose.Types.ObjectId().toString();
      const mockPollBody = { poll: mockPoll };

      saveAndAddPollToCommunitySpy.mockResolvedValueOnce(mockPoll);

      const response = await supertest(app)
        .post(`/community/addPoll/${mockCommunityId}`)
        .send(mockPollBody);

      expect(response.status).toBe(200);
      expect(response.body._id).toEqual(mockPoll._id?.toString());
      expect(response.body.title).toEqual(mockPoll.title);
      expect(response.body.options.length).toEqual(mockPoll.options.length);
      expect(response.body.options[0].text).toEqual(mockPoll.options[0].text);
      expect(response.body.options[1].text).toEqual(mockPoll.options[1].text);
    });

    it('should return a 400 status if the poll data is invalid', async () => {
      const mockCommunityId = new mongoose.Types.ObjectId().toString();
      const mockPollBody = {
        poll: {
          title: 'Poll Title',
        },
      };

      const response = await supertest(app)
        .post(`/community/addPoll/${mockCommunityId}`)
        .send(mockPollBody);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid request body');
    });

    it('should return a 500 status if saveAndAddPollToCommunity returns an error', async () => {
      const mockCommunityId = new mongoose.Types.ObjectId().toString();
      const mockPollBody = {
        poll: {
          title: 'Poll Title',
          options: [
            { text: 'Option 1', usersVoted: [] },
            { text: 'Option 2', usersVoted: [] },
          ],
          createdBy: 'user123',
          pollDateTime: new Date(),
          pollDueDate: new Date(),
        },
      };

      saveAndAddPollToCommunitySpy.mockResolvedValueOnce({
        error: 'Error saving poll to community',
      });

      const response = await supertest(app)
        .post(`/community/addPoll/${mockCommunityId}`)
        .send(mockPollBody);

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error saving poll to community');
    });
  });
});